import * as THREE from 'three';
/** Small procedural textures; no household photos are shipped in the bundle. */
export function livingTexture(kind:'rug'|'wall'|'art'){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d')!;
 let seed=19;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 c.fillStyle=kind==='art'?'#e5e7de':kind==='rug'?'#777978':'#777a77';c.fillRect(0,0,256,256);
 for(let i=0;i<(kind==='art'?260:9000);i++){
  c.globalAlpha=kind==='art'?.15+rand()*.35:.12;
  c.fillStyle=kind==='art'?['#102820','#466d4d','#74856a','#131c19','#e4e4d7'][i%5]:i%2?'#fff':'#151817';
  const x=kind==='art'?65+rand()*125:rand()*256,y=rand()*256;
  c.fillRect(x,y,kind==='art'?10+rand()*68:1+rand()*2,kind==='art'?2+rand()*28:1);
 }
 c.globalAlpha=1;const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;return t;
}
