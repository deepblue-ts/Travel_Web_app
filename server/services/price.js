// server/services/price.js
// 価格文字列 → 数値JPY 変換と日別コスト正規化（中央値寄せ）
// ------------------------------------------------------------
// 目的：プランの見積合計が過度に低くならないよう、"〜" レンジ等を
//      代表値（中央値/合理的な代表）で集計する。
// 
// 仕様：
//  - "1,500円〜3,000円"    → mid: 2,250（(1500+3000)/2） / upper: 3000 / lower: 1500
//  - "〜3,000円"            → mid: 0.7*3000 = 2100（下限寄り代表） / upper: 3000 / lower: 0
//  - "1,500円〜"            → mid: 1.15*1500 = 1725（最低保証＋上振れ）/ upper: 1.3*x / lower: x
//  - "3,000円"              → 3000
//  - "無料" / "Free"        → 0
//  - 解釈不明               → 0
//
// 使い方：parsePriceToJPY(input, { mode: 'mid' }) を基本に使用。
// 既存互換：toJPY(), normalizeDayPlanCosts(), calcDayTotalJPY() も提供。

/** 数字配列に変換（カンマ除去） */
function pickNumbers(s = '') {
  const nums = (String(s).match(/\d{1,3}(?:,\d{3})*|\d+/g) || [])
    .map((t) => Number(String(t).replace(/,/g, '')))
    .filter((n) => Number.isFinite(n) && n >= 0);
  return nums;
}

/** "無料" 判定 */
function isFreeLike(s = '') {
  const t = String(s).toLowerCase();
  return /無料|free|no\s*charge/.test(t);
}

/** 下限/上限/中央値などの代表値を返す */
export function parsePriceToJPY(input, opts = {}) {
  const mode = opts.mode || 'mid'; // 'mid' | 'upper' | 'lower'
  if (input == null) return 0;

  // すでに数値
  if (typeof input === 'number' && Number.isFinite(input) && input >= 0) {
    return Math.floor(input);
  }

  const s = String(input).trim();
  if (!s) return 0;
  if (isFreeLike(s)) return 0;

  const nums = pickNumbers(s);
  const hasTilde = /[〜~\-–—]/.test(s); // 〜, ~, -, –, — などをレンジ記号として許容
  const hasYen = /円/.test(s);

  // "x〜y" / "x-y"
  if (hasTilde && nums.length >= 2) {
    const lo = Math.min(nums[0], nums[1]);
    const hi = Math.max(nums[0], nums[1]);
    if (mode === 'upper') return hi;
    if (mode === 'lower') return lo;
    return Math.round((lo + hi) / 2); // mid
  }

  // "〜y"（上限のみ確定）
  if (hasTilde && nums.length === 1 && /^[^0-9]*[〜~\-–—]/.test(s)) {
    const hi = nums[0];
    if (mode === 'upper') return hi;
    if (mode === 'lower') return 0;
    return Math.round(hi * 0.7); // mid: 上限の7割を代表値に
  }

  // "x〜"（下限のみ確定）
  if (hasTilde && nums.length === 1 && /[〜~\-–—][^0-9]*$/.test(s)) {
    const lo = nums[0];
    if (mode === 'upper') return Math.round(lo * 1.3);  // 上振れ想定
    if (mode === 'lower') return lo;
    return Math.round(lo * 1.15); // mid: 最低保証＋少し上振れ
  }

  // 単独数値
  if (nums.length >= 1) {
    return Math.floor(nums[0]);
  }

  // 解釈不能
  return 0;
}

/** 既存互換：toJPY（従来は上限寄せだったが、今後は中央値寄せに統一） */
export function toJPY(input) {
  return parsePriceToJPY(input, { mode: 'mid' });
}

/** エイリアス：一部既存コードが yen(...) を参照していたため保持 */
export const yen = (input, opts) => parsePriceToJPY(input, opts);

/** schedule アイテムの price_jpy を保証（price → price_jpy(mid)） */
export function normalizePriceOnItem(item) {
  if (!item || typeof item !== 'object') return item;
  const out = { ...item };

  // 1) 入力に price_jpy があれば最優先で採用（数値の場合）
  if (typeof out.price_jpy === 'number' && Number.isFinite(out.price_jpy)) {
    out.price_jpy = Math.max(0, Math.floor(out.price_jpy));
    return out;
  }

  // 2) price（文字列/数値）を中央値寄せで解釈
  out.price_jpy = toJPY(out.price ?? out.price_jpy);
  return out;
}

/** 1日分のプランを正規化：各アイテムに price_jpy、day.total_cost を数値で付与 */
export function normalizeDayPlanCosts(dayPlan) {
  if (!dayPlan || typeof dayPlan !== 'object') {
    return { schedule: [], total_cost: 0, ...(dayPlan || {}) };
  }
  const out = { ...dayPlan };
  out.schedule = (out.schedule || []).map(normalizePriceOnItem);

  const total = out.schedule.reduce((acc, it) => acc + (Number(it.price_jpy) || 0), 0);
  out.total_cost = Math.max(0, Math.floor(total));
  return out;
}

/** 日別合計のみ欲しい場合のユーティリティ */
export function calcDayTotalJPY(dayPlan) {
  const norm = normalizeDayPlanCosts(dayPlan);
  return Number(norm.total_cost) || 0;
}
