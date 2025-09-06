// src/pages/TermsPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { trackEvent } from "../utils/analytics";

const LAST_UPDATED = "2025-09-06";
const SECTIONS = [
  { id: "scope",      title: "1. 適用" },
  { id: "definitions",title: "2. 用語の定義" },
  { id: "data",       title: "3. 収集する情報と利用目的" },
  { id: "respons",    title: "4. 利用者の責任" },
  { id: "prohibit",   title: "5. 禁止事項" },
  { id: "disclaimer", title: "6. 免責" },
  { id: "law",        title: "7. 準拠法・裁判管轄" },
  { id: "changes",    title: "8. 規約の変更" },
  { id: "contact",    title: "9. お問い合わせ" },
];

function getSectionParam() {
  const hash = window.location.hash || "";
  const qIndex = hash.indexOf("?");
  if (qIndex < 0) return null;
  const qs = new URLSearchParams(hash.slice(qIndex + 1));
  return qs.get("section");
}

export default function TermsPage() {
  const [active, setActive] = useState(SECTIONS[0].id);

  // クリックスクロール中は IntersectionObserver の書き換えを無効化するためのロック
  const clickScrollLockRef = useRef(false);
  const lockTimerRef = useRef(null);

  useEffect(() => {
    trackEvent("terms_view");
  }, []);

  // ハッシュ直リンク対応
  useEffect(() => {
    const applyFromHash = () => {
      const target = getSectionParam();
      if (!target) return;
      const el = document.getElementById(target);
      if (el) {
        // クリック時と同じ挙動に寄せる
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

  // スクロールに応じて現在地を更新（クリックスクロール中は無視）
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
      {
        // 画面上部寄りを優先。下のセクションに勝手に移らないよう余裕を持たせる
        root: null,
        rootMargin: "-10% 0px -70% 0px",
        threshold: 0.1,
      }
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
    // クリックした瞬間にハイライトを固定
    clickScrollLockRef.current = true;
    setActive(id);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    window.location.hash = `/terms?section=${id}`;
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
                href={`#/terms?section=${s.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  onTocClick(s.id);
                  trackEvent("terms_toc_click", { section: s.id });
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
  const goPrivacy = () => (window.location.hash = "/privacy");

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
              利用規約
            </h1>
            <p style={{ color: "#64748b", marginTop: 4, marginBottom: 0 }}>
              最終更新日：{LAST_UPDATED}
            </p>
          </header>

          <p style={{ color: "#334155", marginTop: 12 }}>
            本規約は、利用者の皆さまに安心してお使いいただくための基本ルールです。必ず最新の内容をご確認のうえご利用ください。
          </p>

          <Section id="scope" title="1. 適用">
            <p>
              本規約は、AI Travel Planner（以下「本サービス」）の利用条件を定めるものです。利用者は本規約に同意した上で本サービスを利用するものとします。
            </p>
          </Section>

          <Section id="definitions" title="2. 用語の定義">
            <dl style={dlStyle}>
              <dt>利用者</dt>
              <dd>本サービスを閲覧・操作・利用するすべての個人または法人。</dd>
              <dt>収集情報</dt>
              <dd>ページ閲覧・クリック等のイベント情報、端末・ブラウザ情報、Cookie 等の識別子。</dd>
              <dt>主要イベント</dt>
              <dd>サービス改善のため重要と定義した行動イベント（例：プラン生成開始）。</dd>
            </dl>
          </Section>

          <Section id="data" title="3. 収集する情報と利用目的">
            <ul style={ulStyle}>
              <li>
                本サービスは品質改善・障害解析のため、Google Analytics 4
                等の解析ツールで利用状況（page_view、クリック等）を取得する場合があります。
              </li>
              <li>
                収集情報は、UI/UX 改善、機能の追加・改善、異常検知、不正利用防止の目的で利用します。
              </li>
              <li>
                取得・保存・利用の詳細は
                <a
                  href="#/privacy"
                  style={{ color: "#00A59E", textDecoration: "underline" }}
                >
                  プライバシーポリシー
                </a>
                を参照してください。
              </li>
            </ul>
          </Section>

          <Section id="respons" title="4. 利用者の責任">
            <ul style={ulStyle}>
              <li>法令および本規約の遵守</li>
              <li>第三者の権利侵害（著作権・プライバシー等）の回避</li>
              <li>入力情報の正確性確保および自己の端末管理</li>
            </ul>
          </Section>

          <Section id="prohibit" title="5. 禁止事項">
            <ul style={ulStyle}>
              <li>不正アクセス、解析の妨害、スパム行為</li>
              <li>法令または公序良俗に反する行為</li>
              <li>ソースコードの不正取得、リバースエンジニアリング等</li>
            </ul>
          </Section>

          <Section id="disclaimer" title="6. 免責">
            <p>
              本サービスは「現状有姿」で提供されます。運営者は正確性、有用性、特定目的適合性等を保証せず、利用に起因する損害について法令で認められる限度で責任を負いません。
            </p>
          </Section>

          <Section id="law" title="7. 準拠法・裁判管轄">
            <p>
              本規約の準拠法は日本法とします。本サービスまたは本規約に関して紛争が生じた場合、運営者の所在地を管轄する裁判所を第一審の専属的合意管轄裁判所とします。
            </p>
          </Section>

          <Section id="changes" title="8. 規約の変更">
            <p>
              必要に応じて本規約を改定することがあります。重要な変更は本サービス上で告知します。改定後に本サービスを利用した場合、変更に同意したものとみなします。
            </p>
          </Section>

          <Section id="contact" title="9. お問い合わせ">
            <p>
              ご意見・お問い合わせは本サービス内の連絡先または運営者情報からご連絡ください。
            </p>
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
            <button onClick={() => (window.location.hash = "/")} style={btn("solid")}>
              トップへ戻る
            </button>
            <button onClick={() => (window.location.hash = "/privacy")} style={btn("outline")}>
              プライバシーポリシーを見る
            </button>
          </div>

          <p style={{ color: "#94a3b8", fontSize: 12, marginTop: 14 }}>
            ※ 本文はサンプルであり、法的助言ではありません。必要に応じて専門家の確認をお勧めします。
          </p>
        </main>
      </div>

      {/* セクション見出しのスクロール位置調整（上部に少し余白を確保） */}
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
const dlStyle = { margin: 0, paddingLeft: 0, lineHeight: 1.8 };
const ulStyle = { margin: 0, paddingLeft: 18, lineHeight: 1.9 };
