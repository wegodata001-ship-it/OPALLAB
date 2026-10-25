"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { MATERIAL_STAGE_LABELS, USAGE_NOTE, type MaterialStage } from "@/lib/workflow/material-usage-shared";

type Row = {
  id: string;
  recordedAt: string;
  orderSerial: string;
  doctorName: string;
  stageLabel: string;
  modelName: string;
  colorName: string;
  heightLabel: string;
  employeeName: string;
};
type Facets = {
  models: string[];
  colors: string[];
  heights: string[];
  doctors: string[];
  employees: { id: string; name: string }[];
  note: string;
};
type Summary = {
  orderCount: number;
  recordCount: number;
  ordersByModel: { name: string; count: number }[];
  byColor: { name: string; count: number }[];
  byHeight: { name: string; count: number }[];
  byEmployee: { name: string; count: number }[];
  byStage: { name: string; count: number }[];
  note: string;
};

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) throw new Error(body?.error?.message || "הפעולה נכשלה");
  return body.data as T;
}

export function MaterialUsageReportScreen() {
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [order, setOrder] = useState("");
  const [doctor, setDoctor] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [stage, setStage] = useState("");
  const [model, setModel] = useState("");
  const [color, setColor] = useState("");
  const [height, setHeight] = useState("");

  function query() {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (order.trim()) params.set("order", order.trim());
    if (doctor) params.set("doctor", doctor);
    if (employeeId) params.set("employeeId", employeeId);
    if (stage) params.set("stage", stage);
    if (model) params.set("model", model);
    if (color) params.set("color", color);
    if (height) params.set("height", height);
    return params;
  }

  async function load() {
    setError(null);
    const data = await readJson<{ rows: Row[]; summary: Summary; facets: Facets }>(
      await fetch(`/api/workflow/material-usage?${query().toString()}`, { credentials: "include" }),
    );
    setRows(data.rows);
    setSummary(data.summary);
    setFacets(data.facets);
  }

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "טעינת הדוח נכשלה"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function download(format: "pdf" | "xlsx") {
    setBusy(true);
    setError(null);
    try {
      const params = query();
      params.set("format", format);
      const response = await fetch(`/api/workflow/material-usage?${params.toString()}`, { credentials: "include" });
      if (!response.ok) {
        const json = await response.json().catch(() => null);
        throw new Error(json?.error?.message || "הייצוא נכשל");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `opal-material-usage.${format === "pdf" ? "pdf" : "xlsx"}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "הייצוא נכשל");
    } finally {
      setBusy(false);
    }
  }

  const groups = summary
    ? [
      ["הזמנות עם תיעוד", String(summary.orderCount)],
      ["רשומות תיעוד", String(summary.recordCount)],
      ...summary.ordersByModel.map((item) => [`הזמנות לדגם ${item.name}`, String(item.count)]),
      ...summary.byColor.map((item) => [`צבע ${item.name}`, String(item.count)]),
      ...summary.byHeight.map((item) => [`גובה ${item.name}`, String(item.count)]),
      ...summary.byEmployee.map((item) => [`עובד ${item.name}`, String(item.count)]),
      ...summary.byStage.map((item) => [`שלב ${item.name}`, String(item.count)]),
    ]
    : [];

  return (
    <>
      <Header
        title="שימוש בחומרים במעקב ייצור"
        description="תיעוד חומרים שנבחרו בייצור. זה אינו דוח צריכה ואינו הפחתת מלאי."
        actions={<Link href="/inventory/reports" className="text-sm font-medium text-slate-600 hover:underline">חזרה לדוחות</Link>}
      />
      {error && <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <p className="mb-3 text-sm text-slate-600">{USAGE_NOTE}</p>
      <section className="mb-4 grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-4">
        <input aria-label="מתאריך" type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-10 rounded-lg border px-2 text-sm" />
        <input aria-label="עד תאריך" type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-10 rounded-lg border px-2 text-sm" />
        <input aria-label="מספר הזמנה" value={order} onChange={(event) => setOrder(event.target.value)} placeholder="מספר הזמנה" className="h-10 rounded-lg border px-2 text-sm" />
        <select aria-label="רופא" value={doctor} onChange={(event) => setDoctor(event.target.value)} className="h-10 rounded-lg border px-2 text-sm">
          <option value="">כל הרופאים</option>
          {facets?.doctors.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <select aria-label="עובד" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className="h-10 rounded-lg border px-2 text-sm">
          <option value="">כל העובדים</option>
          {facets?.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
        </select>
        <select aria-label="שלב" value={stage} onChange={(event) => setStage(event.target.value)} className="h-10 rounded-lg border px-2 text-sm">
          <option value="">כל השלבים</option>
          {(Object.keys(MATERIAL_STAGE_LABELS) as MaterialStage[]).map((key) => <option key={key} value={key}>{MATERIAL_STAGE_LABELS[key]}</option>)}
        </select>
        <select aria-label="דגם" value={model} onChange={(event) => setModel(event.target.value)} className="h-10 rounded-lg border px-2 text-sm">
          <option value="">כל הדגמים</option>
          {facets?.models.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <select aria-label="צבע" value={color} onChange={(event) => setColor(event.target.value)} className="h-10 rounded-lg border px-2 text-sm">
          <option value="">כל הצבעים</option>
          {facets?.colors.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <select aria-label="גובה" value={height} onChange={(event) => setHeight(event.target.value)} className="h-10 rounded-lg border px-2 text-sm">
          <option value="">כל הגבהים</option>
          {facets?.heights.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <Button onClick={() => void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "הסינון נכשל"))}>סינון</Button>
        <Button variant="outline" disabled={busy} onClick={() => void download("pdf")}>PDF</Button>
        <Button variant="outline" disabled={busy} onClick={() => void download("xlsx")}>Excel</Button>
      </section>
      {summary && (
        <section className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {groups.map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-lg font-semibold text-slate-900">{value}</p>
            </div>
          ))}
        </section>
      )}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-right text-sm">
          <thead className="bg-slate-900 text-white">
            <tr>
              {["תאריך", "הזמנה", "שלב", "דגם", "צבע", "גובה", "עובד"].map((header) => <th key={header} className="px-3 py-2 font-medium">{header}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-slate-400">אין רשומות בסינון זה</td></tr>}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{new Date(row.recordedAt).toLocaleString("he-IL")}</td>
                <td className="px-3 py-2">{row.orderSerial}</td>
                <td className="px-3 py-2">{row.stageLabel}</td>
                <td className="px-3 py-2">{row.modelName}</td>
                <td className="px-3 py-2">{row.colorName}</td>
                <td className="px-3 py-2">{row.heightLabel}</td>
                <td className="px-3 py-2">{row.employeeName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
