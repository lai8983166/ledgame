import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeLevelOption,
  validateLevelOption,
} from "../src/lib/simpleLevelOptions.js";

test('level cycle and seconds limits accept endpoints and reject values outside their own range', () => {
  for (const [mode, max] of [['CYCLE_COUNT', 10], ['CYCLE_SECONDS', 5000]]) {
    for (const value of [1, max]) assert.deepEqual(validateLevelOption({timeLimitMode:mode,timeLimitValue:value}), []);
    for (const value of [0, -1, 1.5, max + 1, '', null]) {
      const errors = validateLevelOption({timeLimitMode:mode,timeLimitValue:value});
      assert.equal(errors[0].field, 'timeLimitValue');
      assert.equal(errors[0].params.max, max);
    }
  }
  assert.deepEqual(validateLevelOption({timeLimit:true,timeLimitValue:5000}), []);
  assert.equal(validateLevelOption({timeLimit:true,timeLimitValue:5001})[0].field, 'timeLimitValue');
  assert.deepEqual(validateLevelOption({timeLimitMode:'UNLIMITED',timeLimitValue:99999}), []);
});

test('legacy level instructions and media survive normalization and JSON round trip without becoming required', () => {
  const source={playIntroVideo:'videos/tutorial.mp4',voiceDesc:'audio/instructions.mp3',desc:'Level instructions',bgVoice:'audio/background.mp3'};
  const normalized=normalizeLevelOption(JSON.parse(JSON.stringify(source)));
  for(const key of Object.keys(source))assert.equal(normalized[key],source[key]);
  assert.deepEqual(validateLevelOption(normalized),[]);
  assert.deepEqual(validateLevelOption(normalizeLevelOption()),[]);
});

test("normalizes legacy level limits into canonical modes", () => {
  assert.deepEqual(
    normalizeLevelOption({ timeLimit: true, timeLimitValue: "8", lifeLimit: true, lifeLimitValue: "3" }),
    {
      timeLimit: true,
      timeLimitValue: 8,
      timeLimitMode: "CYCLE_SECONDS",
      lifeLimit: true,
      lifeLimitValue: 3,
      lifeLimitMode: "LIMITED",
      rewardPoints: 0,
    },
  );
});

test('challenge ignores dormant level life validation without ignoring other limits', () => {
  const option = {lifeLimitMode:'LIMITED',lifeLimitValue:0,timeLimitMode:'CYCLE_COUNT',timeLimitValue:0};
  assert.deepEqual(validateLevelOption(option,true).map(error=>error.field),['timeLimitValue']);
  assert.deepEqual(validateLevelOption(option,false).map(error=>error.field),['timeLimitValue','lifeLimitValue']);
});

test("unlimited modes clear stale values and bounded modes require positive integers", () => {
  assert.equal(normalizeLevelOption({
    timeLimitMode: "UNLIMITED",
    timeLimitValue: 9,
    lifeLimitMode: "UNLIMITED",
    lifeLimitValue: 4,
  }).timeLimitValue, 0);
  assert.equal(validateLevelOption({
    timeLimitMode: "CYCLE_COUNT",
    timeLimitValue: 0,
    lifeLimitMode: "LIMITED",
    lifeLimitValue: -1,
  }).length, 2);
  assert.equal(normalizeLevelOption({ rewardPoints: "25" }).rewardPoints, 25);
  assert.equal(validateLevelOption({ rewardPoints: -1 }).some((error) => error.field === "rewardPoints"), true);
  assert.equal(validateLevelOption({ rewardPoints: 1.5 }).some((error) => error.field === "rewardPoints"), true);
  assert.equal(validateLevelOption({ rewardPoints: 1_000_001 }).some((error) => error.field === "rewardPoints"), true);
  assert.equal(validateLevelOption({ rewardPoints: 1_000_000 }).length, 0);
});
