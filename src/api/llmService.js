// src/api/llmService.js

// ===== Backend availability flag =====
export const API_BASE = import.meta.env.VITE_API_BASE || '';
export const API_ENABLED = !!API_BASE;

// URL組み立て（未設定でもここは throw しない）
const buildUrl = (path) => `${API_BASE}${path}`;

// 共通 POST（呼び出し時にだけチェック）
const postToApi = async (path, body) => {
  if (!API_ENABLED) {
    throw new Error('API is not configured yet (VITE_API_BASE is empty).');
  }
  const endpoint = buildUrl(path);
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    console.error(`API Error for ${endpoint}:`, j);
    throw new Error(j.error || `API call failed for ${endpoint}`);
  }
  return res.json();
};

// --- UI補助 ---
export const fetchAreasForDestination = async (destination, planId) => {
  if (!destination) return [];
  if (!API_ENABLED) return []; // ← セーフモード
  try {
    const response = await postToApi('/api/get-areas', { destination, planId });
    return response.areas || [];
  } catch (e) {
    console.error('エリア候補の取得に失敗:', e);
    return [];
  }
};

// --- リソーススカウター群 ---
export const findDiningOptions = (conditions, planId) =>
  postToApi('/api/find-dining', { ...conditions, planId });
export const findAccommodation = (conditions, planId) =>
  postToApi('/api/find-accommodation', { ...conditions, planId });
export const findActivities = (conditions, planId) =>
  postToApi('/api/find-activities', { ...conditions, planId });

// --- マスタープランナー ---
export const createMasterPlan = (planConditions, planId, constraints = {}) =>
  postToApi('/api/create-master-plan', { ...planConditions, planId, constraints });

// --- デイリースケジューラー（バッチ） ---
export const createDayPlans = (daysArray, planId, constraints = {}) =>
  postToApi('/api/create-day-plans', {
    days: (daysArray || []).map((d) => ({ ...d, constraints })),
    planId,
    constraints,
  });

// ===== Excel連携 =====
export const startPlanSession = (meta) => postToApi('/api/plan/start', meta);
export const logUser = (planId, items) =>
  postToApi('/api/plan/log-user', { planId, items });
export const logLLM = (planId, { agent, kind, summary, payload }) =>
  postToApi('/api/plan/log-llm', { planId, agent, kind, summary, payload });
export const logGeocode = (planId, results) =>
  postToApi('/api/plan/log-geocode', { planId, results });
export const finalizePlan = (planId, finalPlan) =>
  postToApi('/api/plan/finalize', { planId, finalPlan });

// 地図
export const geocodeItinerary = async (destination, itinerary, planId) => {
  if (!API_ENABLED) throw new Error('API disabled');
  const items = [];
  for (const day of itinerary) {
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
    const j = await res.json().catch(() => null);
    throw new Error(j?.error || `geocode-batch failed: ${res.status}`);
  }
  const data = await res.json();
  if (planId) {
    try {
      await logGeocode(planId, data.results);
    } catch {}
  }
  return data;
};

export const geocodePlace = async (name, planId) => {
  if (!API_ENABLED) throw new Error('API disabled');
  const endpoint = buildUrl('/api/geocode-batch');
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destination: '', items: [{ name }], planId }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    throw new Error(j?.error || `geocode-place failed: ${res.status}`);
  }
  const j = await res.json();
  if (planId && j?.results) {
    try {
      await logGeocode(planId, j.results);
    } catch {}
  }
  return j?.results?.[0] || null;
};

// 状態取得
export const getPlanState = async (planId) => {
  if (!API_ENABLED) throw new Error('API disabled');
  const endpoint = buildUrl(`/api/plan/state?planId=${encodeURIComponent(planId)}`);
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error(`getPlanState failed: ${res.status}`);
  return res.json();
};
