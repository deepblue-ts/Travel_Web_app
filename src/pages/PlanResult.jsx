// src/pages/PlanResult.jsx

import React from 'react';
import { usePlan } from '../contexts/PlanContext';
import { Link, DollarSign, ArrowLeft } from 'lucide-react';
import { 
  Wrapper,
  Header,
  Title,
  Introduction,
  ItineraryContainer,
  DayCard,
  DayHeader,
  DayLabel,
  DayTheme,
  Timeline,
  ScheduleItem,
  Time,
  ActivityName,
  Description,
  MetaInfo,
  MetaItem,
  Conclusion,
  BackButton
} from './PlanResult.styles';

// エラーやローディング中の表示を担当するコンポーネント
const FallbackDisplay = ({ message }) => (
  <div style={{ textAlign: 'center', padding: '100px 20px', color: '#667085' }}>
    <h2>{message}</h2>
  </div>
);

export default function PlanResult({ onBackToTop }) {
  const { planJsonResult, error } = usePlan();

  if (error) {
    return <FallbackDisplay message={`エラーが発生しました: ${error}`} />;
  }

  // planJsonResultがまだ存在しない、またはitineraryが空の場合
  if (!planJsonResult || !planJsonResult.itinerary || planJsonResult.itinerary.length === 0) {
    return <FallbackDisplay message="有効なプランデータがありません。" />;
  }

  const { title, introduction, itinerary, conclusion } = planJsonResult;

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
              <DayTheme>{dayPlan.theme}</DayTheme>
            </DayHeader>
            <Timeline>
              {dayPlan.schedule.map((item, itemIndex) => (
                <ScheduleItem key={itemIndex}>
                  <Time>{item.time}</Time>
                  <ActivityName>{item.activity_name}</ActivityName>
                  <Description>{item.description}</Description>
                  <MetaInfo>
                    {item.price && <MetaItem><DollarSign size={14} />{item.price}</MetaItem>}
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