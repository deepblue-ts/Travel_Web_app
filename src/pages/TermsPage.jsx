// src/pages/TermsPage.jsx
import React, { useEffect } from "react";
import { trackEvent } from "../utils/analytics";

export default function TermsPage() {
  useEffect(() => {
    trackEvent("terms_view");
  }, []);

  const goTop = () => (window.location.hash = "/");
  const goPrivacy = () => (window.location.hash = "/privacy");

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#fff",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "min(900px, 94vw)",
          border: "1px solid #e6eaef",
          borderRadius: 16,
          padding: "32px 28px",
          boxShadow: "0 6px 24px rgba(0,0,0,0.06)",
          color: "#0f172a",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <h1
          style={{
            color: "#00C0B8",
            fontSize: 36,
            lineHeight: 1.2,
            margin: 0,
            marginBottom: 12,
            fontWeight: 800,
            textAlign: "center",
          }}
        >
          利用規約
        </h1>
        <p style={{ color: "#64748b", textAlign: "center", marginTop: 0 }}>
          最終更新日：2025-09-06
        </p>

        <section style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 20, marginBottom: 8 }}>1. 適用</h2>
          <p style={{ lineHeight: 1.8 }}>
            本規約は、AI Travel Planner（以下「本サービス」）の利用に関する条件を定めるものです。利用者は、本規約に同意のうえ本サービスを利用するものとします。
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: 20, marginBottom: 8 }}>2. 収集する情報</h2>
          <p style={{ lineHeight: 1.8 }}>
            本サービスは利用状況の把握・機能改善のため、Google Analytics 4 等の解析ツールを用いて、
            ページ閲覧・クリックなどのイベント情報、ブラウザ・端末に関する情報、Cookie 等の識別子を収集する場合があります。
            収集・利用の詳細は
            <a
              href="#/privacy"
              style={{ color: "#00A59E", textDecoration: "underline" }}
            >
              プライバシーポリシー
            </a>
            をご確認ください。
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: 20, marginBottom: 8 }}>3. 利用者の責任</h2>
          <ul style={{ lineHeight: 1.9, paddingLeft: 18, margin: 0 }}>
            <li>正確な情報の入力・法令の遵守</li>
            <li>第三者の権利侵害（著作権・プライバシー等）の回避</li>
            <li>アカウント・端末の適切な管理（該当する場合）</li>
          </ul>
        </section>

        <section>
          <h2 style={{ fontSize: 20, marginBottom: 8 }}>4. 禁止事項</h2>
          <ul style={{ lineHeight: 1.9, paddingLeft: 18, margin: 0 }}>
            <li>不正アクセス、解析の妨害、スパム行為</li>
            <li>法令・公序良俗に反する利用</li>
            <li>リバースエンジニアリング等、ソース解析目的の行為</li>
          </ul>
        </section>

        <section>
          <h2 style={{ fontSize: 20, marginBottom: 8 }}>5. 免責</h2>
          <p style={{ lineHeight: 1.8 }}>
            本サービスは「現状有姿」で提供されます。運営者は、正確性・有用性・特定目的適合性等を保証せず、
            利用により生じた損害について、法令で認められる限度で責任を負いません。
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: 20, marginBottom: 8 }}>6. 規約の変更</h2>
          <p style={{ lineHeight: 1.8 }}>
            本規約は必要に応じて改定されることがあります。重要な変更は本サービス上で告知します。
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: 20, marginBottom: 8 }}>7. お問い合わせ</h2>
          <p style={{ lineHeight: 1.8 }}>
            ご意見・お問い合わせはアプリ内の連絡先または運営者情報からご連絡ください。
          </p>
        </section>

        <div
          style={{
            marginTop: 28,
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            justifyContent: "center",
          }}
        >
          <button
            onClick={goTop}
            style={{
              background: "#00C0B8",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontSize: 16,
              padding: "10px 20px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            トップへ戻る
          </button>
          <button
            onClick={goPrivacy}
            style={{
              background: "#eef2f7",
              color: "#0f172a",
              border: "1px solid #e6eaef",
              borderRadius: 10,
              fontSize: 16,
              padding: "10px 20px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            プライバシーポリシーを見る
          </button>
        </div>

        <p style={{ color: "#94a3b8", fontSize: 12, marginTop: 14 }}>
          ※ 本文はサンプルであり、法的助言ではありません。必要に応じて専門家の確認をお勧めします。
        </p>
      </div>
    </div>
  );
}
