// src/pages/PlanResult.styles.js
import styled, { keyframes, createGlobalStyle } from 'styled-components';

/* ──────────────────────────────────────────────
  基本トークン
────────────────────────────────────────────── */
const c = {
  bg: '#ffffff',
  ink: '#101828',
  sub: '#667085',
  line: '#EAECF0',
  brand: '#16a34a',          // Dayピル（緑系）
  brandInk: '#ffffff',
  accent: '#1976d2',         // 強調（青系）
  cardShadow: '0 10px 24px rgba(16,24,40,.06)',
};

const radius = '16px';

/* 選択ハイライト（左のスケジュールを一時的に強調） */
export const ScheduleHighlightStyles = createGlobalStyle`
  .schedule-selected {
    box-shadow: 0 0 0 3px rgba(25,118,210,.25) inset;
    transition: box-shadow .2s ease;
  }
`;

/* ──────────────────────────────────────────────
  レイアウト
────────────────────────────────────────────── */
export const Wrapper = styled.div`
  max-width: 1360px;             /* 画面いっぱい寄りに */
  margin: 0 auto;
  padding: 24px 16px;

  /* 画面が広い時はもう少し余白 */
  @media (min-width: 1440px) {
    padding: 32px 24px;
  }
`;

export const Header = styled.header`
  text-align: center;
  margin-bottom: 20px;

  @media (min-width: 768px) {
    margin-bottom: 24px;
  }
`;

export const Title = styled.h1`
  margin: 0 0 8px;
  font-size: clamp(24px, 3.2vw, 40px);
  line-height: 1.15;
  color: ${c.ink};
  letter-spacing: .2px;
`;

export const Introduction = styled.p`
  margin: 0 auto;
  color: ${c.sub};
  font-size: clamp(14px, 1.6vw, 16px);
  max-width: 800px;
`;

/* 2カラム：左4 / 右6（<=1024px で1カラム） */
export const TwoCol = styled.div`
  display: grid;
  grid-template-columns: 4fr 6fr;
  gap: 24px;
  align-items: start;

  @media (max-width: 1024px) {
    grid-template-columns: 1fr;
  }
`;

export const LeftPane = styled.div`
  min-width: 0; /* テキスト折返し用 */
`;

export const RightPane = styled.div`
  position: sticky;
  top: 16px;
  min-height: 420px;
`;

/* ──────────────────────────────────────────────
  行程（左カラム）
────────────────────────────────────────────── */
export const ItineraryContainer = styled.div`
  display: grid;
  gap: 16px;

  @media (min-width: 768px) {
    gap: 20px;
  }
`;

const fadeUp = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
`;

export const DayCard = styled.section`
  background: ${c.bg};
  border: 1px solid ${c.line};
  border-radius: ${radius};
  box-shadow: ${c.cardShadow};
  padding: 16px 16px 4px;
  animation: ${fadeUp} .35s ease both;
  animation-delay: ${({ $delay }) => $delay || '0s'};

  @media (min-width: 768px) {
    padding: 20px 20px 6px;
  }
`;

export const DayHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;

  @media (min-width: 768px) {
    gap: 12px;
    margin-bottom: 10px;
  }
`;

export const DayLabel = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: ${c.brand};
  color: ${c.brandInk};
  font-weight: 700;
  font-size: 14px;
  border-radius: 999px;
  padding: 6px 12px;

  @media (min-width: 768px) {
    font-size: 15px;
  }
`;

export const DayDate = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: ${c.sub};
  font-size: 14px;

  svg { opacity: .9; }
`;

/* タイムライン */
export const Timeline = styled.div`
  position: relative;
  margin-top: 8px;
  padding-left: 18px;      /* 左のライン/ドットの余白 */

  /* 縦の軸 */
  &::before {
    content: '';
    position: absolute;
    left: 7px;
    top: 4px;
    bottom: 10px;
    width: 2px;
    background: ${c.line};
  }
`;

/* 各アイテム */
export const ScheduleItem = styled.div`
  position: relative;
  padding: 10px 8px 14px 12px;
  border-radius: 12px;
  transition: background .15s ease, box-shadow .15s ease;
  margin-bottom: 6px;

  &:hover {
    background: #f9fafb;
  }

  /* 左のドット */
  &::before {
    content: '';
    position: absolute;
    left: -6px;
    top: 18px;
    width: 10px;
    height: 10px;
    background: ${c.accent};
    border-radius: 50%;
    box-shadow: 0 0 0 2px ${c.bg};
  }
`;

export const Time = styled.div`
  color: ${c.sub};
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 2px;
  letter-spacing: .2px;
`;

export const ActivityName = styled.h3`
  margin: 0;
  font-size: 16px;
  line-height: 1.35;
  color: ${c.ink};

  @media (min-width: 768px) {
    font-size: 17px;
  }
`;

export const Description = styled.p`
  margin: 6px 0 8px;
  color: ${c.sub};
  line-height: 1.6;
  font-size: 14px;

  @media (min-width: 768px) {
    font-size: 15px;
  }
`;

export const MetaInfo = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  color: ${c.sub};
  font-size: 14px;
`;

export const MetaItem = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;

  a {
    color: ${c.accent};
    text-decoration: none;
  }
  a:hover {
    text-decoration: underline;
  }

  svg {
    flex: none;
    opacity: .9;
  }
`;

export const Conclusion = styled.p`
  margin: 16px 0 20px;
  text-align: center;
  color: ${c.sub};
  font-size: 15px;
`;

export const BackButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: #0f172a;
  color: #fff;
  border: none;
  padding: 10px 14px;
  border-radius: 12px;
  cursor: pointer;
  box-shadow: 0 8px 18px rgba(15,23,42,.15);
  transition: transform .08s ease, box-shadow .15s ease;

  &:hover {
    box-shadow: 0 10px 22px rgba(15,23,42,.2);
  }
  &:active {
    transform: translateY(1px);
  }
`;
