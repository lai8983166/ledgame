import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=createRequire(path.join(root,'../ledGame-platform/package.json'))('playwright');
const cache=path.join(process.env.LOCALAPPDATA,'ms-playwright');
const chrome=(await readdir(cache)).filter(n=>/^chromium-\d+$/.test(n)).sort().at(-1);
const output=path.join(root,'.build/editor-debug-ui');await mkdir(output,{recursive:true});
const server=await createServer({root,server:{host:'127.0.0.1',port:0}});await server.listen();
const browser=await chromium.launch({executablePath:path.join(cache,chrome,'chrome-win64/chrome.exe')});
const context=await browser.newContext({viewport:{width:1366,height:768}});
await context.addInitScript(()=>{
  const simple={id:1,name:'Simple测试',displayName:'Simple测试',type:'default',mode:'[1]',siteSizeWidth:16,siteSizeHeight:36,participants:3,
    levels:[{label:'第一关',frameList:[{repeatTimes:1,matrix:[]}]}]};
  const rank={id:4,name:'Rank测试',displayName:'Rank测试',type:'rank',siteSizeWidth:8,siteSizeHeight:8,minPlayers:1,maxPlayers:3,
    palette:['#ff0000','#00ff00','#0000ff'],levels:[{type:1,bounds:{minX:0,minY:0,maxX:7,maxY:7}}]};
  let state={engineState:'IDLE',queueSummary:{waiting:[]}},stateListeners=[],frameListeners=[],sequence=0;
  const clone=structuredClone,ret=()=>({data:clone(state)});
  window.fixture={simple,rank,requests:[],failStop:false,failSave:false,update(stateValue){state=clone(stateValue);stateListeners.forEach(f=>f(clone(state)));},
    frame(frame){frameListeners.forEach(f=>f(frame));},listeners(){return [stateListeners.length,frameListeners.length];}};
  window.appLanguage={get:async()=>'zh-CN',set:async v=>v,onChanged:()=>()=>{}};
  window.ledGame={
    gameState:async()=>ret(),onEngineState:f=>{stateListeners.push(f);return()=>{stateListeners=stateListeners.filter(x=>x!==f);};},
    onLedFrame:f=>{frameListeners.push(f);return()=>{frameListeners=frameListeners.filter(x=>x!==f);};},
    getGameEditor:async()=>({data:clone(simple)}),getRankGameEditor:async()=>({data:clone(rank)}),listGameCategories:async()=>({data:[]}),
    saveGameEditor:async(id,value)=>{if(window.fixture.failSave)throw Error('保存失败');Object.assign(simple,clone(value));return {data:{saved:true}};},
    saveRankGameEditor:async(id,value)=>{if(window.fixture.failSave)throw Error('保存失败');Object.assign(rank,clone(value));return {data:{saved:true}};},
    validateRankGameEditor:async()=>({data:{valid:true}}),
    createEditorPreparation:async request=>{window.fixture.requests.push(['prepare',clone(request)]);state={engineState:'PREPARING',sessionId:'session-'+(++sequence),preparation:{sessionId:'session-'+sequence,options:clone(request),participants:[]},queueSummary:{waiting:[]}};return ret();},
    updatePreparation:async(id,patch)=>{window.fixture.requests.push(['update',id,patch]);state.playerAccesses=patch.tokenList.map(uid=>({member:{id:Number(uid),phone:'13800000000',name:'测试会员'},access:{uid,bindingId:1,status:'READY',durationMinutes:60,remainingSeconds:3600}}));return ret();},
    confirmPreparation:async id=>{window.fixture.requests.push(['confirm',id]);state={...state,engineState:'RUNNING',preparation:null,gameTime:{mode:'LIMITED',remainingMillis:60000},gameplay:{score:2,life:3,memberPoints:10}};return ret();},
    cancelPreparation:async id=>{window.fixture.requests.push(['cancel',id]);state={engineState:'IDLE',queueSummary:{waiting:[]}};return ret();},
    sendDebugCommand:async request=>{window.fixture.requests.push(['command',clone(request)]);if(request.command==='endgame'){if(window.fixture.failStop)throw Error('停止失败');state={engineState:'STOPPED',sessionId:state.sessionId,terminationReason:'MANUAL_STOP',queueSummary:{waiting:[]}};}
      else if(request.command==='pause')state.engineState='PAUSED';else if(request.command==='resume')state.engineState='RUNNING';return ret();},
    enterGameFlow:async()=>{throw Error('不允许创建旧窗口');},
  };
  window.mediaLibrary={list:async()=>({items:[]}),getPreviewUrl:async()=>({url:''})};
  window.spiritLibrary={list:async()=>({data:[]})};
  window.elc408Tools={readWiring:async()=>({width:16,height:36,mode:'TURN_BACK_ROW_PRIORITY',maxPointsPerChannel:64,lines:[[[0,0],[1,0]],[]]})};
});
const page=await context.newPage(),errors=[],passed=[];page.on('pageerror',e=>errors.push(e.message));
const mount=async(name,props)=>page.evaluate(([name,props])=>window.mountComponent(name,props),[name,props]);
const button=(name)=>page.getByRole('button',{name,exact:true});
async function check(name,fn){await fn();passed.push(name);console.log('通过：'+name);}
try{
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/ui/catalog-library-harness.html`);await page.waitForFunction(()=>window.mountComponent);
  await check('复用布线组件：四种模式、通道增删、保存隔离、取消、场地尺寸锁定',async()=>{
    await mount('GameWiringDialog',{width:16,height:36});await button('保存此游戏布线').waitFor();
    assert.equal(await page.locator('input[type=number]').first().isDisabled(),true);
    for(const label of ['单行','单列','折返行','折返列'])await page.getByText(label,{exact:true}).click();
    await button('增加通道').click();await button('删除末尾空通道').click();await button('保存此游戏布线').click();
    const events=await page.evaluate(()=>window.componentEvents);assert.equal(events[0][0],'save');assert.equal(events[0][1].runtimeEnabled,true);assert.deepEqual(events[0][1].lines,[[[0,0],[1,0]],[]]);
    await button('取消').click();assert.equal((await page.evaluate(()=>window.componentEvents)).at(-1)[0],'cancel');
    await mount('GameWiringDialog',{width:8,height:8});await button('保存此游戏布线').waitFor();await button('保存此游戏布线').click();assert.deepEqual((await page.evaluate(()=>window.componentEvents))[0][1].lines,[[]]);
  });
  await check('单页启动、方形 RGB、暂停恢复、重启、退出失败可重试、监听释放',async()=>{
    const game=await page.evaluate(()=>window.fixture.simple);await mount('EditorDebugWorkspace',{game});await button('启动游戏').click();
    await button('暂停').click();assert.equal(await button('继续').count(),1);await button('继续').click();
    await page.evaluate(()=>window.fixture.frame({width:16,height:36,rgb:Array(16*36*3).fill(120)}));
    for(const [width,height] of [[1366,768],[1920,1080],[2560,1440]]){
      await page.setViewportSize({width,height});await page.waitForTimeout(100);
      const canvas=await page.locator('canvas').boundingBox();assert.ok(canvas.y+canvas.height<=height,JSON.stringify(canvas));
      const cell=(canvas.height-24-3*35)/36;assert.ok(cell>0);
      const controls=await page.locator('.debug-workspace-controls').boundingBox();
      assert.ok(controls.width>=420,JSON.stringify({width,controls}));
      for(const input of await page.locator('.debug-workspace-controls label input, .debug-workspace-controls label select').all()){
        const bounds=await input.boundingBox();
        assert.ok(bounds.width>=180 && bounds.x>=controls.x && bounds.x+bounds.width<=controls.x+controls.width,JSON.stringify(bounds));
      }
      await page.screenshot({path:path.join(output,`debug-${width}.png`)});
    }
    for(const width of [960,720]){
      await page.setViewportSize({width,height:768});await page.waitForTimeout(100);
      const controls=await page.locator('.debug-workspace-controls').boundingBox();
      assert.ok(controls.width>=240 && controls.width<width/2);
      assert.equal(await page.locator('.debug-workspace-controls').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
      const canvas=await page.locator('canvas').boundingBox();
      assert.ok(canvas.x+canvas.width<=width && canvas.y+canvas.height<=768);
    }
    await page.setViewportSize({width:1366,height:768});await page.waitForTimeout(100);await page.locator('canvas').click({position:{x:20,y:20}});
    assert.ok((await page.evaluate(()=>window.fixture.requests)).some(r=>r[0]==='command'&&r[1].command==='tileinput'));
    await button('重新开始').click();await page.evaluate(()=>window.fixture.failStop=true);await button('退出调试，返回编辑').click();assert.equal(await page.locator('[role=alert]').innerText(),'停止失败');
    await page.evaluate(()=>window.fixture.failStop=false);await button('退出调试，返回编辑').click();assert.equal((await page.evaluate(()=>window.componentEvents)).at(-1)[0],'exit');
    assert.notEqual(await page.locator('dd').nth(4).innerText(),'无限');
    await mount('GameWiringDialog',{width:8,height:8});assert.deepEqual(await page.evaluate(()=>window.fixture.listeners()),[0,0]);
  });
  await check('真实 UID 加回车，多人刷卡数量、重复卡、取消不算成功、普通输入不被扫描捕获',async()=>{
    const game=await page.evaluate(()=>window.fixture.simple);await mount('EditorDebugWorkspace',{game});await page.locator('select').first().selectOption('wristband');await page.locator('input[type=number]').first().fill('2');
    await button('请刷手环').click();await page.keyboard.type('2283055618');await page.keyboard.press('Enter');await page.locator('[role=dialog]').waitFor({state:'hidden'});
    await button('请刷手环').click();await page.keyboard.type('2283055618');await page.keyboard.press('Enter');assert.equal(await page.locator('[role=dialog]').count(),1);await button('取消').click();
    await button('请刷手环').click();await page.keyboard.type('2283055619');await page.keyboard.press('Enter');await page.locator('[role=dialog]').waitFor({state:'hidden'});await button('启动游戏').click();await button('退出调试，返回编辑').click();
    await mount('EditorDebugWorkspace',{game});await page.locator('input[type=number]').first().fill('3');assert.equal(await page.locator('input[type=number]').first().inputValue(),'3');await button('退出调试，返回编辑').click();
  });
  await check('外围灯按保存布局显示黑灯、运行冻结多墙序号、点击不串地砖、暂停禁用及三种尺寸',async()=>{
    const game=await page.evaluate(()=>structuredClone(window.fixture.simple));
    game.commonConfig={pixelLightWiring:{selectedRow:'2|0',form:{open:1,order:0,topWallPixelLightNum:1,rightWallPixelLightNum:1,bottomWallPixelLightNum:1,leftWallPixelLightNum:1}}};
    await mount('EditorDebugWorkspace',{game});
    assert.equal(await page.locator('.debug-circle-light').count(),4);
    assert.equal(await page.locator('.debug-circle-light[data-phase=OFF]').count(),4);
    await button('启动游戏').click();
    await page.evaluate(async()=>window.fixture.update({...(await window.ledGame.gameState()).data,peripheralLights:{enabled:true,order:0,selectedRow:'2|0',lights:[
      {wall:0,index:0,sequenceIndex:2,phase:'BLUE',remaining:5},
      {wall:1,index:0,sequenceIndex:1,phase:'GREEN',remaining:6},
      {wall:2,index:0,sequenceIndex:0,phase:'YELLOW',remaining:0},
      {wall:3,index:0,sequenceIndex:3,phase:'BLUE',remaining:4},
    ]}}));
    assert.equal(await page.locator('.debug-symbol-light').first().innerText(),'5');
    const before=await page.evaluate(()=>window.fixture.requests.length);
    await page.locator('.debug-circle-light[data-wall="0"]').click();
    const request=(await page.evaluate(()=>window.fixture.requests)).at(-1);
    assert.equal(request[1].command,'circleinput');assert.equal(request[1].circleIndex,2);
    assert.equal((await page.evaluate(()=>window.fixture.requests)).length,before+1);
    for(const [width,height] of [[1366,768],[1920,1080],[2560,1440]]){
      await page.setViewportSize({width,height});await page.waitForTimeout(100);
      const bounds=await page.locator('.debug-light-scene').boundingBox();
      assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width&&bounds.y+bounds.height<=height);
      assert.equal(await page.locator('.debug-light-board').evaluate(el=>el.scrollHeight<=el.clientHeight&&el.scrollWidth<=el.clientWidth),true);
      const square=await page.locator('.debug-circle-light').first().boundingBox();assert.ok(Math.abs(square.width-square.height)<0.1);
      const canvas=await page.locator('canvas').boundingBox();const floor=await page.locator('.debug-light-floor').boundingBox();
      assert.ok(canvas.x+canvas.width<=floor.x+floor.width+1&&canvas.y+canvas.height<=floor.y+floor.height+1);
      await page.screenshot({path:path.join(output,`circle-${width}.png`)});
    }
    await page.setViewportSize({width:1366,height:768});await page.waitForTimeout(100);
    await page.locator('canvas').click({position:{x:20,y:20}});
    assert.equal((await page.evaluate(()=>window.fixture.requests)).at(-1)[1].command,'tileinput');
    await button('暂停').click();assert.equal(await page.locator('.debug-circle-light').first().isDisabled(),true);
    await button('继续').click();await button('退出调试，返回编辑').click();
    assert.equal(await page.locator('.debug-circle-light[data-phase=OFF]').count(),4);
  });
  for(const [name,id] of [['SimpleGameEditorView',1],['RankGameEditorView',4]])await check(name+' 编辑入口和保存草稿保留，无旧窗口',async()=>{
    await mount(name,{gameId:id});await button('启动游戏').waitFor();
    await button('启动游戏').click();
    if(await page.getByRole('dialog').count())await button('使用已保存版本').click();
    await button('退出调试，返回编辑').waitFor();await button('退出调试，返回编辑').click();assert.equal(await button('启动游戏').count(),1);
  });
  await check('8×8 Rank：玩家颜色与得分、无生命值、三种视口完整显示',async()=>{
    const game=await page.evaluate(()=>window.fixture.rank);await mount('EditorDebugWorkspace',{game});await button('启动游戏').click();
    await page.evaluate(()=>window.fixture.update({engineState:'RUNNING',sessionId:window.fixture.requests.filter(r=>r[0]==='confirm').at(-1)[1],
      gameTime:{mode:'UNLIMITED'},gameplay:{remainingMillis:12500,players:[{playerNumber:1,color:'#ff0000',totalScore:6,memberPoints:4},{playerNumber:2,color:'#00ff00',totalScore:2,memberPoints:0}]}}));
    assert.equal(await page.locator('.debug-player').count(),2);assert.match(await page.locator('.debug-player').first().innerText(),/6.*4/);
    assert.equal(await page.locator('dd').nth(2).innerText(),'—');
    assert.equal(await page.locator('dd').nth(4).innerText(),'13');
    await page.evaluate(async()=>window.fixture.update({...(await window.ledGame.gameState()).data,gameTime:{mode:'LIMITED',remainingMillis:6000}}));
    assert.equal(await page.locator('dd').nth(4).innerText(),'6');
    for(const [width,height] of [[1366,768],[1920,1080],[2560,1440]]){await page.setViewportSize({width,height});await page.waitForTimeout(100);
      const canvas=await page.locator('canvas').boundingBox();assert.ok(canvas.y+canvas.height<=height);assert.equal(canvas.width,canvas.height);
      await page.screenshot({path:path.join(output,`rank-${width}.png`)});}
    await button('退出调试，返回编辑').click();await page.setViewportSize({width:1366,height:768});
  });
  await check('编辑草稿三选项：取消保留、保存失败不离开、已保存版本返回后草稿仍在',async()=>{
    await mount('SimpleGameEditorView',{gameId:1});
    const number=page.locator('input[type=number]').filter({visible:true}).first();
    await number.fill('7');await button('启动游戏').click();await button('取消').click();assert.equal(await number.inputValue(),'7');
    await button('启动游戏').click();await page.evaluate(()=>window.fixture.failSave=true);await button('保存并进入调试').click();
    await page.getByRole('dialog').waitFor();assert.equal(await button('退出调试，返回编辑').count(),0);
    await page.evaluate(()=>window.fixture.failSave=false);await button('使用已保存版本').click();await button('退出调试，返回编辑').click();assert.equal(await number.inputValue(),'7');
    await button('地砖布线').click();await button('保存此游戏布线').click();
    assert.match(await page.locator('.game-wiring-dialog .error-line').innerText(),/先保存游戏的场地尺寸/);
    await button('取消').click();await number.fill('16');
    await button('地砖布线').click();await button('保存此游戏布线').click();await page.locator('.game-wiring-dialog').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>window.fixture.simple.wiringData.runtimeEnabled),true);
    await mount('RankGameEditorView',{gameId:4});await button('地砖布线').click();await button('取消').click();
    assert.equal(await page.evaluate(()=>window.fixture.rank.wiringData),undefined);
  });
  assert.deepEqual(errors,[]);
}finally{await writeFile(path.join(output,'验证记录.json'),JSON.stringify({passed,errors},null,2));await browser.close();await server.close();}
