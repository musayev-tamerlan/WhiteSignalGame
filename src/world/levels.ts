import * as THREE from 'three';
import { radioRoom, station } from './layout';
const materials = new Map<string,THREE.MeshStandardMaterial>();
function mat(color:string,glow=false) {
 const key=color+glow; if(!materials.has(key)) materials.set(key,new THREE.MeshStandardMaterial({color,roughness:.93,emissive:glow?color:0,emissiveIntensity:glow?.65:0})); return materials.get(key)!;
}
const boxGeo = new THREE.BoxGeometry(1,1,1);
function box(g:THREE.Group,x:number,y:number,z:number,w:number,h:number,d:number,color:string,glow=false) {
 const m=new THREE.Mesh(boxGeo,mat(color,glow));m.position.set(x,y,z);m.scale.set(w,h,d);g.add(m);return m;
}
function label(g:THREE.Group,text:string,x:number,y:number,z:number,w:number,color='#b5c8cb',bg='') {
 const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d')!;
 if(bg){ctx.fillStyle=bg;ctx.fillRect(0,0,512,128);}ctx.fillStyle=color;ctx.font='500 48px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,64);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
 const m=new THREE.Mesh(new THREE.PlaneGeometry(w,w/4),new THREE.MeshBasicMaterial({map:t,transparent:true}));m.position.set(x,y,z);g.add(m);return m;
}
function iceRidge(group: THREE.Group, x: number, z: number, width: number, height: number, depth: number) {
 const geometry = new THREE.BufferGeometry();
 const vertices: number[] = [];
 const faces = [
  [-.56, 0, .44], [-.26, height * .64, -.09], [.02, 0, .48],
  [-.26, height * .64, -.09], [.05, height, -.19], [.02, 0, .48],
  [.05, height, -.19], [.27, height * .65, .04], [.02, 0, .48],
  [.27, height * .65, .04], [.61, 0, .42], [.02, 0, .48],
  [.05, height, -.19], [.61, 0, .42], [.51, 0, -.53],
  [.05, height, -.19], [.51, 0, -.53], [-.56, 0, -.49],
  [.05, height, -.19], [-.56, 0, -.49], [-.56, 0, .44],
 ];
 for (const [vx, y, vz] of faces) vertices.push(vx * width, y, vz * depth);
 geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
 geometry.computeVertexNormals();
 const ridge = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
  color: '#526a7d', roughness: 1, flatShading: true, side: THREE.DoubleSide,
 }));
 ridge.position.set(x, -.5, z);
 group.add(ridge);
}
function lamp(g:THREE.Group,x:number,y:number,z:number) {
 box(g,x,y,z,.36,.12,.3,'#ef963d',true);
 const light=new THREE.PointLight('#ffaf66',13,9,2);light.position.set(x,y-.3,z+.6);g.add(light);
 const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d')!,grad=ctx.createRadialGradient(32,32,1,32,32,32);grad.addColorStop(0,'rgba(255,174,92,.35)');grad.addColorStop(1,'rgba(255,174,92,0)');ctx.fillStyle=grad;ctx.fillRect(0,0,64,64);
 const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),depthWrite:false,blending:THREE.AdditiveBlending}));sprite.position.set(x,y,z+.4);sprite.scale.set(3,3,1);g.add(sprite);
}
export class Levels {
 outside=new THREE.Group();inside=new THREE.Group(); snow:THREE.Points; snowPositions:Float32Array; terminalLight:THREE.PointLight;
 constructor(public scene:THREE.Scene) {
  scene.add(this.outside,this.inside);this.inside.visible=false;
  scene.add(new THREE.HemisphereLight('#a8c9de','#17212c',2.3));
  const moon=new THREE.DirectionalLight('#9cbdd6',2.1);moon.position.set(-12,18,8);scene.add(moon);
  const o=this.outside;
  iceRidge(o, -20, -18, 20, 9, 10);
  iceRidge(o, -12, -19, 16, 11, 12);
  iceRidge(o, 2, -19, 23, 13, 13);
  iceRidge(o, 16, -22, 21, 12, 11);
  iceRidge(o, -24, -3, 15, 8, 15);
  iceRidge(o, -24, 10, 10, 4.7, 12);
  box(o, 4, -.71, 2, 58, 1.42, 47, '#708998');

  const iceGeometry = new THREE.IcosahedronGeometry(1, 0);
  for (let i = 0; i < 42; i++) {
   const bank = new THREE.Mesh(iceGeometry, mat(i % 3 ? '#7693a1' : '#8ba5ac'));
   const back = i < 24;
   bank.position.set(back ? i * 2.3 - 23 : -10 + (i - 24) * 1.8, -.18,
    back ? -11 - Math.sin(i * 7) * 1.55 : 11 + Math.sin(i * 4) * 2.6);
   bank.scale.set(1.85 + Math.sin(i) * .7, .42 + Math.cos(i * 2) * .18, 1.35);
   o.add(bank);
  }
  // Raised, corrugated research module.
  const { building } = station;
  box(o, building.x, 2.45, building.z, building.width, 4.5, building.depth, '#314955');
  box(o, 8.5, 4.8, -5.5, 13.55, .32, 7.5, '#9ab0b7');
  box(o, 8.5, 4.53, -1.91, 13.6, .16, .18, '#bcc9c7');
  box(o, 8.5, .35, -5.5, 13.2, .45, 7.15, '#263844');
  for (let i = 0; i < 17; i++) box(o, 15.015, 2.55, -8.8 + i * .4, .045, 3.95, .07, '#405863');
  box(o, 15.055, 1.3, -5.5, .09, .35, 6.9, '#763d2c');
  for (const z of [-7.25, -4.65]) {
   box(o, 15.06, 3.0, z, .14, 1.48, 1.76, '#182d39');
   box(o, 15.14, 3.0, z, .06, 1.17, 1.48, '#d17b3d', true);
   box(o, 15.19, 3.0, z, .06, 1.35, .05, '#263640');
   box(o, 15.18, 3.0, z, .06, .05, 1.6, '#263640');
  }
  box(o, 10.7, 5, -6.9, 4.3, .24, 2.05, '#738a97');
  for (let i = 0; i < 8; i++) box(o, 9 + i * .47, 5.14, -6.9, .05, .035, 1.83, '#425965');
  for(let i=0;i<34;i++) box(o,3.25+i*.35,2.5,-1.96,.045,3.9,.065,'#3c525c');
  box(o,9,1.3,-1.84,11.9,.35,.09,'#763d2c');
  for(const x of [4.9,7.3,12.9]) {
   box(o,x,3.1,-1.8,1.65,1.4,.2,'#132631');box(o,x,3.1,-1.65,1.4,1.16,.08,'#dd762e',true);
   box(o,x,3.1,-1.5,.06,1.3,.09,'#22343d');box(o,x,3.1,-1.5,1.5,.06,.09,'#22343d');
   box(o,x,3.8,-1.5,1.8,.1,.5,'#8b9a9d');
  }
  box(o,10.2,1.85,-1.65,1.6,3.2,.4,'#0d202b');box(o,10.2,1.85,-1.38,1.24,2.9,.12,'#344953');
  box(o,10.2,2.55,-1.26,.73,.64,.05,'#e99039',true);box(o,10.65,1.5,-1.2,.08,.35,.08,'#c9b99b');
  box(o,10.2,.18,-.8,2.4,.35,1.6,'#71868d');lamp(o,10.2,3.85,-1.2);
  label(o,'KESTREL  /  04',6.15,4.13,-1.75,4.5,'#c2cfd0');label(o,'ENTRY',10.2,3.4,-1.2,1.15,'#f3c596');
  box(o,15.6,1.1,-3.3,1.3,2.2,2.3,'#253b46');
  for(let i=0;i<6;i++)box(o,15.6,.5+i*.22,-2.1,1,.05,.06,'#52656d');
  // Antenna, cables, rooftop machinery.
  box(o,12,5.3,-3.2,1.8,.8,1.5,'#344b57');box(o,5.8,6.7,-3,.09,4,.09,'#6e858f');
  for(let i=0;i<4;i++)box(o,5.8,6.2+i*.55,-3,2.2-i*.35,.045,.06,'#7f949c');
  const red=new THREE.Mesh(new THREE.SphereGeometry(.07,8,6),mat('#ec704f',true));red.position.set(5.8,8.8,-3);o.add(red);
  for(const x of [-13,-2,20]) {
   box(o,x,2.5,-3,.12,5,.16,'#344b58');box(o,x,5,-3,1.6,.12,.15,'#586e78');
   const pts=[new THREE.Vector3(x,5,-3),new THREE.Vector3(x+5,4.3,-3),new THREE.Vector3(x+11,5,-3)];
   const curve=new THREE.CatmullRomCurve3(pts);o.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(24)),new THREE.LineBasicMaterial({color:'#142c3a'})));
  }
  // Equipment, packed snow and guide stakes lead to the lit doorway.
  for (const { x, z, width, depth } of station.crates) {
   box(o, x, .48, z, width, .96, depth, '#344b53');
   box(o, x, .96, z, width + .08, .12, depth + .08, '#93aab1');
   for (const offset of [-.31, .31]) box(o, x + offset, .47, z + depth / 2, .08, .82, .06, '#6c8085');
  }
  const trail = new THREE.Shape();
  const trailStart = -10;
  const trailEnd = station.entrance.x;
  const trailLength = 24;
  const trailZ = (fraction: number) => 5.25 - 4.6 * fraction * fraction;
  for (let i = 0; i <= trailLength; i++) {
   const fraction = i / trailLength;
   const x = THREE.MathUtils.lerp(trailStart, trailEnd, fraction);
   const z = trailZ(fraction) + .75 + Math.sin(i * 1.7) * .13;
   if (i === 0) trail.moveTo(x, -z);
   else trail.lineTo(x, -z);
  }
  for (let i = trailLength; i >= 0; i--) {
   const fraction = i / trailLength;
   const z = trailZ(fraction) - .75 + Math.sin(i * 2.3) * .10;
   trail.lineTo(THREE.MathUtils.lerp(trailStart, trailEnd, fraction), -z);
  }
  trail.closePath();
  const packedSnow = new THREE.Mesh(new THREE.ShapeGeometry(trail), mat('#839da8'));
  packedSnow.rotation.x = -Math.PI / 2;
  packedSnow.position.y = .012;
  o.add(packedSnow);
  for (let i = 0; i <= trailLength; i++) {
   const fraction = i / trailLength;
   const x = THREE.MathUtils.lerp(trailStart, trailEnd, fraction);
   box(o, x, .018, trailZ(fraction) + (i % 2 ? .31 : -.31), .30, .017, .17, '#6d8794').rotation.y = -.28;
  }
  for (const [x, z] of [[-8, 6.4], [-3, 6.1], [2, 5.35], [6.7, 3.5], [10.9, 1.75]]) {
   box(o, x, .43, z, .07, .86, .07, '#405c6d');
   box(o, x, .83, z, .11, .18, .11, '#ce8459', true);
  }
  box(o, -8.5, 1.0, 2.6, .1, 2.0, .1, '#526974');
  box(o, -8.5, 1.65, 2.65, 2.4, .6, .12, '#1d3643');
  label(o, 'STATION 04 →', -8.5, 1.65, 2.73, 2.2);

  const indoor = this.inside;
  // Leave the two camera-facing sides open like a cutaway model.
  box(indoor, 0, -.65, 0, 16.5, .8, 10.5, '#263943');
  box(indoor, 0, -.18, 0, 16.2, .36, 10.2, '#4f5d5e');
  box(indoor, 0, 2.12, -5, 16.2, 4.24, .28, '#31434a');
  box(indoor, -8, 2.12, 0, .28, 4.24, 10.2, '#394b52');
  box(indoor, 0, 4.25, -5, 16.3, .17, .39, '#a08b72');
  box(indoor, -8, 4.25, 0, .39, .17, 10.2, '#a08b72');
  box(indoor, 0, .075, 4.98, 16.1, .15, .13, '#a68764');
  box(indoor, 8, .075, 0, .13, .15, 10.1, '#a68764');

  for (let x = -7.5; x <= 7.5; x++) {
   for (let z = -4.5; z <= 4.5; z++) {
    const palette = ['#536368', '#566467', '#4a5b61'];
    box(indoor, x, .006, z, .978, .014, .978, palette[Math.abs(Math.round(x * 17 + z * 7)) % palette.length]);
   }
  }
  for (let x = -7.4; x < 8; x += 1.45) {
   box(indoor, x, 2.08, -4.83, .065, 4.03, .065, '#657476');
  }
  for (let z = -4.5; z < 5; z += 1.48) {
   box(indoor, -7.82, 2.08, z, .065, 4.03, .065, '#677375');
  }
  box(indoor, 0, 1.06, -4.79, 16, .14, .1, '#a06e4c');
  box(indoor, -7.79, 1.06, 0, .1, .14, 9.85, '#a06e4c');
  for (const x of [-5.9, -.3, 6.25]) lamp(indoor, x, 3.72, -4.62);

  const { exit, desk, rack, bench, terminal } = radioRoom;
  box(indoor, exit.x, .025, exit.z, 2.04, .04, 1.24, '#9c774b');
  box(indoor, exit.x, .047, exit.z, 1.65, .02, .87, '#34464c');
  const exitSign = label(indoor, 'EXIT', exit.x, .063, exit.z, 1.44, '#f4bd76');
  exitSign.rotation.x = -Math.PI / 2;

  box(indoor, desk.x, 1.19, desk.z, desk.width, .23, desk.depth, '#997957');
  for (const x of [1.05, 6]) box(indoor, x, .55, desk.z, .66, 1.1, desk.depth - .16, '#273b43');
  box(indoor, terminal.x, 1.96, -3.54, 1.75, 1.34, .93, '#141f26');
  box(indoor, terminal.x, 2.0, -3.055, 1.46, .94, .06, '#65bc9e', true);
  label(indoor, '87.6 MHz', terminal.x, 2.0, -3.014, 1.35, '#1e4b3d');
  box(indoor, terminal.x, 1.34, -2.92, 1.55, .09, .46, '#b9b1a0');
  for (let i = 0; i < 10; i++) box(indoor, terminal.x - .59 + i * .13, 1.396, -2.89, .09, .02, .28, '#344449');
  box(indoor, 5.24, 1.59, -3.53, 1.15, .56, .77, '#303f46');
  for (let i = 0; i < 4; i++) box(indoor, 4.85 + i * .14, 1.6, -3.13, .038, .33, .025, '#13262d');
  box(indoor, 5.63, 1.71, -3.12, .06, .06, .025, '#e9804e', true);
  box(indoor, 2.12, 1.34, -3.02, .65, .05, .47, '#c6b68f').rotation.y = -.18;
  box(indoor, 3.45, .048, -1.25, 3.66, .04, 1.72, '#3a5156');
  box(indoor, 3.45, .073, -2.03, 3.53, .014, .045, '#a98353');

  for (const x of [rack.x - .93, rack.x + .93]) {
   box(indoor, x, 1.36, rack.z, 1.8, 2.72, rack.depth, '#273941');
   for (let row = 0; row < 5; row++) {
    const y = .35 + row * .48;
    box(indoor, x, y, rack.z + .74, 1.52, .39, .045, '#506064');
    box(indoor, x + .53, y + .045, rack.z + .77, .08, .055, .025, row % 2 ? '#e9a45a' : '#79b7a2', true);
    box(indoor, x - .33, y, rack.z + .77, .53, .07, .024, '#17272d');
   }
  }
  box(indoor, bench.x, .63, bench.z, bench.width, .2, bench.depth, '#8d7055');
  box(indoor, bench.x, .31, bench.z, bench.width - .25, .62, bench.depth - .22, '#2d444c');
  box(indoor, bench.x, .91, bench.z - .96, .91, .37, .66, '#495b64');
  label(indoor, 'COMMUNICATIONS', .2, 3.47, -4.78, 6.1, '#e2cbaa');
  label(indoor, 'KESTREL / 04', .2, 2.89, -4.77, 3.25, '#a7afa8');
  this.terminalLight = new THREE.PointLight('#80d9b5', 5, 5);
  this.terminalLight.position.set(terminal.x, 2.12, -2.8);
  indoor.add(this.terminalLight);
  const count=1100;this.snowPositions=new Float32Array(count*3);
  for(let i=0;i<count;i++){this.snowPositions[i*3]=Math.random()*70-35;this.snowPositions[i*3+1]=Math.random()*19;this.snowPositions[i*3+2]=Math.random()*23-12;}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(this.snowPositions,3));
  const c=document.createElement('canvas');c.width=c.height=16;const ctx=c.getContext('2d')!;
  const gradient=ctx.createRadialGradient(8,8,0,8,8,8);gradient.addColorStop(0,'#fff');gradient.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,16,16);
  this.batchBoxes(this.outside);this.batchBoxes(this.inside);
  this.snow=new THREE.Points(geometry,new THREE.PointsMaterial({color:'#d5e5e9',size:2.1,map:new THREE.CanvasTexture(c),transparent:true,opacity:.65,depthWrite:false,sizeAttenuation:false}));this.snow.frustumCulled = false; scene.add(this.snow);
 }
 private batchBoxes(group:THREE.Group) {
  const batches=new Map<THREE.Material,THREE.Mesh[]>();
  for(const item of [...group.children]) {
   if(item instanceof THREE.Mesh && item.geometry===boxGeo) {
    const material=item.material as THREE.Material;
    const list=batches.get(material)||[];list.push(item);batches.set(material,list);
   }
  }
  for(const [material, meshes] of batches) {
   const batch=new THREE.InstancedMesh(boxGeo,material,meshes.length);
   meshes.forEach((mesh,i)=>{mesh.updateMatrix();batch.setMatrixAt(i,mesh.matrix);group.remove(mesh);});
   batch.computeBoundingSphere();group.add(batch);
  }
 }
 update(dt:number, x:number) {
  if (!this.outside.visible) return;
  const p=this.snowPositions;
  for(let i=0;i<p.length;i+=3) {
   p[i]-=dt*(2.3+(i%7)*.12);p[i+1]-=dt*(1.4+(i%5)*.2);
   if(p[i+1]<-.1){p[i+1]=18;p[i]=x+Math.random()*58-29;}
   if(p[i]<x-32)p[i]=x+32;
  }
  this.snow.geometry.attributes.position.needsUpdate=true;
 }
 setLevel(inside:boolean){this.outside.visible=!inside;this.inside.visible=inside;this.snow.visible=!inside;}
}
