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
  ok(T.length===3,`ثلاثة تبويبات لا خمسة (وجد ${T.length}: ${T.join(' · ')})`);
  ok(T.some(x=>x.includes('الورقة')),'تبويب «الورقة» موجود');
  ok(!T.some(x=>x.includes('نقد')),'تبويب «نقد» غير ظاهر للفورمان');

  console.log('\n[2] الورقة تحوي الجدولين معاً');
  let v=await body();
  ok(/دوام العمال/.test(v),'جدول العمال على الشاشة');
  ok(/البضاعة المستخدمة/.test(v),'جدول البضاعة على الشاشة نفسها');

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

  // بند بضاعة عبر البحث (لا بنود متكرّرة في قاعدة جديدة)
  await p.click('#app .chip[data-act="pk"][data-kind="item"]');
  await p.waitForTimeout(350);
  await p.click('#modal .opt[data-act="choose"]');
  await p.waitForTimeout(400);
  v=await body();
  ok(/الكمية/.test(v),'حقل الكمية ظاهر');
  ok(!/سعر الوحدة/.test(v),'حقل السعر غير ظاهر للفورمان');
  ok(!/طريقة الدفع/.test(v),'حقل طريقة الدفع غير ظاهر للفورمان');
  ok(!/المورّد/.test(v),'حقل المورّد غير ظاهر للفورمان');

  console.log('\n[5] عدد الحقول القابلة للإدخال في الورقة');
  const nf=await p.$$eval('#app input,#app select,#app textarea',e=>e.length);
  console.log(`  ← ${nf} حقل إدخال لعامل واحد وبند واحد`);
  ok(nf<=12,`الورقة بقيت مبسّطة (${nf} حقل ≤ 12)`);

  console.log('\n[6] الإرسال لا يطالب الفورمان بالسعر');
  await p.click('#tabs button:last-child');
  await p.waitForTimeout(300);
  v=await body();
  ok(!/السعر صفر/.test(v),'لا يطالبه بالسعر');
  ok(!/المورّد غير محدّد/.test(v),'لا يطالبه بالمورّد');
  ok(/الموقع غير محدّد|مكان العمل غير محدّد/.test(v),'ما زال يطالبه بالموقع (وهو على الورقة)');

  // أكمل المواقع ثم أرسل
  await p.evaluate(()=>{const d=curDay();const c=DB.clients[0].id;
    d.labor.forEach(r=>r.clientId=c);d.materials.forEach(m=>m.clientId=c);
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
  await p.click('#app [data-act="addExpM"]');
  await p.waitForTimeout(350);
  const ne=await p.evaluate(id=>DB.days.find(x=>x.id===id).expenses.length,dayId);
  ok(ne===1,'المصروف أُضيف إلى اليومية الصحيحة');

  console.log('\n[10] مفتاح الأمان: الوضع الكامل يُعيد التبويبات الخمسة');
  await p.evaluate(()=>{DB.meta.frmFull=true;S.role='foreman';S.tab='day';render()});
  await p.waitForTimeout(300);
  const T2=await tabs();
  ok(T2.length===5,`الوضع الكامل يعطي خمسة تبويبات (${T2.length})`);
  v=await body();
  ok(/كلفة اليد العاملة/.test(v),'الوضع الكامل يُظهر الكلفة مجدداً');

  console.log('\n[11] لا أخطاء في الصفحة');
  ok(errs.length===0,errs.length?('أخطاء: '+errs.slice(0,3).join(' | ')):'لا أخطاء جافاسكربت');

  await b.close();
  console.log(`\n${'='.repeat(46)}\nنجح ${pass} · فشل ${fail}\n${'='.repeat(46)}`);
  process.exit(fail?1:0);
})().catch(e=>{console.error('انهار الاختبار:',e.message);process.exit(1)});
