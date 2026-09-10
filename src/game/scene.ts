import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { FloorPlan, Surface } from '../data/house.ts';
import { buildBuilding, addBuildingColliders, origin } from './building.ts';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { decomposePolygon, rectanglePoints, subtractRects } from './geometry.ts';
import type { MaterialKind } from './model.ts';
import type { Point2 } from './geometry.ts';
import { prepareActivities } from './activities.ts';
import { Boxing } from './boxing.ts';
import { BoxingView } from './boxing-view.ts';
import { boxSurfacePositions } from './box-surfaces.ts';

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

export function createHouseScene(plans:FloorPlan[]) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#bed0d8');
  scene.fog = new THREE.Fog('#bed0d8',22,70);
  const world = new RAPIER.World({x:0,y:-18,z:0});
  const prepared=plans.map(prepareActivities);
  plans=prepared.map(p=>p.plan);
  const activity=prepared.find(p=>p.boxing)?.boxing;
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
    interiorDoor:new THREE.MeshStandardMaterial({color:'#faf9f5',roughness:.6}),
    windowFrame:new THREE.MeshStandardMaterial({color:'#202427',roughness:.65}),
    upholstery:new THREE.MeshStandardMaterial({color:'#373a3e',roughness:1}),
    rug:new THREE.MeshStandardMaterial({color:'#b6b0a4',roughness:1}),
    screen:new THREE.MeshStandardMaterial({color:'#101a20',metalness:.25,roughness:.22}),
    hardware:new THREE.MeshStandardMaterial({color:'#101112',metalness:.3,roughness:.5}),
  };
  const model = buildBuilding(plans);
  addBuildingColliders(world,model);
  for (const kind of Object.keys(materials) as MaterialKind[]) {
    const specs = model.boxes.filter(b => b.material === kind);
    if (!specs.length) continue;
    // Transparent panes stay separate for sorting; opaque objects share only
    // their exposed surfaces, including adjoining sofa and cabinet pieces.
    const groups = kind === 'glass' ? specs.map(b => [b]) : [specs];
    for (const group of groups) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(boxSurfacePositions(group), 3));
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry,materials[kind]);
      mesh.castShadow = kind !== 'ceiling' && kind !== 'glass';
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
  }
  const floorMaterials = Object.fromEntries((['wood','tile','concrete'] as const).map(s => [s,new THREE.MeshStandardMaterial({map:floorTexture(s),roughness:.88})])) as Record<Surface,THREE.MeshStandardMaterial>;
  for(const hull of model.hulls)if(hull.visible) {
    const points:THREE.Vector3[]=[];
    for(let i=0;i<hull.vertices.length;i+=3)points.push(new THREE.Vector3(...hull.vertices.slice(i,i+3) as [number,number,number]));
    const mesh=new THREE.Mesh(new ConvexGeometry(points),materials[hull.material]);
    mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);
  }
  for(const plan of plans) {
    const [ox,oy,oz]=origin(plan);
    for(const room of plan.rooms)for(const rect of subtractRects(decomposePolygon(room.polygon),plan.floorHoles??[])) {
      const mesh=horizontalPolygon(rectanglePoints(rect),floorMaterials[room.surface],oy+.002);
      mesh.position.x=ox;mesh.position.z=oz;scene.add(mesh);
    }
    const fill=new THREE.PointLight('#fff0d5',22,14,2);
    fill.position.set(ox+plan.spawn.x,oy+plan.height-.2,oz+plan.spawn.z);scene.add(fill);
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
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(150,150),new THREE.MeshStandardMaterial({color:'#74806d',roughness:1}));
  ground.rotation.x = -Math.PI/2;ground.position.y = Math.min(...plans.map(p=>p.elevation??0))-.22;ground.receiveShadow=true;scene.add(ground);
  // Exterior is a backdrop only; exit doors are closed for this indoor prototype.
  const boxing=activity?new Boxing(world,activity):undefined;
  const boxingView=boxing?new BoxingView(boxing):undefined;
  if(boxingView)scene.add(boxingView.group);
  return {
    scene,world,boxing,boxingView,
    dispose() {
      boxingView?.dispose();
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
