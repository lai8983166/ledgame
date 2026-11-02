const copy = {
  'zh-CN': ['将生成 {count} 帧', '第 {level} 关 · {mode}\n生成 {count} 帧，写入第 {start}～{end} 帧。\n改动原有 {changed} 帧，新增 {added} 帧。\n本关总帧数：{before} → {after}。\n是否应用特效？'],
  'en-US': ['{count} frames will be generated', 'Level {level} · {mode}\nGenerate {count} frames, writing frames {start}–{end}.\nChange {changed} existing frames and add {added} frames.\nTotal frames in this level: {before} → {after}.\nApply effect?'],
  'es-ES': ['Se generarán {count} fotogramas', 'Nivel {level} · {mode}\nGenerar {count} fotogramas en las posiciones {start}–{end}.\nModificar {changed} fotogramas existentes y añadir {added}.\nTotal del nivel: {before} → {after}.\n¿Aplicar el efecto?'],
  'pt-PT': ['Serão gerados {count} fotogramas', 'Nível {level} · {mode}\nGerar {count} fotogramas nas posições {start}–{end}.\nAlterar {changed} fotogramas existentes e adicionar {added}.\nTotal do nível: {before} → {after}.\nAplicar o efeito?'],
  'fr-FR': ['{count} images seront générées', 'Niveau {level} · {mode}\nGénérer {count} images aux positions {start}–{end}.\nModifier {changed} images existantes et en ajouter {added}.\nTotal du niveau : {before} → {after}.\nAppliquer l’effet ?'],
  'de-DE': ['{count} Bilder werden erzeugt', 'Level {level} · {mode}\n{count} Bilder an Position {start}–{end} erzeugen.\n{changed} vorhandene Bilder ändern und {added} hinzufügen.\nBilder im Level insgesamt: {before} → {after}.\nEffekt anwenden?'],
  'pl-PL': ['Powstanie {count} klatek', 'Poziom {level} · {mode}\nWygeneruj {count} klatek na pozycjach {start}–{end}.\nZmień {changed} istniejących klatek i dodaj {added}.\nŁączna liczba klatek poziomu: {before} → {after}.\nZastosować efekt?'],
  'ru-RU': ['Будет создано кадров: {count}', 'Уровень {level} · {mode}\nСоздать {count} кадров на позициях {start}–{end}.\nИзменить существующих кадров: {changed}; добавить: {added}.\nВсего кадров уровня: {before} → {after}.\nПрименить эффект?'],
  'vi-VN': ['Sẽ tạo {count} khung hình', 'Màn {level} · {mode}\nTạo {count} khung hình tại vị trí {start}–{end}.\nThay đổi {changed} khung hình hiện có và thêm {added}.\nTổng số khung hình của màn: {before} → {after}.\nÁp dụng hiệu ứng?'],
  'it-IT': ['Verranno generati {count} fotogrammi', 'Livello {level} · {mode}\nGenerare {count} fotogrammi nelle posizioni {start}–{end}.\nModificare {changed} fotogrammi esistenti e aggiungerne {added}.\nTotale del livello: {before} → {after}.\nApplicare l’effetto?'],
  'cs-CZ': ['Bude vytvořeno {count} snímků', 'Úroveň {level} · {mode}\nVytvořit {count} snímků na pozicích {start}–{end}.\nZměnit {changed} stávajících snímků a přidat {added}.\nCelkový počet snímků úrovně: {before} → {after}.\nPoužít efekt?'],
  'ko-KR': ['{count}개 프레임 생성 예정', '레벨 {level} · {mode}\n{start}~{end} 위치에 프레임 {count}개를 생성합니다.\n기존 프레임 {changed}개를 변경하고 {added}개를 추가합니다.\n레벨 총 프레임: {before} → {after}.\n효과를 적용하시겠습니까?'],
  'ro-RO': ['Vor fi generate {count} cadre', 'Nivelul {level} · {mode}\nGenerează {count} cadre la pozițiile {start}–{end}.\nModifică {changed} cadre existente și adaugă {added}.\nTotalul cadrelor nivelului: {before} → {after}.\nAplici efectul?'],
  'ar-SA': ['سيتم إنشاء {count} إطارًا', 'المستوى {level} · {mode}\nإنشاء {count} إطارًا في المواضع {start}–{end}.\nتعديل {changed} إطارًا موجودًا وإضافة {added}.\nإجمالي إطارات المستوى: {before} → {after}.\nهل تريد تطبيق التأثير؟'],
};

export function effectImpactCatalog(locale) {
  const [generatedCount, confirmImpact] = copy[locale];
  return { generatedCount, confirmImpact };
}
