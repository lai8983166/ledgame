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
const output = path.join(root, '.build/card-ratios-ui');
await mkdir(output, { recursive:true });
const server = await createServer({root, server:{host:'127.0.0.1',port:20000 + Math.floor(Math.random()*30000),strictPort:false}});
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
    activationStatus: async () => ({ data: { activated: true, machineCode: 'UI-FIXTURE' } }),
    state:async()=>idleState, seedSimpleVariants:async()=>{},seedRankType1:async()=>{},
    listManageableGames:async()=>({data:structuredClone(games)}),listPlayableGames:async()=>({data:structuredClone(games)}),listGameCategories:async()=>({data:structuredClone(categories)}),
    onEngineState:()=>()=>{},enterGameFlow:async()=>{window.uiTest.entered++;return idleState;},
    reorderGameCategories:async ids=>{window.uiTest.orders.push(['categories',ids]);await new Promise(resolve=>setTimeout(resolve,window.uiTest.orderDelay));if(window.uiTest.failOrder)throw new Error('UI order save failed');categories=ids.map((id,displayOrder)=>({...categories.find(item=>item.id===id),displayOrder}));save('ui.categories',categories);return {data:categories};},
    reorderGames:async ids=>{window.uiTest.orders.push(['games',ids]);if(window.uiTest.failOrder)throw new Error('UI order save failed');games=ids.map((id,displayOrder)=>({...games.find(item=>item.id===id),displayOrder}));save('ui.games',games);return {data:games};},
    updateGameCategory:async(id,payload)=>{categories=categories.map(item=>item.id===id?{...item,...payload}:item);save('ui.categories',categories);return {data:categories.find(item=>item.id===id)};},
    createGameCategory:async payload=>{const item={id:Date.now(),displayOrder:categories.length,...payload};categories.push(item);save('ui.categories',categories);return {data:item};},
    updateGameMetadata:async(id,payload)=>{games=games.map(item=>item.id===id?{...item,...payload}:item);save('ui.games',games);return {data:true};},
    getRankGameEditor:async()=>({data:{id:8,type:'rank',name:'Rank Draft',cover:games.find(g=>g.id===8).cover||'',siteSizeWidth:16,siteSizeHeight:36,minPlayers:1,maxPlayers:4,levels:[{id:81,type:1,bounds:{minX:0,maxX:15,minY:0,maxY:35},gameTime:30}],audio:{scoreSound:'A/music.mp3'},gif:{standby:'A/B/same.png'}}}),
    validateRankGameEditor:async()=>({data:{valid:true}}),
    saveRankGameEditor:async(id,doc)=>{games=games.map(g=>g.id===id?{...g,cover:doc.cover}:g);save('ui.games',games);return{data:{saved:true,gameId:id}};},
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
const thumbnailColor = locator => locator.locator('canvas').evaluate(canvas => {
  const pixels = canvas.getContext('2d').getImageData(0,0,240,240).data;
  const colors = new Map();
  for(let index=0;index<pixels.length;index+=4) {
    if(pixels[index+3] && !(pixels[index]===8&&pixels[index+1]===13&&pixels[index+2]===20)) {
      const color = `rgb(${pixels[index]}, ${pixels[index+1]}, ${pixels[index+2]})`;
      colors.set(color,(colors.get(color)||0)+1);
    }
  }
  return [...colors].sort((left,right)=>right[1]-left[1])[0]?.[0] || '';
});
async function gameSection(section) {await page.getByTestId('game-menu-button').click(); await page.getByRole('menuitem',{name:section,exact:true}).click();}
const cardIds=selector=>page.locator(selector).evaluateAll(nodes=>nodes.map(node=>Number(node.dataset.id)));
async function drag(source,target) {
  await source.hover(); await page.waitForTimeout(300);
  const from = await source.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 - 12, from.y + from.height / 2 + 12, {steps:4});
  await target.scrollIntoViewIfNeeded();
  const to = await target.boundingBox();
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
    const cover=await page.locator('.game-category-card-cover').first().boundingBox();
    const category=await page.locator('.game-category-card').first().boundingBox();assert.ok(Math.abs(category.width/category.height-2.2)<0.04,'category card ratio 2.2:1');
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
    const textLayout=await page.locator('.game-card-copy').first().evaluate(el=>{const box=el.getBoundingClientRect(),title=el.querySelector('h2'),r=title.getBoundingClientRect();return{offset:Math.abs((r.top+r.bottom-box.top-box.bottom)/2),size:getComputedStyle(title).fontSize};});
    assert.equal(textLayout.size,'20px');assert.ok(textLayout.offset<1,JSON.stringify(textLayout));
    const game=await page.locator('.game-card').first().boundingBox();assert.ok(Math.abs(game.height/game.width-2.2)<0.04,'game card ratio 1:2.2');
    assert.equal(await page.locator('.game-card-copy').getByText(/娱乐挑战|竞技排行/).count(),0);
    await page.screenshot({path:path.join(output,`games-${width}.png`)});
  });
  assert.deepEqual(errors,[]);
} catch(error){await page.screenshot({path:path.join(output,'失败.png')});throw error;}
finally {await writeFile(path.join(output,'验证记录.json'),JSON.stringify({passed:results,errors},null,2));await browser.close();await server.close();}
