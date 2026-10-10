import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/components/SimpleMatrixCanvas.vue', import.meta.url), 'utf8');
function readFunction(name) {
  return source.slice(source.indexOf(`function ${name}(`)).split(/\nfunction /)[0];
}
function outlineCalls(fn) {
  const calls=[];
  const context={strokeRect:(...rect)=>calls.push({rect,width:context.lineWidth,color:context.strokeStyle})};
  const drawOutline=new Function('context','left','top','size','color','lineWidth','offset',readFunction('drawOutline').match(/\{([\s\S]*)\}/)[1]);
  const draw=new Function('props','drawOutline',`return (${readFunction(fn)})`)({cellSize:20,overlayHighlights:[{x:0,y:0,type:'anchor'}]},drawOutline);
  draw(context,40,60);
  return calls;
}

test('anchor selection uses a single thin stroke touching the RGB fill, never an outer or inner double frame',()=>{
  const calls=outlineCalls('drawAnchorOutline');
  assert.equal(calls.length,1);
  assert.equal(calls[0].width,1.25);
  assert.equal(calls[0].color,'#f7d56f');
  const [x,y,w,h]=calls[0].rect,half=calls[0].width/2;
  assert.deepEqual([x-half,y-half,x+w+half,y+h+half],[40,60,60,80]);
});

test('ordinary selection does not generate a separate automatic anchor highlight',async()=>{
  const editor=await readFile(new URL('../src/views/SimpleGameEditorView.vue',import.meta.url),'utf8');
  assert.match(editor,/const anchorHighlight = anchorEditMode\.value \? createAnchorHighlight\(frame\) : null/);
  assert.doesNotMatch(readFunction('drawAnchorOutline'),/#ff8a5c/);
});

test('selected and hover-object strokes match the thin inset anchor; mouse hover does not thicken selected cells',()=>{
  assert.match(readFunction('drawOverlayHighlights'),/"#f7d56f", 1\.25, -0\.625/);
  assert.match(readFunction('drawOverlayHighlights'),/"#71a7d8", 1\.25, -0\.625/);
  assert.match(readFunction('drawHoverOutline'),/\["selected", "anchor", "merge"\]\.includes\(highlight\.type\)/);
  assert.match(readFunction('drawHoverOutline'),/1\.25, -0\.625/);
});
