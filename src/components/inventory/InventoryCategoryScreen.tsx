"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Header } from "@/components/layout/sidebar";

export function InventoryCategoryScreen({ title }: { title: string }) {
  return (
    <>
      <Header title={title} />
      <Link
        href="/inventory"
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 shadow-sm transition hover:border-opal-gold hover:text-opal-gold-dark"
      >
        <ChevronRight className="h-4 w-4" />
        חזרה למלאי
      </Link>
      <div className="mt-8 rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
        <p className="text-base text-slate-600">הגדרות המלאי יתווספו בהמשך</p>
      </div>
    </>
  );
}
