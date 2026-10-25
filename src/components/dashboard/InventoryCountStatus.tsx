"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Summary = { planned: number; overdue: number; completed: number; low: number; zero: number };

export function InventoryCountStatus() {
  const [summary, setSummary] = useState<Summary | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/inventory/reminders?view=summary", { credentials: "include" })
      .then((response) => response.json())
      .then((body) => { if (!cancelled && body?.success) setSummary(body.data); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  if (!summary) return null;
  const cards = [
    { href: "/inventory/reminders?filter=planned", label: "ספירות מתוכננות", value: summary.planned },
    { href: "/inventory/reminders?filter=overdue", label: "ספירות באיחור", value: summary.overdue },
    { href: "/inventory/reminders?filter=completed", label: "ספירות שהושלמו", value: summary.completed },
    { href: "/inventory/reminders?filter=low", label: "פריטים בחוסר", value: summary.low },
    { href: "/inventory/reminders?filter=zero", label: "פריטים בכמות אפס", value: summary.zero },
  ];
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-lg font-bold text-slate-900">מצב ספירות מלאי</h2>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {cards.map((card) => (
          <Link key={card.href} href={card.href} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
            <p className="text-xl font-bold text-slate-900">{card.value}</p>
            <p className="text-xs text-slate-500">{card.label}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
