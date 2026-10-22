"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileDown, Loader2 } from "lucide-react";
import { Header } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { MODULE_LABELS, REPORT_KINDS, REPORT_LABELS, type InventoryReportKind } from "@/lib/inventory/inventory-reports";

type Meta = {
  productCount: number;
  categories: { id: string; label: string }[];
  models: string[];
  counts: { id: string; serial: number; category: string; status: string; createdAt: string; createdById: string; createdByName: string; counted: number; expected: number }[];
  employees: { id: string; name: string }[];
};

const STATUS: Record<string, string> = { DRAFT: "טיוטה", APPROVED: "מאושרת", CANCELLED: "מבוטלת" };

export async function downloadInventoryReport(params: Record<string, string | undefined>) {
  const query = new URLSearchParams({ format: "pdf" });
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  const response = await fetch(`/api/inventory/reports?${query.toString()}`, { credentials: "include" });
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || !type.includes("pdf")) {
    const json = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(json?.error?.message ?? "הפקת הדוח נכשלה");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `opal-inventory-${params.kind ?? "report"}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}

export function InventoryReportsScreen() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [kind, setKind] = useState<InventoryReportKind>("all-products");
  const [scope, setScope] = useState<"all" | "filtered">("all");
  const [categories, setCategories] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [countId, setCountId] = useState("");
  const [countStatus, setCountStatus] = useState("");
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [differences, setDifferences] = useState(false);
  const [uncounted, setUncounted] = useState(false);
  const [zero, setZero] = useState(false);
  const [images, setImages] = useState(true);
  const [barcodes, setBarcodes] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/inventory/reports", { credentials: "include" });
        const json = (await response.json()) as { success: boolean; data?: Meta; error?: { message?: string } };
        if (!json.success || !json.data) throw new Error(json.error?.message ?? "שגיאה בטעינה");
        if (!cancelled) setMeta(json.data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "שגיאה בטעינה");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function produce(nextKind = kind, extra?: Record<string, string>) {
    setBusy(true);
    setError(null);
    try {
      await downloadInventoryReport({
        kind: nextKind,
        scope,
        categories: categories.join(","),
        models: model,
        countId,
        countStatus,
        userId,
        from,
        to,
        differences: differences ? "1" : "",
        uncounted: uncounted ? "1" : "",
        zero: zero ? "1" : "",
        images: images ? "1" : "0",
        barcodes: barcodes ? "1" : "0",
        ...extra,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "הפקת הדוח נכשלה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Header title="דוחות מלאי" description="הפקת PDF מנתוני המלאי והספירות" actions={<Link href="/inventory" className="text-sm font-medium text-slate-600 hover:underline">חזרה למלאי</Link>} />
      {error && <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <p className="mb-3 text-sm text-slate-600">{meta ? `${meta.productCount} פריטי מלאי זמינים לדוח. ברירת המחדל היא כל הפריטים.` : "טוען נתונים"}</p>
      <section className="mb-4 grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-4">
        <select aria-label="היקף" value={scope} onChange={(event) => setScope(event.target.value as "all" | "filtered")} className="h-10 rounded-lg border px-2 text-sm">
          <option value="all">כל המוצרים</option>
          <option value="filtered">רק התוצאות המסוננות</option>
        </select>
        <select aria-label="דגם" value={model} onChange={(event) => setModel(event.target.value)} className="h-10 rounded-lg border px-2 text-sm">
          <option value="">כל הדגמים</option>
          {meta?.models.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select aria-label="ספירה" value={countId} onChange={(event) => setCountId(event.target.value)} className="h-10 rounded-lg border px-2 text-sm">
          <option value="">כל הספירות בטווח</option>
          {meta?.counts.map((count) => <option key={count.id} value={count.id}>#{count.serial} · {count.category} · {STATUS[count.status] ?? count.status}</option>)}
        </select>
        <select aria-label="מצב ספירה" value={countStatus} onChange={(event) => setCountStatus(event.target.value)} className="h-10 rounded-lg border px-2 text-sm">
          <option value="">כל המצבים</option>
          <option value="DRAFT">טיוטה</option>
          <option value="APPROVED">מאושרת</option>
          <option value="CANCELLED">מבוטלת</option>
        </select>
        <select aria-label="עובד" value={userId} onChange={(event) => setUserId(event.target.value)} className="h-10 rounded-lg border px-2 text-sm">
          <option value="">כל העובדים</option>
          {meta?.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
        </select>
        <input aria-label="מתאריך" type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-10 rounded-lg border px-2 text-sm" />
        <input aria-label="עד תאריך" type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-10 rounded-lg border px-2 text-sm" />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label><input type="checkbox" checked={differences} onChange={(event) => setDifferences(event.target.checked)} /> הפרשים</label>
          <label><input type="checkbox" checked={uncounted} onChange={(event) => setUncounted(event.target.checked)} /> בלי ספירה</label>
          <label><input type="checkbox" checked={zero} onChange={(event) => setZero(event.target.checked)} /> כמות אפס</label>
          <label><input type="checkbox" checked={images} onChange={(event) => setImages(event.target.checked)} /> תמונות</label>
          <label><input type="checkbox" checked={barcodes} onChange={(event) => setBarcodes(event.target.checked)} /> ברקודים</label>
        </div>
      </section>
      <div className="mb-4 flex flex-wrap gap-2">
        {Object.entries(MODULE_LABELS).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setCategories((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])} className={`rounded-full border px-3 py-1 text-xs ${categories.includes(id) ? "border-opal-gold bg-opal-gold text-white" : "border-slate-200 bg-white"}`}>{label}</button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {REPORT_KINDS.map((item) => (
          <article key={item} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-bold text-slate-900">{REPORT_LABELS[item]}</h2>
            <Button className="mt-3" disabled={busy} onClick={() => { setKind(item); void produce(item); }}>
              {busy && kind === item ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              הפקת PDF
            </Button>
          </article>
        ))}
      </div>
    </>
  );
}
