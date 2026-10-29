import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {chromium,expect}=createRequire(path.join(root,'../ledGame-platform/package.json'))('@playwright/test');
const cache=path.join(process.env.LOCALAPPDATA,'ms-playwright');
const chrome=(await readdir(cache)).filter(name=>/^chromium-\d+$/.test(name)).sort().at(-1);
const output=path.join(root,'.build/red-20261028/catalog-rank-ui');
await mkdir(output,{recursive:true});
const server=await createServer({root,server:{host:'127.0.0.1',port:0}});await server.listen();
const browser=await chromium.launch({executablePath:path.join(cache,chrome,'chrome-win64/chrome.exe')});
const page=await browser.newPage({viewport:{width:1366,height:900}});page.setDefaultTimeout(10000);
const passed=[],errors=[];page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{
  const level=(label,index)=>({label,type:1,rewardPoints:0,durationSeconds:60,
    bounds:{minX:index,minY:0,maxX:7,maxY:9},targetsPerPlayerMin:3,targetsPerPlayerMax:4,
    bombMin:0,bombMax:1,bombWarningDelaySeconds:3,bombWarningDurationSeconds:1,
    refreshSeconds:6,earlyRefresh:true});
  const f=window.fixture={games:[{id:1,name:'分类游戏',type:'rank',firstCatalog:'4'}],
    imports:[],drafts:[],validateCalls:0,saveCalls:0,failSave:false,importMode:'cancel',
    doc:{id:7,name:'排位赛',type:'rank',siteSizeWidth:8,siteSizeHeight:10,levels:[level('A',0),level('B',1),level('C',2)]}};
  window.ledGame={
    listGameCategories:async()=>({data:[{id:4,name:'验收分类'}]}),
    listManageableGames:async()=>({data:structuredClone(f.games)}),
    newGameDraft:async family=>{f.drafts.push(family);return{data:{name:'草稿',type:family==='ranked'?'rank':'default'}};},
    importGame:async family=>{f.imports.push(family);if(f.importMode==='fail')throw Error('模拟导入失败');
      if(f.importMode==='cancel')return{canceled:true};
      f.games.push({id:10+f.imports.length,name:'导入游戏',type:family==='ranked'?'rank':'default',firstCatalog:''});return{canceled:false};},
    getRankGameEditor:async()=>({data:structuredClone(f.doc)}),
    validateRankGameEditor:async payload=>{f.validateCalls++;f.lastValidated=structuredClone(payload);return{data:{valid:true}};},
    saveRankGameEditor:async(id,payload)=>{f.saveCalls++;if(f.failSave)throw Error('模拟保存失败');
      f.doc=structuredClone(payload);return{data:{saved:true,gameId:id}};},
  };
});
const button=name=>page.getByRole('button',{name,exact:true});
const range=kind=>page.locator(`[data-rank-field="level.bounds.${kind}"]`);
const tabs=()=>page.locator('.rank-level-tab');
const tab=name=>tabs().filter({has:page.locator('.sequence-pill').getByText(name,{exact:true})});
const select=name=>tab(name).locator('.sequence-pill').click();
async function mount(name,props){await page.evaluate(([name,props])=>window.mountComponent(name,props),[name,props]);}
async function check(name,run){await run();passed.push(name);console.log('通过：'+name);}
async function closeFeedback(){await page.locator('.editor-save-dialog button').click();await expect(page.locator('.editor-save-dialog')).toHaveCount(0);}
async function deleteTab(name,accept){
  const dialog=page.waitForEvent('dialog');
  const click=tab(name).locator('.rank-level-delete').click();
  const confirmation=await dialog;assert.match(confirmation.message(),new RegExp(name));
  if(accept)await confirmation.accept();else await confirmation.dismiss();
  await click;
}
try{
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/ui/catalog-library-harness.html`);
  await page.waitForFunction(()=>window.mountComponent);
  await mount('GameListView',{section:'home'});
  await expect(page.locator('.game-category-card')).toHaveCount(1);
  await check('分类首页新建/导入可用，类型选择取消及新建复用原流程',async()=>{
    await expect(button('新建游戏')).toBeVisible();await expect(button('导入游戏')).toBeVisible();
    await button('新建游戏').click();await button('取消').click();
    assert.deepEqual(await page.evaluate(()=>window.fixture.drafts),[]);
    await button('新建游戏').click();await page.locator('.game-family-option').nth(1).click();
    await page.locator('.game-creation-dialog footer .primary').click();
    assert.deepEqual(await page.evaluate(()=>window.fixture.drafts),['ranked']);
    assert.equal(await page.evaluate(()=>window.componentEvents[0][1].draft.type),'rank');
    assert.equal(await page.evaluate(()=>window.fixture.games.length),1);
    await button('导入游戏').click();await button('取消').click();
    assert.deepEqual(await page.evaluate(()=>window.fixture.imports),[]);
  });
  await check('分类内新建与导入保留取消/失败重试，导入仍未分类',async()=>{
    await page.locator('.game-category-card-main').click();
    await expect(page.locator('.page-heading h1')).toHaveText('验收分类');
    await expect(button('新建游戏')).toBeVisible();await expect(button('导入游戏')).toBeVisible();
    await button('新建游戏').click();await button('取消').click();
    await button('导入游戏').click();await page.locator('.game-creation-dialog footer .primary').click();
    await expect(page.locator('.game-creation-dialog')).toHaveCount(0);
    assert.equal(await page.evaluate(()=>window.fixture.games.length),1);
    await button('导入游戏').click();await page.evaluate(()=>window.fixture.importMode='fail');
    await page.locator('.game-creation-dialog footer .primary').click();
    await expect(page.locator('.game-creation-dialog [role=alert]')).toHaveText('模拟导入失败');
    await page.evaluate(()=>window.fixture.importMode='success');
    await page.locator('.game-creation-dialog footer .primary').click();
    await expect(page.locator('.game-creation-dialog')).toHaveCount(0);
    await expect(page.locator('.game-card')).toHaveCount(1);
    assert.equal(await page.evaluate(()=>window.fixture.games.at(-1).firstCatalog),'');
    await mount('GameListView',{section:'list'});await expect(page.locator('.game-card')).toHaveCount(2);
  });
  await mount('RankGameEditorView',{gameId:7});await expect(tabs()).toHaveCount(3);
  await check('Rank只有X/Y两个范围，合法范围按1-based显示',async()=>{
    await expect(range('x')).toHaveValue('1,8');await expect(range('y')).toHaveValue('1,10');
    assert.equal(await page.locator('[data-rank-field^="level.bounds."]').count(),2);
    assert.equal(await page.locator('button button').count(),0);
    await page.mouse.move(1000,800);
    await expect(tab('A').locator('.rank-level-delete')).toHaveCSS('opacity','0');
    await tab('A').locator('.sequence-pill').focus();
    await expect(tab('A').locator('.rank-level-delete')).toHaveCSS('opacity','1');
    await page.keyboard.press('Tab');await expect(tab('A').locator('.rank-level-delete')).toBeFocused();
    await tab('B').hover();await expect(tab('B').locator('.rank-level-delete')).toHaveCSS('opacity','1');
    await page.screenshot({path:path.join(output,'Rank悬停删除.png')});
  });
  await check('未完成范围跨关保留，非法值不发校验/保存请求',async()=>{
    await range('x').fill('2,');await select('B');await range('y').fill('2,9');
    await select('A');await expect(range('x')).toHaveValue('2,');
    await button('保存').click();await expect(page.locator('.editor-save-dialog')).toBeVisible();
    assert.equal(await page.evaluate(()=>window.fixture.validateCalls),0);
    assert.equal(await page.evaluate(()=>window.fixture.saveCalls),0);await closeFeedback();
    await range('x').fill('0,8');await expect(range('x')).toHaveAttribute('aria-invalid','true');
    await range('x').fill('2,9');await expect(range('x')).toHaveAttribute('aria-invalid','true');
    await range('x').fill('2,7');await expect(range('x')).toHaveAttribute('aria-invalid','false');
  });
  await check('拖动保留活动关与各关范围草稿，拖动期间叉号不删关',async()=>{
    await select('C');await range('x').fill('4,');
    const transfer=await page.evaluateHandle(()=>new DataTransfer());
    await tab('A').locator('.sequence-pill').dispatchEvent('dragstart',{dataTransfer:transfer});
    await expect(tab('B').locator('.rank-level-delete')).toBeDisabled();
    await tab('C').locator('.sequence-pill').dispatchEvent('dragover',{dataTransfer:transfer});
    await tab('C').locator('.sequence-pill').dispatchEvent('drop',{dataTransfer:transfer});
    assert.deepEqual(await page.locator('.sequence-pill').allTextContents(),['B','C','A']);
    await expect(tab('C').locator('.sequence-pill')).toHaveClass(/active/);
    await expect(range('x')).toHaveValue('4,');
    await select('B');await expect(range('y')).toHaveValue('2,9');await select('C');
  });
  await check('删除非活动目标取消不切关，确认只删目标并保留活动草稿',async()=>{
    await deleteTab('A',false);await expect(tabs()).toHaveCount(3);
    await expect(tab('C').locator('.sequence-pill')).toHaveClass(/active/);await expect(range('x')).toHaveValue('4,');
    await deleteTab('A',true);await expect(tabs()).toHaveCount(2);
    await expect(tab('C').locator('.sequence-pill')).toHaveClass(/active/);await expect(range('x')).toHaveValue('4,');
    await button('保存').click();await expect(page.locator('.editor-save-dialog')).toBeVisible();
    assert.equal(await page.evaluate(()=>window.fixture.saveCalls),0);await closeFeedback();
  });
  await check('合法坐标存储为0-based，失败保留草稿可重试且各关独立',async()=>{
    await range('x').fill('4,8');await range('y').fill('3,10');
    await page.evaluate(()=>window.fixture.failSave=true);await button('保存').click();
    await expect(page.locator('.editor-save-dialog')).toContainText('模拟保存失败');await closeFeedback();
    await expect(range('x')).toHaveValue('4,8');await expect(range('y')).toHaveValue('3,10');
    await page.evaluate(()=>window.fixture.failSave=false);await button('保存').click();
    await expect(page.locator('.editor-save-dialog')).toBeVisible();await closeFeedback();
    const saved=await page.evaluate(()=>window.fixture.doc);
    assert.deepEqual(saved.levels.map(level=>[level.label,level.bounds]),[
      ['B',{minX:1,minY:1,maxX:7,maxY:8}],['C',{minX:3,minY:2,maxX:7,maxY:9}],
    ]);
    await expect(range('x')).toHaveValue('4,8');
    await page.screenshot({path:path.join(output,'Rank范围和标签.png')});
  });
  await check('删除活动关切到剩余关且至少保留一关',async()=>{
    await deleteTab('C',true);await expect(tabs()).toHaveCount(1);
    await expect(tab('B').locator('.sequence-pill')).toHaveClass(/active/);
    await expect(range('y')).toHaveValue('2,9');await expect(tab('B').locator('.rank-level-delete')).toBeDisabled();
  });
  assert.deepEqual(errors,[]);
}catch(error){await page.screenshot({path:path.join(output,'失败.png')});throw error;}
finally{await writeFile(path.join(output,'验证记录.json'),JSON.stringify({passed,errors},null,2));await browser.close();await server.close();}
