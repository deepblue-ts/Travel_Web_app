// src/contexts/PlanContext.jsx
import { createContext, useContext, useState } from "react";
import moment from "moment";
import {
  // LLM agents (+ planId を必ず付与)
  createMasterPlan,
  findDiningOptions,
  findAccommodation,
  findActivities,
  createDayPlans,
  // Excel logging lifecycle
  startPlanSession,
  logUser,
  finalizePlan,
  // Geocoding (Excel にも保存される)
  geocodeItinerary,
  geocodePlace,
  // 修正＆運賃見積り
  revisePlan,
  estimateFare,
} from "../api/llmService";

const PlanContext = createContext();

/* ─────────────────────────────────────────────
   ヘルパー
   ───────────────────────────────────────────── */

// 宿らしさ判定（ゆるめ）
const LODGING_RE =
  /(ホテル|旅館|民宿|ゲストハウス|ホステル|温泉宿|イン|ロッジ|コテージ|チェックイン|宿泊)/;

// “こだわり条件”の簡易解釈
function interpretPreferences(text = "") {
  const t = String(text);
  const noReturn =
    /(現地解散|帰らない|片道|ワンウェイ|one[-\s]?way)/i.test(t);
  const nightMove =
    /(夜移動|夜行|ナイトバス|深夜高速|深夜移動)/.test(t);
  return { noReturn, nightMove };
}

// 価格文字列 → number
const yen = (v) => {
  const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
};
const fmtYen = (n) =>
  Number.isFinite(n) && n > 0 ? `${Math.round(n).toLocaleString()}円` : "";

// Googleマップ経路リンク
function buildGmapsDirectionsUrl(origin, destination, transport) {
  const mode = transport === "public" ? "transit" : "driving";
  const o = encodeURIComponent(origin || "");
  const d = encodeURIComponent(destination || "");
  return `https://www.google.com/maps/dir/?api=1&origin=${o}&destination=${d}&travelmode=${mode}`;
}

/**
 * 単一目的地モードのための正規化
 *  - 全日 area を destination に統一
 *  - 宿を可能な限り同一施設に統一（最初に出現した宿を基準に）
 *  - Day1 先頭に「origin→destination の移動」を必ず入れる（skip_map:true）
 *  - 中日（Day2..DayN-1）は travel を削除
 *  - 最終日に「destination→origin の移動」を末尾に入れる（skip_map:true／“現地解散”なら入れない）
 *  - 最終日に帰路がある場合は宿泊を除外
 *  - 1日に複数の宿があれば最初の1件だけ残す
 *  - 往路/復路の価格を統一（片方に数値があれば両方に反映）
 */
function normalizeSingleDestinationPlan(
  itinerary,
  { origin, destination, preferences }
) {
  if (!Array.isArray(itinerary)) return itinerary;

  const { noReturn, nightMove } = interpretPreferences(preferences);

  // 1) area を destination に統一
  const days = itinerary.map((d) => ({ ...d, area: destination || d.area }));
  const lastIndex = Math.max(0, days.length - 1);

  // 2) ベース宿の決定（最初に出現した宿）
  let baseHotel = null;
  for (const d of days) {
    for (const s of d.schedule || []) {
      const name = (s.activity_name || "").trim();
      const desc = s.description || "";
      if (LODGING_RE.test(name) || /チェックイン|宿泊/.test(desc)) {
        baseHotel = baseHotel || name;
      }
    }
  }

  // 往路価格（数値化できた場合に限り保持）
  let outwardPrice = 0;

  for (let i = 0; i < days.length; i++) {
    const isFirst = i === 0;
    const isLast = i === lastIndex;

    // 3) 宿を1件に正規化し、可能ならベース宿名に統一
    const nextSchedule = [];
    let hasHotelToday = false;
    for (const raw of days[i].schedule || []) {
      let s = { ...raw };

      const nm = (s.activity_name || "").trim();
      if (!s.type && LODGING_RE.test(nm)) s.type = "hotel";

      if (s.type === "hotel" || LODGING_RE.test(nm)) {
        if (hasHotelToday) continue; // 2件目以降は捨てる
        hasHotelToday = true;
        if (baseHotel) s.activity_name = baseHotel;
      }

      nextSchedule.push(s);
    }
    days[i].schedule = nextSchedule;

    // 4) travel の扱い
    if (isFirst) {
      const first = days[i].schedule?.[0];
      const seemsTravel =
        first &&
        (first.type === "travel" ||
          /移動|到着|出発/.test(first.activity_name || ""));
      if (!seemsTravel) {
        days[i].schedule = [
          {
            time: nightMove ? "20:00" : "出発",
            activity_name: "移動（出発）",
            description: `${origin} から ${destination} へ移動`,
            price: "交通費",
            url: "",
            type: "travel",
            skip_map: true, // 地図非表示
          },
          ...(days[i].schedule || []),
        ];
        outwardPrice = yen(days[i].schedule[0]?.price);
      } else {
        days[i].schedule[0] = {
          ...first,
          type: "travel",
          skip_map: true,
        };
        outwardPrice = yen(first.price);
      }
    } else if (!isLast) {
      // 中日：travel を全削除
      days[i].schedule = (days[i].schedule || []).filter(
        (s) => s.type !== "travel" && !/移動/.test(s.activity_name || "")
      );
    }

    if (isLast && !noReturn) {
      let addedReturn = false;
      const hasReturn = (days[i].schedule || []).some(
        (s) =>
          s.type === "travel" &&
          /帰路|帰宅|復路|帰る|出発地へ/.test(s.activity_name || "")
      );
      if (!hasReturn) {
        days[i].schedule = [
          ...(days[i].schedule || []),
          {
            time: "帰路",
            activity_name: "移動（帰路）",
            description: `${destination} から ${origin} へ移動`,
            price:
              outwardPrice > 0
                ? `${outwardPrice.toLocaleString()}円`
                : "交通費",
            url: "",
            type: "travel",
            skip_map: true, // 地図非表示
          },
        ];
        addedReturn = true;
      } else {
        // 既存の帰路に価格が無い場合は往路と同額で補完
        days[i].schedule = (days[i].schedule || []).map((s) => {
          if (
            s.type === "travel" &&
            /帰路|帰宅|復路|帰る|出発地へ/.test(String(s.activity_name || "")) &&
            yen(s.price) === 0 &&
            outwardPrice > 0
          ) {
            return { ...s, price: `${outwardPrice.toLocaleString()}円` };
          }
          return s;
        });
      }

      // 帰る日はホテル宿泊なし（帰路があるor追加した場合に限る）
      if (hasReturn || addedReturn) {
        days[i].schedule = (days[i].schedule || []).filter(
          (s) =>
            !(
              s.type === "hotel" ||
              /チェックイン|宿泊/.test(String(s.activity_name || ""))
            )
        );
      }
    }
  }

  // 5) 往路・復路の価格をそろえる（片方に数値があれば両方へ反映）
  try {
    const firstDay = days[0];
    const lastDay = days[lastIndex];
    const outward = firstDay?.schedule?.find(
      (s) =>
        s.type === "travel" &&
        /出発|移動（出発）/.test(String(s.activity_name || ""))
    );
    const inbound = lastDay?.schedule?.find(
      (s) =>
        s.type === "travel" &&
        /帰路|出発地へ|復路|帰る/.test(String(s.activity_name || ""))
    );
    const outN = yen(outward?.price);
    const inN = yen(inbound?.price);
    const unified = outN || inN;
    if (unified && outward && outN === 0) {
      outward.price = `${unified.toLocaleString()}円`;
    }
    if (unified && inbound && inN === 0) {
      inbound.price = `${unified.toLocaleString()}円`;
    }
  } catch {
    /* no-op */
  }

  return days;
}

/** 地図用に「旅行先の立ち寄りのみ」を残す（travel/skip_map は除外） */
function filterDaysForMap(itinerary) {
  return (itinerary || []).map((d) => ({
    ...d,
    schedule: (d.schedule || []).filter(
      (s) => s.type !== "travel" && !s.skip_map
    ),
  }));
}

/** 出発/帰路の travel アイテムへ見積り価格を適用（0/未設定のときだけ上書き） */
function applyTravelPrices(itinerary, outwardYen = 0, returnYen = 0) {
  if (!Array.isArray(itinerary) || itinerary.length === 0) return itinerary;
  const last = itinerary.length - 1;

  // Day1 出発
  const d1 = itinerary[0];
  if (d1?.schedule?.length) {
    const first = d1.schedule.find(
      (s) => s.type === "travel" || /移動|出発/.test(String(s.activity_name || ""))
    );
    if (first && (!first.price || yen(first.price) === 0)) {
      const p = outwardYen || 0;
      if (p > 0) first.price = fmtYen(p);
    }
  }

  // 最終日 帰路
  const dn = itinerary[last];
  if (dn?.schedule?.length) {
    const ret = dn.schedule.find(
      (s) =>
        s.type === "travel" &&
        /帰路|復路|帰る|出発地へ/.test(String(s.activity_name || ""))
    );
    if (ret && (!ret.price || yen(ret.price) === 0)) {
      const p = returnYen || outwardYen || 0;
      if (p > 0) ret.price = fmtYen(p);
    }
  }
  return itinerary;
}

/* ───────────────────────────────────────────── */

export function PlanProvider({ children }) {
  const [plan, setPlan] = useState({
    origin: "",
    destination: "",
    areas: [],
    dates: { start: null, end: null },
    transport: "public", // 'public' | 'driving'
    budget: 100000, // ★旅行全体のユーザ予算（合計で扱う）
    preferences: "",
  });

  const [planId, setPlanId] = useState(null);
  const [planJsonResult, setPlanJsonResult] = useState(null);
  const [error, setError] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState({
    active: false,
    message: "",
    progress: 0,
  });

  // 進捗ユーティリティ
  const step = (message, progress) =>
    setLoadingStatus({ active: true, message, progress });
  const done = () =>
    setLoadingStatus({ active: true, message: "完成！", progress: 100 });

  // Excel用の軽量オブジェクト（places/days/estimates）を構築
  function buildFinalPlanForExcel(itinerary, geoResults) {
    // query → geocode の辞書
    const geoMap = new Map();
    for (const g of geoResults || []) {
      if (g?.query) geoMap.set(g.query, g);
    }

    // name+area でユニーク化
    const placeKey = (name, area) =>
      `${(name || "").trim()}__${(area || "").trim()}`;
    const placeIndex = new Map();
    const places = [];
    let idx = 1;

    // 「移動」「skip_map」は places から除外（=地図に出さない）
    for (const day of itinerary || []) {
      for (const s of (day.schedule || []).filter(
        (st) => st.type !== "travel" && !st.skip_map
      )) {
        const key = placeKey(s.activity_name, day.area);
        if (!placeIndex.has(key)) {
          const query = [s.activity_name, day.area, "日本"]
            .filter(Boolean)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
          const g = geoMap.get(query);
          const id = `p${idx++}`;
          placeIndex.set(key, id);
          places.push({
            id,
            name: s.activity_name || "",
            type: "poi",
            area: day.area || "",
            priceYen: yen(s.price),
            url: s.url || "",
            lat: g?.lat ?? "",
            lon: g?.lon ?? "",
          });
        }
      }
    }

    const days = (itinerary || []).map((d) => ({
      day: d.day,
      date: d.date || "",
      // 分析用に travel も残す（placeId は空になることがある）
      stops: (d.schedule || []).map((s) => ({
        time: s.time || "",
        placeId: placeIndex.get(placeKey(s.activity_name, d.area)) || "",
        note: (s.description || "").slice(0, 120),
        costYen: yen(s.price),
        type: s.type || "",
      })),
    }));

    const estimates = {
      totalCostYen: days.reduce(
        (sum, day) =>
          sum + day.stops.reduce((s2, st) => s2 + (st.costYen || 0), 0),
        0
      ),
    };

    return { places, days, estimates };
  }

  const generatePlan = async () => {
    setError(null);
    setPlanJsonResult(null);
    step("プランニング準備中...", 0);

    try {
      const startDate = moment(plan.dates.start);
      const endDate = moment(plan.dates.end);
      if (!startDate.isValid() || !endDate.isValid() || endDate.isBefore(startDate)) {
        throw new Error("日程が正しく設定されていません。");
      }
      const duration = endDate.diff(startDate, "days") + 1;

      // LLMへ渡す1日あたり予算（ユーザは合計入力なので日数で割る）
      const perDayBudget =
        Math.max(0, Math.floor((Number(plan.budget) || 0) / duration)) || 0;

      // ① セッション開始（Index.xlsx に追記 & planId 取得）
      const session = await startPlanSession({
        origin: plan.origin,
        destination: plan.destination,
        dates: plan.dates,
        duration,
        budgetPerDay: perDayBudget, // ★ per-day で保存
        transport: plan.transport,
      });
      setPlanId(session.planId);

      // ② ユーザー入力ログ（軽量）
      await logUser(session.planId, [
        { field: "origin", value: plan.origin },
        { field: "destination", value: plan.destination },
        { field: "dates", value: JSON.stringify(plan.dates) },
        { field: "transport", value: plan.transport },
        { field: "budget_total_user_input", value: String(plan.budget) }, // 合計
        { field: "budget_per_day", value: String(perDayBudget) }, // 1日あたり
        { field: "preferences", value: plan.preferences || "" },
        { field: "areas", value: JSON.stringify(plan.areas || []) },
      ]);

      // ③ マスタープラン
      step("旅行の骨格を組み立て中...", 5);
      const planForAgents = {
        ...plan,
        budget: perDayBudget,
        budgetPerDay: perDayBudget,
      };
      const masterPlanResponse = await createMasterPlan(
        { ...planForAgents, duration },
        session.planId
      );

      const masterPlan = masterPlanResponse.master_plan || [];
      if (masterPlan.length !== duration) {
        throw new Error("AIによるエリア分割が日数と一致しませんでした。");
      }

      const daysMeta = masterPlan.map((d, idx) => ({
        ...d,
        date: startDate.clone().add(idx, "days").format("YYYY-MM-DD"),
      }));

      // ④ 各エージェント（食・宿・体験）
      step("おすすめスポットを収集中...", 20);
      const perDayResources = await Promise.all(
        (daysMeta || []).map(async (d) => {
          const conditions = { ...planForAgents, currentArea: d.area };

          const [dining, accommodation, activities] = await Promise.all([
            findDiningOptions(conditions, session.planId).catch(() => ({
              restaurants: [],
            })),
            findAccommodation(conditions, session.planId).catch(() => ({
              hotels: [],
            })),
            findActivities(conditions, session.planId).catch(() => ({
              activities: [],
            })),
          ]);

          return {
            ...d,
            availableResources: {
              restaurants: dining.restaurants || [],
              hotels: accommodation.hotels || [],
              activities: activities.activities || [],
            },
          };
        })
      );

      // ⑤ 各日の詳細プラン
      step("各日の詳細プランを生成中...", 60);
      const batchInput = perDayResources.map((r) => ({
        day: r.day,
        date: r.date,
        area: r.area,
        theme: r.theme,
        planConditions: planForAgents, // ★ per-day 予算を渡す
        availableResources: r.availableResources,
      }));

      const { results } = await createDayPlans(batchInput, session.planId);
      let okPlans = results
        .filter((r) => r.ok)
        .map((r) => r.plan)
        .sort((a, b) => a.day - b.day);

      if (okPlans.length === 0 && results.length > 0) {
        throw new Error(
          `全日程のプラン生成に失敗しました。最初の失敗理由: ${
            results.find((r) => !r.ok)?.error
          }`
        );
      }

      // ★ 単一目的地に最適化（移動/宿/エリアを正規化・帰路価格補完・最終日宿除去）
      okPlans = normalizeSingleDestinationPlan(okPlans, {
        origin: plan.origin,
        destination: plan.destination,
        preferences: plan.preferences,
      });

      // ★ 出発/帰路の交通費を Directions API で概算 → travel に適用
      let outwardYen = 0;
      let returnYen = 0;
      try {
        const e1 = await estimateFare(
          plan.origin,
          plan.destination,
          plan.transport
        );
        outwardYen = e1?.fareYen || 0;
      } catch {}
      try {
        const e2 = await estimateFare(
          plan.destination,
          plan.origin,
          plan.transport
        );
        returnYen = e2?.fareYen || outwardYen || 0;
      } catch {}
      // デバッグしたい時は有効化
      // console.debug('[fare-estimate@generate]', { outwardYen, returnYen });

      okPlans = applyTravelPrices(okPlans, outwardYen, returnYen);

      // ⑥ ジオコーディング（地図は旅行先のみ＝travel/skip_mapを除外）
      step("地図データを作成中...", 80);
      const mapPlans = filterDaysForMap(okPlans);
      const geo = await geocodeItinerary(
        plan.destination,
        mapPlans,
        session.planId
      );

      // ⑦ 画面表示用の最終JSON（総予算・経路リンク付き）
      step("最終仕上げ中...", 90);

      // 見積合計：アイテム価格（移動含む）を合算
      const estimatedTotal =
        (okPlans || []).reduce(
          (sum, day) =>
            sum + (day.schedule || []).reduce((s2, it) => s2 + yen(it.price), 0),
          0
        );

      // ユーザ予算は入力値そのまま（合計）
      const userBudgetTripTotal = Number(plan.budget) || 0;

      const directionTo = buildGmapsDirectionsUrl(
        plan.origin,
        plan.destination,
        plan.transport
      );
      const { noReturn } = interpretPreferences(plan.preferences);
      const directionBack = !noReturn
        ? buildGmapsDirectionsUrl(
            plan.destination,
            plan.origin,
            plan.transport
          )
        : "";

      const finalJson = {
        title: `${plan.destination}への${duration}日間の旅`,
        introduction: "あなただけの特別な旅行プランが完成しました！",
        itinerary: okPlans,
        total_cost_all_days: estimatedTotal.toLocaleString() + "円",
        budget_summary: {
          userBudgetTripTotal, // ★ ユーザ入力そのまま（合計）
          estimatedTotal,
          variance: estimatedTotal - userBudgetTripTotal,
          userBudgetPerDayHint: Math.floor(
            (Number(plan.budget) || 0) / duration
          ),
        },
        external_links: {
          to_destination: directionTo,
          return_trip: directionBack,
        },
        conclusion: "この旅が、忘れられない素晴らしい思い出になりますように。",
        geocode_results: geo?.results || [],
      };
      setPlanJsonResult(finalJson);

      // ⑧ Excel出力用の軽量フォーマットを作って確定
      const finalPlanForExcel = buildFinalPlanForExcel(
        okPlans,
        finalJson.geocode_results
      );
      finalPlanForExcel.title = finalJson.title;
      finalPlanForExcel.estimates = finalPlanForExcel.estimates || {};
      finalPlanForExcel.estimates.totalCostYen =
        finalPlanForExcel.estimates.totalCostYen || estimatedTotal;

      await finalizePlan(session.planId, finalPlanForExcel);

      // ⑨ 完了
      done();
      setTimeout(
        () => setLoadingStatus({ active: false, message: "", progress: 0 }),
        400
      );
    } catch (err) {
      console.error("PlanContextでのエラー:", err);
      setError(err.message || "プラン生成中に不明なエラーが発生しました。");
      setLoadingStatus({ active: false, message: "", progress: 0 });
    }
  };

  // ★ 修正の反映
  const reviseItinerary = async (instructions) => {
    if (!planJsonResult?.itinerary?.length) return;
    setError(null);
    step("修正を反映中...", 20);
    try {
      const startDate = moment(plan.dates.start);
      const endDate = moment(plan.dates.end);
      const duration = endDate.diff(startDate, "days") + 1;
      const perDayBudget =
        Math.max(0, Math.floor((Number(plan.budget) || 0) / duration)) || 0;

      // LLMに修正依頼
      const res = await revisePlan(
        { ...plan, budgetPerDay: perDayBudget },
        planJsonResult.itinerary,
        instructions,
        planId
      );
      let revised =
        (res && res.revised_itinerary) || planJsonResult.itinerary;

      // 正規化（単一目的地制約・帰路/宿/移動）
      step("整合性をチェック中...", 50);
      revised = normalizeSingleDestinationPlan(revised, {
        origin: plan.origin,
        destination: plan.destination,
        preferences: plan.preferences,
      });

      // 運賃の自動見積りも再適用
      try {
        const est1 = await estimateFare(
          plan.origin,
          plan.destination,
          plan.transport
        );
        const est2 = await estimateFare(
          plan.destination,
          plan.origin,
          plan.transport
        );
        revised = applyTravelPrices(
          revised,
          est1?.fareYen || 0,
          est2?.fareYen || est1?.fareYen || 0
        );
      } catch {
        /* 失敗時は無視（既存 price が使われる） */
      }

      // 地図用にジオコーディング（旅行地のみ）
      const mapPlans = filterDaysForMap(revised);
      step("地図データを更新中...", 70);
      await geocodePlace(plan.destination).catch(() => {});
      const geo = await geocodeItinerary(plan.destination, mapPlans, planId);

      // 見積合計を再計算
      const estimatedTotal =
        (revised || []).reduce(
          (sum, day) =>
            sum + (day.schedule || []).reduce((s2, it) => s2 + yen(it.price), 0),
          0
        );

      const directionTo = buildGmapsDirectionsUrl(
        plan.origin,
        plan.destination,
        plan.transport
      );
      const { noReturn } = interpretPreferences(plan.preferences);
      const directionBack = !noReturn
        ? buildGmapsDirectionsUrl(
            plan.destination,
            plan.origin,
            plan.transport
          )
        : "";

      const updatedJson = {
        ...planJsonResult,
        itinerary: revised,
        total_cost_all_days: estimatedTotal.toLocaleString() + "円",
        budget_summary: {
          userBudgetTripTotal: Number(plan.budget) || 0,
          estimatedTotal,
          variance: estimatedTotal - (Number(plan.budget) || 0),
          userBudgetPerDayHint: perDayBudget,
        },
        external_links: { to_destination: directionTo, return_trip: directionBack },
        geocode_results: geo?.results || [],
      };
      setPlanJsonResult(updatedJson);

      // Excel も更新（上書き）
      const finalPlanForExcel = buildFinalPlanForExcel(
        revised,
        updatedJson.geocode_results
      );
      finalPlanForExcel.title = updatedJson.title;
      finalPlanForExcel.estimates = finalPlanForExcel.estimates || {};
      finalPlanForExcel.estimates.totalCostYen =
        finalPlanForExcel.estimates.totalCostYen || estimatedTotal;
      await finalizePlan(planId, finalPlanForExcel);

      done();
      setTimeout(
        () => setLoadingStatus({ active: false, message: "", progress: 0 }),
        400
      );
    } catch (e) {
      console.error("reviseItinerary error:", e);
      setError(e.message || "修正の反映に失敗しました。");
      setLoadingStatus({ active: false, message: "", progress: 0 });
    }
  };

  const value = {
    plan,
    setPlan,
    planId,
    planJsonResult,
    error,
    loadingStatus,
    generatePlan,
    reviseItinerary, // ★ 追加
  };

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan() {
  return useContext(PlanContext);
}
