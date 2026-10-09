// Real packaged renderer + backend, isolated copied database; no personal data or hardware.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchPackagedGame} from '../../ledGame-platform/game-soak-acceptance/src/packaged-app.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {expect}=createRequire(path.join(root,'../ledGame-platform/package.json'))('@playwright/test');
const app=await launchPackagedGame({gameExecutable:path.join(root,'release/win-unpacked/LED Game.exe'),
  outputRoot:path.join(root,'.build/circle-light-packaged'),hardwareMode:'simulated',floor:{width:16,height:36},backendPort:0,limits:{startupSeconds:90}});
const errors=[],passed=[];let page;
const api=(name,...args)=>page.evaluate(([name,args])=>window.ledGame[name](...args),[name,args]);
const button=name=>page.getByRole('button',{name,exact:true});
const state=async()=>(await api('gameState')).data;
try {
  await expect.poll(()=>{page=app.electron.windows().find(p=>p.url().includes('index.html')&&!p.url().includes('splash'));return Boolean(page);},{timeout:90_000}).toBe(true);
  page.on('pageerror',error=>errors.push(error.message));await page.locator('.app-nav').waitFor();
  const games=(await api('listManageableGames')).data.filter(game=>game.type!=='rank'&&game.name!=='simple-demo').slice(0,3);
  assert.equal(games.length,3);
  for(const game of games) {
    const id=game.id??game.gameId,doc=(await api('getGameEditor',id)).data;
    doc.siteSizeWidth=16;doc.siteSizeHeight=36;doc.globalTimeLimit=false;doc.globalLifeLimit=false;
    doc.audio={};doc.gif={};doc.levelMusic='';doc.failureMusic='';
    doc.commonConfig={pixelLightWiring:{selectedRow:'0|0',form:{open:1,order:0,controlIdx:0,pixelPort:6,circlePort:7,topWallPixelLightNum:1,rightWallPixelLightNum:0,bottomWallPixelLightNum:0,leftWallPixelLightNum:0},rows:[{wall:0,idx:0,align:''}]}};
    doc.levels=[{label:'圆灯验收',option:{timeLimitMode:'UNLIMITED',lifeLimitMode:'LIMITED',lifeLimitValue:5,rewardPoints:10,pixelLightType:'1',countdownMin:2,countdownMax:2,bgVoice:'',startGIF:''},
      frameList:[{repeatTimes:1,matrix:[{id:'target',x:8,y:18,color:1,points:[[0,0]]}]}]}];
    assert.equal((await api('saveGameEditor',id,doc)).data.saved,true);
    await page.reload();await page.locator('.app-nav').waitFor();await page.getByTestId('game-menu-button').click();await page.getByRole('menuitem',{name:'游戏列表',exact:true}).click();
    await page.locator('.game-card[data-id="'+id+'"] .game-card-main').click();await page.locator('.editor-toolbar').waitFor();
    assert.equal(await page.locator('.editor-circle-countdown input[type=checkbox]').isChecked(),true);
    assert.equal(await page.locator('.editor-circle-countdown input[type=number]').first().inputValue(),'2');
    await button('启动游戏').click();
    if(await button('使用已保存版本').count())await button('使用已保存版本').click();
    await page.locator('.editor-debug-workspace').waitFor();
    assert.equal(await page.locator('.debug-circle-light[data-phase=OFF]').count(),1);
    await button('启动游戏').click();
    await expect.poll(async()=>(await state()).engineState,{timeout:30_000}).toBe('RUNNING');
    const circle=page.locator('.debug-circle-light');
    await expect(circle).toHaveAttribute('data-phase','BLUE');await circle.click();
    await expect(circle).toHaveAttribute('data-phase','GREEN');
    let snapshot=await state();assert.equal(snapshot.gameplay.score,0);assert.equal(snapshot.gameplay.memberPoints,0);
    await button('暂停').click();const frozen=(await state()).peripheralLights;
    await page.waitForTimeout(1200);assert.deepEqual((await state()).peripheralLights,frozen);assert.equal(await circle.isDisabled(),true);
    await button('继续').click();await expect.poll(async()=>(await state()).gameplay.life,{timeout:7000}).toBe(4);
    await expect(circle).toHaveAttribute('data-phase','YELLOW');snapshot=await state();
    assert.equal(snapshot.gameplay.score,0);assert.equal(snapshot.gameplay.memberPoints,0);
    await page.screenshot({path:path.join(app.runtime.directory,'timeout-'+id+'.png')});
    await button('重新开始').click();await expect.poll(async()=>(await state()).engineState,{timeout:30_000}).toBe('RUNNING');
    assert.equal((await state()).gameplay.life,5);await expect(circle).toHaveAttribute('data-phase','BLUE');
    await button('退出调试，返回编辑').click();await page.locator('.editor-toolbar').waitFor();
    assert.ok(['IDLE','STOPPED'].includes((await state()).engineState));
    passed.push({name:game.name,id,saveReopen:true,clickNoScore:true,pauseFrozen:true,timeoutLife:true,restartCleanup:true});
  }
  assert.deepEqual(errors,[]);console.log('通过：打包版三种共用玩法保存重开、外围灯显示/点击、暂停、超时生命、重新开始和退出。');
} finally {
  if(page&&!page.isClosed())await page.screenshot({path:path.join(app.runtime.directory,'final-state.png')}).catch(()=>{});
  await writeFile(path.join(app.runtime.directory,'验证记录.json'),JSON.stringify({passed,errors,isolation:app.runtime.directory},null,2));
  await app.close();console.log('隔离验收目录：'+app.runtime.directory);
}
