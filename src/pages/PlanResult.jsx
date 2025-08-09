// src\pages\PlanResult.jsx

import React from 'react';
import { usePlan } from '../contexts/PlanContext';
import { Link, DollarSign, ArrowLeft, Calendar } from 'lucide-react';
import moment from 'moment';
import 'moment/locale/ja';
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
  DayDate
} from './PlanResult.styles';

// エラーやデータが存在しない場合の表示を担当するコンポーネント
const FallbackDisplay = ({ message }) => (
  <div style={{ textAlign: 'center', padding: '100px 20px', color: '#667085', fontFamily: 'sans-serif' }}>
    <h2 style={{ fontWeight: 'normal' }}>{message}</h2>
    <p style={{ marginTop: '20px' }}>入力条件を変えて再度お試しください。</p>
  </div>
);

export default function PlanResult({ onBackToTop }) {
  const { planJsonResult, error } = usePlan();

  // エラーが発生した場合の表示
  if (error) {
    return <FallbackDisplay message={`エラーが発生しました: ${error}`} />;
  }

  // planJsonResultがまだ存在しない、またはitineraryが空の場合の表示
  if (!planJsonResult || !planJsonResult.itinerary || planJsonResult.itinerary.length === 0) {
    return <FallbackDisplay message="有効なプランデータが見つかりませんでした。" />;
  }

  const { title, introduction, itinerary, conclusion } = planJsonResult;

  // 日付文字列（"YYYY-MM-DD"）を分かりやすい形式（"M月D日 (ddd)"）に変換する関数
  const formatDate = (dateString) => {
    const date = moment(dateString);
    return date.isValid() ? date.format('M月D日 (ddd)') : '日付不明';
  };

  return (
    <Wrapper>
      <Header>
        <Title>{title}</Title>
        <Introduction>{introduction}</Introduction>
      </Header>

      <ItineraryContainer>
        {itinerary.map((dayPlan, index) => (
          <DayCard key={dayPlan.day} delay={`${0.2 * index}s`}>
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
              {dayPlan.schedule.map((item, itemIndex) => (
                <ScheduleItem key={itemIndex}>
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
                        <Link size={14} />
                        <a href={item.url} target="_blank" rel="noopener noreferrer">
                          詳細を見る
                        </a>
                      </MetaItem>
                    )}
                  </MetaInfo>
                </ScheduleItem>
              ))}
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
    </Wrapper>
  );
}