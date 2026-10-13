// Uses the real packaged renderer/backend, a copied seed DB and simulated hardware only.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPackagedGame } from '../../ledGame-platform/game-soak-acceptance/src/packaged-app.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { expect } = createRequire(path.join(root,'../ledGame-platform/package.json'))('@playwright/test');
const app = await launchPackagedGame({
  gameExecutable: path.join(root,'release/win-unpacked/LED Game.exe'),
  outputRoot: path.join(root,'.build/simple-editor-packaged'),
  hardwareMode: 'simulated',floor:{width:16,height:36},backendPort:0,
  limits:{startupSeconds:90},
});
const errors=[],passed=[];
let page;
const api = (name,...args) => page.evaluate(([name,args])=>window.ledGame[name](...args),[name,args]);
try {
  await expect.poll(()=>{
    page=app.electron.windows().find(p=>p.url().includes('index.html')&&!p.url().includes('window='));
    return Boolean(page);
  },{timeout:90_000}).toBe(true);
  page.on('pageerror',error=>errors.push(error.message));
  await page.locator('.app-nav').waitFor();
  assert.ok(page.url().startsWith('file:'));
  const games=(await api('listManageableGames')).data;
  const audioPaths = await page.evaluate(async () => {
    const collect = nodes => nodes.flatMap(node => node.kind === 'directory'
      ? collect(node.children || []) : node.mediaType === 'audio' ? [node.relativePath] : []);
    return collect((await window.mediaLibrary.list()).items || []);
  });
  assert.ok(audioPaths.length, 'packaged media library must provide a real stage audio resource');
  const shared=games.filter(game=>game.type!=='rank'&&game.name!=='simple-demo').slice(0,3);
  assert.equal(shared.length,3,'seed must include three shared-editor games');
  await page.getByTestId('game-menu-button').click();
  await page.getByRole('menuitem',{name:'游戏列表',exact:true}).click();
  for(const game of shared){
    const id=game.gameId??game.id;
    const doc=(await api('getGameEditor',id)).data;
    assert.ok(doc.levels?.[0]);
    doc.siteSizeWidth=16;doc.siteSizeHeight=36;
    doc.levels=[{...doc.levels[0],frameList:[
      {repeatTimes:1,matrix:[{id:'center-test',x:5,y:5,color:2,points:[[0,0],[2,2]]}]},
      {repeatTimes:1,matrix:[]},
    ]}];
    doc.levels[0].option={...doc.levels[0].option,bgVoice:audioPaths[0]};
    assert.equal((await api('saveGameEditor',id,doc)).data.saved,true);
    await page.reload();await page.locator('.app-nav').waitFor();
    await page.getByTestId('game-menu-button').click();
    await page.getByRole('menuitem',{name:'游戏列表',exact:true}).click();
    await page.locator('.game-card[data-id="'+id+'"] .game-card-main').click();
    await page.locator('.editor-toolbar').waitFor();
    const labelStyles=await page.locator('.editor-left .editor-required-label').evaluateAll(items=>items.map(item=>({content:getComputedStyle(item,'::after').content,color:getComputedStyle(item,'::after').color})));
    assert.ok(labelStyles.length>=5);
    assert.ok(labelStyles.every(style=>style.content.includes('*')&&style.color==='rgb(239, 68, 68)'));
    assert.equal(await page.locator('.frame-progress-shell').evaluate(el=>el.scrollWidth<=el.clientWidth&&el.scrollHeight<=el.clientHeight),true);
    const stageMedia=[doc.commonConfig?.levelPassAudio || '',doc.commonConfig?.levelRestartAudio || '',doc.gif?.levelSettlement || '',doc.gif?.levelFailure || ''];
    assert.equal(await page.locator('.editor-level-media-field input').inputValue(),doc.levels[0].option?.bgVoice || '');
    await page.getByRole('button',{name:'全局配置',exact:true}).click();
    assert.equal(await page.locator('.global-config-label.editor-required-label').count(),15);
    for(const label of ['关卡通过语音','关卡重启语音','关卡结算动画','关卡失败动画'])assert.equal(await page.locator('.global-config-dialog .global-config-label').getByText(label,{exact:true}).count(),1);
    await page.locator('.global-config-dialog').getByRole('button',{name:'取消',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'左转90',exact:true}).count(),0);
    assert.equal(await page.getByRole('button',{name:'右转90',exact:true}).count(),1);
    for(const name of ['全局配置','符号灯布局','地砖布线','特效'])assert.equal(await page.locator('.editor-toolbar').getByRole('button',{name,exact:true}).innerText(),'');
    await page.waitForFunction(()=>document.querySelector('.simple-editor-fit-shell')?.classList.contains('ready'));
    assert.ok((await page.locator('.app-nav').boundingBox()).height<=56);
    assert.equal(await page.locator('.editor-feedback').count(),0);
    const toolbarNames=await page.locator('.editor-toolbar button').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-label')));
    const deleteIndex=toolbarNames.indexOf('删除');
    assert.equal(toolbarNames[deleteIndex-1],'保存');assert.equal(toolbarNames[deleteIndex+1],'右转90');
    for(const [width,height] of [[1366,768],[1024,600]]){
      await page.setViewportSize({width,height});await page.waitForTimeout(150);
      const panel=await page.locator('.editor-center').boundingBox();
      assert.ok(panel.height>=height*.55 && panel.y+panel.height<=height+1,JSON.stringify(panel));
      await page.screenshot({path:path.join(app.runtime.directory,`compact-editor-${id}-${width}.png`)});
    }
    await page.setViewportSize({width:1366,height:768});
    assert.equal(await page.locator('.editor-side-rail').count(),0);
    assert.equal(await page.locator('.object-panel .object-actions').count(),0);
    assert.equal(await page.locator('.color-copy-button rect[fill="currentColor"]').count(),16);
    assert.equal(await page.locator('.editor-mode-option').count(),0);
    assert.equal(await page.locator('.object-sprite-button').count(),0);
    assert.equal(await page.locator('.object-panel .object-color-button').count(),4);
    assert.equal(await page.locator('.object-panel .palette-label').evaluateAll(items=>items.every(e=>getComputedStyle(e).display==='none')),true);
    // 只替换本隔离进程的文件选择器；真实 IPC 写入/读取文件，保存仍走真实后端。
    const jsonPath=path.join(app.runtime.directory,'level-'+id+'.json');
    await app.electron.evaluate(({dialog},filePath)=>{
      globalThis.levelJsonDialogTitles=[];
      dialog.showSaveDialog=async(...args)=>{globalThis.levelJsonDialogTitles.push(args.at(-1).title);return {canceled:false,filePath};};
      dialog.showOpenDialog=async(...args)=>{globalThis.levelJsonDialogTitles.push(args.at(-1).title);return {canceled:false,filePaths:[filePath]};};
    },jsonPath);
    await page.evaluate(()=>{window.levelImportConfirms=[];window.levelImportConfirmed=false;window.confirm=message=>{window.levelImportConfirms.push(message);return window.levelImportConfirmed;};});
    await page.getByRole('button',{name:'导出当前关卡',exact:true}).click();
    await expect.poll(async()=>{try{return JSON.parse(await readFile(jsonPath,'utf8')).frameList.length;}catch{return 0;}}).toBe(2);
    const exported=JSON.parse(await readFile(jsonPath,'utf8'));
    assert.equal(exported.levels,undefined);assert.equal(exported.commonConfig,undefined);
    assert.equal(exported.option.bgVoice,doc.levels[0].option.bgVoice);
    assert.equal(exported.frameList[0].__matrixVersion,undefined);
    const repeatInput=page.locator('.repeat-times-control input');
    await repeatInput.fill('9');
    await page.getByRole('button',{name:'导入替换当前关卡',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.levelImportConfirms.length)).toBe(1);
    assert.match(await page.evaluate(()=>window.levelImportConfirms[0]),/覆盖.*全部配置和.*帧/);
    assert.equal(await repeatInput.inputValue(),'9','cancel must retain unsaved changes');
    await page.evaluate(()=>window.levelImportConfirmed=true);
    await page.getByRole('button',{name:'导入替换当前关卡',exact:true}).click();
    await expect.poll(()=>repeatInput.inputValue()).toBe('1');
    assert.equal(await page.locator('.editor-feedback').count(),0);
    assert.equal(await page.getByRole('button',{name:'保存',exact:true}).isEnabled(),true);
    assert.equal((await api('getGameEditor',id)).data.levels[0].frameList[0].repeatTimes,1);
    await page.getByRole('button',{name:'保存',exact:true}).click();
    await expect.poll(async()=>JSON.stringify((await api('getGameEditor',id)).data.levels[0].frameList)).toBe(JSON.stringify(exported.frameList));
    const restored=(await api('getGameEditor',id)).data;
    assert.deepEqual(restored.levels[0].option,exported.option);
    assert.deepEqual(restored.commonConfig,doc.commonConfig);
    assert.deepEqual(await app.electron.evaluate(()=>globalThis.levelJsonDialogTitles),['导出当前关卡','导入替换当前关卡','导入替换当前关卡']);
    await page.locator('.object-color-2').click();
    const canvas=page.locator('.matrix-overlay-canvas'),bounds=await canvas.boundingBox();
    const position={x:bounds.width*14.5/20,y:bounds.height*26.5/40};
    await canvas.click({position});await canvas.click({position});
    await page.locator('.object-color-1').click();
    // Existing cells now select; add a blue layer by a range that starts on empty space.
    await page.mouse.move(bounds.x+bounds.width*13.5/20,bounds.y+bounds.height*26.5/40);
    await page.mouse.down();await page.mouse.move(bounds.x+position.x,bounds.y+position.y,{steps:4});await page.mouse.up();
    await page.getByRole('button',{name:'保存',exact:true}).click();
    await expect.poll(async()=> (await api('getGameEditor',id)).data.levels[0].frameList[0].matrix.length).toBe(3);
    const saved=(await api('getGameEditor',id)).data;
    assert.equal(saved.levels[0].option?.bgVoice || '',doc.levels[0].option?.bgVoice || '');
    assert.deepEqual([saved.commonConfig?.levelPassAudio || '',saved.commonConfig?.levelRestartAudio || '',saved.gif?.levelSettlement || '',saved.gif?.levelFailure || ''],stageMedia);
    const matrix=saved.levels[0].frameList[0].matrix;
    const centered=matrix.find(o=>o.id==='center-test');
    assert.deepEqual([centered.x,centered.y],[6,6]);assert.deepEqual(centered.points,[[-1,-1],[1,1]]);
    assert.equal(matrix.filter(o=>o.x===12&&o.y===24&&o.color===2).length,1);
    assert.equal(matrix.filter(o=>o.color===1&&o.points.some(([dx,dy])=>o.x+dx===12&&o.y+dy===24)).length,1);
    await page.getByRole('button',{name:'返回列表',exact:true}).click();
    await page.locator('.game-card[data-id="'+id+'"] .game-card-main').click();
    await page.locator('.editor-toolbar').waitFor();
    await page.getByRole('button',{name:'启动游戏',exact:true}).click();
    await page.locator('.editor-debug-workspace').waitFor();
    assert.ok((await page.locator('.debug-workspace-controls').boundingBox()).width>=420);
    assert.equal(app.electron.windows().filter(p=>/window=(debug|touch)/.test(p.url())).length,0);
    await page.getByRole('button',{name:'退出调试，返回编辑',exact:true}).click();
    await page.locator('.editor-toolbar').waitFor();
    await page.screenshot({path:path.join(app.runtime.directory,'editor-'+id+'.png')});
    passed.push({name:game.name,id,mode:saved.mode,realDatabaseSave:true,levelJsonFileRoundTrip:true,levelImportConfirmation:true,duplicateRedSkipped:true,blueOverlay:true,centerAnchor:true,singleDebugPage:true});
    await page.getByRole('button',{name:'返回列表',exact:true}).click();
  }
  assert.deepEqual(errors,[]);
  console.log('通过：打包版三种共用编辑器真实保存/重开、同色静默、异色叠加、中心基准点和单页调试');
} finally {
  await mkdir(app.runtime.directory,{recursive:true});
  if(page&&!page.isClosed())await page.screenshot({path:path.join(app.runtime.directory,'final-state.png')}).catch(()=>{});
  await writeFile(path.join(app.runtime.directory,'验证记录.json'),JSON.stringify({passed,errors,isolation:app.runtime.directory},null,2));
  await app.close();
  console.log('隔离验收目录：'+app.runtime.directory);
}
