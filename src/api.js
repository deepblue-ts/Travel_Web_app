// src/api.js

// ダミーAPI: 入力内容を元にフェイクプランを返す
export async function fetchTravelPlan({ origin, destination, days, budget }) {
  // 通常はここで fetch("/api/plan", {...}) など
  // ↓ダミー応答
  await new Promise((r) => setTimeout(r, 1000)); // 1秒遅延（ローディング体験用）
  return {
    summary: `${origin}から${destination}への${days}日間の旅行プラン（予算: ${budget}円）`,
    plan: [
      `1日目: ${origin} 出発 → ${destination} 到着・観光`,
      `2日目: ${destination} 市内観光`,
      `3日目: ${destination} 発 → ${origin} 帰着`
    ]
  };
}

// このファイルにAPI関連の関数をまとめていきます

/**
 * 目的地に基づいて関連エリアの候補を非同期で取得する（擬似的な実装）
 * @param {string} destination - ユーザーが入力した目的地
 * @returns {Promise<string[]>} - エリア名の配列を返すPromise
 */
export const fetchAreasForDestination = async (destination) => {
  console.log(`「${destination}」のエリアを検索中...`);
  
  // 本来はここでバックエンドAPIを呼び出し、DBなどからデータを取得します
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