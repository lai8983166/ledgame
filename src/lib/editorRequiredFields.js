const blank = value => value == null || (typeof value === 'string' && !value.trim());
const read = (document, path) => path.split('.').reduce((value, key) => value?.[key], document);

// Check the raw draft before payload normalization turns an empty numeric input into 0.
export function requiredGlobalConfigFields(document) {
  const fields = [
    ['name', 'globalConfig.name'], ['cover', 'globalConfig.cover'], ['firstCatalog', 'globalConfig.firstCatalog'],
    ['audio.scoreSound', 'globalConfig.scoreSound'], ['audio.injurySound', 'globalConfig.injurySound'],
    ['audio.purpleSound', 'globalConfig.doubleSound'], ['commonConfig.gameStartAudio', 'globalConfig.gameStartVoice'],
    ['commonConfig.gameEndSuccessAudio', 'globalConfig.gameSuccessVoice'], ['commonConfig.gameEndFailAudio', 'globalConfig.gameFailureVoice'],
    ['commonConfig.levelPassAudio', 'globalConfig.levelPassVoice'], ['commonConfig.levelRestartAudio', 'globalConfig.levelRestartVoice'],
    ['gif.standby', 'globalConfig.idleAnimation'], ['gif.gameFailure', 'globalConfig.gameFailureAnimation'],
    ['gif.gameOver', 'globalConfig.gameCompleteAnimation'],
  ];
  if (document.globalTimeLimit) fields.push(['globalTimeLimitValue', 'globalConfig.timeLimitSeconds']);
  if (document.globalLifeLimit) fields.push(['globalLifeLimitValue', 'globalConfig.totalLife']);
  return fields.filter(([path]) => blank(read(document, path))).map(([path, label]) => ({ path, label }));
}

export function requiredEditorFields(document, rank = false) {
  const errors = rank
    ? (blank(document.name) ? [{ path: 'name', label: 'globalConfig.name' }] : [])
    : requiredGlobalConfigFields(document);
  for (const path of ['siteSizeWidth', 'siteSizeHeight']) {
    if (blank(document[path])) errors.push({ path, label: path === 'siteSizeWidth' ? 'simple.width' : 'simple.height' });
  }
  if (rank) {
    if (document.globalTimeLimit && blank(document.globalTimeLimitValue)) errors.push({ path: 'globalTimeLimitValue', label: 'globalConfig.timeLimitSeconds' });
    return errors;
  }
  for (const [index, level] of (document.levels || []).entries()) {
    const fields = [['rewardPoints', 'management.simpleReward'], ['timeLimitMode', 'simple.levelTimeLimit']];
    if (!document.globalLifeLimit) fields.push(['lifeLimitMode', 'simple.levelLifeLimit']);
    if (level.option?.timeLimitMode && level.option.timeLimitMode !== 'UNLIMITED') fields.push(['timeLimitValue', 'simple.levelTimeValue']);
    if (!document.globalLifeLimit && level.option?.lifeLimitMode === 'LIMITED') fields.push(['lifeLimitValue', 'simple.levelLifeValue']);
    for (const [path, label] of fields) {
      if (blank(level.option?.[path])) errors.push({ path: `levels[${index}].option.${path}`, label, level: index + 1 });
    }
  }
  return errors;
}
