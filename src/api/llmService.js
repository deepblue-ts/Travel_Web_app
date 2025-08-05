// src/api/llmService.js

/**
 * バックエンドAPIを呼び出す共通関数
 * @param {string} endpoint - APIのエンドポイント (例: '/api/find-dining')
 * @param {object} body - POSTリクエストで送信するデータ
 */
const fetchFromApi = async (endpoint, body) => {
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
    throw error; // エラーを再スローして呼び出し元でキャッチできるようにする
  }
};

// --- 各エージェント関数を、実際のAPI呼び出しに置き換え ---

export const findDiningOptions = (plan) => fetchFromApi('/api/find-dining', plan);

export const findAccommodation = (plan) => fetchFromApi('/api/find-accommodation', plan);

export const findActivities = (plan) => fetchFromApi('/api/find-activities', plan);

// 新しい1日プラン作成APIを呼び出す関数
export const createDayPlan = (dayPlanRequest) => fetchFromApi('/api/create-day-plan', dayPlanRequest);


// --- 既存のエリア取得API (ここはモックのまま) ---
export const fetchAreasForDestination = async (destination) => {
  console.log(`「${destination}」のエリアを検索中...`);
  const areaDatabase = {
    "京都": ["祇園・清水寺", "嵐山・嵯峨野", "金閣寺周辺", "京都駅周辺"],
    "箱根": ["箱根湯本", "強羅", "仙石原", "芦ノ湖・元箱根"],
    "沖縄": ["那覇市内", "恩納村", "美ら海水族館周辺", "石垣島"],
    "札幌": ["大通公園", "すすきの", "札幌駅周辺", "定山渓温泉"],
  };

  return new Promise(resolve => {
    setTimeout(() => {
      resolve(areaDatabase[destination] || []);
    }, 1000); // 1秒の遅延をシミュレート
  });
};