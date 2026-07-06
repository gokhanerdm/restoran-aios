export default function Soon({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={{ padding: "26px 28px", maxWidth: 720 }}>
      <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)" }}>
        {title}
      </div>
      <div
        style={{
          marginTop: 20,
          background: "var(--card)",
          border: "1px solid var(--line)",
          borderRadius: 18,
          padding: 24,
          color: "var(--muted)",
          fontSize: 14,
          lineHeight: 1.7,
        }}
      >
        {desc}
        <div style={{ marginTop: 10, fontSize: 13, color: "var(--muted-2)" }}>Bu ekran yakında.</div>
      </div>
    </div>
  );
}
