// Real release EXE and embedded backend, using isolated database/settings/media.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
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
const hashes=JSON.parse(execFileSync(java,['--class-path',path.join(root,'../ledGame-backend/target/classes'),helper,path.join(root,'release/win-unpacked/resources/media/gif/321_16_36.gif'),path.join(media,'opening-marker.gif')],{encoding:'utf8'}));
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
async function waitForOpening(name,{pause=false}={}){
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
  doc.commonConfig={...doc.commonConfig,gameStartAudio:'',levelPassAudio:'',levelRestartAudio:'',gameEndFailAudio:'',gameEndSuccessAudio:''};
  doc.audio={globalBackgroundSound:'',scoreSound:'',injurySound:'',purpleSound:''};
  doc.gif={standby:'',levelSettlement:'',levelFailure:'',gameFailure:'',gameOver:''};
  doc.levels=doc.levels.slice(0,2).map((l,i)=>({...l,option:{...l.option,startGIF:path.join(media,'opening-marker.gif'),bgVoice:'',pixelLightType:'0',timeLimitMode:'UNLIMITED',lifeLimitMode:'UNLIMITED',passLevelScore:1000},frameList:[{repeatTimes:1000,matrix:[{id:'safe-'+i,x:4,y:4,color:0,points:[[0,0]]},{id:'target-'+i,x:5,y:5,color:1,points:[[0,0]]}]}]}));
  // The existing absolute-path compatibility option is enabled only in this
  // isolated test, so its marker never writes to the packaged production media.
  await request(`/game-editor/${game.gameId}`,'PUT',doc);
 }
 await page.reload();await page.getByTestId('game-menu-button').waitFor();
 await page.evaluate(()=>{window.__openingFrames=[];window.ledGame.onLedFrame(f=>{if(f?.width===16&&f?.height===36)window.__openingFrames.push({time:f.receivedAt,rgb:Array.from(f.rgb)});});});
 async function open(game,level=0){
  await page.getByTestId('game-menu-button').click();await page.getByRole('menuitem',{name:'游戏列表',exact:true}).click();
  const card=page.locator(`.game-card[data-id="${game.gameId}"]`);await card.hover();await card.getByRole('button',{name:'调试游戏',exact:true}).click();
  await page.locator('.editor-debug-workspace').waitFor();
  assert.equal(await page.locator('[data-debug-field=startLevel], .debug-level-selection').count(),0);
  assert.equal(await button('切换关卡').count(),0);
  for(const label of ['起始关卡','运行状态','当前关卡'])assert.equal(await page.getByText(label,{exact:true}).count(),0);
  if(level)await page.locator(`[data-debug-level="${level}"]`).click();await resetTrace();
 }
 for(const game of games){
  await open(game);await button('启动游戏').click();await waitForOpening(game.name+'-首关',{pause:game.name==='simple'});
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
 assert.deepEqual(errors,[]);await app.close();app=null;
 await expect.poll(async()=>{try{await state();return false;}catch{return true;}},{timeout:15000}).toBe(true);
 passed.push('退出真实EXE后后端释放');
}catch(e){errors.push(e.stack);await page?.screenshot({path:path.join(data,'失败.png')}).catch(()=>{});throw e;}
finally{if(app){await page?.evaluate(()=>window.ledGame.sendDebugCommand({command:'endgame'})).catch(()=>{});await app.close().catch(()=>{});}await writeFile(path.join(data,'验证记录.json'),JSON.stringify({passed,errors},null,2));console.log('隔离证据：'+data);}
