import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=createRequire(path.join(root,'../ledGame-platform/package.json'))('playwright');
const cache=path.join(process.env.LOCALAPPDATA,'ms-playwright'),chrome=(await readdir(cache)).filter(name=>/^chromium-\d+$/.test(name)).sort().at(-1);
const output=path.join(root,'.build/editor-coordinate-ui');await mkdir(output,{recursive:true});
const server=await createServer({root,server:{host:'127.0.0.1',port:0,hmr:false}});await server.listen();
const browser=await chromium.launch({executablePath:path.join(cache,chrome,'chrome-win64/chrome.exe')});
const page=await browser.newPage({viewport:{width:1366,height:900},deviceScaleFactor:Number(process.env.TEST_DPR || 1)});page.setDefaultTimeout(10000);
const passed=[],errors=[];page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{
  window.fixture={calls:0,fail:false,doc:{id:7,name:'游戏',description:'原描述',remark:'原备注',type:'default',mode:'[1]',cover:'cover.png',firstCatalog:'1',siteSizeWidth:16,siteSizeHeight:36,
    audio:{scoreSound:'score.mp3',injurySound:'injury.mp3',purpleSound:'double.mp3'},gif:{standby:'idle.gif',gameFailure:'fail.gif',gameOver:'over.gif'},
    commonConfig:{gameStartAudio:'start.mp3',gameEndSuccessAudio:'success.mp3',gameEndFailAudio:'fail.mp3',levelPassAudio:'pass.mp3',levelRestartAudio:'restart.mp3',playIntroVideo:'legacy-global.mp4'},
    levels:[{label:'关卡',option:{rewardPoints:0,timeLimitMode:'UNLIMITED',lifeLimitMode:'UNLIMITED',bgVoice:'legacy-bgm.mp3',playIntroVideo:'legacy-level.mp4',voiceDesc:'legacy-voice.mp3',desc:'原关卡说明'},frameList:[{repeatTimes:1,matrix:[]}]}]}};
  const get=async()=>({data:structuredClone(window.fixture.doc)});
  const save=async(id,doc)=>{window.fixture.calls++;if(window.fixture.fail)throw Error('模拟保存失败');window.fixture.doc=structuredClone(doc);return{data:{saved:true,gameId:id}};};
  window.ledGame={getGameEditor:get,getRankGameEditor:get,saveGameEditor:save,saveRankGameEditor:save,validateRankGameEditor:async()=>({data:{valid:true}}),listGameCategories:async()=>({data:[{id:1,name:'分类'}]}),
    exportFrameJson:async payload=>{window.fixture.exportedLevel=JSON.parse(payload.content);return{canceled:false,filePath:'isolated-level.json'};},
    importFrameJson:async()=>({canceled:false,content:JSON.stringify(window.fixture.exportedLevel)})};
  window.spiritLibrary={list:async()=>({data:[]})};
  window.mediaLibrary={list:async()=>({items:[{kind:'file',name:'intro.gif',relativePath:'intro.gif',mediaType:'image'},{kind:'file',name:'voice.mp3',relativePath:'voice.mp3',mediaType:'audio'},{kind:'file',name:'intro.mp4',relativePath:'intro.mp4',mediaType:'video'}]}),getPreviewUrl:async path=>({url:'',mediaType:path.endsWith('.mp4')?'video':path.endsWith('.mp3')?'audio':'image'})};
});
const mount=async name=>{await page.evaluate(name=>window.mountComponent(name,{gameId:7}),name);await page.waitForFunction(()=>Boolean(window.getComponentSetup()?.document));};
const button=name=>page.getByRole('button',{name,exact:true});
const close=async()=>{await page.locator('.editor-save-dialog button').click();await page.locator('.editor-save-dialog').waitFor({state:'hidden'});};
const field=label=>page.locator('.global-config-field').filter({has:page.locator('.global-config-label').filter({hasText:new RegExp('^'+label+'$')})}).locator('input');
async function check(name,fn){await fn();passed.push(name);console.log('通过：'+name);}
const tab = pageName => pageName === 'levels' ? page.locator('.level-sequence-row .sequence-pill').first() : page.locator(`[data-editor-page="${pageName}"]`);
const dirty = () => page.evaluate(() => window.getComponentSetup().hasUnsavedChanges());
try {
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/ui/catalog-library-harness.html`,{timeout:60000,waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.mountComponent);await mount('SimpleGameEditorView');
  await page.waitForFunction(()=>window.getComponentSetup().editorFitReady);

  // In-memory editor fixtures only; no database or native application data.

  for(const viewport of [{width:1366,height:768},{width:1280,height:720},{width:1920,height:1080}]){
    await page.setViewportSize(viewport);await mount('SimpleGameEditorView');
    await page.waitForFunction(()=>window.getComponentSetup().editorFitReady);
    await page.locator('[data-editor-page="wiring"]').click();
    const canvas=page.locator('.elc408-wiring-canvas canvas');await canvas.waitFor();await page.waitForTimeout(150);
    const geometry=await canvas.evaluate(c=>{const r=c.getBoundingClientRect(),w=parseFloat(c.style.width),h=parseFloat(c.style.height),cell=Math.max(8,Math.min(w/16,h/36));return {left:r.left,top:r.top,sx:r.width/w,sy:r.height/h,cell,ox:Math.max(0,(w-cell*16)/2),oy:Math.max(0,(h-cell*36)/2)};});
    const point=(x,y)=>({x:geometry.left+(geometry.ox+(x+.5)*geometry.cell)*geometry.sx,y:geometry.top+(geometry.oy+(y+.5)*geometry.cell)*geometry.sy});
    const click=async(x,y,button='left')=>{const p=point(x,y);await page.mouse.click(p.x,p.y,{button});};
    const draft=()=>page.evaluate(()=>window.getComponentSetup().wiringPageRef.getDraft().lines.flat());
    await click(1,2);assert.deepEqual(await draft(),[[1,2]]);
    await click(1,2,'right');assert.deepEqual(await draft(),[]);
    const start=point(2,3),end=point(4,5);
    await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:5});await page.mouse.up();
    let points=await draft();assert.equal(points.length,9);assert.ok(points.some(([x,y])=>x===2&&y===3));assert.ok(points.some(([x,y])=>x===4&&y===5));
    await page.screenshot({path:path.join(output,'wiring-'+viewport.width+'.png')});
    await page.mouse.move(end.x,end.y);await page.mouse.down({button:'right'});await page.mouse.move(start.x,start.y,{steps:5});await page.mouse.up({button:'right'});assert.deepEqual(await draft(),[]);
    await click(15,35);assert.deepEqual(await draft(),[[15,35]]);
    passed.push('布线单点添加/删除、正反向框选及末格 '+viewport.width);
    await page.locator('.level-sequence-row .sequence-pill').first().click();
    await page.evaluate(()=>{window.getComponentSetup().panoramaMode=true;});await page.waitForTimeout(100);
    const rgb=page.locator('.matrix-overlay-canvas');const box=await rgb.boundingBox();
    const x=box.x+box.width*.5,y=box.y+box.height*.5;
    await page.mouse.click(x,y,{button:'right'});
    const menu=page.locator('.matrix-context-menu');await menu.waitFor();const rect=await menu.boundingBox();
    assert.ok(Math.abs(rect.x-x)<1,JSON.stringify({rect,x,y}));assert.ok(Math.abs(rect.y-y)<1);
    await page.screenshot({path:path.join(output,'context-'+viewport.width+'.png')});
    await menu.getByRole('button',{name:'选择',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.getComponentSetup().selectionMode),true);
    passed.push('真实右键菜单跟随鼠标且操作可用 '+viewport.width);
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed,errors},null,2));
  await writeFile(path.join(output,'验证记录.json'),JSON.stringify({passed,errors},null,2));
}finally{await browser.close();await server.close();}
