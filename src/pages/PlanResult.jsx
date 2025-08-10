// src/pages/PlanResult.jsx
import React, { useState } from 'react';
import { usePlan } from '../contexts/PlanContext';
import { Link as LinkIcon, DollarSign, ArrowLeft, Calendar } from 'lucide-react';
import moment from 'moment';
import 'moment/locale/ja';
import ItineraryMap from '../components/ItineraryMap';

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

export default function PlanResult({ onBackToTop }) {
  const { plan, planJsonResult, error } = usePlan();
  const [selected, setSelected] = useState(null); // { day, name }

  moment.locale('ja');

  if (error) return <FallbackDisplay message={`エラーが発生しました: ${error}`} />;
  if (!planJsonResult?.itinerary?.length) return <FallbackDisplay message="有効なプランデータが見つかりませんでした。" />;

  const { title, introduction, itinerary, conclusion } = planJsonResult;

  const formatDate = (dateString) => {
    const date = moment(dateString);
    return date.isValid() ? date.format('M月D日 (ddd)') : '日付不明';
  };

  return (
    <Wrapper>
      {/* ハイライトCSS（必要なら残す。自動スクロールはしない） */}
      <ScheduleHighlightStyles />

      <Header>
        <Title>{title}</Title>
        <Introduction>{introduction}</Introduction>
      </Header>

      <TwoCol>
        {/* 左：スケジュール（4） */}
        <LeftPane>
          <ItineraryContainer>
            {itinerary.map((dayPlan, index) => (
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
                              <DollarSign size={14} />
                              {item.price}
                            </MetaItem>
                          )}
                          {item.url && (
                            <MetaItem>
                              <LinkIcon size={14} />
                              <a href={item.url} target="_blank" rel="noopener noreferrer">
                                詳細を見る
                              </a>
                            </MetaItem>
                          )}
                        </MetaInfo>
                      </ScheduleItem>
                    );
                  })}
                </Timeline>
              </DayCard>
            ))}
          </ItineraryContainer>

          <Conclusion>{conclusion}</Conclusion>

          <div style={{ textAlign: 'center' }}>
            <BackButton onClick={onBackToTop}>
              <ArrowLeft size={18} />
              最初のページに戻る
            </BackButton>
          </div>
        </LeftPane>

        {/* 右：地図（6） ー 最初は「目的地」にフォーカス。クリック時のみ移動 */}
        <RightPane>
          <ItineraryMap
            destination={plan?.destination}
            itinerary={itinerary}
            selected={selected}                 // 左でクリックされた項目
            onSelect={(meta) => setSelected(meta)} // マーカークリック時に左を強調（スクロールはしない）
          />
        </RightPane>
      </TwoCol>
    </Wrapper>
  );
}
