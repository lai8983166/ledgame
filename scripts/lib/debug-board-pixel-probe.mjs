import assert from 'node:assert/strict';

// Read the rendered raster and DOM, independently of the production geometry helper.
export function probeDebugBoard(element,{columns,rows,black=false}){
  const canvas=element.querySelector('canvas'),box=canvas.getBoundingClientRect();
  const image=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height),data=image.data;
  const rect=node=>{if(!node)return null;const b=node.getBoundingClientRect();return {left:b.left,top:b.top,width:b.width,height:b.height,right:b.right,bottom:b.bottom};};
  const runs=(length,match)=>{const result=[];let start=-1;for(let p=0;p<=length;p++){
    if(p<length&&match(p)){if(start<0)start=p;}else if(start>=0){result.push([start,p]);start=-1;}
  }return result;};
  const xs=[...new Set([0,1,Math.floor(columns/2),columns-1])],ys=[...new Set([0,Math.floor(rows/2),rows-1])];
  const cells={};
  if(black){
    const isBlack=(x,y)=>{const p=(y*image.width+x)*4;return data[p]===0&&data[p+1]===0&&data[p+2]===0&&data[p+3]===255;};
    let horizontal,vertical;
    for(let y=0;y<image.height;y++){const found=runs(image.width,x=>isBlack(x,y));if(found.length===columns){horizontal=found;break;}}
    if(horizontal){const x=Math.floor((horizontal[0][0]+horizontal[0][1])/2);
      const found=runs(image.height,y=>isBlack(x,y));if(found.length===rows)vertical=found;}
    if(!horizontal||!vertical)throw Error('Actual black grid not ready');
    for(const y of ys)for(const x of xs)cells[`${x},${y}`]={minX:horizontal[x][0],maxX:horizontal[x][1],minY:vertical[y][0],maxY:vertical[y][1]};
  }else{
    const targets=new Map();for(const y of ys)for(const x of xs)targets.set(((20+x*4)<<16)|((30+y*4)<<8)|160,`${x},${y}`);
    for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
      const p=(y*image.width+x)*4,key=targets.get((data[p]<<16)|(data[p+1]<<8)|data[p+2]);if(!key||data[p+3]!==255)continue;
      const c=cells[key]||=( {minX:x,maxX:x+1,minY:y,maxY:y+1} );
      c.minX=Math.min(c.minX,x);c.maxX=Math.max(c.maxX,x+1);c.minY=Math.min(c.minY,y);c.maxY=Math.max(c.maxY,y+1);
    }
  }
  for(const c of Object.values(cells)){
    c.left=box.left+c.minX/image.width*box.width;c.right=box.left+c.maxX/image.width*box.width;
    c.top=box.top+c.minY/image.height*box.height;c.bottom=box.top+c.maxY/image.height*box.height;
    c.x=(c.left+c.right)/2;c.y=(c.top+c.bottom)/2;
  }
  return {columns,rows,cells,canvas:rect(canvas),floor:rect(element.querySelector('.debug-light-floor')),
    lights:[...element.querySelectorAll('.debug-symbol-light,.debug-circle-light')].map(node=>{
      const b=node.getBoundingClientRect();return {wall:Number(node.dataset.wall),index:Number(node.dataset.index),x:b.left+b.width/2,y:b.top+b.height/2};
    })};
}

export function assertDebugBoardPixels(probe,{tolerance=1.1,fixedAlignment}={}){
  const {columns,rows,cells,canvas,floor,lights}=probe;
  const first=cells['0,0'],last=cells[`${columns-1},${rows-1}`];assert.ok(first&&last,'Missing edge pixels');
  assert.ok(Math.abs((last.right-last.left)-(last.bottom-last.top))<=tolerance,'Non-square cell');
  assert.ok(Math.abs((first.top-canvas.top)-(canvas.bottom-last.bottom))<=tolerance,'Excess bottom canvas gap');
  if(floor){
    assert.ok(Math.abs(canvas.top-floor.top)<=tolerance&&Math.abs(canvas.bottom-floor.bottom)<=tolerance,'Canvas does not fill floor');
    assert.ok(Math.abs(canvas.left-floor.left)<=tolerance&&Math.abs(canvas.right-floor.right)<=tolerance,'Canvas does not fill floor width');
  }
  let maxError=0;
  for(const light of lights){
    const indices=light.wall%2?[0,Math.floor(rows/2),rows-1]:[0,Math.floor(columns/2),columns-1];
    const index=fixedAlignment?(light.wall%2?fixedAlignment.row:fixedAlignment.column):indices[light.index];
    const target=light.wall%2?cells[`0,${index}`].y:cells[`${index},0`].x;
    const error=Math.abs((light.wall%2?light.y:light.x)-target);maxError=Math.max(maxError,error);
    assert.ok(error<=tolerance,JSON.stringify({light,target,error}));
    assert.ok(light.wall===0?light.y<canvas.top:light.wall===1?light.x>canvas.right:light.wall===2?light.y>canvas.bottom:light.x<canvas.left,'Light entered floor');
  }
  return maxError;
}
