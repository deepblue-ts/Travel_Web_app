// src/api/llmService.js
// ------------------------------------------------------------
// API ベースURLの解決ロジック（本番/開発/フォールバック）
// ------------------------------------------------------------

// 1) .env.* から（最優先）
const fromEnv = (import.meta.env?.VITE_API_BASE ?? '').trim().replace(/\/+$/, '');

// 2) 実行環境の判定
const host = typeof window !== 'undefined' ? window.location.hostname : '';
const isLocalhost = /^(localhost|127\.0\.0\.1)$/.test(host);
const isGitHubPages = /\.github\.io$/.test(host);

// 3) GitHub Pages 用の既定フォールバック（必要なら自分の Render URL に変更）
const PROD_FALLBACK = 'https://travel-web-app-s2gj.onrender.com';

// 4) 最終決定
// - env があればそれ
// - localhost は相対 /api を使って Vite の proxy に委ねる（BASE は空のまま）
// - GitHub Pages で env が無ければ Render 既定URLへ
const _resolvedBase =
  fromEnv ||
  (isLocalhost ? '' : (isGitHubPages ? PROD_FALLBACK : ''));

// デバッグ用に “今どこを向いているか” を分かるように公開
export const API_BASE = _resolvedBase; // 例: 'https://xxx.onrender.com' or ''（相対）
export const API_TARGET_DESC = fromEnv
  ? 'env:VITE_API_BASE'
  : (isLocalhost
      ? 'relative:/api (vite proxy)'
      : (isGitHubPages ? 'fallback:render' : 'relative:/api (no-proxy)'));

// 相対 /api を使えるのは基本「localhost のみ」とし、
// それ以外のオリジンでは BASE が必要（= Pages では必ず絶対URLを使う）
export const API_ENABLED = !!(API_BASE || isLocalhost);

// パス結合（先頭スラッシュを保証）
const joinPath = (p) => (p.startsWith('/') ? p : `/${p}`);

// 実際に叩く URL を生成
const buildUrl = (p) => {
  const path = joinPath(p);
  return API_BASE ? `${API_BASE}${path}` : path; // '' のときは相対 /api/xxx
};

// 共通ヘルパ：レスポンス JSON 安全パース
const parseJsonSafe = async (res) => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};

// ------------------------------------------------------------
// 共通 POST
// ------------------------------------------------------------
const postToApi = async (path, body) => {
  if (!API_ENABLED) {
    // Pages などで相対 /api は使えないため、明示メッセージを出す
    throw new Error(
      'API is not configured. Set VITE_API_BASE (e.g., Render URL). ' +
      `current: ${API_TARGET_DESC}`
    );
  }
  const endpoint = buildUrl(path);
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const j = await parseJsonSafe(res);
    console.error(`API Error for ${endpoint}:`, j || `HTTP ${res.status}`);
    throw new Error((j && (j.error || j.message)) || `API call failed (${res.status})`);
  }
  const j = await parseJsonSafe(res);
  return j ?? {};
};

// ------------------------------------------------------------
// UI 補助
// ------------------------------------------------------------
export const fetchAreasForDestination = async (destination, planId) => {
  if (!destination) return [];
  try {
    const response = await postToApi('/api/get-areas', { destination, planId });
    return response?.areas || [];
  } catch (e) {
    console.error('エリア候補の取得に失敗:', e);
    return [];
  }
};

// ------------------------------------------------------------
// リソーススカウター群
// ------------------------------------------------------------
export const findDiningOptions = (conditions, planId) =>
  postToApi('/api/find-dining', { ...conditions, planId });

export const findAccommodation = (conditions, planId) =>
  postToApi('/api/find-accommodation', { ...conditions, planId });

export const findActivities = (conditions, planId) =>
  postToApi('/api/find-activities', { ...conditions, planId });

// ------------------------------------------------------------
// マスタープランナー
// ------------------------------------------------------------
export const createMasterPlan = (planConditions, planId, constraints = {}) =>
  postToApi('/api/create-master-plan', { ...planConditions, planId, constraints });

// ------------------------------------------------------------
// デイリースケジューラー（バッチ）
// ------------------------------------------------------------
export const createDayPlans = (daysArray, planId, constraints = {}) =>
  postToApi('/api/create-day-plans', {
    days: (daysArray || []).map((d) => ({ ...d, constraints })),
    planId,
    constraints,
  });

// ------------------------------------------------------------
// Excel 連携
// ------------------------------------------------------------
export const startPlanSession = (meta) => postToApi('/api/plan/start', meta);

export const logUser = (planId, items) =>
  postToApi('/api/plan/log-user', { planId, items });

export const logLLM = (planId, { agent, kind, summary, payload }) =>
  postToApi('/api/plan/log-llm', { planId, agent, kind, summary, payload });

export const logGeocode = (planId, results) =>
  postToApi('/api/plan/log-geocode', { planId, results });

export const finalizePlan = (planId, finalPlan) =>
  postToApi('/api/plan/finalize', { planId, finalPlan });

// ------------------------------------------------------------
// 地図（バッチ/単品）
// ------------------------------------------------------------
export const geocodeItinerary = async (destination, itinerary, planId) => {
  if (!API_ENABLED) {
    throw new Error(
      'API disabled: set VITE_API_BASE for this origin. ' +
      `current: ${API_TARGET_DESC}`
    );
  }
  const items = [];
  for (const day of itinerary || []) {
    for (const s of day.schedule || []) {
      items.push({
        name: s.activity_name || s.name,
        area: day.area,
        day: day.day,
        time: s.time,
      });
    }
  }
  const endpoint = buildUrl('/api/geocode-batch');
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destination, items, planId }),
  });
  if (!res.ok) {
    const j = await parseJsonSafe(res);
    throw new Error((j && j.error) || `geocode-batch failed: ${res.status}`);
  }
  const data = await parseJsonSafe(res);
  if (planId && data?.results) {
    try { await logGeocode(planId, data.results); } catch {}
  }
  return data ?? { results: [] };
};

export const geocodePlace = async (name, planId) => {
  if (!API_ENABLED) {
    throw new Error(
      'API disabled: set VITE_API_BASE for this origin. ' +
      `current: ${API_TARGET_DESC}`
    );
  }
  const endpoint = buildUrl('/api/geocode-batch');
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destination: '', items: [{ name }], planId }),
  });
  if (!res.ok) {
    const j = await parseJsonSafe(res);
    throw new Error((j && j.error) || `geocode-place failed: ${res.status}`);
  }
  const j = await parseJsonSafe(res);
  if (planId && j?.results) {
    try { await logGeocode(planId, j.results); } catch {}
  }
  return j?.results?.[0] || null;
};

// ------------------------------------------------------------
// 状態取得
// ------------------------------------------------------------
export const getPlanState = async (planId) => {
  if (!API_ENABLED) {
    throw new Error(
      'API disabled: set VITE_API_BASE for this origin. ' +
      `current: ${API_TARGET_DESC}`
    );
  }
  const endpoint = buildUrl(`/api/plan/state?planId=${encodeURIComponent(planId)}`);
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error(`getPlanState failed: ${res.status}`);
  const j = await parseJsonSafe(res);
  return j ?? {};
};


// src/api/llmService.js の末尾などに追加
export async function revisePlan(planConditions, currentItinerary, instructions, planId) {
  const res = await fetch('/api/revise-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      planId,
      planConditions,
      itinerary: currentItinerary,
      instructions,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`revise-plan failed: ${res.status} ${t}`);
  }
  return res.json(); // { revised_itinerary: [...] }
}


export async function estimateFare(origin, destination, transport) {
  const r = await fetch('/api/estimate-fare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ origin, destination, transport }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'estimate-fare failed');
  return j; // { fareYen, distanceKm, source, ... }
}
