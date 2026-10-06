import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.resolve(root,'../ledGame-platform/package.json'));
const {_electron}=require('playwright');
await mkdir(path.join(root,'.build'),{recursive:true});
const data=await mkdtemp(path.join(root,'.build/catalog-packaged-'));
const media=path.join(data,'media');
await mkdir(path.join(media,'A/B'),{recursive:true});
await mkdir(path.join(media,'C'),{recursive:true});
for(const file of ['A/B/cover.svg','C/cover.svg'])await writeFile(path.join(media,file),'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="36"><rect width="16" height="36" fill="cyan"/></svg>');
const portServer=net.createServer();await new Promise(resolve=>portServer.listen(0,'127.0.0.1',resolve));
const port=portServer.address().port;await new Promise(resolve=>portServer.close(resolve));
const env={...process.env,LED_USER_DATA_DIR:data,LED_MEDIA_DIR:media,LED_DEBUG_TCP_PORT:'0',LED_PORTABLE_BACKEND_PORT:String(port),LED_ROOM_CONNECTION_ENABLED:'false',ELC408_ENABLED:'false',LED_DISABLE_DEVTOOLS:'1'};
delete env.ELECTRON_RUN_AS_NODE;
let app,page;const passed=[];
async function launch(){
  app=await _electron.launch({executablePath:path.join(root,'release/win-unpacked/LED Game.exe'),env,timeout:90000});
  const until=Date.now()+90000;
  while(Date.now()<until){
    page=app.windows().find(window=>!window.isClosed()&&window.url().includes('/dist/index.html')&&!window.url().includes('window='));
    if(page&&await page.getByTestId('game-menu-button').count()){await page.locator('.game-category-heading').waitFor();return;}
    await new Promise(resolve=>setTimeout(resolve,150));
  }
  throw new Error('Packaged main window did not become ready');
}
async function select(section){await page.getByTestId('game-menu-button').click();await page.getByRole('menuitem',{name:section,exact:true}).click();}
async function reloadCatalog(){await page.locator('.nav-tab').filter({hasText:'媒体库'}).click();await select('首页');}
async function drag(source,target){
  await source.hover();await page.waitForTimeout(300);
  const a=await source.boundingBox(),b=await target.boundingBox();
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();
  await page.mouse.move(a.x+a.width/2-12,a.y+a.height/2+12,{steps:4});
  await page.mouse.move(b.x+b.width/2,b.y+Math.min(b.height/2,80),{steps:20});
  await page.mouse.move(b.x+b.width/2,b.y+Math.min(b.height/2,80)+2);await page.mouse.up();
  await page.locator('.catalog-sorting').waitFor({state:'hidden'});
}
try {
  await launch();
  const seeded=await page.evaluate(async()=>{
    const a=(await window.ledGame.createGameCategory({name:'验收分类 A',cover:''})).data;
    const b=(await window.ledGame.createGameCategory({name:'验收分类 B',cover:''})).data;
    const all=(await window.ledGame.listGameCategories()).data;
    await window.ledGame.reorderGameCategories([a.id,b.id,...all.filter(item=>item.id!==a.id&&item.id!==b.id).map(item=>item.id)]);
    const games=(await window.ledGame.listManageableGames()).data.map(game=>({...game,id:game.gameId}));
    const usable=games.filter(game=>game.name!=='simple-demo');
    if(usable.length<2)throw new Error('Need two packaged seed games for UI reorder');
    for(const game of usable.slice(0,2))await window.ledGame.updateGameMetadata(game.id,{firstCatalog:String(a.id)});
    return {a:a.id,b:b.id,games:usable.slice(0,2).map(item=>item.id),rank:games.find(game=>game.type==='rank')?.id};
  });
  await reloadCatalog();
  await drag(page.locator(`.game-category-card[data-id="${seeded.b}"] .catalog-drag-handle`),page.locator(`.game-category-card[data-id="${seeded.a}"]`));
  assert.deepEqual((await page.evaluate(async()=> (await window.ledGame.listGameCategories()).data.map(item=>item.id))).slice(0,2),[seeded.b,seeded.a]);
  passed.push('打包版分类实际拖动写入数据库');
  await page.locator(`.game-category-card[data-id="${seeded.a}"] .game-category-card-edit`).click();
  await page.getByRole('button',{name:'选择分类封面',exact:true}).click();
  await page.locator('.media-picker-row[data-path="A"]').click();await page.locator('.media-picker-row[data-path="A/B"]').click();
  await page.locator('.media-picker-row[data-path="A/B/cover.svg"]').dblclick();
  await page.locator('.game-category-edit-footer .primary').click();await page.locator('.game-category-edit-dialog').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(async id=>(await window.ledGame.listGameCategories()).data.find(item=>item.id===id).cover,seeded.a),'A/B/cover.svg');
  passed.push('打包版分类分层封面保存');
  await page.locator(`.game-category-card[data-id="${seeded.a}"] .game-category-card-main`).click();
  const before=await page.evaluate(async()=> (await window.ledGame.listManageableGames()).data.map(item=>item.gameId));
  await drag(page.locator(`.game-card[data-id="${seeded.games[1]}"] .catalog-drag-handle`),page.locator(`.game-card[data-id="${seeded.games[0]}"]`));
  let after=await page.evaluate(async()=> (await window.ledGame.listManageableGames()).data.map(item=>item.gameId));
  const expected=[...before];const first=expected.indexOf(seeded.games[0]),second=expected.indexOf(seeded.games[1]);
  [expected[first],expected[second]]=[expected[second],expected[first]];assert.deepEqual(after,expected);
  passed.push('打包版分类内游戏排序保留其他槽位');
  await select('游戏列表');
  const visible=await page.locator('.game-card').evaluateAll(cards=>cards.map(card=>Number(card.dataset.id)));
  const fullExpected=[...after], slots=after.map((id,index)=>visible.includes(id)?index:-1).filter(index=>index>=0);
  const reordered=[...visible];reordered.unshift(reordered.pop());
  slots.forEach((slot,index)=>{fullExpected[slot]=reordered[index];});
  await drag(page.locator(`.game-card[data-id="${visible.at(-1)}"] .catalog-drag-handle`),page.locator(`.game-card[data-id="${visible[0]}"]`));
  after=await page.evaluate(async()=> (await window.ledGame.listManageableGames()).data.map(item=>item.gameId));
  assert.deepEqual(after,fullExpected);
  passed.push('打包版完整游戏列表拖动排序保留隐藏项槽位');
  await page.locator(`.game-card[data-id="${seeded.games[0]}"] .game-card-edit`).click();
  await page.getByRole('button',{name:'选择图片',exact:true}).click();await page.locator('.media-picker-row[data-path="C"]').click();
  await page.locator('.media-picker-row[data-path="C/cover.svg"]').dblclick();await page.locator('.game-info-actions .primary').click();
  await page.locator('.game-info-dialog').waitFor({state:'hidden'});
  passed.push('打包版游戏分层封面保存');
  if(seeded.rank){
    await page.locator(`.game-card[data-id="${seeded.rank}"] .game-card-main`).click();
    await page.locator('.rank-editor input[data-rank-field="name"]').fill('未保存的验收草稿');
    await page.getByTestId('language-menu-button').click();await page.locator('.language-dialog input[value="en-US"]').click();
    await page.locator('.language-dialog').waitFor({state:'hidden'});
    assert.equal(await page.locator('.rank-editor input[data-rank-field="name"]').inputValue(),'未保存的验收草稿');
    await page.locator('.rank-editor input[data-rank-field="name"]').fill('语言切换后可继续输入');
    await page.getByTestId('language-menu-button').click();await page.locator('.language-dialog input[value="zh-CN"]').click();await page.locator('.language-dialog').waitFor({state:'hidden'});
    passed.push('打包版语言切换保留编辑器草稿与可输入状态');
  }
  await page.locator('.nav-tab').filter({hasText:'精灵库'}).click();await page.locator('.spirit-heading-actions .icon-add-button').waitFor();
  for(let color=0;color<4;color++){
    await page.locator('.spirit-heading-actions .icon-add-button').click();
    await page.locator('.spirit-editor-name input').fill(`验收颜色 ${color}`);
    await page.locator('.spirit-editor-size-controls input').nth(0).fill('2');await page.locator('.spirit-editor-size-controls input').nth(1).fill('2');
    await page.locator(`.spirit-editor-colors input[value="${color}"]`).click();await page.locator('.spirit-editor-canvas').click({position:{x:10,y:10}});
    await page.locator('.spirit-editor-actions .primary').click();await page.locator('.spirit-editor-dialog').waitFor({state:'hidden'});
  }
  const colors=await page.evaluate(async()=> (await window.spiritLibrary.list()).data.filter(item=>item.name.startsWith('验收颜色 ')).map(item=>({id:item.id,name:item.name,color:item.color,width:item.width,height:item.height,points:item.points,basic:item.basic})).sort((a,b)=>a.color-b.color));
  assert.deepEqual(colors.map(item=>item.color),[0,1,2,3]);assert.ok(colors.every(item=>item.width===2&&item.height===2&&item.points==='[[0,0]]'&&item.basic===false));
  passed.push('打包版四色精灵创建落库');
  await page.screenshot({path:path.join(data,'sprite.png')});
  await app.close();app=null;
  await launch();
  assert.deepEqual((await page.evaluate(async()=> (await window.ledGame.listGameCategories()).data.map(item=>item.id))).slice(0,2),[seeded.b,seeded.a]);
  assert.deepEqual(await page.evaluate(async()=> (await window.ledGame.listManageableGames()).data.map(item=>item.gameId)),after);
  const reloaded=await page.evaluate(async()=> (await window.spiritLibrary.list()).data.filter(item=>item.name.startsWith('验收颜色 ')).sort((a,b)=>a.color-b.color));
  assert.deepEqual(reloaded.map(item=>item.color),[0,1,2,3]);
  assert.equal(await page.evaluate(async id=>(await window.ledGame.listGameCategories()).data.find(item=>item.id===id).cover,seeded.a),'A/B/cover.svg');
  assert.equal(await page.evaluate(async id=>(await window.ledGame.listManageableGames()).data.find(item=>item.gameId===id).cover,seeded.games[0]),'C/cover.svg');
  passed.push('真正关闭并重新启动后，排序、封面与精灵颜色保留');
  console.log(JSON.stringify({data,passed},null,2));
} catch(error) {
  if(page&&!page.isClosed())await page.screenshot({path:path.join(data,'failure.png')});
  console.error(`Evidence: ${data}`);throw error;
} finally {
  await app?.close();
  await writeFile(path.join(data,'results.json'),JSON.stringify({passed},null,2));
}
