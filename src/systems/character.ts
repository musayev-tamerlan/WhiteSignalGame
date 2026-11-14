import * as THREE from 'three';
import type { Body } from './movement';
// Original, code-drawn pixel artwork based on the supplied scientist reference.
function frame(step:number, back = false) {
 const c=document.createElement('canvas'); c.width=32;c.height=48; const p=c.getContext('2d')!;
 const r=(x:number,y:number,w:number,h:number,color:string)=>{p.fillStyle=color;p.fillRect(x,y,w,h);};
 const stride=Math.round(Math.sin(step)*3);
 r(10-stride,33,6,11,'#18232d');r(18+stride,33,5,11,'#1d2b35');
 r(9-stride,43,8,3,'#b5c5c9');r(18+stride,43,8,3,'#7a919e');
 r(8,17,16,19,'#17232d');r(5,19,5,13,'#263844');r(6,31,5,4,'#b98c72');
 r(10,18,12,16,'#4b626d');r(11,22,3,11,'#627884');r(20,19,3,17,'#263a46');
 r(15,18,2,17,'#bc7549');r(9,18,3,7,'#d4874a');r(17,18,4,3,'#d4874a');
 r(11,28,5,4,'#253743');r(18,28,5,4,'#263843');r(9,35,15,2,'#111e26');
 r(22,20,4,11,'#536a73');r(23,30,4,4,'#b98c72');r(25,29,5,3,'#25333b');r(29,29,2,3,'#d9e5c5');
 r(11,6,12,12,'#b58a70');r(21,9,4,6,'#d5ac89');r(13,13,9,5,'#9e715c');
 r(10,5,13,6,'#111c23');r(12,3,9,3,'#101a20');r(9,8,5,7,'#16212a');r(21,9,3,2,'#131f26');r(21,12,2,1,'#1a252b');r(12,17,8,3,'#23343e');
 if (back) {
  r(20, 9, 5, 6, '#16212a');
  r(13, 11, 9, 4, '#202c33');
  r(10, 19, 11, 15, '#283946');
  r(11, 21, 9, 10, '#526774');
  r(12, 24, 7, 1, '#ae784e');
  r(13, 29, 5, 3, '#344c58');
 }
 return new THREE.CanvasTexture(c);
}
export class Character {
  body: Body = {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
    facing: { x: Math.SQRT1_2, z: -Math.SQRT1_2 },
    grounded: true,
  };

  private readonly sprite: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly shadow: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private readonly idle = [frame(0), frame(0, true)];
  private readonly frames = [false, true].map(back =>
    Array.from({ length: 8 }, (_, i) => frame(i * Math.PI / 4, back)),
  );
  private time = 0;
  private side = 1;

  constructor(scene: THREE.Scene) {
    for (const texture of [...this.idle, ...this.frames.flat()]) {
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.colorSpace = THREE.SRGBColorSpace;
    }
    // Keep the pixel sheet upright so its upper half cannot tilt into nearby walls.
    const spriteGeometry = new THREE.PlaneGeometry(1.5, 2.25);
    spriteGeometry.translate(0, 1.0, 0);
    this.sprite = new THREE.Mesh(spriteGeometry, new THREE.MeshBasicMaterial({
      map: this.idle[0], alphaTest: 0.5, side: THREE.DoubleSide,
    }));
    this.sprite.rotation.y = Math.PI / 4;

    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.48, 16),
      new THREE.MeshBasicMaterial({ color: '#111f29', transparent: true, opacity: 0.32, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.scale.set(1.23, 0.90, 1);
    scene.add(this.shadow, this.sprite);
  }

  update(dt: number) {
    const { x, y, z, vx, vz, facing } = this.body;
    const speed = Math.hypot(vx, vz);
    this.time += dt * speed * 3;
    const view = facing.x + facing.z < -0.15 ? 1 : 0;
    const motion = speed > 0.15 && this.body.grounded;
    this.sprite.material.map = motion ? this.frames[view][Math.floor(this.time) % 8] : this.idle[view];
    if (Math.abs(facing.x - facing.z) > 0.1) this.side = Math.sign(facing.x - facing.z);
    this.sprite.scale.x = this.side;
    this.sprite.position.set(x, y + 0.085, z);
    this.shadow.position.set(x, 0.075, z);
    this.shadow.material.opacity = 0.32 / (1 + y);
  }
}
