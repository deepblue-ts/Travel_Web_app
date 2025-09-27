// src/App.jsx
import { useState, useEffect } from "react";
import TopPage from "./pages/TopPage";
import PlanWizard from "./pages/PlanWizard";
import GeneratingPlanPage from "./pages/GeneratingPlanPage";
import PlanResult from "./pages/PlanResult";
import TermsPage from "./pages/TermsPage";
import PrivacyPage from "./pages/PrivacyPage";
import PlanViewer from "./pages/PlanViewer";            // ★ 追加
import { usePlan } from "./contexts/PlanContext";
import { trackPageView, trackEvent } from "./utils/analytics";

// ステップごとの仮想パス＆タイトル（HashRouterでもGAには # を含めないパスを送る）
const PAGE_INFO = {
  0:  { path: "/",           title: "Top — AI Travel Planner" },
  1:  { path: "/wizard",     title: "Wizard — AI Travel Planner" },
  2:  { path: "/generating", title: "Generating — AI Travel Planner" },
  3:  { path: "/result",     title: "Result — AI Travel Planner" },
  4:  { path: "/p/:readId",  title: "Plan — AI Travel Planner" }, // ★ 追加（ダミー定義）
  10: { path: "/terms",      title: "利用規約 — AI Travel Planner" },
  11: { path: "/privacy",    title: "プライバシーポリシー — AI Travel Planner" },
};

export default function App() {
  // 0: Top, 1: Wizard, 2: Generating, 3: Result, 4: Viewer, 10: Terms, 11: Privacy
  const [step, setStep] = useState(0);
  const [viewerReadId, setViewerReadId] = useState("");   // ★ 追加
  const { loadingStatus, error, planJsonResult } = usePlan();

  // ハッシュ文字列から /p/:readId を抽出
  const parseReadIdFromHash = () => {
    const h = (window.location.hash || "").replace(/^#/, "");
    const m = h.match(/^\/p\/([^/?#]+)/);
    return m?.[1] || "";
  };

  // Hash → step へ反映（初期化＋ハッシュ遷移対応）
  useEffect(() => {
    const applyFromHash = () => {
      const h = (window.location.hash || "").replace(/^#/, "");
      if (h.startsWith("/p/")) {
        const id = parseReadIdFromHash();
        setViewerReadId(id);
        setStep(4); // Viewer
      } else if (h.startsWith("/wizard")) setStep(1);
      else if (h.startsWith("/generating")) setStep(2);
      else if (h.startsWith("/result")) setStep(3);
      else if (h.startsWith("/terms")) setStep(10);
      else if (h.startsWith("/privacy")) setStep(11);
      else setStep(0);
    };
    applyFromHash();
    window.addEventListener("hashchange", applyFromHash);
    return () => window.removeEventListener("hashchange", applyFromHash);
  }, []);

  // 生成フローの画面遷移（結果は「生成中(step===2)」からだけ遷移）
  useEffect(() => {
    if (planJsonResult && step === 2) {
      setStep(3);
      return;
    }
    if (!loadingStatus?.active && step === 2) {
      if (error) {
        // 必要なら通知など
      }
      setStep(1);
    }
  }, [planJsonResult, loadingStatus, error, step]);

  // ステップ変化時：Hashを更新し、GAにpage_view送信＆タイトル設定
  useEffect(() => {
    // Viewer は動的IDなので、固定の desiredHash 書き換えはスキップ
    if (step === 4) {
      const path = `/p/${viewerReadId || ""}`;
      const title = `Plan — AI Travel Planner`;
      document.title = title;
      trackPageView(path, title);
      return;
    }

    const { path, title } = PAGE_INFO[step] || PAGE_INFO[0];

    // タイトル
    if (title) document.title = title;

    // URLのHash（共有・直リンクにも対応）
    const desiredHash = `#${path}`.replace("#//", "#/");
    if (window.location.hash !== desiredHash) {
      window.location.hash = desiredHash;
    }

    // GA: page_view
    trackPageView(path, title);
  }, [step, viewerReadId]);

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
      case 4: // ★ 追加：PlanViewer
        return <PlanViewer readId={viewerReadId} />;
      case 10:
        return <TermsPage />;
      case 11:
        return <PrivacyPage />;
      default:
        return <TopPage onStart={handleStart} />;
    }
  };

  return <div style={{ minHeight: "100vh" }}>{renderStep()}</div>;
}
