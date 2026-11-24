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
const server=await createServer({root,optimizeDeps:{entries:['tests/ui/catalog-library-harness.html']},server:{watch:null,host:'127.0.0.1',port:0,hmr:false}});await server.listen();
const browser=await chromium.launch({executablePath:path.join(cache,chrome,'chrome-win64/chrome.exe')});
const context=await browser.newContext({viewport:{width:1366,height:768}});
await context.addInitScript(()=>{
  let stateListener,scanListener,settingsListener,catalogListener,revision=0,state;
  const cats=[{id:11,name:'Entertainment Mode',cover:'Entertainment-mode.png'},{id:12,name:'Ranking game',cover:'Breakthrough-mode.png'}];
  const games=[1,2,3,4].map(id=>({id,name:['Simple','Normal','Diffcult','Rank'][id-1],type:id===4?'rank':'default',firstCatalog:String(id===4?12:11),minPlayers:1,maxPlayers:6,participants:6,cover:id===4?'Breakthrough-mode.png':`Entertainment-Ｍode/${['简单','正常','困难'][id-1]}.png`,levels:[{durationSeconds:90}]}));
  games.push({id:5,name:'未分配游戏',type:'default',firstCatalog:'',participants:6},{id:6,name:'失效分类游戏',type:'default',firstCatalog:'999',participants:6});
  const publish=()=>{stateListener?.(structuredClone(state));return {data:structuredClone(state)};};
  const participant=uid=>({member:{id:Number(uid),phone:'13800000000',name:`玩家${uid}`},access:{bindingId:Number(uid),uid,status:'READY',durationMinutes:30,remainingSeconds:1800}});
  window.fixture={games,entryMethod:'wristband',timeout:20,failCount:false,failCategories:false,noCategories:false,scanDelay:0,failConfirm:null,canceled:[],updates:[],confirmed:[],
    changeSettings(seconds){this.timeout=seconds;settingsListener?.({entryMethod:this.entryMethod,touchPreparationTimeoutSeconds:seconds});},
    notifyCatalog(){catalogListener?.();},
    reset(){state={engineState:'PREPARING',runtimeMode:'PRODUCTION',preparation:{sessionId:'test-'+ ++revision,revision,options:{userCount:1,startLevelIndex:0,launchMethod:this.entryMethod,runtimeMode:'PRODUCTION'}}};return publish();},
    scan(uid){scanListener?.({wristbandId:uid});},
    state:()=>structuredClone(state),
  };window.fixture.reset();
  window.appLanguage={get:async()=> 'zh-CN',onChanged:()=>()=>{}};
  window.appSettings={get:async()=>({entryMethod:window.fixture.entryMethod,mode:'game',touchPreparationTimeoutSeconds:window.fixture.timeout}),onChanged:fn=>{settingsListener=fn;return()=>settingsListener=null;}};
  window.mediaLibrary={getPreviewUrl:async p=>({url:'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${p.includes('mode')?400:100}" height="${p.includes('mode')?100:300}"><rect width="100%" height="100%" fill="cyan"/></svg>`)})};
  window.ledGame={
    touchPresentationMode:async()=> 'game',touchGameState:async()=>({data:structuredClone(state)}),
    onEngineState:fn=>{stateListener=fn;return()=>{stateListener=null;};},onWristbandScanned:fn=>{scanListener=fn;return()=>{scanListener=null;};},
    onCatalogChanged:fn=>{catalogListener=fn;return()=>catalogListener=null;},
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
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/ui/catalog-library-harness.html`,{waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForFunction(()=>window.mountComponent);await page.addStyleTag({content:'#app{padding:0!important;overflow:hidden!important;}'});
  await check('选人数后按独立上下限过滤普通与 Rank 游戏，空分类可返回重新选人数', async () => {
    await page.evaluate(() => {
      window.fixture.entryMethod = 'touch';
      for (const game of window.fixture.games.slice(0, 3)) {
        game.minPlayers = 3;
        game.maxPlayers = null;
      }
      window.fixture.games[3].minPlayers = null;
      window.fixture.games[3].maxPlayers = 1;
      window.fixture.reset();
    });
    await mount();
    const pick = async count => {
      await page.getByTestId('game-player-count-' + count).click();
      await step('game');
      await page.locator('.touch-game-panel .touch-wizard-empty:has(strong), .touch-game-panel .touch-game-carousel').first().waitFor();
    };
    const back = async () => {
      await page.locator('.touch-game-panel .touch-wizard-back').click();
      await step('players');
    };
    await pick(1);
    assert.equal(await page.getByTestId('game-category-12').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.getByTestId('game-carousel').getAttribute('data-selected-game-id'), '4');
    await back();
    await pick(2);
    assert.equal(await page.locator('.touch-carousel-card').count(), 0);
    assert.equal(await page.getByTestId('game-game-next').isDisabled(), true);
    await back();
    await pick(3);
    assert.equal(await page.getByTestId('game-category-11').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.getByTestId('game-category-11').getAttribute('data-game-ids'), '1 2 3');
    assert.equal(await page.getByTestId('game-category-12').getAttribute('data-game-ids'), '');
    await page.evaluate(() => {
      for (const game of window.fixture.games.slice(0, 4)) Object.assign(game, {minPlayers:1,maxPlayers:6});
      window.fixture.entryMethod = 'wristband';
      window.fixture.reset();
    });
  });
  await check('更多人数弹窗支持加减和取消，八人按上下限过滤并进入普通游戏',async()=>{
    await page.evaluate(() => {
      window.fixture.entryMethod='touch';
      Object.assign(window.fixture.games[0], {minPlayers:8,maxPlayers:8});
      window.fixture.games[3].maxPlayers=null;
      window.fixture.reset();
    });
    await mount();
    const more = page.getByTestId('game-player-count-more');
    const dialog = page.getByTestId('game-player-count-dialog');
    await more.click();
    await dialog.getByRole('button',{name:'增加人数'}).click();
    await page.keyboard.press('Escape');
    assert.equal(await dialog.isVisible(),false);
    assert.equal(await more.evaluate(el=>el===document.activeElement),true);
    await more.click();
    assert.equal(await dialog.locator('output').innerText(),'7');
    await dialog.getByRole('button',{name:'减少人数'}).click();
    await dialog.getByRole('button',{name:'增加人数'}).click();
    await dialog.getByRole('button',{name:'增加人数'}).click();
    assert.equal(await dialog.locator('output').innerText(),'8');
    await dialog.getByRole('button',{name:'确认'}).click();await step('game');
    assert.equal(await page.getByTestId('game-category-11').getAttribute('data-game-ids'),'1');
    assert.equal(await page.getByTestId('game-category-12').getAttribute('data-game-ids'),'');
    await page.getByTestId('game-game-next').click();await step('level');
    await page.getByTestId('game-start').click();await page.locator('.touch-shell[data-state="RUNNING"]').waitFor({timeout:10000});
    assert.equal(await page.evaluate(()=>window.fixture.confirmed.at(-1).options.userCount),8);
    await page.evaluate(()=>{
      for(const game of [window.fixture.games[0],window.fixture.games[3]]) Object.assign(game,{minPlayers:1,maxPlayers:6});
      window.fixture.entryMethod='wristband';window.fixture.reset();
    });
    await mount();
    await more.click();
    await dialog.getByRole('button',{name:'确认'}).press('Enter');
    await step('wristband');
    for(let count=1; count<=7; count++){
      await page.evaluate(uid=>window.fixture.scan(uid),String(700+count));
      if(count<7) await page.locator(`[data-player-progress="${count}/7"]`).waitFor();
    }
    await step('game');
    assert.equal(await page.evaluate(()=>window.fixture.state().preparation.options.userCount),7);
    await page.evaluate(()=>window.fixture.reset());
  });
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
  await check('仅点击刷新20秒倒计时，移动滚轮键盘输入不刷新，大小屏封面保持',async()=>{
    const shell=page.locator('.touch-shell'),clock=page.getByTestId('game-preparation-step-timeout').locator('strong');
    for(const [name,detail] of [['pointermove',{pointerId:1}],['wheel',{deltaY:1}],['keydown',{key:'Tab'}],['input',{}]]){
      await page.waitForTimeout(1100);assert.ok(Number(await clock.innerText())<20);
      const before=Number(await clock.innerText());await shell.dispatchEvent(name,detail);assert.ok(Number(await clock.innerText())<=before,name);
    }
    await page.locator('.touch-category-card').first().click();assert.equal(await clock.innerText(),'20');
    for (const [selector,ratio] of [['.touch-category-card',2.2],['.touch-carousel-card.current',1/2.2]]) {
      const actual=await page.locator(selector).first().evaluate(e=>e.offsetWidth/e.offsetHeight);
      assert.ok(Math.abs(actual-ratio)<0.03,selector+': '+actual);
    }
    const images=page.locator('.touch-category-card img,.touch-carousel-card img');
    await page.waitForFunction(()=>[...document.querySelectorAll('.touch-category-card img,.touch-carousel-card img')].every(node=>node.naturalWidth>0));
    const measure=()=>images.evaluateAll(nodes=>nodes.map(image=>{const style=getComputedStyle(image.parentElement);return{width:parseFloat(style.width),height:parseFloat(style.height),fit:getComputedStyle(image).objectFit,natural:image.naturalWidth/image.naturalHeight};}));
    for(const width of [1024,1366,1920]){
      await page.setViewportSize({width,height:768});
      const baseline=await measure();assert.ok(baseline.length>2);
      for(const [w,h] of [[1600,100],[100,1600],[1000,1000],[2,1]]){
        await images.evaluateAll((nodes,[w,h])=>nodes.forEach(image=>image.src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'"><rect width="100%" height="100%" fill="cyan"/></svg>')),[w,h]);
        await page.waitForFunction(ratio=>[...document.querySelectorAll('.touch-category-card img,.touch-carousel-card img')].every(img=>img.naturalWidth/img.naturalHeight===ratio),w/h);
        const sizes=await measure();
        assert.equal(await images.evaluateAll(nodes=>nodes.every(img=>Math.abs(img.clientWidth-img.parentElement.clientWidth)<=1 && Math.abs(img.clientHeight-img.parentElement.clientHeight)<=1)),true);
        for(let i=0;i<sizes.length;i++){const size=sizes[i];assert.equal(size.fit,'fill');assert.ok(Math.abs(size.width-baseline[i].width)<.1 && Math.abs(size.height-baseline[i].height)<.1,JSON.stringify({width,baseline:baseline[i],size}));}
      }
    }
    await page.setViewportSize({width:1366,height:768});
    await shot('封面与操作刷新');
  });
  await check('当前轮播卡持续发光，切换跟随当前卡，减少动态效果时停用动画',async()=>{
    const current=page.locator('.touch-carousel-card.current');
    assert.match(await current.evaluate(node=>getComputedStyle(node).animationName),/^touch-current-card-glow/);
    const before=await current.evaluate(node=>node.getAnimations()[0].currentTime);
    await page.waitForTimeout(180);
    assert.ok(await current.evaluate(node=>node.getAnimations()[0].currentTime)>before);
    await page.getByTestId('game-carousel-next').click();
    assert.equal(await page.locator('.touch-carousel-card').evaluateAll(nodes=>nodes.filter(node=>getComputedStyle(node).animationName.startsWith('touch-current-card-glow')).length),1);
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await current.evaluate(node=>getComputedStyle(node).animationName),'none');
    await page.emulateMedia({reducedMotion:'no-preference'});
  });
  await check('回转游戏列表左右各三张、中心正面高亮，侧卡/键盘/滑动切换及少量游戏和窄屏边界',async()=>{
    const original=await page.evaluate(()=>structuredClone(window.fixture.games));
    await page.evaluate(()=>{
      window.fixture.games.splice(0,window.fixture.games.length,...Array.from({length:9},(_,i)=>({id:i+1,name:'游戏 '+(i+1),type:'default',firstCatalog:'11',minPlayers:1,maxPlayers:6,participants:6,cover:'carousel-'+i+'.png',levels:[{durationSeconds:90}]})));
      window.mediaLibrary.getPreviewUrl=async p=>({url:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="183" height="308"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="hsl('+((Number(p.match(/carousel-(\d+)/)?.[1])||0)*39)+',70%,45%)"/><stop offset="1" stop-color="#071936"/></linearGradient></defs><rect width="183" height="308" fill="url(#g)"/><circle cx="92" cy="135" r="58" fill="none" stroke="#ffffff77" stroke-width="3"/><text x="92" y="157" text-anchor="middle" fill="white" font-size="70">'+((Number(p.match(/carousel-(\d+)/)?.[1])||0)+1)+'</text></svg>')});
      window.fixture.notifyCatalog();
    });
    await page.waitForFunction(()=>window.getComponentSetup().categoryGames.length===9);
    const carousel=page.getByTestId('game-carousel'),cards=page.locator('.touch-carousel-card');
    const settle=()=>page.waitForTimeout(400);
    for(const [width,height] of [[1920,1080],[1366,768],[1024,600],[760,600]]){
      await page.setViewportSize({width,height});await settle();
      const geometry=await carousel.evaluate(el=>{
        const bounds=el.getBoundingClientRect();return {x:bounds.x,width:bounds.width,cards:[...el.querySelectorAll('.touch-carousel-card')].filter(e=>getComputedStyle(e).display!=='none').map(e=>{const r=e.getBoundingClientRect(),m=new DOMMatrix(getComputedStyle(e).transform);return{offset:Number(e.dataset.carouselOffset),x:r.x,width:r.width,rotation:m.m13,z:Number(getComputedStyle(e).zIndex)};})};
      });
      assert.equal(geometry.cards.length,width>1100?7:5);
      const center=geometry.cards.find(c=>c.offset===0);
      assert.ok(Math.abs(center.x+center.width/2-geometry.x-geometry.width/2)<1);
      assert.equal(center.rotation,0);
      for(const card of geometry.cards){
        assert.ok(card.x>=geometry.x-1&&card.x+card.width<=geometry.x+geometry.width+1,JSON.stringify({width,geometry,card}));
        if(card.offset){assert.ok(Math.abs(card.rotation)>0.1);assert.ok(card.z<center.z);assert.equal(Math.sign(card.x+card.width/2-center.x-center.width/2),Math.sign(card.offset));}
      }
      assert.ok(await page.locator('.touch-shell').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
      await shot('回转选游戏-'+width);
      for(const offset of [-3,-2,-1,1,2,3]){
        const side=page.locator('.touch-carousel-card[data-carousel-offset="'+offset+'"]');
        if(!await side.isVisible())continue;
        const selected=(await side.getAttribute('data-testid')).replace('game-carousel-','');
        const exposed=await side.evaluate(el=>{
          const b=el.getBoundingClientRect(),y=b.y+b.height/2,points=[];
          for(let x=Math.ceil(b.x);x<b.right;x+=2)if(el.contains(document.elementFromPoint(x,y)))points.push(x);
          return {x:points[Math.floor(points.length/2)],y,width:points.length*2};
        });
        assert.ok(exposed.width>=20,JSON.stringify({width,offset,exposed}));
        await page.mouse.click(exposed.x,exposed.y);await settle();assert.equal(await carousel.getAttribute('data-selected-game-id'),selected);
      }
    }
    await page.setViewportSize({width:1366,height:768});await settle();
    const side=page.locator('.touch-carousel-card[data-carousel-offset="2"]'),id=(await side.getAttribute('data-testid')).replace('game-carousel-','');
    await side.click();await settle();assert.equal(await carousel.getAttribute('data-selected-game-id'),id);
    await carousel.press('ArrowRight');await settle();assert.equal(await carousel.getAttribute('data-selected-game-id'),String(Number(id)%9+1));
    const drag=await carousel.boundingBox();await page.mouse.move(drag.x+drag.width/2,drag.y+drag.height/2);await page.mouse.down();await page.mouse.move(drag.x+drag.width/2-100,drag.y+drag.height/2,{steps:8});await page.mouse.up();await settle();
    assert.equal(await carousel.getAttribute('data-selected-game-id'),String((Number(id)+1)%9+1));
    await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await cards.first().evaluate(e=>getComputedStyle(e).transitionDuration),'0s');await page.emulateMedia({reducedMotion:'no-preference'});
    for(const count of [0,1,2]){
      await page.evaluate(count=>{window.fixture.games.splice(0,window.fixture.games.length,...Array.from({length:count},(_,i)=>({id:i+1,name:'边界 '+(i+1),type:'default',firstCatalog:'11',minPlayers:1,maxPlayers:6,participants:6})));window.fixture.notifyCatalog();},count);
      await page.waitForFunction(count=>window.getComponentSetup().categoryGames.length===count,count);await settle();
      assert.equal(await cards.count(),count);
      if(count){assert.equal(await page.locator('.touch-carousel-card.current').count(),1);assert.equal(new Set(await cards.evaluateAll(nodes=>nodes.map(e=>e.dataset.testid))).size,count);}
      await shot('回转边界-'+count);
    }
    await page.evaluate(original=>{window.fixture.games.splice(0,window.fixture.games.length,...original);window.fixture.notifyCatalog();},original);
    await page.waitForFunction(()=>window.getComponentSetup().categorizedGames.length===4);await page.getByTestId('game-category-11').click();
  });
  await check('无其他游戏分类，未分配和失效分类不展示，分配有效分类后实时出现',async()=>{
    assert.equal(await page.getByTestId('game-category-uncategorized').count(),0);
    assert.deepEqual(await page.evaluate(()=>window.getComponentSetup().categorizedGames.map(game=>game.id)),[1,2,3,4]);
    await page.evaluate(()=>{window.fixture.games.find(game=>game.id===5).firstCatalog='11';window.fixture.notifyCatalog();});
    await page.waitForFunction(()=>window.getComponentSetup().categorizedGames.some(game=>game.id===5));
    assert.equal(await page.evaluate(()=>window.getComponentSetup().categorizedGames.some(game=>game.id===6)),false);
    await page.evaluate(()=>{window.fixture.games.find(game=>game.id===5).firstCatalog='';window.fixture.notifyCatalog();});
    await page.waitForFunction(()=>!window.getComponentSetup().categorizedGames.some(game=>game.id===5));
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
    await page.getByTestId('game-category-12').click();await page.getByTestId('game-game-next').click();await step('colors');
    const row=page.getByTestId('rank-player-colors');await row.waitFor();
    assert.match(await row.innerText(),/1P 201（玩家201）/);assert.match(await row.innerText(),/2P 202（玩家202）/);
    assert.deepEqual(await row.locator('.touch-rank-color-preview').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).backgroundColor)),['rgb(18, 137, 68)','rgb(255, 170, 17)']);
    const color=(player,hex)=>page.getByTestId(`rank-color-player-${player}`).getByRole('button',{name:`${player}P ${hex}`,exact:true});
    assert.equal(await color(1,'#FFAA11').isDisabled(),true);
    await color(1,'#6932AA').click();assert.equal(await color(2,'#6932AA').isDisabled(),true);
    await color(2,'#128944').click();assert.equal(await color(1,'#128944').isDisabled(),true);
    // A selected swatch can be released before choosing colors for another player.
    await color(1,'#6932AA').click();assert.equal(await page.getByTestId('rank-colors-next').isDisabled(),true);
    await color(1,'#6932AA').click();
    for(const [width,height] of [[1366,768],[1280,600],[1920,1080]]){
      await page.setViewportSize({width,height});const box=await row.boundingBox(),next=await page.getByTestId('rank-colors-next').boundingBox();
      assert.ok(box.y+box.height<=next.y+1);assert.ok(next.y+next.height<=height);
    }
    await page.setViewportSize({width:1366,height:768});await shot('Rank玩家配色');
    await page.getByTestId('rank-colors-next').click();await step('level');assert.equal(await row.isVisible(),false);
    await page.locator('.touch-level-step .touch-wizard-back').click();await step('colors');
    assert.equal(await color(1,'#6932AA').getAttribute('aria-pressed'),'true');await page.getByTestId('rank-colors-next').click();await step('level');
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
    assert.deepEqual(await page.evaluate(()=>window.fixture.confirmed.at(-1).options.playerColors),['#6932AA','#128944']);
  });
  await check('触屏Rank六人默认色、释放换色、返回保留、换游戏清空及选色超时',async()=>{
    await page.evaluate(()=>{window.fixture.entryMethod='touch';window.fixture.reset();});await mount();
    await page.getByTestId('game-player-count-6').click();await step('game');
    await page.getByTestId('game-category-12').click();await page.getByTestId('game-game-next').click();await step('colors');
    assert.equal(await page.locator('.touch-rank-color-player').count(),6);
    assert.equal((await page.getByTestId('rank-color-player-1').locator('strong').innerText()).trim(),'1P');
    const first=page.getByTestId('rank-color-player-1'),second=page.getByTestId('rank-color-player-2');
    await first.getByRole('button',{name:'1P #128944',exact:true}).click();
    await second.getByRole('button',{name:'2P #128944',exact:true}).click();
    await first.getByRole('button',{name:'1P #FFAA11',exact:true}).click();
    assert.equal(await page.getByTestId('rank-colors-next').isDisabled(),false);
    for(const [width,height] of [[1366,768],[1280,600],[600,480]]){
      await page.setViewportSize({width,height});const next=await page.getByTestId('rank-colors-next').boundingBox();assert.ok(next.y+next.height<=height+1);assert.ok(next.x+next.width<=width+1);
      await shot(`Rank六人选色-${width}`);
    }
    await page.setViewportSize({width:1366,height:768});
    await page.locator('.touch-rank-color-step .touch-wizard-back').click();await step('game');
    await page.getByTestId('game-game-next').click();await step('colors');
    assert.equal(await first.getByRole('button',{name:'1P #FFAA11',exact:true}).getAttribute('aria-pressed'),'true');
    await page.locator('.touch-rank-color-step .touch-wizard-back').click();await step('game');
    await page.getByTestId('game-category-11').click();await page.getByTestId('game-game-next').click();await step('level');
    assert.deepEqual(await page.evaluate(()=>window.getComponentSetup().rankPlayerColors),[]);
    await page.evaluate(()=>{window.fixture.reset();window.fixture.changeSettings(2);});await mount();
    await page.getByTestId('game-player-count-1').click();await step('game');await page.getByTestId('game-category-12').click();await page.getByTestId('game-game-next').click();await step('colors');
    await page.locator('.touch-shell[data-state="IDLE"]').waitFor({timeout:5000});await page.evaluate(()=>window.fixture.changeSettings(20));
  });
  await check('触屏跳过刷卡；没有有效分类不展示游戏；分类读取失败重试',async()=>{
    await page.evaluate(()=>{window.fixture.entryMethod='touch';window.fixture.noCategories=true;window.fixture.reset();});await mount();
    await page.getByTestId('game-player-count-1').click();await step('game');assert.equal(await page.getByTestId('game-wristband-prompt').count(),0);
    assert.equal(await page.locator('.touch-carousel-card').count(),0);
    assert.deepEqual(await page.evaluate(()=>window.getComponentSetup().categorizedGames.map(game=>game.id)),[]);
    await page.evaluate(()=>{window.fixture.noCategories=false;window.fixture.failCategories=true;window.fixture.reset();});await mount();await page.getByTestId('game-player-count-1').click();await step('game');
    await page.getByTestId('game-category-error').waitFor();await page.evaluate(()=>window.fixture.failCategories=false);await page.getByTestId('game-category-retry').click();await page.getByTestId('game-category-11').waitFor();await shot('选游戏');
  });
  await check('准备中已选游戏分类失效时取消当前准备，不继续启动隐藏游戏',async()=>{
    await page.evaluate(()=>{window.fixture.entryMethod='touch';window.fixture.reset();});await mount();
    await page.getByTestId('game-player-count-1').click();await step('game');
    await page.locator('.touch-carousel-card.current').click();await step('level');
    const selected=await page.evaluate(()=>window.fixture.state().preparation.gameId);
    await page.evaluate(id=>{window.fixture.games.find(game=>game.id===id).firstCatalog='999';window.fixture.notifyCatalog();},selected);
    await page.locator('.touch-shell[data-state="IDLE"]').waitFor();
    await page.evaluate(id=>window.fixture.games.find(game=>game.id===id).firstCatalog=id===4?'12':'11',selected);
  });
  await check('准备秒数读取设置并实时更新，操作刷新设置值，非法0回退20且仍强制超时',async()=>{
    await page.evaluate(()=>{window.fixture.entryMethod='wristband';window.fixture.timeout=3600;window.fixture.reset();});await mount();
    const clock=page.getByTestId('game-preparation-step-timeout').locator('strong');
    assert.equal(await clock.innerText(),'3600');
    await page.evaluate(()=>window.fixture.changeSettings(0));assert.equal(await clock.innerText(),'20');
    await page.evaluate(()=>window.fixture.changeSettings(2));assert.equal(await clock.innerText(),'2');
    await page.getByTestId('game-player-count-1').click();await step('wristband');
    await page.waitForTimeout(1100);assert.equal(await clock.innerText(),'1');
    await page.locator('.touch-shell').dispatchEvent('pointermove',{pointerId:1});assert.equal(await clock.innerText(),'1');
    await page.getByTestId('game-wristband-prompt').click();assert.equal(await clock.innerText(),'2');
    const id=await page.evaluate(()=>window.fixture.state().preparation.sessionId);
    await page.locator('.touch-shell[data-state="IDLE"]').waitFor({timeout:4000});
    assert.ok(await page.evaluate(id=>window.fixture.canceled.includes(id),id));
    await page.evaluate(()=>window.fixture.timeout=20);
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
