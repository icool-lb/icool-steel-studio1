// اختبار منصّة التداول: وكيل /api/candles (fetch مُحاكى) + المحرّك والواجهة في Chromium
// node test/trading.js
const path = require('path'), fs = require('fs'), http = require('http');
const DIR = path.resolve(__dirname, '..');
let fail = 0;
const ok = (c, n, x) => { console.log((c ? '  PASS ' : '  FAIL ') + n + (x !== undefined ? '   → ' + x : '')); if (!c) fail++; };

function mkRes() { const r = { h: {}, statusCode: 0, body: '' }; r.setHeader = (k, v) => r.h[k.toLowerCase()] = v; r.end = b => r.body = b; return r; }

(async () => {
  console.log('\n[1] وكيل البيانات');
  const handler = require(DIR + '/api/candles.js');
  const calls = [];
  const yahoo = () => { const ts = [], o = [], h = [], l = [], c = [], v = []; let p = 2650;
    for (let i = 0; i < 300; i++) { ts.push(1758000000 + i * 900); o.push(p); p += Math.sin(i) * 2; c.push(p); h.push(Math.max(o[i], p) + 1); l.push(Math.min(o[i], p) - 1); v.push(100); }
    return { chart: { result: [{ timestamp: ts, indicators: { quote: [{ open: o, high: h, low: l, close: c, volume: v }] } }] } }; };
  global.fetch = async (u) => { calls.push(u); if (/twelvedata/.test(u)) return { ok: false, status: 429, json: async () => ({}) };
    if (/yahoo/.test(u)) return { ok: true, json: async () => yahoo() }; return { ok: false, status: 451 }; };

  let r = mkRes(); await handler({ method: 'GET', query: { s: 'XAUUSD', i: '15m' } }, r); let j = JSON.parse(r.body);
  ok(r.statusCode === 200 && j.source === 'yahoo' && j.candles.length === 300, 'بلا مفتاح ⇐ Yahoo', j.source);
  ok(!calls.some(u => /twelvedata/.test(u)), 'لا طلب Twelve Data بلا مفتاح');
  ok(/s-maxage=60/.test(r.h['cache-control']), 'رأس تخزين CDN', r.h['cache-control']);

  process.env.TWELVEDATA_API_KEY = 'SECRET123'; calls.length = 0;
  r = mkRes(); await handler({ method: 'GET', query: { s: 'XAUUSD', i: '15m' } }, r); j = JSON.parse(r.body);
  ok(calls[0].includes('twelvedata') && j.source === 'yahoo', 'مع المفتاح: Twelve Data أولاً ثم احتياط Yahoo عند 429');
  ok(!r.body.includes('SECRET123'), 'المفتاح لا يظهر في الاستجابة');

  r = mkRes(); await handler({ method: 'GET', query: { s: '../etc', i: '15m' } }, r);
  ok(r.statusCode === 400 && /BAD_SYMBOL/.test(r.body), 'رمز خارج قائمة السماح ⇐ 400');
  r = mkRes(); await handler({ method: 'GET', query: { s: 'XAUUSD', i: '7m' } }, r);
  ok(r.statusCode === 400, 'فاصل غير مدعوم ⇐ 400');
  r = mkRes(); await handler({ method: 'POST', query: {} }, r); ok(r.statusCode === 405, 'POST ⇐ 405');
  const ag = handler.aggregate([{ t: 0, o: 1, h: 2, l: 0, c: 1.5, v: 1 }, { t: 3600, o: 1.5, h: 3, l: 1, c: 2, v: 1 }, { t: 14400, o: 2, h: 2, l: 2, c: 2, v: 1 }], 4, 3600);
  ok(ag.length === 2 && ag[0].h === 3 && ag[0].c === 2, 'تجميع 60m ⇐ 4h');
  delete process.env.TWELVEDATA_API_KEY;

  // MetaApi: أولاً، رأس auth-token، ترتيب تصاعدي، والرمز مع لاحقة الوسيط
  process.env.METAAPI_TOKEN = 'MTSECRET'; process.env.METAAPI_ACCOUNT_ID = 'acc-1'; process.env.METAAPI_SUFFIX = '.m';
  process.env.METAAPI_SYMBOLS = '{"NAS100":"USTEC"}'; calls.length = 0; let hdr = null;
  const prevFetch = global.fetch;
  global.fetch = async (u, o) => { calls.push(u); if (/agiliumtrade/.test(u)) { hdr = o.headers['auth-token'];
      const a = []; for (let i = 0; i < 100; i++) a.push({ time: new Date((1758000000 + (99 - i) * 900) * 1000).toISOString(), open: 1, high: 2, low: 0.5, close: 1.5, tickVolume: 7 });
      return { ok: true, json: async () => a }; } return prevFetch(u, o); };
  r = mkRes(); await handler({ method: 'GET', query: { s: 'XAUUSD', i: '15m' } }, r); j = JSON.parse(r.body);
  ok(j.source === 'metaapi' && hdr === 'MTSECRET' && /new-york\.agiliumtrade\.ai/.test(calls[0]), 'MetaApi أولاً برأس auth-token', j.source);
  ok(/symbols\/XAUUSD\.m\/timeframes\/15m/.test(calls[0]), 'الرمز مع لاحقة الوسيط', calls[0].split('symbols/')[1]);
  ok(j.candles[0].t < j.candles[1].t && j.candles.length === 100, 'الشموع مرتّبة تصاعدياً');
  ok(!r.body.includes('MTSECRET') && !r.body.includes('acc-1'), 'التوكن ورقم الحساب لا يظهران');
  ok(handler.mtSymbol('NAS100') === 'USTEC.m', 'خريطة الرموز من البيئة', handler.mtSymbol('NAS100'));
  process.env.METAAPI_SYMBOLS = '{"NAS100":"../x?y"}'; ok(handler.mtSymbol('NAS100') === 'NAS100.m', 'رمز خبيث في الخريطة يُرفض');
  global.fetch = prevFetch; calls.length = 0;
  r = mkRes(); await handler({ method: 'GET', query: { s: 'XAUUSD', i: '15m' } }, r); j = JSON.parse(r.body);
  ok(j.source === 'yahoo' && calls[0].includes('agiliumtrade'), 'فشل MetaApi ⇐ احتياط', j.source);
  ['METAAPI_TOKEN', 'METAAPI_ACCOUNT_ID', 'METAAPI_SUFFIX', 'METAAPI_SYMBOLS'].forEach(k => delete process.env[k]);

  console.log('\n[2] الصفحة والمحرّك');
  const srv = http.createServer((q, s) => {
    if (q.url.startsWith('/api/')) { s.writeHead(502, { 'content-type': 'application/json' }); return s.end('{"ok":false,"error":{"code":"UPSTREAM_FAIL"}}'); }
    const f = path.join(DIR, q.url.split('?')[0].replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, b) => { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); s.end(b); });
  }).listen(0);
  const port = srv.address().port;
  const { chromium } = require('playwright');
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  await pg.route('**/data-api.binance.vision/**', r => r.abort());
  await pg.goto(`http://127.0.0.1:${port}/trading/`);
  await pg.waitForFunction(() => document.getElementById('status').textContent.includes('شمعة'), null, { timeout: 15000 });
  ok(errs.length === 0, 'لا أخطاء JS', errs.join(' | ') || 'نظيف');
  ok((await pg.textContent('#status')).includes('تجريبية'), 'فشل الوكيل ⇐ بيانات تجريبية معلنة');

  const t = await pg.evaluate(() => {
    const T = window.TE, o = {};
    // الجلسات تتبع التوقيت الصيفي: 09:30 نيويورك = 13:30 UTC صيفاً و14:30 شتاءً
    const s = Date.UTC(2026, 6, 15, 13, 30) / 1000, w = Date.UTC(2026, 0, 15, 14, 30) / 1000;
    o.nySummer = T.tzp(s, 'America/New_York').min === 570; o.nyWinter = T.tzp(w, 'America/New_York').min === 570;
    o.tokyo = T.tzp(Date.UTC(2026, 0, 15, 0, 0) / 1000, 'Asia/Tokyo').H === 9;
    // الكسر والاكتساح بالإغلاق
    o.brk = T.closeEvent({ o: 99, h: 102, l: 98.8, c: 101.5 }, { c: 99.5 }, 100, 1, 0.1);
    o.swp = T.closeEvent({ o: 99.5, h: 101.5, l: 99.4, c: 99.6 }, { c: 99.5 }, 100, 1, 0.1);
    o.wick = T.closeEvent({ o: 99.5, h: 100.3, l: 99.4, c: 99.9 }, { c: 99.5 }, 100, 1, 0.1); // فتيل فقط بلا جسم ⇐ لا شيء
    o.brkDn = T.closeEvent({ o: 101, h: 101.2, l: 98.5, c: 98.7 }, { c: 100.5 }, 100, -1, 0.1);
    // الدرجة: عامل واحد لا يكفي
    o.single = T.scoreSig({ close: 1 }).score; o.full = T.scoreSig({ close: 1, sr: 1, sess: 1, bias: 1, htf: 1, rr: 1 }).score;
    // الانحياز على بيانات مصنوعة: كل إغلاق فوق الافتتاح
    const c = []; let t0 = Date.UTC(2026, 8, 21, 4, 0) / 1000; // الاثنين 00:00 نيويورك
    for (let i = 0; i < 300; i++) { const p = 2600 + i * 0.4 + Math.sin(i / 6) * 10; c.push({ t: t0 + i * 900, o: p - .3, h: p + 2, l: p - 2, c: p, v: 100 }); }
    const R = T.analyze(c, '15m', 'ny0', 'XAUUSD');
    o.bias = R.bias; o.sess = [...new Set(R.ss.map(x => x.k))].sort().join(',');
    const a = R.ss.filter(x => x.k === 'asia' && x.done)[1]; /* نسخة كاملة لا المقطوعة في بداية البيانات */
    o.asiaStartUTC = new Date(c[a.i0].t * 1000).getUTCHours();
    o.asiaHi = Math.max(...c.slice(a.i0, a.i1 + 1).map(k => k.h)) === a.h;
    o.zones = R.Z.length; o.grades = R.Z.every(z => ['s', 'm', 'w'].includes(z.g) && z.S >= 0 && z.S <= 100);
    o.sigOK = R.sig.filter(s => s.ok).every(s => s.rr >= 1.5 && s.score >= 65);
    o.sigDir = R.sig.every(s => (s.dir > 0 ? s.sl < s.en && s.tp > s.en : s.sl > s.en && s.tp < s.en));
    o.lastClosed = R.li === c.length - 2;
    o.pine = /@version=5/.test(T.pineCode()) && /barstate.isconfirmed/.test(T.pineCode());
    return o;
  });
  ok(t.nySummer && t.nyWinter, 'افتتاح 09:30 نيويورك صيفاً وشتاءً');
  ok(t.tokyo, 'طوكيو UTC+9 بلا توقيت صيفي');
  ok(t.brk === 'break' && t.brkDn === 'break', 'كسر بالإغلاق صعوداً وهبوطاً');
  ok(t.swp === 'sweep', 'فتيل فوق المستوى وإغلاق تحته ⇐ اكتساح');
  ok(t.wick === null, 'فتيل صغير لا يُعدّ كسراً');
  ok(t.single <= 25 && t.full === 100, 'عامل واحد ≤ 25 نقطة', t.single + ' / ' + t.full);
  ok(t.bias === 1, 'اتجاه صاعد فوق الافتتاح ⇐ انحياز +1');
  ok(t.sess === 'asia,london,ny', 'الجلسات الثلاث مكتشفة', t.sess);
  ok(t.asiaStartUTC === 0 && t.asiaHi, 'آسيا تبدأ 00:00 UTC وقمتها صحيحة');
  ok(t.zones > 0 && t.grades, 'مناطق مصنّفة ق/م/ض بدرجة 0–100', t.zones);
  ok(t.sigDir, 'الوقف والهدف في الجهتين الصحيحتين لكل إشارة');
  ok(t.sigOK, 'الإشارات الصالحة: R:R ≥ 1.5 ودرجة ≥ 65');
  ok(t.lastClosed, 'التحليل على آخر شمعة مغلقة لا الجارية');
  ok(t.pine, 'كود Pine v5 يُولَّد');

  // اختيار إشارة يملأ حاسبة الحجم
  const hasSig = await pg.$('.sig');
  if (hasSig) { await hasSig.click(); const out = await pg.textContent('#riskOut'); ok(/لوت/.test(out), 'اختيار إشارة يملأ حاسبة الحجم'); }
  for (const tf of ['5m', '1h', '4h', '1d']) { await pg.selectOption('#tf', tf); await pg.waitForTimeout(300); }
  await pg.selectOption('#sym', 'USDJPY'); await pg.selectOption('#anchor', 'tky'); await pg.waitForTimeout(300);
  ok(errs.length === 0, 'تبديل الأطر والأدوات والمراجع بلا أخطاء', errs.join(' | ') || 'نظيف');

  fs.mkdirSync(__dirname + '/shots', { recursive: true });
  await pg.selectOption('#sym', 'XAUUSD'); await pg.selectOption('#tf', '15m'); await pg.selectOption('#anchor', 'ny0'); await pg.waitForTimeout(400);
  await pg.screenshot({ path: __dirname + '/shots/trading-desktop.png' });
  await pg.setViewportSize({ width: 390, height: 844 }); await pg.waitForTimeout(300);
  await pg.screenshot({ path: __dirname + '/shots/trading-mobile.png' });
  await b.close(); srv.close();
  console.log(fail ? `\n✗ ${fail} فشل` : '\n✓ كل الاختبارات نجحت'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
