import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readdir,writeFile} from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {probeDebugBoard,assertDebugBoardPixels} from './lib/debug-board-pixel-probe.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {chromium,expect}=createRequire(path.join(root,'../ledGame-platform/package.json'))('@playwright/test');
const cache=path.join(process.env.LOCALAPPDATA,'ms-playwright');
const chrome=(await readdir(cache)).filter(n=>/^chromium-\d+$/.test(n)).sort().at(-1);
const output=path.join(root,'.build/debug-board-geometry-ui');await mkdir(output,{recursive:true});
const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
const server=await createServer({root,server:{host:'127.0.0.1',port,strictPort:true}});await server.listen();
const browser=await chromium.launch({executablePath:path.join(cache,chrome,'chrome-win64/chrome.exe')}),passed=[],errors=[];
try{
 for(const dpr of [1,1.5,2]){
  const context=await browser.newContext({deviceScaleFactor:dpr,viewport:{width:1366,height:768}});const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>window.appLanguage={get:async()=>'zh-CN',onChanged:()=>()=>{}});
  await page.goto(`http://127.0.0.1:${port}/tests/ui/catalog-library-harness.html`);await page.waitForFunction(()=>window.mountComponent);
  for(const [columns,rows] of [[16,36],[36,16],[8,8],[50,50]]){
   await page.evaluate(({columns,rows})=>{
    const align=[`0,0`,`${Math.floor(rows/2)},${Math.floor(columns/2)}`,`${rows-1},${columns-1}`];
    window.mountComponent('DebugLightBoard',{pixels:Array.from({length:rows},(_,y)=>Array.from({length:columns},(_,x)=>({r:20+x*4,g:30+y*4,b:160}))),
     runtime:{enabled:true,order:1,selectedRow:'0|0',lights:[0,1,2,3].flatMap(wall=>align.map((value,index)=>({wall,index,sequenceIndex:wall*3+index,alignX:Number(value.split(',')[0]),alignY:Number(value.split(',')[1]),phase:'BLUE',remaining:5})))}});
   },{columns,rows});
   for(const viewport of [{width:1366,height:768},{width:1280,height:600},{width:1920,height:1080}]){
    await page.setViewportSize(viewport);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))));
    let probe,maxError;
    await expect.poll(async()=>{try{probe=await page.locator('.debug-light-board').evaluate(probeDebugBoard,{columns,rows});maxError=assertDebugBoardPixels(probe);return true;}catch{return false;}},{timeout:10000}).toBe(true);
    const last=probe.cells[`${columns-1},${rows-1}`];await page.mouse.click(last.x,last.y);
    assert.deepEqual((await page.evaluate(()=>window.componentEvents.filter(e=>e[0]==='cell-click'))).at(-1),['cell-click',columns-1,rows-1]);
    const before=await page.evaluate(()=>window.componentEvents.filter(e=>e[0]==='cell-click').length);
    const first=probe.cells['0,0'],second=probe.cells['1,0'];await page.mouse.click((first.right+second.left)/2,first.y);
    assert.equal(await page.evaluate(()=>window.componentEvents.filter(e=>e[0]==='cell-click').length),before);
    await page.locator('.debug-circle-light[data-wall="3"][data-index="2"]').click();
    assert.deepEqual((await page.evaluate(()=>window.componentEvents.filter(e=>e[0]==='circle-click'))).at(-1),['circle-click',11]);
    assert.equal(await page.evaluate(()=>window.componentEvents.filter(e=>e[0]==='cell-click').length),before);
    passed.push({columns,rows,dpr,...viewport,maxError});
   }
   if(dpr===1&&columns===16)await page.screenshot({path:path.join(output,'实际格子与外围灯对齐.png')});
  }
  await context.close();
 }
 assert.deepEqual(errors,[]);
}finally{await writeFile(path.join(output,'验证记录.json'),JSON.stringify({passed,errors},null,2));await browser.close();await server.close();}
console.log(JSON.stringify({cases:passed.length,maxError:Math.max(...passed.map(p=>p.maxError)),errors}));
