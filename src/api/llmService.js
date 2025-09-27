// src/api/llmService.js
// ------------------------------------------------------------
// 役割:
//  - フロントエンドからバックエンド(API)を叩く薄いクライアント
//  - 本番(GitHub Pages 等)では VITE_API_BASE or 既定の Render URL を使う
//  - 開発(localhost)では Vite の proxy を前提に相対 /api を使う
//  - 一部エンドポイントは POST が 405/404 のとき GET へ自動フォールバック
// ------------------------------------------------------------

// ============ ベースURL解決（/api まで含む） ============

// 1) .env.* から（最優先）
//   ここには「/api まで含むURL」を入れる想定だが、誤って末尾に /api が無い時は補完する
//   例: http://localhost:3001/api, https://xxx.onrender.com/api
const RAW_FROM_ENV = (import.meta.env?.VITE_API_BASE ?? '').trim();

// /api が含まれていなければ付ける保険
const ensureApiSuffix = (u) => {
  if (!u) return '';
  const trimmed = u.replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
};

const FROM_ENV = ensureApiSuffix(RAW_FROM_ENV);

// 2) 実行環境の判定
const host = typeof window !== 'undefined' ? window.location.hostname : '';
const isLocalhost = /^(localhost|127\.0\.0\.1)$/.test(host);
const isGitHubPages = /\.github\.io$/.test(host);

// 3) GitHub Pages 用の既定フォールバック（必ず /api を含む）
const PROD_FALLBACK = 'https://travel-web-app-s2gj.onrender.com/api';

// 4) 最終決定
// - env があればそれ（/api を含む／なければ補完済み）
// - localhost は相対 '/api'（Vite proxy）
// - GitHub Pages で env が無ければ Render 既定URLへ（/api を含む）
// - それ以外の環境でも、env が無ければ相対 '/api'
const API_BASE = (() => {
  if (FROM_ENV) return FROM_ENV.replace(/\/+$/, '');
  if (isLocalhost) return '/api';
  if (isGitHubPages) return PROD_FALLBACK;
  return '/api';
})();

// デバッグ用: “今どこを向いているか”
export const API_TARGET_DESC = FROM_ENV
  ? `env:VITE_API_BASE(${API_BASE})`
  : (isLocalhost ? 'relative:/api (vite proxy)' : (isGitHubPages ? `fallback:${API_BASE}` : 'relative:/api'));

// 相対 /api を使えるのは基本「localhost」のとき（ただし上で強制的に /api を返しているので true 扱い）
export const API_ENABLED = !!API_BASE;

// ============ 共通ユーティリティ ============

// API_BASE（末尾に /api を含む）と path（先頭に / を付けない）をクリーンに結合
const api = (path = '') => {
  const p = String(path || '').replace(/^\/+/, ''); // 先頭スラッシュを削る
  return `${API_BASE}/${p}`;                         // /api + /path
};

const parseJsonSafe = async (res) => {
  try { return await res.json(); } catch { return null; }
};

const makeQueryString = (obj = {}) =>
  Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');

// POST→GET フォールバック対象（CDN/静的ホスティングで405/404になりやすい）
const FALLBACK_TO_GET = new Set([
  'estimate-fare',
  'get-areas',
]);

// API 呼び出し（POST 基本、一部は GET フォールバック）
async function apiFetch(path, { method = 'POST', body, headers } = {}) {
  if (!API_ENABLED) {
    throw new Error(
      'API is not configured. Set VITE_API_BASE (e.g., https://your-backend/api). ' +
      `current: ${API_TARGET_DESC}`
    );
  }

  // ここに渡す path は 'get-areas' のように先頭スラなし
  const endpoint = api(path);
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
    const response = await apiFetch('get-areas', { body: { destination, planId } });
    return response?.areas || [];
  } catch (e) {
    console.error('エリア候補の取得に失敗:', e);
    return [];
  }
};

// リソーススカウター群
export const findDiningOptions = (conditions, planId) =>
  apiFetch('find-dining', { body: { ...conditions, planId } });

export const findAccommodation = (conditions, planId) =>
  apiFetch('find-accommodation', { body: { ...conditions, planId } });

export const findActivities = (conditions, planId) =>
  apiFetch('find-activities', { body: { ...conditions, planId } });

// マスタープランナー
export const createMasterPlan = (planConditions, planId, constraints = {}) =>
  apiFetch('create-master-plan', { body: { ...planConditions, planId, constraints } });

// デイリースケジューラー（バッチ）
export const createDayPlans = (daysArray, planId, constraints = {}) =>
  apiFetch('create-day-plans', {
    body: {
      days: (daysArray || []).map((d) => ({ ...d, constraints })),
      planId,
      constraints,
    },
  });

// Excel 連携
export const startPlanSession = (meta) => apiFetch('plan/start', { body: meta });

export const logUser = (planId, items) =>
  apiFetch('plan/log-user', { body: { planId, items } });

export const logLLM = (planId, { agent, kind, summary, payload }) =>
  apiFetch('plan/log-llm', { body: { planId, agent, kind, summary, payload } });

export const logGeocode = (planId, results) =>
  apiFetch('plan/log-geocode', { body: { planId, results } });

export const finalizePlan = (planId, finalPlan) =>
  apiFetch('plan/finalize', { body: { planId, finalPlan } });

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
  return apiFetch('geocode-batch', { body: { destination, items, planId } });
};

// 単発地名
export const geocodePlace = async (query, planId) => {
  const j = await apiFetch('geocode-place', { body: { query, planId } });
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
  const url = `${api('plan/state')}?${makeQueryString({ planId })}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`getPlanState failed: ${res.status}`);
  const j = await parseJsonSafe(res);
  return j ?? {};
};

// 旅程の修正
export async function revisePlan(planConditions, currentItinerary, instructions, planId) {
  return apiFetch('revise-plan', {
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
  return apiFetch('estimate-fare', { body: payload });
}
