export default function StepButtons({ onBack }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 36 }}>
      <button
        onClick={onBack}
        style={{
          background: "#eee", color: "#444", border: "none",
          borderRadius: 7, fontSize: 16, padding: "9px 36px", fontWeight: 600,
          cursor: "pointer"
        }}
      >
        ◀ 戻る
      </button>
      <button
        style={{
          background: "#00C0B8", color: "#fff", border: "none",
          borderRadius: 7, fontSize: 16, padding: "9px 36px", fontWeight: 600,
          cursor: "pointer"
        }}
        // ここでAPIを呼ぶように
        onClick={() => alert("APIを叩いてプラン生成！")}
      >
        進む ▶
      </button>
    </div>
  );
}
