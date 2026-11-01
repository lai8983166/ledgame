import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readdir,writeFile} from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {chromium,expect}=createRequire(path.join(root,'../ledGame-platform/package.json'))('@playwright/test');
const cache=path.join(process.env.LOCALAPPDATA,'ms-playwright');
const chrome=(await readdir(cache)).filter(name=>/^chromium-\d+$/.test(name)).sort().at(-1);
const output=path.join(root,'.build/pixel-light-alignment-ui');await mkdir(output,{recursive:true});
const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));
const port=socket.address().port;await new Promise(r=>socket.close(r));
const server=await createServer({root,server:{host:'127.0.0.1',port,strictPort:true}});await server.listen();
const browser=await chromium.launch({executablePath:path.join(cache,chrome,'chrome-win64/chrome.exe')});
const page=await browser.newPage({viewport:{width:1366,height:768}}),passed=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{window.appLanguage={get:async()=>'zh-CN',onChanged:()=>()=>{}};});
const button=name=>page.getByRole('button',{name,exact:true});
const fields=()=>page.locator('.pixel-layout-align-field input');
const geometry=()=>page.locator('.pixel-layout-preview').evaluate(svg=>{
  const number=(node,key)=>Number(node.getAttribute(key));
  const floor=svg.querySelector('.pixel-layout-floor-grid rect');
  return {floor:{x:number(floor,'x'),y:number(floor,'y'),width:number(floor,'width'),height:number(floor,'height')},
    lights:[...svg.querySelectorAll(':scope > g:has(> circle)')].map(g=>{
      const square=g.querySelector('rect'),circle=g.querySelector('circle');
      return {symbol:{x:number(square,'x')+number(square,'width')/2,y:number(square,'y')+number(square,'height')/2},
        circle:{x:number(circle,'cx'),y:number(circle,'cy')}};
    })};
});
async function fill(values){for(let i=0;i<4;i++)await fields().nth(i).fill(values[i]);await button('绘制').click();}
try{
  await page.goto(`http://127.0.0.1:${port}/tests/ui/catalog-library-harness.html`);
  await page.waitForFunction(()=>window.mountComponent);
  await page.evaluate(()=>window.mountComponent('PixelLightLayoutDialog',{gridWidth:16,gridHeight:36,
    layout:{selectedRow:'0|0',form:{open:1,topWallPixelLightNum:1,rightWallPixelLightNum:1,bottomWallPixelLightNum:1,leftWallPixelLightNum:1}}}));
  const original=await geometry();assert.equal(original.lights.length,4);
  await fill(['35,15','35,15','35,15','35,15']);
  await expect(page.locator('.pixel-layout-row-error')).toHaveCount(0);
  const aligned=await geometry(),size=aligned.floor.width/16;
  for(let wall=0;wall<4;wall++)for(const marker of ['symbol','circle']){
    const light=aligned.lights[wall][marker],before=original.lights[wall][marker];
    if(wall%2===0){
      assert.ok(Math.abs(light.x-(aligned.floor.x+15.5*size))<0.001);
      assert.equal(light.y,before.y);
      assert.ok(wall===0?light.y<aligned.floor.y:light.y>aligned.floor.y+aligned.floor.height);
    }else{
      assert.ok(Math.abs(light.y-(aligned.floor.y+35.5*size))<0.001);
      assert.equal(light.x,before.x);
      assert.ok(wall===3?light.x<aligned.floor.x:light.x>aligned.floor.x+aligned.floor.width);
    }
  }
  passed.push('四面墙仅沿对应行或列对齐，符号灯和圆灯保持外围位置及配对间距');
  await fill(['2,15','35,2','2,15','35,2']);assert.deepEqual(await geometry(),aligned);
  assert.equal(await page.evaluate(()=>window.componentEvents.filter(e=>e[0]==='save').length),0);
  passed.push('上下改变x、左右改变y均不移动灯对，绘制不保存');
  await fields().nth(0).fill('36,15');await button('保存').click();
  await expect(page.locator('.pixel-layout-row-error').first()).toContainText('x<36');
  assert.equal(await page.evaluate(()=>window.componentEvents.filter(e=>e[0]==='save').length),0);
  await fields().nth(0).fill('35,16');await button('绘制').click();
  await expect(page.locator('.pixel-layout-row-error').first()).toContainText('y<16');
  assert.deepEqual(await geometry(),aligned);
  passed.push('16×36非正方形场地按行列校验，越界拒绝绘制和保存且不破坏预览');
  await fill(['3,8','12,5','3,8','12,5']);
  await page.screenshot({path:path.join(output,'四面墙单轴对齐.png')});
  await button('保存').click();
  const saved=await page.evaluate(()=>window.componentEvents.find(e=>e[0]==='save')[1]);
  assert.deepEqual(saved.rows.map(row=>row.align),['3,8','12,5','3,8','12,5']);
  await page.evaluate(layout=>window.mountComponent('PixelLightLayoutDialog',{layout,gridWidth:16,gridHeight:36}),saved);
  await button('绘制').click();
  await expect(fields().nth(0)).toHaveValue('3,8');
  await fields().nth(0).fill('1,1');await button('取消').click();
  assert.equal(await page.evaluate(()=>window.componentEvents.filter(e=>e[0]==='save').length),0);
  passed.push('保存仍使用原align字符串，重开保留，取消不提交');
  assert.deepEqual(errors,[]);
}finally{await writeFile(path.join(output,'验证记录.json'),JSON.stringify({passed,errors},null,2));await browser.close();await server.close();}
console.log(JSON.stringify({passed,errors},null,2));
