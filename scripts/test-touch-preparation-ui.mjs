import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(root,'../ledGame-platform/package.json'));
const {chromium}=require('playwright');
const cache=path.join(process.env.LOCALAPPDATA,'ms-playwright');
const chrome=(await readdir(cache)).filter(n=>/^chromium-\d+$/.test(n)).sort().at(-1);
const output=path.join(root,'.build/touch-preparation-ui');await mkdir(output,{recursive:true});
const server=await createServer({root,server:{host:'127.0.0.1',port:0}});await server.listen();
const browser=await chromium.launch({executablePath:path.join(cache,chrome,'chrome-win64/chrome.exe')});
const context=await browser.newContext({viewport:{width:1366,height:768}});
await context.addInitScript(()=>{
  let stateListener,scanListener,revision=0,state;
  const cats=[{id:11,name:'Entertainment Mode',cover:'Entertainment-mode.png'},{id:12,name:'Ranking game',cover:'Breakthrough-mode.png'}];
  const games=[1,2,3,4].map(id=>({id,name:['Simple','Normal','Diffcult','Rank'][id-1],type:id===4?'rank':'default',firstCatalog:String(id===4?12:11),minPlayers:1,maxPlayers:6,participants:6,cover:id===4?'Breakthrough-mode.png':`Entertainment-Ｍode/${['简单','正常','困难'][id-1]}.png`,levels:[{durationSeconds:90}]}));
  const publish=()=>{stateListener?.(structuredClone(state));return {data:structuredClone(state)};};
  const participant=uid=>({member:{id:Number(uid),phone:'13800000000',name:`玩家${uid}`},access:{bindingId:Number(uid),uid,status:'READY',durationMinutes:30,remainingSeconds:1800}});
  window.fixture={entryMethod:'wristband',failCount:false,failCategories:false,noCategories:false,scanDelay:0,failConfirm:null,canceled:[],updates:[],confirmed:[],
    reset(){state={engineState:'PREPARING',runtimeMode:'PRODUCTION',preparation:{sessionId:'test-'+ ++revision,revision,options:{userCount:1,startLevelIndex:0,launchMethod:this.entryMethod,runtimeMode:'PRODUCTION'}}};return publish();},
    scan(uid){scanListener?.({wristbandId:uid});},
    state:()=>structuredClone(state),
  };window.fixture.reset();
  window.appLanguage={get:async()=> 'zh-CN',onChanged:()=>()=>{}};
  window.appSettings={get:async()=>({entryMethod:window.fixture.entryMethod,mode:'game'}),onChanged:()=>()=>{}};
  window.mediaLibrary={getPreviewUrl:async p=>({url:'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${p.includes('mode')?400:100}" height="${p.includes('mode')?100:300}"><rect width="100%" height="100%" fill="cyan"/></svg>`)})};
  window.ledGame={
    touchPresentationMode:async()=> 'game',touchGameState:async()=>({data:structuredClone(state)}),
    onEngineState:fn=>{stateListener=fn;return()=>{stateListener=null;};},onWristbandScanned:fn=>{scanListener=fn;return()=>{scanListener=null;};},
    listGames:async()=>games,listPlayableGames:async()=>games,seedSimpleVariants:async()=>{},seedRankType1:async()=>{},
    listGameCategories:async()=>{if(window.fixture.failCategories)throw Error('分类读取失败');return window.fixture.noCategories?[]:cats;},
    updatePreparation:async(id,patch)=>{window.fixture.updates.push(patch);if(window.fixture.failCount)throw Error('保存人数失败');Object.assign(state.preparation.options,patch);state.preparation.revision=++revision;return publish();},
    createWristbandPreparation:async(id,uid)=>{await new Promise(r=>setTimeout(r,window.fixture.scanDelay));if(state.preparation?.sessionId!==id)throw Error('已取消');if(state.playerAccesses?.some(p=>p.access.uid===uid))throw Error('重复手环');state.playerAccesses=[...(state.playerAccesses||[]),participant(uid)];state.preparation.revision=++revision;return publish();},
    selectPreparationGame:async(id,gameId)=>{Object.assign(state.preparation,{gameId,revision:++revision});return publish();},
    getGameEditor:async id=>({data:{id,name:games[id-1].name,description:'踩亮得分地砖，避开陷阱，完成关卡挑战。',globalTimeLimit:true,globalTimeLimitValue:900,globalLifeLimit:true,globalLifeLimitValue:5,levels:Array.from({length:10},(_,i)=>({label:'Level '+(i+1),option:{timeLimitMode:'CYCLE_SECONDS',timeLimitValue:30,lifeLimitMode:'LIMITED',lifeLimitValue:3}}))}}),
    getRankGameEditor:async id=>({data:{id,type:'rank',name:'Rank',description:'Rank instructions',palette:['#128944','#FFAA11','#6932AA','#22AAAA','#AA2288','#3344BB'],levels:[1,2,3].map(type=>({type,label:'Bomb '+(type*2+1),durationSeconds:90}))}}),
    cancelPreparation:async id=>{window.fixture.canceled.push(id);state={engineState:'IDLE'};return publish();},
    startSystemIdle:async()=>{state={engineState:'IDLE'};return publish();},createPreparation:async()=>window.fixture.reset(),
    confirmPreparation:async id=>{if(window.fixture.failConfirm)throw Error(window.fixture.failConfirm);window.fixture.confirmed.push({id,options:structuredClone(state.preparation.options)});state={engineState:'RUNNING',runtimeMode:'PRODUCTION'};return publish();},
  };
});
const page=await context.newPage(),errors=[],passed=[];
page.on('pageerror',e=>errors.push(e.message));
async function mount(){await page.evaluate(()=>window.mountComponent('LedGameTouchView'));await page.locator('.touch-game-presentation').waitFor();}
async function step(value){await page.locator(`.touch-shell[data-preparation-step="${value}"]`).waitFor();}
async function check(name,fn){await fn();passed.push(name);console.log('通过：'+name);}
async function shot(name){await page.screenshot({path:path.join(output,name+'.png')});}
try{
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/ui/catalog-library-harness.html`);
  await page.waitForFunction(()=>window.mountComponent);await page.addStyleTag({content:'#app{padding:0!important;overflow:hidden!important;}'});
  await check('人数点击自动进入刷卡；失败留原页；多人不足及重复不会前进',async()=>{
    await mount();assert.equal(await page.getByTestId('game-player-next').count(),0);
    await page.evaluate(()=>window.fixture.scan('101'));assert.equal(await page.getByTestId('game-player-access').count(),0);
    await page.evaluate(()=>window.fixture.failCount=true);await page.getByTestId('game-player-count-2').click();await page.getByTestId('game-error').waitFor();await step('players');
    await page.evaluate(()=>window.fixture.failCount=false);await page.getByTestId('game-player-count-2').click();await step('wristband');
    await page.evaluate(()=>window.fixture.scan('101'));await page.locator('[data-player-progress="1/2"]').waitFor();await step('wristband');
    await page.evaluate(()=>window.fixture.scan('101'));await page.getByTestId('game-error').waitFor();await step('wristband');await shot('刷卡-两人');
    await page.evaluate(()=>window.fixture.scan('102'));await step('game');
    assert.equal(await page.getByTestId('game-preparation-step-timeout').locator('strong').innerText(),'20');
  });
  await check('操作刷新20秒倒计时，横竖封面与容器比例一致且不裁切',async()=>{
    const shell=page.locator('.touch-shell'),clock=page.getByTestId('game-preparation-step-timeout').locator('strong');
    for(const [name,detail] of [['pointermove',{pointerId:1}],['wheel',{deltaY:1}],['keydown',{key:'Tab'}],['input',{}],['click',{}]]){
      await page.waitForTimeout(1100);assert.ok(Number(await clock.innerText())<20);
      await shell.dispatchEvent(name,detail);assert.equal(await clock.innerText(),'20',name);
    }
    const images=page.locator('.touch-category-card img,.touch-carousel-card img');
    await page.waitForFunction(()=>[...document.querySelectorAll('.touch-category-card img,.touch-carousel-card img')].every(node=>node.naturalWidth>0));
    const sizes=await images.evaluateAll(nodes=>nodes.map(image=>{const card=image.parentElement,style=getComputedStyle(card);return{fit:getComputedStyle(image).objectFit,ratio:Number(style.getPropertyValue('--touch-cover-ratio')),renderedRatio:parseFloat(style.width)/parseFloat(style.height),natural:image.naturalWidth/image.naturalHeight};}));
    assert.ok(sizes.length>2);for(const size of sizes){assert.equal(size.fit,'contain');assert.ok(Math.abs(size.ratio-size.natural)<.001,JSON.stringify(size));assert.ok(Math.abs(size.renderedRatio-size.natural)<.04,JSON.stringify(size));}
    await shot('封面与操作刷新');
  });
  await check('分类封面轮播、点当前游戏进关卡、真实全局参数和关卡启动',async()=>{
    assert.equal(await page.locator('.touch-category-card').count(),2);
    await page.getByTestId('game-category-12').click();assert.equal(await page.getByTestId('game-carousel').getAttribute('data-selected-game-id'),'4');
    await page.getByTestId('game-category-11').click();await page.getByTestId('game-carousel-next').click();
    await page.locator('.touch-carousel-card.current').click();await step('level');
    assert.match(await page.locator('.touch-level-summary').innerText(),/900|15/);assert.match(await page.locator('.touch-level-summary').innerText(),/5/);
    for(const [width,height] of [[1366,768],[1920,1080],[1280,600]]){
      await page.setViewportSize({width,height});await shot(`关卡-${width}`);
      const box=await page.getByTestId('game-start').boundingBox();assert.ok(box.y+box.height<=height && box.x+box.width<=width);
      assert.ok(await page.locator('.touch-game-wizard').evaluate(el=>el.scrollHeight<=el.clientHeight+1));
    }
    await page.setViewportSize({width:1366,height:768});await page.getByTestId('game-level-3').click();await page.getByTestId('game-start').click();
    await page.locator('.touch-shell[data-state="RUNNING"]').waitFor({timeout:10000});
    const options=await page.evaluate(()=>window.fixture.confirmed.at(-1).options);assert.equal(options.userCount,2);assert.equal(options.startLevelIndex,3);
  });
  await check('Rank本局真实配色、矩形色块、多关卡选择及无控制器弹窗/关闭/重试',async()=>{
    await page.evaluate(()=>{window.fixture.entryMethod='wristband';window.fixture.reset();});await mount();
    await page.getByTestId('game-player-count-2').click();await step('wristband');
    await page.evaluate(()=>window.fixture.scan('201'));await page.locator('[data-player-progress="1/2"]').waitFor();
    await page.evaluate(()=>window.fixture.scan('202'));await step('game');
    await page.getByTestId('game-category-12').click();await page.locator('.touch-carousel-card.current').click();await step('level');
    const row=page.getByTestId('rank-player-colors');await row.waitFor();
    assert.deepEqual(await row.locator('rect').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('fill'))),['#128944','#FFAA11']);
    for(const [width,height] of [[1366,768],[1280,600],[1920,1080]]){
      await page.setViewportSize({width,height});const box=await row.boundingBox(),picker=await page.locator('.touch-level-picker').boundingBox();
      assert.ok(box.y+box.height<=picker.y+1);const start=await page.getByTestId('game-start').boundingBox();assert.ok(start.y+start.height<=height);
    }
    await page.setViewportSize({width:1366,height:768});await shot('Rank玩家配色');
    await page.getByTestId('game-level-2').click();await page.evaluate(()=>window.fixture.failConfirm='503: ELC408_NO_CONTROLLERS: SEARCH_NO_CONTROLLERS: no controller discovered');
    await page.getByTestId('game-start').click();await page.getByTestId('touch-hardware-notice').waitFor({timeout:10000});await step('level');
    assert.match(await page.getByTestId('touch-hardware-notice').innerText(),/未连接设备/);await shot('手环无设备弹窗');
    await page.getByTestId('touch-hardware-close').click();await page.getByTestId('touch-hardware-notice').waitFor({state:'detached'});
    assert.equal(await page.evaluate(()=>window.fixture.state().engineState),'PREPARING');
    await page.getByTestId('game-start').click();await page.getByTestId('touch-hardware-notice').waitFor({timeout:10000});
    await page.getByTestId('touch-hardware-notice').waitFor({state:'detached',timeout:4000});
    await page.evaluate(()=>window.fixture.failConfirm='503: ELC408_RUNTIME_DISABLED: disabled');await page.getByTestId('game-start').click();
    await page.getByTestId('game-error').filter({hasText:'ELC408_RUNTIME_DISABLED'}).waitFor({timeout:10000});await step('level');
    assert.equal(await page.getByTestId('touch-hardware-notice').count(),0);
    await page.evaluate(()=>window.fixture.failConfirm=null);await page.getByTestId('game-start').click();await page.locator('.touch-shell[data-state="RUNNING"]').waitFor({timeout:10000});
    assert.equal(await page.evaluate(()=>window.fixture.confirmed.at(-1).options.startLevelIndex),2);
  });
  await check('触屏跳过刷卡；没有分类可用；分类读取失败重试',async()=>{
    await page.evaluate(()=>{window.fixture.entryMethod='touch';window.fixture.noCategories=true;window.fixture.reset();});await mount();
    await page.getByTestId('game-player-count-1').click();await step('game');assert.equal(await page.getByTestId('game-wristband-prompt').count(),0);
    await page.locator('.touch-carousel-card.current').click();await step('level');
    await page.evaluate(()=>{window.fixture.noCategories=false;window.fixture.failCategories=true;window.fixture.reset();});await mount();await page.getByTestId('game-player-count-1').click();await step('game');
    await page.getByTestId('game-category-error').waitFor();await page.evaluate(()=>window.fixture.failCategories=false);await page.getByTestId('game-category-retry').click();await page.getByTestId('game-category-11').waitFor();await shot('选游戏');
  });
  await check('独立刷卡超时回待机；取消及迟到扫码不推进',async()=>{
    await page.evaluate(()=>{window.fixture.entryMethod='wristband';window.fixture.reset();});await mount();await page.getByTestId('game-player-count-1').click();await step('wristband');await shot('刷卡-单人');
    await page.locator('.touch-shell[data-state="IDLE"]').waitFor({timeout:25000});
    await page.evaluate(()=>{window.fixture.scanDelay=300;window.fixture.reset();});await mount();await page.getByTestId('game-player-count-1').click();await step('wristband');
    await page.locator('.touch-wizard-cancel').click();await page.locator('.touch-shell[data-state="IDLE"]').waitFor();
    await page.evaluate(()=>window.fixture.scan('103'));await page.waitForTimeout(400);
    assert.equal(await page.locator('.touch-shell').getAttribute('data-state'),'IDLE');
    await page.evaluate(()=>window.fixture.reset());await mount();await page.getByTestId('game-player-count-1').click();await step('wristband');
    await page.evaluate(()=>{window.fixture.scan('103');return window.ledGame.cancelPreparation(window.fixture.state().preparation.sessionId);});
    await page.waitForTimeout(450);assert.equal(await page.locator('.touch-shell').getAttribute('data-state'),'IDLE');
  });
  assert.deepEqual(errors,[]);
}catch(e){await shot('失败');throw e;}finally{await writeFile(path.join(output,'验证记录.json'),JSON.stringify({passed,errors},null,2));await browser.close();await server.close();}
