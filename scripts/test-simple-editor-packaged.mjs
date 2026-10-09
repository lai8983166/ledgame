// Uses the real packaged renderer/backend, a copied seed DB and simulated hardware only.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
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
    page=app.electron.windows().find(p=>p.url().includes('index.html')&&!p.url().includes('splash'));
    return Boolean(page);
  },{timeout:90_000}).toBe(true);
  page.on('pageerror',error=>errors.push(error.message));
  await page.locator('.app-nav').waitFor();
  assert.ok(page.url().startsWith('file:'));
  const games=(await api('listManageableGames')).data;
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
    assert.equal((await api('saveGameEditor',id,doc)).data.saved,true);
    await page.reload();await page.locator('.app-nav').waitFor();
    await page.getByTestId('game-menu-button').click();
    await page.getByRole('menuitem',{name:'游戏列表',exact:true}).click();
    await page.locator('.game-card[data-id="'+id+'"] .game-card-main').click();
    await page.locator('.editor-toolbar').waitFor();
    await page.waitForFunction(()=>document.querySelector('.simple-editor-fit-shell')?.classList.contains('ready'));
    assert.equal(await page.locator('.editor-side-rail').count(),0);
    assert.equal(await page.locator('.object-panel .object-actions').count(),0);
    assert.equal(await page.locator('.color-copy-button rect[fill="currentColor"]').count(),16);
    assert.equal(await page.locator('.editor-mode-option').count(),0);
    assert.equal(await page.locator('.object-sprite-button').count(),0);
    assert.equal(await page.locator('.object-panel .object-color-button').count(),4);
    assert.equal(await page.locator('.object-panel .palette-label').evaluateAll(items=>items.every(e=>getComputedStyle(e).display==='none')),true);
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
    assert.equal(app.electron.windows().filter(p=>/window=(debug|touch)/.test(p.url())).length,0);
    await page.getByRole('button',{name:'退出调试，返回编辑',exact:true}).click();
    await page.locator('.editor-toolbar').waitFor();
    await page.screenshot({path:path.join(app.runtime.directory,'editor-'+id+'.png')});
    passed.push({name:game.name,id,mode:saved.mode,realDatabaseSave:true,duplicateRedSkipped:true,blueOverlay:true,centerAnchor:true,singleDebugPage:true});
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
