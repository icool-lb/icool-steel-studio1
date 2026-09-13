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

console.log('\n[6] التقرير والمخططات');
const out=await pg.evaluate(()=>{
  const errs=[];let rep='',shp='';
  try{report();rep=document.getElementById('ovBody').innerHTML;}catch(e){errs.push('report: '+e.message);}
  try{shop();shp=document.getElementById('ovBody').innerHTML;}catch(e){errs.push('shop: '+e.message);}
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
