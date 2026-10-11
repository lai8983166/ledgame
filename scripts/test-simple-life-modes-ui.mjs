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
const output = path.join(root, '.build/simple-life-modes-ui');
await mkdir(output, {recursive:true});
const server = await createServer({root,server:{host:'127.0.0.1',port:0}});
await server.listen();
const browser = await chromium.launch({executablePath:path.join(cache,chrome,'chrome-win64/chrome.exe')});
const page = await browser.newPage({viewport:{width:1366,height:768}});
const errors = [], passed = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  window.appLanguage = {get:async()=>'zh-CN',set:async v=>v,onChanged:()=>()=>{}};
  window.fixture = {game:{id:1,name:'simple',type:'default',mode:'[1]',globalLifeLimit:false,
    siteSizeWidth:16,siteSizeHeight:36,commonConfig:{},gif:{},
    levels:[{label:'第一关',option:{lifeLimitMode:'LIMITED',lifeLimitValue:10},frameList:[{repeatTimes:2,matrix:[]}]}]}};
  window.ledGame = {getGameEditor:async()=>({data:structuredClone(window.fixture.game)}),listGameCategories:async()=>({data:[]}),
    saveGameEditor:async(_id,doc)=>{window.fixture.game=structuredClone(doc);return{data:{saved:true}};},
    validateGameEditor:async()=>({data:{valid:true,errors:[]}})};
  window.spiritLibrary = {list:async()=>({data:[]})};
});
try {
  await page.goto(server.resolvedUrls.local[0]+'tests/ui/catalog-library-harness.html');
  await page.waitForFunction(()=>typeof window.mountComponent==='function');
  const mount = async()=>{
    await page.evaluate(()=>window.mountComponent('SimpleGameEditorView',{gameId:1}));
    await page.getByRole('button',{name:'全局配置',exact:true}).waitFor();
  };
  for (const name of ['simple','normal','diffcult']) {
    await page.evaluate(name=>{window.fixture.game.name=name;window.fixture.game.globalLifeLimit=false;},name);
    await mount();
    await page.getByRole('button',{name:'全局配置',exact:true}).click();
    const dialog = page.getByRole('dialog',{name:'全局配置',exact:true});
    const mode = dialog.locator('select').filter({has:page.locator('option[value="true"]')});
    await mode.selectOption('true');
    const total = dialog.locator('label.global-config-field').filter({has:page.locator('.global-config-label',{hasText:'整局生命值'})}).locator('input');
    for (const value of ['0','-1','1.5']) {
      await total.fill(value);
      assert.equal(await dialog.getByRole('button',{name:'保存',exact:true}).isDisabled(),true);
      await dialog.getByText('整局生命值必须为正整数',{exact:true}).waitFor();
    }
    await total.fill('20');
    await dialog.getByRole('button',{name:'保存',exact:true}).click();
    await dialog.waitFor({state:'hidden'});
    assert.equal(await page.locator('select').filter({has:page.locator('option[value="LIMITED"]')}).count(),0);
    await mount();
    await page.getByRole('button',{name:'全局配置',exact:true}).click();
    assert.equal(await mode.inputValue(),'true');
    assert.equal(await total.inputValue(),'20');
    await mode.selectOption('false');
    await dialog.getByRole('button',{name:'保存',exact:true}).click();
    await dialog.waitFor({state:'hidden'});
    await page.locator('select').filter({has:page.locator('option[value="LIMITED"]')}).waitFor();
    assert.equal(await page.evaluate(()=>window.fixture.game.levels[0].option.lifeLimitValue),10);
    await page.screenshot({path:path.join(output,name+'.png')});
    passed.push(name+' 模式保存重开、非法数值拦截、切回保留关卡生命');
  }
  assert.deepEqual(errors,[]);
  await writeFile(path.join(output,'验收结果.json'),JSON.stringify({passed,errors},null,2));
  console.log(passed.join('\n'));
} finally {
  await browser.close();
  await server.close();
}
