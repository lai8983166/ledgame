// Isolated renderer fixtures: video rendering is real; no daily data or backend audio.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {chromium,expect}=createRequire(path.join(root,'../ledGame-platform/package.json'))('@playwright/test');
const cache=path.join(process.env.LOCALAPPDATA,'ms-playwright');
const chrome=(await readdir(cache)).filter(n=>/^chromium-\d+$/.test(n)).sort().at(-1);
const output=path.join(root,'.build/game-intro-ui');await mkdir(output,{recursive:true});
// Prefer the small existing video fixture, otherwise use the packaged idle video.
const bytes=await readFile(path.join(root,'.build/intro-media-fixtures/intro.mp4')).catch(()=>readFile(path.join(root,'build-resources/media/dashboard/idle.mp4')));
const videoUrl='data:video/mp4;base64,'+bytes.toString('base64');
const server=await createServer({root,server:{host:'127.0.0.1',port:0,hmr:false}});await server.listen();
const browser=await chromium.launch({executablePath:path.join(cache,chrome,'chrome-win64/chrome.exe')});
const page=await browser.newPage({viewport:{width:1366,height:768}}),passed=[],errors=[];
page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(({videoUrl})=>{
 const game={id:1,name:'Intro game',type:'default',mode:'[1]',firstCatalog:'1',participants:1,minPlayers:1,maxPlayers:1,
  commonConfig:{playIntroVideo:'intro/game.mp4'},description:'Whole game description',
  levels:[{label:'First',option:{playIntroVideo:'intro/level.mp4',voiceDesc:'intro/level.wav',desc:'Stored level text'}},{label:'Second',option:{}}]};
 let state={engineState:'PREPARING',gameId:1,gameType:'default',preparation:{sessionId:'intro-session',revision:1,gameId:1,options:{userCount:1,isAdmin:true}},queueSummary:{waiting:[]}},listener;
 window.fixture={game,loads:[],broadcast:value=>{state=structuredClone(value);listener?.(structuredClone(state));}};
 window.appLanguage={get:async()=>'zh-CN',onChanged:()=>()=>{}};
 window.appSettings={get:async()=>({entryMethod:'touch',mode:'debug',touchPreparationTimeoutSeconds:3600}),onChanged:()=>()=>{}};
 window.ledGame={windowKind:'touch',touchPresentationMode:async()=>'game',touchGameState:async()=>({data:state}),
  onEngineState:fn=>{listener=fn;return()=>{listener=null;}},listGames:async()=>({data:[game]}),listPlayableGames:async()=>({data:[game]}),
  listGameCategories:async()=>({data:[{id:'1',name:'Category'}]}),getGameEditor:async()=>({data:game}),
  selectPreparationGame:async()=>({data:state}),onWristbandScanned:()=>()=>{},onCatalogChanged:()=>()=>{},
  cancelPreparation:async()=>({data:{engineState:'IDLE'}}),onTouchPresentationMode:()=>()=>{}};
 window.mediaLibrary={getPreviewUrl:async asset=>{
  window.fixture.loads.push(asset);
  if(asset==='slow.mp4')await new Promise(resolve=>window.fixture.resolvePreview=resolve);
  if(asset.includes('.mp4'))return {url:videoUrl,mediaType:'video'};
  return {url:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>'),mediaType:'image'};
 }};
},{videoUrl});
const mount=name=>page.evaluate(name=>window.mountComponent(name),name);
const broadcast=value=>page.evaluate(value=>window.fixture.broadcast(value),value);
const check=async(name,action)=>{await action();passed.push(name);console.log('PASS '+name);};
const intro=(id,assetReference='intro/level.mp4',positionMillis=0,paused=false)=>({id,assetReference,positionMillis,paused});
try{
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/ui/catalog-library-harness.html`);await page.waitForFunction(()=>window.mountComponent);
 await check('玩家选关可手动观看全局和关卡静音循环视频，关闭保留选择且不播放音频',async()=>{
  await mount('LedGameTouchView');await page.getByTestId('game-player-count-1').click();await page.getByTestId('game-carousel-1').click();
  await page.getByTestId('game-intro-open').click();
  let video=page.getByTestId('touch-intro-dialog').locator('video');await expect(video).toHaveAttribute('data-asset','intro/game.mp4');
  assert.deepEqual(await video.evaluate(v=>[v.muted,v.loop]),[true,true]);
  await page.screenshot({path:path.join(output,'玩家端手动观看.png')});
  await page.getByTestId('touch-intro-dialog').getByRole('button',{name:'关闭',exact:true}).click();
  await page.getByTestId('level-intro-0').click();video=page.getByTestId('touch-intro-dialog').locator('video');
  await expect(video).toHaveAttribute('data-asset','intro/level.mp4');await page.keyboard.press('Escape');
  await expect(page.getByTestId('touch-intro-dialog')).toHaveCount(0);await expect(page.getByTestId('game-level-0')).toHaveAttribute('aria-pressed','true');
  await page.setViewportSize({width:800,height:600});
  const globalButton=await page.getByTestId('game-intro-open').boundingBox(),levelButton=await page.getByTestId('level-intro-0').boundingBox();
  assert.ok(globalButton?.width>0&&globalButton.x+globalButton.width<=801);assert.ok(levelButton?.width>0&&levelButton.x+levelButton.width<=801);
  await page.screenshot({path:path.join(output,'玩家端小屏介绍入口.png')});await page.setViewportSize({width:1366,height:768});
  assert.equal(await page.locator('audio').count(),0);
 });
 await check('后端视频状态驱动玩家端播放、暂停、换播放id和停止，不影响RGB状态',async()=>{
  await broadcast({engineState:'STARTING',gameId:1,introVideo:intro('global')});
  const video=page.locator('.touch-auto-intro');await expect(video).toHaveAttribute('data-playback-id','global');
  await expect.poll(()=>video.evaluate(v=>v.currentTime)).toBeGreaterThan(0.05);
  await broadcast({engineState:'PAUSED',gameId:1,introVideo:intro('global','intro/level.mp4',600,true)});
  await expect.poll(()=>video.evaluate(v=>v.paused)).toBe(true);const position=await video.evaluate(v=>v.currentTime);
  await page.waitForTimeout(180);assert.ok(Math.abs(await video.evaluate(v=>v.currentTime)-position)<0.04);
  await broadcast({engineState:'RUNNING',gameId:1,introVideo:intro('new')});await expect(video).toHaveAttribute('data-playback-id','new');
  await page.screenshot({path:path.join(output,'玩家端自动介绍.png')});
  await broadcast({engineState:'STOPPED',gameId:1});await expect(video).toHaveCount(0);
 });
 await check('关闭后迟到的媒体URL不会重新显示视频',async()=>{
  await broadcast({engineState:'STARTING',gameId:1,introVideo:intro('slow','slow.mp4')});await page.waitForFunction(()=>window.fixture.resolvePreview);
  await broadcast({engineState:'STOPPED',gameId:1});await page.evaluate(()=>window.fixture.resolvePreview());await page.waitForTimeout(50);
  await expect(page.locator('.touch-auto-intro')).toHaveCount(0);
 });
 await check('副屏使用同一后端视频状态，暂停和结束清理，不创建浏览器音频',async()=>{
  await broadcast({engineState:'RUNNING',gameId:1,introVideo:intro('secondary')});await mount('SecondaryDisplayView');
  const video=page.locator('.secondary-intro-video');await expect(video).toHaveAttribute('data-playback-id','secondary');
  assert.deepEqual(await video.evaluate(v=>[v.muted,v.loop]),[true,true]);
  await broadcast({engineState:'PAUSED',gameId:1,introVideo:intro('secondary','intro/level.mp4',500,true)});
  await expect.poll(()=>video.evaluate(v=>v.paused)).toBe(true);assert.equal(await page.locator('audio').count(),0);
  await page.screenshot({path:path.join(output,'副屏介绍视频.png')});
  await broadcast({engineState:'RUNNING',gameId:1,introVideo:null});await expect(video).toHaveCount(0);
 });
 assert.deepEqual(errors,[]);await writeFile(path.join(output,'验证记录.json'),JSON.stringify({passed,errors},null,2));
}finally{await browser.close();await server.close();}
