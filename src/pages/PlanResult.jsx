// src/pages/PlanResult.jsx
import React, { useState, useMemo } from 'react';
import { usePlan } from '../contexts/PlanContext';
import { Link as LinkIcon, ArrowLeft, Calendar, SendHorizonal, Loader2 } from 'lucide-react';
import moment from 'moment';
import 'moment/locale/ja';
import ItineraryMap from '../components/ItineraryMap';
import { savePlan, makePlanUrl } from '../api/planstore';

import {
  Wrapper,
  Header,
  Title,
  Introduction,
  ItineraryContainer,
  DayCard,
  DayHeader,
  DayLabel,
  Timeline,
  ScheduleItem,
  Time,
  ActivityName,
  Description,
  MetaInfo,
  MetaItem,
  Conclusion,
  BackButton,
  DayDate,
  TwoCol,
  LeftPane,
  RightPane,
  ScheduleHighlightStyles,
} from './PlanResult.styles';

const FallbackDisplay = ({ message }) => (
  <div style={{ textAlign: 'center', padding: '100px 20px', color: '#667085', fontFamily: 'sans-serif' }}>
    <h2 style={{ fontWeight: 'normal' }}>{message}</h2>
    <p style={{ marginTop: '20px' }}>入力条件を変えて再度お試しください。</p>
  </div>
);

// クリック連動用キー（時刻は無視して名前ベースで）
const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
const makeKey = (day, name) => `${day}||${norm(name)}`;

// 金額パース（文字列→数値JPY）
const yen = (v) => {
  const n = parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};

// “¥”マーク（アイコン代わり）
const YenMark = ({ size = 14, style = {} }) => (
  <span aria-label="円" style={{ fontWeight: 700, fontFamily: 'system-ui, sans-serif', ...style, fontSize: size }}>
    ¥
  </span>
);

// 経路リンク
function buildGmapsDirectionsUrl(origin, destination, transport) {
  const mode = transport === 'public' ? 'transit' : 'driving';
  const o = encodeURIComponent(origin || '');
  const d = encodeURIComponent(destination || '');
  return `https://www.google.com/maps/dir/?api=1&origin=${o}&destination=${d}&travelmode=${mode}`;
}

// 価格の安全取得：price_jpy（数値）→ fareYen（数値）→ 文字列 price/cost/fee をパース
const getItemPriceJPY = (it) => {
  if (Number.isFinite(it?.price_jpy)) return it.price_jpy;
  if (Number.isFinite(it?.fareYen)) return it.fareYen;
  const raw = it?.price ?? it?.cost ?? it?.fee ?? '';
  const n = yen(raw);
  return Number.isFinite(n) ? n : 0;
};

export default function PlanResult({ onBackToTop }) {
  const { plan, planJsonResult, error, loadingStatus, reviseItinerary } = usePlan();
  const [selected, setSelected] = useState(null); // { day, name }
  const [editText, setEditText] = useState('');

  // 保存関連
  const [savingPlan, setSavingPlan] = useState(false);
  const [savedUrl, setSavedUrl] = useState('');

  moment.locale('ja');

  if (error) return <FallbackDisplay message={`エラーが発生しました: ${error}`} />;
  if (!planJsonResult?.itinerary?.length) return <FallbackDisplay message="有効なプランデータが見つかりませんでした。" />;

  const { title, introduction, itinerary, conclusion } = planJsonResult;

  // Map用：travel/skip_mapを除外（旅行地スポットのみ）
  const itineraryForMap = useMemo(() => {
    return (itinerary || []).map((d) => ({
      ...d,
      schedule: (d.schedule || []).filter((s) => s.type !== 'travel' && !s.skip_map),
    }));
  }, [itinerary]);

  // 表示用：最終日に帰路がある日は宿泊を除外
  const displayItinerary = useMemo(() => {
    const lastIdx = Math.max(0, (itinerary || []).length - 1);
    return (itinerary || []).map((d, idx) => {
      if (idx !== lastIdx) return d;
      const hasReturn = (d.schedule || []).some(
        (s) =>
          s.type === 'travel' &&
          /帰路|帰宅|復路|帰る|出発地へ/.test(String(s.activity_name || s.description || ''))
      );
      if (!hasReturn) return d;
      return {
        ...d,
        schedule: (d.schedule || []).filter(
          (s) => !(s.type === 'hotel' || /チェックイン|宿泊/.test(String(s.activity_name || '')))
        ),
      };
    });
  }, [itinerary]);

  // 見積合計：各アイテム（移動含む）を合算（price_jpy/ fareYen を最優先）
  const estimatedTotal = useMemo(
    () =>
      (itinerary || []).reduce(
        (sum, day) =>
          sum +
          (day.schedule || []).reduce((s2, it) => s2 + getItemPriceJPY(it), 0),
        0
      ),
    [itinerary]
  );

  // ユーザ予算（合計・そのまま）
  const userBudgetTripTotal = Number(plan?.budget ?? 0);
  const variance = estimatedTotal - userBudgetTripTotal;

  // 経路リンク
  const toLink = buildGmapsDirectionsUrl(plan.origin, plan.destination, plan.transport);
  const backLink = buildGmapsDirectionsUrl(plan.destination, plan.origin, plan.transport);

  const formatDate = (dateString) => {
    const date = moment(dateString);
    return date.isValid() ? date.format('M月D日 (ddd)') : '日付不明';
  };

  // トラベル項目か？
  const isTravel = (name, type) =>
    type === 'travel' || /移動|出発|帰路|到着/.test(String(name || ''));

  const submitEdit = async () => {
    if (!editText.trim()) return;
    await reviseItinerary(editText.trim());
    setEditText('');
    setSelected(null);
  };

  // プラン保存
  const onSavePlan = async () => {
    try {
      setSavingPlan(true);
      const res = await savePlan({
        title: title || '無題プラン',
        // サーバには“プランJSON”なら何でも保存できる。ここでは結果全体を保存。
        plan: planJsonResult,
        // Topの一覧に出すメタ
        meta: {
          origin: plan?.origin,
          destination: plan?.destination,
          dates: plan?.dates,
          transport: plan?.transport,
          budget: plan?.budget,
        },
      });
      const url = makePlanUrl(res.readId);
      setSavedUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        alert('保存しました。URLをコピーしました！\n' + url);
      } catch {
        window.prompt('このURLをコピーしてください', url);
      }
    } catch (e) {
      alert('保存に失敗しました: ' + (e?.message || e));
    } finally {
      setSavingPlan(false);
    }
  };

  return (
    <Wrapper>
      <ScheduleHighlightStyles />

      <Header>
        <Title>{title}</Title>
        <Introduction>{introduction}</Introduction>

        {/* 予算サマリ */}
        <div
          style={{
            marginTop: 16,
            display: 'grid',
            gridTemplateColumns: '1fr',
            gap: 8,
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: 12,
            padding: '12px 14px',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <YenMark />
              <strong>見積合計</strong>：{estimatedTotal.toLocaleString()} 円
            </span>
            <span style={{ color: '#64748B' }}>
              （ユーザ予算 合計：{userBudgetTripTotal.toLocaleString()} 円 / 差額：
              {variance >= 0 ? '+' : ''}
              {variance.toLocaleString()} 円）
            </span>
          </div>
        </div>

        {/* 保存アクション */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
          <button
            onClick={onSavePlan}
            disabled={savingPlan}
            style={{
              background: savingPlan ? '#94A3B8' : '#2563EB',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 12px',
              cursor: savingPlan ? 'not-allowed' : 'pointer',
            }}
          >
            {savingPlan ? '保存中…' : 'このプランを保存'}
          </button>
          {savedUrl && (
            <a href={savedUrl} target="_blank" rel="noreferrer" style={{ alignSelf: 'center', color: '#2563EB' }}>
              保存したページを開く
            </a>
          )}
        </div>
      </Header>

      <TwoCol>
        {/* 左：スケジュール */}
        <LeftPane>
          <ItineraryContainer>
            {displayItinerary.map((dayPlan, index) => {
              const isFirstDay = index === 0;
              const isLastDay = index === displayItinerary.length - 1;

              return (
                <DayCard key={dayPlan.day ?? index} $delay={`${0.15 * index}s`}>
                  <DayHeader>
                    <DayLabel>Day {dayPlan.day}</DayLabel>
                    {dayPlan.date && (
                      <DayDate>
                        <Calendar size={14} />
                        {formatDate(dayPlan.date)}
                      </DayDate>
                    )}
                  </DayHeader>

                  <Timeline>
                    {(dayPlan.schedule || []).map((item) => {
                      const key = makeKey(dayPlan.day, item.activity_name);
                      const travel = isTravel(item.activity_name, item.type);

                      // 出発/帰路の経路リンクを判定
                      let routeHref = '';
                      if (travel) {
                        const isReturnMark =
                          /帰路|帰宅|復路|帰る|出発地へ/.test(String(item.activity_name || item.description || ''));
                        if (isFirstDay && !isReturnMark) routeHref = toLink;
                        else if (isLastDay && (isReturnMark || true)) routeHref = backLink;
                      }

                      const isActive = selected && key === makeKey(selected.day, selected.name);
                      return (
                        <ScheduleItem
                          key={key}
                          className={isActive ? 'schedule-selected' : ''}
                          onClick={() => setSelected({ day: dayPlan.day, name: item.activity_name })}
                          style={{ cursor: 'pointer' }}
                          title="クリックで地図に表示"
                        >
                          <Time>{item.time}</Time>
                          <ActivityName>{item.activity_name}</ActivityName>
                          <Description>{item.description}</Description>
                          <MetaInfo>
                            {item.price && (
                              <MetaItem>
                                <YenMark />
                                {item.price}
                              </MetaItem>
                            )}
                            {!travel && item.url && (
                              <MetaItem>
                                <LinkIcon size={14} />
                                <a href={item.url} target="_blank" rel="noopener noreferrer">
                                  詳細を見る
                                </a>
                              </MetaItem>
                            )}
                            {travel && routeHref && (
                              <MetaItem>
                                <LinkIcon size={14} />
                                <a href={routeHref} target="_blank" rel="noopener noreferrer">
                                  経路を見る
                                </a>
                              </MetaItem>
                            )}
                          </MetaInfo>
                        </ScheduleItem>
                      );
                    })}
                  </Timeline>
                </DayCard>
              );
            })}
          </ItineraryContainer>

          <Conclusion>{conclusion}</Conclusion>

          <div style={{ textAlign: 'center' }}>
            <BackButton onClick={onBackToTop}>
              <ArrowLeft size={18} />
              最初のページに戻る
            </BackButton>
          </div>
        </LeftPane>

        {/* 右：地図（目的地スポットのみ） */}
        <RightPane>
          <ItineraryMap
            destination={plan?.destination}
            itinerary={itineraryForMap}
            selected={selected}
            onSelect={(meta) => setSelected(meta)}
          />
        </RightPane>
      </TwoCol>

      {/* ───── ここから下：プランの下に修正フォーム（フル幅） ───── */}
      <div
        style={{
          marginTop: 20,
          background: '#fff',
          border: '1px solid #E2E8F0',
          borderRadius: 12,
          padding: 12,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 8 }}>プランの修正リクエスト</div>
        <textarea
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          placeholder={
            '例) 2日目のディナーを神戸牛に変更して、朝にハーバーランドを入れてください。予算はこのままで。'
          }
          rows={3}
          style={{
            width: '100%',
            padding: 10,
            borderRadius: 8,
            border: '1px solid #CBD5E1',
            resize: 'vertical',
            outline: 'none',
            fontSize: 14,
          }}
        />
        <div style={{ marginTop: 8, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={submitEdit}
            disabled={loadingStatus.active}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: loadingStatus.active ? '#94A3B8' : '#2563EB',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 12px',
              cursor: loadingStatus.active ? 'not-allowed' : 'pointer',
            }}
            title="LLMに修正を反映して再生成します"
          >
            {loadingStatus.active ? <Loader2 size={16} className="spin" /> : <SendHorizonal size={16} />}
            {loadingStatus.active ? '反映中…' : '修正を反映'}
          </button>
        </div>
      </div>
      {/* ───────────────────────────────────────────── */}
    </Wrapper>
  );
}
