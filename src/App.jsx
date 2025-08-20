// src/App.jsx
// ページの切り替え（ルーター役）
import { useState, useEffect } from "react";
import TopPage from "./pages/TopPage";
import PlanWizard from "./pages/PlanWizard";
import GeneratingPlanPage from "./pages/GeneratingPlanPage";
import PlanResult from "./pages/PlanResult";
import { usePlan } from "./contexts/PlanContext";

export default function App() {
  // 0: Top, 1: Wizard, 2: Generating, 3: Result
  const [step, setStep] = useState(0);
  const { loadingStatus, error, planJsonResult } = usePlan();

  // 生成フローの画面遷移
  useEffect(() => {
    // 結果ができたら必ず結果ページへ
    if (planJsonResult) {
      setStep(3);
      return;
    }

    // 生成中ページ（step=2）なのに active=false になった = 何らかの中断/エラー
    if (!loadingStatus.active && step === 2) {
      if (error) {
        // 必要ならここで通知
        // alert(error);
      }
      setStep(1); // Wizardに戻す
    }
  }, [planJsonResult, loadingStatus.active, error, step]);

  const handleStart = () => setStep(1);
  const handleBackToTop = () => setStep(0);

  // 「作成開始」を押した瞬間にローディング画面へ
  const handlePlanGenerationStart = () => {
    setStep(2);
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
