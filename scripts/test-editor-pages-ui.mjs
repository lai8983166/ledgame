import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=createRequire(path.join(root,'../ledGame-platform/package.json'))('playwright');
const cache=path.join(process.env.LOCALAPPDATA,'ms-playwright'),chrome=(await readdir(cache)).filter(name=>/^chromium-\d+$/.test(name)).sort().at(-1);
const output=path.join(root,'.build/editor-pages');await mkdir(output,{recursive:true});
const server=await createServer({root,server:{host:'127.0.0.1',port:0,hmr:false}});await server.listen();
const browser=await chromium.launch({executablePath:path.join(cache,chrome,'chrome-win64/chrome.exe')});
const page=await browser.newPage({viewport:{width:1366,height:900}});page.setDefaultTimeout(10000);
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
const tab = pageName => page.locator(`[data-editor-page="${pageName}"]`);
const dirty = () => page.evaluate(() => window.getComponentSetup().hasUnsavedChanges());
try {
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/ui/catalog-library-harness.html`,{timeout:60000,waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.mountComponent);await mount('SimpleGameEditorView');
  await page.waitForFunction(()=>window.getComponentSetup().editorFitReady);
  await check('同级页面无模态及内部保存，切换不写入且草稿保留',async()=>{
    assert.equal(await page.getByRole('tab').count(),3);
    await tab('global').click();
    assert.equal(await page.locator('[role=dialog]').count(),0);
    assert.equal(await button('保存').count(),1);
    assert.equal(await dirty(),false);
    await field('名称').fill('统一保存名称');
    assert.equal(await dirty(),true);
    await tab('wiring').click();await page.locator('.elc408-wiring-panel').waitFor();
    assert.equal(await page.locator('[role=dialog]').count(),0);
    assert.equal(await page.locator('.game-wiring-page .elc408-actions:not(.elc408-file-actions)').count(),0);
    assert.equal(await page.evaluate(()=>window.getComponentSetup().wiringPageRef.hasChanges()),false);
    await tab('levels').click();
    await page.evaluate(()=>{const state=window.getComponentSetup();state.document.levels[0].option.desc='关卡草稿';state.savePixelLightLayout({selectedRow:'',form:{open:0}});});
    await tab('global').click();assert.equal(await field('名称').inputValue(),'统一保存名称');
    assert.equal(await page.evaluate(()=>window.fixture.calls),0);
    await page.screenshot({path:path.join(output,'全局配置页面.png')});
  });
  await check('统一保存三个页面，失败保留且只发一次请求，成功清理dirty并可回读',async()=>{
    await tab('wiring').click();
    await page.locator('.elc408-wiring-panel').evaluate(node=>node.__vueParentComponent.setupState.document.lines=[[[1,2],[2,2]]]);
    await page.screenshot({path:path.join(output,'布线页面.png')});
    await page.evaluate(()=>window.fixture.fail=true);await button('保存').click();
    await page.locator('.editor-save-dialog').waitFor();assert.equal(await page.evaluate(()=>window.fixture.calls),1);
    assert.equal(await dirty(),true);await close();
    await tab('global').click();assert.equal(await field('名称').inputValue(),'统一保存名称');
    await page.evaluate(()=>window.fixture.fail=false);await button('保存').click();await page.locator('.editor-save-dialog').waitFor();
    assert.equal(await page.evaluate(()=>window.fixture.calls),2);
    const doc=await page.evaluate(()=>window.fixture.doc);
    assert.equal(doc.name,'统一保存名称');assert.equal(doc.levels[0].option.desc,'关卡草稿');
    assert.deepEqual(doc.wiringData.lines,[[[1,2],[2,2]]]);assert.equal(doc.commonConfig.pixelLightWiring.form.open,0);assert.equal(await dirty(),false);await close();
    await mount('SimpleGameEditorView');await tab('global').click();assert.equal(await field('名称').inputValue(),'统一保存名称');
    await tab('wiring').click();await page.locator('.elc408-wiring-panel').waitFor();
    assert.deepEqual(await page.evaluate(()=>window.getComponentSetup().wiringPageRef.getDraft().lines),[[[1,2],[2,2]]]);
  });
  await check('缩小场地保留布线点并拒绝超界保存，修正后统一保存',async()=>{
    await tab('global').click();await field('宽度').fill('1');await tab('wiring').click();
    const before=await page.evaluate(()=>window.fixture.calls);await button('保存').click();await page.locator('.editor-save-dialog').waitFor();
    assert.equal(await page.evaluate(()=>window.fixture.calls),before);assert.equal(await dirty(),true);await close();
    await tab('global').click();await field('宽度').fill('16');await button('保存').click();await page.locator('.editor-save-dialog').waitFor();await close();
  });
  await check('三个页面在大小视口完整显示，返回关卡后矩阵可操作',async()=>{
    for(const width of [1920,1366,1024]){
      await page.setViewportSize({width,height:768});
      for(const name of ['global','wiring','levels']){
        await tab(name).click();await page.waitForTimeout(150);
        const save=await button('保存').boundingBox();assert.ok(save.x>=0&&save.y>=0&&save.x+save.width<=width);
        const panel=page.locator(name==='global'?'.global-config-page':name==='wiring'?'.game-wiring-page':'.editor-level-page');
        const bounds=await panel.boundingBox();assert.ok(bounds.width>0&&bounds.height>0);assert.ok(bounds.y+bounds.height<=770,JSON.stringify({name,width,bounds}));
        if(width===1366)await page.screenshot({path:path.join(output,`${name}-1366.png`)});
      }
    }
    await page.evaluate(()=>{const s=window.getComponentSetup();s.selectDrawingTool('add');s.handleCellClick(0,0);});
    assert.equal(await dirty(),true);
  });
  await check('新建默认配置页，原Rank全局配置仍为弹窗',async()=>{
    await page.evaluate(()=>{const initialDocument=structuredClone(window.fixture.doc);delete initialDocument.id;window.mountComponent('SimpleGameEditorView',{initialDocument,openGlobalConfigOnEntry:true});});
    await page.waitForFunction(()=>window.getComponentSetup()?.editorPage==='global');
    await page.evaluate(()=>{window.fixture.doc.type='rank';window.fixture.doc.levels=[{type:1,durationSeconds:60,bounds:{minX:0,maxX:15,minY:0,maxY:35}}];});await mount('RankGameEditorView');await button('全局配置').click();await page.locator('.global-config-backdrop[role=dialog],.global-config-dialog[role=dialog]').waitFor();
    assert.equal(await page.locator('.global-config-dialog [type=button]').count()>0,true);
  });
  assert.deepEqual(errors,[]);
} catch(error){await page.screenshot({path:path.join(output,'失败.png')});throw error;}
finally {await writeFile(path.join(output,'验证记录.json'),JSON.stringify({passed,errors},null,2));await browser.close();await server.close();}
