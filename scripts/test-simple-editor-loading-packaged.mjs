// Packaged large-document acceptance. Only an isolated database copy is written.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchPackagedGame} from '../../ledGame-platform/game-soak-acceptance/src/packaged-app.mjs';
import {normalizeLevelOption} from '../src/lib/simpleLevelOptions.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const app=await launchPackagedGame({gameExecutable:path.join(root,'release/win-unpacked/LED Game.exe'),outputRoot:path.join(root,'.build/editor-loading-packaged'),...(process.argv[2]?{gameDatabaseSource:path.resolve(process.argv[2])}:{}),hardwareMode:'simulated',floor:{width:16,height:36},backendPort:0,limits:{startupSeconds:90}});
const records=[],errors=[];
try {
  let page;
  for(let i=0;i<150;i++){
    page=app.electron.windows().find(p=>p.url().includes('index.html')&&!p.url().includes('window='));
    if(page&&await page.locator('.app-nav').count())break;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  page.on('pageerror',error=>errors.push(error.message));
  await page.getByTestId('game-menu-button').click();await page.getByRole('menuitem',{name:'游戏列表',exact:true}).click();
  const games=(await page.evaluate(()=>window.ledGame.listManageableGames())).data.filter(g=>g.type!=='rank'&&g.name!=='simple-demo').slice(0,3);
  assert.equal(games.length,3);
  const api=(name,...args)=>page.evaluate(([name,args])=>window.ledGame[name](...args),[name,args]);
  for(const game of games){
    const id=game.gameId??game.id;
    const before=(await api('getGameEditor',id)).data;
    const frameCount=before.levels.reduce((n,l)=>n+l.frameList.length,0);
    const objectCount=before.levels.reduce((n,l)=>n+l.frameList.reduce((n,f)=>n+f.matrix.length,0),0);
    await page.evaluate(()=>{window.loadTasks=[];window.loadObserver=new PerformanceObserver(list=>window.loadTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration}))));window.loadObserver.observe({type:'longtask'});window.loadStart=performance.now();});
    await page.locator('.game-card[data-id="'+id+'"] .game-card-main').click();
    await page.waitForFunction(()=>document.querySelector('.simple-editor-fit-shell')?.classList.contains('ready'),{},{timeout:90000});
    const timing=await page.evaluate(()=>{window.loadObserver.disconnect();return {readyMs:performance.now()-window.loadStart,maxLongTaskMs:Math.max(0,...window.loadTasks.map(t=>t.duration))};});
    const originalSize=JSON.stringify(before).length;
    // Save through the actual UI; do not simplify levels/frames first.
    await page.getByRole('button',{name:'保存',exact:true}).click();
    await page.waitForFunction(()=>{const button=document.querySelector('.editor-toolbar button[aria-label="保存"]');return button&&!button.disabled;});
    assert.equal(await page.locator('.editor-feedback .error-line,.editor-feedback .validation-errors').count(),0);
    const saved=(await api('getGameEditor',id)).data;
    for(const key of ['name','type','mode','description','firstCatalog','cover','participants','siteSizeWidth','siteSizeHeight','globalTimeLimit','globalTimeLimitValue','globalLifeLimit','globalLifeLimitValue','audio','gif','commonConfig','wiringData'])assert.deepEqual(saved[key],before[key],key);
    assert.equal(saved.levels.length,before.levels.length);
    assert.equal(saved.levels.reduce((n,l)=>n+l.frameList.length,0),frameCount);
    assert.equal(saved.levels.reduce((n,l)=>n+l.frameList.reduce((n,f)=>n+f.matrix.length,0),0),objectCount);
    const geometry=doc=>doc.levels.map(l=>l.frameList.map(f=>({repeatTimes:f.repeatTimes,cells:f.matrix.map(o=>({id:o.id,color:o.color,cells:o.points.map(([dx,dy])=>[o.x+dx,o.y+dy])}))})));
    assert.deepEqual(geometry(saved),geometry(before));
    for(let i=0;i<before.levels.length;i++)assert.deepEqual(normalizeLevelOption(saved.levels[i].option),normalizeLevelOption(before.levels[i].option));
    await page.getByRole('button',{name:'返回列表',exact:true}).click();
    await page.locator('.game-card[data-id="'+id+'"] .game-card-main').click();
    await page.waitForFunction(()=>document.querySelector('.simple-editor-fit-shell')?.classList.contains('ready'),{},{timeout:90000});
    await page.getByRole('button',{name:'启动游戏',exact:true}).click();
    await page.locator('.editor-debug-workspace').waitFor();
    assert.equal(await page.locator('.editor-debug-entry-dialog').count(),0,'an unchanged saved game must enter debug without an unsaved prompt');
    await page.getByRole('button',{name:'退出调试，返回编辑',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.simple-editor-fit-shell')?.classList.contains('ready'));
    records.push({id,name:game.name,levels:before.levels.length,frames:frameCount,objects:objectCount,originalBytes:originalSize,...timing,fullSaveAndReopen:true,geometryUnchanged:true});
    console.log('通过：'+JSON.stringify(records.at(-1)));
    await page.getByRole('button',{name:'返回列表',exact:true}).click();
  }
  assert.deepEqual(errors,[]);
} finally {
  await mkdir(app.runtime.directory,{recursive:true});await writeFile(path.join(app.runtime.directory,'大游戏加载验证.json'),JSON.stringify({records,errors,isolation:app.runtime.directory},null,2));
  await app.close();console.log('隔离验收目录：'+app.runtime.directory);
}
