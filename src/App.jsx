// src/App.jsx
import { useState, useEffect } from "react";
import TopPage from "./pages/TopPage";
import PlanWizard from "./pages/PlanWizard";
import GeneratingPlanPage from "./pages/GeneratingPlanPage";
import PlanResult from "./pages/PlanResult";
import { usePlan } from "./contexts/PlanContext";
import { trackPageView, trackEvent } from "./utils/analytics";

// ステップごとの仮想パス＆タイトル（HashRouterでもGAには # を含めないパスを送る）
const PAGE_INFO = {
  0: { path: "/",           title: "Top — AI Travel Planner" },
  1: { path: "/wizard",     title: "Wizard — AI Travel Planner" },
  2: { path: "/generating", title: "Generating — AI Travel Planner" },
  3: { path: "/result",     title: "Result — AI Travel Planner" },
};

export default function App() {
  // 0: Top, 1: Wizard, 2: Generating, 3: Result
  const [step, setStep] = useState(0);
  const { loadingStatus, error, planJsonResult } = usePlan();

  // Hashから初期ステップを推定（直リンク対策）
  useEffect(() => {
    const h = (window.location.hash || "").replace(/^#/, "");
    if (h.startsWith("/wizard")) setStep(1);
    else if (h.startsWith("/generating")) setStep(2);
    else if (h.startsWith("/result")) setStep(3);
    else setStep(0);
  }, []);

  // 生成フローの画面遷移（★修正ポイント）
  useEffect(() => {
    // 結果が出たら、「生成中(step===2)」からだけ結果ページへ遷移
    if (planJsonResult && step === 2) {
      setStep(3);
      return;
    }
    // 生成中から中断/失敗したらウィザードへ戻す
    if (!loadingStatus?.active && step === 2) {
      if (error) {
        // 必要ならUI側で通知
        // alert(error);
      }
      setStep(1);
    }
  }, [planJsonResult, loadingStatus, error, step]);

  // ステップ変化時：Hashを更新し、GAにpage_view送信＆タイトル設定
  useEffect(() => {
    const { path, title } = PAGE_INFO[step] || PAGE_INFO[0];

    // タイトル
    if (title) document.title = title;

    // URLのHash（ユーザーの直リンク共有にも便利）
    const desiredHash = `#${path}`.replace("#//", "#/");
    if (window.location.hash !== desiredHash) {
      window.location.hash = desiredHash;
    }

    // GA: page_view
    trackPageView(path, title);
  }, [step]);

  const handleStart = () => {
    trackEvent("click_start");
    setStep(1); // Top -> Wizard
  };

  const handleBackToTop = () => {
    trackEvent("back_to_top");
    setStep(0); // どこからでも Top へ
  };

  // 「作成開始」を押した瞬間にローディング画面へ
  const handlePlanGenerationStart = () => {
    trackEvent("generate_plan_start");
    setStep(2); // Wizard -> Generating
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <PlanWizard
            onBack={handleBackToTop}
            onGenerateStart={handlePlanGenerationStart}
          />
        );
      case 2:
        return <GeneratingPlanPage />;
      case 3:
        return <PlanResult onBackToTop={handleBackToTop} />;
      default:
        return <TopPage onStart={handleStart} />;
    }
  };

  return <div style={{ minHeight: "100vh" }}>{renderStep()}</div>;
}
