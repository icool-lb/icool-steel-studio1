(function(g){
function Vec(x,y,z){this.x=x||0;this.y=y||0;this.z=z||0;}
Vec.prototype={
 set(x,y,z){this.x=x;this.y=y;this.z=z;return this;},
 copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;},
 clone(){return new Vec(this.x,this.y,this.z);},
 add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;},
 sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;},
 subVectors(a,b){this.x=a.x-b.x;this.y=a.y-b.y;this.z=a.z-b.z;return this;},
 multiplyScalar(s){this.x*=s;this.y*=s;this.z*=s;return this;},
 length(){return Math.hypot(this.x,this.y,this.z);},
 normalize(){const l=this.length()||1;return this.multiplyScalar(1/l);},
 distanceTo(v){return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z);},
 setY(y){this.y=y;return this;},
 lerp(v,a){this.x+=(v.x-this.x)*a;this.y+=(v.y-this.y)*a;this.z+=(v.z-this.z)*a;return this;},
 lerpVectors(a,b,t){this.x=a.x+(b.x-a.x)*t;this.y=a.y+(b.y-a.y)*t;this.z=a.z+(b.z-a.z)*t;return this;},
 dot(v){return this.x*v.x+this.y*v.y+this.z*v.z;},
 cross(v){const x=this.y*v.z-this.z*v.y,y=this.z*v.x-this.x*v.z,z=this.x*v.y-this.y*v.x;
   this.x=x;this.y=y;this.z=z;return this;},
 crossVectors(a,b){return this.copy(a).cross(b);},
 addVectors(a,b){this.x=a.x+b.x;this.y=a.y+b.y;this.z=a.z+b.z;return this;},
 addScaledVector(v,s){this.x+=v.x*s;this.y+=v.y*s;this.z+=v.z*s;return this;},
 negate(){this.x=-this.x;this.y=-this.y;this.z=-this.z;return this;},
 setLength(l){return this.normalize().multiplyScalar(l);},
 applyAxisAngle(){return this;},
 lookAt(){return this;}};
function Obj3D(){this.children=[];this.position=new Vec();this.rotation={x:0,y:0,z:0};
 this.scale={x:1,y:1,z:1,set(a,b,c){this.x=a;this.y=b;this.z=c;}};
 this.quaternion={setFromUnitVectors(){return this;}};
 this.visible=true;this.renderOrder=0;this.castShadow=false;this.receiveShadow=false;}
Obj3D.prototype.add=function(){for(const c of arguments)if(c)this.children.push(c);return this;};
Obj3D.prototype.traverse=function(f){f(this);this.children.forEach(c=>c.traverse?c.traverse(f):f(c));};
Obj3D.prototype.updateMatrixWorld=function(){};
function mk(proto){const F=function(){Obj3D.call(this);proto&&proto.apply(this,arguments);};
 F.prototype=Object.create(Obj3D.prototype);F.prototype.constructor=F;return F;}
const Group=mk();
const Scene=mk(function(){this.background=null;});
const Geo=function(){};Geo.prototype.dispose=function(){};
Geo.prototype.setFromPoints=function(p){this.pts=p;return this;};
const Mesh=mk(function(geo,mat){this.geometry=geo;this.material=mat;this.isMesh=true;});
const Line=mk(function(geo,mat){this.geometry=geo;this.material=mat;this.isLine=true;});
const Sprite=mk(function(mat){this.material=mat;this.isSprite=true;});
const Light=mk(function(){this.intensity=1;this.target=new Group();
 this.shadow={mapSize:{set(){}},bias:0,camera:{updateProjectionMatrix(){}}};});
function Shape(){this.pts=[];}
Shape.prototype.moveTo=function(x,y){this.pts.push([x,y]);};
Shape.prototype.lineTo=function(x,y){this.pts.push([x,y]);};
g.THREE={
 Scene,Group,Mesh,Line,Sprite,Shape,Vector3:Vec,
 Color:function(){},
 PerspectiveCamera:mk(function(f,a){this.aspect=a;this.updateProjectionMatrix=function(){};
   this.lookAt=function(){};}),
 WebGLRenderer:function(o){this.domElement=(o&&o.canvas)||document.createElement('canvas');
   this.shadowMap={enabled:false,type:0};this.setPixelRatio=function(){};
   this.setSize=function(){};this.render=function(){};},
 PCFSoftShadowMap:2,DoubleSide:2,
 HemisphereLight:Light,DirectionalLight:Light,
 MeshLambertMaterial:function(o){Object.assign(this,o||{});},
 MeshBasicMaterial:function(o){Object.assign(this,o||{});},
 LineBasicMaterial:function(o){Object.assign(this,o||{});},
 SpriteMaterial:function(o){Object.assign(this,o||{});},
 CanvasTexture:function(){this.repeat={set(){}};this.wrapS=0;this.wrapT=0;this.needsUpdate=false;this.dispose=function(){};},
 BoxGeometry:Geo,SphereGeometry:Geo,ExtrudeGeometry:Geo,BufferGeometry:Geo,
 PlaneGeometry:Geo,EdgesGeometry:Geo,CylinderGeometry:Geo,TorusGeometry:Geo,TubeGeometry:Geo,
 CatmullRomCurve3:function(p){this.points=p;},
 RepeatWrapping:1000,
 MeshStandardMaterial:function(o){Object.assign(this,o||{});},
 LineSegments:mk(function(geo,mat){this.geometry=geo;this.material=mat;this.isLineSegments=true;})};
})(window);
