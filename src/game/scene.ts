import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { FloorPlan, Surface } from '../data/house.ts';
import { buildModel } from './model.ts';
import type { MaterialKind } from './model.ts';
import type { Point2 } from './geometry.ts';

function floorTexture(surface:Surface) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = surface === 'wood' ? '#997a57' : surface === 'tile' ? '#969da0' : '#888d8e';
  ctx.fillRect(0,0,256,256);
  if (surface === 'wood') {
    for (let i=0;i<8;i++) {
      ctx.fillStyle = i%3 === 0 ? '#a88c69' : i%3 === 1 ? '#a18561' : '#967653';
      ctx.fillRect(i*32,0,31,256);
      ctx.fillStyle = '#735c42';
      ctx.fillRect(i*32,(i%3)*76,32,1);
      ctx.fillStyle = '#b09371';
      for (let j=0;j<7;j++) ctx.fillRect(i*32+3+j*4,12+j*19,1,70);
    }
  } else if (surface === 'tile') {
    ctx.strokeStyle = '#717b7e'; ctx.lineWidth = 1.5;
    ctx.strokeRect(.75,.75,254.5,254.5);
    ctx.beginPath(); ctx.moveTo(128,0); ctx.lineTo(128,256); ctx.moveTo(0,128); ctx.lineTo(256,128);ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.repeat.set(surface === 'wood' ? .5 : 1,surface === 'wood' ? .5 : 1);
  return texture;
}

function horizontalPolygon(points:Point2[], material:THREE.Material, y:number) {
  const shape = new THREE.Shape(points.map(([x,z]) => new THREE.Vector2(x,-z)));
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape),material);
  mesh.rotation.x = -Math.PI/2;
  mesh.position.y = y;
  mesh.receiveShadow = true;
  return mesh;
}

export function createHouseScene(plan:FloorPlan) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#bed0d8');
  scene.fog = new THREE.Fog('#bed0d8',22,70);
  const world = new RAPIER.World({x:0,y:-18,z:0});
  const materials:Record<MaterialKind,THREE.MeshStandardMaterial> = {
    wall:new THREE.MeshStandardMaterial({color:'#e2e4dd',roughness:.91}),
    ceiling:new THREE.MeshStandardMaterial({color:'#f4f4ea',roughness:1}),
    floor:new THREE.MeshStandardMaterial({color:'#a7aaa8',roughness:.82}),
    wood:new THREE.MeshStandardMaterial({color:'#977049',roughness:.68}),
    fabric:new THREE.MeshStandardMaterial({color:'#41565b',roughness:1}),
    metal:new THREE.MeshStandardMaterial({color:'#283238',metalness:.55,roughness:.4}),
    glass:new THREE.MeshStandardMaterial({color:'#9dcbd6',transparent:true,opacity:.3,roughness:.25,metalness:.12}),
    cabinet:new THREE.MeshStandardMaterial({color:'#edece4',roughness:.66}),
    door:new THREE.MeshStandardMaterial({color:'#526168',roughness:.78}),
  };
  const unit = new THREE.BoxGeometry(1,1,1);
  const specs = buildModel(plan);
  for (const spec of specs) {
    const mesh = new THREE.Mesh(unit,materials[spec.material]);
    mesh.position.set(...spec.position);
    mesh.scale.set(...spec.size);
    mesh.castShadow = spec.material !== 'ceiling' && spec.material !== 'glass';
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (spec.collision) world.createCollider(RAPIER.ColliderDesc.cuboid(...spec.size.map(s=>s/2) as [number,number,number]).setTranslation(...spec.position));
  }
  const floorMaterials = Object.fromEntries((['wood','tile','concrete'] as const).map(s => [s,new THREE.MeshStandardMaterial({map:floorTexture(s),roughness:.88})])) as Record<Surface,THREE.MeshStandardMaterial>;
  for (const room of plan.rooms) scene.add(horizontalPolygon(room.polygon,floorMaterials[room.surface],.002));
  const stairMaterial = new THREE.MeshStandardMaterial({color:'#525e62',roughness:.9});
  for (const [x0,z0,x1,z1] of plan.stairZones) {
    scene.add(horizontalPolygon([[x0,z0],[x1,z0],[x1,z1],[x0,z1]],stairMaterial,.005));
    const positions:number[] = [];
    for (let z=z0;z<z1;z+=.25) positions.push(x0,.007,z,x1,.007,z);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    scene.add(new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:'#a9b0aa'})));
  }
  scene.add(new THREE.HemisphereLight('#e6f4ff','#a2977c',2.0));
  const sunlight = new THREE.DirectionalLight('#fff2db',2.7);
  sunlight.position.set(-3,8,2);
  sunlight.target.position.set(4,0,5);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048,2048);
  Object.assign(sunlight.shadow.camera,{left:-12,right:12,top:12,bottom:-12,near:.1,far:30});
  sunlight.shadow.bias = -.00025;
  sunlight.shadow.normalBias = .025;
  scene.add(sunlight,sunlight.target);
  const fill = new THREE.PointLight('#fff0d5',18,12,2);
  fill.position.set(plan.id === 'dg' ? 2 : 4.9,plan.height-.18,5.7);
  scene.add(fill);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(150,150),new THREE.MeshStandardMaterial({color:'#74806d',roughness:1}));
  ground.rotation.x = -Math.PI/2;ground.position.y = -.2;ground.receiveShadow=true;scene.add(ground);
  // Exterior is a backdrop only; exit doors are closed for this indoor prototype.
  return {
    scene,world,
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>();
      const mats = new Set<THREE.Material>();
      scene.traverse(object => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
          geometries.add(object.geometry);
          for (const mat of Array.isArray(object.material) ? object.material : [object.material]) mats.add(mat);
        }
      });
      geometries.forEach(g=>g.dispose());
      mats.forEach(m=>{ if (m instanceof THREE.MeshStandardMaterial) m.map?.dispose();m.dispose(); });
      sunlight.shadow.map?.dispose();
      world.free();
    },
  };
}
