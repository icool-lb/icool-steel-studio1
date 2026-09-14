/* لقطات من المحرّك الحقيقي — الطريقة الوحيدة للحكم على المظهر.
   التحضير:
     npm pack three@0.128.0 && tar xzf three-0.128.0.tgz package/build/three.min.js
     mv package/build/three.min.js test/three.real.js
   التشغيل:
     node test/screenshot.js            # ⇐ test/shots/*.png
     THREE_PATH=... CHROME_PATH=... node test/screenshot.js                        */
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path');
const DIR=path.resolve(__dirname,'..');
const TP=process.env.THREE_PATH||path.join(__dirname,'three.real.js');
if(!fs.existsSync(TP)){console.error('لم يُعثر على three.js الحقيقي في '+TP+' — راجع رأس الملف.');process.exit(1);}
const three=fs.readFileSync(TP,'utf8');
const OUT=path.join(__dirname,'shots');
fs.mkdirSync(OUT,{recursive:true});
(async()=>{
const b=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const pg=await b.newPage({viewport:{width:1280,height:840}});
const errs=[];pg.on('pageerror',e=>errs.push(String(e)));
await pg.route('**/three.min.js',r=>r.fulfill({status:200,contentType:'application/javascript',body:three}));
await pg.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await pg.goto('file://'+DIR+'/index.html');
await pg.waitForTimeout(900);
const info=await pg.evaluate(()=>{
  M.bShape='rect';M.bA=40;M.bB=30;ARR=[];AI=0;M.tpl='S1';applyTpl('S1');
  M.L=12;M.S=6;M.bOX=2;M.bOZ=2;M.az=180;build();
  M.sysType='hybrid';M.invModel='deye12';M.invKW=12;M.loadD=30;M.loadNight=45;
  ROOM.poly=null;ROOM.W=7;ROOM.L=5;ROOM.H=3;ROOM.on=1;
  ROOM.door={wall:0,off:.6,w:.9,h:2.1};ROOM.win={on:1,wall:2,off:1.2,w:1.2,h:1,sill:1.1};
  autoLayout();setRoomView(true);
  document.getElementById('dock').classList.add('min');
  let n=0;gRoom.traverse(o=>{if(o.isMesh)n++;});
  return {meshes:n,rev:THREE.REVISION};});
await pg.evaluate(()=>{resize();fitRoom();});
await pg.waitForTimeout(700);
await pg.locator('#gl').screenshot({path:path.join(OUT,'room-wall.png')});
await pg.evaluate(()=>{const bb=roomBB();
  tgt.set((bb.x0+bb.x1)/2,1.3,(bb.z0+bb.z1)/2);rho=9;phi=1.05;place();});
await pg.waitForTimeout(500);
await pg.locator('#gl').screenshot({path:path.join(OUT,'room-wide.png')});
await pg.evaluate(()=>{setRoomView(false);resize();fit();
  document.getElementById('dock').classList.add('min');});
await pg.waitForTimeout(600);
await pg.locator('#gl').screenshot({path:path.join(OUT,'site.png')});
console.log('three r'+info.rev+' · '+info.meshes+' جسم في الغرفة · '+(errs.length?('أخطاء: '+errs[0]):'بلا أخطاء'));
console.log('اللقطات في '+OUT);
await b.close();
process.exit(errs.length?1:0);})().catch(e=>{console.error('CRASH',e.message);process.exit(2);});
