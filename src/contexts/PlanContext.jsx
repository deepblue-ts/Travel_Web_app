import { createContext, useContext, useState } from "react";
import moment from 'moment'; // 日数計算のためにmoment.jsをインポート

// api/llmService.js から利用するAPI関数をインポート
// ★ 新しいAPI createGeographicalPlan を追加
import { 
  createGeographicalPlan,
  findDiningOptions, 
  findAccommodation, 
  findActivities,
  createDayPlan 
} from '../api/llmService';

const PlanContext = createContext();

export function PlanProvider({ children }) {
  // ユーザーがウィザードで入力するプランの情報
  const [plan, setPlan] = useState({
    origin: "",
    destination: "",
    areas: [],
    dates: { start: null, end: null },
    transport: "public",
    budget: 50000,
    preferences: "", // こだわり条件
  });

  // LLMが生成したプランの結果
  const [planJsonResult, setPlanJsonResult] = useState(null);
  
  // エラー情報
  const [error, setError] = useState(null);
  
  // ローディング状態（進捗メッセージと進捗率）
  const [loadingStatus, setLoadingStatus] = useState({
    active: false,
    message: "",
    progress: 0,
  });

  /**
   * AIによる旅行プランを生成するメイン関数。
   * 「地理プランナー」と「デイリー・スケジューラー」の2段階構成でプランを生成する。
   */
  const generatePlan = async () => {
    setLoadingStatus({ active: true, message: "プランニングの準備をしています...", progress: 0 });
    setError(null);
    setPlanJsonResult(null); // 前回の結果をクリア

    try {
      // --- 日数計算 ---
      const startDate = moment(plan.dates.start);
      const endDate = moment(plan.dates.end);
      if (!startDate.isValid() || !endDate.isValid() || endDate.isBefore(startDate)) {
        throw new Error("旅行の日程が正しく設定されていません。");
      }
      const duration = endDate.diff(startDate, 'days') + 1;

      // ★★★ フェーズ0: 地理プランニング (新設) ★★★
      setLoadingStatus({ active: true, message: "旅行の骨格を組み立てています...", progress: 5 });

      // 地理プランナーAPIを呼び出し、日ごとのエリア計画を立てさせる
      const geoPlanResponse = await createGeographicalPlan({
        destination: plan.destination,
        duration: duration,
        preferences: plan.preferences, // こだわり条件も渡す
      });
      const geographicalPlan = geoPlanResponse.geographical_plan;
      
      if (!geographicalPlan || geographicalPlan.length === 0) {
        throw new Error("旅行の基本計画（エリア分け）を作成できませんでした。");
      }

      // ★★★ フェーズ1: "エリア特化型"リソース確保 ★★★
      setLoadingStatus({ active: true, message: "各エリアのおすすめスポットを収集中...", progress: 15 });
      
      // 各日のリソース（食事、宿、アクティビティ）を格納するオブジェクト
      const resourcesByDay = {};
      for (const dayPlan of geographicalPlan) {
        const dayIndex = dayPlan.day;
        const area = dayPlan.area;

        // planオブジェクトに「現在のエリア」情報を一時的に追加してAPIに渡す
        const areaSpecificPlanConditions = { ...plan, currentArea: area };

        // 各エリアに特化した情報を並列で取得
        const [dining, accommodation, activities] = await Promise.all([
          findDiningOptions(areaSpecificPlanConditions),
          findAccommodation(areaSpecificPlanConditions),
          findActivities(areaSpecificPlanConditions)
        ]);
        resourcesByDay[dayIndex] = { dining, accommodation, activities };
      }

      // ★★★ フェーズ2: 日毎のタイムスケジュール作成 ★★★
      let finalItinerary = [];
      let previousItinerary = null;

      for (const dayPlan of geographicalPlan) {
        const currentDay = dayPlan.day;
        // 進捗を計算（30%〜90%の範囲を使用）
        const progress = 30 + Math.round((60 / duration) * (currentDay -1));
        setLoadingStatus({ active: true, message: `${currentDay}日目（${dayPlan.area}）のプランを作成中...`, progress });

        // デイリー・スケジューラーに渡すリクエストデータ
        const dayPlanRequest = {
          day: currentDay,
          planConditions: plan,
          availableResources: resourcesByDay[currentDay], // その日のエリアに特化したリソース
          previousItinerary,
          area: dayPlan.area, // その日のエリアを明確に指示
          theme: dayPlan.theme, // その日のテーマを明確に指示
        };

        const dayPlanData = await createDayPlan(dayPlanRequest);

        finalItinerary.push(dayPlanData);
        previousItinerary = finalItinerary; // 次の日のために、これまでの全旅程を渡す
      }
      
      // ★★★ フェーズ3: 最終化 ★★★
      setLoadingStatus({ active: true, message: "最終仕上げをしています...", progress: 95 });

      const finalJson = {
        title: `${plan.destination}への${duration}日間の旅`,
        introduction: "あなただけの特別な旅行プランが完成しました！最高の旅を楽しんできてくださいね。",
        itinerary: finalItinerary,
        conclusion: "この旅が、あなたにとって忘れられない素晴らしい思い出になりますように。"
      };
      
      setPlanJsonResult(finalJson);
      setLoadingStatus({ active: true, message: "完成！", progress: 100 });

    } catch (err) {
      console.error("PlanContextでのエラー:", err);
      setError(err.message || "プランの生成中に不明なエラーが発生しました。");
      setLoadingStatus({ active: false, message: "", progress: 0 });
    }
  };

  const value = {
    plan,
    setPlan,
    planJsonResult,
    error,
    loadingStatus,
    generatePlan,
  };

  return (
    <PlanContext.Provider value={value}>
      {children}
    </PlanContext.Provider>
  );
}

export function usePlan() {
  return useContext(PlanContext);
}