// Real release EXE and embedded backend, using isolated database/settings/media.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {probeDebugBoard,assertDebugBoardPixels} from './lib/debug-board-pixel-probe.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(root,'../ledGame-platform/package.json'));
const {_electron,expect}=require('@playwright/test');
const data=await mkdtemp(path.join(root,'.build/legacy-countdown-packaged-'));
const media=path.join(data,'media');await mkdir(media);await mkdir(path.join(data,'settings'));
await writeFile(path.join(data,'settings/application.json'),JSON.stringify({entryMethod:'touch'}));
const helper=path.join(data,'OpeningHashes.java');
await writeFile(helper,`import com.ledgame.GameApp.Runtime.GIFUtils;
import java.nio.file.Path;import java.security.MessageDigest;import java.util.HexFormat;
import javax.imageio.*;import javax.imageio.metadata.*;import javax.imageio.stream.*;
import java.awt.image.BufferedImage;
public class OpeningHashes {
 public static void main(String[] args)throws Exception{
  var image=new BufferedImage(16,36,BufferedImage.TYPE_INT_RGB);
  image.setRGB(0,0,0x00ffff);image.setRGB(15,35,0xff00ff);
  var writer=ImageIO.getImageWritersByFormatName("gif").next();
  var meta=writer.getDefaultImageMetadata(ImageTypeSpecifier.createFromRenderedImage(image),writer.getDefaultWriteParam());
  var tree=(IIOMetadataNode)meta.getAsTree("javax_imageio_gif_image_1.0");
  var control=(IIOMetadataNode)tree.getElementsByTagName("GraphicControlExtension").item(0);
  control.setAttribute("delayTime","20");meta.setFromTree("javax_imageio_gif_image_1.0",tree);
  try(var out=ImageIO.createImageOutputStream(Path.of(args[1]).toFile())){writer.setOutput(out);writer.write(null,new IIOImage(image,null,meta),writer.getDefaultWriteParam());}finally{writer.dispose();}
  System.out.print("[");boolean first=true;
  for(String source:args)for(var frame:GIFUtils.readFramesStrict(Path.of(source),16,36)){
   var digest=MessageDigest.getInstance("SHA-256");for(var row:frame)for(var pixel:row)digest.update(new byte[]{(byte)pixel.getR(),(byte)pixel.getG(),(byte)pixel.getB()});
   if(!first)System.out.print(",");first=false;System.out.print("\\\""+HexFormat.of().formatHex(digest.digest())+"\\\"");
  }System.out.print("]");
 }
}`);
const java=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin/java.exe'):'java';
const resourceHashes=JSON.parse(execFileSync(java,['--class-path',path.join(root,'../ledGame-backend/target/classes'),helper,path.join(root,'release/win-unpacked/resources/media/gif/321_16_36.gif'),path.join(media,'opening-marker.gif'),path.join(root,'release/win-unpacked/resources/media/彩虹效果16x36.gif')],{encoding:'utf8'}));
const hashes=resourceHashes.slice(0,4),rainbowHashes=new Set(resourceHashes.slice(4));assert.ok(rainbowHashes.size>1);
assert.equal(hashes.length,4);const [three,two,one,marker]=hashes;
const hash=rgb=>createHash('sha256').update(Buffer.from(rgb)).digest('hex');
async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
const backendPort=await freePort(),rgbPort=await freePort();
const env={...process.env,LED_USER_DATA_DIR:data,LED_MEDIA_DIR:media,LED_PORTABLE_BACKEND_PORT:String(backendPort),LED_DEBUG_TCP_PORT:String(rgbPort),LED_ROOM_CONNECTION_ENABLED:'false',ELC408_ENABLED:'false',LED_DISABLE_DEVTOOLS:'1',SPRING_APPLICATION_JSON:JSON.stringify({led:{outputs:[{name:'debug-panel',enabled:true,host:'127.0.0.1',port:rgbPort}]},ledgame:{media:{'allow-legacy-absolute-paths':true}}})};
delete env.ELECTRON_RUN_AS_NODE;delete env.LED_BACKEND_URL;delete env.VITE_DEV_SERVER_URL;
let app,page;const passed=[],errors=[];
const request=async(route,method='GET',body)=>{const r=await fetch(`http://127.0.0.1:${backendPort}${route}`,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});assert.ok(r.ok,await r.clone().text());const result=await r.json();assert.equal(result.code,200,JSON.stringify(result));return result.data;};
const state=()=>request('/engine/game/state');
const button=name=>page.getByRole('button',{name,exact:true});
const trace=async()=>{const frames=await page.evaluate(()=>window.__openingFrames);return frames.map(f=>({time:f.time,hash:hash(f.rgb)}));};
async function resetTrace(){await page.evaluate(()=>{window.__openingFrames=[];});}
async function command(command){const sessionId=(await state()).sessionId;return page.evaluate(payload=>window.ledGame.sendDebugCommand(payload),{command,sessionId});}
async function waitForIntro(name){
 await expect.poll(async()=>(await state()).startingStandby,{timeout:10000}).toBe(true);
 const began=Date.now();const before=await page.locator('.editor-debug-workspace canvas').evaluate(c=>c.toDataURL());
 await page.waitForTimeout(1400);
 assert.equal((await state()).startingStandby,true);
 const frames=(await trace()).filter(f=>f.time>=began);
 assert.ok(frames.length>=12,JSON.stringify({name,frames}));
 assert.ok(frames.every(f=>rainbowHashes.has(f.hash)),JSON.stringify({name,frames}));
 assert.ok(new Set(frames.map(f=>f.hash)).size>=3);
 await expect.poll(()=>page.locator('.editor-debug-workspace canvas').evaluate(c=>c.toDataURL())).not.toBe(before);
 await page.screenshot({path:path.join(data,name+'-说明期间彩虹.png')});
 passed.push(name+'：真实开始说明语音期间彩虹GIF持续输出并在调试画布变帧');
}
async function waitForOpening(name,{pause=false,intro=false}={}){
 if(intro)await waitForIntro(name);
 await expect.poll(async()=>(await trace()).some(f=>f.hash===three),{timeout:15000}).toBe(true);
 if(pause){
  await button('暂停').click();const paused=await state();assert.equal(paused.engineState,'PAUSED');
  const before=await trace();await page.waitForTimeout(1100);const later=(await trace()).slice(before.length);
  assert.ok(later.every(f=>f.hash===three),JSON.stringify(later));await button('继续').click();
 }
 await page.screenshot({path:path.join(data,name+'-321.png')});
 await expect.poll(async()=>(await state()).engineState,{timeout:20000}).toBe('RUNNING');
 const frames=await trace();const positions=[three,two,one,marker].map(h=>frames.findIndex(f=>f.hash===h));
 await writeFile(path.join(data,name+'-frames.json'),JSON.stringify(frames,null,2));
 const openingFrames=frames.filter(f=>hashes.includes(f.hash)).filter((f,i,all)=>i===0||f.hash!==all[i-1].hash);
 assert.deepEqual(openingFrames.map(f=>f.hash),[three,two,one,marker]);
 assert.equal(frames.slice(positions[0]).some(f=>rainbowHashes.has(f.hash)),false,'彩虹不得覆盖321及原开场');
 assert.ok(positions.every(i=>i>=0),JSON.stringify({name,positions,frames:frames.map(f=>f.hash)}));
 assert.ok(positions.every((p,i)=>i===0||p>positions[i-1]),JSON.stringify(positions));
 assert.ok(frames[positions[1]].time-frames[positions[0]].time>=850);
 assert.ok(frames[positions[2]].time-frames[positions[1]].time>=850);
 assert.ok(frames[positions[3]].time-frames[positions[2]].time>=850);
 passed.push(name+'：真实RGB逐帧匹配3→2→1→原关卡GIF，每数字约1秒'+(pause?'，暂停保持并恢复':''));
}
try{
 app=await _electron.launch({executablePath:path.join(root,'release/win-unpacked/LED Game.exe'),env,timeout:90000});
 await expect.poll(()=>{page=app.windows().find(p=>p.url().includes('/dist/index.html')&&!p.url().includes('window='));return Boolean(page);},{timeout:90000}).toBe(true);
 page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 await expect.poll(()=>page.evaluate(async()=>(await window.ledGame.backendStatus()).status),{timeout:90000}).toBe('ready');
 const games=(await request('/games/manageable')).filter(g=>['simple','normal','diffcult'].includes(g.name));assert.equal(games.length,3);
 for(const game of games){
  const doc=await request(`/game-editor/${game.gameId}`);
  doc.globalTimeLimit=false;doc.globalLifeLimit=false;doc.participants=1;
  doc.commonConfig={...doc.commonConfig,gameStartAudio:'ReadyGo.mp3',levelPassAudio:'',levelRestartAudio:'',gameEndFailAudio:'',gameEndSuccessAudio:''};
  if(game.name==='simple')doc.commonConfig.pixelLightWiring={selectedRow:'0|0',
    form:{open:1,controlIdx:0,pixelPort:6,circlePort:7,order:1,forceAlign:1,
      topWallPixelLightNum:1,rightWallPixelLightNum:1,bottomWallPixelLightNum:1,leftWallPixelLightNum:1},
    rows:[0,1,2,3].map(wall=>({wall,idx:0,align:'35,15'}))};
  doc.audio={globalBackgroundSound:'',scoreSound:'',injurySound:'',purpleSound:''};
  doc.gif={standby:'',levelSettlement:'',levelFailure:'',gameFailure:'',gameOver:''};
  doc.levels=doc.levels.slice(0,2).map((l,i)=>({...l,option:{...l.option,startGIF:path.join(media,'opening-marker.gif'),bgVoice:'',pixelLightType:'0',timeLimitMode:'UNLIMITED',lifeLimitMode:'UNLIMITED',passLevelScore:1000},frameList:[{repeatTimes:1000,matrix:[{id:'safe-'+i,x:4,y:4,color:0,points:[[0,0]]},{id:'target-'+i,x:5,y:5,color:1,points:[[0,0]]}]}]}));
  // The existing absolute-path compatibility option is enabled only in this
  // isolated test, so its marker never writes to the packaged production media.
  await request(`/game-editor/${game.gameId}`,'PUT',doc);
 }
 await page.reload();await page.getByTestId('game-menu-button').waitFor();
 const simpleGame=games.find(g=>g.name==='simple');
 await page.getByTestId('game-menu-button').click();await page.getByRole('menuitem',{name:'游戏列表',exact:true}).click();
 const editCard=page.locator(`.game-card[data-id="${simpleGame.gameId}"]`);await editCard.hover();await editCard.getByRole('button',{name:'编辑',exact:true}).click();
 await button('符号灯布局').click();await button('绘制').click();
 assert.equal(await page.locator('.pixel-layout-row-error').count(),0);
 const geometry=await page.locator('.pixel-layout-preview').evaluate(svg=>{
  const floor=svg.querySelector('.pixel-layout-floor-grid rect'),num=(el,key)=>Number(el.getAttribute(key));
  return {floor:{x:num(floor,'x'),y:num(floor,'y'),width:num(floor,'width'),height:num(floor,'height')},
    lights:[...svg.querySelectorAll(':scope > g:has(> circle)')].map(g=>{
      const square=g.querySelector('rect'),circle=g.querySelector('circle');
      return {symbol:{x:num(square,'x')+num(square,'width')/2,y:num(square,'y')+num(square,'height')/2},
        circle:{x:num(circle,'cx'),y:num(circle,'cy')}};
    })};
 });
 assert.equal(geometry.lights.length,4);
 for(let wall=0;wall<4;wall++)for(const marker of ['symbol','circle']){
  const point=geometry.lights[wall][marker],f=geometry.floor;
  if(wall%2===0){assert.ok(Math.abs(point.x-(f.x+15.5*f.width/16))<.001);assert.ok(wall===0?point.y<f.y:point.y>f.y+f.height);}
  else{assert.ok(Math.abs(point.y-(f.y+35.5*f.height/36))<.001);assert.ok(wall===3?point.x<f.x:point.x>f.x+f.width);}
 }
 await page.screenshot({path:path.join(data,'符号灯四墙对齐.png')});
 await button('取消').click();await button('返回列表').click();
 passed.push('真实EXE符号灯布局按行列校验，四墙沿单轴对齐且符号灯/圆灯仍在外围');
 await page.evaluate(()=>{window.__openingFrames=[];window.ledGame.onLedFrame(f=>{if(f?.width===16&&f?.height===36)window.__openingFrames.push({time:f.receivedAt,rgb:Array.from(f.rgb)});});});
 async function open(game,level=0){
  await page.getByTestId('game-menu-button').click();await page.getByRole('menuitem',{name:'游戏列表',exact:true}).click();
  const card=page.locator(`.game-card[data-id="${game.gameId}"]`);await card.hover();await card.getByRole('button',{name:'调试游戏',exact:true}).click();
  await page.locator('.editor-debug-workspace').waitFor();
  assert.equal(await page.locator('[data-debug-field=startLevel], .debug-level-selection, .debug-level-configuration').count(),0);
  assert.equal(await button('切换关卡').count(),0);
  for(const label of ['起始关卡','运行状态','当前关卡'])assert.equal(await page.getByText(label,{exact:true}).count(),0);
  if(level)await page.locator(`[data-debug-level="${level}"]`).click();await resetTrace();
 }
 for(const game of games){
  await open(game);await button('启动游戏').click();await waitForOpening(game.name+'-首关',{pause:game.name==='simple',intro:true});
  if(game.name==='simple'){
   const lights=(await state()).peripheralLights;assert.equal(lights.enabled,true);assert.equal(lights.lights.length,4);
   assert.ok(lights.lights.every(light=>light.alignX===35&&light.alignY===15));
   await expect(page.locator('.debug-symbol-light')).toHaveCount(4);
   let raster;
   await expect.poll(async()=>{try{
    raster=await page.locator('.debug-light-board').evaluate(probeDebugBoard,{columns:16,rows:36,black:true});
    assertDebugBoardPixels(raster,{fixedAlignment:{row:35,column:15}});return true;
   }catch{return false;}},{timeout:10000}).toBe(true);
   await writeFile(path.join(data,'调试实际像素与外围灯.json'),JSON.stringify(raster,null,2));
   await page.screenshot({path:path.join(data,'符号灯调试同位置.png')});
   passed.push('真实后端冻结布局接受(35,15)且保留原字段，四对外围灯与实际像素格中心对齐，Canvas填满floor且末行无额外留白');
  }
  await resetTrace();await command('nextstage');await waitForOpening(game.name+'-第二关');
  await button('退出调试，返回游戏列表').click();
 }
 const owners=async()=>{const log=await readFile(path.join(data,'logs/backend.log'),'utf8');return new Set([...log.matchAll(/cue=READY_GO_VOICE asset=ReadyGo\.mp3 owner=(\S+)/g)].map(m=>m[1]));};
 await expect.poll(async()=>(await owners()).size).toBe(3);
 const simple=games.find(g=>g.name==='simple');await open(simple,1);await button('启动游戏').click();
 await expect.poll(async()=>(await trace()).some(f=>f.hash===three)).toBe(true);await command('endgame');
 await page.waitForTimeout(3400);assert.equal((await state()).engineState,'STOPPED');assert.equal((await owners()).size,3);
 assert.equal((await trace()).some(f=>[two,one,marker].includes(f.hash)),false);
 passed.push('非首关直接启动不触发ReadyGo，321中停止后无迟到换帧或开始玩法');
 passed.push('三游戏首关各触发一个ReadyGo媒体owner，第二关无新增语音');
 await button('退出调试，返回游戏列表').click();await open(simple);await button('启动游戏').click();
 await expect.poll(async()=>(await state()).startingStandby).toBe(true);
 await command('endgame');const stoppedAt=Date.now();await page.waitForTimeout(4000);
 assert.equal((await state()).engineState,'STOPPED');assert.equal((await owners()).size,3);
 assert.equal((await trace()).some(f=>f.time>stoppedAt+200),false);
 passed.push('开始说明中停止后彩虹与语音清理，无迟到321或玩法复活');
 await button('退出调试，返回游戏列表').click();
 const rank=(await request('/games/manageable')).find(g=>g.type==='rank');assert.ok(rank);
 const rankDoc=await request(`/rank-game-editor/${rank.gameId}`);
 rankDoc.siteSizeWidth=8;rankDoc.siteSizeHeight=8;rankDoc.globalTimeLimit=false;rankDoc.minPlayers=1;
 rankDoc.commonConfig={...rankDoc.commonConfig,gameStartAudio:'ReadyGo.mp3',levelPassAudio:'',levelRestartAudio:'',gameEndFailAudio:'',gameEndSuccessAudio:''};
 rankDoc.audio={globalBackgroundSound:'',scoreSound:'',injurySound:'',purpleSound:''};rankDoc.gif={standby:'',levelSettlement:'',levelFailure:'',gameFailure:'',gameOver:''};
 rankDoc.levels=[{...rankDoc.levels[0],durationSeconds:60,backgroundVoice:'',gameplayIntro:'',startGif:'',bounds:{minX:0,minY:0,maxX:7,maxY:7}}];
 await request(`/rank-game-editor/${rank.gameId}`,'PUT',rankDoc);
 await page.reload();await page.getByTestId('game-menu-button').waitFor();
 await page.evaluate(()=>{window.__openingFrames=[];window.ledGame.onLedFrame(f=>{if(f?.rgb?.length===16*36*3)window.__openingFrames.push({time:f.receivedAt,rgb:Array.from(f.rgb)});});});
 await open(rank);await button('启动游戏').click();await waitForIntro('Rank8x8');
 await expect.poll(async()=>(await state()).engineState,{timeout:10000}).toBe('RUNNING');
 assert.equal((await state()).startingStandby,false);
 await expect.poll(async()=>{const frame=await page.evaluate(()=>window.ledGame.latestFrame());return frame?.width===8&&frame?.height===8;}).toBe(true);
 const rankCanvas=await page.locator('.editor-debug-workspace canvas').boundingBox();assert.ok(Math.abs(rankCanvas.width-rankCanvas.height)<1);
 assert.equal((await trace()).some(f=>hashes.includes(f.hash)),false);
 await page.screenshot({path:path.join(data,'Rank8x8-说明后游戏矩阵.png')});
 await button('退出调试，返回游戏列表').click();
 passed.push('无公共321的Rank8x8说明期间显示16x36彩虹，完成后切8x8玩法，原尺寸隔离保持');
 assert.deepEqual(errors,[]);
 const closed=app.waitForEvent('close',{timeout:30000});
 await page.locator('.window-titlebar-control--close').click();await closed;app=null;
 await expect.poll(async()=>{try{await state();return false;}catch{return true;}},{timeout:15000}).toBe(true);
 passed.push('退出真实EXE后后端释放');
}catch(e){errors.push(e.stack);await page?.screenshot({path:path.join(data,'失败.png')}).catch(()=>{});throw e;}
finally{if(app){await page?.evaluate(()=>window.ledGame.sendDebugCommand({command:'endgame'})).catch(()=>{});await app.close().catch(()=>{});}await writeFile(path.join(data,'验证记录.json'),JSON.stringify({passed,errors},null,2));console.log('隔离证据：'+data);}
