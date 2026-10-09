import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Uses the existing workspace Playwright installation, not a product dependency.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.resolve(root, '../ledGame-platform/package.json'));
const { chromium } = require('playwright');
const cache = path.join(process.env.LOCALAPPDATA, 'ms-playwright');
const chromeDir = (await readdir(cache)).filter(name => /^chromium-\d+$/.test(name)).sort().at(-1);
const output = path.join(root, '.build/catalog-library-ui');
await mkdir(output, { recursive:true });
const server = await createServer({root, server:{host:'127.0.0.1',port:0}});
await server.listen();
const url = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({executablePath:path.join(cache,chromeDir,'chrome-win64/chrome.exe')});
const context = await browser.newContext({viewport:{width:1366,height:768}});
await context.addInitScript(() => {
  const persist = (key, initial) => JSON.parse(localStorage.getItem(key) || JSON.stringify(initial));
  const save = (key, data) => localStorage.setItem(key, JSON.stringify(data));
  window.uiTest = {failOrder:false,failLanguage:false,orderDelay:0,orders:[],created:[],entered:0};
  window.dragEvents = [];
  for (const name of ['dragstart','dragover','drop','dragend']) document.addEventListener(name, event => { window.dragEvents.push([name,event.target.className]); if(window.dragEvents.length>30)window.dragEvents.shift(); },true);
  let categories = persist('ui.categories', [1,2,3,4].map((id,index)=>({id,name:id===4?'适合多人合作挑战的长名称游戏分类展示测试':`Category ${id}`,cover:'',displayOrder:index})));
  let games = persist('ui.games', [1,9,2,8,5,6].map((id,index)=>({id,name:id===9?'simple-demo':`Game ${id}`,type:id===8?'rank':'default',firstCatalog:id===1||id===2?'1':'2',displayOrder:index,childModeVisible:true})));
  let spirits = persist('ui.spirits',[0,1,2,3,99].map(color=>({id:`s${color}`,name:`Color ${color}`,color,width:2,height:2,points:'[[0,0]]',basic:color===0})));
  const idleState = {data:{engineState:'STOPPED',runtimeMode:'SIMULATION',running:false}};
  window.appLanguage = {get:async()=>localStorage.getItem('ui.locale')||'zh-CN',set:async value=>{if(window.uiTest.failLanguage)throw new Error('UI language save failed');localStorage.setItem('ui.locale',value);return value;},onChanged:()=>()=>{}};
  window.ledGame = {
    state:async()=>idleState, seedSimpleVariants:async()=>{},seedRankType1:async()=>{},
    listManageableGames:async()=>({data:structuredClone(games)}),listPlayableGames:async()=>({data:structuredClone(games)}),listGameCategories:async()=>({data:structuredClone(categories)}),
    onEngineState:()=>()=>{},enterGameFlow:async()=>{window.uiTest.entered++;return idleState;},
    reorderGameCategories:async ids=>{window.uiTest.orders.push(['categories',ids]);await new Promise(resolve=>setTimeout(resolve,window.uiTest.orderDelay));if(window.uiTest.failOrder)throw new Error('UI order save failed');categories=ids.map((id,displayOrder)=>({...categories.find(item=>item.id===id),displayOrder}));save('ui.categories',categories);return {data:categories};},
    reorderGames:async ids=>{window.uiTest.orders.push(['games',ids]);if(window.uiTest.failOrder)throw new Error('UI order save failed');games=ids.map((id,displayOrder)=>({...games.find(item=>item.id===id),displayOrder}));save('ui.games',games);return {data:games};},
    updateGameCategory:async(id,payload)=>{categories=categories.map(item=>item.id===id?{...item,...payload}:item);save('ui.categories',categories);return {data:categories.find(item=>item.id===id)};},
    createGameCategory:async payload=>{const item={id:Date.now(),displayOrder:categories.length,...payload};categories.push(item);save('ui.categories',categories);return {data:item};},
    updateGameMetadata:async(id,payload)=>{games=games.map(item=>item.id===id?{...item,...payload}:item);save('ui.games',games);return {data:true};},
    getRankGameEditor:async()=>({data:{id:8,name:'Rank Draft',siteSizeWidth:16,siteSizeHeight:36,minPlayers:1,maxPlayers:4,levels:[{id:81,type:1,bounds:{minX:0,maxX:15,minY:0,maxY:35},gameTime:30}],audio:{scoreSound:'A/music.mp3'},gif:{standby:'A/B/same.png'}}}),
  };
  window.appSettings = {get:async()=>({applicationTitle:'LED Game',entryMethod:'touch',mode:'debug',memberPlatformHost:'127.0.0.1',memberPlatformPort:8090,secondaryDisplayBackgroundPath:'old.png',secondaryIdleMediaPath:'old.mp4'}),getIconData:async()=>({}),onChanged:()=>()=>{},chooseIcon:async()=>({canceled:true}),chooseSecondaryBackground:async()=>({canceled:true}),chooseSecondaryIdleMedia:async()=>({canceled:true})};
  window.secondaryDisplay = {list:async()=>({displays:[],selectedAvailable:false}),onChanged:()=>()=>{}};
  window.spiritLibrary = {list:async()=>({data:structuredClone(spirits)}),create:async payload=>{const spirit={...payload,id:`new-${payload.color}`,points:JSON.stringify(payload.points),basic:false};spirits.push(spirit);window.uiTest.created.push(payload);save('ui.spirits',spirits);return {data:spirit};},update:async(id,payload)=>{spirits=spirits.map(item=>item.id===id?{...item,...payload,points:JSON.stringify(payload.points)}:item);save('ui.spirits',spirits);return{data:spirits.find(item=>item.id===id)};}};
  const file = (relativePath,mediaType='image')=>({kind:'file',relativePath,name:relativePath.split('/').pop(),mediaType,previewable:true});
  window.mediaLibrary = {list:async()=>({exists:true,items:[{kind:'directory',relativePath:'A',name:'A',children:[{kind:'directory',relativePath:'A/B',name:'B',children:[file('A/B/same.png')]},file('A/music.mp3','audio')]},{kind:'directory',relativePath:'C',name:'C',children:[file('C/same.png')]},file('wide.png'),file('tall.png'),file('pixel.png')]}),getPreviewUrl:async relativePath=>{await new Promise(resolve=>setTimeout(resolve,relativePath.startsWith('A/')?150:5));const [w,h]=relativePath==='tall.png'?[16,36]:relativePath==='pixel.png'?[8,8]:[36,16];return{mediaType:relativePath.endsWith('.mp3')?'audio':'image',url:`data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><title>${relativePath}</title><rect width="100%" height="100%" fill="lime"/></svg>`)}`};}};
});
const page = await context.newPage();
const errors = []; page.on('pageerror', error=>errors.push(error.message));
const results=[];
async function check(name, fn) { await fn(); results.push(name); console.log(`PASS ${name}`); }
async function gameSection(section) {await page.getByTestId('game-menu-button').click(); await page.getByRole('menuitem',{name:section,exact:true}).click();}
const cardIds=selector=>page.locator(selector).evaluateAll(nodes=>nodes.map(node=>Number(node.dataset.id)));
async function drag(source,target) {
  await source.hover(); await page.waitForTimeout(300);
  const from = await source.boundingBox(), to = await target.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 - 12, from.y + from.height / 2 + 12, {steps:4});
  await page.mouse.move(to.x + to.width / 2, to.y + Math.min(to.height / 2, 80), {steps:20});
  await page.mouse.move(to.x + to.width / 2, to.y + Math.min(to.height / 2, 80) + 2);
  await page.mouse.up();
}
try {
  await page.goto(url); await page.locator('.game-category-card').first().waitFor();
  await check('固定游戏导航、菜单取消及进入游戏位置', async()=>{
    assert.match(await page.getByTestId('game-menu-button').innerText(),/^游戏\s*▾$/);
    await page.getByTestId('game-menu-button').click();assert.equal(await page.getByRole('menuitem').count(),2);
    await page.keyboard.press('Escape');assert.equal(await page.getByRole('menuitem').count(),0);
    const labels=await page.locator('.nav-tabs > *').allTextContents();
    assert.equal(labels.findIndex(text=>text.includes('进入游戏')),labels.findIndex(text=>text.includes('副屏'))+1);
    await page.getByTestId('game-enter-flow').click(); assert.equal(await page.evaluate(()=>window.uiTest.entered),1);
  });
  for(const [width,height] of [[1366,768],[1920,1080],[2560,1440]]) await check(`布局 ${width}x${height}`,async()=>{
    await page.setViewportSize({width,height});await gameSection('首页');
    const box=await page.locator('.game-category-card').first().boundingBox(); assert.ok(Math.abs(box.width/box.height-2)<0.04);
    const cover=await page.locator('.game-category-card-cover').first().boundingBox();
    const name=await page.locator('.game-category-card-copy').first().boundingBox();
    assert.ok(cover.height>0 && name.y>=cover.y+cover.height-1,'category name must be below its cover');
    assert.ok(Math.abs(cover.width-name.width)<1,'cover and name span the same card width');
    assert.equal(await page.locator('.game-category-card-copy small').count(),0);
    const edit=await page.locator('.game-category-card-edit').first().boundingBox();
    const title=await page.locator('.game-category-card-copy h2').first().boundingBox();
    assert.ok(title.x+title.width<=edit.x,'title reserves room for edit button');
    const titlesFit=await page.locator('.game-category-card').evaluateAll(cards=>cards.every(card=>{
      const title=card.querySelector('h2').getBoundingClientRect();
      const copy=card.querySelector('.game-category-card-copy').getBoundingClientRect();
      const cover=card.querySelector('.game-category-card-cover').getBoundingClientRect();
      const edit=card.querySelector('.game-category-card-edit').getBoundingClientRect();
      return cover.height>0 && title.bottom<=copy.bottom && title.right<=edit.left;
    }));
    assert.ok(titlesFit,'long category names fit without overlapping the cover or edit button');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:path.join(output,`home-${width}.png`)});
    await gameSection('游戏列表'); const grid=await page.locator('.game-card-grid').boundingBox(); assert.ok(grid.width>width*0.85);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:path.join(output,`games-${width}.png`)});
  });
  await page.setViewportSize({width:1366,height:768}); await gameSection('首页');
  await check('真实分类拖动、持久化、取消及失败回滚',async()=>{
    assert.equal(await page.locator('.game-category-card-main').first().getAttribute('draggable'),null);
    await drag(page.locator('.game-category-card[data-id="2"] .catalog-drag-handle'),page.locator('.game-category-card[data-id="1"]'));
    await page.waitForFunction(()=>window.uiTest.orders.length===1);await page.locator('.catalog-sorting').waitFor({state:'hidden'});
    assert.deepEqual(await cardIds('.game-category-card'),[2,1,3,4]);
    await page.reload();await page.locator('.game-category-card').first().waitFor();assert.deepEqual(await cardIds('.game-category-card'),[2,1,3,4]);
    await drag(page.locator('.game-category-card[data-id="2"] .catalog-drag-handle'),page.locator('.page-heading'));assert.equal(await page.evaluate(()=>window.uiTest.orders.length),0);
    await page.evaluate(()=>window.uiTest.failOrder=true);
    await drag(page.locator('.game-category-card[data-id="2"] .catalog-drag-handle'),page.locator('.game-category-card[data-id="1"]'));
    await page.getByRole('alert').waitFor();assert.deepEqual(await cardIds('.game-category-card'),[2,1,3,4]);
    await page.evaluate(()=>window.uiTest.failOrder=false);
    await page.evaluate(()=>window.uiTest.orderDelay=2000);
    await drag(page.locator('.game-category-card[data-id="2"] .catalog-drag-handle'),page.locator('.game-category-card[data-id="1"]'));
    assert.equal(await page.locator('.catalog-drag-handle:disabled').count(),4);
    const pendingCount=await page.evaluate(()=>window.uiTest.orders.length);
    await drag(page.locator('.game-category-card[data-id="3"] .catalog-drag-handle'),page.locator('.game-category-card[data-id="4"]'));
    assert.equal(await page.evaluate(()=>window.uiTest.orders.length),pendingCount);
    await page.locator('.catalog-sorting').waitFor({state:'hidden'});
  });
  await check('分类内重排保留隐藏游戏和其他分类位置',async()=>{
    await page.locator('.game-category-card[data-id="1"] .game-category-card-main').click();
    await drag(page.locator('.game-card[data-id="2"] .catalog-drag-handle'),page.locator('.game-card[data-id="1"]'));
    await page.waitForFunction(()=>window.uiTest.orders.some(order=>order[0]==='games'));
    assert.deepEqual(await page.evaluate(()=>window.uiTest.orders.at(-1)[1]),[2,9,1,8,5,6]);
    assert.deepEqual(await cardIds('.game-card'),[2,1]);
  });
  await check('封面目录选择、取消和保存不清空原资源',async()=>{
    await page.locator('.game-card[data-id="1"] .game-card-edit').click();
    assert.equal(await page.getByRole('button',{name:'清除封面',exact:true}).count(),0);
    await page.getByRole('button',{name:'选择图片',exact:true}).click();
    await page.locator('.media-picker-row[data-path="A"]').click(); await page.locator('.media-picker-row[data-path="A/B"]').click();
    await page.locator('.media-picker-row[data-path="A/B/same.png"]').dblclick();
    await page.locator('.media-picker-dialog').waitFor({state:'hidden'});
    assert.match(await page.locator('.game-info-cover-path').innerText(),/A\/B\/same.png/);
    await page.locator('.game-info-actions .primary').click();await page.locator('.game-info-dialog').waitFor({state:'hidden'});
    await page.locator('.game-card[data-id="1"] .game-card-edit').click();await page.getByRole('button',{name:'选择图片',exact:true}).click();
    assert.equal(await page.locator('.media-picker-row[data-path="A/B/same.png"]').count(),1);
    await page.locator('.media-picker-actions .soft-button').click();
    assert.match(await page.locator('.game-info-cover-path').innerText(),/A\/B\/same.png/);
    const input=page.locator('.game-info-dialog input[type="text"]').first();await input.fill('Still editable');assert.equal(await input.inputValue(),'Still editable');
    await page.locator('.game-info-actions .soft-button').click();
  });
  await check('完整游戏列表拖动后重新加载仍保持顺序',async()=>{
    await gameSection('游戏列表');
    await drag(page.locator('.game-card[data-id="6"] .catalog-drag-handle'),page.locator('.game-card[data-id="8"]'));
    await page.locator('.catalog-sorting').waitFor({state:'hidden'});
    assert.deepEqual(await cardIds('.game-card'),[2,1,6,8,5]);
    await page.reload();await gameSection('游戏列表');assert.deepEqual(await cardIds('.game-card'),[2,1,6,8,5]);
  });
  await check('语言弹窗保留真正编辑器草稿、错误重试、当前语言、焦点和持久化',async()=>{
    await gameSection('游戏列表');await page.locator('.game-card[data-id="8"] .game-card-main').click();
    const input=page.locator('.rank-editor input').first();await input.fill('Unsaved rank draft');
    await page.getByTestId('language-menu-button').click();assert.equal(await page.locator('.language-option-flag').count(),14);
    await page.evaluate(()=>window.uiTest.failLanguage=true);await page.locator('.language-dialog input[value="en-US"]').click();
    await page.locator('.language-dialog [role="alert"]').waitFor();assert.equal(await input.inputValue(),'Unsaved rank draft');
    assert.equal(await page.locator('.language-dialog input[value="zh-CN"]').isChecked(),true);
    await page.evaluate(()=>window.uiTest.failLanguage=false);await page.locator('.language-dialog input[value="en-US"]').click();await page.locator('.language-dialog').waitFor({state:'hidden'});
    assert.equal(await input.inputValue(),'Unsaved rank draft');assert.equal(await page.getByTestId('language-menu-button').evaluate(node=>node===document.activeElement),true);
    await input.fill('Can still type');await page.getByTestId('language-menu-button').click();await page.locator('.language-dialog input[value="en-US"]').click();await page.locator('.language-dialog').waitFor({state:'hidden'});
    await page.getByTestId('language-menu-button').click();await page.keyboard.press('Escape');assert.equal(await input.inputValue(),'Can still type');
    await page.reload();assert.equal(await page.locator('html').getAttribute('lang'),'en-US');
    await page.getByTestId('language-menu-button').click();await page.locator('.language-dialog input[value="zh-CN"]').click();await page.locator('.language-dialog').waitFor({state:'hidden'});
  });
  await check('四色创建互斥、画布与库预览保色、基础标志及重载',async()=>{
    await page.locator('.nav-tab').filter({hasText:'精灵库'}).click();await page.locator('.spirit-list-row').first().waitFor();
    const palette=['rgb(34, 197, 94)','rgb(59, 130, 246)','rgb(239, 68, 68)','rgb(168, 85, 247)'];
    for(let color=0;color<4;color++) {
      await page.locator('.spirit-heading-actions .icon-add-button').click();await page.locator('.spirit-editor-name input').fill(`New ${color}`);
      await page.locator(`.spirit-editor-colors input[value="${color}"]`).click();assert.equal(await page.locator('.spirit-editor-colors input:checked').count(),1);
      await page.locator('.spirit-editor-canvas').click({position:{x:8,y:8}});
      const rgba=await page.locator('.spirit-editor-canvas').evaluate(canvas=>Array.from(canvas.getContext('2d').getImageData(4,4,1,1).data));
      assert.equal(`rgb(${rgba[0]}, ${rgba[1]}, ${rgba[2]})`,palette[color]);
      await page.locator('.spirit-editor-actions .primary').click();await page.locator('.spirit-editor-dialog').waitFor({state:'hidden'});
      assert.equal(await page.locator('.spirit-preview-cell.active').first().evaluate(node=>getComputedStyle(node).backgroundColor),palette[color]);
      assert.equal(await page.locator('.spirit-badge').count(),0);
      await page.locator('.spirit-preview-actions button').first().click();assert.equal(await page.locator('.spirit-editor-colors').count(),0);
      await page.locator('.spirit-editor-actions .primary').click();await page.locator('.spirit-editor-dialog').waitFor({state:'hidden'});
    }
    await page.reload();await page.locator('.nav-tab').filter({hasText:'精灵库'}).click();
    for(let color=0;color<4;color++){await page.locator('.spirit-list-row').filter({hasText:`New ${color}`}).click();assert.equal(await page.locator('.spirit-preview-cell.active').first().evaluate(node=>getComputedStyle(node).backgroundColor),palette[color]);}
    await page.locator('.spirit-list-row').filter({hasText:'Color 0'}).click();assert.equal(await page.locator('.spirit-badge.basic').count(),1);
    await page.locator('.spirit-list-row').filter({hasText:'Color 99'}).click();assert.equal(await page.locator('.spirit-preview-cell.active').first().evaluate(node=>getComputedStyle(node).backgroundColor),palette[1]);
  });
  await check('媒体文件夹和横图、竖图、像素图等比半尺寸预览',async()=>{
    await page.locator('.nav-tab').filter({hasText:'媒体库'}).click();assert.equal(await page.locator('.media-folder-icon').count(),2);
    await page.locator('.media-tree-row').filter({has:page.locator('.media-row-name').filter({hasText:/^A$/})}).click();assert.equal(await page.locator('.media-folder-icon').count(),3);
    for(const name of ['wide.png','tall.png','pixel.png']){
      await page.locator('.media-tree-row').filter({hasText:name}).click();await page.locator('.media-preview-stage img').waitFor();
      const fit=await page.locator('.media-preview-stage img').evaluate(img=>{const stage=img.parentElement;const s=Math.min(stage.clientWidth/img.naturalWidth,stage.clientHeight/img.naturalHeight)*.5;return{w:img.clientWidth,h:img.clientHeight,expectedW:stage.clientWidth*.5,expectedH:stage.clientHeight*.5,s};});
      assert.ok(Math.abs(fit.w-fit.expectedW)<2&&Math.abs(fit.h-fit.expectedH)<2);
    }
  });
  await check('配置图片替换取消保留旧值且没有清除按钮',async()=>{
    await page.locator('.nav-tab').filter({hasText:'配置'}).click();
    assert.equal(await page.locator('.application-settings-panel button').filter({hasText:/清除/}).count(),0);
    const before=await page.locator('.application-settings-background-actions').innerText();
    await page.locator('.application-settings-background-actions button').click();
    assert.equal(await page.locator('.application-settings-background-actions').innerText(),before);
  });
  await page.goto(`${url}/tests/ui/catalog-library-harness.html`);await page.waitForFunction(()=>window.mountComponent);
  await check('共用选择器音频过滤、目录不能确认、预览竞争及取消',async()=>{
    await page.evaluate(()=>window.mountComponent('MediaPickerDialog',{accept:'audio'}));await page.locator('.media-picker-row').first().waitFor();
    assert.equal(await page.locator('.media-picker-actions .primary').isDisabled(),true);
    await page.locator('.media-picker-row[data-path="A"]').click();assert.equal(await page.locator('.media-picker-actions .primary').isDisabled(),true);
    assert.equal(await page.locator('.media-picker-row[data-path="A/B"]').count(),0);await page.locator('.media-picker-row[data-path="A/music.mp3"]').dblclick();
    assert.deepEqual(await page.evaluate(()=>window.componentEvents),[['select','A/music.mp3']]);
    await page.evaluate(()=>window.mountComponent('MediaPickerDialog',{accept:'image',currentValue:'A/B/same.png'}));await page.locator('.media-picker-row[data-path="C"]').click();
    await page.locator('.media-picker-row[data-path="C/same.png"]').click();await page.waitForTimeout(250);assert.equal(await page.locator('.media-picker-image').getAttribute('alt'),'same.png');
    assert.match(decodeURIComponent(await page.locator('.media-picker-image').getAttribute('src')),/<title>C\/same\.png<\/title>/);
    await page.locator('.media-picker-actions .soft-button').click();assert.deepEqual(await page.evaluate(()=>window.componentEvents),[['cancel']]);
  });
  await check('Simple/Normal/Diffcult共用图片字段无清除且音频仍可清除',async()=>{
    await page.evaluate(()=>window.mountComponent('GameGlobalConfigDialog',{config:{name:'UI',cover:'A/B/same.png',audio:{scoreSound:'A/music.mp3'},gif:{standby:'C/same.png'}}}));
    const mediaFields=page.locator('.global-config-field').filter({has:page.locator('.global-config-media')});
    assert.equal(await mediaFields.count(),15);
    const clears=page.locator('.global-config-media button').filter({hasText:'清除'});assert.equal(await clears.count(),9);
    const imageFields=page.locator('.global-config-field').filter({has:page.locator('.global-config-cover-preview, .global-config-media-preview')});
    for(const field of await imageFields.all())assert.equal(await field.locator('button').filter({hasText:'清除'}).count(),0);
  });
  assert.deepEqual(errors,[]);
} catch (error) {
  await page.screenshot({path:path.join(output,'failure.png')});
  console.error(await page.evaluate(()=>({orders:window.uiTest?.orders,dragEvents:window.dragEvents,cards:[...document.querySelectorAll('.game-card')].map(node=>({id:node.dataset.id,html:node.outerHTML.slice(0,240)}))})));
  throw error;
} finally {
  await writeFile(path.join(output,'results.json'),JSON.stringify({passed:results,errors},null,2));
  await browser.close();await server.close();
}
