import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createRankEditorPayload, createRankLevel, normalizeRankEditorDocument, parseRankRange, applyRankGlobalConfig } from "../src/lib/rankGameEditor.js";
import { RANK_BOMB_TYPES } from "../src/lib/rankGameEditor.js";
import { parseRankEditorRange, rankRangeText, setRankRangeDraft } from '../src/lib/rankGameEditor.js';
import { moveLevelAt } from '../src/lib/simpleLevelSequence.js';

test('Rank coordinate ranges enforce displayed bounds and preserve drafts by level through reorder and deletion',()=>{
  const one=createRankLevel(16,36),two=createRankLevel(16,36,1);
  const doc={siteSizeWidth:16,siteSizeHeight:36,levels:[one,two]},drafts=new Map();
  for(const text of ['0,2','1,17','4,2','1.5,2','1,','1e0,2'])assert.equal(parseRankEditorRange('x',text,doc),null);
  assert.deepEqual(parseRankEditorRange('x','1，16',doc),[1,16]);
  assert.deepEqual(parseRankEditorRange('y','2,36',doc),[2,36]);
  assert.equal(parseRankEditorRange('y','2,37',doc),null);
  setRankRangeDraft(one,'x','3,8',doc,drafts);setRankRangeDraft(one,'y','2,',doc,drafts);
  setRankRangeDraft(two,'x','7,12',doc,drafts);
  assert.deepEqual(one.bounds,{minX:3,maxX:8,minY:1,maxY:36});
  const moved=moveLevelAt(doc.levels,1,0,0);doc.levels=moved.levels;
  assert.equal(doc.levels[moved.activeIndex],one);
  assert.equal(rankRangeText(doc.levels[0],'x',drafts),'7,12');
  assert.equal(rankRangeText(doc.levels[1],'y',drafts),'2,');
  doc.levels.splice(0,1);drafts.delete(two);
  assert.equal(rankRangeText(doc.levels[0],'y',drafts),'2,');
  setRankRangeDraft(one,'y','2,36',doc,drafts);
  assert.deepEqual(createRankEditorPayload(doc,7).levels[0].bounds,{minX:2,maxX:7,minY:1,maxY:35});
  assert.equal(one.bounds.minX,3);
  doc.siteSizeWidth=6;assert.equal(parseRankEditorRange('x',rankRangeText(one,'x',drafts),doc),null);
});

test('all bomb sizes keep their subtype, bounds and independent audio in editor payloads',()=>{
  assert.deepEqual(RANK_BOMB_TYPES,[1,2,3]);
  const levels=RANK_BOMB_TYPES.map(type=>({...createRankLevel(),type,bombExplosionAudio:`bomb-${type}.mp3`}));
  const payload=createRankEditorPayload({levels},9);
  assert.deepEqual(payload.levels.map(level=>level.type),[1,2,3]);
  assert.deepEqual(payload.levels.map(level=>level.bombExplosionAudio),['bomb-1.mp3','bomb-2.mp3','bomb-3.mp3']);
  assert.ok(payload.levels.every(level=>level.bounds.maxY===35));
});

test("Rank editor detaches reactive proxies and converts displayed coordinates for IPC", () => {
  const level = new Proxy({ type: 1, bounds: { minX: 1, minY: 1, maxX: 16, maxY: 36 } }, {});
  const document = new Proxy({ id: 7, type: "rank", levels: [level] }, {});

  assert.throws(() => structuredClone(document), { name: "DataCloneError" });

  const payload = createRankEditorPayload(document, 12);
  assert.deepEqual(structuredClone(payload), {
    id: 12,
    type: "rank",
    levels: [{ type: 1, bounds: { minX: 0, minY: 0, maxX: 15, maxY: 35 } }],
  });
});

test("Rank editor keeps non-coordinate level data and clamps coordinates at zero", () => {
  const payload = createRankEditorPayload({
    levels: [{
      bounds: { minX: 0, minY: 2.9, maxX: 20, maxY: "4" },
      durationSeconds: 30,
    }],
  }, null);

  assert.deepEqual(payload.levels[0], {
    bounds: { minX: 0, minY: 1, maxX: 19, maxY: 3 },
    durationSeconds: 30,
  });
  assert.equal(payload.id, null, 'an unsaved draft must not serialize a fake ID of zero');
});

test("Rank editor exposes the shared media picker and previews for all lifecycle media", async () => {
  const sourcePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../src/views/RankGameEditorView.vue",
  );
  const source = await readFile(sourcePath, "utf8");
  const global = await readFile(new URL('../src/components/GameGlobalConfigDialog.vue',import.meta.url),'utf8');

  for (const pattern of [
    /MediaPickerDialog/,
    /commonConfig\.gameStartAudio/,
    /commonConfig\.gameEndSuccessAudio/,
    /commonConfig\.gameEndFailAudio/,
    /commonConfig\.levelPassAudio/,
    /commonConfig\.levelRestartAudio/,
    /audio\.scoreSound/,
    /audio\.injurySound/,
    /gif\.levelFailure/,
    /gif\.levelSettlement/,
    /gif\.gameFailure/,
    /gif\.gameOver/,
    /buildMediaPreviewUrl/,
  ]) {
    assert.match(source+global, pattern);
  }
  assert.match(source,/<GameGlobalConfigDialog[^>]*rank/);
  assert.match(source,/chooseMedia\('startGif','image'/);
  assert.match(source,/key:'gameplayIntro',label:'rank.voiceDescription'/);
  assert.match(source,/key:'backgroundVoice',label:'rank.levelBackgroundMusic'/);
  assert.doesNotMatch(source,/@click="(?:importJson|exportJson)"/);
});

test('Rank levels require explicit subtype and keep ranges, coordinates and media independent',()=>{
  const one=createRankLevel(16,36,0),two=createRankLevel(8,8,1);
  assert.equal(one.label,'Ranking');assert.equal(two.type,null);one.bounds.maxX=2;assert.equal(two.bounds.maxX,8);
  for(const text of ['2,4',' 2，4 '])assert.deepEqual(parseRankRange(text,1),[2,4]);
  for(const text of ['', '4,2','1','1,2,3','-1,2','0,2','1.5,2'])assert.equal(parseRankRange(text,1),null);
  assert.deepEqual(parseRankRange('0,0'),[0,0]);
  const doc=normalizeRankEditorDocument({name:'internal',displayName:'Displayed',levels:[{label:'Type 1',type:1,startGif:'intro.gif',gameplayIntro:'voice.mp3',backgroundVoice:'bg.mp3',bounds:{minX:0,minY:0,maxX:7,maxY:7}}]});
  assert.equal(doc.name,'Displayed');assert.equal(doc.levels[0].label,'Ranking');assert.equal(doc.levels[0].bounds.maxY,8);
  doc.levels.push(two);two.type=1;
  const payload=createRankEditorPayload(doc,7);assert.equal(payload.displayName,'Displayed');assert.equal(payload.levels[1].bounds.maxX,7);
  assert.equal(payload.levels[0].startGif,'intro.gif');assert.equal(payload.levels[0].gameplayIntro,'voice.mp3');assert.equal(doc.levels[1].bounds.maxX,8);
});

test('Rank global patch does not submit or reset level drafts and updates enabled wiring size',()=>{
  const level=createRankLevel();level.rewardPoints=22;level.bombWarningAudio='level-warning.mp3';level.bombExplosionAudio='level-bomb.mp3';
  const doc={levels:[level],siteSizeWidth:16,siteSizeHeight:36,wiringData:{runtimeEnabled:true,lines:[[[0,0]]]},name:'Before'};
  applyRankGlobalConfig(doc,{name:'After',siteSizeWidth:18,siteSizeHeight:40,commonConfig:{rankBombWarningAudio:'warning.mp3'}});
  assert.equal(doc.levels[0],level);assert.equal(level.rewardPoints,22);assert.equal(level.bombWarningAudio,'level-warning.mp3');assert.equal(level.bombExplosionAudio,'level-bomb.mp3');
  assert.equal(doc.displayName,'After');assert.equal(doc.wiringData.width,18);assert.deepEqual(doc.wiringData.lines,[[[0,0]]]);
});

test('Rank bomb media belongs to the subtype and independent level payload, never global controls',async()=>{
  const one=createRankLevel(),two=createRankLevel();one.type=two.type=1;
  Object.assign(one,{bombWarningAudio:'one-warning.mp3',bombExplosionAudio:'one-bomb.mp3'});
  Object.assign(two,{bombWarningAudio:'two-warning.mp3',bombExplosionAudio:''});
  const doc=normalizeRankEditorDocument({levels:[one,two]});
  const payload=createRankEditorPayload(doc,7);
  assert.deepEqual(payload.levels.map(({bombWarningAudio,bombExplosionAudio})=>[bombWarningAudio,bombExplosionAudio]),[['one-warning.mp3','one-bomb.mp3'],['two-warning.mp3','']]);
  assert.equal(createRankLevel().bombWarningAudio,'');assert.equal(createRankLevel().bombExplosionAudio,'');
  const global=await readFile(new URL('../src/components/GameGlobalConfigDialog.vue',import.meta.url),'utf8');
  assert.doesNotMatch(global,/rankBombWarningAudio|rankBombExplosionAudio/);
});
