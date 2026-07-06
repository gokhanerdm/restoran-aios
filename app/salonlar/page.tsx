"use client";

import { useCallback, useEffect, useState, createContext, useContext } from "react";
import { supabase } from "@/lib/supabase/client";
import { Plus, ChevronDown, ChevronRight, Folder, GripVertical, Trash2 } from "lucide-react";
import EditableText from "../components/EditableText";
import { toUpperTr, toTitleTr } from "@/lib/text";
import {
  DndContext, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Table = { id: string; name: string; status: "empty" | "occupied" | "bill_requested"; area_id: string | null; sort_order: number };
type Area = { id: string; name: string; sort_order: number };
type Section = { id: string; name: string; tables: Table[] };

const UNGROUPED = "__ungrouped";
const statusLabel: Record<string, string> = { empty: "Boş", occupied: "Dolu", bill_requested: "Hesap istedi" };

type Ctx = {
  expanded: Set<string>;
  toggle: (id: string) => void;
  renameArea: (id: string, name: string) => void;
  renameTable: (id: string, name: string) => void;
  deleteArea: (sec: Section) => void;
  deleteTable: (t: Table) => void;
  promoteUngrouped: (name: string) => void;
  addTable: (areaId: string | null, name: string) => void;
};
const SalonCtx = createContext<Ctx | null>(null);
const useSalon = () => useContext(SalonCtx)!;

export default function SalonlarPage() {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set([UNGROUPED]));
  const [newAreaName, setNewAreaName] = useState("");
  const [addingArea, setAddingArea] = useState(false);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  const load = useCallback(async () => {
    const { data: rest } = await supabase.from("restaurants").select("id").is("deleted_at", null).limit(1).single();
    if (!rest) return;
    setRestaurantId(rest.id);
    const [{ data: t }, { data: a }] = await Promise.all([
      supabase.from("restaurant_tables").select("id, name, status, area_id, sort_order").eq("restaurant_id", rest.id).is("deleted_at", null).order("sort_order"),
      supabase.from("dining_areas").select("id, name, sort_order").eq("restaurant_id", rest.id).is("deleted_at", null).order("sort_order"),
    ]);
    setTables((t as Table[]) ?? []);
    setAreas((a as Area[]) ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = (id: string) => {
    setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const addArea = async () => {
    if (!restaurantId || !newAreaName.trim()) return;
    const { data } = await supabase.from("dining_areas").insert({ restaurant_id: restaurantId, name: toUpperTr(newAreaName), sort_order: areas.length }).select("id").single();
    setNewAreaName(""); setAddingArea(false);
    await load();
    if (data) setExpanded((prev) => new Set(prev).add(data.id));
  };

  const renameArea = async (id: string, name: string) => {
    await supabase.from("dining_areas").update({ name: toUpperTr(name) }).eq("id", id);
    await load();
  };
  const renameTable = async (id: string, name: string) => {
    await supabase.from("restaurant_tables").update({ name: toTitleTr(name) }).eq("id", id);
    await load();
  };
  const deleteArea = async (sec: Section) => {
    if (sec.tables.length > 0) {
      const ok = window.confirm(`Bu salonda ${sec.tables.length} masa var. Silersen masalar "Diğer"e düşer. Yine de silinsin mi?`);
      if (!ok) return;
    }
    await supabase.from("dining_areas").update({ deleted_at: new Date().toISOString() }).eq("id", sec.id);
    await load();
  };
  const deleteTable = async (t: Table) => {
    const ok = window.confirm(`"${t.name}" silinsin mi?`);
    if (!ok) return;
    await supabase.from("restaurant_tables").update({ deleted_at: new Date().toISOString() }).eq("id", t.id);
    await load();
  };
  const addTable = async (areaId: string | null, name: string) => {
    if (!restaurantId || !name.trim()) return;
    const count = tables.filter((t) => (t.area_id ?? null) === areaId).length;
    await supabase.from("restaurant_tables").insert({ restaurant_id: restaurantId, name: toTitleTr(name), area_id: areaId, status: "empty", sort_order: count });
    await load();
  };
  const promoteUngrouped = async (name: string) => {
    if (!restaurantId) return;
    const { data: a } = await supabase.from("dining_areas").insert({ restaurant_id: restaurantId, name: toUpperTr(name), sort_order: areas.length }).select("id").single();
    if (!a) return;
    await supabase.from("restaurant_tables").update({ area_id: a.id }).eq("restaurant_id", restaurantId).is("area_id", null);
    setExpanded((prev) => new Set(prev).add(a.id));
    await load();
  };

  const ungrouped = tables.filter((t) => !t.area_id).sort((a, b) => a.sort_order - b.sort_order);
  const sections: Section[] = [
    ...areas.map((a) => ({ id: a.id, name: a.name, tables: tables.filter((t) => t.area_id === a.id).sort((x, y) => x.sort_order - y.sort_order) })),
    { id: UNGROUPED, name: "Diğer", tables: ungrouped },
  ];
  const sortableSectionIds = areas.map((a) => a.id);

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    if (sortableSectionIds.includes(String(active.id)) && sortableSectionIds.includes(String(over.id))) {
      const oldIndex = areas.findIndex((a) => a.id === active.id);
      const newIndex = areas.findIndex((a) => a.id === over.id);
      const reordered = arrayMove(areas, oldIndex, newIndex);
      await Promise.all(reordered.map((a, i) => supabase.from("dining_areas").update({ sort_order: i }).eq("id", a.id)));
      await load();
      return;
    }

    const sec = sections.find((s) => s.tables.some((t) => t.id === active.id) && s.tables.some((t) => t.id === over.id));
    if (!sec) return;
    const oldIndex = sec.tables.findIndex((t) => t.id === active.id);
    const newIndex = sec.tables.findIndex((t) => t.id === over.id);
    const reordered = arrayMove(sec.tables, oldIndex, newIndex);
    await Promise.all(reordered.map((t, i) => supabase.from("restaurant_tables").update({ sort_order: i }).eq("id", t.id)));
    await load();
  };

  const ctx: Ctx = { expanded, toggle, renameArea, renameTable, deleteArea, deleteTable, promoteUngrouped, addTable };

  return (
    <div style={{ padding: "26px 28px", height: "calc(100vh - 4px)", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      <div style={{ flexShrink: 0, marginBottom: 16 }}>
        <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)" }}>Salonlar</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6 }}>{tables.length} masa · {areas.length} salon</div>
      </div>

      <div style={{ flex: 1, minHeight: 0, maxWidth: 480, display: "flex", flexDirection: "column" }}>
        <div style={{ border: "1px solid var(--line)", borderRadius: 18, background: "var(--card)", flex: 1, overflowY: "auto", minHeight: 0 }}>
          <SalonCtx.Provider value={ctx}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={sortableSectionIds} strategy={verticalListSortingStrategy}>
                {areas.map((a) => {
                  const sec = sections.find((s) => s.id === a.id)!;
                  return <SectionRow key={sec.id} sec={sec} sortable />;
                })}
              </SortableContext>
              {(() => {
                const diger = sections.find((s) => s.id === UNGROUPED)!;
                if (diger.tables.length === 0 && areas.length > 0) return null;
                return <SectionRow sec={diger} sortable={false} />;
              })()}
            </DndContext>
          </SalonCtx.Provider>
        </div>

        <div style={{ flexShrink: 0, marginTop: 12 }}>
          {!addingArea ? (
            <button onClick={() => setAddingArea(true)} style={btnSecondary}><Plus size={15} /> Yeni salon</button>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <input value={newAreaName} onChange={(e) => setNewAreaName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addArea()} placeholder="Salon adı (Salon, Bahçe, VIP)" style={{ ...inp, flex: 1 }} autoFocus />
              <button onClick={addArea} style={btnSmall}>Ekle</button>
            </div>
          )}
          <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 8 }}>Sıralamak için tutma kolundan sürükle. Masa durumu Kasa'da yönetilir.</div>
        </div>
      </div>
    </div>
  );
}

function SectionRow({ sec, sortable }: { sec: Section; sortable: boolean }) {
  const s = useSalon();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sec.id, disabled: !sortable });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const open = s.expanded.has(sec.id);
  const [addingTable, setAddingTable] = useState(false);
  const [tName, setTName] = useState("");

  return (
    <div ref={setNodeRef} style={style}>
      <div style={{ display: "flex", alignItems: "center", background: open ? "var(--recede)" : "transparent" }}>
        {sortable ? (
          <button {...attributes} {...listeners} aria-label="taşı" style={{ all: "unset", cursor: "grab", padding: "0 6px 0 10px", color: "var(--muted-2)", touchAction: "none", display: "inline-flex" }}><GripVertical size={16} /></button>
        ) : (
          <span style={{ width: 22 }} />
        )}
        <div onClick={() => s.toggle(sec.id)} style={{ cursor: "pointer", flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "10px 14px 10px 4px" }}>
          {open ? <ChevronDown size={15} color="var(--muted)" /> : <ChevronRight size={15} color="var(--muted)" />}
          <Folder size={15} color="var(--brand)" />
          <EditableText value={sec.name} onSave={(v) => (sec.id === UNGROUPED ? s.promoteUngrouped(v) : s.renameArea(sec.id, v))} style={{ fontWeight: 600, fontSize: 14, color: "var(--ink-green)" }} />
          <span style={{ fontSize: 12, color: "var(--muted-2)" }}>({sec.tables.length})</span>
        </div>
        {sec.id !== UNGROUPED && (
          <button onClick={() => s.deleteArea(sec)} aria-label="salonu sil" style={{ all: "unset", cursor: "pointer", padding: "0 14px", color: "var(--muted-2)" }}><Trash2 size={13} /></button>
        )}
      </div>

      {open && (
        <div>
          <SortableContext items={sec.tables.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {sec.tables.map((t) => <TableRow key={t.id} table={t} />)}
          </SortableContext>
          {sec.tables.length === 0 && <div style={{ fontSize: 12.5, color: "var(--muted-2)", padding: "6px 14px 6px 44px" }}>Bu salonda masa yok</div>}

          {addingTable ? (
            <div style={{ display: "flex", gap: 8, padding: "8px 14px 10px 44px" }}>
              {(() => {
                const submit = () => { s.addTable(sec.id === UNGROUPED ? null : sec.id, tName); setTName(""); setAddingTable(false); };
                return (
                  <>
                    <input value={tName} onChange={(e) => setTName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Masa adı (Masa 9)" style={{ ...inp, flex: 1 }} autoFocus />
                    <button onClick={submit} style={btnSmall}>Ekle</button>
                  </>
                );
              })()}
            </div>
          ) : (
            <button onClick={() => { setAddingTable(true); setTName(""); }} style={{ all: "unset", cursor: "pointer", fontSize: 12.5, color: "var(--brand)", padding: "6px 14px 10px 44px", display: "block" }}>
              + masa
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TableRow({ table }: { table: Table }) {
  const s = useSalon();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: table.id });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, display: "flex", alignItems: "center", borderBottom: "1px solid var(--line)" };
  const dotColor = table.status === "empty" ? "var(--muted-2)" : table.status === "bill_requested" ? "var(--gold)" : "var(--brand)";

  return (
    <div ref={setNodeRef} style={style}>
      <button {...attributes} {...listeners} aria-label="taşı" style={{ all: "unset", cursor: "grab", padding: "0 6px 0 24px", color: "var(--muted-2)", touchAction: "none", display: "inline-flex" }}><GripVertical size={14} /></button>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "9px 14px 9px 4px" }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: dotColor }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <EditableText value={table.name} onSave={(v) => s.renameTable(table.id, v)} style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink)" }} />
        </div>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{statusLabel[table.status]}</span>
      </div>
      <button onClick={() => s.deleteTable(table)} aria-label="sil" style={{ all: "unset", cursor: "pointer", padding: "0 12px", color: "var(--muted-2)" }}><Trash2 size={13} /></button>
    </div>
  );
}

const inp: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 10, padding: "9px 12px", fontSize: 14, background: "var(--card)", color: "var(--ink)", outline: "none", minWidth: 0 };
const btnSecondary: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--line-2)", borderRadius: 980, padding: "9px 16px", background: "var(--card)", color: "var(--ink-green)", fontSize: 13.5, width: "100%", justifyContent: "center" };
const btnSmall: React.CSSProperties = { border: "none", borderRadius: 10, padding: "9px 14px", background: "var(--ink-green)", color: "#fff", fontSize: 13.5 };
