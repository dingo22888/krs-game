import * as THREE from 'three';
import type {FloorPlan} from '../data/house.ts';
import {origin} from './building.ts';

/** Suppress unoccluded daylight/fill inside this room, including merged wall meshes.
 * Warm pendant spotlights remain independent. No camera-dependent darkening. */
export function configureBrewLighting(scene:THREE.Scene,plans:FloorPlan[]){
 const plan=plans.find(p=>p.rooms.some(r=>/^braukeller$/i.test(r.name)));
 const room=plan?.rooms.find(r=>/^braukeller$/i.test(r.name));if(!plan||!room)return;
 const [ox,oy,oz]=origin(plan),xs=room.polygon.map(p=>p[0]+ox),zs=room.polygon.map(p=>p[1]+oz);
 const low=new THREE.Vector3(Math.min(...xs)-.12,oy-.10,Math.min(...zs)-.12);
 const high=new THREE.Vector3(Math.max(...xs)+.12,oy+plan.height+.10,Math.max(...zs)+.12);
 const materials=new Set<THREE.MeshStandardMaterial>();
 scene.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof THREE.MeshStandardMaterial)materials.add(m);});
 for(const m of materials){
  m.onBeforeCompile=shader=>{
   shader.uniforms.brewLow={value:low};shader.uniforms.brewHigh={value:high};
   shader.fragmentShader='uniform vec3 brewLow;\nuniform vec3 brewHigh;\n'+shader.fragmentShader;
   let chunk=THREE.ShaderChunk.lights_fragment_begin;
   chunk=chunk.replace('IncidentLight directLight;',`vec3 brewWorld = ((vec4(geometryPosition, 1.0) - viewMatrix[3]) * viewMatrix).xyz;
    vec3 brewEdges = smoothstep(brewLow, brewLow + vec3(.06), brewWorld) * (1.0 - smoothstep(brewHigh - vec3(.06), brewHigh, brewWorld));
    float brewMask = brewEdges.x * brewEdges.y * brewEdges.z;
    IncidentLight directLight;`);
   chunk=chunk.replace('getPointLightInfo( pointLight, geometryPosition, directLight );','getPointLightInfo( pointLight, geometryPosition, directLight ); directLight.color *= mix(1.0, .08, brewMask);');
   chunk=chunk.replace('getDirectionalLightInfo( directionalLight, directLight );','getDirectionalLightInfo( directionalLight, directLight ); directLight.color *= mix(1.0, .04, brewMask);');
   chunk=chunk.replace('getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );','getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal ) * mix(1.0, .10, brewMask);');
   shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',chunk);
  };
  m.customProgramCacheKey=()=> 'brew-local-light-v1';m.needsUpdate=true;
 }
}
