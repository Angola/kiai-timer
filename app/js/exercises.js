// Built-in exercise dictionary, so interval names can be picked instead of typed.
// Each entry is [ja, en].

export const CATEGORIES = [
  { id: 'full', items: [
    ['バーピー', 'Burpees'], ['ジャンピングジャック', 'Jumping jacks'], ['マウンテンクライマー', 'Mountain climbers'],
    ['ケトルベルスイング', 'Kettlebell swings'], ['スクワットスラスト', 'Squat thrusts'], ['ベアクロール', 'Bear crawl'],
  ] },
  { id: 'lower', items: [
    ['スクワット', 'Squats'], ['ジャンプスクワット', 'Jump squats'], ['ランジ', 'Lunges'],
    ['ブルガリアンスクワット', 'Bulgarian split squats'], ['ワイドスクワット', 'Sumo squats'],
    ['ヒップリフト', 'Glute bridges'], ['カーフレイズ', 'Calf raises'], ['ウォールシット', 'Wall sit'],
  ] },
  { id: 'upper', items: [
    ['腕立て伏せ', 'Push-ups'], ['膝つき腕立て', 'Knee push-ups'], ['ディップス', 'Dips'],
    ['懸垂', 'Pull-ups'], ['パイクプッシュアップ', 'Pike push-ups'], ['ダンベルカール', 'Dumbbell curls'],
    ['ショルダープレス', 'Shoulder press'], ['ベントオーバーロウ', 'Bent-over rows'],
  ] },
  { id: 'core', items: [
    ['プランク', 'Plank'], ['サイドプランク', 'Side plank'], ['クランチ', 'Crunches'],
    ['レッグレイズ', 'Leg raises'], ['ロシアンツイスト', 'Russian twists'], ['バイシクルクランチ', 'Bicycle crunches'],
    ['スーパーマン', 'Superman'], ['デッドバグ', 'Dead bug'],
  ] },
  { id: 'cardio', items: [
    ['ハイニー', 'High knees'], ['縄跳び', 'Jump rope'], ['スプリント', 'Sprint'],
    ['シャドーボクシング', 'Shadow boxing'], ['バトルロープ', 'Battle ropes'], ['スケーター', 'Skaters'],
  ] },
];

export function catalog(lang) {
  const i = lang === 'ja' ? 0 : 1;
  return CATEGORIES.map(c => ({ id: c.id, names: c.items.map(pair => pair[i]) }));
}
