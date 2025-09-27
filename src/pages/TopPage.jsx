import React, { useEffect, useState } from "react";
import { trackEvent } from "../utils/analytics";
import { listMyPlans, removeMyPlan, makePlanUrl } from "../api/planstore";

export default function TopPage({ onStart }) {
  const [consented, setConsented] = useState(false);
  const [myPlans, setMyPlans] = useState([]);

  // 初回表示トラッキング＋過去の同意状態を復元＋保存プラン読込
  useEffect(() => {
    trackEvent("consent_view");
    try {
      const v = localStorage.getItem("atp_consent_v1");
      if (v === "true") setConsented(true);
    } catch (_) {}
    try {
      setMyPlans(listMyPlans());
    } catch (_) {}
  }, []);

  const handleToggle = (e) => {
    const checked = e.target.checked;
    setConsented(checked);
    trackEvent(checked ? "consent_checked" : "consent_unchecked");
  };

  const handleStart = () => {
    if (!consented) return;
    try {
      localStorage.setItem("atp_consent_v1", "true");
    } catch (_) {}
    trackEvent("consent_accept");
    onStart?.();
  };

  const handleRemovePlan = (readId) => {
    const next = removeMyPlan(readId);
    setMyPlans(next);
  };

  const handleCopyUrl = (readId) => {
    const url = makePlanUrl(readId);
    navigator.clipboard.writeText(url).then(
      () => alert("URLをコピーしました！\n" + url),
      () => window.prompt("このURLをコピーしてください", url)
    );
  };

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
          width: "min(780px, 92vw)",
          border: "1px solid #e6eaef",
          borderRadius: 16,
          padding: "36px 28px",
          boxShadow: "0 6px 24px rgba(0,0,0,0.06)",
        }}
      >
        <h1
          style={{
            color: "#00C0B8",
            fontSize: 44,
            lineHeight: 1.1,
            margin: 0,
            marginBottom: 8,
            textAlign: "center",
            fontWeight: 800,
          }}
        >
          AI Travel Planner
        </h1>

        <p
          style={{
            textAlign: "center",
            color: "#667085",
            marginTop: 0,
            marginBottom: 28,
            fontSize: 16,
          }}
        >
          より良い体験のために、利用状況（ページ閲覧・クリック、入力プロンプト等）を分析目的で収集します。
        </p>

        <div
          style={{
            background: "#f8fafc",
            border: "1px solid #eef2f7",
            borderRadius: 12,
            padding: 20,
            marginBottom: 20,
          }}
        >
          <label
            htmlFor="consent"
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              cursor: "pointer",
            }}
          >
            <input
              id="consent"
              type="checkbox"
              checked={consented}
              onChange={handleToggle}
              style={{ marginTop: 2, width: 18, height: 18, cursor: "pointer" }}
            />
            <span style={{ color: "#334155", fontSize: 15, lineHeight: 1.6 }}>
              上記のデータ収集に同意し、
              <a
                href="#/terms"
                style={{ color: "#00A59E", textDecoration: "underline" }}
              >
                利用規約
              </a>
              と
              <a
                href="#/privacy"
                style={{ color: "#00A59E", textDecoration: "underline" }}
              >
                プライバシーポリシー
              </a>
              を確認しました。
              <br />
              ※ 計測には Google Analytics 4 を使用します。詳細はポリシーをご参照ください。
            </span>
          </label>
        </div>

        <div style={{ textAlign: "center" }}>
          <button
            onClick={handleStart}
            disabled={!consented}
            style={{
              background: consented ? "#00C0B8" : "#9bdedb",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontSize: 20,
              padding: "14px 48px",
              fontWeight: 800,
              cursor: consented ? "pointer" : "not-allowed",
              transition: "transform 0.05s ease",
            }}
            onMouseDown={(e) => {
              if (consented) e.currentTarget.style.transform = "translateY(1px)";
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
            }}
            aria-disabled={!consented}
            aria-label="同意して開始"
          >
            Start
          </button>

          <div style={{ marginTop: 16, color: "#94a3b8", fontSize: 13 }}>
            ※ 同意はこのブラウザに保存されます（いつでも解除可）。
          </div>
        </div>

        {/* 最近保存したプラン */}
        {myPlans.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <h2 style={{ fontSize: 18, margin: "0 0 12px", color: "#0f172a" }}>
              最近保存したプラン
            </h2>
            <div style={{ display: "grid", gap: 10 }}>
              {myPlans.map((p) => {
                const hashUrl = `#/p/${p.readId}`; // そのままハッシュ遷移で開く
                const date = p.savedAt ? new Date(p.savedAt) : null;
                const when =
                  date && !isNaN(date) ? date.toLocaleString() : "";
                return (
                  <div
                    key={p.readId}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 10,
                      alignItems: "center",
                      border: "1px solid #e6eaef",
                      borderRadius: 10,
                      padding: "10px 12px",
                      background: "#fff",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>
                        {p.title || "無題プラン"}
                      </div>
                      {when && (
                        <div style={{ color: "#64748b", fontSize: 12 }}>
                          {when}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <a href={hashUrl} style={{ textDecoration: "none" }}>
                        <button
                          style={{
                            padding: "6px 10px",
                            borderRadius: 8,
                            border: "1px solid #cbd5e1",
                            background: "#f8fafc",
                          }}
                          title="閲覧ページを開く"
                        >
                          開く
                        </button>
                      </a>
                      <button
                        onClick={() => handleCopyUrl(p.readId)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 8,
                          border: "1px solid #cbd5e1",
                          background: "#f8fafc",
                        }}
                        title="共有用リンクをコピー"
                      >
                        リンクをコピー
                      </button>
                      <button
                        onClick={() => handleRemovePlan(p.readId)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 8,
                          border: "1px solid #fecaca",
                          background: "#fff1f2",
                          color: "#b91c1c",
                        }}
                        title="この一覧から削除（サーバからは削除されません）"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
