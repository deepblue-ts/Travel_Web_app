import { useState } from "react";
import { DateRange } from "react-date-range";
import { ja } from "date-fns/locale";
import "react-date-range/dist/styles.css";
import "react-date-range/dist/theme/default.css";

// 【修正点①】タイムゾーンの影響を受けずに日付をフォーマットするヘルパー関数を追加
const formatDateToYMD = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function CalendarRangePicker({ value, setValue }) {
  const [open, setOpen] = useState(false);
  const [isSelectingStartDate, setIsSelectingStartDate] = useState(true);

  const getRange = () => {
    // 日付文字列をDateオブジェクトに変換する際、タイムゾーンのズレを考慮する
    // YYYY-MM-DD形式だとUTCとして解釈されるため、明示的にローカルタイムとして扱う
    if (value.dates.start && value.dates.end) {
      return [{
        startDate: new Date(value.dates.start + "T00:00:00"),
        endDate: new Date(value.dates.end + "T00:00:00"),
        key: "selection"
      }];
    }
    return [{
      startDate: new Date(),
      endDate: new Date(),
      key: "selection"
    }];
  };

  const handleSelect = (ranges) => {
    const { startDate, endDate } = ranges.selection;
    setValue((prev) => ({
      ...prev,
      dates: {
        // 【修正点②】新しいヘルパー関数を使って日付を文字列に変換
        start: formatDateToYMD(startDate),
        end: formatDateToYMD(endDate),
      },
    }));

    if (isSelectingStartDate) {
      if (startDate.getTime() !== endDate.getTime()) {
        setOpen(false);
      } else {
        setIsSelectingStartDate(false);
      }
    } else {
      setOpen(false);
      setIsSelectingStartDate(true);
    }
  };

  return (
    <div style={{ marginBottom: 24 }}>
      <label style={{ fontWeight: 600, marginBottom: 8, display: "block" }}>
        日程
      </label>
      <button
        onClick={() => {
          setOpen(true);
          setIsSelectingStartDate(true);
        }}
        style={{
          padding: "10px 20px",
          borderRadius: 8,
          border: "1px solid #00C0B8",
          background: "#fff",
          color: "#00C0B8",
          fontWeight: 700,
          fontSize: 18,
          cursor: "pointer"
        }}
      >
        {value.dates.start && value.dates.end
          ? `${value.dates.start} ～ ${value.dates.end}`
          : "日程を選択"}
      </button>
      {open && (
        <div style={{
          position: "absolute",
          zIndex: 10,
          background: "#fff",
          boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
          borderRadius: 8,
        }}>
          <DateRange
            editableDateInputs={true}
            onChange={handleSelect}
            moveRangeOnFirstSelection={false}
            ranges={getRange()}
            locale={ja}
            months={1}
            direction="horizontal"
            showMonthAndYearPickers={true}
            minDate={new Date()}
          />
          <button
            onClick={() => {
                setOpen(false)
                setIsSelectingStartDate(true)
            }}
            style={{
              margin: "10px 0 10px 10px",
              background: "#00C0B8",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "7px 16px",
              cursor: "pointer"
            }}
          >
            閉じる
          </button>
        </div>
      )}
    </div>
  );
}