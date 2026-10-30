// Actual Vue interactions with memory fixtures; no daily database or user data.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer as createHttpServer } from 'node:http';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {chromium,expect}=createRequire(path.join(root,'../ledGame-platform/package.json'))('@playwright/test');
const cache=path.join(process.env.LOCALAPPDATA,'ms-playwright');
const chrome=(await readdir(cache)).filter(name=>/^chromium-\d+$/.test(name)).sort().at(-1);
const output=path.join(root,'.build/feedback-effect-media-ui');await mkdir(output,{recursive:true});
const vite=await createServer({root,server:{middlewareMode:true,hmr:false}});
const server=createHttpServer(vite.middlewares);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:path.join(cache,chrome,'chrome-win64/chrome.exe')});
const page=await browser.newPage({viewport:{width:1366,height:768}});const passed=[],errors=[];
page.setDefaultTimeout(15000);
page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{
  const matrix=i=>[{id:'old-'+i,x:i,y:3,color:0,points:[[0,0]]}];
  const game={id:1,name:'特效隔离测试',type:'default',mode:'[1]',siteSizeWidth:8,siteSizeHeight:8,
    levels:[{label:'A',frameList:Array.from({length:5},(_,i)=>({repeatTimes:i+2,matrix:matrix(i)}))}]};
  const spirits=[{id:'safe',name:'安全块',color:0,width:1,height:1,points:[[0,0]]},
    {id:'custom-red',name:'自定义红色',color:2,width:3,height:2,points:[[0,0],[2,1]]},
    {id:'red',name:'陷阱块',color:2,width:1,height:1,points:[[0,0]]},
    {id:'blue',name:'自定义蓝色',color:1,width:3,height:2,points:[[0,0]]}];
  window.fixture={game,spirits,writes:0};
  window.appLanguage={get:async()=>'zh-CN',onChanged:()=>()=>{}};
  window.ledGame={getGameEditor:async()=>({data:structuredClone(game)}),listGameCategories:async()=>({data:[]}),saveGameEditor:async()=>{window.fixture.writes++;throw Error('Unexpected write');}};
  window.spiritLibrary={list:async()=>({data:structuredClone(spirits)})};
  const svg=(w,h)=>'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#438abb"/></svg>`);
  const files=[['wide.svg','image',svg(800,200)],['tall.svg','image',svg(200,800)],['audio.wav','audio','data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=']];
  window.mediaLibrary={list:async()=>({items:files.map(([name,mediaType])=>({kind:'file',name,relativePath:name,mediaType,previewable:true}))}),
    getPreviewUrl:async name=>{const item=files.find(item=>item[0]===name);return{mediaType:item[1],url:item[2]};}};
});
const mount=(name,props={},shell=false)=>page.evaluate(([name,props,shell])=>window.mountComponent(name,props,{applicationShell:shell}),[name,props,shell]);
const button=name=>page.getByRole('button',{name,exact:true});
const check=async(name,fn)=>{await fn();passed.push(name);console.log('PASS '+name);};
try{
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/ui/catalog-library-harness.html`);await page.waitForFunction(()=>window.mountComponent);
  await mount('SimpleGameEditorView',{gameId:1});await page.waitForFunction(()=>window.getComponentSetup()?.editorFitReady);
  await check('颜色选中显示全库自定义精灵，多色和尺寸相交，无筛选仍为常用列表',async()=>{
    await expect(page.locator('.sprite-preview-card')).toHaveCount(2);
    await page.locator('.sprite-color-filters input[value="2"]').check();await expect(page.locator('.sprite-preview-card')).toHaveCount(2);
    await expect(button('自定义红色')).toHaveCount(1);await page.locator('.sprite-color-filters input[value="1"]').check();
    await expect(page.locator('.sprite-preview-card')).toHaveCount(3);await page.locator('.sprite-dimension-search').fill('3 2');
    await expect(page.locator('.sprite-preview-card')).toHaveCount(2);await page.locator('.sprite-color-filters input[value="2"]').uncheck();
    await expect(button('自定义红色')).toHaveCount(0);await expect(button('自定义蓝色')).toHaveCount(1);
    await page.locator('.sprite-dimension-search').fill('');await page.locator('.sprite-color-filters input[value="1"]').uncheck();
    await expect(page.locator('.sprite-preview-card')).toHaveCount(2);
  });
  await check('特效覆盖实际预览、步长增减1、取消不写入',async()=>{
    await page.evaluate(()=>window.getComponentSetup().selectFrame(1));
    await button('特效').click();const dialog=page.locator('.game-effect-dialog');await dialog.waitFor();
    await dialog.locator('select').first().selectOption('overwrite');
    const step=dialog.locator('label').filter({has:page.locator('span').filter({hasText:/^步长$/})}).locator('input');
    await expect(step).toHaveValue('1');await step.press('ArrowUp');await expect(step).toHaveValue('2');await step.press('ArrowDown');await expect(step).toHaveValue('1');
    const endX=dialog.locator('label').filter({has:page.locator('span').filter({hasText:/^终点 X/})}).locator('input');await endX.fill('3');
    await dialog.getByRole('button',{name:'取消',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.getComponentSetup().activeLevel.frameList.length),5);
    assert.equal(await page.evaluate(()=>window.fixture.writes),0);
  });
  await check('特效覆盖完整原帧，保留前后帧，末尾溢出补帧',async()=>{
    const apply=async()=>{await button('特效').click();const dialog=page.locator('.game-effect-dialog');await dialog.locator('select').first().selectOption('overwrite');
      await dialog.locator('label').filter({has:page.locator('span').filter({hasText:/^终点 X/})}).locator('input').fill('3');
      await dialog.locator('.game-effect-actions .primary').click();await dialog.waitFor({state:'hidden'});};
    await apply();let frames=await page.evaluate(()=>window.getComponentSetup().activeLevel.frameList);
    assert.equal(frames.length,5);assert.equal(frames[0].matrix[0].id,'old-0');assert.equal(frames[4].matrix[0].id,'old-4');
    assert.deepEqual(frames.slice(1,4).map(frame=>frame.matrix.map(object=>[object.x,object.y])),[[[0,0]],[[1,0]],[[2,0]]]);
    await page.evaluate(()=>window.getComponentSetup().selectFrame(4));await apply();frames=await page.evaluate(()=>window.getComponentSetup().activeLevel.frameList);
    assert.equal(frames.length,7);assert.deepEqual(frames.slice(4).map(frame=>frame.matrix[0].x),[0,1,2]);
    assert.equal(await page.evaluate(()=>window.fixture.writes),0);
  });
  await mount('MediaLibraryView',{},true);
  for(const size of [{width:1024,height:600},{width:1366,height:768},{width:1920,height:1080},{width:800,height:600}])await check(`${size.width}×${size.height} 图片和音频等比适配、不横向裁切`,async()=>{
    await page.setViewportSize(size);
    for(const name of ['wide.svg','tall.svg']){
      await button('IMG '+name).click();const image=page.locator('.media-preview-stage img');await expect.poll(()=>image.evaluate(node=>node.naturalWidth)).toBeGreaterThan(0);
      await page.locator('.media-preview-stage').scrollIntoViewIfNeeded();const info=await image.evaluate(node=>{const stage=node.parentElement.getBoundingClientRect(),rect=node.getBoundingClientRect();return{stage:{x:stage.x,y:stage.y,width:stage.width,height:stage.height},rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},fit:getComputedStyle(node).objectFit};});
      assert.ok(Math.abs(info.stage.width/info.stage.height-1)<.02,JSON.stringify(info));assert.equal(info.fit,'contain');
      assert.ok(info.stage.x>=0&&info.stage.x+info.stage.width<=size.width+1,JSON.stringify(info));assert.ok(info.stage.y>=0&&info.stage.y+info.stage.height<=size.height+1,JSON.stringify(info));
      if(size.width===1024)await page.screenshot({path:path.join(output,`图片-${name}.png`)});
    }
    await button('AUD audio.wav').click();await expect(page.locator('.media-preview-stage.audio')).toHaveCount(1);await page.locator('.media-preview-stage.audio').scrollIntoViewIfNeeded();
    await expect.poll(()=>page.locator('.media-preview-stage.audio').evaluate(node=>Math.abs(node.getBoundingClientRect().width/990-Number(getComputedStyle(node).getPropertyValue('--media-preview-scale'))))).toBeLessThan(.01);
    const audio=await page.locator('.media-preview-stage.audio').evaluate(node=>{const rect=n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};};return{stage:rect(node),player:rect(node.querySelector('.media-audio-player')),audio:rect(node.querySelector('audio'))};});
    assert.ok(Math.abs(audio.stage.width/audio.stage.height-5.5)<.02,JSON.stringify(audio));
    for(const child of [audio.player,audio.audio])assert.ok(child.x>=audio.stage.x-1&&child.y>=audio.stage.y-1&&child.x+child.width<=audio.stage.x+audio.stage.width+1&&child.y+child.height<=audio.stage.y+audio.stage.height+1,JSON.stringify(audio));
    await page.screenshot({path:path.join(output,`音频-${size.width}.png`)});
  });
  assert.deepEqual(errors,[]);await writeFile(path.join(output,'验证记录.json'),JSON.stringify({passed,errors},null,2));
}catch(error){await page.screenshot({path:path.join(output,'失败.png')});throw error;}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await vite.close();}
