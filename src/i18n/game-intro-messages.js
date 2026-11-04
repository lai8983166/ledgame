const keys = ['gameplayIntro', 'voiceDescription', 'gameDescription', 'video'];
const labels = {
  'zh-CN': ['玩法介绍', '语音说明', '游戏说明', '视频'],
  'en-US': ['How to play', 'Voice instructions', 'Game instructions', 'Video'],
  'es-ES': ['Cómo jugar', 'Instrucciones de voz', 'Instrucciones del juego', 'Vídeo'],
  'pt-PT': ['Como jogar', 'Instruções de voz', 'Instruções do jogo', 'Vídeo'],
  'fr-FR': ['Comment jouer', 'Instructions vocales', 'Instructions du jeu', 'Vidéo'],
  'de-DE': ['Spielanleitung', 'Sprachanleitung', 'Spielhinweise', 'Video'],
  'pl-PL': ['Jak grać', 'Instrukcje głosowe', 'Instrukcje gry', 'Wideo'],
  'ru-RU': ['Как играть', 'Голосовые инструкции', 'Инструкции игры', 'Видео'],
  'vi-VN': ['Cách chơi', 'Hướng dẫn bằng giọng nói', 'Hướng dẫn trò chơi', 'Video'],
  'it-IT': ['Come giocare', 'Istruzioni vocali', 'Istruzioni del gioco', 'Video'],
  'cs-CZ': ['Jak hrát', 'Hlasové pokyny', 'Pokyny ke hře', 'Video'],
  'ko-KR': ['플레이 방법', '음성 안내', '게임 안내', '동영상'],
  'ro-RO': ['Cum se joacă', 'Instrucțiuni vocale', 'Instrucțiuni de joc', 'Video'],
  'ar-SA': ['طريقة اللعب', 'التعليمات الصوتية', 'تعليمات اللعبة', 'فيديو'],
};

export function gameIntroCatalog(locale) {
  return Object.fromEntries(keys.map((key, index) => [key, labels[locale][index]]));
}
