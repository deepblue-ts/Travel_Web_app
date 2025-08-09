// src/api/llmService.js

const postToApi = async (endpoint, body) => {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'サーバーから不明なエラーが返されました。' }));
      console.error(`API Error for ${endpoint}:`, errorData);
      throw new Error(errorData.error || `API call failed for ${endpoint}`);
    }
    return response.json();
  } catch (error) {
    console.error(`Network or fetch error for ${endpoint}:`, error);
    throw error;
  }
};

// --- UI補助 ---
export const fetchAreasForDestination = async (destination) => {
  if (!destination) return [];
  try {
    const response = await postToApi('/api/get-areas', { destination });
    return response.areas || [];
  } catch (error) {
    console.error("エリア候補の取得に失敗しました:", error);
    return [];
  }
};

// --- リソーススカウター群 ---
export const findDiningOptions = (conditions) => postToApi('/api/find-dining', conditions);
export const findAccommodation = (conditions) => postToApi('/api/find-accommodation', conditions);
export const findActivities = (conditions) => postToApi('/api/find-activities', conditions);

// --- マスタープランナー ---
export const createMasterPlan = (planConditions) => postToApi('/api/create-master-plan', planConditions);

// --- デイリースケジューラー（バッチ） ---
export const createDayPlans = (daysArray) => postToApi('/api/create-day-plans', { days: daysArray });