"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CALENDAR_STATUS_DOT,
  CALENDAR_STATUS_LABELS,
  CALENDAR_TYPE_COLORS,
  CALENDAR_TYPE_ICONS,
  CALENDAR_TYPE_LABELS,
  DEFAULT_CUSTOM_EVENT_TYPE,
  EVENT_COLOR_PRESETS,
  HOUR_END,
  HOUR_START,
  SLOT_MINUTES,
  addDays,
  addMinutes,
  endOfMonth,
  endOfWeek,
  eventColor,
  formatDateHe,
  formatTimeHe,
  isSameDay,
  minutesBetween,
  snapToSlot,
  startOfDay,
  startOfMonth,
  startOfWeek,
  type CalendarEvent,
  type CalendarEventStatus,
  type CalendarEventType,
  type CalendarView,
} from "@/lib/calendar/types";
import { canDeleteCalendarEvent, canEditCalendarEvents } from "@/lib/calendar/permissions";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api/client";
import { useApp } from "@/providers/AppProvider";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Pencil,
  Trash2,
  ExternalLink,
} from "lucide-react";

const VIEWS: { key: CalendarView; label: string }[] = [
  { key: "day", label: "יום" },
  { key: "week", label: "שבוע" },
  { key: "month", label: "חודש" },
  { key: "timeline", label: "ציר זמן" },
  { key: "agenda", label: "אג'נדה" },
];

const TYPE_FILTERS: CalendarEventType[] = [
  "DOCTOR_MEETING",
  "DELIVERY",
  "PICKUP",
  "TASK",
  "VACATION",
  "NEW_CLIENT",
  "TEAM_MEETING",
  "REMINDER",
  "REVIEW",
  "BLOCKED",
];

function hours(): number[] {
  const list: number[] = [];
  for (let h = HOUR_START; h <= HOUR_END; h++) list.push(h);
  return list;
}

function pxPerMinute(rowHeight = 48): number {
  return rowHeight / 60;
}

function parseDeepLinkDate(raw: string | null): Date | null {
  if (!raw) return null;
  // YYYY-MM-DD
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : startOfDay(d);
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : startOfDay(d);
}

export function ManagerCalendarApp() {
  const { currentUser, doctors, orders } = useApp();
  const canEdit = currentUser ? canEditCalendarEvents(currentUser) : false;
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialDate = parseDeepLinkDate(searchParams.get("date"));
  const deepEventId = searchParams.get("eventId");
  const openNew = searchParams.get("new") === "1";

  const [view, setView] = useState<CalendarView>("week");
  const [cursor, setCursor] = useState(() => initialDate ?? startOfDay(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<CalendarEventType[]>([]);
  const [now, setNow] = useState(() => new Date());

  const [preview, setPreview] = useState<CalendarEvent | null>(null);
  const [editor, setEditor] = useState<null | { mode: "create" | "edit"; event?: CalendarEvent; draftStarts?: Date; draftEnds?: Date }>(null);
  const [ctxMenu, setCtxMenu] = useState<null | { x: number; y: number; event: CalendarEvent }>(null);
  const [vacationPrompt, setVacationPrompt] = useState<null | Record<string, unknown>>(null);
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const loadReqId = useRef(0);
  const deepLinkHandled = useRef(false);

  const range = useMemo(() => {
    if (view === "day") return { from: startOfDay(cursor), to: addDays(startOfDay(cursor), 1) };
    if (view === "month" || view === "agenda") {
      return { from: startOfMonth(cursor), to: endOfMonth(cursor) };
    }
    // week + timeline share the same week window
    return { from: startOfWeek(cursor), to: endOfWeek(cursor) };
  }, [cursor, view]);

  const rangeFromMs = range.from.getTime();
  const rangeToMs = range.to.getTime();

  const load = useCallback(async () => {
    const reqId = ++loadReqId.current;
    // Full-page loader only when we have nothing to show yet
    setLoading((prev) => (eventsRef.current.length === 0 ? true : prev));
    setError("");
    try {
      const params = new URLSearchParams({
        from: new Date(rangeFromMs).toISOString(),
        to: new Date(rangeToMs).toISOString(),
      });
      if (q.trim()) params.set("q", q.trim());
      for (const t of typeFilter) params.append("type", t);
      const data = await apiGet<{ events: CalendarEvent[] }>(`/api/calendar/events?${params}`);
      if (reqId !== loadReqId.current) return;
      setEvents(
        data.events.map((e) => ({
          ...e,
          startsAt: new Date(e.startsAt),
          endsAt: new Date(e.endsAt),
          createdAt: new Date(e.createdAt),
          updatedAt: new Date(e.updatedAt),
        })),
      );
    } catch (err) {
      if (reqId !== loadReqId.current) return;
      setError(err instanceof Error ? err.message : "טעינת יומן נכשלה");
    } finally {
      if (reqId === loadReqId.current) setLoading(false);
    }
  }, [rangeFromMs, rangeToMs, q, typeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (deepLinkHandled.current) return;
    if (openNew && canEdit) {
      deepLinkHandled.current = true;
      const start = snapToSlot(addMinutes(startOfDay(cursor), 10 * 60));
      setEditor({ mode: "create", draftStarts: start, draftEnds: addMinutes(start, 60) });
      router.replace("/calendar", { scroll: false });
      return;
    }
    if (!deepEventId) {
      if (initialDate) deepLinkHandled.current = true;
      return;
    }
    if (loading) return;
    const hit = events.find((e) => e.id === deepEventId);
    if (hit) {
      deepLinkHandled.current = true;
      setPreview(hit);
      setCursor(startOfDay(hit.startsAt));
      router.replace("/calendar", { scroll: false });
      return;
    }
    // Event not in current range — still clear params after first successful load
    if (!loading && events.length >= 0) {
      // Fetch single event via range already loaded; if missing, jump day view
      deepLinkHandled.current = true;
      router.replace("/calendar", { scroll: false });
    }
  }, [openNew, canEdit, deepEventId, loading, events, cursor, initialDate, router]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const close = () => setCtxMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const todayEvents = useMemo(
    () => events.filter((e) => isSameDay(e.startsAt, now) && e.status !== "CANCELLED"),
    [events, now],
  );

  const stats = useMemo(() => {
    const open = todayEvents.filter((e) => e.status === "CONFIRMED" || e.status === "PENDING");
    return {
      meetings: open.filter((e) => e.type === "DOCTOR_MEETING" || e.type === "TEAM_MEETING").length,
      deliveries: open.filter((e) => e.type === "DELIVERY").length,
      pickups: open.filter((e) => e.type === "PICKUP").length,
      tasks: open.filter((e) => e.type === "TASK").length,
      newClients: open.filter((e) => e.type === "NEW_CLIENT").length,
      cancelled: todayEvents.filter((e) => e.status === "CANCELLED").length,
      next: open
        .filter((e) => e.startsAt > now)
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0] ?? null,
    };
  }, [todayEvents, now]);

  const persistMove = async (id: string, startsAt: Date, endsAt: Date) => {
    setEvents((prev) =>
      prev.map((e) => (e.id === id ? { ...e, startsAt, endsAt } : e)),
    );
    try {
      await apiPatch(`/api/calendar/events/${id}`, {
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        moveOnly: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירת הזזה נכשלה");
      void load();
    }
  };

  const openCreate = (startsAt: Date, endsAt?: Date) => {
    if (!canEdit) return;
    setEditor({
      mode: "create",
      draftStarts: snapToSlot(startsAt),
      draftEnds: snapToSlot(endsAt ?? addMinutes(startsAt, 60)),
    });
  };

  const saveEvent = async (payload: Record<string, unknown>, forceOnVacation = false) => {
    try {
      if (editor?.mode === "edit" && editor.event) {
        await apiPatch(`/api/calendar/events/${editor.event.id}`, payload);
      } else {
        await apiPost("/api/calendar/events", { ...payload, forceOnVacation });
      }
      setEditor(null);
      setVacationPrompt(null);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "שמירה נכשלה";
      if (message.includes("חופשה")) {
        setVacationPrompt(payload);
        return;
      }
      setError(message);
    }
  };

  const deleteEvent = async (ev: CalendarEvent) => {
    if (!currentUser || !canDeleteCalendarEvent(currentUser, ev)) {
      setError("אין הרשאה למחוק אירוע זה");
      return;
    }
    if (!window.confirm(`למחוק את האירוע «${ev.title}»?`)) return;
    try {
      await apiDelete(`/api/calendar/events/${ev.id}`);
      setPreview(null);
      setCtxMenu(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "מחיקה נכשלה");
    }
  };

  const duplicateEvent = async (ev: CalendarEvent) => {
    await apiPost("/api/calendar/events", {
      title: `${ev.title} (העתק)`,
      type: ev.type,
      color: ev.color,
      startsAt: ev.startsAt.toISOString(),
      endsAt: ev.endsAt.toISOString(),
      description: ev.description,
      location: ev.location,
      patientName: ev.patientName,
      doctorName: ev.doctorName,
      phone: ev.phone,
      orderId: ev.orderId,
      doctorId: ev.doctorId,
      notes: ev.notes,
      forceOnVacation: true,
    });
    setCtxMenu(null);
    await load();
  };

  const titleLabel = useMemo(() => {
    if (view === "day") return formatDateHe(cursor);
    if (view === "month" || view === "agenda") {
      return cursor.toLocaleDateString("he-IL", { month: "long", year: "numeric" });
    }
    const a = startOfWeek(cursor);
    const b = addDays(a, 6);
    return `${a.getDate()}.${a.getMonth() + 1} – ${b.getDate()}.${b.getMonth() + 1}.${b.getFullYear()}`;
  }, [cursor, view]);

  const navigate = (dir: -1 | 1) => {
    if (view === "day") setCursor((c) => addDays(c, dir));
    else if (view === "month" || view === "agenda") {
      setCursor((c) => new Date(c.getFullYear(), c.getMonth() + dir, 1));
    } else setCursor((c) => addDays(c, dir * 7));
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* Dashboard strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {[
          ["פגישות היום", stats.meetings],
          ["מסירות", stats.deliveries],
          ["איסופים", stats.pickups],
          ["משימות", stats.tasks],
          ["לקוחות חדשים", stats.newClients],
          ["בוטלו", stats.cancelled],
          [
            "הבאה",
            stats.next
              ? `${Math.max(0, Math.round(minutesBetween(now, stats.next.startsAt)))} דק׳`
              : "—",
          ],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <p className="text-[10px] text-slate-400">{label}</p>
            <p className="text-lg font-bold text-slate-800">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-xl border bg-white p-1">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setView(v.key)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium",
                view === v.key ? "bg-opal-gold text-white" : "text-slate-600 hover:bg-slate-50",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" size="icon" variant="outline" onClick={() => navigate(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setCursor(startOfDay(new Date()))}>
            היום
          </Button>
          <Button type="button" size="icon" variant="outline" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-sm font-semibold text-slate-700">{titleLabel}</p>
        <div className="mr-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              className="w-48 pr-8"
              placeholder="חיפוש מטופל / רופא / הזמנה"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {canEdit && (
            <Button type="button" onClick={() => openCreate(addMinutes(snapToSlot(now), 30))}>
              <Plus className="h-4 w-4" />
              אירוע חדש
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TYPE_FILTERS.map((t) => {
          const on = typeFilter.includes(t);
          return (
            <button
              key={t}
              type="button"
              onClick={() =>
                setTypeFilter((prev) =>
                  on ? prev.filter((x) => x !== t) : [...prev, t],
                )
              }
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                on ? "border-transparent text-white" : "border-slate-200 bg-white text-slate-600",
              )}
              style={on ? { background: CALENDAR_TYPE_COLORS[t] } : undefined}
            >
              {CALENDAR_TYPE_ICONS[t]} {CALENDAR_TYPE_LABELS[t]}
            </button>
          );
        })}
        {typeFilter.length > 0 && (
          <button type="button" className="text-[11px] text-slate-500 underline" onClick={() => setTypeFilter([])}>
            נקה פילטר
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid gap-3 xl:grid-cols-[160px_minmax(0,1fr)_168px] xl:gap-3">
        <aside className="min-w-0 space-y-3">
          <MiniCalendar cursor={cursor} onSelect={setCursor} />
          <div className="rounded-xl border bg-white p-3 shadow-sm">
            <p className="mb-2 text-xs font-semibold text-slate-500">אירועים קרובים</p>
            <ul className="space-y-1.5 text-xs">
              {events
                .filter((e) => e.startsAt >= now && e.status !== "CANCELLED")
                .slice(0, 6)
                .map((e) => (
                  <li key={e.id}>
                    <button type="button" className="w-full text-right hover:text-opal-gold" onClick={() => setPreview(e)}>
                      <span className="font-medium">{formatTimeHe(e.startsAt)}</span> · {e.title}
                    </button>
                  </li>
                ))}
              {events.filter((e) => e.startsAt >= now).length === 0 && (
                <li className="text-slate-400">אין אירועים קרובים</li>
              )}
            </ul>
          </div>
        </aside>

        <main className="min-w-0 overflow-hidden rounded-2xl border bg-white shadow-sm">
          {loading && events.length === 0 ? (
            <p className="p-8 text-center text-slate-400">טוען יומן...</p>
          ) : error && events.length === 0 ? (
            <div className="space-y-3 p-8 text-center">
              <p className="text-sm text-red-600">{error}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
                נסה שוב
              </Button>
            </div>
          ) : view === "month" ? (
            <MonthView
              cursor={cursor}
              events={events}
              onDayClick={(d) => {
                setCursor(d);
                setView("day");
              }}
              onEventClick={setPreview}
            />
          ) : view === "agenda" ? (
            <AgendaView events={events} onEventClick={setPreview} />
          ) : view === "timeline" ? (
            <TimelineView
              cursor={cursor}
              events={events}
              now={now}
              onEventClick={setPreview}
              onEventDblClick={(e) => setEditor({ mode: "edit", event: e })}
            />
          ) : (
            <TimeGridView
              view={view === "day" ? "day" : "week"}
              cursor={cursor}
              events={events}
              now={now}
              canEdit={canEdit}
              onSlotClick={openCreate}
              onEventClick={(e) => setPreview(e)}
              onEventDblClick={(e) => setEditor({ mode: "edit", event: e })}
              onContextMenu={(e, ev) => {
                e.preventDefault();
                setCtxMenu({ x: e.clientX, y: e.clientY, event: ev });
              }}
              onMove={persistMove}
            />
          )}
        </main>

        <aside className="min-w-0 space-y-3">
          <div className="rounded-xl border bg-white p-3 shadow-sm">
            <p className="mb-2 text-xs font-semibold text-slate-500">סיכום היום</p>
            <SummaryBlock title="מסירות" items={todayEvents.filter((e) => e.type === "DELIVERY")} />
            <SummaryBlock title="איסופים" items={todayEvents.filter((e) => e.type === "PICKUP")} />
            <SummaryBlock title="משימות" items={todayEvents.filter((e) => e.type === "TASK")} />
            <SummaryBlock
              title="פגישות"
              items={todayEvents.filter((e) => e.type === "DOCTOR_MEETING" || e.type === "TEAM_MEETING")}
            />
          </div>
        </aside>
      </div>

      {preview && (
        <Modal open onClose={() => setPreview(null)} title={preview.title} className="max-w-md">
          <EventPreview
            event={preview}
            onEdit={() => {
              setPreview(null);
              setEditor({ mode: "edit", event: preview });
            }}
            onDelete={() => void deleteEvent(preview)}
            canEdit={canEdit}
            canDelete={currentUser ? canDeleteCalendarEvent(currentUser, preview) : false}
          />
        </Modal>
      )}

      {editor && (
        <EventEditorModal
          mode={editor.mode}
          event={editor.event}
          draftStarts={editor.draftStarts}
          draftEnds={editor.draftEnds}
          doctors={doctors}
          orders={orders}
          onClose={() => setEditor(null)}
          onSave={(payload) => void saveEvent(payload)}
        />
      )}

      {vacationPrompt && (
        <Modal open onClose={() => setVacationPrompt(null)} title="יום חופשה" className="max-w-sm">
          <p className="mb-4 text-sm text-slate-700">
            היום מסומן כחופשה. האם בכל זאת ליצור אירוע?
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setVacationPrompt(null)}>
              לא
            </Button>
            <Button onClick={() => void saveEvent(vacationPrompt, true)}>כן, ליצור</Button>
          </div>
        </Modal>
      )}

      {ctxMenu && (
        <div
          className="fixed z-[60] min-w-[10rem] rounded-xl border bg-white py-1 text-sm shadow-xl"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {[
            {
              label: "עריכה",
              fn: () => {
                setEditor({ mode: "edit", event: ctxMenu.event });
                setCtxMenu(null);
              },
            },
            {
              label: "שכפול",
              fn: () => void duplicateEvent(ctxMenu.event),
            },
            {
              label: "ביטול",
              fn: () =>
                void apiPatch(`/api/calendar/events/${ctxMenu.event.id}`, { status: "CANCELLED" }).then(
                  () => {
                    setCtxMenu(null);
                    return load();
                  },
                ),
            },
            ...(ctxMenu.event.orderId
              ? [
                  {
                    label: "פתח הזמנה",
                    fn: () => {
                      window.location.href = `/orders/${ctxMenu.event.orderId}`;
                    },
                  },
                ]
              : []),
            {
              label: "מחיקה",
              fn: () => void deleteEvent(ctxMenu.event),
            },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-right hover:bg-slate-50"
              onClick={item.fn}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryBlock({ title, items }: { title: string; items: CalendarEvent[] }) {
  return (
    <div className="mb-2">
      <p className="text-[11px] font-medium text-slate-500">
        {title} ({items.length})
      </p>
      {items.slice(0, 3).map((e) => (
        <p key={e.id} className="truncate text-xs text-slate-700">
          {formatTimeHe(e.startsAt)} · {e.title}
        </p>
      ))}
    </div>
  );
}

function MiniCalendar({ cursor, onSelect }: { cursor: Date; onSelect: (d: Date) => void }) {
  const monthStart = startOfMonth(cursor);
  const start = startOfWeek(monthStart);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) cells.push(addDays(start, i));
  const today = startOfDay(new Date());

  return (
    <div className="rounded-xl border bg-white p-3 shadow-sm">
      <p className="mb-2 text-center text-xs font-semibold text-slate-600">
        {cursor.toLocaleDateString("he-IL", { month: "long", year: "numeric" })}
      </p>
      <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[10px] text-slate-400">
        {["א", "ב", "ג", "ד", "ה", "ו", "ש"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d) => {
          const selected = isSameDay(d, cursor);
          const isToday = isSameDay(d, today);
          const outside = d.getMonth() !== cursor.getMonth();
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => onSelect(startOfDay(d))}
              className={cn(
                "h-7 rounded-md text-[11px]",
                outside && "text-slate-300",
                selected && "bg-opal-gold font-bold text-white",
                !selected && isToday && "bg-opal-gold/15 font-semibold text-opal-gold-dark",
                !selected && !isToday && "hover:bg-slate-50",
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EventPreview({
  event,
  onEdit,
  onDelete,
  canEdit,
  canDelete,
}: {
  event: CalendarEvent;
  onEdit: () => void;
  onDelete: () => void;
  canEdit: boolean;
  canDelete: boolean;
}) {
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-3 w-3 rounded-full"
          style={{ background: eventColor(event) }}
        />
        <span className="font-medium text-slate-800">{event.title}</span>
        <span className={cn("mr-auto h-2 w-2 rounded-full", CALENDAR_STATUS_DOT[event.status])} />
        <span className="text-xs text-slate-500">{CALENDAR_STATUS_LABELS[event.status]}</span>
      </div>
      <p>
        {formatDateHe(event.startsAt)} · {formatTimeHe(event.startsAt)}–{formatTimeHe(event.endsAt)}
      </p>
      {event.order?.serialNumber && (
        <p>
          🦷{" "}
          <Link className="text-opal-gold underline" href={`/orders/${event.orderId}`}>
            {event.order.serialNumber}
          </Link>
        </p>
      )}
      {event.doctorName && <p>רופא: {event.doctorName}</p>}
      {event.patientName && <p>מטופל: {event.patientName}</p>}
      {event.phone && <p>טלפון: {event.phone}</p>}
      {event.location && <p>מיקום: {event.location}</p>}
      {event.notes && <p className="text-slate-500">{event.notes}</p>}
      <div className="flex flex-wrap gap-2 pt-2">
        {canEdit && (
          <Button type="button" size="sm" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
            עריכה
          </Button>
        )}
        {event.orderId && (
          <Link href={`/orders/${event.orderId}`}>
            <Button type="button" size="sm" variant="outline">
              <ExternalLink className="h-3.5 w-3.5" />
              הזמנה
            </Button>
          </Link>
        )}
        {canDelete && (
          <Button type="button" size="sm" variant="outline" className="text-red-700" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
            מחק
          </Button>
        )}
      </div>
    </div>
  );
}

function EventEditorModal({
  mode,
  event,
  draftStarts,
  draftEnds,
  doctors,
  orders,
  onClose,
  onSave,
}: {
  mode: "create" | "edit";
  event?: CalendarEvent;
  draftStarts?: Date;
  draftEnds?: Date;
  doctors: { id: string; name: string; phone?: string | null }[];
  orders: { id: string; serialNumber: string; doctor?: { name: string } | null; patient: { name: string } }[];
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => void;
}) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [color, setColor] = useState<string>(
    event?.color || (event ? eventColor(event) : EVENT_COLOR_PRESETS[0]),
  );
  const [status, setStatus] = useState<CalendarEventStatus>(event?.status ?? "CONFIRMED");
  const [startsLocal, setStartsLocal] = useState(
    toLocalInput(event?.startsAt ?? draftStarts ?? new Date()),
  );
  const [endsLocal, setEndsLocal] = useState(
    toLocalInput(event?.endsAt ?? draftEnds ?? addMinutes(new Date(), 60)),
  );
  const [location, setLocation] = useState(event?.location ?? "");
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [patientName, setPatientName] = useState(event?.patientName ?? "");
  const [doctorId, setDoctorId] = useState(event?.doctorId ?? "");
  const [doctorName, setDoctorName] = useState(event?.doctorName ?? "");
  const [phone, setPhone] = useState(event?.phone ?? "");
  const [orderId, setOrderId] = useState(event?.orderId ?? "");
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [recurrenceFreq, setRecurrenceFreq] = useState<string>(event?.recurrence?.freq ?? "");
  const customPickerRef = useRef<HTMLInputElement>(null);
  const titleTrimmed = title.trim();
  const isPreset = (EVENT_COLOR_PRESETS as readonly string[]).includes(color);

  return (
    <Modal open onClose={onClose} title={mode === "create" ? "אירוע חדש" : "עריכת אירוע"} className="max-w-lg">
      <div className="space-y-3 text-sm">
        <div>
          <Label>שם האירוע *</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder='לדוגמה: פגישה עם ד"ר כהן'
            required
            autoFocus
          />
        </div>
        <div>
          <Label>צבע האירוע</Label>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {EVENT_COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                aria-label={`צבע ${c}`}
                onClick={() => setColor(c)}
                className={cn(
                  "h-7 w-7 rounded-full border-2 transition-transform",
                  color.toLowerCase() === c.toLowerCase()
                    ? "scale-110 border-slate-800"
                    : "border-white shadow ring-1 ring-slate-200 hover:scale-105",
                )}
                style={{ background: c }}
              />
            ))}
            <button
              type="button"
              onClick={() => customPickerRef.current?.click()}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium",
                !isPreset
                  ? "border-slate-800 bg-slate-50 text-slate-800"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              <span
                className="h-3.5 w-3.5 rounded-full border border-slate-300"
                style={{ background: color }}
              />
              + צבע
            </button>
            <input
              ref={customPickerRef}
              type="color"
              value={/^#[0-9A-Fa-f]{6}$/.test(color) ? color : "#8b5cf6"}
              onChange={(e) => setColor(e.target.value)}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>התחלה</Label>
            <Input type="datetime-local" value={startsLocal} onChange={(e) => setStartsLocal(e.target.value)} />
          </div>
          <div>
            <Label>סיום</Label>
            <Input type="datetime-local" value={endsLocal} onChange={(e) => setEndsLocal(e.target.value)} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          יום שלם
        </label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>רופא</Label>
            <Select
              value={doctorId}
              onChange={(e) => {
                const id = e.target.value;
                setDoctorId(id);
                const d = doctors.find((x) => x.id === id);
                setDoctorName(d?.name ?? "");
                if (d?.phone) setPhone(d.phone);
              }}
            >
              <option value="">—</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>מטופל</Label>
            <Input value={patientName} onChange={(e) => setPatientName(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>הזמנה</Label>
          <Select
            value={orderId}
            onChange={(e) => {
              const id = e.target.value;
              setOrderId(id);
              const o = orders.find((x) => x.id === id);
              if (o) {
                setPatientName(o.patient.name);
                setDoctorName(o.doctor?.name ?? doctorName);
              }
            }}
          >
            <option value="">—</option>
            {orders.slice(0, 80).map((o) => (
              <option key={o.id} value={o.id}>
                {o.serialNumber} · {o.patient.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>טלפון</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <Label>מיקום</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>סטטוס</Label>
          <Select value={status} onChange={(e) => setStatus(e.target.value as CalendarEventStatus)}>
            {(Object.keys(CALENDAR_STATUS_LABELS) as CalendarEventStatus[]).map((s) => (
              <option key={s} value={s}>
                {CALENDAR_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>אירוע חוזר</Label>
          <Select value={recurrenceFreq} onChange={(e) => setRecurrenceFreq(e.target.value)}>
            <option value="">ללא</option>
            <option value="DAILY">כל יום</option>
            <option value="WEEKLY">כל שבוע</option>
            <option value="MONTHLY">כל חודש</option>
            <option value="YEARLY">כל שנה</option>
          </Select>
        </div>
        <div>
          <Label>תיאור</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </div>
        <div>
          <Label>הערה</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            ביטול
          </Button>
          <Button
            type="button"
            disabled={!titleTrimmed}
            onClick={() => {
              if (!titleTrimmed) return;
              const payload: Record<string, unknown> = {
                title: titleTrimmed,
                color,
                status,
                startsAt: new Date(startsLocal).toISOString(),
                endsAt: new Date(endsLocal).toISOString(),
                location: location || null,
                notes: notes || null,
                description: description || null,
                patientName: patientName || null,
                doctorName: doctorName || null,
                doctorId: doctorId || null,
                phone: phone || null,
                orderId: orderId || null,
                allDay,
                recurrence: recurrenceFreq
                  ? { freq: recurrenceFreq, interval: 1 }
                  : null,
              };
              // Preserve system/legacy type on edit; free-form creates use default behind the scenes.
              if (mode === "edit" && event?.type) {
                payload.type = event.type;
              } else if (mode === "create") {
                payload.type = DEFAULT_CUSTOM_EVENT_TYPE;
              }
              onSave(payload);
            }}
          >
            שמירה
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function TimeGridView({
  view,
  cursor,
  events,
  now,
  canEdit,
  onSlotClick,
  onEventClick,
  onEventDblClick,
  onContextMenu,
  onMove,
}: {
  view: "day" | "week";
  cursor: Date;
  events: CalendarEvent[];
  now: Date;
  canEdit: boolean;
  onSlotClick: (starts: Date, ends?: Date) => void;
  onEventClick: (e: CalendarEvent) => void;
  onEventDblClick: (e: CalendarEvent) => void;
  onContextMenu: (e: React.MouseEvent, ev: CalendarEvent) => void;
  onMove: (id: string, starts: Date, ends: Date) => void;
}) {
  const days =
    view === "day"
      ? [startOfDay(cursor)]
      : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i));
  const hourList = hours();
  const rowH = 56;
  const ppm = pxPerMinute(rowH);
  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    id: string;
    durationMin: number;
    mode: "move" | "resize";
  } | null>(null);

  const dayWidth = `${100 / days.length}%`;

  const nowTop = (() => {
    if (now.getHours() < HOUR_START || now.getHours() > HOUR_END) return null;
    return (now.getHours() - HOUR_START) * 60 * ppm + now.getMinutes() * ppm;
  })();

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || !gridRef.current) return;
    const rect = gridRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top + gridRef.current.scrollTop - 36;
    const minutesFromStart = Math.max(0, y / ppm);
    const hour = HOUR_START + Math.floor(minutesFromStart / 60);
    const minute = Math.round((minutesFromStart % 60) / SLOT_MINUTES) * SLOT_MINUTES;
    const colW = rect.width / days.length;
    // RTL: columns from right
    const col = Math.min(days.length - 1, Math.max(0, Math.floor((rect.right - e.clientX) / colW)));
    const day = days[col]!;
    const start = new Date(day);
    start.setHours(hour, minute, 0, 0);
    const snapped = snapToSlot(start);
    const ev = events.find((x) => x.id === drag.id);
    if (!ev) return;
    if (drag.mode === "move") {
      onMove(drag.id, snapped, addMinutes(snapped, drag.durationMin));
    } else {
      const ends = snapToSlot(addMinutes(snapped, 0));
      // resize uses pointer relative to event start — simplify: set end from pointer time if after start
      const endCandidate = snapToSlot(start);
      if (endCandidate > ev.startsAt) onMove(drag.id, ev.startsAt, endCandidate);
    }
  };

  return (
    <div
      ref={gridRef}
      className="relative max-h-[70vh] overflow-auto"
      onPointerMove={onPointerMove}
      onPointerUp={() => {
        dragRef.current = null;
      }}
    >
      <div className="sticky top-0 z-20 grid border-b bg-white" style={{ gridTemplateColumns: `48px repeat(${days.length}, 1fr)` }}>
        <div />
        {days.map((d) => (
          <div key={d.toISOString()} className="border-r px-1 py-2 text-center text-xs font-semibold text-slate-600 last:border-0">
            {formatDateHe(d)}
          </div>
        ))}
      </div>
      <div className="relative grid" style={{ gridTemplateColumns: `48px repeat(${days.length}, 1fr)` }}>
        <div className="relative">
          {hourList.map((h) => (
            <div key={h} className="border-b border-slate-100 pr-1 text-left text-[10px] text-slate-400" style={{ height: rowH }}>
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>
        {days.map((day) => {
          const dayEvents = events.filter(
            (e) => isSameDay(e.startsAt, day) && !e.allDay && e.status !== "CANCELLED",
          );
          const isVacation = events.some(
            (e) =>
              e.allDay &&
              (e.type === "VACATION" || e.type === "BLOCKED") &&
              isSameDay(e.startsAt, day) &&
              e.status !== "CANCELLED",
          );
          return (
            <div
              key={day.toISOString()}
              className={cn("relative border-r last:border-0", isVacation && "bg-slate-100/80")}
              style={{ height: hourList.length * rowH }}
              onDoubleClick={(e) => {
                if (!canEdit) return;
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                const y = e.clientY - rect.top;
                const mins = y / ppm;
                const start = new Date(day);
                start.setHours(HOUR_START, 0, 0, 0);
                onSlotClick(snapToSlot(addMinutes(start, mins)));
              }}
            >
              {hourList.map((h) => (
                <div key={h} className="border-b border-slate-100" style={{ height: rowH }} />
              ))}
              {isSameDay(day, now) && nowTop != null && (
                <div
                  className="pointer-events-none absolute right-0 left-0 z-10 border-t-2 border-red-500"
                  style={{ top: nowTop }}
                >
                  <span className="absolute -right-1 -top-1.5 h-3 w-3 rounded-full bg-red-500" />
                </div>
              )}
              {layoutColumns(dayEvents).map(({ event: ev, col, cols }) => {
                const top =
                  (ev.startsAt.getHours() - HOUR_START) * 60 * ppm +
                  ev.startsAt.getMinutes() * ppm;
                const height = Math.max(22, minutesBetween(ev.startsAt, ev.endsAt) * ppm);
                const widthPct = 100 / cols;
                const rightPct = col * widthPct;
                return (
                  <div
                    key={ev.id}
                    className="absolute z-[5] cursor-pointer overflow-hidden rounded-lg border border-white/40 px-1.5 py-0.5 text-[11px] leading-snug text-white shadow-sm transition-shadow hover:z-10 hover:shadow-md"
                    style={{
                      top,
                      height,
                      right: `${rightPct}%`,
                      width: `calc(${widthPct}% - 2px)`,
                      background: eventColor(ev),
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(ev);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      onEventDblClick(ev);
                    }}
                    onContextMenu={(e) => onContextMenu(e, ev)}
                    onPointerDown={(e) => {
                      if (!canEdit || e.button !== 0) return;
                      e.stopPropagation();
                      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                      dragRef.current = {
                        id: ev.id,
                        durationMin: minutesBetween(ev.startsAt, ev.endsAt),
                        mode: "move",
                      };
                    }}
                  >
                    <div className="truncate font-semibold">{ev.title}</div>
                    <div className="truncate opacity-90">
                      {formatTimeHe(ev.startsAt)}
                      {ev.order?.serialNumber ? ` · 🦷 ${ev.order.serialNumber}` : ""}
                    </div>
                    {height > 40 && ev.doctorName && (
                      <div className="truncate opacity-80">{ev.doctorName}</div>
                    )}
                    {canEdit && (
                      <div
                        className="absolute inset-x-0 bottom-0 h-2 cursor-s-resize"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          dragRef.current = {
                            id: ev.id,
                            durationMin: minutesBetween(ev.startsAt, ev.endsAt),
                            mode: "resize",
                          };
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      {/* unused dayWidth to silence */}
      <span className="hidden">{dayWidth}</span>
    </div>
  );
}

/** Stack overlapping events into columns like Google Calendar. */
function layoutColumns(events: CalendarEvent[]): Array<{ event: CalendarEvent; col: number; cols: number }> {
  const sorted = [...events].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const result: Array<{ event: CalendarEvent; col: number; cols: number }> = [];
  const active: Array<{ ends: number; col: number }> = [];

  for (const ev of sorted) {
    const start = ev.startsAt.getTime();
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i]!.ends <= start) active.splice(i, 1);
    }
    const used = new Set(active.map((a) => a.col));
    let col = 0;
    while (used.has(col)) col++;
    active.push({ ends: ev.endsAt.getTime(), col });
    const cols = Math.max(col + 1, ...active.map((a) => a.col + 1));
    result.push({ event: ev, col, cols });
  }
  // second pass: set cols to max overlap in cluster
  return result.map((r) => {
    const overlapping = result.filter(
      (o) =>
        o.event.startsAt < r.event.endsAt && o.event.endsAt > r.event.startsAt,
    );
    const cols = Math.max(...overlapping.map((o) => o.col)) + 1;
    return { ...r, cols };
  });
}

function MonthView({
  cursor,
  events,
  onDayClick,
  onEventClick,
}: {
  cursor: Date;
  events: CalendarEvent[];
  onDayClick: (d: Date) => void;
  onEventClick: (e: CalendarEvent) => void;
}) {
  const start = startOfWeek(startOfMonth(cursor));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return (
    <div className="grid grid-cols-7">
      {cells.map((d) => {
        const dayEv = events.filter((e) => isSameDay(e.startsAt, d));
        return (
          <button
            key={d.toISOString()}
            type="button"
            onClick={() => onDayClick(d)}
            className={cn(
              "min-h-[88px] border-b border-l p-1 text-right align-top",
              d.getMonth() !== cursor.getMonth() && "bg-slate-50 text-slate-400",
            )}
          >
            <div className="text-xs font-semibold">{d.getDate()}</div>
            <div className="mt-0.5 space-y-0.5">
              {dayEv.slice(0, 3).map((e) => (
                <div
                  key={e.id}
                  className="truncate rounded px-1 text-[10px] text-white"
                  style={{ background: eventColor(e) }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onEventClick(e);
                  }}
                >
                  {e.title}
                </div>
              ))}
              {dayEv.length > 3 && (
                <div className="text-[10px] text-slate-400">+{dayEv.length - 3}</div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function TimelineView({
  cursor,
  events,
  now,
  onEventClick,
  onEventDblClick,
}: {
  cursor: Date;
  events: CalendarEvent[];
  now: Date;
  onEventClick: (e: CalendarEvent) => void;
  onEventDblClick: (e: CalendarEvent) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i));
  const hourList = hours();
  const colW = 72;
  const labelW = 72;
  const rowH = 64;
  const totalW = labelW + hourList.length * colW;

  const nowLeft = (() => {
    if (!isSameDay(now, startOfDay(now))) return null;
    if (now.getHours() < HOUR_START || now.getHours() > HOUR_END) return null;
    const mins = (now.getHours() - HOUR_START) * 60 + now.getMinutes();
    return labelW + (mins / 60) * colW;
  })();

  return (
    <div className="max-h-[70vh] overflow-auto" dir="ltr">
      <div style={{ minWidth: totalW }} className="relative">
        <div
          className="sticky top-0 z-20 grid border-b bg-white text-[10px] text-slate-500"
          style={{ gridTemplateColumns: `${labelW}px repeat(${hourList.length}, ${colW}px)` }}
        >
          <div className="border-r px-1 py-2" />
          {hourList.map((h) => (
            <div key={h} className="border-r px-1 py-2 text-center">
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>

        {days.map((day) => {
          const dayEvents = events.filter(
            (e) => isSameDay(e.startsAt, day) && e.status !== "CANCELLED",
          );
          const showNow = isSameDay(day, now) && nowLeft != null;
          return (
            <div
              key={day.toISOString()}
              className="relative grid border-b"
              style={{
                gridTemplateColumns: `${labelW}px repeat(${hourList.length}, ${colW}px)`,
                minHeight: rowH,
              }}
            >
              <div
                className="flex items-center justify-center border-r bg-slate-50 px-1 text-center text-[11px] font-semibold text-slate-700"
                dir="rtl"
              >
                {day.toLocaleDateString("he-IL", { weekday: "short", day: "numeric", month: "numeric" })}
              </div>
              {hourList.map((h) => (
                <div key={h} className="border-r bg-white" />
              ))}

              {showNow && (
                <div
                  className="pointer-events-none absolute top-0 bottom-0 z-10 w-0.5 bg-red-500"
                  style={{ left: nowLeft }}
                />
              )}

              {dayEvents.map((ev) => {
                const startMin =
                  (ev.startsAt.getHours() - HOUR_START) * 60 + ev.startsAt.getMinutes();
                const dur = Math.max(30, minutesBetween(ev.startsAt, ev.endsAt));
                const left = labelW + (startMin / 60) * colW;
                const width = Math.max(48, (dur / 60) * colW - 4);
                return (
                  <button
                    key={ev.id}
                    type="button"
                    dir="rtl"
                    className="absolute z-[5] overflow-hidden rounded-md px-1.5 py-0.5 text-right text-[10px] text-white shadow-sm hover:z-10 hover:shadow-md"
                    style={{
                      top: 8,
                      height: rowH - 16,
                      left,
                      width,
                      background: eventColor(ev),
                    }}
                    onClick={() => onEventClick(ev)}
                    onDoubleClick={() => onEventDblClick(ev)}
                    title={ev.title}
                  >
                    <div className="truncate font-semibold">{ev.title}</div>
                    <div className="truncate opacity-90">
                      {formatTimeHe(ev.startsAt)}
                      {ev.doctorName ? ` · ${ev.doctorName}` : ""}
                      {ev.patientName ? ` · ${ev.patientName}` : ""}
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      {events.filter((e) => e.status !== "CANCELLED").length === 0 && (
        <p className="p-8 text-center text-slate-400" dir="rtl">
          אין אירועים להצגה
        </p>
      )}
    </div>
  );
}

function AgendaView({
  events,
  onEventClick,
}: {
  events: CalendarEvent[];
  onEventClick: (e: CalendarEvent) => void;
}) {
  const sorted = [...events]
    .filter((e) => e.status !== "CANCELLED")
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  if (sorted.length === 0) {
    return <p className="p-8 text-center text-slate-400">אין אירועים להצגה</p>;
  }

  const groups: { key: string; day: Date; items: CalendarEvent[] }[] = [];
  for (const e of sorted) {
    const key = startOfDay(e.startsAt).toISOString();
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(e);
    else groups.push({ key, day: startOfDay(e.startsAt), items: [e] });
  }

  return (
    <div className="max-h-[70vh] overflow-auto divide-y">
      {groups.map((g) => (
        <section key={g.key} className="px-4 py-3">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">
            {g.day.toLocaleDateString("he-IL", {
              weekday: "long",
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            })}
          </h3>
          <ul className="space-y-1">
            {g.items.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  className="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-right hover:bg-slate-50"
                  onClick={() => onEventClick(e)}
                >
                  <span className="w-12 shrink-0 pt-0.5 text-xs font-semibold tabular-nums text-slate-600">
                    {formatTimeHe(e.startsAt)}
                  </span>
                  <span
                    className="mt-1.5 h-3 w-3 shrink-0 rounded-full"
                    style={{ background: eventColor(e) }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-800">{e.title}</p>
                    <p className="text-xs text-slate-500">
                      {formatTimeHe(e.startsAt)}–{formatTimeHe(e.endsAt)}
                      {e.doctorName ? ` · ${e.doctorName}` : ""}
                      {e.patientName ? ` · ${e.patientName}` : ""}
                      {e.order?.serialNumber ? ` · 🦷 ${e.order.serialNumber}` : ""}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
