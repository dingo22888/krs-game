import * as THREE from 'three';
import { Boxing, BAG, fistPosition } from './boxing.ts';
import type { Hand } from './boxing.ts';

export class BoxingView {
  readonly boxing:Boxing;
  readonly group=new THREE.Group();
  private bag=new THREE.Group();
  private chain=new THREE.Group();
  private gloves=new THREE.Group();
  private overlay=new THREE.Scene();
  private gloveMeshes:Record<Hand,THREE.Group>;
  private previousPosition=new THREE.Vector3();
  private previousRotation=new THREE.Quaternion();
  private previousChainPosition=new THREE.Vector3();
  private previousChainRotation=new THREE.Quaternion();

  constructor(boxing:Boxing) {
    this.boxing=boxing;
    const leather=new THREE.MeshStandardMaterial({color:'#872f32',roughness:.68});
    const black=new THREE.MeshStandardMaterial({color:'#19252a',roughness:.8});
    const metal=new THREE.MeshStandardMaterial({color:'#8e9898',metalness:.85,roughness:.32});
    const cream=new THREE.MeshStandardMaterial({color:'#e5dcc5',roughness:.65});
    const mesh=(geometry:THREE.BufferGeometry,material:THREE.MeshStandardMaterial,parent:THREE.Object3D,y=0)=>{
      const object=new THREE.Mesh(geometry,material);object.position.y=y;
      object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;
    };
    mesh(new THREE.CylinderGeometry(BAG.radius,BAG.radius,BAG.height,48),leather,this.bag);
    for(const y of [-.50,.50])mesh(new THREE.CylinderGeometry(.264,.264,.105,48),black,this.bag,y);
    // Contrasting seams and the label make off-center rotation visible.
    for(const angle of [Math.PI/2,Math.PI*1.5]) {
      const seam=mesh(new THREE.BoxGeometry(.012,.86,.009),cream,this.bag);
      seam.position.set(Math.sin(angle)*.258,0,Math.cos(angle)*.258);seam.rotation.y=angle;
    }
    const labelCanvas=document.createElement('canvas');labelCanvas.width=256;labelCanvas.height=256;
    const ctx=labelCanvas.getContext('2d')!;
    ctx.fillStyle='#19252a';ctx.fillRect(0,0,256,256);
    ctx.fillStyle='#d4fa72';ctx.textAlign='center';ctx.font='bold 64px sans-serif';ctx.fillText('KRS',128,105);
    ctx.fillStyle='#e5dcc5';ctx.font='20px sans-serif';ctx.fillText('BOXING CLUB',128,146);
    ctx.font='bold 35px sans-serif';ctx.fillText('01',128,204);
    const texture=new THREE.CanvasTexture(labelCanvas);texture.colorSpace=THREE.SRGBColorSpace;
    mesh(new THREE.CylinderGeometry(.262,.262,.31,24,1,true,-.6,1.2),
      new THREE.MeshStandardMaterial({map:texture,roughness:.8}),this.bag,.08);
    // Short straps connect the bag rim to its upper joint.
    for(const x of [-.17,.17]) {
      const strap=mesh(new THREE.BoxGeometry(.035,.14,.035),black,this.bag,.54);
      strap.position.x=x;
    }
    const links=Math.max(3,Math.ceil(boxing.chainLength/.045));
    for(let i=0;i<links;i++) {
      const link=mesh(new THREE.TorusGeometry(.025,.006,6,12),metal,this.chain,
        -boxing.chainLength/2+(i+.5)*boxing.chainLength/links);
      link.scale.y=1.35;link.rotation.y=i%2*Math.PI/2;
    }
    const mount=new THREE.Group();mount.position.copy(boxing.anchor);
    mesh(new THREE.CylinderGeometry(.10,.10,.025,24),metal,mount,.056);
    mesh(new THREE.TorusGeometry(.042,.01,8,16),metal,mount);
    this.group.add(this.bag,this.chain,mount);
    const lamp=new THREE.PointLight('#ffedd0',3,5,2);lamp.position.copy(boxing.anchor).y-=.15;this.group.add(lamp);

    const glove=(hand:Hand)=>{
      const group=new THREE.Group();
      const red=new THREE.MeshStandardMaterial({color:hand==='left'?'#983e3c':'#a84c42',roughness:.6});
      const fist=mesh(new THREE.SphereGeometry(.105,20,16),red,group);fist.scale.set(1,1.12,1.4);
      const cuff=mesh(new THREE.CylinderGeometry(.068,.065,.12,20),black,group,-.04);
      cuff.rotation.x=Math.PI/2;cuff.position.z=.13;
      const thumb=mesh(new THREE.SphereGeometry(.047,12,10),red,group,-.055);
      thumb.position.x=hand==='left'?.072:-.072;thumb.position.z=.025;
      return group;
    };
    this.gloveMeshes={left:glove('left'),right:glove('right')};
    this.gloves.add(...Object.values(this.gloveMeshes));
    this.overlay.add(this.gloves,new THREE.HemisphereLight('#fff2db','#475259',2.6));
    const key=new THREE.DirectionalLight('#ffffff',2);key.position.set(-2,3,1);this.overlay.add(key);
    this.capture();this.update(1);
  }

  capture() {
    this.previousPosition.copy(this.boxing.body.translation());
    this.previousRotation.copy(this.boxing.body.rotation());
    this.previousChainPosition.copy(this.boxing.chain.translation());
    this.previousChainRotation.copy(this.boxing.chain.rotation());
  }

  update(alpha:number) {
    this.bag.position.copy(this.previousPosition).lerp(this.boxing.body.translation(),alpha);
    this.bag.quaternion.copy(this.previousRotation).slerp(new THREE.Quaternion().copy(this.boxing.body.rotation()),alpha);
    this.chain.position.copy(this.previousChainPosition).lerp(this.boxing.chain.translation(),alpha);
    this.chain.quaternion.copy(this.previousChainRotation).slerp(new THREE.Quaternion().copy(this.boxing.chain.rotation()),alpha);
    for(const hand of ['left','right'] as const) {
      this.gloveMeshes[hand].position.copy(fistPosition(hand,this.boxing.ages[hand]));
      this.gloveMeshes[hand].rotation.z=(hand==='left'?1:-1)*.15;
    }
  }

  renderGloves(renderer:THREE.WebGLRenderer,camera:THREE.PerspectiveCamera) {
    this.gloves.position.copy(camera.position);this.gloves.quaternion.copy(camera.quaternion);
    const autoClear=renderer.autoClear;renderer.autoClear=false;
    renderer.clearDepth();renderer.render(this.overlay,camera);renderer.autoClear=autoClear;
  }

  dispose() {
    // The house owns the bag's scene resources; only the overlay is separate.
    const materials=new Set<THREE.Material>();
    this.overlay.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();
      for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});
    materials.forEach(m=>m.dispose());
  }
}
