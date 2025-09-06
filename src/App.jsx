// src/App.jsx
import { useState, useEffect } from "react";
import TopPage from "./pages/TopPage";
import PlanWizard from "./pages/PlanWizard";
import GeneratingPlanPage from "./pages/GeneratingPlanPage";
import PlanResult from "./pages/PlanResult";
import { usePlan } from "./contexts/PlanContext";
import { trackPageView } from "./utils/analytics";

const STEP_PATH = {
  0: "/",
  1: "/wizard",
  2: "/generating",
  3: "/result",
};

const STEP_TITLE = {
  0: "Top",
  1: "Plan Wizard",
  2: "Generating Plan",
  3: "Plan Result",
};

export default function App() {
  // 0: Top, 1: Wizard, 2: Generating, 3: Result
  const [step, setStep] = useState(0);
  const { loadingStatus, error, planJsonResult } = usePlan();

  // 生成フローの画面遷移
  useEffect(() => {
    if (planJsonResult) {
      setStep(3);
      return;
    }
    if (!loadingStatus.active && step === 2) {
      if (error) {
        // 必要なら通知
        // alert(error);
      }
      setStep(1);
    }
  }, [planJsonResult, loadingStatus.active, error, step]);

  // step 変化時：URLハッシュ同期 & GA page_view 送信
  useEffect(() => {
    const path = STEP_PATH[step] ?? "/";
    const title = `AI Travel Planner - ${STEP_TITLE[step] ?? "Page"}`;

    // HashRouter 用にハッシュも更新（リロード/直リンクに強くなる）
    const targetHash = `#${path}`;
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash; // リロードは発生しない
    }

    // GA4 に仮想ページビュー送信
    trackPageView(path, title);
  }, [step]);

  const handleStart = () => setStep(1);
  const handleBackToTop = () => setStep(0);
  const handlePlanGenerationStart = () => setStep(2);

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
