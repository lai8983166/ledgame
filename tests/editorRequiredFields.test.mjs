import test from 'node:test';
import assert from 'node:assert/strict';
import { requiredGlobalConfigFields, requiredEditorFields } from '../src/lib/editorRequiredFields.js';

export const completeSimple = () => ({
  name:'Simple', type:'default', mode:'[1]', cover:'cover.png', firstCatalog:'娱乐挑战', siteSizeWidth:16, siteSizeHeight:36,
  audio:{scoreSound:'score.mp3', injurySound:'injury.mp3', purpleSound:'double.mp3'},
  commonConfig:{gameStartAudio:'start.mp3',gameEndSuccessAudio:'success.mp3',gameEndFailAudio:'fail.mp3',levelPassAudio:'pass.mp3',levelRestartAudio:'restart.mp3'},
  gif:{standby:'idle.gif',gameFailure:'fail.gif',gameOver:'over.gif'}, globalTimeLimit:false, globalLifeLimit:false,
  levels:[{label:'A',option:{rewardPoints:0,timeLimitMode:'UNLIMITED',lifeLimitMode:'UNLIMITED'},frameList:[]}],
});

test('required fields accept zero rewards and unlimited modes without numeric values', () => {
  assert.deepEqual(requiredEditorFields(completeSimple()), []);
});
test('required fields list missing media and raw blank numbers before normalization', () => {
  const doc = completeSimple(); doc.cover='  '; doc.audio.scoreSound=''; doc.levels[0].option.rewardPoints='';
  assert.deepEqual(requiredEditorFields(doc).map(error => error.path), ['cover','audio.scoreSound','levels[0].option.rewardPoints']);
});
test('time and life values are required only while their settings are active', () => {
  const doc = completeSimple(); doc.globalTimeLimit=true; doc.globalLifeLimit=true;
  assert.deepEqual(requiredGlobalConfigFields(doc).map(error => error.path), ['globalTimeLimitValue','globalLifeLimitValue']);
  doc.globalTimeLimit=false; doc.globalLifeLimit=false; doc.levels[0].option.timeLimitMode='CYCLE_COUNT'; doc.levels[0].option.lifeLimitMode='LIMITED';
  assert.deepEqual(requiredEditorFields(doc).map(error => error.path), ['levels[0].option.timeLimitValue','levels[0].option.lifeLimitValue']);
  assert.equal(requiredEditorFields(doc)[0].label, 'simple.levelCycleCountValue');
  doc.levels[0].option.timeLimitMode='CYCLE_SECONDS';
  assert.equal(requiredEditorFields(doc)[0].label, 'simple.levelTimeSecondsValue');
});
test('Rank does not inherit Simple required media, but cannot save blank name or dimensions', () => {
  assert.deepEqual(requiredEditorFields({name:'Rank',siteSizeWidth:8,siteSizeHeight:8},true), []);
  assert.equal(requiredEditorFields({name:' ',siteSizeWidth:'',siteSizeHeight:8},true).length,2);
});
