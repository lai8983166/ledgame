import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=createRequire(path.join(root,'../ledGame-platform/package.json'))('playwright');
const reference=path.join(root,'../Grid-Vue-Component-Library-Style/src/styles');
const referenceCss=(await readFile(path.join(reference,'tokens.css'),'utf8'))+(await readFile(path.join(reference,'base.css'),'utf8')).replace(/@import[^;]+;/g,'');
const gameCss=(await readFile(path.join(root,'src/styles/cyber-neon-tokens.css'),'utf8'))+(await readFile(path.join(root,'src/style.css'),'utf8')).replace(/@import[^;]+;/g,'');
const cache=path.join(process.env.LOCALAPPDATA,'ms-playwright'),chrome=(await readdir(cache)).filter(x=>/^chromium-\d+$/.test(x)).sort().at(-1);
const browser=await chromium.launch({executablePath:path.join(cache,chrome,'chrome-win64/chrome.exe')});
const output=path.join(root,'.build/main-background');await mkdir(output,{recursive:true});
const passed=[];
const fixture=`<div class="fixture-content"><button id="action">test</button><input id="entry" /><img id="asset" width="100" height="100" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Cpath fill='%23ff0000' d='M0 0h100v100H0z'/%3E%3C/svg%3E"/><canvas id="matrix" width="100" height="100"></canvas></div>`;
const fixtureCss='.fixture-content{position:fixed;left:48px;top:48px;z-index:2;display:flex;gap:16px;align-items:start;width:500px;height:150px}#action,#entry{width:100px;height:40px;flex:none}#asset,#matrix{display:block;flex:none;width:100px;height:100px}';
async function paint(page,css,kind){
  await page.setContent(`<style>${css}\n${fixtureCss}</style><main class="${kind}">${fixture}</main>`);
  await page.locator('#asset').evaluate(image=>image.decode());
  await page.locator('#matrix').evaluate(canvas=>{const c=canvas.getContext('2d');c.fillStyle='#00ff00';c.fillRect(0,0,100,100);});
}
async function comparePixels(page,a,b){
  return page.evaluate(async sources=>{
    const data=[];
    for(const base64 of sources){
      const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
      const context=canvas.getContext('2d');context.drawImage(image,0,0);
      data.push(context.getImageData(0,0,canvas.width,canvas.height).data);
    }
    if(data[0].length!==data[1].length)return{dimensions:data.map(x=>x.length)};
    let differences=0,maxDifference=0;
    for(let i=0;i<data[0].length;i++)if(data[0][i]!==data[1][i]){differences++;maxDifference=Math.max(maxDifference,Math.abs(data[0][i]-data[1][i]));}
    return{differences,maxDifference,channels:data[0].length};
  },[a.toString('base64'),b.toString('base64')]);
}
try{
  for(const [width,height,dpr] of [[1280,720,1],[1920,1080,1],[1280,720,1.25]]){
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr}),page=await context.newPage();
    await paint(page,referenceCss,'demo-page');
    const referenceLayers=await page.evaluate(()=>['::before','::after'].map(p=>{const s=getComputedStyle(document.body,p);return[s.backgroundImage,s.backgroundSize,s.maskImage,s.pointerEvents];}));
    const asset=await page.locator('#asset').screenshot(),matrix=await page.locator('#matrix').screenshot();
    const clips=[{x:0,y:height-160,width:width,height:150},{x:0,y:200,width:250,height:200}];
    const referenceStrips=await Promise.all(clips.map(clip=>page.screenshot({clip})));
    await page.screenshot({path:path.join(output,`reference-${width}-${dpr}.png`)});
    await paint(page,gameCss,'app-shell');
    await page.screenshot({path:path.join(output,`game-${width}-${dpr}.png`)});
    const actual=await page.locator('.app-shell').evaluate(shell=>({
      color:getComputedStyle(shell).backgroundColor,image:getComputedStyle(shell).backgroundImage,
      layers:['::before','::after'].map(p=>{const s=getComputedStyle(shell,p);return[s.backgroundImage,s.backgroundSize,s.maskImage,s.pointerEvents];}),
      z:['::before','::after'].map(p=>getComputedStyle(shell,p).zIndex),isolation:getComputedStyle(shell).isolation,
    }));
    assert.equal(actual.color,'rgb(10, 1, 24)');assert.equal(actual.image,'none','主背景不再有自定义光晕');
    assert.deepEqual(actual.layers,referenceLayers,'两层装饰参数与参考一致');assert.deepEqual(actual.z,['-1','-1']);assert.equal(actual.isolation,'isolate');
    for(let i=0;i<clips.length;i++){
      const currentStrip=await page.screenshot({clip:clips[i]});
      // Two translucent layers in an isolated stack may round channels by two levels.
      const comparison=await comparePixels(page,currentStrip,referenceStrips[i]);
      assert.ok(comparison.maxDifference<=2&&comparison.differences/comparison.channels<0.02,`参考背景像素对比：${width}/${dpr}/${i} ${JSON.stringify(comparison)}`);
    }
    assert.equal((await comparePixels(page,await page.locator('#asset').screenshot(),asset)).maxDifference,0,'图片不被装饰覆盖');
    assert.equal((await comparePixels(page,await page.locator('#matrix').screenshot(),matrix)).maxDifference,0,'矩阵不被装饰覆盖');
    await page.locator('#action').evaluate(button=>button.onclick=()=>button.dataset.clicked='yes');await page.locator('#action').click();assert.equal(await page.locator('#action').getAttribute('data-clicked'),'yes');
    await page.locator('#entry').fill('可输入');assert.equal(await page.locator('#entry').inputValue(),'可输入');
    await page.screenshot({path:path.join(output,`game-${width}-${dpr}.png`)});
    for(const kind of ['touch-shell','secondary-shell','debug-shell']){
      await paint(page,gameCss,kind);
      assert.equal(await page.locator('main').evaluate(node=>getComputedStyle(node,'::before').content),'none');
      assert.equal(await page.locator('main').evaluate(node=>getComputedStyle(node,'::after').content),'none');
      assert.equal(await page.evaluate(()=>getComputedStyle(document.body,'::before').content),'none');
    }
    passed.push(`${width}×${height} / DPR ${dpr}：参考背景像素、资源、点击输入及窗口隔离`);await context.close();
  }
  console.log(passed.join('\n'));
}finally{await writeFile(path.join(output,'验收结果.json'),JSON.stringify({passed},null,2));await browser.close();}
