// server/services/budget.js
// 旅行全体/日別の予算調整ロジック（LLM最終仕上げ＆日次リバジェット）
// ------------------------------------------------------------------
// 役割：
//  - finalizeTripBudgetIfNeeded: 旅行全体の合計を「総予算の targetMin〜targetMax」に収める
//    * 原則：ショッピング枠は増やさない / 食事・アクティビティ・宿のグレードUP/DOWNで調整
//    * 単一目的地モードの制約を維持（中日に travel 追加しない、URL必須、捏造不可）
//  - rebudgetDayPlanIfOverBudget: 1日分が budgetPerDay を超過した場合に微修正する
//
// 依存：OpenAI クライアント、price.js（数値化/合算ユーティリティ）
import { normalizeDayPlanCosts, calcDayTotalJPY } from './price.js';

// ----------------------- ユーティリティ -----------------------
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function sumTripTotal(itinerary = []) {
  return itinerary.reduce((acc, d) => acc + calcDayTotalJPY(d), 0);
}

// JSON抽出（保険）
function extractJson(text = '') {
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s === -1 || e === -1 || e < s) return null;
  try { return JSON.parse(text.slice(s, e + 1)); } catch { return null; }
}

// ----------------------- プロンプト -----------------------
const SYSTEM_BUDGET_CLOSER = `
あなたは旅行プランの予算最適化エージェントです。単一目的地モードの旅程(itinerary)を、総予算レンジ内に収めるために**最小限の修正**を加えます。

# 厳守
- origin/destination/日付(day/date)/area/theme は原則維持。中日に "travel" を新規挿入しない。
- URL は必須（捏造禁止）。存在しない店/施設は選ばない。
- 追加/置換は **availableResources に含まれている候補のみ**（与えられない場合は既存アイテムを調整：同施設の上位コース、より高価格の代表メニュー、部屋タイプUP 等）。
- 宿(type:"hotel")は1日1軒まで。最終日に帰路がある場合は宿を含めない。
- 価格(price)は日本円の文字列で必ず記載（例: "2,500円", "15,000円〜"）。レンジの場合は現実的な代表価格を設定。
- areaLocked:true を尊重し、その日のareaの外に出ない。

# 目標
- 旅行全体の見積合計が **total_budget * targetMinRatio〜total_budget * targetMaxRatio** に入るよう調整。
- 優先順位（ボリュームUP時）:
  1) 宿のグレードUP（同一宿の上位プラン or 同エリアの上位ホテル／差し替え）
  2) 夕食のグレードUP → 昼食のグレードUP
  3) 有料アクティビティの追加（1日あたり1つ程度）
- 優先順位（超過時のDOWN）:
  1) ランチ/ティーのダウングレード
  2) アクティビティの安価代替
  3) 宿のグレード調整（ただし大幅に質を落とさない）

# 出力（JSONのみ）
{ "itinerary": [ { "day": 1, "date": "YYYY-MM-DD", "area": "...", "theme": "...",
  "schedule": [
    { "time":"..", "activity_name":"..", "type":"activity|meal|hotel|travel", "description":"..", "price":"1500円", "url":".." }
  ],
  "total_cost": 12345
} ] }
`.trim();

const SYSTEM_REBUDGET_DAY = `
あなたは旅程修正のプロです。与えられた1日分のスケジュールを、指定の1日予算(budgetPerDay) **以下** に収めるため、最小限の置換/調整を行います。

# 厳守
- day/date/area/theme/時系列は維持。
- 中日に "travel" を新規挿入しない。URLは必須（捏造禁止）。
- 宿(type:"hotel")は1日1軒まで。
- availableResources が渡されていれば、その中からのみ置換（無ければ既存アイテムの価格帯調整で対応）。
- 食事回数は最低限は維持。free を増やすだけの不自然な改変は避ける。

# 出力（JSONのみ）
{"day_plan": { "day": 1, "date": "YYYY-MM-DD", "area": "...", "theme": "...",
 "schedule": [...], "total_cost": 12345 }}
`.trim();

// ----------------------- LLM 呼び出し薄ラッパ -----------------------
async function callJsonLLM({ openai, system, user, model = 'gpt-4o' }) {
  const resp = await openai.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  const raw = resp?.choices?.[0]?.message?.content || '';
  try { return JSON.parse(raw); } catch { return extractJson(raw) || {}; }
}

// ----------------------- 旅行全体の最終調整 -----------------------
export async function finalizeTripBudgetIfNeeded({
  openai,
  itinerary = [],
  planConditions = {},
  targetMinRatio = 0.8,
  targetMaxRatio = 1.0,
}) {
  let current = (itinerary || []).map(normalizeDayPlanCosts);
  const budgetPerDay = Number(planConditions?.budgetPerDay);
  const days = current.length;
  const totalBudget = Number.isFinite(budgetPerDay) && days > 0 ? budgetPerDay * days : null;
  if (!Number.isFinite(totalBudget) || totalBudget <= 0) {
    return { itinerary: current, tripTotal: sumTripTotal(current) };
  }

  const minTarget = Math.floor(totalBudget * clamp(targetMinRatio, 0, 1));
  const maxTarget = Math.floor(totalBudget * clamp(targetMaxRatio, 0, 1));

  let total = sumTripTotal(current);
  if (total >= minTarget && total <= maxTarget) {
    return { itinerary: current, tripTotal: total };
  }

  let attempt = 0;
  while (attempt < 2) {
    attempt++;

    const userPayload = {
      planConditions: {
        destination: planConditions?.destination || '',
        budgetPerDay,
        total_budget: totalBudget,
        targetMinRatio,
        targetMaxRatio,
      },
      itinerary: current.map(d => ({
        day: d.day, date: d.date, area: d.area, theme: d.theme,
        schedule: (d.schedule || []).map(s => ({
          time: s.time,
          activity_name: s.activity_name,
          type: s.type,
          description: s.description,
          price: typeof s.price_jpy === 'number' ? `${s.price_jpy}円` : (s.price || ''),
          url: s.url || ''
        }))
      })),
    };

    const out = await callJsonLLM({
      openai,
      system: SYSTEM_BUDGET_CLOSER,
      user: `以下の旅程を total_budget * targetMinRatio〜targetMaxRatio に収めてください（ショッピング枠の追加は不可）。\n入力: ${JSON.stringify(userPayload)}`,
      model: 'gpt-4o',
    });

    const next = Array.isArray(out?.itinerary) ? out.itinerary : Array.isArray(out?.revised_itinerary) ? out.revised_itinerary : null;
    if (!Array.isArray(next) || next.length === 0) {
      break;
    }

    current = next.map(normalizeDayPlanCosts);
    total = sumTripTotal(current);

    if (total >= minTarget && total <= maxTarget) break;
  }

  return { itinerary: current, tripTotal: sumTripTotal(current) };
}

// ----------------------- 日別の超過時リバジェット -----------------------
export async function rebudgetDayPlanIfOverBudget({
  openai,
  systemPrompt = SYSTEM_REBUDGET_DAY,
  userBody = {},
  draftPlan = {},
  budgetPerDay,
  tries = 2,
}) {
  if (!Number.isFinite(budgetPerDay) || budgetPerDay <= 0) return normalizeDayPlanCosts(draftPlan);

  let plan = normalizeDayPlanCosts(draftPlan);
  let total = calcDayTotalJPY(plan);
  if (total <= budgetPerDay) return plan;

  let attempt = 0;
  while (attempt < Math.max(1, tries)) {
    attempt++;

    const userPayload = {
      budgetPerDay,
      fixed: { day: plan.day, date: plan.date, area: plan.area, theme: plan.theme },
      schedule: (plan.schedule || []).map(s => ({
        time: s.time,
        activity_name: s.activity_name,
        type: s.type,
        description: s.description,
        price: typeof s.price_jpy === 'number' ? `${s.price_jpy}円` : (s.price || ''),
        url: s.url || ''
      })),
    };

    const out = await callJsonLLM({
      openai,
      system: systemPrompt,
      user: `以下の1日プランを budgetPerDay 以下に収めてください。\n入力: ${JSON.stringify(userPayload)}`,
      model: 'gpt-4o',
    });

    const dayPlan = out?.day_plan || out?.plan || out;
    if (!dayPlan || !Array.isArray(dayPlan?.schedule)) break;

    plan = normalizeDayPlanCosts(dayPlan);
    total = calcDayTotalJPY(plan);
    if (total <= budgetPerDay) break;
  }

  return plan;
}

// ----------------------- 追加：表層API（オプション） -----------------------
export function suggestPerDayTarget(totalBudget, days, minRatio = 0.8, maxRatio = 1.0) {
  if (!Number.isFinite(totalBudget) || totalBudget <= 0 || !Number.isFinite(days) || days <= 0) {
    return { minPerDay: null, maxPerDay: null };
  }
  const minTotal = totalBudget * clamp(minRatio, 0, 1);
  const maxTotal = totalBudget * clamp(maxRatio, 0, 1);
  return {
    minPerDay: Math.floor(minTotal / days),
    maxPerDay: Math.floor(maxTotal / days),
  };
}
