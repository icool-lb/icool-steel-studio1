/* دورة طلب البضاعة: طلب ⇐ موافقة ⇐ أمر شراء ⇐ استلام ⇐ مستودع ⇐ خصم بالاعتماد */
const {chromium}=require('playwright');
const O='file://'+require('path').join(__dirname,'..','index.html');
let pass=0,fail=0;
const ok=(c,m)=>{c?(pass++,console.log('  ✓ '+m)):(fail++,console.log('  ✗ '+m))};

(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined});
 const p=await b.newPage({viewport:{width:420,height:900}});
 const errs=[];
 p.on('pageerror',e=>errs.push(e.message));
 p.on('dialog',d=>d.accept('سعره مرتفع'));
 await p.goto(O);await p.waitForTimeout(500);

 const st=()=>p.evaluate(()=>{const r=DB.reqs[0];return r?r.status:''});
 const stock=nm=>p.evaluate(x=>n((DB.items.find(i=>i.name===x)||{}).stock),nm);
 let ITEM;

 console.log('\n[1] الفورمان يطلب من داخل مجموعة الورشة');
 await p.evaluate(()=>{S.role='foreman';S.tab='day';
   const d=curDay();const c=DB.clients[0].id;const it=DB.items[0];
   addMat(it.id);d.materials[0].clientId=c;d.materials[0].src='المستودع';d.materials[0].qty=4;
   d.foreman='ناصر';DB.meta.foreman='ناصر';saveDay(d);render()});
 await p.waitForTimeout(400);
 ITEM=await p.evaluate(()=>DB.items[0].name);
 ok(await p.$('[data-act="newReq"]'),'زرّ الطلب داخل المجموعة');
 await p.click('[data-act="newReq"]');
 await p.waitForTimeout(400);
 ok(await p.$('#modal .sheet'),'فُتحت ورقة الطلب');
 ok(await p.evaluate(()=>!!DB.reqs[0].clientId),'الطلب ورث ورشة المجموعة');
 ok(await st()==='جديد','الحالة «جديد»');

 console.log('\n[2] بنود الطلب');
 await p.click('[data-act="addReqLine"]');
 await p.waitForTimeout(350);
 await p.click('#modal .opt[data-act="choose"]');
 await p.waitForTimeout(400);
 ok(await p.evaluate(()=>DB.reqs[0].lines.length)===1,'أُضيف بند');
 await p.evaluate(()=>{const r=DB.reqs[0];r.lines[0].qty=10;save('reqs',r);reqSheet(r.id)});
 await p.waitForTimeout(300);

 console.log('\n[3] الإرسال يرفض الناقص');
 await p.evaluate(()=>{const r=DB.reqs[0];r.lines[0].qty=0;save('reqs',r);reqSheet(r.id)});
 await p.waitForTimeout(250);
 await p.click('[data-act="sendReq"]');
 await p.waitForTimeout(350);
 ok(await p.$('#modal .sheet'),'لم يُرسل وكمية صفر — الورقة ما زالت مفتوحة');
 await p.evaluate(()=>{const r=DB.reqs[0];r.lines[0].qty=10;save('reqs',r);reqSheet(r.id)});
 await p.waitForTimeout(250);
 await p.click('[data-act="sendReq"]');
 await p.waitForTimeout(400);
 ok(!(await p.$('#modal .sheet')),'أُرسل وأُغلقت الورقة');

 console.log('\n[4] الإدارة ترى الطلب وتوافق');
 await p.evaluate(()=>{S.role='manager';S.mtab='reqs';render()});
 await p.waitForTimeout(400);
 const body=await p.$eval('#app',e=>e.innerText);
 ok(/طلبات جديدة/.test(body),'قسم الطلبات الجديدة');
 await p.click('#app [data-act="openReq"]');
 await p.waitForTimeout(400);
 ok(await p.$('[data-act="okReq"]'),'زرّ الموافقة للإدارة');
 ok(!(await p.$('[data-act="sendReq"]')),'لا زرّ إرسال عند الإدارة');
 await p.click('[data-act="okReq"]');
 await p.waitForTimeout(400);
 ok(await st()==='موافَق','الحالة صارت «موافَق»');
 ok(await p.evaluate(()=>!!DB.reqs[0].approvedAt),'وقت الموافقة سُجّل');

 console.log('\n[5] أمر شراء لمورّد');
 ok(await p.$('[data-act="poReq"]'),'زرّ أمر الشراء ظهر بعد الموافقة');
 await p.click('[data-act="poReq"]');
 await p.waitForTimeout(350);
 await p.click('#modal .opt[data-act="choose"]');
 await p.waitForTimeout(400);
 ok(await st()==='أمر شراء','الحالة «أمر شراء»');
 ok(await p.evaluate(()=>!!DB.reqs[0].supId),'المورّد سُجّل على الطلب');

 console.log('\n[6] المحل يرى الأمر');
 await p.evaluate(()=>{closePicker();S.role='shop';S.stab='po';render()});
 await p.waitForTimeout(400);
 ok(/أوامر شراء عليك/.test(await p.$eval('#app',e=>e.innerText)),'تبويب أوامر الشراء عند المحل');
 ok((await p.$$('#app [data-act="openReq"]')).length>0,'الأمر ظاهر للمحل');

 console.log('\n[7] الاستلام يُدخل المستودع');
 const before=await stock(ITEM);
 await p.evaluate(()=>{S.role='manager';S.mtab='reqs';render();
   S.picker={kind:'req',id:DB.reqs[0].id};reqSheet(DB.reqs[0].id)});
 await p.waitForTimeout(400);
 ok(await p.$('[data-act="recvReq"]'),'زرّ الاستلام');
 ok(await p.$('input[data-k="recvQty"]'),'حقل «المستلم فعلاً» ظهر');
 // استُلم ٨ من ١٠
 await p.evaluate(()=>{const r=DB.reqs[0];r.lines[0].recvQty=8;save('reqs',r);reqSheet(r.id)});
 await p.waitForTimeout(300);
 await p.click('[data-act="recvReq"]');
 await p.waitForTimeout(500);
 ok(await st()==='مستلم','الحالة «مستلم»');
 const after=await stock(ITEM);
 ok(after===before+8,`دخل المستودع المستلم فعلاً لا المطلوب (${before} ← ${after})`);

 console.log('\n[8] الاستلام لا يتكرّر');
 await p.evaluate(()=>{const r=DB.reqs[0];reqReceive(r)});
 ok(await stock(ITEM)===after,'استدعاء الاستلام ثانيةً لا يضاعف الرصيد');

 console.log('\n[9] اعتماد اليومية يخصم من المستودع');
 const pre=await stock(ITEM);
 const dayId=await p.evaluate(()=>{const d=curDay();d.status='sent';saveDay(d);return d.id});
 await p.evaluate(id=>{const x=DB.days.find(d=>d.id===id);x.status='approved';saveDay(x);dayConsume(x)},dayId);
 const post=await stock(ITEM);
 ok(post===pre-4,`خُصمت الكمية المستعملة ٤ (${pre} ← ${post})`);
 await p.evaluate(id=>{const x=DB.days.find(d=>d.id===id);dayConsume(x)},dayId);
 ok(await stock(ITEM)===post,'الخصم لا يتكرّر لليومية نفسها');

 console.log('\n[10] الشراء النقدي لا يُخصم من المستودع');
 const cashPre=await p.evaluate(()=>{
   const d={id:'dx',date:'2026-01-01',foreman:'ناصر',status:'sent',labor:[],materials:[],expenses:[],custody:[],revenues:[],note:''};
   const it=DB.items[1];
   d.materials.push({id:'mx',itemId:it.id,qty:5,price:3,src:'شراء من السوق',pay:'نقداً',supId:'',clientId:''});
   DB.days.push(d);saveLocal();
   return n(it.stock)});
 await p.evaluate(()=>{const x=DB.days.find(d=>d.id==='dx');dayConsume(x)});
 ok(await p.evaluate(()=>n(DB.items[1].stock))===cashPre,'ما اشتُري نقداً لم يمرّ بالمستودع فلا يُخصم');

 console.log('\n[11] الرفض يصل بسببه');
 await p.evaluate(()=>{const r=newReq(DB.clients[0].id);
   r.lines.push({id:'l1',itemId:DB.items[0].id,qty:2,note:'',recvQty:''});save('reqs',r);
   S.role='manager';S.picker={kind:'req',id:r.id};reqSheet(r.id)});
 await p.waitForTimeout(400);
 await p.click('[data-act="noReq"]');
 await p.waitForTimeout(450);
 const rej=await p.evaluate(()=>{const r=DB.reqs.find(x=>x.status==='مرفوض');return r?r.rejNote:''});
 ok(rej==='سعره مرتفع',`سبب الرفض محفوظ: «${rej}»`);

 console.log('\n[12] الرصيد السالب يُنبَّه عليه');
 await p.evaluate(()=>{DB.items[0].stock=-5;saveLocal();S.role='manager';S.mtab='reqs';closePicker();render()});
 await p.waitForTimeout(400);
 ok(/رصيد سالب/.test(await p.$eval('#app',e=>e.innerText)),'تنبيه الرصيد السالب ظاهر');

 console.log('\n[13] لا أخطاء');
 ok(errs.length===0,errs.length?('أخطاء: '+errs.slice(0,3).join(' | ')):'لا أخطاء جافاسكربت');

 await b.close();
 console.log(`\n${'='.repeat(46)}\nنجح ${pass} · فشل ${fail}\n${'='.repeat(46)}`);
 process.exit(fail?1:0);
})().catch(e=>{console.error('انهار الاختبار:',e.message);process.exit(1)});
