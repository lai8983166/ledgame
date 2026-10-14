import assert from 'node:assert/strict';
import test from 'node:test';
import {centerObjectAnchor,getAbsoluteObjectCells} from '../src/lib/simpleObjectMerge.js';

function previousCenter(object) {
  if(Array.isArray(object.points)&&!object.points.length)return {...object,points:[]};
  const cells=getAbsoluteObjectCells(object);
  const x=Math.floor((Math.min(...cells.map(c=>c.x))+Math.max(...cells.map(c=>c.x)))/2);
  const y=Math.floor((Math.min(...cells.map(c=>c.y))+Math.max(...cells.map(c=>c.y)))/2);
  return {...object,x,y,points:cells.map(c=>[c.x-x,c.y-y])};
}
test('optimized centering matches previous representation and never aliases input points',()=>{
  const fixtures=[{x:-10,y:2,points:[]},{points:null},{x:'2.8',y:-3,points:[{x:2,y:3},['-2.1','4'],[null,Infinity]]}];
  for(let i=0;i<1000;i++)fixtures.push({id:String(i),color:i%4,x:i%29-14,y:i%47-23,extra:{flag:true},points:Array.from({length:i%8+1},(_,p)=>[p*3-i%5,p%3-i%7])});
  for(const original of fixtures){
    const before=structuredClone(original),next=centerObjectAnchor(original);
    assert.deepEqual(next,previousCenter(original));assert.deepEqual(original,before);
    assert.notEqual(next,original);assert.notEqual(next.points,original.points);
    assert.deepEqual(centerObjectAnchor(next),next);
  }
});
