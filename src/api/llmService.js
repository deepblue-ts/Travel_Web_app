// src/api/llmService.js
// ------------------------------------------------------------
// 役割:
//  - フロントエンドからバックエンド(API)を叩く薄いクライアント
//  - 本番(GitHub Pages 等)では VITE_API_BASE or 既定の Render URL を使う
//  - localhost では相対 /api を使い Vite の proxy に委譲
//  - 一部エンドポイントは POST が 405/404 のとき GET へ自動フォールバック
// ------------------------------------------------------------

// ============ ベースURL解決 ============

// 1) .env.* から（最優先）
const fromEnv = (import.meta.env?.VITE_API_BASE ?? '').trim().replace(/\/+$/, '');

// 2) 実行環境の判定
const host = typeof window !== 'undefined' ? window.location.hostname : '';
const isLocalhost = /^(localhost|127\.0\.0\.1)$/.test(host);
const isGitHubPages = /\.github\.io$/.test(host);

// 3) GitHub Pages 用の既定フォールバック（必要に応じて自分の Render URL に変更）
const PROD_FALLBACK = 'https://travel-web-app-s2gj.onrender.com';

// 4) 最終決定
// - env があればそれ
// - localhost は相対 /api を使って Vite の proxy に委ねる（BASE は空のまま）
// - GitHub Pages で env が無ければ Render 既定URLへ
const _resolvedBase =
  fromEnv ||
  (isLocalhost ? '' : (isGitHubPages ? PROD_FALLBACK : ''));

// デバッグ用に “今どこを向いているか”
export const API_BASE = _resolvedBase; // 例: 'https://xxx.onrender.com' or ''（相対）
export const API_TARGET_DESC = fromEnv
  ? 'env:VITE_API_BASE'
  : (isLocalhost
      ? 'relative:/api (vite proxy)'
      : (isGitHubPages ? 'fallback:render' : 'relative:/api (no-proxy)'));

// 相対 /api を使えるのは基本「localhost のみ」
export const API_ENABLED = !!(API_BASE || isLocalhost);

// ============ 共通ユーティリティ ============

const joinPath = (p) => (p.startsWith('/') ? p : `/${p}`);
const buildUrl = (p) => {
  const path = joinPath(p);
  return API_BASE ? `${API_BASE}${path}` : path; // '' のときは相対 /api/xxx
};

const parseJsonSafe = async (res) => {
  try { return await res.json(); } catch { return null; }
};

const makeQueryString = (obj = {}) =>
  Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');

// POST→GET フォールバック対象（CDN/静的ホスティングで405になりやすい）
const FALLBACK_TO_GET = new Set([
  '/api/estimate-fare',
  '/api/get-areas',
]);

// API 呼び出し（POST 基本、一部は GET フォールバック）
async function apiFetch(path, { method = 'POST', body, headers } = {}) {
  if (!API_ENABLED) {
    throw new Error(
      'API is not configured. Set VITE_API_BASE (e.g., Render URL). ' +
      `current: ${API_TARGET_DESC}`
    );
  }

  const endpoint = buildUrl(path);
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
  };
  if (method !== 'GET') opts.body = JSON.stringify(body ?? {});

  let res;
  try {
    res = await fetch(endpoint, opts);
  } catch (e) {
    // ネットワークエラー時のフォールバック（対象のみ）
    if (method === 'POST' && FALLBACK_TO_GET.has(path)) {
      const qs = makeQueryString(body || {});
      const res2 = await fetch(`${endpoint}?${qs}`, { method: 'GET' });
      if (!res2.ok) {
        const j2 = await parseJsonSafe(res2);
        throw new Error((j2 && (j2.error || j2.message)) || `API GET fallback failed (${res2.status})`);
      }
      return (await parseJsonSafe(res2)) ?? {};
    }
    throw e;
  }

  // 405/404 → GET へ自動フォールバック（対象のみ）
  if (!res.ok && method === 'POST' && FALLBACK_TO_GET.has(path) && (res.status === 405 || res.status === 404)) {
    const qs = makeQueryString(body || {});
    const res2 = await fetch(`${endpoint}?${qs}`, { method: 'GET' });
    if (!res2.ok) {
      const j2 = await parseJsonSafe(res2);
      throw new Error((j2 && (j2.error || j2.message)) || `API GET fallback failed (${res2.status})`);
    }
    return (await parseJsonSafe(res2)) ?? {};
  }

  if (!res.ok) {
    const j = await parseJsonSafe(res);
    throw new Error((j && (j.error || j.message)) || `API call failed (${res.status})`);
  }
  return (await parseJsonSafe(res)) ?? {};
}

// ============ API ラッパー ============

// エリア候補
export const fetchAreasForDestination = async (destination, planId) => {
  if (!destination) return [];
  try {
    const response = await apiFetch('/api/get-areas', { body: { destination, planId } });
    return response?.areas || [];
  } catch (e) {
    console.error('エリア候補の取得に失敗:', e);
    return [];
  }
};

// リソーススカウター群
export const findDiningOptions = (conditions, planId) =>
  apiFetch('/api/find-dining', { body: { ...conditions, planId } });

export const findAccommodation = (conditions, planId) =>
  apiFetch('/api/find-accommodation', { body: { ...conditions, planId } });

export const findActivities = (conditions, planId) =>
  apiFetch('/api/find-activities', { body: { ...conditions, planId } });

// マスタープランナー
export const createMasterPlan = (planConditions, planId, constraints = {}) =>
  apiFetch('/api/create-master-plan', { body: { ...planConditions, planId, constraints } });

// デイリースケジューラー（バッチ）
export const createDayPlans = (daysArray, planId, constraints = {}) =>
  apiFetch('/api/create-day-plans', {
    body: {
      days: (daysArray || []).map((d) => ({ ...d, constraints })),
      planId,
      constraints,
    },
  });

// Excel 連携
export const startPlanSession = (meta) => apiFetch('/api/plan/start', { body: meta });

export const logUser = (planId, items) =>
  apiFetch('/api/plan/log-user', { body: { planId, items } });

export const logLLM = (planId, { agent, kind, summary, payload }) =>
  apiFetch('/api/plan/log-llm', { body: { planId, agent, kind, summary, payload } });

export const logGeocode = (planId, results) =>
  apiFetch('/api/plan/log-geocode', { body: { planId, results } });

export const finalizePlan = (planId, finalPlan) =>
  apiFetch('/api/plan/finalize', { body: { planId, finalPlan } });

// ジオコーディング（バッチ/単品）
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
  return apiFetch('/api/geocode-batch', { body: { destination, items, planId } });
};

// 単発地名
export const geocodePlace = async (query, planId) => {
  const j = await apiFetch('/api/geocode-place', { body: { query, planId } });
  return j || null;
};

// 状態取得（GET）
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

// 旅程の修正
export async function revisePlan(planConditions, currentItinerary, instructions, planId) {
  return apiFetch('/api/revise-plan', {
    body: {
      planId,
      planConditions,
      itinerary: currentItinerary,
      instructions,
    },
  });
}

// 運賃見積り（位置引数 / オブジェクト引数の両対応）
export async function estimateFare(arg1, arg2, arg3) {
  let payload;
  if (typeof arg1 === 'object' && arg1 !== null) {
    // 例: estimateFare({ origin, destination, transport })
    payload = { origin: arg1.origin, destination: arg1.destination, transport: arg1.transport };
  } else {
    // 例: estimateFare(origin, destination, transport)
    payload = { origin: arg1, destination: arg2, transport: arg3 };
  }
  return apiFetch('/api/estimate-fare', { body: payload });
}
