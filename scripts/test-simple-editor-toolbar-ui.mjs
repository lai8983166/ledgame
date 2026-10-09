import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { EFFECT_SPRITE_NAMES } from '../src/lib/effectEditor.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(path.join(root, '../ledGame-platform/package.json'))('playwright');
const cache = path.join(process.env.LOCALAPPDATA, 'ms-playwright');
const chrome = (await readdir(cache)).filter(n => /^chromium-\d+$/.test(n)).sort().at(-1);
const output = path.join(root, '.build/simple-editor-toolbar-ui');
await mkdir(output, { recursive: true });
const server = await createServer({ root, optimizeDeps:{include:['gifenc']}, server: { host:'127.0.0.1',port:0 } });
await server.listen();
const browser = await chromium.launch({ executablePath:path.join(cache,chrome,'chrome-win64/chrome.exe') });
const page = await browser.newPage({ viewport:{width:1366,height:768} });
await page.addInitScript(commonNames => {
  window.appLanguage = { get:async()=>'zh-CN',set:async v=>v,onChanged:()=>()=>{} };
  const p=(id,x,y,color=2)=>({id,x,y,color,points:[[0,0]]});
  const game={id:1,name:'Simple测试',type:'default',mode:'[1]',siteSizeWidth:16,siteSizeHeight:36,commonConfig:{},gif:{},
    levels:[{label:'第一关',frameList:[{repeatTimes:2,matrix:[p('red',1,1)]},{repeatTimes:4,matrix:[]}]}]};
  window.fixture={game,confirms:[],failSave:false,importContent:'',saves:0,exportContent:'',
    reset(){game.levels[0].frameList=[{repeatTimes:2,matrix:[p('red',1,1)]},{repeatTimes:4,matrix:[]}];}};
  window.confirm = message => {window.fixture.confirms.push(message);return false;};
  window.ledGame={getGameEditor:async()=>({data:structuredClone(game)}),listGameCategories:async()=>({data:[]}),
    saveGameEditor:async(id,value)=>{if(window.fixture.failSave)throw Error('保存失败');Object.assign(game,structuredClone(value));window.fixture.saves++;return {data:{saved:true}};},
    gameState:async()=>({data:{engineState:'IDLE',queueSummary:{waiting:[]}}}),
    validateGameEditor:async()=>({data:{valid:true,errors:[]}}),restoreFocus:async()=>{},
    importFrameJson:async()=>({content:window.fixture.importContent}),exportFrameJson:async value=>{window.fixture.exportContent=value.content;return {filePath:'fixture.json'};},
    saveGif:async value=>{window.fixture.gifBytes=Array.from(value.bytes);if(window.fixture.waitGif)await new Promise(resolve=>window.fixture.finishGif=resolve);return {fileName:'fixture.gif'};},onEngineState:()=>()=>{},onLedFrame:()=>()=>{},
  };
  window.spiritLibrary={list:async()=>({data:[...commonNames.map((name,index)=>({id:index+100,name,color:2,
    width:name==='Double'?2:name==='20'?40:3,height:name==='Double'?3:2,
    points:name==='Double'?[[0,0],[1,2]]:name==='20'?[[0,0],[39,1]]:[[0,0],[2,1]]})),
    {id:10,name:'测试精灵',color:2,width:3,height:3,points:[[0,0],[2,2]]}]})};
  window.mediaLibrary={list:async()=>({items:['pass.mp3','retry.mp3','pass.gif','fail.gif'].map(name=>({name,relativePath:name,kind:'file',mediaType:name.endsWith('.mp3')?'audio':'image'}))}),
    getPreviewUrl:async name=>({mediaType:name.endsWith('.mp3')?'audio':'image',url:name.endsWith('.mp3')?'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=':'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="16" height="36"/%3E'})};
},Object.values(EFFECT_SPRITE_NAMES).flat());
const errors=[],passed=[];
page.on('pageerror',error=>errors.push(error.message));
const button=name=>page.getByRole('button',{name,exact:true});
const read=()=>page.evaluate(()=>{
  const s=window.getComponentSetup();
  return {matrix:JSON.parse(JSON.stringify(s.activeFrame.matrix)),frames:JSON.parse(JSON.stringify(s.frames)),
    selected:s.selectedObjectId,undo:s.rgbEditHistory.undoCount,status:s.statusMessage,error:s.errorMessage};
});
const mount=async()=>{
  await page.evaluate(()=>window.mountComponent('SimpleGameEditorView',{gameId:1}));
  await page.locator('.simple-editor-fit-viewport').waitFor();
  await page.waitForFunction(()=>window.getComponentSetup()?.editorFitReady);
};
async function check(name,fn){await fn();passed.push(name);console.log('通过：'+name);}
try {
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/ui/catalog-library-harness.html`);
  await page.waitForFunction(()=>window.mountComponent);
  await mount();
  await check('无模式开关与精灵画笔入口，四色画笔在对象面板',async()=>{
    assert.equal(await page.locator('.editor-mode-option').count(),0);
    assert.equal(await page.locator('.object-sprite-button').count(),0);
    assert.equal(await page.locator('.object-panel .object-action-palette button').count(),4);
  });
  await check('关卡资源仅在基础信息，全局配置不覆盖草稿、保存重开与取消选择',async()=>{
    const fields=page.locator('.editor-level-media-field');
    assert.equal(await fields.count(),4);
    await fields.first().getByRole('button',{name:'选择 关卡通过语音',exact:true}).click();
    await page.locator('.media-picker-dialog').waitFor();await button('取消').click();
    assert.equal(await fields.first().locator('input').inputValue(),'');
    for(const [index,name] of ['pass.mp3','retry.mp3','pass.gif','fail.gif'].entries()){
      await fields.nth(index).getByRole('button',{name:/^选择 /}).click();
      await page.locator('.media-picker-row[data-path="'+name+'"]').click();
      await button('确认').click();await page.locator('.media-picker-dialog').waitFor({state:'hidden'});
    }
    assert.equal(await fields.locator('audio').count(),2);assert.equal(await fields.locator('img').count(),2);
    await button('全局配置').click();await page.locator('.global-config-dialog').waitFor();
    for(const label of ['关卡通过语音','关卡重启语音','关卡结算动画','关卡失败动画'])assert.equal(await page.locator('.global-config-dialog').getByText(label,{exact:true}).count(),0);
    await page.evaluate(()=>window.fixture.failSave=true);
    await page.locator('.global-config-dialog').getByRole('button',{name:'保存',exact:true}).click();
    await page.getByText('保存失败',{exact:true}).first().waitFor();
    assert.equal(await fields.first().locator('input').inputValue(),'pass.mp3');
    await page.evaluate(()=>window.fixture.failSave=false);
    await page.locator('.global-config-dialog').getByRole('button',{name:'保存',exact:true}).click();
    await page.locator('.global-config-dialog').waitFor({state:'hidden'});
    assert.equal(await fields.first().locator('input').inputValue(),'pass.mp3');
    assert.equal(await page.evaluate(()=>window.fixture.game.commonConfig?.levelPassAudio || ''),'');
    await button('保存').click();await mount();
    assert.deepEqual(await fields.locator('input').evaluateAll(els=>els.map(el=>el.value)),['pass.mp3','retry.mp3','pass.gif','fail.gif']);
    await fields.first().getByRole('button',{name:'选择 关卡通过语音',exact:true}).click();await button('取消').click();
    assert.equal(await fields.first().locator('input').inputValue(),'pass.mp3');
    const matrixBefore=await page.locator('.matrix-overlay-canvas').boundingBox();
    await fields.last().scrollIntoViewIfNeeded();
    assert.deepEqual(await page.locator('.matrix-overlay-canvas').boundingBox(),matrixBefore);
    assert.equal(await page.locator('.editor-left').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
    await page.screenshot({path:path.join(output,'level-media-1366.png')});
  });
  await check('帧下统一行、隐藏入口、实心四宫格和文字重复次数',async()=>{
    assert.equal(await page.locator('.editor-side-rail').count(),0);
    assert.equal(await page.locator('.object-panel .object-actions').count(),0);
    assert.equal(await page.locator('.editor-toolbar button[aria-label="启动游戏"]').count(),1);
    for(const action of ['复制当前帧到前一帧','添加帧','修改基准点','改色','左转90']) assert.equal(await button(action).count(),0);
    assert.equal(await button('右转90').count(),1);
    assert.equal(await page.locator('.repeat-times-control button').innerText(),'复制重复次数');
    assert.equal(await page.locator('.color-copy-button rect[fill="currentColor"]').count(),16);
  });
  await check('同色点击无变化、不同色叠加、部分重复框选、完全重复无历史',async()=>{
    await page.evaluate(()=>window.getComponentSetup().selectColor(2));
    const before=await read();
    await page.evaluate(()=>window.getComponentSetup().handleCellClick(1,1));
    assert.deepEqual((await read()).matrix,before.matrix);assert.equal((await read()).undo,before.undo);
    await page.evaluate(()=>{const s=window.getComponentSetup();s.selectColor(1);s.handleCellRangeCreate({cells:[{x:1,y:1}]});});
    assert.equal((await read()).matrix.length,2);
    await page.evaluate(()=>{const s=window.getComponentSetup();s.selectColor(2);s.handleCellRangeCreate({cells:[{x:1,y:1},{x:2,y:1},{x:3,y:1}]});});
    const range=await read(),object=range.matrix.at(-1);
    assert.deepEqual([object.x,object.y],[2,1]);assert.deepEqual(object.points,[[0,0],[1,0]]);
    await page.evaluate(()=>window.getComponentSetup().handleCellRangeCreate({cells:[{x:1,y:1},{x:2,y:1},{x:3,y:1}]}));
    assert.deepEqual(await read(),range);
  });
  await check('移动/旋转冲突静默无变化、精灵保持形状、中心空洞不新增点',async()=>{
    await page.evaluate(()=>window.getComponentSetup().selectObject('red'));
    const before=await read();
    await page.evaluate(()=>window.getComponentSetup().moveSelectedObject(1,0));
    assert.deepEqual(await read(),before);
    await page.evaluate(()=>{const s=window.getComponentSetup();s.handleObjectDragStart({x:1,y:1});});
    const dragBefore=await read();
    await page.evaluate(()=>{const s=window.getComponentSetup();s.handleObjectDrag({current:{x:2,y:1}});s.handleObjectDragEnd({cancelled:false});});
    assert.deepEqual(await read(),dragBefore);
    await page.evaluate(()=>window.getComponentSetup().spriteSearchText='3 3');
    await page.getByRole('button',{name:'测试精灵',exact:true}).click();
    await page.evaluate(()=>window.getComponentSetup().handleCellClick(5,5));
    const sprite=(await read()).matrix.at(-1);
    assert.deepEqual([sprite.x,sprite.y],[6,6]);assert.deepEqual(sprite.points,[[-1,-1],[1,1]]);
    await page.evaluate(()=>window.getComponentSetup().handleCellClick(5,5));
    assert.deepEqual((await read()).matrix.at(-1),sprite);
    await page.evaluate(()=>{const s=window.getComponentSetup();s.selectObject(s.activeFrame.matrix.at(-1).id);});
    await button('右转90').click();
    assert.deepEqual((await read()).matrix.at(-1).points,[[1,-1],[-1,1]]);
    await page.evaluate(()=>{const s=window.getComponentSetup();s.activeFrame.matrix.push({id:'block-rotation',x:7,y:7,color:2,points:[[0,0]]});});
    const rotateBefore=await read();
    await button('右转90').click();
    assert.deepEqual(await read(),rotateBefore);
    await page.evaluate(()=>{const s=window.getComponentSetup();s.activeFrame.matrix.pop();s.invalidateMatrixFrame();});
  });
  await check('批量复制同色重叠不部分提交，同 ID 更新正常',async()=>{
    await page.evaluate(()=>{const s=window.getComponentSetup();s.frames.push({repeatTimes:1,matrix:[{id:'other',x:1,y:1,color:2,points:[[0,0]]}]});});
    const before=await read();await page.evaluate(()=>window.getComponentSetup().copyColorObjectsToAllFrames(2));
    assert.deepEqual(await read(),before);
    await page.evaluate(()=>{const s=window.getComponentSetup();s.frames.pop();s.frames[1].matrix=[{id:'red',x:0,y:0,color:2,points:[[0,0]]}];s.copyColorObjectsToAllFrames(2);});
    assert.equal((await read()).frames[1].matrix.find(o=>o.id==='red').x,1);
  });
  await check('对象立即删除、撤销恢复，帧删除仍确认',async()=>{
    await page.evaluate(()=>{const s=window.getComponentSetup();s.selectObject('red');window.fixture.confirms=[];});
    const before=(await read()).matrix;await page.locator('.object-danger-button').click();
    assert.equal(await page.evaluate(()=>window.fixture.confirms.length),0);
    await page.evaluate(()=>window.getComponentSetup().undoRgbEdit());assert.deepEqual((await read()).matrix,before);
    await page.evaluate(()=>window.getComponentSetup().deleteCurrentFrame());
    assert.equal(await page.evaluate(()=>window.fixture.confirms.length),1);
    await page.locator('.editor-toolbar').click({position:{x:1,y:1}});
    await page.keyboard.press('Delete');assert.equal((await read()).matrix.some(o=>o.id==='red'),false);
    await page.keyboard.press('Control+z');assert.deepEqual((await read()).matrix,before);
    assert.equal(await page.evaluate(()=>window.fixture.confirms.length),1);
  });
  await check('非法同色导入静默不改文档，语法错误仍提示',async()=>{
    const before=await read();
    await page.evaluate(()=>{window.fixture.importContent=JSON.stringify({matrix:[{id:'a',x:0,y:0,color:1},{id:'b',x:0,y:0,color:1}]});});
    await page.evaluate(()=>window.getComponentSetup().importFrame());
    assert.deepEqual((await read()).frames,before.frames);assert.equal((await read()).undo,before.undo);assert.equal((await read()).error,'');
    await page.evaluate(()=>{window.fixture.importContent='{';return window.getComponentSetup().importFrame();});
    assert.notEqual((await read()).error,'');
  });
  await check('保存重开中心与旧叠层无损，错误仍可见，导出和预览正常',async()=>{
    await page.evaluate(()=>{const s=window.getComponentSetup();s.activeFrame.matrix.push({id:'legacy',x:1,y:1,color:2,points:[[0,0]]});window.fixture.failSave=true;});
    await button('保存').click();assert.match(await page.locator('.error-line').first().innerText(),/保存失败/);
    await page.evaluate(()=>window.fixture.failSave=false);await button('保存').click();
    const saved=(await read()).matrix;await mount();assert.deepEqual((await read()).matrix,saved);
    await page.evaluate(()=>window.getComponentSetup().exportCurrentFrame());
    assert.deepEqual(await page.evaluate(()=>JSON.parse(window.fixture.exportContent).matrix),saved);
    await button('打开预览').click();assert.equal(await page.locator('.simple-level-preview-dialog').count(),1);
    await page.evaluate(()=>window.getComponentSetup().closeLevelPreview());
  });
  await check('真实 GIF 编码、导出进度与忙碌禁用状态',async()=>{
    await page.evaluate(()=>window.fixture.waitGif=true);
    await button('导出 GIF').click();
    await page.waitForFunction(()=>window.fixture.gifBytes?.length>0);
    assert.deepEqual(await page.evaluate(()=>window.fixture.gifBytes.slice(0,3)),[71,73,70]);
    assert.equal(await button('保存').isDisabled(),true);
    assert.equal(await button('启动游戏').isDisabled(),true);
    assert.ok((await page.locator('.editor-feedback').innerText()).includes('GIF'));
    await page.evaluate(()=>window.fixture.finishGif());
    await page.waitForFunction(()=>window.getComponentSetup().busyAction==='');
    assert.equal(await button('保存').isDisabled(),false);
    assert.match((await read()).status,/fixture.gif/);
  });
  await check('特效重复不报错且无部分提交，旧冲突不阻断其他帧插入',async()=>{
    const config={mode:'merge',color:2,width:1,height:1,startX:2,startY:2,endX:2,endY:2,step:1,repeatTimes:1};
    const before=await read();
    await page.evaluate(config=>window.getComponentSetup().applyEffectResult({frames:[{}],config}),config);
    assert.deepEqual((await read()).frames,before.frames);
    assert.equal((await read()).undo,before.undo);assert.equal((await read()).error,'');
    await page.evaluate(config=>window.getComponentSetup().applyEffectResult({frames:[{}],config:{...config,mode:'insert',startX:8,startY:8,endX:8,endY:8}}),config);
    assert.equal((await read()).frames.length,before.frames.length+1);
  });
  await check('旧元组与叠层加载不写库、不新增历史，保存重开保持绝对图形和空帧',async()=>{
    const saves=await page.evaluate(()=>{
      const f=window.fixture;
      f.game.levels[0].frameList=[{repeatTimes:1,matrix:[
        [5,5,'tuple',{color:3,points:[[0,0],[2,2]]}],
        ...['a','b','c'].map(id=>({id,x:0,y:0,color:2,points:[[0,0]],extra:'保留'})),
      ]},{repeatTimes:1,matrix:[]}];
      return f.saves;
    });
    await mount();
    const loaded=await read();
    assert.equal(loaded.undo,0);assert.equal(await page.evaluate(()=>window.fixture.saves),saves);
    assert.equal(loaded.matrix.length,4);assert.deepEqual(loaded.frames[1].matrix,[]);
    assert.deepEqual([loaded.matrix[0].x,loaded.matrix[0].y],[6,6]);
    assert.deepEqual(loaded.matrix[0].points,[[-1,-1],[1,1]]);
    assert.equal(loaded.matrix[1].extra,'保留');
    await button('保存').click();await mount();assert.deepEqual((await read()).matrix,loaded.matrix);
    await page.evaluate(()=>{const s=window.getComponentSetup();s.selectObject('a');return s.deleteSelectedObject();});
    assert.equal((await read()).matrix.length,3);
    await page.evaluate(()=>window.getComponentSetup().undoRgbEdit());assert.deepEqual((await read()).matrix,loaded.matrix);
    await page.evaluate(()=>{const s=window.getComponentSetup();s.enterSelectionMode();s.mergeSelectionIds=['a','b'];s.mergeSelectedObjects();});
    assert.equal((await read()).matrix.length,3);
    await page.evaluate(()=>window.getComponentSetup().undoRgbEdit());assert.deepEqual((await read()).matrix,loaded.matrix);
    await page.evaluate(()=>{const s=window.getComponentSetup();s.stopSelectionMode();s.togglePanoramaMode();});
  });
  await check('真实鼠标：已有点选中，起点锁定移动/单色框选，精灵仅单击放置',async()=>{
    await page.evaluate(()=>window.fixture.reset());await mount();
    const canvas=page.locator('.matrix-overlay-canvas');
    const point=async(x,y)=>{const b=await canvas.boundingBox();return {x:b.x+b.width*(x+2.5)/20,y:b.y+b.height*(y+2.5)/40};};
    const click=async(x,y)=>{const p=await point(x,y);await page.mouse.click(p.x,p.y);};
    const drag=async(x,y,endX,endY,back=false)=>{const a=await point(x,y),b=await point(endX,endY);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:5});if(back)await page.mouse.move(a.x,a.y,{steps:5});await page.mouse.up();};
    await page.locator('.object-color-2').click();await click(1,1);
    assert.equal((await read()).selected,'red');assert.equal((await read()).matrix.length,1);
    await click(10,20);assert.equal((await read()).matrix.length,2);
    const moving=(await read()).matrix.at(-1).id;
    await drag(10,20,11,20);assert.equal((await read()).matrix.find(o=>o.id===moving).x,11);
    assert.equal((await read()).matrix.length,2);
    await drag(0,0,2,2);assert.equal((await read()).matrix.length,3);
    assert.equal((await read()).matrix.at(-1).points.length,8);
    await page.locator('.object-color-1').click();await drag(0,3,2,0);
    assert.equal((await read()).matrix.at(-1).color,1);
    assert.equal((await read()).matrix.at(-1).points.length,12);
    await page.locator('.sprite-dimension-search').fill('3 3');
    await button('测试精灵').click();
    assert.equal(await page.locator('.object-color-button[aria-pressed="true"]').count(),0);
    const before=await read();await drag(8,15,9,16);await drag(8,15,9,16,true);
    assert.deepEqual((await read()).matrix,before.matrix);assert.equal((await read()).undo,before.undo);
    await click(8,15);assert.equal((await read()).matrix.length,before.matrix.length+1);
    const sprite=(await read()).matrix.at(-1);assert.deepEqual([sprite.x,sprite.y],[9,16]);
    const count=(await read()).matrix.length;await click(8,15);assert.equal((await read()).matrix.length,count);
    await drag(8,15,9,15);assert.equal((await read()).matrix.at(-1).x,10);
    await page.locator('.editor-toolbar').click({position:{x:1,y:1}});await page.keyboard.press('ArrowRight');
    assert.equal((await read()).matrix.at(-1).x,11);
    const unchanged=await read();await page.keyboard.press('q');assert.deepEqual(await read(),unchanged);
    const a=await point(9,15),b=await point(12,15);
    await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:4});
    await canvas.dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();
    assert.deepEqual((await read()).matrix,unchanged.matrix);assert.equal((await read()).undo,unchanged.undo);
  });
  await check('固定20精灵、空/非法/精确过滤、互斥选择与固定方格自适应尺寸',async()=>{
    await page.locator('.sprite-dimension-search').fill('');
    assert.equal(await page.locator('.sprite-preview-card').count(),20);
    const shapes=await page.locator('.sprite-preview-card .editor-sprite-preview').evaluateAll(elements=>elements.map(e=>{
      const b=getComputedStyle(e),c=getComputedStyle(e.firstElementChild),rect=e.firstElementChild.getBoundingClientRect();
      return {width:parseFloat(b.width),height:parseFloat(b.height),cellWidth:parseFloat(c.width),cellHeight:parseFloat(c.height),square:Math.abs(rect.width-rect.height)<0.01};
    }));
    assert.ok(shapes.some(s=>s.width===38&&s.height===25));assert.ok(shapes.some(s=>s.width===25&&s.height===38));
    shapes.forEach(s=>{assert.equal(s.cellWidth,12);assert.equal(s.cellHeight,12);assert.equal(s.square,true);});
    assert.ok(await page.locator('.sprite-preview-grid').evaluate(e=>e.scrollWidth>e.clientWidth));
    await button('安全块').click();assert.equal(await page.locator('.object-color-button[aria-pressed="true"]').count(),0);
    await page.locator('.object-color-0').click();assert.equal(await page.locator('.sprite-preview-card.active').count(),0);
    await page.locator('.sprite-dimension-search').fill('3');assert.equal(await page.locator('.sprite-preview-card').count(),0);
    await page.locator('.sprite-dimension-search').fill('3 2');assert.equal(await page.locator('.sprite-preview-card').count(),18);
    await button('安全块').click();await page.locator('.sprite-dimension-search').fill('3 3');
    assert.equal(await page.locator('.object-color-button[aria-pressed="true"]').count(),1);
    await page.locator('.sprite-dimension-search').fill('');
  });
  await check('三视口正方形矩阵与模式切换稳定，hover 颜色不变',async()=>{
    for(const [width,height] of [[1366,768],[1920,1080],[2560,1440]]){
      await page.setViewportSize({width,height});await page.waitForTimeout(150);
      const canvas=page.locator('.matrix-overlay-canvas'),before=await canvas.boundingBox();
      await page.locator('.object-color-2').click();await page.waitForTimeout(150);
      assert.deepEqual(await canvas.boundingBox(),before);
      for (const selector of ['.color-copy-red','[aria-label="启动游戏"]']) {
        const target=page.locator('.editor-toolbar '+selector);
        const colors=()=>target.evaluate(e=>{const s=getComputedStyle(e);return [s.color,s.backgroundColor,s.borderColor];});
        await page.mouse.move(0,0);await page.waitForTimeout(200);const normal=await colors();await target.hover();await page.waitForTimeout(300);assert.deepEqual(await colors(),normal);
      }
      const cell=await page.evaluate(()=>window.getComponentSetup().matrixCellSizeValue);assert.ok(cell>0);
      assert.ok(before.y+before.height<=height+1,JSON.stringify(before));
      await page.screenshot({path:path.join(output,`editor-${width}.png`)});
      await page.locator('.object-list-toggle').click();await page.waitForTimeout(150);
      assert.deepEqual(await canvas.boundingBox(),before);
      await page.locator('.object-list-toggle').click();
    }
  });
  assert.deepEqual(errors,[]);
} finally {
  await writeFile(path.join(output,'验证记录.json'),JSON.stringify({passed,errors},null,2));
  await browser.close();await server.close();
}
