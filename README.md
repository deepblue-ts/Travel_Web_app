# AI Travel Planner (React + Vite)

**公開版（GitHub Pages）**  
**https://deepblue-ts.github.io/Travel_Web_app/**

GitHub Pages（`/Travel_Web_app/` 配下）でホストしている、AI補助つきの旅行計画 Web アプリです。  
トップで規約同意 → プラン作成ウィザード → 生成中 → 結果閲覧まで、シンプルな導線で提供します。


## システム概要（かんたん説明）
- **フロントエンド**：React + Vite  
- **主要ページ**：
  - `TopPage` … 規約同意 → Start ボタン
  - `PlanWizard` … 出発地/目的地/日程/交通/予算/好みの入力
  - `GeneratingPlanPage` … 生成中インジケータ
  - `PlanResult` … 旅程カード & マップ表示
  - `TermsPage` / `PrivacyPage` … 規約・プライバシー
- **状態管理**：`contexts/PlanContext.jsx`
- **API 呼び出し**：`api/llmService.js`（バックエンド or エッジ/API サービスに接続）
- **GA4（任意）**：`VITE_GA_ID` を設定するとページビュー計測に対応

