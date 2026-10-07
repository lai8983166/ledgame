export function isDebugRuntimeAvailable(state) {
  return ['IDLE','STOPPED'].includes(state?.engineState)
    && !state?.preparation && !state?.queueSummary?.waiting?.length;
}
export function debugLaunchPayload(game, options) {
  const count=Number(options.userCount), level=Number(options.startLevel);
  const minimum=Number(game.minPlayers || 1), maximum=Number(game.maxPlayers || game.participants || 1);
  if (!Number.isInteger(count) || count<minimum || count>maximum || !Number.isInteger(level) || level<1 || level>(game.levels?.length || 1))
    throw new Error('editorDebug.invalidOptions');
  return {gameId:Number(game.id),userCount:count,startLevelIndex:level-1,
    launchMethod:options.launchMethod==='wristband'?'wristband':'debug',runtimeMode:'SIMULATION',stageFailurePolicy:options.stageFailurePolicy || 'END_GAME'};
}
export function appendDebugWristband(state, sessionId, uid) {
  if(state?.preparation?.sessionId!==sessionId || state.engineState!=='PREPARING') throw new Error('editorDebug.sessionLost');
  if(!/^\d{1,32}$/.test(uid)) throw new Error('WRISTBAND_ID_INVALID');
  const ids=(state.playerAccesses || []).map(p=>String(p.access?.uid || ''));
  if(ids.includes(uid)) throw new Error('DUPLICATE_WRISTBAND');
  if(ids.length>=Number(state.preparation.options?.userCount || 1)) throw new Error('WRISTBAND_PARTICIPANT_LIMIT');
  return [...ids,uid];
}
export function pixelsFromDebugFrame(frame,width,height) {
  if(frame?.width!==width || frame?.height!==height || frame?.rgb?.length!==width*height*3) return null;
  return Array.from({length:height},(_,y)=>Array.from({length:width},(_,x)=>{
    const i=(y*width+x)*3; return {r:frame.rgb[i],g:frame.rgb[i+1],b:frame.rgb[i+2]};
  }));
}
