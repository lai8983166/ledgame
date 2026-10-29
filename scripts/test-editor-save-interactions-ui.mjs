import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=createRequire(path.join(root,'../ledGame-platform/package.json'))('playwright');
const cache=path.join(process.env.LOCALAPPDATA,'ms-playwright');
const chrome=(await readdir(cache)).filter(name=>/^chromium-\d+$/.test(name)).sort().at(-1);
const output=path.join(root,'.build/editor-save-interactions'); await mkdir(output,{recursive:true});
const server=await createServer({root,server:{host:'127.0.0.1',port:0}}); await server.listen();
const browser=await chromium.launch({executablePath:path.join(cache,chrome,'chrome-win64/chrome.exe')});
const page=await browser.newPage({viewport:{width:1366,height:900}});
page.setDefaultTimeout(10000);
const errors=[],passed=[]; page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{
  window.saves=[];window.failSave=false;window.saveCalls=0;window.focusCalls=0;
  window.completeDraft={id:7,name:'测试游戏',type:'default',mode:'[2]',cover:'cover.png',firstCatalog:'娱乐挑战',siteSizeWidth:16,siteSizeHeight:36,minPlayers:1,maxPlayers:6,
    audio:{scoreSound:'score.mp3',injurySound:'injury.mp3',purpleSound:'double.mp3'},gif:{standby:'idle.gif',gameFailure:'fail.gif',gameOver:'over.gif'},
    commonConfig:{gameStartAudio:'start.mp3',gameEndSuccessAudio:'success.mp3',gameEndFailAudio:'fail.mp3',levelPassAudio:'pass.mp3',levelRestartAudio:'restart.mp3'},
    levels:['A','B','C'].map((label,index)=>({label,option:{rewardPoints:index,timeLimitMode:'UNLIMITED',lifeLimitMode:'UNLIMITED'},frameList:[{repeatTimes:1,matrix:[]}]}))};
  window.ledGame={listGameCategories:async()=>({data:[{name:'娱乐挑战'}]}),getGameEditor:async()=>({data:structuredClone(window.completeDraft)}),
    saveGameEditor:async(id,doc)=>{window.saveCalls++;if(window.deferSave)await new Promise(resolve=>window.finishSave=resolve);if(window.failSave)throw Error('模拟磁盘写入失败');window.saves.push(structuredClone(doc));return{data:{saved:true,gameId:id}};},
    restoreFocus:async()=>{window.focusCalls++;},
    validateRankGameEditor:async()=>({data:{valid:true}}),saveRankGameEditor:async(id,doc)=>{if(window.failSave)throw Error('模拟磁盘写入失败');window.saves.push(structuredClone(doc));return{data:{saved:true,gameId:id}};}};
  window.spiritLibrary={list:async()=>({data:[]})};
});
const mount=async(name,doc)=>page.evaluate(({name,doc})=>window.mountComponent(name,{initialDocument:doc,gameId:7}),{name,doc});
const close=async()=>{await page.locator('.editor-save-dialog button').click();await page.locator('.editor-save-dialog').waitFor({state:'hidden'});};
const check=async(name,fn)=>{await fn();passed.push(name);console.log('通过：'+name);};
try {
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/ui/catalog-library-harness.html`);await page.waitForFunction(()=>window.mountComponent);
  const doc=await page.evaluate(()=>window.completeDraft);
  await mount('SimpleGameEditorView',doc);const save=page.locator('.editor-heading-actions').getByRole('button',{name:'保存',exact:true});await save.waitFor();
  await check('保存立即等待、防重复提交及结束/失败/必填拦截均恢复游标',async()=>{
    await page.evaluate(()=>window.deferSave=true);await save.click();
    await page.waitForFunction(()=>window.finishSave);
    assert.equal(await save.evaluate(node=>getComputedStyle(node).cursor),'wait');assert.equal(await save.isDisabled(),true);
    await page.evaluate(()=>window.getComponentSetup().saveEditor());assert.equal(await page.evaluate(()=>window.saveCalls),1);
    await page.evaluate(()=>{window.deferSave=false;window.finishSave();});await page.locator('.editor-save-dialog').waitFor();await close();
    assert.equal(await page.locator('html').evaluate(node=>node.classList.contains('editor-saving')),false);
    await page.evaluate(()=>{window.saves=[];window.saveCalls=0;});
  });
  await check('Simple 保存成功弹窗、失败弹窗及关闭后的输入恢复',async()=>{
    await save.click();await page.locator('.editor-save-dialog').getByRole('heading',{name:'保存成功'}).waitFor();await close();
    await page.evaluate(()=>window.failSave=true);await save.click();await page.locator('.editor-save-dialog').getByText('模拟磁盘写入失败').waitFor();await close();
    const input=page.locator('.editor-left input').first();await input.fill('');await save.click();await page.locator('.editor-save-dialog').getByText(/请填写以下必填项/).waitFor();
    assert.equal(await page.evaluate(()=>window.saves.length),1);await close();await input.fill('0');await page.evaluate(()=>window.failSave=false);
    assert.equal(await page.locator('html').evaluate(node=>node.classList.contains('editor-saving')),false);
  });
  await check('关卡左键拖动保持数据与当前关卡，旧排序按钮移除',async()=>{
    const pills=page.locator('.level-sequence-row .sequence-pill');await pills.nth(1).click();
    await pills.nth(0).dragTo(pills.nth(2));assert.deepEqual(await pills.allTextContents(),['B','C','A']);
    assert.equal((await page.locator('.level-sequence-row .sequence-pill.active').innerText()).trim(),'B');assert.equal(await page.locator('.level-reorder-actions').count(),0);
    await save.click();await page.locator('.editor-save-dialog').waitFor();await close();
    assert.deepEqual(await page.evaluate(()=>window.saves.at(-1).levels.map(level=>level.option.rewardPoints)),[1,2,0]);
  });
  await check('关卡叉号悬停和聚焦可见，取消不切关，删除其他关保留当前帧草稿',async()=>{
    await page.evaluate(()=>{const s=window.getComponentSetup();s.document.levels[s.activeLevelIndex].frameList.push({repeatTimes:7,matrix:[{id:'draft',x:1,y:1,color:1,points:[[0,0]]}]});s.activeFrameIndex=1;});
    const target=page.getByRole('button',{name:'删除关卡 A',exact:true});
    await page.mouse.move(3,3);assert.equal(await target.evaluate(node=>getComputedStyle(node).opacity),'0');
    await target.focus();assert.equal(await target.evaluate(node=>getComputedStyle(node).opacity),'1');
    page.once('dialog',dialog=>dialog.dismiss());await target.click();
    assert.deepEqual(await page.locator('.level-sequence-row .sequence-pill').allTextContents(),['B','C','A']);
    assert.equal(await page.evaluate(()=>window.getComponentSetup().activeFrameIndex),1);
    assert.equal(await page.locator('.level-sequence-row .sequence-pill.active').innerText(),'B');
    page.once('dialog',dialog=>dialog.accept());await target.click();
    assert.deepEqual(await page.locator('.level-sequence-row .sequence-pill').allTextContents(),['B','C']);
    assert.equal(await page.evaluate(()=>window.getComponentSetup().activeFrameIndex),1);
    assert.equal(await page.evaluate(()=>{const s=window.getComponentSetup();return s.document.levels[s.activeLevelIndex].frameList[1].matrix[0].id;}),'draft');
    await page.locator('.level-tab').first().hover();await page.screenshot({path:path.join(output,'关卡悬停删除.png')});
  });
  await check('全局配置类型只读、旧模式隐藏、游戏模式仅一个标题及音效按钮间距',async()=>{
    await page.getByRole('button',{name:'全局配置',exact:true}).click();const dialog=page.locator('.global-config-dialog');
    const type=dialog.locator('.global-config-field').filter({has:page.locator('.global-config-label').filter({hasText:/^类型$/})}).locator('input');
    assert.equal(await type.inputValue(),'娱乐挑战');assert.equal(await type.getAttribute('readonly'),'');
    assert.equal(await dialog.locator('.global-config-label').filter({hasText:/^模式$/}).count(),0);
    assert.equal(await dialog.getByText('游戏模式',{exact:true}).count(),1);
    const gap=await dialog.locator('.global-config-media').nth(2).evaluate(row=>{const input=row.querySelector('input'),button=row.querySelector('button');return button.getBoundingClientRect().left-input.getBoundingClientRect().right;});assert.ok(gap>=0&&gap<=8,gap);
    const field=dialog.locator('.global-config-field').filter({has:page.locator('.global-config-label').filter({hasText:/^名称$/})}).locator('input');await field.fill('');
    await dialog.locator('footer .primary').click();await page.locator('.editor-save-dialog').getByText(/请填写以下必填项/).waitFor();await close();assert.equal(await dialog.count(),1);
    await field.fill('设置保存');await dialog.locator('footer .primary').click();await page.locator('.editor-save-dialog').waitFor();await close();
    assert.equal(await page.evaluate(()=>window.saves.at(-1).type),'default');assert.equal(await page.evaluate(()=>window.saves.at(-1).mode),'[2]');
  });
  await check('选择/画笔游标、对象拖动及点击删除后的即时更新',async()=>{
    await page.evaluate(()=>window.focusCalls=0);
    const canvas=page.locator('.matrix-overlay-canvas').first();await canvas.waitFor();
    const point=await canvas.evaluate(node=>{const props=node.__vueParentComponent.props,b=node.getBoundingClientRect(),stride=props.cellSize+props.gapSize,pad=props.outsideRangePadding;
      return{x:b.x+(pad*stride+props.cellSize/2)*b.width/((props.columnCount+pad*2)*stride-props.gapSize),y:b.y+(pad*stride+props.cellSize/2)*b.height/((props.rowCount+pad*2)*stride-props.gapSize)};});
    await page.locator('[data-tool="select"]').click();
    await page.mouse.move(point.x,point.y);assert.equal(await canvas.evaluate(node=>getComputedStyle(node).cursor),'default');
    // Use the same real painting gesture as an operator; painting creates an occupied cell.
    await page.locator('.object-color-button').first().click();await page.mouse.click(point.x,point.y);await page.mouse.move(point.x+1,point.y+1);
    await page.waitForFunction(()=>document.querySelector('.matrix-overlay-canvas').style.cursor.endsWith('crosshair'));
    await page.locator('[data-tool="select"]').click();await page.mouse.move(point.x+1,point.y+1);
    await page.mouse.down();assert.equal(await canvas.evaluate(node=>getComputedStyle(node).cursor),'grabbing');await page.mouse.up();
    await page.getByRole('button',{name:'删除',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.matrix-overlay-canvas').style.cursor==='default');
    assert.equal(await page.evaluate(()=>window.focusCalls),0);
    await page.screenshot({path:path.join(output,'编辑器交互.png')});
  });
  await check('Rank 保存成功、失败及必填项缺失均弹窗且失败不提交',async()=>{
    const rankDoc={...doc,type:'rank',levels:[{type:1,durationSeconds:60,bounds:{minX:0,maxX:15,minY:0,maxY:35},targetsPerPlayerMin:1,targetsPerPlayerMax:2,refreshSeconds:6,bombMin:0,bombMax:1,bombWarningDelaySeconds:3,bombWarningDurationSeconds:1}]};
    await page.evaluate(doc=>{window.ledGame.getRankGameEditor=async()=>({data:structuredClone(doc)});},rankDoc);
    await mount('RankGameEditorView',rankDoc);
    const button=page.locator('.rank-actions .primary');await button.click();await page.locator('.editor-save-dialog').getByRole('heading',{name:'保存成功'}).waitFor();await close();
    const count=await page.evaluate(()=>window.saves.length);await page.evaluate(()=>window.getComponentSetup().document.name='');await button.click();await page.locator('.editor-save-dialog').getByText(/请填写以下必填项/).waitFor();assert.equal(await page.evaluate(()=>window.saves.length),count);await close();
    await page.evaluate(()=>{window.getComponentSetup().document.name='Rank';window.failSave=true;});await button.click();await page.locator('.editor-save-dialog').getByText('模拟磁盘写入失败').waitFor();await close();
  });
  assert.deepEqual(errors,[]);await writeFile(path.join(output,'result.json'),JSON.stringify({passed,errors},null,2));
} finally {await browser.close();await server.close();}
