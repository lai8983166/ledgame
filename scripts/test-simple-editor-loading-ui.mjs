// Real component, deterministic large document; no production DB/hardware writes.
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
const output=path.join(root,'.build/editor-loading-ui');await mkdir(output,{recursive:true});
const server=await createServer({root,server:{host:'127.0.0.1',port:0}});await server.listen();
const browser=await chromium.launch({executablePath:path.join(cache,chrome,'chrome-win64/chrome.exe')});
const page=await browser.newPage({viewport:{width:1366,height:768}});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const baseline=process.argv.includes('--baseline');
try {
  await page.addInitScript(()=>{
    window.appLanguage={get:async()=>'zh-CN',onChanged:()=>()=>{}};
    const game={id:1,name:'大游戏',type:'default',mode:'[1]',siteSizeWidth:16,siteSizeHeight:36,commonConfig:{},gif:{},levels:Array.from({length:10},(_,l)=>({label:'Level '+l,option:{bgVoice:'stage-'+l+'.mp3'},frameList:Array.from({length:40},(_,f)=>({repeatTimes:2,matrix:Array.from({length:170},(_,i)=>({id:`${l}-${f}-${i}`,x:i%16,y:Math.floor(i/16),color:i%4,points:[[0,0]],extra:{keep:true}}))}))}))};
    window.fixture={game,saves:[],failSave:false,defer:false,failLoad:false};
    window.ledGame={
      getGameEditor:async id=>{if(window.fixture.defer)await new Promise(resolve=>window.fixture.finishLoad=resolve);if(window.fixture.failLoad)throw Error('读取失败');return {data:structuredClone({...game,id})};},
      listGameCategories:async()=>({data:[]}),
      saveGameEditor:async(id,payload)=>{if(window.fixture.failSave)throw Error('保存失败');window.fixture.saves.push(structuredClone(payload));return {data:{saved:true,gameId:id}};},
      gameState:async()=>({data:{engineState:'IDLE',queueSummary:{waiting:[]}}}),
      prepareEditorDebugHardware:async()=>{},onEngineState:()=>()=>{},onLedFrame:()=>()=>{},restoreFocus:async()=>{},
    };
    window.spiritLibrary={list:async()=>({data:[]})};
    window.latencyTasks=[];new PerformanceObserver(list=>window.latencyTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask'});
    window.beginTiming=()=>{
      window.latencyTasks=[];window.startTime=performance.now();window.documentSerializations=0;
      const original=JSON.stringify;window.restoreStringify=()=>JSON.stringify=original;
      JSON.stringify=function(value,...args){if(value?.id===1&&Array.isArray(value.levels))window.documentSerializations++;return original.call(this,value,...args);};
    };
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/ui/catalog-library-harness.html`);
  await page.waitForFunction(()=>window.mountComponent);
  await page.evaluate(()=>{window.beginTiming();window.mountComponent('SimpleGameEditorView',{gameId:1});});
  await page.waitForFunction(()=>window.getComponentSetup()?.editorFitReady);
  const measurements=await page.evaluate(()=>{window.restoreStringify();return {readyMs:performance.now()-window.startTime,serializations:window.documentSerializations,longTasks:window.latencyTasks};});
  await writeFile(path.join(output,baseline?'before.json':'after.json'),JSON.stringify(measurements,null,2));
  console.log('加载测量：'+JSON.stringify(measurements));
  if(baseline)process.exitCode=0;
  else {
    assert.equal(measurements.serializations,1,'loading must not clone/stringify the whole document twice');
    const equivalent=await page.evaluate(()=>{
      const s=window.getComponentSetup(),before=JSON.stringify(s.document);
      const old=JSON.parse(before);
      const integer=(v)=>Number.isFinite(Number(v))?Math.trunc(Number(v)):0;
      for(const level of old.levels){
        // The loaded options already carry the existing defaults.
        for(const frame of level.frameList){
          const points=o=>!Array.isArray(o.points)||!o.points.length?[[0,0]]:o.points.map(p=>Array.isArray(p)?[integer(p[0]),integer(p[1])]:[integer(p?.x),integer(p?.y)]);
          frame.matrix=frame.matrix.filter(o=>points(o).every(([dx,dy])=>{const x=integer(o.x)+dx,y=integer(o.y)+dy;return x>=0&&x<16&&y>=0&&y<36;})).map(o=>({...o,x:Number(o.x||0),y:Number(o.y||0),color:Math.min(3,Math.max(0,Math.floor(Number(o.color)||0))),points:points(o)}));
          delete frame.__matrixVersion;
        }
      }
      const next=s.createEditorPayload();
      next.levels[0].frameList[0].matrix[0].points[0][0]=999;
      return {same:JSON.stringify(old)===s.createEditorFingerprint(),unchanged:before===JSON.stringify(s.document),frames:old.levels.reduce((n,l)=>n+l.frameList.length,0)};
    });
    assert.equal(equivalent.same,true);assert.equal(equivalent.unchanged,true);assert.equal(equivalent.frames,400);
    await page.evaluate(()=>{const s=window.getComponentSetup();s.document.name='未保存';window.fixture.failSave=true;return s.saveEditor();});
    assert.equal(await page.evaluate(()=>{const s=window.getComponentSetup();return s.createEditorFingerprint()!==s.savedFingerprint;}),true);
    await page.evaluate(()=>window.getComponentSetup().startGame());
    assert.equal(await page.evaluate(()=>window.getComponentSetup().debugEntryOpen),true);
    await page.evaluate(()=>{const s=window.getComponentSetup();s.debugEntryOpen=false;window.fixture.failSave=false;return s.saveEditor();});
    assert.equal(await page.evaluate(()=>{const s=window.getComponentSetup();return s.createEditorFingerprint()===s.savedFingerprint;}),true);
    assert.equal(await page.evaluate(()=>window.fixture.saves.at(-1).levels.reduce((n,l)=>n+l.frameList.length,0)),400);
    // Load feedback must remain outside the hidden fit shell; cancelling an old
    // API response must not commit it after a replacement component mounts.
    await page.evaluate(()=>{window.fixture.defer=true;window.mountComponent('SimpleGameEditorView',{gameId:1});window.oldSetup=window.getComponentSetup();});
    await page.locator('.simple-editor-loading').waitFor({state:'visible'});
    assert.equal(await page.locator('.editor-toolbar').count(),0);
    await page.evaluate(()=>{const finish=window.fixture.finishLoad;window.fixture.defer=false;window.mountComponent('SimpleGameEditorView',{gameId:2});finish();});
    await page.waitForFunction(()=>window.getComponentSetup()?.editorFitReady);
    assert.equal(await page.evaluate(()=>window.getComponentSetup().document.id),2);
    assert.equal(await page.evaluate(()=>window.oldSetup.document),null);
    await page.evaluate(()=>{window.fixture.failLoad=true;window.fixture.defer=true;window.mountComponent('SimpleGameEditorView',{gameId:3});});
    await page.locator('.simple-editor-loading').waitFor({state:'visible'});
    await page.waitForTimeout(100);
    await page.evaluate(()=>{window.fixture.defer=false;window.fixture.finishLoad();});
    await page.locator('.editor-feedback .error-line').waitFor({state:'visible'});
    assert.equal(await page.locator('.simple-editor-loading').count(),0);
    assert.equal(await page.locator('.editor-toolbar').count(),0);
    assert.deepEqual(errors,[]);
    console.log('通过：大文档单次序列化、旧保存结果等价、无引用泄漏、保存失败/成功和未保存提示、加载可见及过期响应丢弃');
  }
} finally {await browser.close();await server.close();}
