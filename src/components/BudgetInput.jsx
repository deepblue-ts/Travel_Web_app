export default function BudgetInput({ value, setValue }) {
  const MIN_BUDGET = 10000;
  const MAX_BUDGET = 300000;

  // スライダーの進捗率を計算（トラックの背景色のため）
  const getProgress = (currentValue) => {
    // ユーザーがテキスト入力で範囲外の値を入力した場合も考慮し、表示を0-100%の範囲に収める
    const boundedValue = Math.max(MIN_BUDGET, Math.min(currentValue, MAX_BUDGET));
    return ((boundedValue - MIN_BUDGET) / (MAX_BUDGET - MIN_BUDGET)) * 100;
  };
  const progress = getProgress(value.budget);

  // スライダーのトラックのスタイル
  const sliderStyle = {
    WebkitAppearance: "none",
    appearance: "none",
    width: "100%",
    height: "8px",
    borderRadius: "4px",
    background: `linear-gradient(to right, #00C0B8 ${progress}%, #d3d3d3 ${progress}%)`,
    outline: "none",
    cursor: "pointer",
  };

  // テキスト入力のハンドラ
  const handleTextInputChange = (e) => {
    const val = e.target.value;
    // ユーザーが入力欄を空にできるように、空の場合は0として扱う
    const newBudget = val === "" ? 0 : parseInt(val, 10);

    // 数字でない入力(NaN)を防ぐ
    if (!isNaN(newBudget)) {
      setValue(p => ({ ...p, budget: newBudget }));
    }
  };

  return (
    <div style={{ marginBottom: 28 }}>
      <label style={{ fontWeight: 600, display: "block" }}>
        予算
      </label>

      {/* テキスト入力と「円」の単位を横並びにするコンテナ */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        margin: "8px 0 12px 0",
      }}>
        <input
          type="number"
          step={1000} // number入力の上下ボタンの増減単位
          value={value.budget}
          onChange={handleTextInputChange}
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "#00C0B8",
            border: "1px solid #ccc",
            borderRadius: 7,
            padding: "8px 12px",
            width: "150px", // 入力欄の幅を固定
            textAlign: "right",
          }}
        />
        <span style={{ fontSize: 18, fontWeight: 600 }}>円</span>
      </div>

      {/* スライダー */}
      <input
        type="range"
        min={MIN_BUDGET}
        max={MAX_BUDGET}
        step={1000}
        value={value.budget}
        onChange={e => setValue(p => ({ ...p, budget: Number(e.target.value) }))}
        style={sliderStyle}
      />

      {/* 最小値と最大値のラベル */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        marginTop: 4,
        color: "#555",
        fontSize: 14,
      }}>
        <span>{MIN_BUDGET.toLocaleString()}円</span>
        <span>{MAX_BUDGET.toLocaleString()}円</span>
      </div>
    </div>
  );
}