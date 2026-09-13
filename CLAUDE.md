# iCOOL Steel Studio — سياق المشروع لـ Claude Code

## ما هو
منصة ويب بملف واحد (`index.html`) لدراسة الهياكل الحديدية: برغولا · هياكل طاقة شمسية · هنغارات.
بدون backend، بدون build، بدون متغيرات بيئة. three.js r128 من cdnjs.

## المالك
iCOOL Trading & Contracting — م. أحمد محمد ناصر (OEA 36359)
GitHub: `icool-lb` · Vercel team: `icool-lb's projects`

## البنية
```
index.html    كامل التطبيق (HTML + CSS + JS) — لا تقسّمه إلى ملفات إلا بطلب صريح
vercel.json   cleanUrls + security headers
README.md     توثيق عربي
```

## قواعد التعديل
- كل التعديلات داخل `index.html`. الواجهة RTL عربية بالكامل.
- ألوان الهوية: أزرق `#0066A7` وبرتقالي `#F1471E`. الشعار SVG مضمّن ويجب أن يبقى `direction:ltr` وإلا تتراكب النصوص في سياق RTL.
- اتجاه ميل الألواح: دوران الصندوق حول X بزاوية θ ينقل +Z إلى (0,−sinθ,cosθ). مستوى صاعد ⇒ θ=−t، هابط ⇒ θ=+t. الكود يمرّر `pt.dir` والدوران `-pt.dir*t`. لا تعكس الإشارة.
- الرياح: يجب الإبقاء على الفصل بين `cf` (تصميم الإطار) و`cp,net` (المثبتات). خلطهما يعطي تصميماً خاطئاً في الاتجاهين.
- أي مقطع جديد يُضاف إلى جدول `SEC` بوزنه kg/m ومساحته cm² وأبعاده بالمتر.
- كل عنصر يُرسم عبر `addM(kind, sec, p1, p2, mat, mark)` حتى يدخل جدول الكميات وقائمة القطع تلقائياً.

## اختبار سريع بدون متصفح
```bash
python3 - <<'PY'
import io
s=io.open('index.html',encoding='utf-8').read()
js=s.split('r128/three.min.js"></script>')[1].split('<script>')[1].split('</script>')[0]
io.open('/tmp/app.js','w',encoding='utf-8').write(js)
PY
node --check /tmp/app.js
```

## النشر
push إلى `main` → Vercel ينشر تلقائياً (بعد ربط المشروع بالريبو).
