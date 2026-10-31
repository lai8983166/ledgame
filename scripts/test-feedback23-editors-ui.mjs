import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=createRequire(path.join(root,'../ledGame-platform/package.json'))('playwright');
const cache=path.join(process.env.LOCALAPPDATA,'ms-playwright');
const chrome=(await readdir(cache)).filter(name=>/^chromium-\d+$/.test(name)).sort().at(-1);
const output=path.join(root,'.build/feedback23-editors-ui');await mkdir(output,{recursive:true});
const vite=await createServer({root,server:{middlewareMode:true,hmr:false}});
const server=http.createServer(vite.middlewares);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:path.join(cache,chrome,'chrome-win64/chrome.exe')});
const page=await browser.newPage({viewport:{width:1366,height:900}});page.setDefaultTimeout(10000);
const errors=[],passed=[];page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{
  window.fixture={saves:[],fail:false,closeResponses:[]};
  const simple={id:7,name:'测试游戏',type:'default',mode:'[2]',cover:'cover.png',firstCatalog:'娱乐挑战',siteSizeWidth:16,siteSizeHeight:36,minPlayers:1,maxPlayers:6,
    audio:{scoreSound:'s.mp3',injurySound:'i.mp3',purpleSound:'p.mp3'},gif:{standby:'i.gif',gameFailure:'f.gif',gameOver:'o.gif'},
    commonConfig:{gameStartAudio:'s.mp3',gameEndSuccessAudio:'s.mp3',gameEndFailAudio:'f.mp3',levelPassAudio:'p.mp3',levelRestartAudio:'r.mp3'},
    levels:[{label:'A',option:{rewardPoints:0,timeLimitMode:'UNLIMITED',timeLimitValue:0,lifeLimitMode:'UNLIMITED'},frameList:[{repeatTimes:1,matrix:[]}]}]};
  const rank={id:8,name:'Rank',displayName:'Rank',type:'rank',siteSizeWidth:16,siteSizeHeight:36,levels:[{label:'Ranking',type:1,rewardPoints:0,durationSeconds:60,bounds:{minX:0,minY:0,maxX:15,maxY:35},targetsPerPlayerMin:3,targetsPerPlayerMax:4,bombMin:0,bombMax:1}]};
  window.fixture.simple=simple;window.fixture.rank=rank;
  const save=async(id,document)=>{if(window.fixture.fail)throw Error('模拟保存失败');window.fixture.saves.push(structuredClone(document));return{data:{saved:true,gameId:id}};};
  window.appLanguage={get:async()=>'zh-CN',onChanged:()=>()=>{}};
  window.appSettings={get:async()=>({applicationTitle:'客户品牌'}),getIconData:async()=>({dataUrl:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>'}),onChanged:()=>()=>{}};
  window.ledGame={windowKind:'main',onCloseRequested:cb=>{window.fixture.close=cb;return()=>{};},respondToClose:(id,allowed)=>window.fixture.closeResponses.push({id,allowed}),
    state:async()=>({data:{engineState:'IDLE'}}),onEngineState:()=>()=>{},getGameEditor:async()=>({data:structuredClone(simple)}),getRankGameEditor:async()=>({data:structuredClone(rank)}),
    listGames:async()=>({data:[]}),listGameCategories:async()=>({data:[{name:'娱乐挑战'}]}),saveGameEditor:save,saveRankGameEditor:save,validateRankGameEditor:async()=>({data:{valid:true}})};
  window.spiritLibrary={list:async()=>({data:[]})};
});
const shell=()=>page.evaluate(()=>window.getComponentSetup());
const editor=code=>page.evaluate(code);
const mutate=()=>editor(()=>{const s=document.querySelector('.simple-editor-workspace,.rank-editor').__vueParentComponent.setupState;if(s.document.type==='rank')s.document.levels[0].rewardPoints++;else s.document.levels[0].frameList[0].repeatTimes++;});
async function open(type){await page.evaluate(type=>window.getComponentSetup().openGameEditor(type==='rank'?window.fixture.rank:window.fixture.simple),type);await page.locator(type==='rank'?'.rank-config-editor':'.simple-editor-fit-shell.ready').waitFor();}
async function check(name,fn){await fn();passed.push(name);console.log('PASS '+name);}
try{
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/ui/catalog-library-harness.html`);await page.waitForFunction(()=>window.mountComponent);await page.evaluate(()=>window.mountComponent('App'));
  await check('导航显示已配置品牌图标和名称',async()=>{await page.locator('.app-brand-title').getByText('客户品牌').waitFor();assert.equal(await page.locator('.app-brand img').count(),1);});
  for(const type of ['default','rank']){
    await open(type);
    await check(`${type}未修改离开不提示，修改后可继续或放弃`,async()=>{
      await page.getByRole('button',{name:'媒体库',exact:true}).click();assert.equal(await page.locator('.editor-leave-dialog').count(),0);
      await open(type);await mutate();await page.getByRole('button',{name:'返回列表',exact:true}).click();await page.locator('.editor-leave-dialog').waitFor();
      await page.getByRole('button',{name:'继续编辑',exact:true}).click();assert.equal(await page.locator(type==='rank'?'.rank-editor':'.simple-editor-workspace').count(),1);
      await page.getByRole('button',{name:'媒体库',exact:true}).click();await page.getByRole('button',{name:'不保存并离开',exact:true}).click();await page.locator('.editor-leave-dialog').waitFor({state:'hidden'});
    });
    await open(type);await mutate();
    await check(`${type}保存失败留在编辑器，成功保存后离开`,async()=>{
      await page.evaluate(()=>window.fixture.fail=true);await page.getByRole('button',{name:'媒体库',exact:true}).click();await page.getByRole('button',{name:'保存并离开',exact:true}).click();
      await page.locator('.editor-save-dialog').waitFor();assert.equal(await page.locator(type==='rank'?'.rank-editor':'.simple-editor-workspace').count(),1);
      await page.locator('.editor-save-dialog button').click();await page.evaluate(()=>window.fixture.fail=false);
      await page.getByRole('button',{name:'媒体库',exact:true}).click();await page.getByRole('button',{name:'保存并离开',exact:true}).click();await page.locator(type==='rank'?'.rank-editor':'.simple-editor-workspace').waitFor({state:'hidden'});
    });
  }
  await open('default');await mutate();
  await check('主窗关闭取消不批准，放弃后才批准',async()=>{
    await page.evaluate(()=>{void window.fixture.close({requestId:1});});await page.getByRole('button',{name:'继续编辑',exact:true}).click();await page.waitForFunction(()=>window.fixture.closeResponses.length===1);assert.equal(await page.evaluate(()=>window.fixture.closeResponses[0].allowed),false);
    await page.evaluate(()=>{void window.fixture.close({requestId:2});});await page.getByRole('button',{name:'不保存并离开',exact:true}).click();await page.waitForFunction(()=>window.fixture.closeResponses.length===2);assert.equal(await page.evaluate(()=>window.fixture.closeResponses[1].allowed),true);
  });
  await check('循环秒数初值为1，次数与秒数标签分开',async()=>{
    await editor(()=>{const s=document.querySelector('.simple-editor-workspace').__vueParentComponent.setupState;s.updateActiveLevelTimeMode('CYCLE_SECONDS');});
    await page.getByText('时长（秒）',{exact:true}).waitFor();assert.equal(await editor(()=>document.querySelector('.simple-editor-workspace').__vueParentComponent.setupState.document.levels[0].option.timeLimitValue),1);
    await editor(()=>document.querySelector('.simple-editor-workspace').__vueParentComponent.setupState.updateActiveLevelTimeMode('CYCLE_COUNT'));await page.getByText('次数',{exact:true}).waitFor();
  });
  await check('单独保存全局配置不清除Simple和Rank其他草稿，普通保存后恢复干净',async()=>{
    for(const type of ['default','rank']){
      // Previous close approval in this browser fixture does not actually destroy its window.
      await page.evaluate(()=>window.getComponentSetup().activeView='games');await open(type);await mutate();
      await editor(async()=>{const s=document.querySelector('.simple-editor-workspace,.rank-editor').__vueParentComponent.setupState;await s.saveGlobalConfig({name:'仅保存配置'});});
      await page.locator('.editor-save-dialog button').click();
      await page.getByRole('button',{name:'媒体库',exact:true}).click();await page.locator('.editor-leave-dialog').waitFor();
      await page.getByRole('button',{name:'继续编辑',exact:true}).click();
      await page.locator('.editor-heading-actions,.rank-actions').getByRole('button',{name:'保存',exact:true}).click();await page.locator('.editor-save-dialog button').click();
      await page.getByRole('button',{name:'媒体库',exact:true}).click();assert.equal(await page.locator('.editor-leave-dialog').count(),0);
    }
  });
  await page.screenshot({path:path.join(output,'editor-brand-colors.png')});assert.deepEqual(errors,[]);
  await writeFile(path.join(output,'results.json'),JSON.stringify({passed,errors},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await vite.close();}
