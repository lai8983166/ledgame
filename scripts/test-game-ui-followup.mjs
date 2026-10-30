// Browser interaction regression; only fixture settings and game documents are changed.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=createRequire(path.join(root,'../ledGame-platform/package.json'))('playwright');
const cache=path.join(process.env.LOCALAPPDATA,'ms-playwright'),chrome=(await readdir(cache)).filter(x=>/^chromium-\d+$/.test(x)).sort().at(-1);
const output=path.join(root,'.build/game-ui-followup');await mkdir(output,{recursive:true});
const server=await createServer({root,server:{host:'127.0.0.1',port:0}});await server.listen();
const browser=await chromium.launch({executablePath:path.join(cache,chrome,'chrome-win64/chrome.exe')});
const page=await browser.newPage({viewport:{width:1366,height:900}}),passed=[],errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{
  const settings={entryMethod:'touch',mode:'game',secondaryIdlePromptText:'UPPER',secondaryIdleSubtitleText:'LOWER',touchIdlePromptTexts:{'zh-CN':'开始游戏'}};
  const sprites=['安全块','得分块','陷阱块','Double'].map((name,color)=>({id:color+1,name,color,width:3,height:2,points:[[0,0],[1,1],[2,1]]}));
  const doc={id:1,type:'default',mode:'[1]',name:'fixture',siteSizeWidth:16,siteSizeHeight:36,commonConfig:{},levels:[{label:'A',option:{},frameList:[{repeatTimes:1,matrix:[]}]}]};
  window.fixture={settings,sprites,doc};
  window.appLanguage={get:async()=>'zh-CN',set:async value=>value,onChanged:()=>()=>{}};
  window.appSettings={get:async()=>({...settings}),update:async patch=>Object.assign(settings,patch),onChanged:()=>()=>{}};
  window.spiritLibrary={list:async()=>({data:sprites})};
  window.ledGame={getGameEditor:async()=>({data:structuredClone(doc)}),listGameCategories:async()=>({data:[]}),listGames:async()=>({data:[]}),
    touchGameState:async()=>({data:{engineState:'IDLE'}}),touchPresentationMode:async()=>'game',onEngineState:()=>()=>{},onLedFrame:()=>()=>{},exitTouchFullScreen:async code=>({success:code==='888888'})};
  window.mediaLibrary={getPreviewUrl:async()=>({url:''})};
});
const mount=async(name,props={})=>page.evaluate(([name,props])=>window.mountComponent(name,props),[name,props]);
const button=name=>page.getByRole('button',{name,exact:true});
const check=async(name,fn)=>{await fn();passed.push(name);console.log('通过：'+name);};
try{
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/ui/catalog-library-harness.html`);await page.waitForFunction(()=>window.mountComponent);
  await check('新增精灵颜色只显示色块，仍可选择且保存颜色',async()=>{
    await mount('SpiritPointEditorDialog',{spirit:{name:'测试',width:3,height:2,points:[[0,0]]},creating:true});
    assert.equal((await page.locator('.spirit-editor-colors').innerText()).trim(),'');
    assert.deepEqual(await page.locator('.spirit-editor-colors label').evaluateAll(nodes=>nodes.map(node=>node.title)),['绿色','蓝色','红色','紫色']);
    assert.deepEqual(await page.locator('.spirit-editor-colors input').evaluateAll(nodes=>nodes.map(node=>node.title)),['绿色','蓝色','红色','紫色']);
    await page.locator('.spirit-editor-colors input[value="2"]').check();await button('保存').click();
    assert.equal(await page.evaluate(()=>window.componentEvents.at(-1)[1].color),2);
  });
  await check('精灵颜色复选与尺寸交集、无名称边框、选择反馈及矩阵白边',async()=>{
    await mount('SimpleGameEditorView',{gameId:1});await page.waitForFunction(()=>window.getComponentSetup()?.editorFitReady);
    await page.waitForFunction(()=>window.getComponentSetup()?.filteredEditorSprites?.length===4);
    assert.equal(await page.locator('.sprite-preview-card strong,.sprite-preview-card small').count(),0);
    assert.equal(await page.locator('.sprite-preview-card').first().evaluate(node=>getComputedStyle(node).borderTopWidth),'0px');
    for(const color of [0,1,2,3])await page.locator(`.sprite-color-filters input[value="${color}"]`).uncheck();
    assert.equal(await page.locator('.sprite-preview-card').count(),4);
    await page.locator('.sprite-color-filters input[value="2"]').check();
    await page.locator('.sprite-dimension-search').fill('3 2');assert.equal(await page.locator('.sprite-preview-card').count(),1);
    await page.locator('.sprite-preview-card').click();assert.equal(await page.locator('.sprite-preview-card.active').count(),1);
    await page.locator('.sprite-dimension-search').fill('2 3');assert.equal(await page.locator('.sprite-preview-card').count(),0);
    assert.equal(await page.evaluate(()=>window.getComponentSetup().spriteBrushActive),false);
    const palette=page.locator('.object-action-palette .object-color-button');
    for(const state of ['normal','hover','selected']){
      if(state==='hover')await palette.nth(1).hover();
      if(state==='selected')await palette.nth(1).click();
      for(const item of await palette.all())assert.equal(await item.evaluate(node=>getComputedStyle(node).borderTopWidth),'0px');
    }
    const empty=await page.locator('.matrix-base-canvas').evaluate(canvas=>{
      const s=window.getComponentSetup().matrixCellSizeValue,scale=canvas.width/parseFloat(canvas.style.width),context=canvas.getContext('2d');
      return Array.from({length:4},(_,i)=>[...context.getImageData(Math.round(i*s*scale),Math.round(s/2*scale),1,1).data]);
    });
    assert.ok(empty.every(([r,g,b])=>r===255&&g===255&&b===255),JSON.stringify(empty));
    await page.evaluate(()=>{const s=window.getComponentSetup();s.activeFrame.matrix=[{id:'white-grid',x:1,y:1,color:2,points:[[0,0]]}];});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const occupied=await page.locator('.matrix-base-canvas').evaluate(canvas=>{
      const s=window.getComponentSetup().matrixCellSizeValue,scale=canvas.width/parseFloat(canvas.style.width);
      return [...canvas.getContext('2d').getImageData(Math.round(s*scale),Math.round(s*1.5*scale),1,1).data];
    });
    assert.deepEqual(occupied.slice(0,3),[255,255,255]);
    await page.locator('.sprite-dimension-search').fill('');await page.screenshot({path:path.join(output,'精灵筛选.png')});
  });
  await check('奇偶尺寸对象连续四次旋转回原位，撤销重做与颜色占用规则保留',async()=>{
    for(const [width,height] of [[1,1],[2,3],[3,2],[2,2],[3,3]]){
      await page.evaluate(([w,h])=>window.fixture.doc.levels[0].frameList[0].matrix=[{id:'rotate',x:5,y:8,color:2,points:Array.from({length:w*h},(_,i)=>[i%w,Math.floor(i/w)])}],[width,height]);
      await mount('SimpleGameEditorView',{gameId:1});await page.waitForFunction(()=>window.getComponentSetup()?.editorFitReady);
      await page.evaluate(()=>window.getComponentSetup().selectedObjectId='rotate');
      const read=()=>page.evaluate(()=>JSON.parse(JSON.stringify(window.getComponentSetup().activeFrame.matrix)));
      const before=await read();for(let i=0;i<4;i++)await button('右转90').click();assert.deepEqual(await read(),before,`${width}x${height}`);
      if(width*height>1){await button('撤销 RGB 编辑').click();await button('重做 RGB 编辑').click();assert.deepEqual(await read(),before);}
      else assert.equal(await button('撤销 RGB 编辑').isDisabled(),true,'单点旋转不制造空历史');
    }
    await page.evaluate(()=>{
      const s=window.getComponentSetup();s.activeFrame.matrix=[{id:'rotate',x:5,y:8,color:2,points:[[0,0],[1,0]]},{id:'occupied',x:5,y:9,color:2,points:[[0,0]]}];s.selectedObjectId='rotate';
    });
    const before=await page.evaluate(()=>JSON.stringify(window.getComponentSetup().activeFrame.matrix));await button('右转90').click();
    assert.equal(await page.evaluate(()=>JSON.stringify(window.getComponentSetup().activeFrame.matrix)),before);
  });
  await check('配置密码明文、投币输入条件显示与保存、副屏上下标题独立于Touch',async()=>{
    await mount('ApplicationSettingsView');await page.locator('.application-settings-field select').waitFor();
    const field=text=>page.locator('.application-settings-field').filter({has:page.locator('span').filter({hasText:new RegExp('^'+text+'$')})}).locator('input');
    await field('副屏上标题').fill('上标题');await field('副屏下标题').fill('下标题');
    const password=page.locator('input[maxlength="12"]');assert.equal(await password.getAttribute('type'),'text');await password.fill('12345678');
    assert.equal(await page.locator('input[max="999"]').count(),0);await page.locator('select').selectOption('coin');await page.locator('input[max="999"]').fill('3');await button('保存').click();
    assert.equal(await page.evaluate(()=>window.fixture.settings.coinCount),3);assert.equal(await page.evaluate(()=>window.fixture.settings.touchIdlePromptTexts['zh-CN']),'开始游戏');
    await mount('ApplicationSettingsView');await page.locator('input[max="999"]').waitFor();assert.equal(await page.locator('input[max="999"]').inputValue(),'3');
    await mount('SecondaryDisplayView');await page.locator('.secondary-idle-action .touch-idle-prompt').nth(1).waitFor();
    assert.deepEqual(await page.locator('.touch-idle-title-face').allTextContents(),['上标题','下标题']);await page.screenshot({path:path.join(output,'副屏上下标题.png')});
  });
  await check('Touch选择相同或不同语言自动关闭，退出密码空值显示光标，数字仍遮蔽',async()=>{
    await page.evaluate(()=>window.fixture.settings.entryMethod='touch');await mount('LedGameTouchView');await page.locator('.touch-language-trigger').waitFor();
    for(const language of ['zh-CN','en-US']){
      await page.locator('.touch-language-trigger').click();await page.locator(`.touch-language-dialog input[value="${language}"]`).click();await page.locator('.touch-language-dialog').waitFor({state:'hidden'});
    }
    await page.locator('.touch-exit-edge').dispatchEvent('pointerup',{pointerType:'mouse',button:0});await page.locator('.touch-exit-caret').waitFor();
    assert.equal((await page.locator('.touch-exit-code').innerText()).trim(),'');await page.locator('.touch-exit-grid').getByRole('button',{name:'1',exact:true}).click();
    assert.equal(await page.locator('.touch-exit-caret').count(),0);assert.equal((await page.locator('.touch-exit-code').innerText()).trim(),'•');
    await page.screenshot({path:path.join(output,'Touch退出与语言.png')});
  });
  assert.deepEqual(errors,[]);
}catch(error){await page.screenshot({path:path.join(output,'失败.png')});throw error;}
finally{await writeFile(path.join(output,'验收结果.json'),JSON.stringify({passed,errors},null,2));await browser.close();await server.close();}
