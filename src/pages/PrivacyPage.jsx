// src/pages/PrivacyPage.jsx
import React, { useEffect } from "react";
import { trackEvent } from "../utils/analytics";

export default function PrivacyPage() {
  useEffect(() => {
    trackEvent("privacy_view");
  }, []);

  const goTop = () => (window.location.hash = "/");
  const goTerms = () => (window.location.hash = "/terms");

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
          プライバシーポリシー
        </h1>
        <p style={{ color: "#64748b", textAlign: "center", marginTop: 0 }}>
          最終更新日：2025-09-06
        </p>

        <section style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 20, marginBottom: 8 }}>1. 収集する情報</h2>
          <ul style={{ lineHeight: 1.9, paddingLeft: 18, margin: 0 }}>
            <li>操作ログ（ページ閲覧、クリック、画面遷移 等）</li>
            <li>技術情報（ブラウザ種別、OS、画面サイズ、リファラ 等）</li>
            <li>Cookie・識別子（GA4 等の解析用）</li>
          </ul>
        </section>

        <section>
          <h2 style={{ fontSize: 20, marginBottom: 8 }}>2. 利用目的</h2>
          <ul style={{ lineHeight: 1.9, paddingLeft: 18, margin: 0 }}>
            <li>本サービスの品質改善・機能改善のための分析</li>
            <li>障害調査・不正利用の防止</li>
            <li>利用体験の最適化（UI改善 等）</li>
          </ul>
        </section>

        <section>
          <h2 style={{ fontSize: 20, marginBottom: 8 }}>3. Google Analytics 4 について</h2>
          <p style={{ lineHeight: 1.8 }}>
            本サービスは Google LLC が提供する Google Analytics 4 を利用します。
            Google は収集した情報を用いて、本サービスの利用状況の測定・分析を行います。
            収集・処理の詳細は Google のポリシーをご確認ください。
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: 20, marginBottom: 8 }}>4. Cookie の管理</h2>
          <p style={{ lineHeight: 1.8 }}>
            ブラウザの設定により Cookie の拒否や削除が可能です。設定方法は各ブラウザのヘルプをご参照ください。
            Cookie を拒否した場合、サービスの一部機能が正しく動作しないことがあります。
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: 20, marginBottom: 8 }}>5. 第三者提供</h2>
          <p style={{ lineHeight: 1.8 }}>
            法令に基づく場合を除き、個人を直接特定できる情報を第三者へ提供することはありません。
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: 20, marginBottom: 8 }}>6. 政策の変更</h2>
          <p style={{ lineHeight: 1.8 }}>
            本ポリシーは必要に応じて改定される場合があります。重要な変更は本サービス上で告知します。
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
            onClick={goTerms}
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
            利用規約を見る
          </button>
        </div>

        <p style={{ color: "#94a3b8", fontSize: 12, marginTop: 14 }}>
          ※ 本文はサンプルであり、法的助言ではありません。必要に応じて専門家の確認をお勧めします。
        </p>
      </div>
    </div>
  );
}
