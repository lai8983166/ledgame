import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

// Isolated memory IPC fixtures; no database or daily user data is accessed.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {chromium,expect}=createRequire(path.join(root,'../ledGame-platform/package.json'))('@playwright/test');
const cache=path.join(process.env.LOCALAPPDATA,'ms-playwright');
const chrome=(await readdir(cache)).filter(name=>/^chromium-\d+$/.test(name)).sort().at(-1);
const output=path.join(root,'.build/rank-duplicate-level');await mkdir(output,{recursive:true});
const server=await createServer({root,server:{host:'127.0.0.1',port:5187,strictPort:true,hmr:false}});await server.listen();
const browser=await chromium.launch({executablePath:path.join(cache,chrome,'chrome-win64/chrome.exe')});
const page=await browser.newPage({viewport:{width:1366,height:900}});page.setDefaultTimeout(10000);
const passed=[],errors=[];page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{
  const level=label=>({label,type:3,rewardPoints:27,durationSeconds:80,description:'说明',startGif:'intro.gif',gameplayIntro:'voice.mp3',backgroundVoice:'bg.mp3',bounds:{minX:0,minY:0,maxX:15,maxY:35},targetsPerPlayerMin:3,targetsPerPlayerMax:4,bombMin:2,bombMax:4,bombWarningDelaySeconds:3,bombWarningDurationSeconds:2,refreshSeconds:8,earlyRefresh:false,bombWarningAudio:'warning.mp3',bombExplosionAudio:'boom.mp3',custom:{nested:[1,2]}});
  window.fixture={calls:[],doc:{id:7,name:'Rank',displayName:'Rank',type:'rank',cover:'',firstCatalog:'1',siteSizeWidth:16,siteSizeHeight:36,palette:['#ff0000','#0000ff'],audio:{},gif:{},commonConfig:{},levels:[level('第一关'),level('第二关')]}};
  window.ledGame={getRankGameEditor:async()=>({data:structuredClone(window.fixture.doc)}),saveRankGameEditor:async(id,doc)=>{window.fixture.calls.push(structuredClone(doc));window.fixture.doc=structuredClone({...doc,id});return{data:{saved:true,gameId:id}};},validateRankGameEditor:async()=>({data:{valid:true}}),listGameCategories:async()=>({data:[]})};
});
const copy=()=>page.getByRole('button',{name:'复用本关卡配置新建关卡',exact:true});
const field=name=>page.locator(`[data-rank-field="level.${name}"]`);
const mount=async()=>{await page.evaluate(()=>window.mountComponent('RankGameEditorView',{gameId:7}));await page.waitForFunction(()=>window.getComponentSetup()?.document&&!window.getComponentSetup().loading);};
const check=async(name,fn)=>{await fn();passed.push(name);console.log('通过：'+name);};
const close=async()=>{await page.locator('.editor-save-dialog button').click();await page.locator('.editor-save-dialog').waitFor({state:'hidden'});};
try{
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/ui/catalog-library-harness.html`,{timeout:60000,waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.mountComponent);await mount();
  await check('复用图标紧接添加按钮，实际tooltip悬停显示且busy或无关卡禁用',async()=>{
    assert.equal(await copy().locator('svg').count(),1);assert.equal(await copy().innerText(),'');
    assert.equal(await copy().evaluate(el=>el.previousElementSibling?.textContent.trim()),'+');
    await copy().hover();await page.waitForTimeout(120);
    assert.equal(await copy().evaluate(el=>getComputedStyle(el,'::after').opacity),'1');
    assert.equal(await copy().getAttribute('data-tip'),'复用本关卡配置新建关卡');
    await page.screenshot({path:path.join(output,'复用关卡tooltip.png')});
    await page.evaluate(()=>window.getComponentSetup().busy='save');await expect(copy()).toBeDisabled();
    await page.evaluate(()=>window.getComponentSetup().busy=null);
    const saved=await page.evaluate(()=>{const s=window.getComponentSetup();const levels=structuredClone(JSON.parse(JSON.stringify(s.document.levels)));s.document.levels=[];return levels;});
    await expect(copy()).toBeDisabled();await page.evaluate(levels=>window.getComponentSetup().document.levels=levels,saved);
  });
  await check('复制完整配置插入本关之后，选中新关且修改不串原关',async()=>{
    const original=await page.evaluate(()=>JSON.parse(JSON.stringify(window.getComponentSetup().document.levels[0])));
    await copy().click();
    const snapshot=await page.evaluate(()=>{const s=window.getComponentSetup();return{levels:JSON.parse(JSON.stringify(s.document.levels)),index:s.activeLevelIndex,page:s.editorPage,dirty:s.hasUnsavedChanges()};});
    assert.deepEqual(snapshot.levels.map(level=>level.label),['第一关','Level 3','第二关']);assert.equal(snapshot.index,1);assert.equal(snapshot.page,'levels');assert.equal(snapshot.dirty,true);
    assert.deepEqual({...snapshot.levels[1],label:original.label},original);
    await field('rewardPoints').fill('99');await page.evaluate(()=>window.getComponentSetup().type1Config.custom.nested.push(3));
    const first=await page.evaluate(()=>JSON.parse(JSON.stringify(window.getComponentSetup().document.levels[0])));assert.deepEqual(first,original);
    assert.equal(await page.evaluate(()=>window.fixture.calls.length),0);
  });
  await check('未完成范围草稿也独立复用，修正前统一保存被拦截',async()=>{
    await field('bounds.x').fill('2,');await copy().click();await expect(field('bounds.x')).toHaveValue('2,');
    await field('bounds.x').fill('3,8');await page.locator('.rank-level-tab .sequence-pill').nth(1).click();await expect(field('bounds.x')).toHaveValue('2,');
    await page.getByRole('button',{name:'保存',exact:true}).click();await page.locator('.editor-save-dialog').waitFor();assert.equal(await page.evaluate(()=>window.fixture.calls.length),0);await close();
    await field('bounds.x').fill('2,7');
    await page.getByRole('button',{name:'保存',exact:true}).click();await page.locator('.editor-save-toast').waitFor();assert.equal(await page.evaluate(()=>window.fixture.calls.length),1);
    await mount();assert.equal(await page.locator('.rank-level-tab .sequence-pill').count(),4);
    const doc=await page.evaluate(()=>window.fixture.doc);assert.deepEqual(doc.levels[1].bounds,{minX:1,maxX:6,minY:0,maxY:35});assert.deepEqual(doc.levels[2].bounds,{minX:2,maxX:7,minY:0,maxY:35});
  });
  await check('全局页面复用同步最新配置并回到新关卡',async()=>{
    await page.getByRole('button',{name:'全局配置',exact:true}).click();
    await page.locator('.global-config-field').filter({has:page.locator('.global-config-label').filter({hasText:/^宽度$/})}).locator('input').fill('20');
    await copy().click();
    assert.equal(await page.evaluate(()=>window.getComponentSetup().editorPage),'levels');
    assert.equal(await page.evaluate(()=>window.getComponentSetup().document.siteSizeWidth),20);
    assert.equal(await page.evaluate(()=>window.fixture.doc.siteSizeWidth),16);
  });
  assert.deepEqual(errors,[]);
}catch(error){await page.screenshot({path:path.join(output,'失败.png')});throw error;}
finally{await writeFile(path.join(output,'验证记录.json'),JSON.stringify({passed,errors},null,2));await browser.close();await server.close();}
