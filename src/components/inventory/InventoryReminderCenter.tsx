"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Bell, Loader2 } from "lucide-react";
import { Header } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import {
  ALERT_LABELS,
  REMINDER_MODULE_LABELS,
  REMINDER_MODULES,
  modulePath,
  taskStatusLabel,
  type CountTaskState,
} from "@/lib/inventory/inventory-reminder-rules";
type InventoryModuleType = (typeof REMINDER_MODULES)[number];

type Summary = { open: number; planned: number; overdue: number; completed: number; low: number; zero: number };
type AlertRow = { id: string; kind: keyof typeof ALERT_LABELS; severity: string; title: string; body: string; href: string; overdueDays: number; inventoryType: InventoryModuleType | null; taskId: string | null; itemId: string | null };
type TaskRow = { id: string; inventoryType: InventoryModuleType; periodKey: string; dueDate: string; status: CountTaskState; overdueDays: number; countId: string | null; assignedToId: string | null; assignedTo: { id: string; name: string } | null; count: { id: string; serial: number; status: string } | null };
type Policy = { inventoryType: InventoryModuleType; frequencyDays: number; enabled: boolean; emailEnabled: boolean; anchorDate: string };
type Center = {
  canManage: boolean;
  email: { configured: boolean; reason: string };
  policies: Policy[];
  tasks: TaskRow[];
  alerts: AlertRow[];
  events: { id: string; kind: string; channel: string; detail: string; createdAt: string; alert: { title: string } }[];
  secretaries: { id: string; name: string }[];
  replenishments: { id: string; itemName: string; quantity: number | null; inventoryType: InventoryModuleType }[];
  summary: Summary;
  lastRun: { status: string; error: string; startedAt: string } | null;
};
type Line = { itemId: string; name: string; quantityAtStart: number | null; countedQuantity: number | null; notes: string; skipReason: string };
type TaskDetail = { id: string; inventoryType: InventoryModuleType; status: CountTaskState; count: { id: string; status: string; lines: Line[] } | null };

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) throw new Error(body?.error?.message || "הפעולה נכשלה");
  return body.data as T;
}

export function InventoryReminderCenter() {
  const params = useSearchParams();
  const filter = params.get("filter") ?? params.get("kind") ?? "all";
  const taskId = params.get("task");
  const [center, setCenter] = useState<Center | null>(null);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { quantity: string; reason: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [itemType, setItemType] = useState<InventoryModuleType>("IMPLANTS");
  const [items, setItems] = useState<{ id: string; name: string; quantity: number | null }[]>([]);
  const [thresholds, setThresholds] = useState<Record<string, { minQuantity: string; targetQuantity: string; alertsEnabled: boolean }>>({});

  const load = useCallback(async () => {
    const data = await readJson<Center>(await fetch("/api/inventory/reminders", { credentials: "include" }));
    setCenter(data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await load();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "שגיאה בטעינה");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [load]);

  useEffect(() => {
    if (!taskId) { setDetail(null); return; }
    let cancelled = false;
    void (async () => {
      try {
        const data = await readJson<{ task: TaskDetail }>(await fetch(`/api/inventory/reminders?task=${encodeURIComponent(taskId)}`, { credentials: "include" }));
        if (cancelled) return;
        setDetail(data.task);
        setDrafts(Object.fromEntries((data.task.count?.lines ?? []).map((line) => [line.itemId, { quantity: line.countedQuantity === null ? "" : String(line.countedQuantity), reason: line.skipReason }])));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "שגיאה בטעינת הספירה");
      }
    })();
    return () => { cancelled = true; };
  }, [taskId]);

  useEffect(() => {
    if (!center?.canManage) return;
    let cancelled = false;
    void (async () => {
      const data = await readJson<{ items: { id: string; name: string; quantity: number | null }[]; thresholds: { itemId: string; minQuantity: number | null; targetQuantity: number | null; alertsEnabled: boolean }[] }>(await fetch(`/api/inventory/reminders?items=${itemType}`, { credentials: "include" }));
      if (cancelled) return;
      setItems(data.items);
      setThresholds(Object.fromEntries(data.thresholds.map((row) => [row.itemId, { minQuantity: row.minQuantity === null ? "" : String(row.minQuantity), targetQuantity: row.targetQuantity === null ? "" : String(row.targetQuantity), alertsEnabled: row.alertsEnabled }])));
    })().catch((err: unknown) => setError(err instanceof Error ? err.message : "שגיאה בטעינת פריטים"));
    return () => { cancelled = true; };
  }, [center?.canManage, itemType]);

  async function act(body: unknown) {
    setBusy(true);
    setError(null);
    try {
      await readJson(await fetch("/api/inventory/reminders", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
      await load();
      if (taskId) {
        const data = await readJson<{ task: TaskDetail }>(await fetch(`/api/inventory/reminders?task=${encodeURIComponent(taskId)}`, { credentials: "include" }));
        setDetail(data.task);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשמירה");
    } finally {
      setBusy(false);
    }
  }

  const alerts = (center?.alerts ?? []).filter((alert) => {
    if (filter === "all") return true;
    if (filter === "overdue") return alert.kind === "COUNT_OVERDUE" || alert.kind === "COUNT_ESCALATION";
    if (filter === "planned") return alert.kind === "COUNT_UPCOMING" || alert.kind === "COUNT_DUE";
    if (filter === "completed") return false;
    if (filter === "low") return alert.kind === "LOW_STOCK";
    if (filter === "zero") return alert.kind === "ZERO_STOCK";
    return alert.kind === filter;
  });
  const tasks = (center?.tasks ?? []).filter((task) => {
    if (filter === "overdue") return task.status === "OVERDUE" || task.overdueDays > 0;
    if (filter === "planned") return task.status === "PLANNED" || task.status === "DUE";
    if (filter === "completed") return task.status === "COMPLETED";
    return true;
  });

  return (
    <>
      <Header title="התראות מלאי" description="ספירות חובה, חוסרים והפרשים" actions={<a className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" href="/api/inventory/reminders/reports?kind=overdue&format=xlsx">Excel איחורים</a>} />
      {error && <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {loading || !center ? <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-opal-gold" /></div> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <CardLink href="/inventory/reminders?filter=planned" label="ספירות מתוכננות" value={center.summary.planned} />
            <CardLink href="/inventory/reminders?filter=overdue" label="ספירות באיחור" value={center.summary.overdue} danger />
            <CardLink href="/inventory/reminders?filter=completed" label="ספירות שהושלמו" value={center.summary.completed} />
            <CardLink href="/inventory/reminders?filter=low" label="פריטים בחוסר" value={center.summary.low} />
            <CardLink href="/inventory/reminders?filter=zero" label="פריטים בכמות אפס" value={center.summary.zero} danger />
          </div>
          <p className="text-xs text-slate-500">{center.email.reason} {center.lastRun ? `· הרצה אחרונה ${center.lastRun.status}` : ""}</p>

          <section className="rounded-xl border border-slate-200 bg-white p-3">
            <h2 className="mb-2 font-bold text-slate-900">התראות פתוחות ({alerts.length})</h2>
            <div className="space-y-2">
              {alerts.length === 0 && <p className="text-sm text-slate-500">אין התראות במסנן הזה.</p>}
              {alerts.map((alert) => (
                <article key={alert.id} className={`rounded-lg border px-3 py-2 ${alert.severity === "CRITICAL" ? "border-red-300 bg-red-50" : "border-slate-200"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={alert.href} className="font-medium text-slate-900">{alert.title}</Link>
                    {alert.overdueDays > 0 && <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">באיחור {alert.overdueDays} ימים</span>}
                  </div>
                  <p className="text-sm text-slate-600">{alert.body}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {alert.taskId && <Link href={`/inventory/reminders?task=${alert.taskId}`} className="text-xs font-medium text-opal-gold-dark">פתח ספירה</Link>}
                    {alert.inventoryType && <Link href={modulePath(alert.inventoryType)} className="text-xs font-medium text-slate-700">פתח פריט</Link>}
                    {alert.itemId && alert.inventoryType && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void act({ action: "replenish", inventoryType: alert.inventoryType, itemId: alert.itemId })}>צור משימת השלמת מלאי</Button>}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-3">
            <h2 className="mb-2 font-bold text-slate-900">משימות ספירה</h2>
            <div className="space-y-2">
              {tasks.map((task) => (
                <div key={task.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm">
                  <Link href={`/inventory/reminders?task=${task.id}`} className="font-medium">{REMINDER_MODULE_LABELS[task.inventoryType]} · {task.periodKey}</Link>
                  <span>{taskStatusLabel(task.status)}</span>
                  {task.overdueDays > 0 && task.status !== "COMPLETED" && <span className="text-red-600">באיחור {task.overdueDays}</span>}
                  {task.status !== "COMPLETED" && !task.countId && <Button type="button" size="sm" disabled={busy} onClick={() => void act({ action: "start", taskId: task.id })}>התחל ספירה</Button>}
                  {center.canManage && (
                    <select className="rounded-lg border border-slate-200 px-2 py-1 text-xs" value={task.assignedToId ?? ""} onChange={(event) => void act({ action: "assign", taskId: task.id, assignedToId: event.target.value || null })}>
                      <option value="">שיוך</option>
                      {center.secretaries.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                    </select>
                  )}
                </div>
              ))}
              {tasks.length === 0 && <p className="text-sm text-slate-500">אין משימות במסנן. משימה חודשית נוצרת יומיים לפני המועד.</p>}
            </div>
          </section>

          {detail?.count && (
            <section className="rounded-xl border border-opal-gold bg-white p-3">
              <h2 className="mb-2 font-bold">ספירה · {REMINDER_MODULE_LABELS[detail.inventoryType]} · {taskStatusLabel(detail.status)}</h2>
              <div className="space-y-2">
                {detail.count.lines.map((line) => (
                  <div key={line.itemId} className="grid gap-2 rounded-lg border border-slate-100 p-2 md:grid-cols-[1fr_90px_90px_1fr_auto]">
                    <div>
                      <p className="font-medium">{line.name}</p>
                      <p className="text-xs text-slate-500">במערכת {line.quantityAtStart === null ? "—" : line.quantityAtStart}</p>
                    </div>
                    <input className="rounded-lg border border-slate-200 px-2 py-1 text-sm" inputMode="numeric" placeholder="כמות" value={drafts[line.itemId]?.quantity ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [line.itemId]: { quantity: event.target.value, reason: current[line.itemId]?.reason ?? "" } }))} />
                    <span className="text-sm text-slate-600">הפרש {drafts[line.itemId]?.quantity?.trim() ? String(Number(drafts[line.itemId]?.quantity) - (line.quantityAtStart ?? 0)) : "—"}</span>
                    <input className="rounded-lg border border-slate-200 px-2 py-1 text-sm" placeholder="סיבה אם לא נספר" value={drafts[line.itemId]?.reason ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [line.itemId]: { quantity: current[line.itemId]?.quantity ?? "", reason: event.target.value } }))} />
                    <input type="file" accept="image/jpeg,image/png,image/webp" aria-label={`תמונה ${line.name}`} onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file || !taskId) return;
                      const form = new FormData();
                      form.set("taskId", taskId);
                      form.set("itemId", line.itemId);
                      form.set("file", file);
                      void fetch("/api/inventory/reminders", { method: "POST", credentials: "include", body: form }).then(async (response) => { if (!response.ok) setError("העלאת התמונה נכשלה"); });
                    }} />
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" variant="outline" disabled={busy || detail.count.status !== "DRAFT"} onClick={() => void act({ action: "save", taskId: detail.id, lines: detail.count?.lines.map((line) => ({ itemId: line.itemId, countedQuantity: drafts[line.itemId]?.quantity?.trim() ? Number(drafts[line.itemId]?.quantity) : null, skipReason: drafts[line.itemId]?.reason ?? "" })) })}>שמירה</Button>
                <Button type="button" disabled={busy || detail.count.status !== "DRAFT"} onClick={() => void act({ action: "submit", taskId: detail.id, lines: detail.count?.lines.map((line) => ({ itemId: line.itemId, countedQuantity: drafts[line.itemId]?.quantity?.trim() ? Number(drafts[line.itemId]?.quantity) : null, skipReason: drafts[line.itemId]?.reason ?? "" })) })}>שליחה לאישור</Button>
                {center.canManage && <Button type="button" disabled={busy || detail.status === "COMPLETED"} onClick={() => void act({ action: "approve", taskId: detail.id, lines: detail.count?.lines.map((line) => ({ itemId: line.itemId, countedQuantity: drafts[line.itemId]?.quantity?.trim() ? Number(drafts[line.itemId]?.quantity) : null, skipReason: drafts[line.itemId]?.reason ?? "" })) })}>אישור מנהל</Button>}
              </div>
            </section>
          )}

          {center.canManage && (
            <section className="rounded-xl border border-slate-200 bg-white p-3">
              <h2 className="mb-2 font-bold">תדירות ספירה</h2>
              <div className="space-y-2">
                {REMINDER_MODULES.map((type) => {
                  const policy = center.policies.find((row) => row.inventoryType === type);
                  return <PolicyRow key={type} type={type} policy={policy} busy={busy} onSave={(body) => void act(body)} />;
                })}
              </div>
              <h2 className="mb-2 mt-4 font-bold">סף מלאי</h2>
              <select className="mb-2 rounded-lg border border-slate-200 px-2 py-1 text-sm" value={itemType} onChange={(event) => setItemType(event.target.value as InventoryModuleType)}>
                {REMINDER_MODULES.map((type) => <option key={type} value={type}>{REMINDER_MODULE_LABELS[type]}</option>)}
              </select>
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {items.map((item) => {
                  const draft = thresholds[item.id] ?? { minQuantity: "", targetQuantity: "", alertsEnabled: false };
                  return (
                    <div key={item.id} className="grid gap-2 rounded-lg border border-slate-100 p-2 md:grid-cols-[1fr_80px_80px_auto_auto]">
                      <span className="text-sm">{item.name} · {item.quantity === null ? "—" : item.quantity}</span>
                      <input className="rounded-lg border px-2 py-1 text-sm" placeholder="מינימום" value={draft.minQuantity} onChange={(event) => setThresholds((current) => ({ ...current, [item.id]: { ...draft, minQuantity: event.target.value } }))} />
                      <input className="rounded-lg border px-2 py-1 text-sm" placeholder="רצוי" value={draft.targetQuantity} onChange={(event) => setThresholds((current) => ({ ...current, [item.id]: { ...draft, targetQuantity: event.target.value } }))} />
                      <label className="text-xs"><input type="checkbox" checked={draft.alertsEnabled} onChange={(event) => setThresholds((current) => ({ ...current, [item.id]: { ...draft, alertsEnabled: event.target.checked } }))} /> התראות</label>
                      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void act({ action: "threshold", inventoryType: itemType, itemId: item.id, minQuantity: draft.minQuantity.trim() ? Number(draft.minQuantity) : null, targetQuantity: draft.targetQuantity.trim() ? Number(draft.targetQuantity) : null, alertsEnabled: draft.alertsEnabled })}>שמירה</Button>
                    </div>
                  );
                })}
                {items.length === 0 && <p className="text-sm text-slate-500">אין פריטים בקטגוריה.</p>}
              </div>
            </section>
          )}

          <section className="rounded-xl border border-slate-200 bg-white p-3">
            <h2 className="mb-2 font-bold">היסטוריית התראות</h2>
            <div className="space-y-1 text-sm">
              {center.events.map((event) => <p key={event.id}>{new Date(event.createdAt).toLocaleString("he-IL")} · {event.alert.title} · {event.detail}</p>)}
              {center.events.length === 0 && <p className="text-slate-500">אין אירועים.</p>}
            </div>
            {center.replenishments.length > 0 && <div className="mt-3 text-sm"><p className="font-medium">משימות השלמה</p>{center.replenishments.map((row) => <p key={row.id}>{row.itemName} · {row.quantity ?? "—"}</p>)}</div>}
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {(["missed", "overdue", "low", "zero", "history", "variance"] as const).map((kind) => (
                <span key={kind} className="flex gap-2">
                  <a className="text-opal-gold-dark" href={`/api/inventory/reminders/reports?kind=${kind}&format=pdf`}>PDF {kind}</a>
                  <a className="text-slate-600" href={`/api/inventory/reminders/reports?kind=${kind}&format=xlsx`}>Excel</a>
                </span>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function CardLink({ href, label, value, danger = false }: { href: string; label: string; value: number; danger?: boolean }) {
  return (
    <Link href={href} className={`rounded-xl border bg-white px-3 py-2 ${danger ? "border-red-200" : "border-slate-200"}`}>
      <p className={`text-2xl font-bold ${danger ? "text-red-600" : "text-slate-900"}`}>{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </Link>
  );
}

function PolicyRow({ type, policy, busy, onSave }: { type: InventoryModuleType; policy?: Policy; busy: boolean; onSave: (body: unknown) => void }) {
  const [days, setDays] = useState(String(policy?.frequencyDays ?? 30));
  const [enabled, setEnabled] = useState(policy?.enabled ?? true);
  const [emailEnabled, setEmailEnabled] = useState(policy?.emailEnabled ?? false);
  useEffect(() => {
    setDays(String(policy?.frequencyDays ?? 30));
    setEnabled(policy?.enabled ?? true);
    setEmailEnabled(policy?.emailEnabled ?? false);
  }, [policy?.frequencyDays, policy?.enabled, policy?.emailEnabled]);
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="min-w-40 font-medium">{REMINDER_MODULE_LABELS[type]}</span>
      <input className="w-20 rounded-lg border px-2 py-1" inputMode="numeric" value={days} onChange={(event) => setDays(event.target.value)} aria-label={`תדירות ${REMINDER_MODULE_LABELS[type]}`} />
      <span>ימים</span>
      <label className="text-xs"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> פעיל</label>
      <label className="text-xs"><input type="checkbox" checked={emailEnabled} onChange={(event) => setEmailEnabled(event.target.checked)} /> דוא״ל</label>
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onSave({ action: "policy", inventoryType: type, frequencyDays: Number(days), enabled, emailEnabled })}>שמירה</Button>
    </div>
  );
}

export function InventoryReminderBell() {
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/inventory/reminders?view=bell", { credentials: "include" })
      .then((response) => response.json())
      .then((body) => { if (!cancelled && body?.success) setOpen(body.data.open ?? 0); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  if (open === null) return null;
  return (
    <Link href="/inventory/reminders" className="relative inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-700" aria-label={`התראות מלאי ${open}`}>
      <Bell className="h-4 w-4" />
      {open > 0 && <span className="absolute -left-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{open}</span>}
    </Link>
  );
}
