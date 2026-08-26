"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarPlus, ChevronLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api/client";
import {
  eventColor,
  formatUpcomingWhen,
  startOfDay,
  type CalendarEvent,
} from "@/lib/calendar/types";
import { canEditCalendarEvents } from "@/lib/calendar/permissions";
import { useApp } from "@/providers/AppProvider";
import { cn } from "@/lib/utils";

function calendarHref(ev: CalendarEvent): string {
  const date = startOfDay(new Date(ev.startsAt)).toISOString().slice(0, 10);
  return `/calendar?date=${date}&eventId=${encodeURIComponent(ev.id)}`;
}

export function UpcomingMeetingsCard({ className }: { className?: string }) {
  const { currentUser } = useApp();
  const canCreate = currentUser ? canEditCalendarEvents(currentUser) : false;
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiGet<{ events: CalendarEvent[] }>(
        "/api/calendar/events?upcoming=1&limit=5",
      );
      setEvents(
        (data.events ?? []).map((e) => ({
          ...e,
          startsAt: new Date(e.startsAt),
          endsAt: new Date(e.endsAt),
          createdAt: new Date(e.createdAt),
          updatedAt: new Date(e.updatedAt),
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "טעינת פגישות נכשלה");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card className={cn(className)}>
      <CardContent className="flex h-full flex-col p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="font-semibold">פגישות קרובות</h3>
          <Link
            href="/calendar"
            className="text-xs font-medium text-opal-gold-dark hover:underline"
          >
            לכל הפגישות ←
          </Link>
        </div>

        {loading && (
          <p className="py-6 text-center text-sm text-slate-400">טוען פגישות...</p>
        )}

        {!loading && error && (
          <p className="py-4 text-center text-sm text-red-600">{error}</p>
        )}

        {!loading && !error && events.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
            <p className="text-sm text-slate-500">אין פגישות קרובות</p>
            {canCreate && (
              <Link href="/calendar?new=1">
                <Button type="button" size="sm" variant="outline">
                  <CalendarPlus className="h-4 w-4" />
                  אירוע חדש
                </Button>
              </Link>
            )}
          </div>
        )}

        {!loading && !error && events.length > 0 && (
          <ul className="min-h-0 flex-1 space-y-1">
            {events.map((ev) => {
              const color = eventColor(ev);
              const meta: string[] = [];
              if (ev.doctorName?.trim()) meta.push(ev.doctorName.trim());
              if (ev.patientName?.trim()) meta.push(`מטופל: ${ev.patientName.trim()}`);
              return (
                <li key={ev.id}>
                  <Link
                    href={calendarHref(ev)}
                    className="flex gap-2.5 rounded-lg p-2 transition-colors hover:bg-slate-50"
                  >
                    <span
                      className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">
                        {ev.title}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {formatUpcomingWhen(ev.startsAt, ev.allDay)}
                      </span>
                      {meta.length > 0 && (
                        <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                          {meta.join(" · ")}
                        </span>
                      )}
                    </span>
                    <ChevronLeft className="mt-1 h-4 w-4 shrink-0 text-slate-300" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
