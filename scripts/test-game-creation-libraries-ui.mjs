import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(path.join(root, '../ledGame-platform/package.json'))('playwright');
const cache = path.join(process.env.LOCALAPPDATA, 'ms-playwright');
const chrome = (await readdir(cache)).filter(name => /^chromium-\d+$/.test(name)).sort().at(-1);
const output = path.join(root, '.build/game-creation-libraries-ui');
await mkdir(output, { recursive:true });
const server = await createServer({ root, server:{ host:'127.0.0.1', port:20000 + Math.floor(Math.random()*30000), strictPort:false } });
await server.listen();
const browser = await chromium.launch({ executablePath:path.join(cache, chrome, 'chrome-win64/chrome.exe') });
const page = await browser.newPage({ viewport:{ width:1366, height:768 } });
const errors = [], passed = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  window.fixture = { created:[], failCreate:false, failSave:false, firstSaves:[], firstPayloads:[], updates:[], reads:[], cancelUpload:false, failUpload:false, uploaded:[], folders:[], failFolder:false, deleted:[] };
  const games = [{ id:1, name:'Existing normal', type:'default' }, { id:2, name:'Existing rank', type:'rank' }];
  const file = name => ({ kind:'file', relativePath:name, name:name.split('/').at(-1), mediaType:'image', previewable:true });
  const tree = [{ kind:'directory', name:'A', relativePath:'A', children:[file('A/photo.png')] }];
  const spirits = [
    { id:'wide', name:'Wide', width:3, height:2, color:2, points:JSON.stringify([[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]]) },
    { id:'tall', name:'Tall', width:1, height:96, color:3, points:JSON.stringify([[0,0],[0,95]]) },
  ];
  const documents = {};
  window.makeDraft = family => ({
    id:null,name:'Draft',displayName:'Draft',type:family==='ranked'?'rank':'default',mode:'[1]',
    participants:1,minPlayers:1,maxPlayers:6,siteSizeWidth:16,siteSizeHeight:36,
    palette:['#ff0000','#0000ff','#00ff00','#ffff00','#aa00ff','#00ffff'],
    color0:'#00ff00',color1:'#0000ff',color2:'#ff0000',color3:'#aa00ff',
    commonConfig:{},wiringData:{runtimeEnabled:false,width:16,height:36},
    levels:family==='ranked'?[{type:1,durationSeconds:60,bounds:{minX:0,maxX:15,minY:0,maxY:35},targetsPerPlayerMin:3,targetsPerPlayerMax:4,refreshSeconds:6,bombMin:0,bombMax:1,bombWarningDelaySeconds:3,bombWarningDurationSeconds:1}]
      :[{label:'关卡 1',option:{passLevelScore:1,rewardPoints:0,timeLimitMode:'UNLIMITED',lifeLimitMode:'UNLIMITED'},frameList:[{repeatTimes:10,matrix:[]}]}],
  });
  const firstSave=async doc=>{
    if(window.fixture.failSave)throw new Error('首次保存失败');
    const id=games.length+1;documents[id]=structuredClone({...doc,id});games.push({id,name:doc.name,type:doc.type});
    window.fixture.firstSaves.push(id);window.fixture.firstPayloads.push(structuredClone(doc));return{data:{gameId:id,saved:true}};
  };
  const update=async(id,doc)=>{assertId(id);documents[id]=structuredClone(doc);window.fixture.updates.push(id);return{data:{gameId:id,saved:true}};};
  const assertId=id=>{if(!documents[id])throw new Error('不存在的游戏 ID');};
  const read=async id=>{window.fixture.reads.push(id);assertId(id);return{data:structuredClone(documents[id])};};
  window.ledGame = {
    seedSimpleVariants:async()=>{}, seedRankType1:async()=>{}, listManageableGames:async()=>({data:games}), listGameCategories:async()=>({data:[]}),
    newGameDraft:async family=>{ if(window.fixture.failCreate)throw new Error('草稿读取失败');const game={id:null,name:family,type:family==='ranked'?'rank':'default'};window.fixture.created.push(family);return{data:game}; },
    getGameEditor:read,getRankGameEditor:read,
    createGameEditor:firstSave,createRankGameEditor:firstSave,saveGameEditor:update,saveRankGameEditor:update,
    validateGameEditor:async()=>({data:{valid:true,errors:[]}}),validateRankGameEditor:async()=>({data:{valid:true,errors:[]}}),
  };
  window.spiritLibrary = {
    list:async()=>({data:structuredClone(spirits)}),
    create:async payload=>{const item={...payload,id:'created',points:JSON.stringify(payload.points)};spirits.push(item);return{data:item};},
    update:async(id,payload)=>{const item=spirits.find(item=>item.id===id);Object.assign(item,payload,{points:JSON.stringify(payload.points)});return{data:item};},
    delete:async id=>{window.fixture.deleted.push(id);spirits.splice(spirits.findIndex(item=>item.id===id),1);return{data:true};},
  };
  window.mediaLibrary = {
    list:async()=>({exists:true,items:structuredClone(tree)}),
    getPreviewUrl:async()=>({mediaType:'image',url:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>'}),
    upload:async folder=>{
      if(window.fixture.failUpload)throw new Error('上传写入失败');
      if(window.fixture.cancelUpload)return{canceled:true};
      window.fixture.uploaded.push(folder);const name=[folder,'uploaded.png'].filter(Boolean).join('/');
      (folder?tree.find(item=>item.relativePath===folder).children:tree).push(file(name));
      return{canceled:false,imported:[name],failures:[]};
    },
    createFolder:async(folder,name)=>{
      if(window.fixture.failFolder)throw new Error('目录创建失败');
      const relativePath=[folder,name].filter(Boolean).join('/');window.fixture.folders.push(relativePath);
      (folder?tree.find(item=>item.relativePath===folder).children:tree).push({kind:'directory',name,relativePath,children:[]});return{relativePath};
    },
  };
});
const mount = (name, props={}) => page.evaluate(({name,props})=>window.mountComponent(name,props), {name,props});
async function check(name, fn) { await fn(); passed.push(name); console.log(`通过：${name}`); }
try {
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/ui/catalog-library-harness.html`);
  await page.waitForFunction(()=>window.mountComponent);
  await check('新建入口仅在游戏列表，多维竞技禁用，取消不创建', async()=>{
    await mount('GameListView'); await page.locator('.game-category-heading').waitFor();
    assert.equal(await page.getByRole('button',{name:'新建游戏',exact:true}).count(),0);
    await mount('GameListView',{section:'list'});await page.locator('.game-card').first().waitFor();
    await page.getByRole('button',{name:'新建游戏',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:/多维竞技/}).isDisabled(),true);
    await page.keyboard.press('Escape'); assert.equal(await page.locator('.game-creation-dialog').count(),0);
    assert.deepEqual(await page.evaluate(()=>window.fixture.created),[]);
  });
  await check('草稿失败保留窗口，两种类型打开无 ID 草稿而不生成卡片', async()=>{
    await page.getByRole('button',{name:'新建游戏',exact:true}).click();
    await page.evaluate(()=>window.fixture.failCreate=true);
    await page.locator('.game-creation-dialog footer .primary').click();await page.getByRole('alert').waitFor();
    assert.equal(await page.evaluate(()=>window.componentEvents.length),0);
    await page.evaluate(()=>window.fixture.failCreate=false);
    await page.locator('.game-creation-dialog footer .primary').click();await page.locator('.game-creation-dialog').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>window.componentEvents.at(-1)[1].type),'default');
    assert.equal(await page.evaluate(()=>window.componentEvents.at(-1)[1].draft.id),null);
    await page.getByRole('button',{name:'新建游戏',exact:true}).click();
    await page.locator('.game-creation-dialog').getByRole('button',{name:/排位赛/}).click();await page.locator('.game-creation-dialog footer .primary').click();
    await page.locator('.game-creation-dialog').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>window.componentEvents.at(-1)[1].type),'rank');
    assert.equal(await page.evaluate(()=>window.componentEvents.at(-1)[1].draft.id),null);
    assert.equal((await page.evaluate(async()=> (await window.ledGame.listManageableGames()).data)).length,2);
    assert.deepEqual(await page.evaluate(()=>window.fixture.created),['entertainment','ranked']);
  });
  for (const family of ['entertainment','ranked']) await check(`${family} 编辑器首次保存失败可重试，后续保存复用 ID`, async()=>{
    const rank=family==='ranked';
    const draft=await page.evaluate(family=>window.makeDraft(family),family);
    await mount(rank?'RankGameEditorView':'SimpleGameEditorView',{gameId:null,initialDocument:draft});
    const input=rank?page.locator('input[data-rank-field="name"]'):page.locator('.simple-editor-layout .editor-left input').first();
    await input.waitFor();assert.equal(await input.inputValue(),'Draft');
    const debug=page.getByRole('button',{name:'启动游戏',exact:true});assert.equal(await debug.count(),0);
    assert.deepEqual(await page.evaluate(()=>window.fixture.reads),[]);
    const previousCount=await page.evaluate(()=>window.fixture.firstSaves.length);
    if (!rank) {
      await page.getByRole('button',{name:'全局配置',exact:true}).click();
      await page.locator('.global-config-field').filter({has:page.locator('.global-config-label').filter({hasText:/^名称$/})}).locator('input').fill('配置草稿');
      await page.locator('.global-config-actions .primary').click();await page.locator('.global-config-dialog').waitFor({state:'hidden'});
      assert.equal(await input.inputValue(),'配置草稿');
      await page.getByRole('button',{name:'符号灯布局',exact:true}).click();
      await page.locator('.pixel-layout-actions .primary').click();await page.locator('.pixel-layout-dialog').waitFor({state:'hidden'});
    }
    await page.getByRole('button',{name:'地砖布线',exact:true}).click();
    await page.locator('.game-wiring-dialog .elc408-actions .primary').click();await page.locator('.game-wiring-dialog').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>window.fixture.firstSaves.length),previousCount,'configuration saving must remain local');
    assert.deepEqual(await page.evaluate(()=>window.fixture.reads),[]);
    const save=rank?page.locator('.rank-actions .primary'):page.locator('.editor-toolbar').getByRole('button',{name:'保存',exact:true});
    await input.fill(`保存-${family}`);await page.evaluate(()=>window.fixture.failSave=true);await save.click();
    await page.locator('.error-line').filter({hasText:'首次保存失败'}).waitFor();
    assert.equal(await debug.count(),0);
    const previous=await page.evaluate(()=>window.fixture.firstSaves.length);
    await page.evaluate(()=>window.fixture.failSave=false);await save.click();
    await page.waitForFunction(previous=>window.fixture.firstSaves.length===previous+1,previous);
    const id=await page.evaluate(()=>window.fixture.firstSaves.at(-1));
    const payload=await page.evaluate(()=>window.fixture.firstPayloads.at(-1));
    assert.equal(payload.id,null);assert.equal(payload.wiringData.runtimeEnabled,true);
    if(rank)assert.equal(payload.levels[0].bounds.maxY,35);
    await input.fill(`更新-${family}`);await save.click();
    await page.waitForFunction(id=>window.fixture.updates.includes(id),id);
    assert.equal(await page.evaluate(()=>window.fixture.firstSaves.length),previous+1);
    assert.equal(await debug.count(),0);
    await page.screenshot({path:path.join(output,`首次保存-${family}.png`)});
  });
  await check('精灵缩略图真实颜色、正方形格子、等比例且首尾点不裁切', async()=>{
    await mount('SpiritLibraryView');await page.locator('.spirit-thumbnail').first().waitFor();
    const metrics=await page.locator('.spirit-thumbnail-card[data-id="wide"] canvas').evaluate(canvas=>{
      const ctx=canvas.getContext('2d'), data=ctx.getImageData(0,0,240,240).data, pts=[];
      for(let y=0;y<240;y++)for(let x=0;x<240;x++){const n=(y*240+x)*4;if(data[n]===239&&data[n+1]===68&&data[n+2]===68)pts.push([x,y]);}
      return{w:Math.max(...pts.map(p=>p[0]))-Math.min(...pts.map(p=>p[0]))+1,h:Math.max(...pts.map(p=>p[1]))-Math.min(...pts.map(p=>p[1]))+1};
    });
    assert.ok(Math.abs(metrics.w/metrics.h-1.5)<.025);
    const tall=await page.locator('.spirit-thumbnail-card[data-id="tall"] canvas').evaluate(canvas=>{
      const ctx=canvas.getContext('2d');return[ctx.getImageData(120,9,1,1).data[3],ctx.getImageData(120,230,1,1).data[3]];
    });assert.ok(tall.every(value=>value>0));
    await page.screenshot({path:path.join(output,'精灵缩略图.png')});
  });
  await check('精灵编辑、删除取消及确认均针对选中卡片', async()=>{
    await page.locator('.spirit-thumbnail-card[data-id="wide"]').click();
    await page.locator('.spirit-browser-toolbar button').first().click();await page.locator('.spirit-editor-dialog').waitFor();
    await page.locator('.spirit-editor-size-controls input').first().fill('4');
    await page.locator('.spirit-editor-actions .primary').click();await page.locator('.spirit-editor-dialog').waitFor({state:'hidden'});
    assert.match(await page.locator('.spirit-thumbnail-card[data-id="wide"]').innerText(),/4 × 2/);
    page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'删除',exact:true}).click();
    assert.equal(await page.locator('.spirit-thumbnail-card[data-id="wide"]').count(),1);
    page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'删除',exact:true}).click();
    await page.locator('.spirit-thumbnail-card[data-id="wide"]').waitFor({state:'hidden'});
    assert.deepEqual(await page.evaluate(()=>window.fixture.deleted),['wide']);
  });
  await check('媒体库上传目标、取消、失败与导入后预览', async()=>{
    await mount('MediaLibraryView');await page.locator('.media-tree-row').first().waitFor();
    await page.locator('.media-tree-row').filter({has:page.locator('.media-row-name').filter({hasText:/^A$/})}).click();
    await page.evaluate(()=>window.fixture.cancelUpload=true);await page.getByRole('button',{name:'上传文件',exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>window.fixture.uploaded),[]);
    await page.evaluate(()=>{window.fixture.cancelUpload=false;window.fixture.failUpload=true;});
    await page.getByRole('button',{name:'上传文件',exact:true}).click();await page.getByText('上传写入失败',{exact:true}).waitFor();
    await page.evaluate(()=>window.fixture.failUpload=false);await page.getByRole('button',{name:'上传文件',exact:true}).click();
    await page.getByText('uploaded.png',{exact:true}).waitFor();assert.deepEqual(await page.evaluate(()=>window.fixture.uploaded),['A']);
    await page.getByText('uploaded.png',{exact:true}).click();await page.locator('.media-preview-stage img').waitFor();
  });
  await check('媒体库目录创建失败可重试，取消后输入可用', async()=>{
    await page.getByRole('button',{name:'新建文件夹',exact:true}).click();await page.locator('.media-folder-dialog input').fill('child');
    await page.evaluate(()=>window.fixture.failFolder=true);await page.locator('.media-folder-dialog .primary').click();await page.getByText('目录创建失败',{exact:true}).waitFor();
    await page.locator('.media-folder-dialog input').fill('new-folder');await page.evaluate(()=>window.fixture.failFolder=false);
    await page.locator('.media-folder-dialog .primary').click();await page.locator('.media-folder-dialog').waitFor({state:'hidden'});
    assert.deepEqual(await page.evaluate(()=>window.fixture.folders),['A/new-folder']);
    await page.getByRole('button',{name:'新建文件夹',exact:true}).click();await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'新建文件夹',exact:true}).click();await page.locator('.media-folder-dialog input').fill('can type');
    assert.equal(await page.locator('.media-folder-dialog input').inputValue(),'can type');await page.keyboard.press('Escape');
    await page.screenshot({path:path.join(output,'媒体库内上传.png')});
  });
  assert.deepEqual(errors,[]);
} finally {
  await writeFile(path.join(output,'结果.json'),JSON.stringify({passed,errors},null,2));
  await browser.close();await server.close();
}
