/* اختبار تخزين الصور: السقف القديم · الترحيل · العرض غير المتزامن */
const {chromium}=require('playwright');
const O='file://'+require('path').join(__dirname,'..','index.html');
let pass=0,fail=0;
const ok=(c,m)=>{c?(pass++,console.log('  ✓ '+m)):(fail++,console.log('  ✗ '+m))};

(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined});
 const errs=[];

 console.log('\n[1] السقف القديم: localStorage ينهار قبل ١٠٠ صورة');
 let p=await b.newPage();
 await p.goto(O);await p.waitForTimeout(400);
 const oldCap=await p.evaluate(()=>{
   const img='x'.repeat(80*1024);              // ~٨٠ ك.ب للصورة، كالواقع
   let o={},k=0;
   try{for(k=0;k<200;k++){o['i'+k]=img;localStorage.setItem('cap_test',JSON.stringify(o))}}
   catch(e){try{localStorage.removeItem('cap_test')}catch(e2){}return k}
   try{localStorage.removeItem('cap_test')}catch(e){}
   return 200;
 });
 console.log(`  ← localStorage توقّف عند ${oldCap} صورة`);
 ok(oldCap<100,`السقف القديم كان دون ١٠٠ صورة فعلاً (${oldCap})`);
 await p.close();

 console.log('\n[2] IndexedDB تتجاوز السقف بمراحل');
 p=await b.newPage();
 p.on('pageerror',e=>errs.push(e.message));
 await p.goto(O);await p.waitForTimeout(500);
 const N=300;
 const wrote=await p.evaluate(async n=>{
   const img='x'.repeat(80*1024);
   for(let i=0;i<n;i++)await blobPut('b'+i,img);
   return await blobCount();
 },N);
 ok(wrote>=N,`حُفظت ${wrote} صورة (${Math.round(wrote*80/1024)} م.ب) بلا انهيار`);
 const back=await p.evaluate(()=>blobFetch('b250').then(d=>d.length));
 ok(back===80*1024,'الصورة رقم ٢٥٠ تُقرأ كاملةً');
 const lsClean=await p.evaluate(()=>(localStorage.getItem('icool_blobs')||'').length);
 ok(lsClean===0,'localStorage لم تُلمس');

 console.log('\n[3] الذاكرة لا تحتفظ بكل الصور');
 const cacheSize=await p.evaluate(()=>BCACHE.size);
 ok(cacheSize<=40,`الذاكرة المؤقّتة محدودة بـ${cacheSize} صورة لا ${N}`);

 console.log('\n[4] الترحيل من التخزين القديم');
 await p.evaluate(()=>{
   const o={};for(let i=0;i<5;i++)o['old'+i]='QUJD'+i;    // صور قديمة في localStorage
   localStorage.setItem('icool_blobs',JSON.stringify(o));
 });
 const moved=await p.evaluate(()=>blobMigrate());
 ok(moved===5,`رُحّلت ${moved} صور`);
 ok(await p.evaluate(()=>(localStorage.getItem('icool_blobs')||'').length)===0,'المفتاح القديم مُسح بعد نجاح الترحيل');
 ok(await p.evaluate(()=>blobFetch('old3'))==='QUJD3','الصورة المرحّلة تُقرأ من مكانها الجديد');
 ok(await p.evaluate(()=>blobMigrate())===0,'الترحيل ثانيةً لا يفعل شيئاً');

 console.log('\n[5] المرفق يُصوَّر ويُعرض فعلاً في الصفحة');
 await p.evaluate(async()=>{
   S.role='foreman';S.tab='follow';
   const d=curDay();
   const a={id:'att1',dayId:d.id,kind:'فاتورة',date:today(),by:'',clientId:'',supId:'',amount:'',note:'',updatedAt:now()};
   // صورة صالحة ١×١ بكسل
   await blobPut('att1','/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==');
   DB.atts.push(a);saveLocal();render();
 });
 await p.waitForTimeout(600);
 const imgs=await p.$$eval('img.bimg',e=>e.map(x=>({has:!!x.getAttribute('src'),miss:x.classList.contains('bmiss')})));
 ok(imgs.length>0,`${imgs.length} صورة في الصفحة`);
 ok(imgs.every(x=>x.has&&!x.miss),'كل الصور مُلئت بعد الرسم');
 const natural=await p.$eval('img.bimg',e=>new Promise(r=>{
   if(e.complete)return r(e.naturalWidth);e.onload=()=>r(e.naturalWidth);e.onerror=()=>r(0)}));
 ok(natural>0,`الصورة فُكّت فعلاً في المتصفح (عرض ${natural}px)`);

 console.log('\n[6] البيانات تبقى بعد إعادة فتح الصفحة');
 await p.reload();
 await p.waitForTimeout(700);
 ok(await p.evaluate(()=>blobCount())>=N,'الصور باقية بعد إعادة التحميل');

 console.log('\n[7] الحذف يزيل الصورة');
 await p.evaluate(()=>blobDel('b10'));
 ok(await p.evaluate(()=>blobFetch('b10'))==='','الصورة المحذوفة لم تعد تُقرأ');

 console.log('\n[8] لا أخطاء');
 ok(errs.length===0,errs.length?('أخطاء: '+errs.slice(0,3).join(' | ')):'لا أخطاء جافاسكربت');

 await b.close();
 console.log(`\n${'='.repeat(46)}\nنجح ${pass} · فشل ${fail}\n${'='.repeat(46)}`);
 process.exit(fail?1:0);
})().catch(e=>{console.error('انهار الاختبار:',e.message);process.exit(1)});
