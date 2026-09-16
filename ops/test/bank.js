/* اختبار بنك الداتا من طرف إلى طرف:
   أرشيف اصطناعي في منصّة القراءة ⇐ تصدير ⇐ استيراد في منصّة الورش ⇐ استعماله فعلياً. */
const {chromium}=require('playwright');
const path=require('path');
const R='file://'+path.join(__dirname,'..','..','reader','index.html');
const O='file://'+path.join(__dirname,'..','index.html');

let pass=0,fail=0;
const ok=(c,m)=>{c?(pass++,console.log('  ✓ '+m)):(fail++,console.log('  ✗ '+m))};
const kb=b=>b<1048576?(b/1024).toFixed(0)+'ك':(b/1048576).toFixed(2)+'م';

(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined});
 const errs=[];

 /* ---------- ١) أرشيف اصطناعي في القارئ ---------- */
 console.log('\n[1] بناء أرشيف اصطناعي وقياس الحجم');
 const p=await b.newPage({viewport:{width:420,height:900}});
 p.on('pageerror',e=>errs.push('reader: '+e.message));
 await p.goto(R);
 await p.waitForTimeout(600);

 const sizes=await p.evaluate(()=>{
   // صورة وهمية بحجم واقعي: ~300 ك.ب base64 لكل ورقة
   const fake=len=>'/9j/'+'A'.repeat(len);
   const WORKERS=['ناصر','علي','بشار','محمود ناصر','حسن الجديد'];
   const CLIENTS=['مصطفى ناصر','محمد حسين','خليل الصالح','ورشة الزهراني'];
   const ITEMS=[['ماسورة PPR 20mm','متر',2.5],['كوع 90 PPR 20','قطعة',0.75],
                ['غاز R410','كغ',14],['كابل 3×2.5','متر',1.8],['مفصل نحاس 1/4','قطعة',3.2]];
   const TASKS=['تركيب مكيف','صيانة مكيف','تمديدات نحاس'];
   const pad=n2=>String(n2).padStart(2,'0');
   D.sheets=[];D.rows=[];D.dict=[];
   let day=0;
   for(let m=1;m<=12;m++)for(let k=0;k<10;k++){
     day++;
     const date=`2025-${pad(m)}-${pad(1+k*2)}`;
     const sh={id:'s'+day,date,ref:'ورقة '+day,foreman:'ناصر',status:'تمت',rows:0,
       dayName:'',dateSure:true,pass:1,hash:'h'+day,hash2:'g'+day,unclear:[],
       full:fake(300000),img:fake(40000)};
     D.sheets.push(sh);
     const rows=[];
     for(let i=0;i<3;i++){
       const w=WORKERS[(day+i)%WORKERS.length],c=CLIENTS[(day+i)%CLIENTS.length];
       rows.push({id:`r${day}_l${i}`,sheetId:sh.id,type:'labor',date,foreman:'ناصر',sure:true,
         worker:w,from:'08:00',to:'17:00',hours:9,ot:'',client:c,task:TASKS[i%3],
         box:[0,0,1,0],boxes:{worker:[0,0,0,0],client:[0,0,0,0],task:[0,0,0,0]}});
     }
     for(let i=0;i<4;i++){
       const it=ITEMS[(day+i)%ITEMS.length],c=CLIENTS[(day+i)%CLIENTS.length];
       // سعر يتذبذب حول المرجع ليكون للوسيط معنى
       const price=Math.round((it[2]*(0.9+((day*7+i*13)%21)/100))*100)/100;
       rows.push({id:`r${day}_m${i}`,sheetId:sh.id,type:'material',date,foreman:'ناصر',sure:true,
         item:it[0],qty:1+(i%5),unit:it[1],price,source:'المستودع',supplier:'بشرفيك رابيع',client:c,
         box:[0,0,1,0],boxes:{item:[0,0,0,0],client:[0,0,0,0],supplier:[0,0,0,0]}});
     }
     rows.push({id:`r${day}_e`,sheetId:sh.id,type:'expense',date,foreman:'ناصر',sure:true,
       item:'بنزين',amount:30,note:'',client:''});
     rows.forEach(r=>{r.raw=JSON.parse(JSON.stringify(r))});
     sh.rows=rows.length;
     D.rows.push(...rows);
   }
   // قاموس تصحيح: صيغة خاطئة تُطابَق على الاسم المعتمد
   D.dict.push({id:'d1',kind:'worker',canon:'محمود ناصر',variants:[{v:'محمود ناصرر',n:3}],n:12,created:'2025-01-01',updated:'2025-01-01'});
   D.dict.push({id:'d2',kind:'item',canon:'ماسورة PPR 20mm',variants:[{v:'ماسوره ppr 20',n:5}],n:40,created:'2025-01-01',updated:'2025-01-01'});
   // سطر بالصيغة الخاطئة ليثبت أن البنك يُصدّر المصحّح
   D.rows.push({id:'rx',sheetId:'s1',type:'material',date:'2025-01-01',foreman:'ناصر',sure:true,
     item:'ماسوره ppr 20',qty:2,unit:'متر',price:2.6,source:'المستودع',supplier:'',client:'مصطفى ناصر'});
   return bankSizes();
 });
 console.log(`  الباكاب الكامل ${kb(sizes.full)} · منها صور ${kb(sizes.img)} (${Math.round(sizes.img/sizes.full*100)}٪)`);
 console.log(`  الأرشيف بلا صور ${kb(sizes.data)} · بنك الداتا ${kb(sizes.bank)}`);
 ok(sizes.img/sizes.full>0.9,'الصور هي الغالبية الساحقة من الباكاب');
 ok(sizes.data<sizes.full/20,`الأرشيف بلا صور أصغر ٢٠ ضعفاً على الأقل (${kb(sizes.full)} ← ${kb(sizes.data)})`);
 ok(sizes.bank<sizes.data/5,`البنك أصغر من الأرشيف بخمسة أضعاف (${kb(sizes.bank)})`);

 /* ---------- ٢) محتوى البنك ---------- */
 console.log('\n[2] البنك يحمل المصحّح لا الخام');
 const bank=await p.evaluate(()=>buildBank());
 const names=bank.dict.item.map(x=>x.name);
 ok(names.includes('ماسورة PPR 20mm'),'الاسم المعتمد موجود');
 ok(!names.includes('ماسوره ppr 20'),'الصيغة الخاطئة لم تُصدَّر كاسم مستقلّ');
 const wrong=bank.dict.item.find(x=>x.name==='ماسورة PPR 20mm');
 ok((wrong.variants||[]).includes('ماسوره ppr 20'),'الصيغة الخاطئة محفوظة كبديل للاسم المعتمد');

 const pp=bank.items.find(x=>x.name==='ماسورة PPR 20mm').price;
 ok(pp.k>10,`السعر محسوب من ${pp.k} قراءة`);
 ok(pp.min<pp.med&&pp.med<pp.max,`min ${pp.min} < med ${pp.med} < max ${pp.max}`);
 ok(pp.hist.length>0&&pp.hist.length<=6,'تاريخ السعر محفوظ بآخر ٦ قراءات');
 ok(bank.clients.length===4,`${bank.clients.length} ورشات لها نمط استهلاك`);
 ok(bank.clients.every(c=>c.items.length>0),'كل ورشة لها بنود معتادة');
 ok(bank.span.from==='2025-01-01'&&bank.span.to.startsWith('2025-12'),`المدّة ${bank.span.from} ← ${bank.span.to}`);
 const leaked=JSON.stringify(bank).includes('/9j/');
 ok(!leaked,'لا صورة واحدة تسرّبت إلى البنك');

 await p.close();

 /* ---------- ٣) الاستيراد في منصّة الورش ---------- */
 console.log('\n[3] الاستيراد في منصّة الورش');
 const q=await b.newPage({viewport:{width:420,height:900}});
 q.on('pageerror',e=>errs.push('ops: '+e.message));
 await q.goto(O);
 await q.waitForTimeout(600);

 const before=await q.evaluate(()=>({w:DB.workers.length,c:DB.clients.length,i:DB.items.length,t:DB.tasks.length}));
 const st=await q.evaluate(bk=>{const s=bankApply(bk);bankSave(bk);return s},bank);
 await q.waitForTimeout(300);
 const after=await q.evaluate(()=>({w:DB.workers.length,c:DB.clients.length,i:DB.items.length,t:DB.tasks.length}));
 // الأرشيف فيه اسم جديد واحد لكل نوع، وبقيّة الأسماء موجودة في القاعدة أصلاً
 ok(after.w===before.w+1,`عامل جديد واحد فقط أُضيف (${before.w} ← ${after.w})`);
 ok(after.c===before.c+1,`ورشة جديدة واحدة فقط أُضيفت (${before.c} ← ${after.c})`);
 ok(await q.evaluate(()=>DB.workers.filter(x=>x.name==='ناصر').length)===1,'«ناصر» الموجود لم يتكرّر');
 ok(await q.evaluate(()=>!!DB.clients.find(x=>x.name==='ورشة الزهراني')),'الورشة الجديدة وصلت بالاسم المصحّح');
 ok(after.i>before.i,`البضاعة ${before.i} ← ${after.i}`);
 ok(await q.evaluate(()=>!!BANK),'البنك محفوظ على الجهاز');

 console.log('\n[4] الاستيراد مرّتين لا يضاعف القوائم');
 await q.evaluate(bk=>{bankApply(bk)},bank);
 const twice=await q.evaluate(()=>({w:DB.workers.length,c:DB.clients.length,i:DB.items.length,t:DB.tasks.length}));
 ok(JSON.stringify(twice)===JSON.stringify(after),`لا تكرار بعد استيراد ثانٍ (${JSON.stringify(twice)})`);

 console.log('\n[5] البنك لا يطمس سعراً وضعته بيدك');
 await q.evaluate(()=>{const it=DB.items.find(x=>x.name==='غاز R410');it.price=99;saveLocal()});
 await q.evaluate(bk=>bankApply(bk),bank);
 ok(await q.evaluate(()=>DB.items.find(x=>x.name==='غاز R410').price)===99,'السعر اليدوي بقي كما هو');

 console.log('\n[6] البنك يُسعّر البند الفارغ');
 await q.evaluate(()=>{const it=DB.items.find(x=>x.name==='كابل 3×2.5');it.price=0;saveLocal()});
 const st2=await q.evaluate(bk=>bankApply(bk),bank);
 const filled=await q.evaluate(()=>DB.items.find(x=>x.name==='كابل 3×2.5').price);
 ok(filled>0,`السعر الفارغ مُلئ من الأرشيف (${filled})`);
 ok(st2.priced>=1,`${st2.priced} بند سُعّر`);

 console.log('\n[7] الاقتراح داخل مجموعة الورشة');
 await q.evaluate(()=>{S.role='foreman';S.tab='day';
   const d=curDay();const c=DB.clients.find(x=>x.name==='مصطفى ناصر');
   const it=DB.items.find(x=>x.name==='ماسورة PPR 20mm');
   addMat(it.id);d.materials[0].clientId=c.id;d.materials[0].src='المستودع';
   saveDay(d);render()});
 await q.waitForTimeout(400);
 const sug=await q.$$eval('.chips.sug .chip',e=>e.map(x=>x.textContent.trim()));
 ok(sug.length>0,`${sug.length} اقتراح داخل المجموعة`);
 ok(!sug.some(x=>x.includes('ماسورة PPR 20mm')),'البند المُدخل أصلاً لا يُقترح مجدداً');

 // الاقتراح بضغطة واحدة
 const n0=await q.evaluate(()=>curDay().materials.length);
 await q.click('.chips.sug .chip');
 await q.waitForTimeout(350);
 const added=await q.evaluate(()=>{const d=curDay();const m=d.materials[d.materials.length-1];
   return {n:d.materials.length,cid:m.clientId,src:m.src}});
 ok(added.n===n0+1,'الاقتراح أضاف البند بضغطة واحدة');
 ok(!!added.cid&&added.src==='المستودع','البند ورث ورشة المجموعة ومصدرها');

 console.log('\n[8] الشراء النقدي يبدأ بسعر الأرشيف');
 await q.evaluate(()=>{S.tab='cash';render()});
 await q.waitForTimeout(300);
 await q.click('[data-act="newBuy"]');
 await q.waitForTimeout(350);
 await q.evaluate(()=>{const opts=[...document.querySelectorAll('#modal .opt[data-act="choose"]')];
   const t=opts.find(o=>o.textContent.includes('ماسورة PPR 20mm'))||opts[0];t.click()});
 await q.waitForTimeout(400);
 const buyPrice=await q.evaluate(()=>{const d=curDay();
   const m=d.materials.filter(x=>x.src==='شراء من السوق').pop();return m?n(m.price):0});
 ok(buyPrice>0,`سعر الشراء النقدي جاء مملوءاً من الأرشيف (${buyPrice})`);

 console.log('\n[9] ملف غير صالح يُرفض بوضوح');
 const rej=await q.evaluate(()=>{try{bankApply({fmt:'something-else'});return ''}catch(e){return e.message}});
 ok(/بنك داتا/.test(rej),`رُفض برسالة مفهومة: ${rej}`);

 console.log('\n[10] لا أخطاء');
 ok(errs.length===0,errs.length?('أخطاء: '+errs.slice(0,3).join(' | ')):'لا أخطاء جافاسكربت');

 await b.close();
 console.log(`\n${'='.repeat(46)}\nنجح ${pass} · فشل ${fail}\n${'='.repeat(46)}`);
 process.exit(fail?1:0);
})().catch(e=>{console.error('انهار الاختبار:',e.message);process.exit(1)});
