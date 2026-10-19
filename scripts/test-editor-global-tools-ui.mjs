import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=createRequire(path.join(root,'../ledGame-platform/package.json'))('playwright');
const cache=path.join(process.env.LOCALAPPDATA,'ms-playwright'),chrome=(await readdir(cache)).filter(name=>/^chromium-\d+$/.test(name)).sort().at(-1);
const output=path.join(root,'.build/editor-global-tools');await mkdir(output,{recursive:true});
const server=await createServer({root,server:{host:'127.0.0.1',port:0}});await server.listen();
const browser=await chromium.launch({executablePath:path.join(cache,chrome,'chrome-win64/chrome.exe')});
const page=await browser.newPage({viewport:{width:1366,height:900}});page.setDefaultTimeout(10000);
const passed=[],errors=[];page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{
  window.fixture={calls:0,fail:false,doc:{id:7,name:'游戏',description:'原描述',remark:'原备注',type:'default',mode:'[1]',cover:'cover.png',firstCatalog:'1',siteSizeWidth:16,siteSizeHeight:36,
    audio:{scoreSound:'score.mp3',injurySound:'injury.mp3',purpleSound:'double.mp3'},gif:{standby:'idle.gif',gameFailure:'fail.gif',gameOver:'over.gif'},
    commonConfig:{gameStartAudio:'start.mp3',gameEndSuccessAudio:'success.mp3',gameEndFailAudio:'fail.mp3',levelPassAudio:'pass.mp3',levelRestartAudio:'restart.mp3'},
    levels:[{label:'关卡',option:{rewardPoints:0,timeLimitMode:'UNLIMITED',lifeLimitMode:'UNLIMITED'},frameList:[{repeatTimes:1,matrix:[]}]}]}};
  const get=async()=>({data:structuredClone(window.fixture.doc)});
  const save=async(id,doc)=>{window.fixture.calls++;if(window.fixture.fail)throw Error('模拟保存失败');window.fixture.doc=structuredClone(doc);return{data:{saved:true,gameId:id}};};
  window.ledGame={getGameEditor:get,getRankGameEditor:get,saveGameEditor:save,saveRankGameEditor:save,validateRankGameEditor:async()=>({data:{valid:true}}),listGameCategories:async()=>({data:[{id:1,name:'分类'}]})};
  window.spiritLibrary={list:async()=>({data:[]})};
  window.mediaLibrary={list:async()=>({items:[{kind:'file',name:'intro.gif',relativePath:'intro.gif',mediaType:'image'},{kind:'file',name:'voice.mp3',relativePath:'voice.mp3',mediaType:'audio'}]}),getPreviewUrl:async()=>({url:'',mediaType:'image'})};
});
const mount=async name=>{await page.evaluate(name=>window.mountComponent(name,{gameId:7}),name);await page.waitForFunction(()=>Boolean(window.getComponentSetup()?.document));};
const button=name=>page.getByRole('button',{name,exact:true});
const close=async()=>{await page.locator('.editor-save-dialog button').click();await page.locator('.editor-save-dialog').waitFor({state:'hidden'});};
const field=label=>page.locator('.global-config-field').filter({has:page.locator('.global-config-label').filter({hasText:new RegExp('^'+label+'$')})}).locator('input');
async function check(name,fn){await fn();passed.push(name);console.log('通过：'+name);}
async function assertHeadingIcons(){
  const icons=await page.locator('.editor-heading-actions .object-icon-button').evaluateAll(buttons=>buttons.map(button=>{
    const b=button.getBoundingClientRect(),i=button.querySelector('svg').getBoundingClientRect();
    return{name:button.getAttribute('aria-label'),ratio:i.width/b.width,square:Math.abs(b.width-b.height),dx:Math.abs(i.x+i.width/2-b.x-b.width/2),dy:Math.abs(i.y+i.height/2-b.y-b.height/2)};
  }));
  assert.equal(icons.length,3);
  for(const icon of icons){assert.ok(icon.ratio>=0.7,`图标占比不足：${JSON.stringify(icon)}`);assert.ok(icon.square<0.5,`按钮应为正方形：${JSON.stringify(icon)}`);assert.ok(icon.dx<0.5&&icon.dy<0.5,`图标未居中：${JSON.stringify(icon)}`);}
}
try {
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/ui/catalog-library-harness.html`);await page.waitForFunction(()=>window.mountComponent);await mount('SimpleGameEditorView');
  await check('Simple首行保存/配置/布线在关卡增删列表之前且无重复入口',async()=>{
    await page.waitForFunction(()=>window.getComponentSetup().editorFitReady);
    const row=page.locator('.editor-heading-row');
    const controls=[];for(const name of ['保存','全局配置','地砖布线','添加关卡']){const control=row.getByRole('button',{name,exact:true});assert.equal(await button(name).count(),1);controls.push(await control.boundingBox());}
    for(let i=1;i<controls.length;i++){assert.ok(controls[i].x>=controls[i-1].x+controls[i-1].width);assert.ok(Math.abs(controls[i].y+controls[i].height/2-controls[0].y-controls[0].height/2)<2);}
    assert.equal(await page.locator('.editor-center .level-sequence-row').count(),0);await assertHeadingIcons();await page.screenshot({path:path.join(output,'Simple首行.png')});
  });
  await check('游戏级字段仅全局可编辑，保存/取消与关卡草稿隔离',async()=>{
    assert.equal(await page.locator('.editor-left input[type=text]').count(),0);
    await page.evaluate(()=>window.getComponentSetup().activeFrame.matrix.push({id:'draft',x:0,y:0,color:0,points:[[0,0]]}));
    await button('全局配置').click();for(const [label,value] of [['名称','新名称'],['描述','新描述'],['备注','新备注'],['宽度','18'],['高度','40']])await field(label).fill(value);
    await page.locator('.global-config-actions .primary').click();await page.locator('.editor-save-dialog').waitFor();await close();
    const doc=await page.evaluate(()=>window.fixture.doc);assert.equal(doc.name,'新名称');assert.equal(doc.description,'新描述');assert.equal(doc.remark,'新备注');assert.equal(doc.siteSizeWidth,18);assert.equal(doc.siteSizeHeight,40);assert.equal(doc.levels[0].frameList[0].matrix.length,0);
    assert.equal(await page.evaluate(()=>window.getComponentSetup().activeFrame.matrix.length),1);
    await button('全局配置').click();await field('名称').fill('取消');await page.locator('.global-config-dialog').getByRole('button',{name:'取消',exact:true}).click();assert.equal(await page.evaluate(()=>window.fixture.doc.name),'新名称');
  });
  await check('布线隐藏尺寸、成功弹窗、失败保留草稿可重试且不提交RGB',async()=>{
    await button('地砖布线').click();await page.locator('.elc408-wiring-panel').waitFor();
    for(const label of ['画面宽度','画面高度'])assert.equal(await page.locator('.game-wiring-dialog').getByText(label,{exact:true}).count(),0);
    assert.equal(await page.locator('.game-wiring-dialog .elc408-wiring-controls fieldset').first().locator('input[type=number]').count(),1);
    await page.evaluate(()=>window.fixture.fail=true);await button('保存此游戏布线').click();await page.locator('.editor-save-dialog').getByText('模拟保存失败').waitFor();await close();assert.equal(await page.locator('.game-wiring-dialog').count(),1);
    await page.evaluate(()=>window.fixture.fail=false);await button('保存此游戏布线').click();await page.locator('.editor-save-dialog h2').getByText('保存成功').waitFor();await close();
    const doc=await page.evaluate(()=>window.fixture.doc);assert.equal(doc.wiringData.width,18);assert.equal(doc.wiringData.height,40);assert.equal(doc.levels[0].frameList[0].matrix.length,0);
  });
  await check('布线本地校验失败也弹窗，不发保存请求',async()=>{
    await button('地砖布线').click();await page.locator('.elc408-wiring-panel').waitFor();const before=await page.evaluate(()=>window.fixture.calls);
    await page.locator('.elc408-wiring-panel').evaluate(node=>node.__vueParentComponent.setupState.document.lines=[[[0,0],[0,0]]]);
    await button('保存此游戏布线').click();await page.locator('.editor-save-dialog').getByText(/布线无效/).waitFor();assert.equal(await page.evaluate(()=>window.fixture.calls),before);await close();await page.locator('.game-wiring-dialog header button').click();
  });
  await check('复制常见图标、复制全帧隐藏和关卡JSON入口归工具栏',async()=>{
    const copy=page.locator('.frame-icon-actions').getByRole('button',{name:'复制当前帧到后一帧',exact:true});assert.equal(await copy.locator('svg rect').count(),1);assert.equal((await copy.innerText()).trim(),'');
    assert.equal(await button('复制当前帧到所有帧').count(),0);
    for(const name of ['导出当前关卡','导入替换当前关卡']){assert.equal(await page.locator('.editor-toolbar').getByRole('button',{name,exact:true}).count(),1);assert.equal(await page.locator('.frame-icon-actions').getByRole('button',{name,exact:true}).count(),0);}
  });
  await check('全部帧号单行、进度条首尾及中间刻度对齐，点击拖动对应同一帧',async()=>{
    for(const [width,height] of [[1024,600],[1920,1080]]){
      for(const count of [1,2,10,100,200]){
      await page.evaluate(count=>{window.fixture.doc.levels[0].frameList=Array.from({length:count},()=>({repeatTimes:1,matrix:[]}));},count);
      await page.setViewportSize({width,height});await mount('SimpleGameEditorView');await page.waitForFunction(()=>window.getComponentSetup().editorFitReady);
      await assertHeadingIcons();
      const ticks=page.locator('.frame-tick');assert.equal(await ticks.count(),count);assert.equal((await ticks.last().innerText()).trim(),String(count));
      const metrics=await page.locator('.frame-tick-row').evaluate(row=>{
        const track=row.previousElementSibling.getBoundingClientRect();
        const shell=row.parentElement,bounds=shell.getBoundingClientRect();
        return{overflow:shell.scrollWidth>shell.clientWidth+1||shell.scrollHeight>shell.clientHeight+1,bounds:{x:bounds.x,right:bounds.right},track:{x:track.x,right:track.right,width:track.width},ticks:[...row.querySelectorAll('button')].map(node=>{
          const label=node.querySelector('.frame-tick-label').getBoundingClientRect(),dot=node.querySelector('.frame-tick-dot').getBoundingClientRect();
          return{x:label.x,y:label.y,right:label.right,tickX:dot.x+dot.width/2};
        })};
      });
      assert.equal(metrics.overflow,false,JSON.stringify({count,width,metrics}));
      for(let i=0;i<count;i++){
        const tick=metrics.ticks[i],expected=metrics.track.x+metrics.track.width*i/Math.max(1,count-1);
        assert.ok(Math.abs(tick.tickX-expected)<1,`帧${i+1}刻度偏离进度条: ${tick.tickX} != ${expected}`);
        assert.ok(Math.abs(tick.y-metrics.ticks[0].y)<1,'帧号不换行');
        assert.ok(tick.x>=metrics.bounds.x&&tick.right<=metrics.bounds.right,'首尾文字不裁切');
        if(i)assert.ok(metrics.ticks[i-1].right<=tick.x+0.5,JSON.stringify({message:'相邻帧号不重叠',count,width,index:i,previous:metrics.ticks[i-1],tick}));
      }
      for(const index of [...new Set([0,Math.floor(count/2),count-1])]){
        await ticks.nth(index).click();assert.equal(await page.evaluate(()=>window.getComponentSetup().activeFrameIndex),index);
        const style=await ticks.nth(index).evaluate(node=>{const s=getComputedStyle(node);return{shadow:s.boxShadow,background:s.backgroundColor,border:s.borderTopWidth,outline:s.outlineStyle};});
        assert.deepEqual(style,{shadow:'none',background:'rgba(0, 0, 0, 0)',border:'0px',outline:'none'},'选中或聚焦帧号不显示框');
        const marker=await page.locator('.frame-progress-marker').boundingBox();
        assert.ok(Math.abs(marker.x+marker.width/2-(metrics.track.x+metrics.track.width*index/Math.max(1,count-1)))<1,'选择帧与进度游标一致');
      }
      const track=await page.locator('.frame-progress-track').boundingBox();
      await page.mouse.move(track.x+0.1,track.y+track.height/2);await page.mouse.down();
      await page.mouse.move(track.x+track.width-0.1,track.y+track.height/2);await page.mouse.up();
      assert.equal(await page.evaluate(()=>window.getComponentSetup().activeFrameIndex),count-1);
      if(count>=100)await page.screenshot({path:path.join(output,`单行帧号-${count}-${width}.png`)});
      }
    }
  });
  await check('特效前后插入选项、旧合并配置迁移显示及自动预览无需重绘',async()=>{
    await page.evaluate(()=>window.mountComponent('GameEffectDialog',{effect:{mode:'merge',color:0,startX:1,startY:1,endX:2,endY:2,width:1,height:1,step:1},gridWidth:4,gridHeight:4,spirits:[]}));
    assert.equal(await page.locator('option[value=merge]').count(),0);assert.equal(await page.locator('select').first().inputValue(),'after');assert.equal(await button('重新绘制').count(),0);
    const before=await page.evaluate(()=>window.getComponentSetup().previewFrames.length);
    await page.locator('.game-effect-fields label').count();
    await page.evaluate(()=>window.getComponentSetup().draft.endX=3);await page.waitForFunction(before=>window.getComponentSetup().previewFrames.length!==before,before);
    await page.locator('.game-effect-actions .primary').click();assert.equal(await page.evaluate(()=>window.componentEvents.at(-1)[1].config.mode),'after');
  });
  await check('Rank布线保存成功/失败弹窗与重试',async()=>{
    await page.evaluate(()=>{window.fixture.doc.type='rank';window.fixture.doc.levels=[{type:1,durationSeconds:60,bounds:{minX:0,maxX:17,minY:0,maxY:39}}];});await mount('RankGameEditorView');await button('地砖布线').click();
    await page.evaluate(()=>window.fixture.fail=true);await button('保存此游戏布线').click();await page.locator('.editor-save-dialog').getByText('模拟保存失败').waitFor();await close();
    await page.evaluate(()=>window.fixture.fail=false);await button('保存此游戏布线').click();await page.locator('.editor-save-dialog h2').getByText('保存成功').waitFor();await close();
  });
  await check('Rank全局配置复用、名称合并和局部保存不提交关卡草稿',async()=>{
    await page.evaluate(()=>{Object.assign(window.fixture.doc,{name:'internal',displayName:'展示名称',type:'rank',minPlayers:1,maxPlayers:2,palette:['#00D9FF','#FF3CAC']});window.fixture.doc.levels=[{label:'Type 1',type:1,rewardPoints:0,durationSeconds:60,bounds:{minX:0,minY:0,maxX:17,maxY:39},targetsPerPlayerMin:3,targetsPerPlayerMax:4,bombMin:0,bombMax:1,bombWarningDelaySeconds:3,bombWarningDurationSeconds:1,refreshSeconds:6,earlyRefresh:true,startGif:'old.gif',gameplayIntro:'old-voice.mp3',backgroundVoice:'old-bg.mp3'}];});
    await mount('RankGameEditorView');assert.equal(await page.locator('.sequence-pill.active').innerText(),'Ranking');
    await assertHeadingIcons();
    assert.deepEqual((await page.locator('.rank-config-editor>label>span').allTextContents()).slice(0,12),['关卡名','玩法介绍','本关获胜积分','时间限制（秒）','游戏说明','语音说明','关卡背景音乐','最小 X','最大 X','最小 Y','最大 Y','类型']);
    assert.equal(await page.locator('.rank-actions button').count(),3);for(const name of ['导入 JSON','导出 JSON','内部名称','显示名称'])assert.equal(await page.getByText(name,{exact:true}).count(),0);
    await page.locator('[data-rank-field="level.rewardPoints"]').fill('55');
    await button('全局配置').click();assert.equal(await field('名称').inputValue(),'展示名称');await field('名称').fill('统一名称');
    assert.equal(await page.locator('.global-config-dialog').getByText('游戏模式',{exact:true}).count(),0);
    await page.locator('.global-config-actions .primary').click();await page.locator('.editor-save-dialog').waitFor();await close();
    const persisted=await page.evaluate(()=>window.fixture.doc);assert.equal(persisted.name,'统一名称');assert.equal(persisted.displayName,'统一名称');assert.equal(persisted.levels[0].rewardPoints,0);
    assert.equal(await page.locator('[data-rank-field="level.rewardPoints"]').inputValue(),'55');
  });
  await check('Rank新增类型必选、min,max校验、图片和音频独立绑定与多关卡保存回读',async()=>{
    await button('添加关卡').click();assert.equal(await page.evaluate(()=>window.getComponentSetup().type1Config.type),null);
    assert.equal(await page.getByText('每玩家目标',{exact:true}).count(),0);
    await button('保存').click();await page.locator('.editor-save-dialog').getByText(/请选择类型/).waitFor();await close();
    assert.deepEqual(await page.locator('[data-rank-field="level.type"] option').allTextContents(),['请选择类型','炸弹3x3','炸弹5x5','炸弹7x7']);
    await page.locator('[data-rank-field="level.type"]').selectOption('2');await page.locator('[data-rank-field="level.label"]').fill('第二关');
    await page.locator('[data-rank-field="level.targets"]').fill('4,2');await button('保存').click();await page.locator('.editor-save-dialog').getByText(/min,max/).waitFor();await close();
    await page.locator('[data-rank-field="level.targets"]').fill('2,4');await page.locator('[data-rank-field="level.bombs"]').fill('0,1');
    const media=page.locator('.rank-level-media');await media.nth(0).getByRole('button',{name:'选择',exact:true}).click();
    await page.locator('.media-picker-row[data-path="intro.gif"]').click();await page.locator('.media-picker-actions .primary').click();
    await media.nth(1).getByRole('button',{name:'选择',exact:true}).click();await page.locator('.media-picker-row[data-path="voice.mp3"]').click();await page.locator('.media-picker-actions .primary').click();
    await button('保存').click();await page.locator('.editor-save-dialog').getByText('Rank 游戏已保存',{exact:true}).waitFor();await close();
    const persisted=await page.evaluate(()=>window.fixture.doc);assert.equal(persisted.levels.length,2);assert.equal(persisted.levels[0].rewardPoints,55);assert.equal(persisted.levels[0].startGif,'old.gif');
    assert.equal(persisted.levels[1].startGif,'intro.gif');assert.equal(persisted.levels[1].gameplayIntro,'voice.mp3');assert.equal(persisted.levels[1].targetsPerPlayerMax,4);assert.equal(persisted.levels[1].bounds.maxY,39);
    await mount('RankGameEditorView');assert.equal(await page.locator('.sequence-pill').count(),2);await page.locator('.sequence-pill').nth(1).click();assert.equal(await page.locator('[data-rank-field="level.label"]').inputValue(),'第二关');
    assert.equal(await page.locator('[data-rank-field="level.type"]').inputValue(),'2');
    await page.locator('[data-rank-field="level.type"]').selectOption('3');await button('保存').click();await page.locator('.editor-save-dialog').getByText('Rank 游戏已保存',{exact:true}).waitFor();await close();
    assert.equal(await page.evaluate(()=>window.fixture.doc.levels[1].type),3);
    await page.screenshot({path:path.join(output,'Rank多关卡.png')});
  });
  await check('Rank拖动保留选中关卡和媒体，删除取消不修改、确认只删除目标关卡',async()=>{
    const pills=page.locator('.sequence-pill');await pills.nth(0).dragTo(pills.nth(1));
    assert.deepEqual(await pills.allTextContents(),['第二关','Ranking']);assert.equal(await page.locator('.sequence-pill.active').innerText(),'第二关');
    assert.equal(await page.locator('.rank-intro-preview').getAttribute('src'),'led-media://preview/intro.gif');
    page.once('dialog',dialog=>dialog.dismiss());await button('删除当前关卡').click();assert.equal(await pills.count(),2);
    page.once('dialog',dialog=>dialog.accept());await button('删除当前关卡').click();assert.equal(await pills.count(),1);
    assert.equal(await pills.first().innerText(),'Ranking');assert.equal(await button('删除当前关卡').isDisabled(),true);
  });
  await check('Rank类型专属音效选择试听、取消与切关独立，全局保存不覆盖且主保存可回读',async()=>{
    await page.evaluate(()=>{
      const one=window.fixture.doc.levels[0];
      Object.assign(one,{label:'第一关',type:1,bombWarningAudio:'危险来袭.mp3',bombExplosionAudio:'Ranking/bomb.mp3'});
      window.fixture.doc.levels=[one,{...structuredClone(one),label:'第二关',bombWarningAudio:'second-warning.mp3',bombExplosionAudio:'second-bomb.mp3'}];
      Object.assign(window.fixture.doc.commonConfig,{rankBombWarningAudio:'obsolete-global.mp3',rankBombExplosionAudio:'obsolete-bomb.mp3'});
    });
    await mount('RankGameEditorView');
    const warning=page.locator('[data-rank-field="level.bombWarningAudio"]'),explosion=page.locator('[data-rank-field="level.bombExplosionAudio"]');
    assert.equal(await warning.locator('input').inputValue(),'危险来袭.mp3');assert.equal(await explosion.locator('audio').getAttribute('src'),'led-media://preview/Ranking/bomb.mp3');
    await warning.getByRole('button',{name:'选择',exact:true}).click();await page.locator('.media-picker-dialog').getByRole('button',{name:'取消',exact:true}).click();assert.equal(await warning.locator('input').inputValue(),'危险来袭.mp3');
    await warning.getByRole('button',{name:'选择',exact:true}).click();await page.locator('.media-picker-row[data-path="voice.mp3"]').click();await page.locator('.media-picker-actions .primary').click();
    assert.equal(await warning.locator('audio').getAttribute('src'),'led-media://preview/voice.mp3');
    await page.locator('.sequence-pill').nth(1).click();assert.equal(await warning.locator('input').inputValue(),'second-warning.mp3');
    await explosion.getByRole('button',{name:'清除',exact:true}).click();
    await button('全局配置').click();for(const name of ['炸弹预警音效','炸弹爆炸音效'])assert.equal(await page.locator('.global-config-dialog').getByText(name,{exact:true}).count(),0);
    await field('名称').fill('音效独立');await page.locator('.global-config-actions .primary').click();await page.locator('.editor-save-dialog').waitFor();await close();
    assert.deepEqual(await page.evaluate(()=>window.fixture.doc.levels.map(level=>level.bombWarningAudio)),['危险来袭.mp3','second-warning.mp3'],'局部保存不提交音效草稿');
    assert.equal(await explosion.locator('input').inputValue(),'');
    await button('保存').click();await page.locator('.editor-save-dialog').getByText('Rank 游戏已保存',{exact:true}).waitFor();await close();
    await mount('RankGameEditorView');assert.equal(await warning.locator('input').inputValue(),'voice.mp3');assert.equal(await explosion.locator('input').inputValue(),'Ranking/bomb.mp3');
    await page.locator('.sequence-pill').nth(1).click();assert.equal(await warning.locator('input').inputValue(),'second-warning.mp3');assert.equal(await explosion.locator('input').inputValue(),'');
    await button('添加关卡').click();assert.equal(await warning.count(),0);assert.equal(await explosion.count(),0);
    await page.locator('[data-rank-field="level.type"]').selectOption('1');assert.equal(await warning.locator('input').inputValue(),'');assert.equal(await explosion.locator('input').inputValue(),'');
    await warning.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'Rank关卡炸弹音效.png')});
  });
  assert.deepEqual(errors,[]);
} catch(error){await page.screenshot({path:path.join(output,'失败.png')});throw error;}
finally{await writeFile(path.join(output,'验收结果.json'),JSON.stringify({passed,errors},null,2));await browser.close();await server.close();}
