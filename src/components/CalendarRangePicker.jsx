// src/components/CalendarRangePicker.jsx

import { useState } from "react";
import styled from "styled-components";
import { DateRange } from "react-date-range";
import { ja } from "date-fns/locale";
import "react-date-range/dist/styles.css";
import "react-date-range/dist/theme/default.css";
import { Calendar as CalendarIcon } from 'lucide-react'; // アイコンをインポート

// --- スタイル定義 (ここから) ---
const colors = {
  primary: '#00A8A0',
  text: '#2D3748',
  white: '#FFFFFF',
  border: '#E2E8F0',
};

const Wrapper = styled.div`
  margin-bottom: 24px;
  position: relative; /* ポップアップの位置の基準点とする */
`;

const Label = styled.label`
  font-weight: 600;
  display: block;
  margin-bottom: 8px;
  font-size: 16px;
  color: ${colors.text};
`;

const DateButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  border-radius: 8px;
  border: 1px solid ${colors.border};
  background: ${colors.white};
  color: ${colors.text};
  font-weight: 600;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: ${colors.primary};
    color: ${colors.primary};
  }

  svg {
    color: ${colors.primary};
  }
`;

const CalendarPopup = styled.div`
  position: absolute;
  z-index: 10;
  background: ${colors.white};
  box-shadow: 0 4px 24px rgba(0,0,0,0.12);
  border-radius: 12px;
  margin-top: 8px;

  /* react-date-rangeのスタイルを上書き */
  .rdrCalendarWrapper {
    color: ${colors.text};
  }
  .rdrDateDisplayWrapper, .rdrMonthAndYearWrapper {
    background-color: transparent;
  }
  .rdrMonthAndYearPickers select {
    color: ${colors.text};
  }
  .rdrNextPrevButton {
    background: #f1f5f9;
  }
  .rdrDayNumber span {
    color: ${colors.text};
  }
  .rdrDayToday .rdrDayNumber span:after {
    background: ${colors.primary};
  }
  .rdrSelected, .rdrInRange, .rdrStartEdge, .rdrEndEdge {
    background: ${colors.primary} !important;
  }
`;

const CloseButton = styled.button`
  margin: 0 10px 10px 10px;
  background: ${colors.primary};
  color: ${colors.white};
  border: none;
  border-radius: 6px;
  padding: 7px 16px;
  cursor: pointer;
  float: right; /* 右寄せにする */

  &:hover {
    opacity: 0.9;
  }
`;

// --- スタイル定義 (ここまで) ---

const formatDateToYMD = (date) => {
  if (!date) return null; // dateがnullの場合に対応
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function CalendarRangePicker({ value, setValue }) {
  const [open, setOpen] = useState(false);
  
  // ★★★ エラー修正の核心部分 ★★★
  // value.datesがundefinedの場合でも、安全なデフォルト値を使用する
  const dates = value?.dates || { start: null, end: null };

  const getRangeForPicker = () => {
    // dates.start, dates.endがnullや空文字列の場合も考慮
    const startDate = dates.start ? new Date(dates.start + "T00:00:00") : new Date();
    const endDate = dates.end ? new Date(dates.end + "T00:00:00") : startDate;

    return [{
      startDate: startDate,
      endDate: endDate,
      key: "selection"
    }];
  };

  const handleSelect = (ranges) => {
    const { startDate, endDate } = ranges.selection;
    setValue((prev) => ({
      ...prev,
      dates: {
        start: formatDateToYMD(startDate),
        end: formatDateToYMD(endDate),
      },
    }));

    // 開始日と終了日が両方選択されたら、自動でカレンダーを閉じる
    if (startDate && endDate && startDate.getTime() !== endDate.getTime()) {
      setOpen(false);
    }
  };

  return (
    <Wrapper>
      <Label>日程</Label>
      <DateButton onClick={() => setOpen(true)}>
        <CalendarIcon size={18} />
        {/* ★ 安全な `dates` オブジェクトから値を取得 */}
        {dates.start && dates.end
          ? `${dates.start} ～ ${dates.end}`
          : "日程を選択"}
      </DateButton>
      
      {open && (
        <CalendarPopup>
          <DateRange
            editableDateInputs={true}
            onChange={handleSelect}
            moveRangeOnFirstSelection={false}
            ranges={getRangeForPicker()}
            locale={ja}
            months={1}
            direction="horizontal"
            showMonthAndYearPickers={true}
            minDate={new Date()}
          />
          <CloseButton onClick={() => setOpen(false)}>
            閉じる
          </CloseButton>
        </CalendarPopup>
      )}
    </Wrapper>
  );
}