import * as THREE from 'three';

/** Small repeating material tiles, drawn locally without publishing reference photos. */
export function diningTexture(kind:'wicker'|'wallpaper'|'shade'|'wood') {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const c=canvas.getContext('2d')!;
  c.fillStyle=kind==='wicker'?'#71583e':kind==='wallpaper'?'#484337':kind==='wood'?'#a58a66':'#161413';c.fillRect(0,0,256,256);
  if(kind==='wicker'){
    for(let y=0;y<256;y+=8)for(let x=0;x<256;x+=8){
      const horizontal=(x/8+y/8)%2===0;
      c.fillStyle=horizontal?'#a68a65':'#8b704e';c.fillRect(x+1,y+1,horizontal?7:5,horizontal?5:7);
      c.fillStyle='#bea17b';c.fillRect(x+2,y+1,horizontal?5:1,horizontal?1:5);
    }
  }else if(kind==='wallpaper'){
    for(let row=-1;row<3;row++)for(let col=-1;col<3;col++){
      const x=col*128+(row%2?64:0),y=row*128;
      c.fillStyle=(row+col)%2?'#625b4b':'#3f3c31';c.beginPath();c.ellipse(x+64,y+64,62,64,0,0,Math.PI*2);c.fill();
    }
  }else if(kind==='wood'){
    for(let j=0;j<180;j++){
      const x=j*1.47;c.strokeStyle=j%3?'rgba(68,47,26,.12)':'rgba(239,218,174,.16)';c.lineWidth=.5;
      c.beginPath();c.moveTo(x,0);c.bezierCurveTo(x+4,65,x-4,180,x,256);c.stroke();
    }
    for(let i=1;i<4;i++){c.fillStyle='rgba(48,30,18,.15)';c.fillRect(i*64,0,1,256);}
  }else{
    c.strokeStyle='#b3a58c';c.lineWidth=1.4;
    for(let x=8;x<256;x+=32)for(let y=6;y<256;y+=48){
      c.beginPath();c.moveTo(x+8,y);c.lineTo(x+8,y+4);c.lineTo(x+13,y+9);c.lineTo(x+13,y+31);c.lineTo(x+8,y+36);c.lineTo(x+8,y+40);c.stroke();
      c.beginPath();c.moveTo(x+4,y+4);c.lineTo(x,y+9);c.lineTo(x,y+31);c.lineTo(x+4,y+36);c.stroke();
    }
  }
  const t=new THREE.CanvasTexture(canvas);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;
  if(kind==='shade')t.repeat.set(3,1);if(kind==='wicker')t.repeat.set(5,5);if(kind==='wallpaper')t.repeat.set(1.2,1.2);
  return t;
}
