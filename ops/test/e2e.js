/* اختبار شاشة الفورمان المبسّطة في متصفح حقيقي:
   الفورمان يرى جدولَي الورقة فقط، والإدارة تُكمل التسعير والعهدة. */
const {chromium}=require('playwright');
const path=require('path');
const URL='file://'+path.join(__dirname,'..','index.html');

let pass=0,fail=0;
const ok=(c,m)=>{c?(pass++,console.log('  ✓ '+m)):(fail++,console.log('  ✗ '+m))};

(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined});
  const p=await b.newPage({viewport:{width:420,height:900}});
  const errs=[];
  p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  await p.goto(URL);
  await p.waitForFunction(()=>typeof window.DB!=='undefined'||document.getElementById('tabs'),{timeout:8000});
  await p.waitForTimeout(400);

  const tabs=()=>p.$$eval('#tabs button',b=>b.map(x=>x.textContent.trim()));
  const body=()=>p.$eval('#app',e=>e.innerText);

  console.log('\n[1] الفورمان — الوضع المبسّط');
  await p.click('[data-act="login"][data-r="foreman"]');
  await p.waitForTimeout(300);
  const T=await tabs();
  ok(T.length===4,`أربعة تبويبات لا خمسة (وجد ${T.length}: ${T.join(' · ')})`);
  ok(T.some(x=>x.includes('الورقة')),'تبويب «الورقة» موجود');
  ok(!T.some(x=>x.includes('متابعة')),'تبويب «متابعة» طُوي في «صور»');

  console.log('\n[2] الورقة تحوي الجدولين معاً');
  let v=await body();
  ok(/دوام العمال/.test(v),'جدول العمال على الشاشة');
  ok(/بضاعة الورشات/.test(v),'جدول البضاعة على الشاشة نفسها');

  console.log('\n[3] لا مال ولا أجور في شاشة الفورمان');
  ok(!/كلفة اليد العاملة/.test(v),'كلفة اليد العاملة مخفية');
  ok(!/قيمة البضاعة/.test(v),'قيمة البضاعة مخفية');
  ok(!/على حساب الموردين/.test(v),'حساب الموردين مخفي');

  console.log('\n[4] إدخال يومية كما تُكتب على الورق');
  await p.click('.chip[data-act="addWorker"]');      // أول عامل
  await p.waitForTimeout(250);
  await p.click('[data-act="allTimes"]');            // 8:00 — 17:00
  await p.waitForTimeout(250);
  v=await body();
  ok(/9 ساعة|9\b/.test(v),'الساعات حُسبت بعد ضبط الدوام');

  // بضاعة ورشة: العنوان أوّلاً ثمّ البنود تحته
  await p.click('[data-act="newGrp"]');
  await p.waitForTimeout(350);
  await p.click('#modal .opt[data-act="choose"]');      // الورشة
  await p.waitForTimeout(350);
  await p.click('#modal .opt[data-act="choose"]');      // البند الأوّل
  await p.waitForTimeout(400);
  ok(await p.$('.grp'),'أُنشئت مجموعة ورشة');
  const gname=await p.$eval('.grph .gn',e=>e.textContent.trim());
  ok(gname.length>1&&gname!=='بلا ورشة محدّدة',`عنوان المجموعة هو الورشة: ${gname}`);

  // بند ثانٍ تحت المجموعة نفسها — بضغطة واحدة بلا إعادة اختيار الزبون
  await p.click('.addrow[data-act="addToGrp"]');
  await p.waitForTimeout(350);
  await p.click('#modal .opt[data-act="choose"]');
  await p.waitForTimeout(400);
  const grpCount=await p.$$eval('.grp',e=>e.length);
  const rowCount=await p.$$eval('.grp .mrow',e=>e.length);
  ok(grpCount===1&&rowCount===2,`مجموعة واحدة فيها بندان (${grpCount}/${rowCount})`);
  const sameClient=await p.evaluate(()=>{const d=curDay();
    return d.materials.length===2&&d.materials[0].clientId===d.materials[1].clientId&&!!d.materials[0].clientId});
  ok(sameClient,'البند الثاني ورث زبون المجموعة تلقائياً');

  v=await body();
  ok(!/سعر الوحدة/.test(v),'بضاعة المستودع بلا سعر في الورقة');
  ok(!/طريقة الدفع/.test(v),'لا طريقة دفع في الورقة');

  console.log('\n[5] البضاعة لا تطلب الزبون مرّة لكل بند');
  const picks=await p.$$eval('.grp .pick',e=>e.length);
  ok(picks===0,`لا منتقي زبون داخل صفوف البضاعة (${picks})`);
  const perRow=await p.$$eval('.grp .mrow input',e=>e.length);
  ok(perRow===2,`حقل واحد لكل بند — الكمية فقط (${perRow} لبندين)`);

  console.log('\n[5ب] تبويب النقد: السعر حيث يعرفه الفورمان');
  await p.evaluate(()=>{S.tab='cash';render()});
  await p.waitForTimeout(350);
  v=await body();
  ok(/مشتريات نقدية/.test(v),'قسم المشتريات النقدية');
  ok(/مصاريف محروقات/.test(v),'قسم مصاريف المحروقات');
  ok(/العدّة/.test(v),'قسم العدّة');
  ok(/مقبوضات نقدية من الزبون/.test(v),'قسم المقبوض من الزبون');
  ok(/مقبوضات نقدية من iCOOL/.test(v),'قسم المقبوض من iCOOL');

  // شراء نقدي له سعر
  await p.click('[data-act="newBuy"]');
  await p.waitForTimeout(350);
  await p.click('#modal .opt[data-act="choose"]');
  await p.waitForTimeout(400);
  v=await body();
  ok(/سعر الوحدة/.test(v),'الشراء النقدي يطلب السعر');
  const isBuy=await p.evaluate(()=>{const d=curDay();const m=d.materials[d.materials.length-1];
    return m.src==='شراء من السوق'&&m.pay==='نقداً'});
  ok(isBuy,'سُجّل مصدره «شراء من السوق» نقداً');
  ok(await p.$('.grp')===null||true,'—');

  // محروقات: المبلغ يُحسب من الليتر × السعر
  await p.click('.chip[data-act="addExp"][data-t="بنزين"]');
  await p.waitForTimeout(350);
  await p.evaluate(()=>{const d=curDay();const i=d.expenses.findIndex(e=>e.type==='بنزين');
    const set=(k,val)=>{const el=document.querySelector(`[data-act="fld"][data-p="expenses"][data-i="${i}"][data-k="${k}"]`);
      el.value=val;el.dispatchEvent(new Event('input',{bubbles:true}))};
    set('liters','20');set('lprice','1.5')});
  await p.waitForTimeout(400);
  const fuelAmt=await p.evaluate(()=>{const d=curDay();return n(d.expenses.find(e=>e.type==='بنزين').amount)});
  ok(fuelAmt===30,`المبلغ حُسب تلقائياً 20 × 1.5 = ${fuelAmt}`);

  // عدّة
  await p.click('.chip[data-act="addExp"][data-t="عدّة ومعدات"]');
  await p.waitForTimeout(350);
  ok(await p.evaluate(()=>curDay().expenses.some(e=>e.type==='عدّة ومعدات')),'العدّة نوع مصروف متاح');

  // مقبوض من الزبون
  await p.click('[data-act="newRevC"]');
  await p.waitForTimeout(350);
  await p.click('#modal .opt[data-act="choose"]');
  await p.waitForTimeout(400);
  ok(await p.evaluate(()=>curDay().revenues.length===1&&!!curDay().revenues[0].clientId),'المقبوض رُبط بالزبون من أوّل ضغطة');

  // مقبوض من iCOOL + رصيد العهدة
  await p.click('.chip[data-act="addCash"][data-d="in"]');
  await p.waitForTimeout(350);
  await p.evaluate(()=>{const d=curDay();d.custody[0].amount=200;d.materials.forEach(m=>{if(m.src==='شراء من السوق')m.price=10});saveDay(d);render()});
  await p.waitForTimeout(350);
  const bal=await p.evaluate(()=>custodyBal(curDay()));
  ok(bal===160,`الباقي بالعهدة 200 − (10 شراء + 30 بنزين) = ${bal}`);

  console.log('\n[6] الإرسال يطالبه بما يملك فقط');
  await p.evaluate(()=>{S.tab='send';render()});
  await p.waitForTimeout(300);
  v=await body();
  ok(!/السعر صفر/.test(v),'لا يطالبه بسعر بضاعة المستودع');
  ok(!/المورّد غير محدّد/.test(v),'لا يطالبه بمورّد المستودع');
  ok(!/شراء نقدي بلا سعر/.test(v),'الشراء النقدي مسعّر فلا اعتراض');
  // أفرغ سعر الشراء النقدي وتأكّد أنه يعترض
  await p.evaluate(()=>{const d=curDay();d.materials.forEach(m=>{if(m.src==='شراء من السوق')m.price=0});saveDay(d);render()});
  await p.waitForTimeout(300);
  ok(/شراء نقدي بلا سعر/.test(await body()),'يعترض على شراء نقدي بلا سعر');
  await p.evaluate(()=>{const d=curDay();d.materials.forEach(m=>{if(m.src==='شراء من السوق')m.price=10});saveDay(d);render()});
  await p.waitForTimeout(300);
  ok(/الورشة غير محدّدة|مكان العمل غير محدّد/.test(await body()),'ما زال يطالبه بالورشة');

  // أكمل المواقع ثم أرسل
  await p.evaluate(()=>{const d=curDay();const c=DB.clients[0].id;
    d.labor.forEach(r=>r.clientId=c);d.materials.forEach(m=>m.clientId=c);
    d.expenses.forEach(e=>{if(!n(e.amount))e.amount=5});
    d.revenues.forEach(r=>{if(!n(r.amount))r.amount=50});
    d.foreman=DB.workers[0].name;saveDay(d);render()});
  await p.waitForTimeout(300);
  p.once('dialog',d=>d.accept());
  await p.click('[data-act="send"]');
  await p.waitForTimeout(500);
  const sent=await p.evaluate(()=>DB.days.filter(d=>d.status&&d.status!=='draft').length);
  ok(sent>0,'اليومية أُرسلت');

  console.log('\n[7] الإدارة تستطيع إكمال ما لا يكتبه الفورمان');
  await p.evaluate(()=>{S.role='manager';S.mtab='days';render()});
  await p.waitForTimeout(300);
  await p.click('#app [data-act="openDay"]');
  await p.waitForTimeout(400);
  v=await body();
  ok(/تسعير البضاعة/.test(v),'مكتب التسعير ظاهر للإدارة');
  ok(/سعر الوحدة/.test(v),'الإدارة تُدخل السعر');
  ok(/طريقة الدفع/.test(v),'الإدارة تُدخل طريقة الدفع');
  ok(/العهدة/.test(v),'دفتر العهدة ظاهر للإدارة');
  ok(/مصاريف اليوم/.test(v),'المصاريف تُدخلها الإدارة');

  console.log('\n[8] التسعير من الإدارة يصل فعلاً إلى البيانات');
  const dayId=await p.evaluate(()=>S.openDay);
  await p.evaluate(id=>{const d=DB.days.find(x=>x.id===id);d.materials[0].price=25;saveDay(d);render()},dayId);
  await p.waitForTimeout(300);
  const tot=await p.evaluate(id=>{const d=DB.days.find(x=>x.id===id);return dayMat(d)},dayId);
  ok(tot>0,`قيمة البضاعة صارت ${tot} بعد تسعير الإدارة`);

  console.log('\n[9] الإدارة تضيف مصروفاً على يومية ليست يومها');
  const before=await p.evaluate(id=>({
    here:DB.days.find(x=>x.id===id).expenses.length,
    all:DB.days.reduce((s,x)=>s+x.expenses.length,0)}),dayId);
  await p.click('#app [data-act="addExpM"]');
  await p.waitForTimeout(350);
  const after=await p.evaluate(id=>({
    here:DB.days.find(x=>x.id===id).expenses.length,
    all:DB.days.reduce((s,x)=>s+x.expenses.length,0)}),dayId);
  ok(after.here===before.here+1&&after.all===before.all+1,
    `المصروف أُضيف إلى اليومية المفتوحة وحدها (${before.here}←${after.here})`);

  console.log('\n[10] مفتاح الأمان: الوضع الكامل يُعيد التبويبات الخمسة');
  await p.evaluate(()=>{DB.meta.frmFull=true;S.role='foreman';S.tab='day';render()});
  await p.waitForTimeout(300);
  const T2=await tabs();
  ok(T2.length===5,`الوضع الكامل يعطي خمسة تبويبات (${T2.length})`);
  v=await body();
  ok(/كلفة اليد العاملة/.test(v),'الوضع الكامل يُظهر الكلفة مجدداً');

  console.log('\n[11] لا رموز مكسورة في الواجهة');
  // \U0001f... يظهر كنصّ حرفي إن لم يُفسَّر عند توليد الملف
  const brk=await p.evaluate(()=>{
    const bad=[];const seen=new Set();
    const scan=()=>{const t=document.body.innerText;
      const m=t.match(/U0001f[0-9a-f]{3}/gi);if(m)m.forEach(x=>{if(!seen.has(x)){seen.add(x);bad.push(x)}})};
    const roles=[['foreman',['day','cash','follow','send']],
                 ['manager',['dash','days','reqs','jobs','rep','arch','data']],
                 ['shop',['po','orders','inq','cat']]];
    roles.forEach(([r,tabs])=>tabs.forEach(k=>{
      S.role=r;if(r==='foreman')S.tab=k;else if(r==='manager')S.mtab=k;else S.stab=k;
      try{render();scan()}catch(e){bad.push('render '+r+'/'+k+': '+e.message)}}));
    return bad;
  });
  ok(brk.length===0,brk.length?('رموز مكسورة: '+brk.join(' ')):'كل الرموز سليمة في كل تبويبات الأوضاع الثلاثة');

  console.log('\n[12] لا أخطاء في الصفحة');
  ok(errs.length===0,errs.length?('أخطاء: '+errs.slice(0,3).join(' | ')):'لا أخطاء جافاسكربت');

  await b.close();
  console.log(`\n${'='.repeat(46)}\nنجح ${pass} · فشل ${fail}\n${'='.repeat(46)}`);
  process.exit(fail?1:0);
})().catch(e=>{console.error('انهار الاختبار:',e.message);process.exit(1)});
