// src\api\llmService.js

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

// --- 各エージェント関数 ---

/**
 * おすすめのレストランを検索する
 * @param {object} plan - 旅行プランの条件
 */
export const findDiningOptions = (plan) => fetchFromApi('/api/find-dining', plan);

/**
 * おすすめの宿泊施設を検索する
 * @param {object} plan - 旅行プランの条件
 */
export const findAccommodation = (plan) => fetchFromApi('/api/find-accommodation', plan);

/**
 * おすすめのアクティビティを検索する
 * @param {object} plan - 旅行プランの条件
 */
export const findActivities = (plan) => fetchFromApi('/api/find-activities', plan);

/**
 * 特定の日の旅行プランを作成する
 * @param {object} dayPlanRequest - 1日のプラン作成に必要な情報
 */
export const createDayPlan = (dayPlanRequest) => fetchFromApi('/api/create-day-plan', dayPlanRequest);

/**
 * ★★★【新設】旅行の日ごとの地理的な骨格（エリア分け）を作成する ★★★
 * @param {object} planConditions - 目的地、日数、こだわり条件など
 */
export const createGeographicalPlan = (planConditions) => fetchFromApi('/api/create-geographical-plan', planConditions);


// --- LLMを利用してエリア候補を取得する新しい関数 ---

/**
 * 目的地に基づいたエリア候補と観光地情報をバックエンドAPIから取得する
 * @param {string} destination - ユーザーが入力した目的地 (例: "京都")
 * @returns {Promise<{name: string, spots: string[]}[]>} - エリア情報（名前と観光地リスト）の配列
 */
export const fetchAreasForDestination = async (destination) => {
  // 目的地が空、または未入力の場合はAPIを呼び出さずに空の配列を返す
  if (!destination) {
    return [];
  }
  
  console.log(`「${destination}」のエリアと観光地情報をAPIから検索中...`);
  try {
    // バックエンドに { destination: "目的地の名前" } という形式でPOSTリクエストを送信
    const response = await fetchFromApi('/api/get-areas', { destination });
    
    // バックエンドからのレスポンスは { areas: [{ name: "...", spots: [...] }] } という形式を期待
    // response.areasが存在すればその値を、なければ空配列を返すことでエラーを防ぐ
    return response.areas || [];
    
  } catch (error) {
    console.error("エリア候補の取得に失敗しました:", error);
    // エラーが発生した場合も、アプリケーションが停止しないように空配列を返す
    return [];
  }
};