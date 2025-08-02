// src/api/llmService.js

export const createTravelPlan = async (planData) => {
  try {
    const response = await fetch('/api/generate-plan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(planData),
    });

    if (!response.ok) {
      let errorInfo = `サーバーでエラーが発生しました (ステータス: ${response.status})。`;
      try {
        const errorData = await response.json();
        errorInfo = errorData.error || errorInfo;
      } catch (e) {
        console.error("レスポンスのJSONパースに失敗しました:", e);
      }
      throw new Error(errorInfo);
    }

    const result = await response.json();
    return result.plan;

  } catch (error) {
    console.error("プラン生成中にフロントエンドでエラーが発生しました:", error);
    throw error;
  }
};