"use client";

import { useMemo, useState } from "react";
import { History, Search } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useApp } from "@/providers/AppProvider";
import { cn, formatDateTime } from "@/lib/utils";
import { ORDER_STATUS_LABELS, USER_ROLE_LABELS } from "@/lib/constants/labels";
import { isStageCompletionAdmin } from "@/lib/workflow-permissions";
import type { OrderStatus, OrderStatusHistory, OrderWithRelations, User } from "@/lib/types";

type HistoryKind =
  | "create"
  | "design"
  | "print"
  | "process"
  | "finish"
  | "pack"
  | "ship"
  | "edit"
  | "payment"
  | "teeth"
  | "status"
  | "override";

interface TimelineEntry {
  id: string;
  at: Date;
  kind: HistoryKind;
  status: OrderStatus;
  action: string;
  notes?: string | null;
  actorName: string;
  actorRole: string;
  advanced: boolean;
}

const KIND_META: Record<
  HistoryKind,
  { icon: string; label: string; ring: string; bg: string }
> = {
  create: { icon: "🟢", label: "יצירה", ring: "border-emerald-400", bg: "bg-emerald-50" },
  design: { icon: "🎨", label: "עיצוב", ring: "border-violet-400", bg: "bg-violet-50" },
  print: { icon: "🖨️", label: "הדפסה / חריטה", ring: "border-cyan-400", bg: "bg-cyan-50" },
  process: { icon: "⚙️", label: "עיבוד", ring: "border-amber-400", bg: "bg-amber-50" },
  finish: { icon: "✨", label: "גימור", ring: "border-orange-400", bg: "bg-orange-50" },
  pack: { icon: "📦", label: "אריזה", ring: "border-teal-400", bg: "bg-teal-50" },
  ship: { icon: "🚚", label: "משלוח", ring: "border-green-400", bg: "bg-green-50" },
  edit: { icon: "✏️", label: "עריכה", ring: "border-slate-400", bg: "bg-slate-50" },
  payment: { icon: "💰", label: "תשלום", ring: "border-yellow-400", bg: "bg-yellow-50" },
  teeth: { icon: "🦷", label: "שיניים", ring: "border-sky-400", bg: "bg-sky-50" },
  status: { icon: "🔄", label: "שינוי סטטוס", ring: "border-indigo-400", bg: "bg-indigo-50" },
  override: { icon: "🛡️", label: "Override", ring: "border-rose-400", bg: "bg-rose-50" },
};

function classify(h: OrderStatusHistory): { kind: HistoryKind; action: string; advanced: boolean } {
  const notes = (h.notes ?? "").trim();
  const lower = notes.toLowerCase();
  const isOverride = lower.includes("override") || notes.includes("ע״י ניהול") || notes.includes("פתיחה מחדש");

  if (isOverride) {
    return {
      kind: "override",
      action: notes || `Override · ${ORDER_STATUS_LABELS[h.status]}`,
      advanced: true,
    };
  }

  if (notes.includes("הזמנה חדשה") || h.status === "RECEIVED" && notes.includes("חדש")) {
    return { kind: "create", action: notes || "יצר/ה את ההזמנה", advanced: false };
  }
  if (notes.includes("שלב הושלם") || notes.includes("✓")) {
    const kind =
      h.status === "PRINTING_3D" || h.status === "MILLING"
        ? "print"
        : h.status === "PROCESSING"
          ? "process"
          : h.status === "FINISH"
            ? "finish"
            : h.status === "PACKAGING"
              ? "pack"
              : h.status === "SHIPPED" || h.status === "DELIVERED"
                ? "ship"
                : h.status === "DESIGN" || h.status === "FILES_ATTACHED"
                  ? "design"
                  : "status";
    return {
      kind,
      action: notes || `עודכן ל־${ORDER_STATUS_LABELS[h.status]}`,
      advanced: false,
    };
  }
  if (notes.includes("ביטול") || notes.includes("פתיחה מחדש")) {
    return { kind: "status", action: notes, advanced: isOverride };
  }
  if (notes.includes("משלוח") || h.status === "SHIPPED" || h.status === "DELIVERED") {
    return { kind: "ship", action: notes || "מוכן למסירה / משלוח", advanced: false };
  }
  if (notes.includes("שיניים") || notes.includes("teeth")) {
    return { kind: "teeth", action: notes, advanced: false };
  }
  if (notes.includes("תשלום") || notes.includes("חיוב")) {
    return { kind: "payment", action: notes, advanced: false };
  }
  if (notes.includes("עריכ")) {
    return { kind: "edit", action: notes, advanced: false };
  }

  const byStatus: Partial<Record<OrderStatus, HistoryKind>> = {
    RECEIVED: "create",
    FILES_ATTACHED: "edit",
    DESIGN: "design",
    PRINTING_3D: "print",
    MILLING: "print",
    PROCESSING: "process",
    FINISH: "finish",
    PACKAGING: "pack",
    SHIPPED: "ship",
    DELIVERED: "ship",
  };

  return {
    kind: byStatus[h.status] ?? "status",
    action: notes || `סטטוס: ${ORDER_STATUS_LABELS[h.status]}`,
    advanced: false,
  };
}

function toEntries(
  history: OrderStatusHistory[],
  users: User[],
): TimelineEntry[] {
  return [...history]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((h) => {
      const actor = users.find((u) => u.id === h.changedBy);
      const { kind, action, advanced } = classify(h);
      const role = actor?.roles?.[0] ?? actor?.role;
      return {
        id: h.id,
        at: new Date(h.createdAt),
        kind,
        status: h.status,
        action,
        notes: h.notes,
        actorName: actor?.name ?? "משתמש לא ידוע",
        actorRole: role ? USER_ROLE_LABELS[role] : "—",
        advanced,
      };
    });
}

interface OrderHistoryModalProps {
  open: boolean;
  onClose: () => void;
  order: Pick<OrderWithRelations, "serialNumber" | "statusHistory">;
  users: User[];
  currentUser: User | null;
}

export function OrderHistoryModal({
  open,
  onClose,
  order,
  users,
  currentUser,
}: OrderHistoryModalProps) {
  const [q, setQ] = useState("");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const showAdvanced = currentUser ? isStageCompletionAdmin(currentUser) : false;

  const entries = useMemo(() => {
    let list = toEntries(order.statusHistory, users);
    if (!showAdvanced) list = list.filter((e) => !e.advanced);
    if (kindFilter !== "all") list = list.filter((e) => e.kind === kindFilter);
    const needle = q.trim().toLowerCase();
    if (needle) {
      list = list.filter((e) => {
        const dateStr = formatDateTime(e.at);
        return (
          e.actorName.toLowerCase().includes(needle) ||
          e.action.toLowerCase().includes(needle) ||
          e.actorRole.toLowerCase().includes(needle) ||
          ORDER_STATUS_LABELS[e.status].includes(needle) ||
          dateStr.includes(needle) ||
          KIND_META[e.kind].label.includes(needle)
        );
      });
    }
    return list;
  }, [order.statusHistory, users, showAdvanced, kindFilter, q]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`היסטוריית הזמנה · ${order.serialNumber}`}
      className="max-w-xl max-h-[70vh]"
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="חיפוש: עובד, פעולה, תאריך..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pr-9 pl-3 text-sm outline-none focus:border-violet-300 focus:bg-white"
            />
          </label>
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="all">כל הפעולות</option>
            {Object.entries(KIND_META).map(([key, meta]) => (
              <option key={key} value={key}>
                {meta.icon} {meta.label}
              </option>
            ))}
          </select>
        </div>

        {entries.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">אין רשומות היסטוריה</p>
        ) : (
          <ol className="space-y-0">
            {entries.map((e, idx) => {
              const meta = KIND_META[e.kind];
              return (
                <li key={e.id}>
                  <div className="flex gap-3">
                    <div className="flex w-8 flex-col items-center">
                      <span
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm",
                          meta.ring,
                          meta.bg,
                        )}
                      >
                        {meta.icon}
                      </span>
                      {idx < entries.length - 1 && (
                        <span className="my-1 w-px flex-1 min-h-[1.25rem] bg-slate-200" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 pb-4">
                      <p className="text-xs text-slate-400">{formatDateTime(e.at)}</p>
                      <p className="mt-0.5 text-sm font-semibold text-slate-900">
                        {e.actorName}
                        <span className="mr-2 font-normal text-slate-400">· {e.actorRole}</span>
                      </p>
                      <p className="text-sm text-slate-700">{e.action}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        שלב: {ORDER_STATUS_LABELS[e.status]}
                        {e.notes && e.notes !== e.action ? ` · ${e.notes}` : ""}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <p className="border-t pt-3 text-center text-[11px] text-slate-400">
          היסטוריה לקריאה בלבד · הרשומות נשמרות אוטומטית
        </p>
      </div>
    </Modal>
  );
}

interface OrderHistoryButtonProps {
  order: Pick<OrderWithRelations, "id" | "serialNumber" | "statusHistory">;
  className?: string;
  /** Compact icon-only (default) */
  showLabel?: boolean;
}

export function OrderHistoryButton({ order, className, showLabel }: OrderHistoryButtonProps) {
  const { users, currentUser } = useApp();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        title="היסטוריית הזמנה"
        aria-label="היסטוריית הזמנה"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={cn(
          "inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 transition-colors hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700",
          showLabel && "px-2.5 text-xs font-medium",
          className,
        )}
      >
        <History className="h-4 w-4" />
        {showLabel ? <span>היסטוריה</span> : null}
      </button>
      <OrderHistoryModal
        open={open}
        onClose={() => setOpen(false)}
        order={order}
        users={users}
        currentUser={currentUser}
      />
    </>
  );
}
