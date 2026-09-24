// iCOOL Trading — وكيل بيانات الشموع (Vercel Serverless, بلا اعتماديات)
// GET /api/candles?s=XAUUSD&i=15m&n=400
// المفتاح يُقرأ من متغيّر البيئة TWELVEDATA_API_KEY فقط ولا يصل إلى المتصفح أبداً.
// الترتيب: Binance (للعملات الرقمية، بلا مفتاح) ← Twelve Data (إن وُجد المفتاح) ← Yahoo (احتياطي بلا مفتاح).

'use strict';

// جدول الرموز = قائمة السماح. لا يُبنى أي رابط من مدخلات المستخدم مباشرة.
const SYMBOLS = Object.freeze({
  XAUUSD: { td: 'XAU/USD', y: 'GC=F', name: 'الذهب' },
  XAGUSD: { td: 'XAG/USD', y: 'SI=F', name: 'الفضة' },
  EURUSD: { td: 'EUR/USD', y: 'EURUSD=X', name: 'يورو/دولار' },
  GBPUSD: { td: 'GBP/USD', y: 'GBPUSD=X', name: 'باوند/دولار' },
  USDJPY: { td: 'USD/JPY', y: 'JPY=X', name: 'دولار/ين' },
  NAS100: { td: 'NDX', y: 'NQ=F', name: 'ناسداك 100' },
  US30:   { td: 'DJI', y: 'YM=F', name: 'داو جونز' },
  SPX500: { td: 'SPX', y: 'ES=F', name: 'S&P 500' },
  NIKKEI: { td: 'N225', y: '^N225', name: 'نيكاي 225' },
  USOIL:  { td: 'WTI/USD', y: 'CL=F', name: 'نفط WTI' },
  BTCUSD: { td: 'BTC/USD', y: 'BTC-USD', bn: 'BTCUSDT', name: 'بيتكوين' },
  ETHUSD: { td: 'ETH/USD', y: 'ETH-USD', bn: 'ETHUSDT', name: 'إيثريوم' },
});

const INTERVALS = Object.freeze({
  '1m':  { td: '1min',  y: ['1m', '5d'],   bn: '1m',  cache: 'public, max-age=0, s-maxage=30, stale-while-revalidate=30' },
  '5m':  { td: '5min',  y: ['5m', '1mo'],  bn: '5m',  cache: 'public, max-age=0, s-maxage=60, stale-while-revalidate=120' },
  '15m': { td: '15min', y: ['15m', '1mo'], bn: '15m', cache: 'public, max-age=0, s-maxage=60, stale-while-revalidate=120' },
  '1h':  { td: '1h',    y: ['60m', '3mo'], bn: '1h',  cache: 'public, max-age=0, s-maxage=300, stale-while-revalidate=600' },
  '4h':  { td: '4h',    y: ['60m', '6mo'], bn: '4h',  agg: 4, cache: 'public, max-age=0, s-maxage=900, stale-while-revalidate=3600' },
  '1d':  { td: '1day',  y: ['1d', '2y'],   bn: '1d',  cache: 'public, max-age=0, s-maxage=900, stale-while-revalidate=3600' },
});

const TIMEOUT_MS = 8000;

async function getJSON(url, headers) {
  const ac = new AbortController();
  const tm = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { headers: headers || {}, signal: ac.signal });
    if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
    return await r.json();
  } finally { clearTimeout(tm); }
}

const num = (x) => (x == null || x === '' ? NaN : +x);
const clean = (arr) => arr.filter(k => [k.o, k.h, k.l, k.c].every(Number.isFinite)).sort((a, b) => a.t - b.t);

async function fromBinance(sym, iv, n) {
  const hosts = ['https://data-api.binance.vision', 'https://api.binance.com'];
  let last;
  for (const h of hosts) {
    try {
      const j = await getJSON(`${h}/api/v3/klines?symbol=${encodeURIComponent(sym.bn)}&interval=${iv.bn}&limit=${n}`);
      return clean(j.map(k => ({ t: Math.floor(k[0] / 1000), o: num(k[1]), h: num(k[2]), l: num(k[3]), c: num(k[4]), v: num(k[5]) })));
    } catch (e) { last = e; }
  }
  throw last;
}

async function fromTwelve(sym, iv, n, key) {
  const u = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(sym.td)}&interval=${iv.td}` +
            `&outputsize=${n}&timezone=UTC&order=ASC&apikey=${encodeURIComponent(key)}`;
  const j = await getJSON(u);
  if (j.status !== 'ok' || !Array.isArray(j.values)) { const e = new Error('TD ' + (j.code || 'error')); e.status = j.code; throw e; }
  return clean(j.values.map(v => ({
    t: Math.floor(Date.parse(v.datetime.replace(' ', 'T') + (v.datetime.length > 10 ? 'Z' : 'T00:00:00Z')) / 1000),
    o: num(v.open), h: num(v.high), l: num(v.low), c: num(v.close), v: num(v.volume) || 0,
  })));
}

function aggregate(c, k, sec) {
  const out = []; const span = k * sec;
  for (const x of c) {
    const b = Math.floor(x.t / span) * span; const L = out[out.length - 1];
    if (L && L.t === b) { L.h = Math.max(L.h, x.h); L.l = Math.min(L.l, x.l); L.c = x.c; L.v += x.v; }
    else out.push({ t: b, o: x.o, h: x.h, l: x.l, c: x.c, v: x.v });
  }
  return out;
}

async function fromYahoo(sym, iv, n) {
  const [yi, yr] = iv.y;
  const u = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym.y)}?interval=${yi}&range=${yr}&includePrePost=true`;
  const j = await getJSON(u, { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', Accept: 'application/json' });
  const r = j && j.chart && j.chart.result && j.chart.result[0];
  if (!r || !r.timestamp) throw new Error('Yahoo empty');
  const q = r.indicators.quote[0];
  let c = clean(r.timestamp.map((t, i) => ({ t, o: num(q.open[i]), h: num(q.high[i]), l: num(q.low[i]), c: num(q.close[i]), v: num(q.volume[i]) || 0 })));
  if (iv.agg) c = aggregate(c, iv.agg, 3600);
  return c.slice(-n);
}

function send(res, status, body, cache) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache || 'no-store');
  res.end(JSON.stringify(body));
}

async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { ok: false, error: { code: 'METHOD', message: 'GET only' } });
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  const sKey = String(q.s || '').toUpperCase();
  const iKey = String(q.i || '');
  const sym = Object.prototype.hasOwnProperty.call(SYMBOLS, sKey) ? SYMBOLS[sKey] : null;
  const iv = Object.prototype.hasOwnProperty.call(INTERVALS, iKey) ? INTERVALS[iKey] : null;
  if (!sym) return send(res, 400, { ok: false, error: { code: 'BAD_SYMBOL', message: 'رمز غير مدعوم' } });
  if (!iv) return send(res, 400, { ok: false, error: { code: 'BAD_INTERVAL', message: 'فاصل غير مدعوم' } });
  const n = Math.max(50, Math.min(1000, parseInt(q.n, 10) || 500));
  const key = process.env.TWELVEDATA_API_KEY;

  const chain = [];
  if (sym.bn) chain.push(['binance', () => fromBinance(sym, iv, n)]);
  if (key) chain.push(['twelvedata', () => fromTwelve(sym, iv, n, key)]);
  chain.push(['yahoo', () => fromYahoo(sym, iv, n)]);

  const tried = [];
  for (const [name, fn] of chain) {
    try {
      const candles = await fn();
      if (candles.length >= 30) {
        return send(res, 200, { ok: true, symbol: sKey, interval: iKey, source: name, keyed: !!key, candles }, iv.cache);
      }
      tried.push(name + ':short');
    } catch (e) {
      tried.push(name + ':' + (e.name === 'AbortError' ? 'timeout' : (e.status || 'err'))); // لا يُعاد نص الخطأ الخارجي أبداً
    }
  }
  return send(res, 502, { ok: false, keyed: !!key, error: { code: 'UPSTREAM_FAIL', message: 'تعذّر جلب البيانات', tried } },
    'public, max-age=0, s-maxage=15');
}

module.exports = handler;
module.exports.SYMBOLS = SYMBOLS;
module.exports.INTERVALS = INTERVALS;
module.exports.aggregate = aggregate;
