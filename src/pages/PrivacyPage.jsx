// src/pages/PrivacyPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { trackEvent } from "../utils/analytics";

const LAST_UPDATED = "2025-09-06";
const SECTIONS = [
  { id: "collect",    title: "1. 収集する情報" },
  { id: "purpose",    title: "2. 利用目的" },
  { id: "ga4",        title: "3. 解析ツール（Google Analytics 4）" },
  { id: "cookie",     title: "4. Cookie と同意管理" },
  { id: "retention",  title: "5. 保存期間" },
  { id: "thirdparty", title: "6. 第三者提供" },
  { id: "security",   title: "7. 安全管理措置" },
  { id: "rights",     title: "8. ユーザーの権利（閲覧・削除 など）" },
  { id: "changes",    title: "9. ポリシーの変更" },
  { id: "contact",    title: "10. お問い合わせ" },
];

function getSectionParam() {
  const hash = window.location.hash || "";
  const qIndex = hash.indexOf("?");
  if (qIndex < 0) return null;
  const qs = new URLSearchParams(hash.slice(qIndex + 1));
  return qs.get("section");
}

export default function PrivacyPage() {
  const [active, setActive] = useState(SECTIONS[0].id);
  const clickScrollLockRef = useRef(false);
  const lockTimerRef = useRef(null);

  useEffect(() => {
    trackEvent("privacy_view");
  }, []);

  useEffect(() => {
    const applyFromHash = () => {
      const target = getSectionParam();
      if (!target) return;
      const el = document.getElementById(target);
      if (el) {
        clickScrollLockRef.current = true;
        setActive(target);
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        clearTimeout(lockTimerRef.current);
        lockTimerRef.current = setTimeout(() => {
          clickScrollLockRef.current = false;
        }, 700);
      }
    };
    applyFromHash();
    window.addEventListener("hashchange", applyFromHash);
    return () => window.removeEventListener("hashchange", applyFromHash);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (clickScrollLockRef.current) return;
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          const id = visible[0].target.id;
          setActive(id);
        }
      },
      { root: null, rootMargin: "-10% 0px -70% 0px", threshold: 0.1 }
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => clearTimeout(lockTimerRef.current), []);

  const onTocClick = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    clickScrollLockRef.current = true;
    setActive(id); // クリック直後にハイライト
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    window.location.hash = `/privacy?section=${id}`;
    clearTimeout(lockTimerRef.current);
    lockTimerRef.current = setTimeout(() => {
      clickScrollLockRef.current = false;
    }, 700);
  };

  const Toc = useMemo(
    () => (
      <div
        style={{
          position: "sticky",
          top: 16,
          border: "1px solid #e6eaef",
          borderRadius: 12,
          padding: "14px 14px",
          background: "#ffffff",
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 8, color: "#0f172a" }}>
          目次
        </div>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {SECTIONS.map((s) => (
            <li key={s.id} style={{ marginBottom: 6 }}>
              <a
                href={`#/privacy?section=${s.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  onTocClick(s.id);
                  trackEvent("privacy_toc_click", { section: s.id });
                }}
                style={{
                  color: active === s.id ? "#00A59E" : "#334155",
                  textDecoration: active === s.id ? "underline" : "none",
                  fontWeight: active === s.id ? 800 : 600,
                }}
              >
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </div>
    ),
    [active]
  );

  const goTop = () => (window.location.hash = "/");
  const goTerms = () => (window.location.hash = "/terms");

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#fff",
        padding: "24px 16px",
        display: "grid",
        justifyItems: "center",
      }}
    >
      <div
        style={{
          width: "min(1100px, 96vw)",
          display: "grid",
          gridTemplateColumns: "280px 1fr",
          gap: 20,
        }}
      >
        <aside style={{ display: "block" }}>{Toc}</aside>

        <main
          style={{
            border: "1px solid #e6eaef",
            borderRadius: 16,
            padding: "28px 26px",
            boxShadow: "0 6px 24px rgba(0,0,0,0.06)",
            color: "#0f172a",
            fontFamily:
              "system-ui, -apple-system, Segoe UI, Roboto, 'Noto Sans JP', sans-serif",
          }}
        >
          <header style={{ marginBottom: 8 }}>
            <h1
              style={{
                color: "#00C0B8",
                fontSize: 36,
                margin: 0,
                lineHeight: 1.2,
                fontWeight: 800,
                textAlign: "left",
              }}
            >
              プライバシーポリシー
            </h1>
            <p style={{ color: "#64748b", marginTop: 4, marginBottom: 0 }}>
              最終更新日：{LAST_UPDATED}
            </p>
          </header>

          <p style={{ color: "#334155", marginTop: 12 }}>
            利用者のプライバシーを尊重し、適切な保護と透明性を重視します。本ポリシーでは、収集情報・目的・管理方法について説明します。
          </p>

          <Section id="collect" title="1. 収集する情報">
            <ul style={ulStyle}>
              <li>操作ログ（ページ閲覧、クリック、画面遷移 等）</li>
              <li>技術情報（ブラウザ種別、OS、画面サイズ、リファラ 等）</li>
              <li>Cookie・識別子（解析・セッション管理 など）</li>
              <li>お問い合わせ内容（任意、該当する場合）</li>
            </ul>
          </Section>

          <Section id="purpose" title="2. 利用目的">
            <ul style={ulStyle}>
              <li>サービスの品質向上・機能改善・利便性向上のための分析</li>
              <li>障害解析・セキュリティ確保・不正利用防止</li>
              <li>利用動向の把握（操作の集中箇所、離脱点 等）</li>
            </ul>
          </Section>

          <Section id="ga4" title="3. 解析ツール（Google Analytics 4）">
            <p>
              本サービスは Google Analytics 4（GA4）を使用して、匿名化された統計情報を収集・分析します。収集された情報は Google により保管・処理され、本サービスの利用状況の測定・分析に活用されます。
            </p>
          </Section>

          <Section id="cookie" title="4. Cookie と同意管理">
            <ul style={ulStyle}>
              <li>
                同意はトップ画面で取得・保存します（ブラウザの
                <code style={codeStyle}>localStorage.atp_consent_v1</code>）。
              </li>
              <li>
                ブラウザ設定で Cookie を制御・削除できますが、一部機能が正しく動作しない場合があります。
              </li>
            </ul>
          </Section>

          <Section id="retention" title="5. 保存期間">
            <p>
              収集されたデータは、目的達成に必要な期間保存した後、適切に削除または匿名化します。保存期間は運用上の必要に応じて変更されることがあります。
            </p>
          </Section>

          <Section id="thirdparty" title="6. 第三者提供">
            <p>
              法令に基づく場合を除き、個人を直接特定できる情報を第三者へ提供しません。解析に用いる統計情報は匿名化または集計化された形式で扱われます。
            </p>
          </Section>

          <Section id="security" title="7. 安全管理措置">
            <p>
              不正アクセスや情報漏えいを防止するため、アクセス制御、脆弱性対策、ログ監視等の適切な安全管理措置を講じます。
            </p>
          </Section>

          <Section id="rights" title="8. ユーザーの権利（閲覧・削除 など）">
            <p>
              ユーザーは、保有データに関する確認・訂正・削除等の請求を行うことができます（対応範囲は法令・運用ポリシーに準拠）。問い合わせ先は本ページ末尾をご参照ください。
            </p>
          </Section>

          <Section id="changes" title="9. ポリシーの変更">
            <p>
              本ポリシーは必要に応じて改定する場合があります。重要な変更は本サービス上で告知します。改定後の継続利用により、変更に同意したものとみなします。
            </p>
          </Section>

          <Section id="contact" title="10. お問い合わせ">
            <p>ご意見・お問い合わせはアプリ内の連絡先または運営者情報からご連絡ください。</p>
          </Section>

          <div
            style={{
              marginTop: 32,
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              justifyContent: "center",
            }}
          >
            <button onClick={goTop} style={btn("solid")}>
              トップへ戻る
            </button>
            <button onClick={goTerms} style={btn("outline")}>
              利用規約を見る
            </button>
          </div>

          <p style={{ color: "#94a3b8", fontSize: 12, marginTop: 14 }}>
            ※ 本文はサンプルであり、法的助言ではありません。必要に応じて専門家の確認をお勧めします。
          </p>
        </main>
      </div>

      <style>{`
        section { scroll-margin-top: 16px; }
      `}</style>
    </div>
  );
}

function Section({ id, title, children }) {
  return (
    <section id={id} style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 22, margin: 0, color: "#0f172a", marginBottom: 10 }}>
        {title}
      </h2>
      <div style={{ lineHeight: 1.8 }}>{children}</div>
    </section>
  );
}

function btn(variant) {
  const base = {
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 800,
    padding: "8px 14px",
    cursor: "pointer",
  };
  if (variant === "solid")
    return { ...base, background: "#00C0B8", color: "#fff", border: "none" };
  if (variant === "outline")
    return {
      ...base,
      background: "#ffffff",
      color: "#0f172a",
      border: "1px solid #e6eaef",
    };
  return base;
}
const ulStyle = { margin: 0, paddingLeft: 18, lineHeight: 1.9 };
const codeStyle = {
  background: "#f1f5f9",
  padding: "0 4px",
  borderRadius: 4,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: 13,
};
