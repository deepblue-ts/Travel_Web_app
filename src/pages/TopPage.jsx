export default function TopPage({ onStart }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", height: "100vh", background: "#fff"
    }}>
      <h1 style={{ color: "#00C0B8", fontSize: 48, marginBottom: 24 }}>
        AIトラベルプランナー
      </h1>
      <button
        style={{
          background: "#00C0B8", color: "#fff", border: "none",
          borderRadius: 8, fontSize: 22, padding: "16px 56px", fontWeight: 700,
          cursor: "pointer"
        }}
        onClick={onStart}
      >
        Start
      </button>
    </div>
  );
}
