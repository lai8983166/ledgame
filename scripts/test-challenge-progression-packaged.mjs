import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {copyFile,mkdir,mkdtemp,readFile,unlink,writeFile} from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import {execFileSync,spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const packageDir=path.resolve(process.env.LED_TEST_PACKAGE_DIR || path.join(root,'release/win-unpacked'));
const require=createRequire(path.join(root,'../ledGame-platform/package.json'));
const {chromium}=require('playwright');const expect=require('@playwright/test').expect.configure({timeout:30000});
await mkdir(path.join(root,'.build'),{recursive:true});
const data=await mkdtemp(path.join(root,'.build/editor-debug-packaged-'));
const gifHashSource=path.join(data,'StandbyHashes.java');
await writeFile(gifHashSource,`import com.ledgame.GameApp.Runtime.GIFUtils;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
public class StandbyHashes { public static void main(String[] args) throws Exception {
 var frames=GIFUtils.readFramesStrict(Path.of(args[0]),16,36);
 System.out.print("[");boolean first=true;
 for(var frame:frames){var digest=MessageDigest.getInstance("SHA-256");
  for(var row:frame)for(var pixel:row)digest.update(new byte[]{(byte)pixel.getR(),(byte)pixel.getG(),(byte)pixel.getB()});
  if(!first)System.out.print(",");first=false;System.out.print("\\\""+HexFormat.of().formatHex(digest.digest())+"\\\"");
 }System.out.print("]"); }}
`);
const java=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin/java.exe'):'java';
const gifHashes=new Set(JSON.parse(execFileSync(java,['--class-path',path.join(root,'../ledGame-backend/target/classes'),gifHashSource,path.join(packageDir,'resources/media/彩虹效果16x36.gif')],{encoding:'utf8'})));
assert.ok(gifHashes.size>1);
const frameHash=frame=>createHash('sha256').update(Buffer.from(frame.rgb)).digest('hex');
async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
const backendPort=await port(),rgbPort=await port();
await mkdir(path.join(data,'settings'),{recursive:true});
await writeFile(path.join(data,'settings/application.json'),JSON.stringify({mode:'game',entryMethod:'touch'}));
const env={...process.env,LED_USER_DATA_DIR:data,LED_PORTABLE_BACKEND_PORT:String(backendPort),LED_DEBUG_TCP_PORT:String(rgbPort),
  LED_ROOM_CONNECTION_ENABLED:'false',ELC408_ENABLED:'false',LED_DISABLE_DEVTOOLS:'1',
  SPRING_APPLICATION_JSON:JSON.stringify({led:{outputs:[{name:'debug-panel',enabled:true,host:'127.0.0.1',port:rgbPort}]}})};
delete env.ELECTRON_RUN_AS_NODE;
let app,browser,page;const passed=[];
const request=async(route,method='GET',body)=>{
  const response=await fetch(`http://127.0.0.1:${backendPort}${route}`,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  assert.equal(response.ok,true,await response.clone().text());const result=await response.json();assert.equal(result.code,200,result.message);return result.data;
};
const state=()=>request('/engine/game/state');
const button=name=>page.getByRole('button',{name,exact:true});
try{
  const activation = path.join(data, 'activation');
  await mkdir(activation, {recursive: true});
  await copyFile(path.join(process.env.APPDATA, 'led-game', 'activation', 'license.json'), path.join(activation, 'license.json'));
  const devToolsPort=await port();
  const endpoint='http://127.0.0.1:'+devToolsPort;
  app=spawn(path.join(packageDir,'LED Game.exe'),['--remote-debugging-port='+devToolsPort],{env,windowsHide:true,stdio:'ignore'});
  await expect.poll(async()=>{try{return (await fetch(endpoint+'/json/version')).ok;}catch{return false;}}).toBe(true);
  browser=await chromium.connectOverCDP(endpoint);
  await expect.poll(()=>{
    page=browser.contexts()[0].pages().find(p=>p.url().endsWith('/dist/index.html'));
    return Boolean(page);
  }).toBe(true);
  page.setDefaultTimeout(20000);
  await page.locator('.game-category-heading').waitFor();
  const games=await request('/games/manageable');
  const simple=games.find(g=>g.name==='simple');
  assert.ok(simple);
  const doc=await request(`/game-editor/${simple.gameId}`);
  doc.siteSizeWidth = 16;
  doc.siteSizeHeight = 36;
  // Two finite-life levels exercise progression and the transition back to the actual standby media.
  const template = doc.levels[0];
  doc.globalLifeLimit = false;
  doc.levels = [2, 4].map((life, index) => ({
    ...template,
    label: `Debug ${index + 1}`,
    option: {...template.option, lifeLimitMode: 'LIMITED', lifeLimit: true, lifeLimitValue: life,
      timeLimitMode: 'UNLIMITED', timeLimit: false, pixelLightType: 0},
    frameList: [{repeatTimes: 1, matrix: [
      {id: 'target', x: 1, y: 1, color: index===0 ? 1 : 3, points: [[0, 0],[1, 0]]},
    ]}],
  }));
  await request(`/game-editor/${simple.gameId}`, 'PUT', doc);
  await page.reload();
  await page.getByTestId('game-menu-button').click();
  await page.getByRole('menuitem', {name: '游戏列表', exact: true}).click();
  const card = page.locator(`.game-card[data-id="${simple.gameId}"]`);
  await card.hover();
  await card.getByRole('button', {name: '调试游戏', exact: true}).click();
  await button('启动游戏').click();
  const lifeReadout = page.locator('.debug-workspace-controls dt').filter({hasText: '生命'}).locator('xpath=following-sibling::dd[1]');
  for (const [index, life] of [2, 4].entries()) {
    await expect.poll(async () => {
      const current = await state();
      return current.engineState === 'RUNNING' && current.currentStageIndex === index;
    }).toBe(true);
    await expect(page.locator(`[data-debug-level="${index}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect(lifeReadout).toHaveText(String(life));
    const {sessionId} = await state();
    for (const x of [1,2]) {
      const hits = index===0 ? 1 : 2;
      for(let hit=0;hit<hits;hit++){
        await page.evaluate(({sessionId,x})=>window.ledGame.sendDebugCommand({command:'tileinput',sessionId,x,y:1}),{sessionId,x});
      }
      if(x===1){
        const after=await state();
        assert.equal(after.engineState,'RUNNING');
        assert.equal(after.currentStageIndex,index);
      }
    }
  }
  await expect.poll(async () => (await state()).engineState).toBe('IDLE');
  await expect.poll(async () => {
    const frame = await page.evaluate(() => window.ledGame.latestFrame());
    return frame?.width === 16 && frame?.height === 36 && gifHashes.has(frameHash(frame));
  }).toBe(true);
  const backendLog=await readFile(path.join(data,'logs/backend.log'),'utf8');
  assert.match(backendLog,/media cue started cue=SCORE_SFX/);
  assert.match(backendLog,/media cue started cue=DOUBLE_SFX/);
  passed.push('蓝紫对象逐格踩踏，紫格触发得分和 double 音效；两关生命值从 2 切换至 4，末关结束后恢复真实待机 GIF');
  await page.evaluate(()=>{void window.ledGame.closeWindow();});
  await expect.poll(async()=>{try{await state();return false;}catch{return true;}},{timeout:15000}).toBe(true);
  passed.push('退出真实 EXE 后内嵌后端释放');
  console.log(JSON.stringify({data,passed},null,2));
}catch(error){if(page&&!page.isClosed())await page.screenshot({path:path.join(data,'失败.png')});console.error('证据目录：'+data);throw error;}
finally{
  if(app?.exitCode===null){
    await page?.evaluate(()=>{void window.ledGame.closeWindow();}).catch(()=>{});
    await expect.poll(()=>app.exitCode,{timeout:10000}).not.toBeNull().catch(()=>{
      execFileSync('taskkill.exe',['/PID',String(app.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
    });
  }
  await browser?.close();
  await unlink(path.join(data,'activation','license.json')).catch(error=>{if(error.code!=='ENOENT')throw error;});
  await writeFile(path.join(data,'验证记录.json'),JSON.stringify({passed},null,2));
}
