"use client";

import { useEffect, useState } from "react";

export default function EditableText({
  value,
  onSave,
  style,
  inputWidth,
  allowEmpty,
}: {
  value: string;
  onSave: (next: string) => void;
  style?: React.CSSProperties;
  inputWidth?: number | string;
  // Varsayılan: boş bırakılınca kaydetmeden eski değere döner (yanlışlıkla her şeyi silip
  // çift tıklamayı kaçırma durumuna karşı). Notlar gibi gerçekten temizlenebilmesi gereken
  // alanlarda allowEmpty ile boş kayda izin verilir (Gökhan: "sonradan eklenen notları
  // silemiyoruz").
  allowEmpty?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => { setDraft(value); }, [value]);

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed !== value && (trimmed || allowEmpty)) onSave(trimmed);
    else setDraft(value);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        style={{
          ...style,
          border: "1px solid var(--brand)",
          borderRadius: 6,
          padding: "1px 4px",
          background: "var(--card)",
          outline: "none",
          width: inputWidth,
        }}
      />
    );
  }

  return (
    <span
      onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
      style={style}
      title="Çift tıkla, düzenle"
    >
      {value}
    </span>
  );
}
