const {chromium}=require('playwright');
const fs=require('fs'),path=require('path');
const DIR=path.resolve(__dirname,'..');
const S=__dirname;
const mock=fs.readFileSync(S+'/three-mock.js','utf8');
const kml=fs.readFileSync(S+'/sample-roof.kml','utf8');
let fail=0;
const ok=(c,n,extra)=>{console.log((c?'  PASS ':'  FAIL ')+n+(extra!==undefined?'   → '+extra:''));if(!c)fail++;};
const near=(a,b,t)=>Math.abs(a-b)<=t;

(async()=>{
const b=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined});
const pg=await b.newPage();
const errs=[];
pg.on('pageerror',e=>errs.push(String(e)));
pg.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text());});
await pg.route('**/three.min.js',r=>r.fulfill({status:200,contentType:'application/javascript',body:mock}));
await pg.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await pg.goto('file://'+DIR+'/index.html');
await pg.waitForTimeout(600);

console.log('\n[1] تحميل الصفحة');
ok(errs.length===0,'لا أخطاء JS عند الإقلاع',errs.slice(0,3).join(' | ')||'نظيف');
ok(await pg.evaluate(()=>typeof solar==='function'&&typeof parseKML==='function'),'الدوال الجديدة معرّفة');

console.log('\n[2] حسابات الشمس — بيروت 33.8938N 35.5018E UTC+2');
const sun=await pg.evaluate(()=>{
  const r={};
  [[12,21,'dec'],[3,21,'mar'],[6,21,'jun']].forEach(([mo,dy,k])=>{
    const t=sunTimes(33.8938,35.5018,2,mo,dy);
    const n=solar(33.8938,35.5018,2,mo,dy,t.noon);
    r[k]={rise:t.rise,set:t.set,noon:t.noon,alt:n.alt,az:n.az};});
  r.morn=solar(33.8938,35.5018,2,6,21,7);
  r.eve=solar(33.8938,35.5018,2,6,21,17);
  return r;});
ok(near(sun.dec.alt,32.67,0.6),'ارتفاع الشمس ظهر 21/12 ≈ 32.67°',sun.dec.alt.toFixed(2)+'°');
ok(near(sun.jun.alt,79.55,0.6),'ارتفاع الشمس ظهر 21/6 ≈ 79.55°',sun.jun.alt.toFixed(2)+'°');
ok(near(sun.mar.alt,56.11,1.0),'ارتفاع الشمس ظهر 21/3 ≈ 56.11°',sun.mar.alt.toFixed(2)+'°');
ok(near(sun.dec.az,180,2),'السمت عند الظهيرة ≈ 180° (جنوب)',sun.dec.az.toFixed(1)+'°');
ok(near(sun.dec.set-sun.dec.rise,9.8,0.3),'طول نهار 21/12 ≈ 9.8 س',(sun.dec.set-sun.dec.rise).toFixed(2));
ok(near(sun.jun.set-sun.jun.rise,14.4,0.3),'طول نهار 21/6 ≈ 14.4 س',(sun.jun.set-sun.jun.rise).toFixed(2));
ok(sun.morn.az>45&&sun.morn.az<95,'الشمس شرقاً صباحاً (سمت 45–95)',sun.morn.az.toFixed(1)+'°');
ok(sun.eve.az>265&&sun.eve.az<315,'الشمس غرباً مساءً (سمت 265–315)',sun.eve.az.toFixed(1)+'°');

console.log('\n[3] استيراد KML');
const kres=await pg.evaluate(k=>{
  const raw=parseKML(k);
  const c=raw[0].ring.reduce((a,p)=>[a[0]+p[0],a[1]+p[1]],[0,0]);
  const lon0=c[0]/raw[0].ring.length,lat0=c[1]/raw[0].ring.length;
  KMLP=raw.map(o=>({name:o.name,ring:o.ring,area:polyArea(llToLocal(o.ring,lat0,lon0)),lat0,lon0,role:'skip',h:2.6}));
  let bi=0;KMLP.forEach((o,i)=>{if(o.area>KMLP[bi].area)bi=i;});
  KMLP.forEach((o,i)=>{o.role=(i===bi)?'roof':'stair';if(o.role==='stair')o.h=2.6;});
  kmlApply();
  return {n:raw.length,names:raw.map(r=>r.name),areas:KMLP.map(o=>+o.area.toFixed(1)),
    site:+SITE.area.toFixed(1),bb:SITE.bb.map(v=>+v.toFixed(2)),obs:OBS.length,
    obsw:OBSW.length,obsH:OBSW[0]&&OBSW[0].h,lat:M.lat,lon:M.lon,shape:M.bShape,north:northDeg()};},kml);
ok(kres.n===2,'قُرئ مضلّعان من الملف',kres.n);
ok(kres.names[0]==='السطح'&&kres.names[1]==='بيت الدرج','الأسماء العربية سليمة',kres.names.join(' , '));
ok(near(kres.bb[0],30,0.6)&&near(kres.bb[1],30,0.6),'أبعاد السطح ≈ 30×30 م',kres.bb.join(' × '));
ok(near(kres.site,900,40),'مساحة السطح ≈ 900 م²',kres.site);
ok(kres.obs===1&&kres.obsw===1,'بيت الدرج سُجّل كعائق',kres.obs);
ok(kres.obsH===2.6,'ارتفاع بيت الدرج 2.60 م',kres.obsH);
ok(kres.shape==='kml'&&kres.north===0,'الشكل kml والشمال 0° من الملف',kres.shape+' / '+kres.north);

console.log('\n[4] اتجاه بيت الدرج داخل المشهد (رُسم في الشمال-الغرب)');
const pos=await pg.evaluate(()=>{
  const c=OBSW[0].poly.reduce((a,q)=>[a[0]+q[0],a[1]+q[1]],[0,0]);
  return {cx:c[0]/OBSW[0].poly.length,cz:c[1]/OBSW[0].poly.length,bb:SITE.bb};});
ok(pos.cz<pos.bb[1]*0.35,'مركزه في النصف الشمالي (z صغير = شمال)',pos.cz.toFixed(2)+' من '+pos.bb[1].toFixed(2));
ok(pos.cx<pos.bb[0]*0.35,'مركزه في النصف الغربي (x صغير = غرب)',pos.cx.toFixed(2));

console.log('\n[5] هندسة الظل  (+Z = جنوب · الظل يقع شمالاً نحو −Z)');
const sh=await pg.evaluate(()=>{
  M.bPar=0;M.h1=0.8;M.h2=0.8;M.L=10;M.S=8;M.north=0;
  OBS=[{poly:[[10,2],[13,2],[13,5],[10,5]],h:5,kind:'stair',name:'د'}];
  M.bOX=2;M.bOZ=2;makeSite();
  const A=32.67,d=5/Math.tan(A*Math.PI/180);
  const r={d,
    south:  shadedAt(11.5, 8,0,A,180),        // جنوب العائق → مشمس
    north:  shadedAt(11.5, 1,0,A,180),        // شمال العائق ضمن الظل → مظلل
    beyond: shadedAt(11.5, 2-d-1,0,A,180),    // أبعد من طول الظل → مشمس
    edge:   shadedAt(11.5, 2-d+0.3,0,A,180),  // داخل الظل بقليل → مظلل
    side:   shadedAt(20,   1,0,A,180),        // جانباً خارج عرض العائق → مشمس
    above:  shadedAt(11.5, 1,6,A,180)};       // أعلى من العائق → مشمس
  // دوران الشمال 90°: الظل يجب أن ينقلب إلى محور X
  M.north=90;
  // الشمال نحو +X ⇒ الجنوب نحو −X ⇒ الظل يمتد نحو +X
  r.rotShaded=shadedAt(15,3.5,0,A,180);       // خلف العائق على محور X → مظلل
  r.rotSunny =shadedAt(6,3.5,0,A,180);        // جهة الشمس → مشمس
  r.rotOld   =shadedAt(11.5,1,0,A,180);       // ما كان مظللاً قبل الدوران → لم يعد
  M.north=0;
  // العمامة
  M.bPar=1.2;OBS=[];makeSite();
  const dp=1.2/Math.tan(A*Math.PI/180);
  r.parNear=shadedAt(SITE.bb[0]/2,SITE.bb[1]-dp*0.4,0,A,180);  // قرب الحافة الجنوبية
  r.parMid =shadedAt(SITE.bb[0]/2,SITE.bb[1]/2,0,A,180);       // وسط السطح
  return r;});
ok(sh.south===false,'نقطة جنوب العائق = مشمسة',sh.south);
ok(sh.north===true,'نقطة شمال العائق داخل الظل = مظللة',sh.north);
ok(sh.beyond===false,'أبعد من طول الظل ('+sh.d.toFixed(2)+' م) = مشمسة',sh.beyond);
ok(sh.edge===true,'داخل حافة الظل بـ 30 سم = مظللة',sh.edge);
ok(sh.side===false,'خارج عرض العائق جانبياً = مشمسة',sh.side);
ok(sh.above===false,'على ارتفاع 6 م فوق عائق 5 م = مشمسة',sh.above);
ok(sh.rotShaded===true&&sh.rotSunny===false&&sh.rotOld===false,
   'تدوير الشمال 90° ينقل الظل إلى محور X',
   'خلف='+sh.rotShaded+' · جهة_الشمس='+sh.rotSunny+' · الموضع_القديم='+sh.rotOld);
ok(sh.parNear===true,'نقطة خلف العمامة الجنوبية = مظللة',sh.parNear);
ok(sh.parMid===false,'وسط السطح بعيداً عن العمامة = مشمسة',sh.parMid);
const hl2=await pg.evaluate(()=>{const h=shadowHull([[10,2],[13,2],[13,5],[10,5]],5,45,180);
  return {n:h.length,minZ:Math.min(...h.map(p=>p[1])),maxZ:Math.max(...h.map(p=>p[1]))};});
ok(Math.abs(hl2.minZ-(-3))<0.01&&Math.abs(hl2.maxZ-5)<0.01,
   'غلاف الظل عند 45° يمتد 5 م شمالاً',hl2.minZ.toFixed(2)+' … '+hl2.maxZ.toFixed(2));

console.log('\n[5ب] إضافة بيت درج يدوياً وتحريره');
const man=await pg.evaluate(()=>{
  M.bShape='rect';M.bA=20;M.bB=16;M.bRot=0;M.bPar=.8;OBS=[];makeSite();
  addStair();
  const a={n:OBS.length,rect:!!OBS[0].rect,h:OBS[0].h,poly:OBS[0].poly.length};
  OBS[0].rect.a=5;OBS[0].rect.b=4;OBS[0].h=3.5;obsSync(OBS[0]);makeSite();
  const w=OBSW[0].poly;
  const dx=Math.max(...w.map(p=>p[0]))-Math.min(...w.map(p=>p[0]));
  const dz=Math.max(...w.map(p=>p[1]))-Math.min(...w.map(p=>p[1]));
  return {...a,dx,dz,h2:OBSW[0].h};});
ok(man.n===1&&man.rect&&man.poly===4,'أُضيف بيت درج مستطيل بأربع زوايا',man.poly+' زاوية');
ok(Math.abs(man.dx-5)<.01&&Math.abs(man.dz-4)<.01,'تعديل a و b ينعكس على المضلّع',man.dx.toFixed(2)+' × '+man.dz.toFixed(2));
ok(man.h2===3.5,'تعديل الارتفاع ينتقل إلى OBSW',man.h2);

console.log('\n[5ج] مصفوفات متعددة باتجاهات مختلفة');
const mul=await pg.evaluate(()=>{
  M.bShape='rect';M.bA=40;M.bB=30;M.bRot=0;M.north=0;M.bPar=0;OBS=[];
  ARR=[];AI=0;M.L=10;M.S=6;M.bOX=2;M.bOZ=2;M.az=180;M.tpl='S1';applyTpl('S1');
  M.L=10;M.S=6;M.bOX=2;M.bOZ=2;M.az=180;
  build();
  const one={n:ARR.length,tot:R.tot,np:NP,legs:LEGS.length,kwp:R.kwp};
  // مصفوفة ثانية مطابقة لكن باتجاه الشرق
  syncToArr();
  const b=JSON.parse(JSON.stringify(ARR[0]));
  b.name='شرقية';b.az=90;b.x=20;b.z=4;
  ARR.push(b);AI=0;build();
  const two={n:ARR.length,tot:R.tot,np:NP,legs:LEGS.length,kwp:R.kwp,
    ares:ARES.length,azs:ARES.map(r=>r.arr.az)};
  // امتداد أرجل المصفوفة الشرقية بإحداثيات السطح
  const L2=LEGS.filter(p=>p[3]===1);
  const xs=L2.map(p=>p[0]),zs=L2.map(p=>p[1]);
  return {one,two,ex:{minx:Math.min(...xs),maxx:Math.max(...xs),
                      minz:Math.min(...zs),maxz:Math.max(...zs),n:L2.length}};});
ok(mul.one.n===1,'مصفوفة واحدة عند البداية',mul.one.n);
ok(mul.two.n===2&&mul.two.ares===2,'أصبحتا مصفوفتين ولكل منهما تحقق مستقل',mul.two.ares);
ok(Math.abs(mul.two.tot-2*mul.one.tot)<1,'وزن الحديد تضاعف بدقّة',
   mul.one.tot.toFixed(0)+' → '+mul.two.tot.toFixed(0)+' كغ');
ok(mul.two.np===2*mul.one.np&&Math.abs(mul.two.kwp-2*mul.one.kwp)<1e-6,
   'عدد الألواح والقدرة تضاعفا',mul.one.np+' → '+mul.two.np+' لوح');
ok(mul.two.legs===2*mul.one.legs,'الأرجل تضاعفت',mul.one.legs+' → '+mul.two.legs);
ok(mul.two.azs.join(',')==='180,90','السمتان محفوظان لكل مصفوفة',mul.two.azs.join(' · '));
ok(Math.abs(mul.ex.maxx-mul.ex.minx-6)<.01&&Math.abs(mul.ex.maxz-mul.ex.minz-10)<.01,
   'المصفوفة الشرقية انقلب امتدادها (البحر على X والطول على Z)',
   'X='+(mul.ex.maxx-mul.ex.minx).toFixed(2)+' Z='+(mul.ex.maxz-mul.ex.minz).toFixed(2));
ok(Math.abs(mul.ex.minx-20)<.01&&Math.abs(mul.ex.maxz-4)<.01,
   'ركن المصفوفة الشرقية عند (20، 4) كما حُدّد',
   'minX='+mul.ex.minx.toFixed(2)+' maxZ='+mul.ex.maxz.toFixed(2));

console.log('\n[5د] عائق مبنى مجاور مرتفع');
const nb=await pg.evaluate(()=>{
  ARR=[ARR[0]];AI=0;applyArr(ARR[0]);M.az=180;M.bOX=2;M.bOZ=2;M.L=10;M.S=6;M.bPar=0;
  // مبنى مجاور جنوب السطح بارتفاع 12 م فوق سطحنا
  OBS=[{poly:[[0,14],[30,14],[30,24],[0,24]],h:12,base:-9,kind:'bldg',name:'جار جنوبي'}];
  build();
  const A=32.69;                       // ظهيرة 21/12 في بيروت
  const d=12/Math.tan(A*Math.PI/180);  // ≈ 18.6 م
  return {d,
    near:shadedAt(5,14-d*0.5,1.5,A,180),   // ضمن الظل
    far: shadedAt(5,14-d-3,1.5,A,180),     // خارجه
    frac:shadeFracA(ARR[0],12,21,12).frac,
    base:OBSW[0].base,h:OBSW[0].h};});
ok(nb.near===true,'نقطة ضمن ظل الجار الجنوبي = مظللة (طول الظل '+nb.d.toFixed(1)+' م)',nb.near);
ok(nb.far===false,'نقطة أبعد من ظلّه = مشمسة',nb.far);
ok(nb.base===-9&&nb.h===12,'منسوب القاعدة والقمّة محفوظان في OBSW','base='+nb.base+' h='+nb.h);
ok(nb.frac>0.9,'الهيكل بكامله داخل ظل الجار ظهر 21/12',(nb.frac*100).toFixed(0)+'%');

console.log('\n[5ه] الجمالون عند اللزوم فقط');
const sysT=await pg.evaluate(()=>{
  M.bShape='rect';M.bA=40;M.bB=40;M.bPar=0;OBS=[];ARR=[];AI=0;
  M.tpl='S1';applyTpl('S1');M.bOX=2;M.bOZ=2;M.az=180;M.sys='auto';
  const run=(S,sys)=>{M.S=S;M.h1=2.2;M.h2=2.2+S*0.2;M.sys=sys;build();
    return {used:ARR[0].sysUsed,util:R.util,defR:R.defR,tot:R.tot,sec:ARR[0].secUsed,
            beam:R.beam,W:R.Wsec,I:R.Ieff,kinds:Object.keys(KIND)};};
  const shortA=run(4,'auto'), longA=run(16,'auto');
  const forcedB=run(16,'beam'), forcedT=run(4,'truss');
  return {shortA,longA,forcedB,forcedT,
    i1:secI('100x50x3'),i2:secI('150x50x4'),i3:secI('IPE200')};});
ok(Math.abs(sysT.i1-106)<4,'عطالة RHS 100×50×3 ≈ 106 سم⁴',sysT.i1.toFixed(0));
ok(Math.abs(sysT.i2-384)<8,'عطالة RHS 150×50×4 ≈ 384 سم⁴',sysT.i2.toFixed(0));
ok(sysT.i3===1943,'عطالة IPE200 من الجدول',sysT.i3);
ok(sysT.shortA.used==='beam','بحر 4 م ⇐ جائز مفرد تلقائياً',
   sysT.shortA.sec+' · استغلال '+(sysT.shortA.util*100).toFixed(0)+'% · هبوط L/'+sysT.shortA.defR.toFixed(0));
ok(sysT.shortA.util<=0.95&&sysT.shortA.defR>=200,'المقطع المختار يحقّق الاستغلال والهبوط',
   (sysT.shortA.util*100).toFixed(0)+'% · L/'+sysT.shortA.defR.toFixed(0));
ok(sysT.longA.used==='truss','بحر 16 م ⇐ جمالون تلقائياً',
   sysT.longA.used+' · استغلال '+(sysT.longA.util*100).toFixed(0)+'%');
ok(!sysT.shortA.kinds.includes('أقطار')&&!sysT.shortA.kinds.includes('تضليع'),
   'الجائز المفرد لا ينتج أقطاراً ولا تضليعاً',sysT.shortA.kinds.join(' · '));
ok(sysT.longA.kinds.includes('جوائز سفلية'),'الجمالون ينتج جائزاً سفلياً',
   sysT.longA.kinds.join(' · '));
ok(sysT.forcedB.used==='beam'&&sysT.forcedB.beam,'الإجبار على جائز مفرد يُحترم رغم البحر 16 م',
   'استغلال '+(sysT.forcedB.util*100).toFixed(0)+'%');
ok(sysT.forcedB.util>1,'ويُبلَّغ عن تجاوز الاستغلال بدل إخفائه',
   (sysT.forcedB.util*100).toFixed(0)+'%');
ok(sysT.forcedT.used==='truss'&&!sysT.forcedT.beam,'الإجبار على جمالون يُحترم رغم البحر القصير');
ok(sysT.forcedT.tot>sysT.shortA.tot,'الجمالون أثقل من الجائز المفرد لنفس الهندسة',
   Math.round(sysT.shortA.tot)+' ⇐ '+Math.round(sysT.forcedT.tot)+' كغ');
ok(sysT.shortA.W>0&&sysT.longA.W===0,'معامل المقاومة يُحسب للجائز فقط',
   'W='+sysT.shortA.W.toFixed(0)+' سم³');

console.log('\n[6] التقرير والمخططات');
const out=await pg.evaluate(()=>{
  // حالة معروفة: مصفوفتان + بيت درج + عمامة
  M.bShape='rect';M.bA=40;M.bB=30;M.bPar=.9;M.north=0;M.bRot=0;
  ARR=[ARR[0]];AI=0;applyArr(ARR[0]);M.L=10;M.S=6;M.bOX=2;M.bOZ=2;M.az=180;
  OBS=[];build();addStair();
  syncToArr();const b2=JSON.parse(JSON.stringify(ARR[0]));
  b2.name='غربية';b2.az=225;b2.x=22;b2.z=6;ARR.push(b2);build();
  const errs=[];let rep='',shp='';
  try{shop();shp=document.getElementById('ovBody').innerHTML;}catch(e){errs.push('shop: '+e.message);}
  try{report();rep=document.getElementById('ovBody').innerHTML;}catch(e){errs.push('report: '+e.message);}
  return {errs,hasSec:/التوجيه ودراسة الظلال/.test(rep),hasNine:/9 — الخلاصة/.test(rep),
    hasSheet:/مخطط الظلال/.test(shp),svg:(shp.match(/<svg/g)||[]).length,repLen:rep.length};});
ok(out.errs.length===0,'التقرير والخرائط تُبنى بلا استثناء',out.errs.join(' | ')||'نظيف');
ok(out.hasSec,'فصل «التوجيه ودراسة الظلال» موجود في التقرير');
ok(out.hasNine,'الخلاصة أُعيد ترقيمها إلى 9');
ok(out.hasSheet&&out.svg>=8,'لوحة الظلال 08 موجودة ضمن 8 لوحات',out.svg+' لوحة SVG');
const det=await pg.evaluate(()=>{const h=shadowSection();
  return {stair:/بيت الدرج/.test(h),par:/العمامة المحيطة/.test(h),
    tbl:/نسبة التظليل على مستوى الألواح/.test(h),lim:/لا تشمل الدراسة المباني المجاورة/.test(h)};});
ok(det.stair,'فصل التقرير يسرد بيت الدرج المُضاف');
ok(det.par,'يسرد العمامة المحيطة كعائق');
ok(det.tbl,'يتضمّن جدول نسبة التظليل على مستوى الألواح');
ok(det.lim,'يذكر حدود الدراسة صراحة (المباني المجاورة والأشجار)');
const arr=await pg.evaluate(()=>{const h=document.getElementById('ovBody').innerHTML;
  return {tbl:/1\.0 المصفوفات \(2 هياكل\)/.test(h),gov:/\(حاكمة\)/.test(h),
    west:/غربية/.test(h),note:/مجموع كل المصفوفات/.test(h),
    cols:/<th>غربية<br>/.test(h)};});
ok(arr.tbl,'جدول المصفوفات يظهر عند وجود أكثر من هيكل');
ok(arr.gov,'المصفوفة الحاكمة مُعلَّمة');
ok(arr.west&&arr.cols,'أسماء المصفوفات تظهر في الجدول وفي أعمدة التظليل');
ok(arr.note,'ملاحظة أن الكميات مجموع كل المصفوفات موجودة');

console.log('\n[9] محرّك الإنتاجية — بيروت، سطح خالٍ من العوائق');
const en=await pg.evaluate(()=>{
  M.lat=33.8938;M.lon=35.5018;M.tz=2;M.north=0;M.ghiY=1900;
  M.bShape='rect';M.bA=60;M.bB=40;M.bRot=0;M.bPar=0;OBS=[];
  ARR=[];AI=0;M.tpl='S1';applyTpl('S1');
  M.L=12;M.S=6;M.h1=2.2;M.h2=3.4;M.bOX=2;M.bOZ=2;M.az=180;build();
  const ghiSum=[...Array(12)].reduce((a,_,m)=>a+ghiMonth(m)*MDAYS[m],0);
  const south=energyAll();
  const mk=az=>{M.az=az;build();return energyAll().year;};
  const east=mk(90),north=mk(0),west=mk(270);
  M.az=180;build();
  const h2=M.h2;M.h2=M.h1;build();const flat=energyAll().year;M.h2=h2;build();
  const E=energyAll();
  return {ghiSum,year:E.year,kwp:E.kwp,spec:E.spec,pr:E.arrays[0].pr,
    tilt:E.arrays[0].tilt,poaY:E.arrays[0].poaY,
    worst:E.worstM,best:E.monT.indexOf(Math.max(...E.monT)),
    worstN:MFULL[E.worstM],bestN:MFULL[E.monT.indexOf(Math.max(...E.monT))],
    south:south.year,east,north,west,flat,der:sysDerate()};});
ok(Math.abs(en.ghiSum-1900)<1,'مجموع الإشعاع الشهري = المُدخل السنوي',en.ghiSum.toFixed(1)+' kWh/م²');
ok(en.tilt>10&&en.tilt<14,'الميل المحسوب من h1/h2 ≈ 11.3°',en.tilt.toFixed(1)+'°');
ok(en.poaY>en.ghiSum,'الإشعاع على المستوى المائل أعلى من الأفقي',
   en.poaY.toFixed(0)+' مقابل '+en.ghiSum.toFixed(0));
ok(en.spec>1200&&en.spec<1900,'الإنتاج النوعي ضمن المجال الواقعي للبنان',Math.round(en.spec)+' kWh/kWp');
ok(en.pr>0.65&&en.pr<0.90,'معامل الأداء PR واقعي',(en.pr*100).toFixed(1)+'%');
ok(en.south>en.east&&en.east>en.north,'الجنوب أعلى إنتاجاً من الشرق ومن الشمال',
   'ج='+Math.round(en.south)+' ق='+Math.round(en.east)+' ش='+Math.round(en.north));
ok(Math.abs(en.east-en.west)/en.east<0.02,'الشرق والغرب متقاربان (تناظر حول الجنوب)',
   'ق='+Math.round(en.east)+' غ='+Math.round(en.west));
ok(en.south>en.flat,'الميل نحو الجنوب أفضل من المستوي الأفقي',
   Math.round(en.south)+' مقابل '+Math.round(en.flat));
ok(en.worst===11&&en.best>=5&&en.best<=6,'أسوأ شهر كانون الأول وأفضله حزيران/تموز',
   'أسوأ='+en.worstN+' أفضل='+en.bestN);
ok(Math.abs(en.der-0.89)<0.02,'معامل الفقد الثابت ≈ 89%',(en.der*100).toFixed(1)+'%');

console.log('\n[9ب] أثر التظليل على الإنتاج');
const shE=await pg.evaluate(()=>{
  const before=energyAll().year;
  OBS=[{poly:[[0,16],[60,16],[60,30],[0,30]],h:14,base:-9,kind:'bldg',name:'برج جنوبي'}];
  build();
  const after=energyAll();
  OBS=[];build();
  return {before,after:after.year,loss:after.arrays[0].shLossY,
    pct:1-after.year/before};});
ok(shE.after<shE.before*0.75,'برج جنوبي بارتفاع 14 م يخفض الإنتاج بوضوح',
   Math.round(shE.before)+' → '+Math.round(shE.after)+' kWh ('+(shE.pct*100).toFixed(0)+'%−)');
ok(shE.loss>0,'فقد التظليل السنوي مسجّل',Math.round(shE.loss)+' kWh');

console.log('\n[9ج] الأحمال والبطاريات والتشريج');
const sys=await pg.evaluate(()=>{
  M.sysType='hybrid';M.loadD=30;M.loadNight=45;M.loadPk=6;
  M.batChem='lifepo4';M.batV=48;M.batVm=51.2;M.batAh=200;M.batDays=1;M.batDoD=90;
  M.pVoc=45.9;M.pVmp=38.4;M.pTcV=-0.25;M.tMin=0;M.tCellMax=70;
  M.invVmax=1000;M.invVmin=200;M.invIsc=30;M.invMppt=2;M.invKW=10;
  const B=batCalc(),ST=stringCalc(),L=loadCalc(),Z=sizePanels();
  return {night:L.night,needAh:B.needAh,ser:B.ser,par:B.par,n:B.n,
    usable:B.usable,cRate:B.cRate,iPk:B.iPk,
    vocC:ST.vocC,vmpH:ST.vmpH,nMax:ST.nMax,nMin:ST.nMin,best:ST.best,
    needOff:Z.needOff,needGrid:Z.needGrid,have:Z.have};});
ok(Math.abs(sys.night-13.5)<.01,'الحمل الليلي 45% من 30 kWh',sys.night.toFixed(2)+' kWh');
ok(Math.abs(sys.needAh-325.5)<1,'السعة المطلوبة = 13500/(48×0.9×0.96)',sys.needAh.toFixed(1)+' Ah');
ok(sys.ser===1&&sys.par===2&&sys.n===2,'التشريج 1 توالي × 2 توازي',sys.ser+'س × '+sys.par+'ط');
ok(Math.abs(sys.usable-16.59)<.05,'الطاقة المستعملة ≈ 16.6 kWh',sys.usable.toFixed(2));
ok(Math.abs(sys.iPk-125)<1,'تيار الذروة = 6000/48',sys.iPk.toFixed(0)+' A');
ok(Math.abs(sys.vocC-48.77)<.05,'Voc البارد عند 0°م',sys.vocC.toFixed(2)+' V');
ok(Math.abs(sys.vmpH-34.08)<.05,'Vmp الساخن عند خلية 70°م',sys.vmpH.toFixed(2)+' V');
ok(sys.nMax===20&&sys.nMin===6,'حدود السلسلة 6 — 20 لوح',sys.nMin+'—'+sys.nMax);
ok(!!sys.best&&sys.best.n>=sys.nMin&&sys.best.n<=sys.nMax,'اقتُرح تشريج ضمن الحدود',
   sys.best?sys.best.n+' × '+sys.best.str:'—');
ok(!!sys.best&&sys.best.vmax<=1000&&sys.best.vmp>=200,'جهد السلسلة ضمن نافذة المحوّل',
   sys.best?sys.best.vmax.toFixed(0)+'V بارد · '+sys.best.vmp.toFixed(0)+'V ساخن':'—');
ok(sys.needOff>0&&sys.needGrid>0&&sys.needOff>sys.needGrid,
   'ألواح أسوأ شهر أكثر من ألواح المعادلة السنوية',sys.needOff+' مقابل '+sys.needGrid);

console.log('\n[9د] مستند الإنتاجية');
const erp=await pg.evaluate(()=>{
  const errs=[];let h='';
  try{energyReport();h=document.getElementById('ovBody').innerHTML;}catch(e){errs.push(e.message);}
  return {errs,len:h.length,svg:(h.match(/<svg/g)||[]).length,
    bars:(h.match(/<title>/g)||[]).length,
    sec:['معطيات المنظومة','الإنتاجية الشهرية','أداء كل مصفوفة','تغطية الأحمال',
         'البطاريات والتشريج','تشريج الألواح على المحوّل','أساس الحساب وحدوده']
        .every(t=>h.includes(t)),
    lim:/ليست محاكاة 8760/.test(h)};});
ok(erp.errs.length===0,'المستند يُبنى بلا استثناء',erp.errs.join(' | ')||'نظيف');
ok(erp.sec,'كل الفصول السبعة موجودة');
ok(erp.svg>=1&&erp.bars>=12,'الرسم البياني الشهري موجود مع تلميحات لكل عمود',erp.bars+' تلميح');
ok(erp.lim,'حدود الدراسة مذكورة صراحة (ليست محاكاة 8760 ساعة)');

console.log('\n[10] محاكاة حركة الشمس');
const an=await pg.evaluate(()=>{
  M.lat=33.8938;M.lon=35.5018;M.tz=2;M.north=0;
  M.bShape='rect';M.bA=40;M.bB=30;M.bPar=.8;OBS=[];ARR=[];AI=0;
  M.tpl='S1';applyTpl('S1');M.L=10;M.S=6;M.bOX=2;M.bOZ=2;M.az=180;build();
  M.sMon=12;M.sDay=21;M.sHour=9.5;
  const keep={mo:+M.sMon,dy:+M.sDay,hr:+M.sHour};
  const sample=(mode,frac)=>{
    animStart(mode,10,false);
    ANIM.t0=performance.now()-frac*10*1000;
    animTick();
    const r={mo:+M.sMon,dy:+M.sDay,hr:+M.sHour,alt:SUN.alt};
    ANIM=null;return r;};
  const d25=sample('day',0.25),d50=sample('day',0.5),d90=sample('day',0.9);
  const s0=sample('season',0.1),s1=sample('season',1.1),s2=sample('season',2.1),s3=sample('season',3.1);
  // الإيقاف يعيد الحالة
  animStart('day',10);ANIM.t0=performance.now()-4000;animTick();
  const mid={mo:+M.sMon,hr:+M.sHour};
  M.sMon=keep.mo;M.sDay=keep.dy;M.sHour=keep.hr;   // محاكاة ما يفعله animStop
  animStart('day',10);const before={mo:+M.sMon,dy:+M.sDay,hr:+M.sHour};
  ANIM.t0=performance.now()-5000;animTick();animStop();
  const after={mo:+M.sMon,dy:+M.sDay,hr:+M.sHour};
  const st=sunTimes(33.8938,35.5018,2,12,21);
  return {d25,d50,d90,s0,s1,s2,s3,mid,before,after,rise:st.rise,set:st.set,
    rec:typeof recSupported()==='boolean',anim:ANIM===null};});
ok(an.d25.hr<an.d50.hr&&an.d50.hr<an.d90.hr,'الوقت يتقدّم خلال اليوم',
   an.d25.hr.toFixed(2)+' → '+an.d50.hr.toFixed(2)+' → '+an.d90.hr.toFixed(2));
ok(an.d25.hr>an.rise&&an.d90.hr<an.set,'المحاكاة تبقى بين الشروق والغروب',
   'شروق '+an.rise.toFixed(2)+' … غروب '+an.set.toFixed(2));
ok(an.d25.alt>0&&an.d50.alt>0&&an.d90.alt>0,'الشمس فوق الأفق طوال المحاكاة',
   'أدنى ارتفاع '+Math.min(an.d25.alt,an.d50.alt,an.d90.alt).toFixed(1)+'°');
ok(an.d50.alt>an.d25.alt&&an.d50.alt>an.d90.alt,'الشمس تبلغ ذروتها في منتصف اليوم',
   an.d25.alt.toFixed(1)+' · '+an.d50.alt.toFixed(1)+' · '+an.d90.alt.toFixed(1)+'°');
ok(an.s0.mo===3&&an.s1.mo===6&&an.s2.mo===9&&an.s3.mo===12,
   'دورة الفصول تمرّ على الأربعة بالترتيب',[an.s0.mo,an.s1.mo,an.s2.mo,an.s3.mo].join(' → '));
ok(an.s1.alt>an.s3.alt,'شمس حزيران أعلى من شمس كانون الأول',
   an.s1.alt.toFixed(1)+'° مقابل '+an.s3.alt.toFixed(1)+'°');
ok(an.after.mo===an.before.mo&&an.after.dy===an.before.dy&&Math.abs(an.after.hr-an.before.hr)<1e-9,
   'الإيقاف يعيد التاريخ والساعة كما كانا',
   an.before.hr.toFixed(2)+' → '+an.after.hr.toFixed(2));
ok(an.anim,'حالة المحاكاة تُصفَّر عند الإيقاف');
ok(an.rec,'دعم التسجيل يُفحص بلا استثناء');

console.log('\n[11] تقرير الظلال التفصيلي');
const sh2=await pg.evaluate(()=>{
  // الهيكل يشغل x 2..12 و z 2..8 ؛ العوائق جنوبه (z أكبر) فيقع ظلّها شمالاً عليه
  OBS=[{poly:[[3,9],[6,9],[6,11],[3,11]],h:3,base:0,kind:'stair',name:'بيت الدرج'},
       {poly:[[0,16],[40,16],[40,26],[0,26]],h:20,base:-9,kind:'bldg',name:'جار جنوبي'}];
  build();
  const st=shadowStats();
  const errs=[];let h='';
  try{shadowReport();h=document.getElementById('ovBody').innerHTML;}catch(e){errs.push(e.message);}
  return {errs,len:h.length,
    rows:st.heat.length,cols:st.heat[0].length,
    clear:st.clear,base:st.base.year,loss:st.lossY,pc:st.lossPc,
    nAtt:st.attrib.length,top:st.attrib[0]&&st.attrib[0].name,
    att:st.attrib.map(x=>({name:x.name,gain:x.gain})),
    sumAtt:st.attrib.reduce((a,x)=>a+x.gain,0),
    worst:st.worst.m,
    secs:['الملخّص السنوي','خريطة التظليل','الجدول الشهري','نصيب كل عائق',
          'الأيام الأربعة المرجعية','أساس الحساب'].every(t=>h.includes(t)),
    seasons:['اعتدال الربيع','انقلاب الصيف','اعتدال الخريف','انقلاب الشتاء'].every(t=>h.includes(t)),
    svg:(h.match(/<svg/g)||[]).length,
    lim:/الأشجار والأبراج والرافعات/.test(h)};});
ok(sh2.errs.length===0,'التقرير يُبنى بلا استثناء',sh2.errs.join(' | ')||'نظيف');
ok(sh2.rows===12&&sh2.cols===15,'الخريطة الحرارية 12 شهراً × 15 ساعة',sh2.rows+'×'+sh2.cols);
ok(sh2.clear>sh2.base,'الإنتاج بلا عوائق أعلى من الفعلي',
   Math.round(sh2.clear)+' مقابل '+Math.round(sh2.base));
ok(sh2.loss>0&&sh2.pc>0&&sh2.pc<1,'الفاقد السنوي موجب ومعقول',
   Math.round(sh2.loss)+' kWh ('+(sh2.pc*100).toFixed(1)+'%)');
ok(sh2.nAtt===3,'نصيب محسوب لكل عائق وللعمامة',sh2.nAtt+' بنود');
ok(sh2.top==='جار جنوبي','الجار الجنوبي (20 م) أكبر مسبّب للفاقد من بيت الدرج (3 م)',
   sh2.att.map(x=>x.name+' '+Math.round(x.gain)).join(' · '));
ok(sh2.sumAtt<=sh2.loss*1.05,'مجموع الأنصبة لا يتجاوز الفاقد الكلي (تراكب الظلال)',
   Math.round(sh2.sumAtt)+' من '+Math.round(sh2.loss));
ok(sh2.secs,'الفصول الستة موجودة');
ok(sh2.seasons,'الأيام الأربعة المرجعية موجودة بأسمائها');
ok(sh2.svg>=5,'خريطة حرارية + أربعة مخططات ظل',sh2.svg+' SVG');
ok(sh2.lim,'حدود الدراسة مذكورة صراحة');

console.log('\n[12] غرفة الكهرباء — الهندسة وقراءة DXF');
const DXFTXT=['0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
 '0','SECTION','2','ENTITIES','0','LWPOLYLINE','8','0','90','4','70','1',
 '10','0.0','20','0.0','10','6000.0','20','0.0','10','6000.0','20','4000.0',
 '10','0.0','20','4000.0','0','ENDSEC','0','EOF'].join('\n');
const DXFNOU=DXFTXT.replace('9\n$INSUNITS\n70\n4\n','');
const rm=await pg.evaluate(t=>{
  ROOM.on=1;ROOM.poly=null;ROOM.W=6;ROOM.L=4;ROOM.H=3;EQP=[];
  const w=roomWalls();
  const inward=w.map(x=>{const m=wallPt(x,x.len/2);
    return inPoly(m[0]+x.nx*0.1,m[1]+x.nz*0.1,roomPoly());});
  const d1=parseDXF(t.a),d2=parseDXF(t.b);
  const c1=dxfCandidates(d1,dxfScale(d1));
  const c2=dxfCandidates(d2,dxfScale(d2));
  roomFromPoly(c1[0].poly,'DXF');
  const bb=roomBB();
  return {area:6*4,got:polyArea([[0,0],[6,0],[6,4],[0,4]]),
    nw:w.length,lens:w.map(x=>+x.len.toFixed(2)),inward,
    u1:d1.units,sc1:dxfScale(d1),sc2:dxfScale(d2),
    a1:+c1[0].area.toFixed(2),n1:c1[0].nm,
    rarea:+roomArea().toFixed(2),rw:ROOM.W,rl:ROOM.L,
    org:[+bb.x0.toFixed(3),+bb.z0.toFixed(3)]};},{a:DXFTXT,b:DXFNOU});
ok(rm.nw===4&&rm.lens.join(',')==='6,4,6,4','المستطيل يعطي أربعة جدران بأطوال صحيحة',rm.lens.join(' · '));
ok(rm.inward.every(Boolean),'كل نواظم الجدران تشير إلى داخل الغرفة');
ok(rm.u1===4&&Math.abs(rm.sc1-0.001)<1e-9,'وحدة DXF تُقرأ من $INSUNITS (ملم)',rm.u1+' ⇒ ×'+rm.sc1);
ok(Math.abs(rm.sc2-0.001)<1e-9,'وبدونها تُخمَّن من حجم الأرقام',' ×'+rm.sc2);
ok(Math.abs(rm.a1-24)<0.01,'المضلّع المغلق = 24 م² (6×4)',rm.a1+' م²');
ok(Math.abs(rm.rarea-24)<0.01&&rm.rw===6&&rm.rl===4,'الغرفة بُنيت من DXF بأبعادها',
   rm.rw+'×'+rm.rl+' = '+rm.rarea+' م²');
ok(rm.org[0]===0&&rm.org[1]===0,'المحيط أُزيح إلى الأصل',rm.org.join(','));

console.log('\n[12ب] التوزيع التلقائي وتحقّق المسافات');
const ly=await pg.evaluate(()=>{
  // منظومة معلومة: مصفوفة PV + بطاريات
  M.bShape='rect';M.bA=40;M.bB=30;M.bPar=0;OBS=[];ARR=[];AI=0;
  M.tpl='S1';applyTpl('S1');M.L=12;M.S=6;M.bOX=2;M.bOZ=2;M.az=180;build();
  M.sysType='hybrid';M.invModel='deye12';M.invKW=12;
  M.batChem='lifepo4';M.batV=48;M.batVm=51.2;M.batAh=200;M.batDays=1;M.loadD=30;M.loadNight=45;
  ROOM.poly=null;ROOM.W=7;ROOM.L=5;ROOM.H=3;ROOM.on=1;
  ROOM.door={wall:0,off:.6,w:.9,h:2.1};ROOM.win={on:1,wall:2,off:1.2,w:1.2,h:1,sill:1.1};
  autoLayout();
  const v=roomCheck();
  const kinds={};EQP.forEach(e=>kinds[e.kind]=(kinds[e.kind]||0)+1);
  const P=roomPoly();
  const inside=EQP.every(e=>eqFoot(e).every(q=>inPoly(q[0],q[1],P)));
  // قطعة تخرج عن الغرفة عمداً
  EQP.push({kind:'db',name:'خارج',tag:'X',x:20,z:20,rot:0,y:1.4});
  const v2=roomCheck();
  EQP.pop();
  // قطعة تعترض الباب
  const w0=roomWalls()[0],dc=wallPt(w0,ROOM.door.off+ROOM.door.w/2);
  EQP.push({kind:'db',name:'أمام الباب',tag:'D',x:dc[0],z:dc[1],rot:0,y:1.4});
  const v3=roomCheck();
  EQP.pop();
  return {n:EQP.length,kinds,inside,ok:v.ok,msgs:v.msgs.length,
    inv:invCount(),bat:batCalc().n,
    out:v2.msgs.some(m=>/خارج حدود الغرفة/.test(m)),
    door:v3.msgs.some(m=>/يعترض الباب/.test(m))};});
ok(ly.kinds.inv===ly.inv,'عدد الإنفرترات يطابق قدرة المنظومة',ly.inv+' إنفرتر');
ok((ly.kinds.batw||0)===ly.bat,'عدد البطاريات يطابق حساب البنك',ly.bat+' وحدة');
ok(ly.kinds.db>=1&&ly.kinds.earth===1&&ly.kinds.fan===1&&ly.kinds.ext===1,
   'التابلوه والتأريض والتهوية والطفاية مضافة',Object.keys(ly.kinds).join(' · '));
ok(ly.inside,'كل القطع داخل حدود الغرفة بعد التوزيع');
ok(ly.out,'يُكشف خروج قطعة عن حدود الغرفة');
ok(ly.door,'يُكشف اعتراض قطعة للباب');

console.log('\n[12ج] مخططات الغرفة والتقرير');
const rr2=await pg.evaluate(()=>{
  const errs=[];let h='';
  try{roomReport();h=document.getElementById('ovBody').innerHTML;}catch(e){errs.push(e.message);}
  return {errs,svg:(h.match(/<svg/g)||[]).length,
    secs:['بيانات الغرفة','المخطط الأفقي','واجهات الجدران','جدول المعدّات',
          'تحقّق المسافات والسلامة','ملاحظات التنفيذ'].every(t=>h.includes(t)),
    sched:eqSchedule().length,
    elev:roomWalls().length,
    dwg:/DWG لا يُقرأ/.test(document.getElementById('dock').innerHTML)};});
ok(rr2.errs.length===0,'تقرير الغرفة يُبنى بلا استثناء',rr2.errs.join(' | ')||'نظيف');
ok(rr2.secs,'الفصول الستة موجودة');
ok(rr2.svg>=1+rr2.elev,'مخطط أفقي + واجهة لكل جدار',rr2.svg+' SVG لـ '+rr2.elev+' جدران');
ok(rr2.sched>0,'جدول المعدّات يجمّع القطع المتشابهة',rr2.sched+' صنف');

console.log('\n[7] تبويب KML في الواجهة');
const ui=await pg.evaluate(()=>{
  closeOv();TAB='kml';drawTabs();dock();
  const d=document.getElementById('dock');
  return {txt:d.innerText.slice(0,0),has:{kml:/استيراد السطح من Google Earth/.test(d.innerHTML),
    geo:/الموقع الجغرافي والاتجاه/.test(d.innerHTML),
    obs:/العوائق على السطح/.test(d.innerHTML),
    shade:/دراسة الظلال على الألواح/.test(d.innerHTML)},
    tabs:[...document.querySelectorAll('#tabs button')].map(b=>b.textContent)};});
ok(ui.has.kml&&ui.has.geo&&ui.has.obs&&ui.has.shade,'أقسام التبويب الأربعة تُرسم');
ok(ui.tabs.includes('KML والظلال'),'زرّ التبويب ظاهر',ui.tabs.join(' · '));

console.log('\n[8] أخطاء وقت التشغيل الإجمالية');
ok(errs.length===0,'لا أخطاء JS في الجلسة كلها',errs.slice(0,4).join(' | ')||'نظيف');

await b.close();
console.log('\n'+(fail?('❌ '+fail+' اختبار فاشل'):'✅ كل الاختبارات ناجحة'));
process.exit(fail?1:0);
})().catch(e=>{console.error('CRASH',e);process.exit(2);});
