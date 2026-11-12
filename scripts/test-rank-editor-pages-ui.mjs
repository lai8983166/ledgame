import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

// Memory IPC fixtures only: no database, local settings or daily game data.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {chromium,expect}=createRequire(path.join(root,'../ledGame-platform/package.json'))('@playwright/test');
const cache=path.join(process.env.LOCALAPPDATA,'ms-playwright');
const chrome=(await readdir(cache)).filter(name=>/^chromium-\d+$/.test(name)).sort().at(-1);
const output=path.join(root,'.build/rank-editor-pages');await mkdir(output,{recursive:true});
const server=await createServer({root,server:{host:'127.0.0.1',port:0,hmr:false}});await server.listen();
const browser=await chromium.launch({executablePath:path.join(cache,chrome,'chrome-win64/chrome.exe')});
const page=await browser.newPage({viewport:{width:1366,height:900}});page.setDefaultTimeout(12000);
const passed=[],errors=[];page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{
  const level=label=>({label,type:1,rewardPoints:0,durationSeconds:60,description:'关卡原说明',startGif:'',gameplayIntro:'',backgroundVoice:'',bounds:{minX:0,minY:0,maxX:15,maxY:35},targetsPerPlayerMin:3,targetsPerPlayerMax:4,bombMin:0,bombMax:1,bombWarningDelaySeconds:3,bombWarningDurationSeconds:1,refreshSeconds:6,earlyRefresh:true});
  window.fixture={calls:[],validations:[],fail:false,doc:{id:7,name:'排位游戏',displayName:'排位游戏',type:'rank',cover:'cover.png',firstCatalog:'1',siteSizeWidth:16,siteSizeHeight:36,palette:['#ff0000','#0000ff'],audio:{},gif:{},commonConfig:{},levels:[level('第一关'),level('第二关')]}};
  const save=async(id,doc)=>{window.fixture.calls.push(structuredClone(doc));if(window.fixture.fail)throw Error('模拟保存失败');window.fixture.doc=structuredClone({...doc,id});return{data:{saved:true,gameId:id}};};
  window.ledGame={getRankGameEditor:async()=>({data:structuredClone(window.fixture.doc)}),saveRankGameEditor:save,createRankGameEditor:async doc=>save(9,doc),validateRankGameEditor:async doc=>{window.fixture.validations.push(structuredClone(doc));return{data:{valid:true}};},listGameCategories:async()=>{if(window.fixture.deferCategories)await new Promise(resolve=>window.fixture.resolveCategories=resolve);return{data:[{id:1,name:'分类'}]};}};
  window.mediaLibrary={list:async()=>({items:[]}),getPreviewUrl:async()=>({url:'',mediaType:'image'})};
});
const button=name=>page.getByRole('button',{name,exact:true});
const tab=name=>name==='levels'?page.locator('.rank-level-tab .sequence-pill').first():page.locator(`[data-editor-page="${name}"]`);
const field=label=>page.locator('.global-config-field').filter({has:page.locator('.global-config-label').filter({hasText:new RegExp('^'+label+'$')})}).locator('input');
const dirty=()=>page.evaluate(()=>window.getComponentSetup().hasUnsavedChanges());
const calls=()=>page.evaluate(()=>window.fixture.calls.length);
const close=async()=>{await page.locator('.editor-save-dialog button').click();await page.locator('.editor-save-dialog').waitFor({state:'hidden'});};
const mount=async props=>{await page.evaluate(props=>window.mountComponent('RankGameEditorView',props),props);await page.waitForFunction(()=>Boolean(window.getComponentSetup()?.document)&&!window.getComponentSetup().loading);};
const check=async(name,fn)=>{await fn();passed.push(name);console.log('通过：'+name);};
try{
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/ui/catalog-library-harness.html`,{timeout:60000,waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.mountComponent);await mount({gameId:7});
  await check('未打开全局页直接保存保留原全局数据，仅查看全局页不产生dirty',async()=>{
    const original=await page.evaluate(()=>structuredClone(window.fixture.doc));
    await button('保存').click();await page.locator('.editor-save-dialog').waitFor();await close();
    const saved=await page.evaluate(()=>window.fixture.doc);
    for(const key of ['name','palette','audio','gif','commonConfig'])assert.deepEqual(saved[key],original[key]);
    assert.equal(saved.wiringData?.runtimeEnabled===true,false);assert.equal(await dirty(),false);
    await tab('global').click();assert.equal(await dirty(),false);await tab('levels').click();assert.equal(await dirty(),false);
    await page.evaluate(()=>window.fixture.calls=[]);
  });
  await check('同级页面保留顶部同行入口，仅查看布线不改文档或开启独立布线',async()=>{
    assert.equal(await dirty(),false);
    const heading=page.locator('.rank-toolbar');
    for(const name of ['返回列表','保存','全局配置','地砖布线','添加关卡'])assert.equal(await heading.getByRole('button',{name,exact:true}).count(),1);
    assert.equal(await button('关卡编辑').count(),0);
    await tab('wiring').click();await page.locator('.rank-wiring-page .elc408-wiring-panel').waitFor();
    assert.equal(await page.locator('[role=dialog]').count(),0);assert.equal(await button('保存').count(),1);
    assert.equal(await page.locator('.rank-wiring-page .elc408-actions:not(.elc408-file-actions)').count(),0);
    assert.equal(await dirty(),false);assert.equal(await calls(),0);
    assert.equal(await page.evaluate(()=>window.getComponentSetup().document.wiringData?.runtimeEnabled===true),false);
    await tab('levels').click();await page.locator('.rank-config-editor').waitFor();
  });
  await check('切页保留全局、关卡及布线草稿，未保存不调用写接口',async()=>{
    await page.locator('[data-rank-field="level.rewardPoints"]').fill('17');
    await tab('global').click();await field('名称').fill('Rank统一保存');assert.equal(await dirty(),true);
    await tab('wiring').click();await page.locator('.elc408-wiring-panel').evaluate(node=>node.__vueParentComponent.setupState.document.lines=[[[1,2],[2,2]]]);
    await tab('levels').click();await expect(page.locator('[data-rank-field="level.rewardPoints"]')).toHaveValue('17');
    await tab('global').click();await expect(field('名称')).toHaveValue('Rank统一保存');
    assert.equal(await calls(),0);assert.equal(await page.evaluate(()=>window.fixture.doc.name),'排位游戏');
    await page.screenshot({path:path.join(output,'全局草稿.png')});
  });
  await check('顶部保存一次包含三页，失败保留草稿，成功清理dirty并完整回读',async()=>{
    await page.evaluate(()=>window.fixture.fail=true);await button('保存').click();await page.locator('.editor-save-dialog').waitFor();
    assert.equal(await calls(),1);assert.equal(await dirty(),true);await close();
    await tab('global').click();await expect(field('名称')).toHaveValue('Rank统一保存');
    await tab('wiring').click();await expect(page.locator('.elc408-wiring-panel')).toBeVisible();
    await page.evaluate(()=>window.fixture.fail=false);await button('保存').click();await page.locator('.editor-save-dialog').waitFor();
    assert.equal(await calls(),2);assert.equal(await dirty(),false);
    const saved=await page.evaluate(()=>window.fixture.doc);assert.equal(saved.name,'Rank统一保存');assert.equal(saved.levels[0].rewardPoints,17);
    assert.deepEqual(saved.wiringData.lines,[[[1,2],[2,2]]]);assert.equal(saved.wiringData.runtimeEnabled,true);await close();
    await mount({gameId:7});await expect(page.locator('[data-rank-field="level.rewardPoints"]')).toHaveValue('17');
    await tab('global').click();await expect(field('名称')).toHaveValue('Rank统一保存');
    await tab('wiring').click();assert.deepEqual(await page.evaluate(()=>window.getComponentSetup().wiringPageRef.getDraft().lines),[[[1,2],[2,2]]]);
    assert.equal(await dirty(),false);
  });
  await check('未完成范围草稿跨页保留并阻止保存，修正后恢复',async()=>{
    await tab('levels').click();const x=page.locator('[data-rank-field="level.bounds.x"]');await x.fill('2,');
    await tab('global').click();assert.equal(await dirty(),true);const before=await calls();await button('保存').click();await page.locator('.editor-save-dialog').waitFor();
    assert.equal(await calls(),before);await close();await tab('levels').click();await expect(x).toHaveValue('2,');
    await x.fill('1,16');
  });
  await check('场地缩小保留布线草稿并阻止超界，尺寸恢复后保存成功',async()=>{
    await tab('global').click();await field('宽度').fill('1');await tab('wiring').click();const before=await calls();
    await button('保存').click();await page.locator('.editor-save-dialog').waitFor();assert.equal(await calls(),before);assert.equal(await dirty(),true);await close();
    await tab('global').click();await field('宽度').fill('16');await button('保存').click();await page.locator('.editor-save-dialog').waitFor();await close();assert.equal(await calls(),before+1);assert.equal(await dirty(),false);
  });
  await check('三页在大小窗口不超界，全局限宽居中，点击关卡直接回关卡页',async()=>{
    for(const width of [1920,1366,1024]){
      await page.setViewportSize({width,height:768});
      for(const name of ['global','wiring','levels']){
        await tab(name).click();await page.waitForTimeout(100);
        const panel=page.locator(name==='global'?'.rank-global-config-page':name==='wiring'?'.rank-wiring-page':'.rank-config-editor');
        await expect(panel).toBeVisible();const box=await panel.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1,JSON.stringify({name,width,box}));assert.ok(box.y+box.height<=770,JSON.stringify({name,width,box}));
        if(name==='global'){assert.ok(box.width<=1101);assert.ok(Math.abs(box.x+box.width/2-width/2)<2,JSON.stringify(box));}
        const save=await button('保存').boundingBox();assert.ok(save.y>=0&&save.x+save.width<=width);
        if(width===1366)await page.screenshot({path:path.join(output,`${name}-1366.png`)});
      }
    }
  });
  await check('新建Rank无需额外标记首先显示全局页，首次统一创建包含三页修改',async()=>{
    await page.setViewportSize({width:1366,height:900});
    const initialDocument=await page.evaluate(()=>{const value=structuredClone(window.fixture.doc);delete value.id;delete value.wiringData;return value;});
    await page.evaluate(()=>window.fixture.deferCategories=true);
    await mount({initialDocument});await expect(page.locator('.rank-global-config-page')).toBeVisible();assert.equal(await dirty(),true);
    assert.equal(await page.evaluate(()=>Boolean(window.fixture.resolveCategories)),true,'分类查询尚未返回时已经显示全局页');
    await page.evaluate(()=>{window.fixture.deferCategories=false;window.fixture.resolveCategories();});
    const before=await calls();await field('名称').fill('新建Rank');await tab('levels').click();await page.locator('[data-rank-field="level.rewardPoints"]').fill('29');
    await tab('wiring').click();await page.locator('.elc408-wiring-panel').evaluate(node=>node.__vueParentComponent.setupState.document.lines=[[[0,0],[1,0]]]);
    await button('保存').click();await page.locator('.editor-save-dialog').waitFor();assert.equal(await calls(),before+1);
    const saved=await page.evaluate(()=>window.fixture.doc);assert.equal(saved.id,9);assert.equal(saved.name,'新建Rank');assert.equal(saved.levels[0].rewardPoints,29);assert.deepEqual(saved.wiringData.lines,[[[0,0],[1,0]]]);assert.equal(await dirty(),false);await close();
  });
  assert.deepEqual(errors,[]);
}catch(error){await page.screenshot({path:path.join(output,'失败.png')});throw error;}
finally{await writeFile(path.join(output,'验证记录.json'),JSON.stringify({passed,errors},null,2));await browser.close();await server.close();}
