"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Bone,
  Boxes,
  ChevronLeft,
  Drill,
  FileText,
  FlaskConical,
  Gem,
  Hexagon,
  Palette,
  Puzzle,
} from "lucide-react";
import { Header } from "@/components/layout/sidebar";
import { TITANIUM_HUB_LAST_INDEX } from "@/lib/inventory/titanium-constants";

const STATIC_CARDS: { href: string; title: string; icon: LucideIcon }[] = [
  { href: "/inventory/zirconia", title: "מלאי זירקונים", icon: Gem },
  { href: "/inventory/drills", title: "מלאי מקדחים", icon: Drill },
  { href: "/inventory/clinic-materials", title: "מלאי חומרים למרפאה", icon: FlaskConical },
  { href: "/inventory/implants", title: "מלאי שתלים", icon: Bone },
  { href: "/inventory/doctor-parts", title: "חלקים רופאים", icon: Puzzle },
  { href: "/inventory/misc-materials", title: "מלאי חומרים שונים", icon: Boxes },
];

type HubCard = { key: string; href: string; title: string; icon: LucideIcon; archived?: boolean };

function withInventoryCards(
  titaniumName: string,
  hubSortOrder: number,
  titaniumArchived: boolean,
  bmmaName: string,
): HubCard[] {
  const titanium: HubCard = {
    key: "titanium",
    href: "/inventory/titanium",
    title: titaniumArchived ? `${titaniumName} (בארכיון)` : titaniumName,
    icon: Hexagon,
    archived: titaniumArchived,
  };
  const index = Math.min(Math.max(hubSortOrder, 0), TITANIUM_HUB_LAST_INDEX);
  const cards: HubCard[] = STATIC_CARDS.map((card) => ({ ...card, key: card.href }));
  cards.splice(index, 0, titanium);
  cards.push({ key: "bmma", href: "/inventory/bmma", title: bmmaName, icon: Palette });
  cards.push({ key: "reports", href: "/inventory/reports", title: "דוחות מלאי", icon: FileText });
  return cards;
}

export default function InventoryHubPage() {
  const [cards, setCards] = useState<HubCard[]>(() =>
    withInventoryCards("מלאי טיטניום", TITANIUM_HUB_LAST_INDEX, false, "BMMA"),
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let titaniumName = "מלאי טיטניום";
      let hubSortOrder = TITANIUM_HUB_LAST_INDEX;
      let titaniumArchived = false;
      let bmmaName = "BMMA";
      try {
        const [titaniumRes, bmmaRes] = await Promise.all([
          fetch("/api/inventory/titanium", { credentials: "include" }),
          fetch("/api/inventory/bmma", { credentials: "include" }),
        ]);
        const titaniumJson = (await titaniumRes.json()) as {
          success: boolean;
          data?: { category?: { name: string; hubSortOrder: number; archivedAt: string | null } };
        };
        const bmmaJson = (await bmmaRes.json()) as {
          success: boolean;
          data?: { category?: { name: string } };
        };
        if (titaniumJson.success && titaniumJson.data?.category) {
          titaniumName = titaniumJson.data.category.name;
          hubSortOrder = titaniumJson.data.category.hubSortOrder;
          titaniumArchived = Boolean(titaniumJson.data.category.archivedAt);
        }
        if (bmmaJson.success && bmmaJson.data?.category?.name) bmmaName = bmmaJson.data.category.name;
      } catch {
        /* keep the default cards */
      }
      if (!cancelled) setCards(withInventoryCards(titaniumName, hubSortOrder, titaniumArchived, bmmaName));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <Header title="מלאי" description="בחרו סוג מלאי לכניסה" />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.key}
              href={card.href}
              className="group flex min-h-[9.5rem] items-center gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-opal-gold hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-opal-gold"
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-opal-gold shadow-sm transition group-hover:bg-slate-800">
                <Icon className="h-7 w-7" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1 text-lg font-bold text-slate-900">{card.title}</span>
              <ChevronLeft className="h-5 w-5 shrink-0 text-opal-gold transition duration-200 group-hover:-translate-x-1" />
            </Link>
          );
        })}
      </div>

      <p className="mt-8 text-sm text-slate-500">
        <Link href="/inventory/classic" className="font-medium text-slate-700 underline-offset-4 hover:text-opal-gold-dark hover:underline">
          ניהול המלאי הקיים
        </Link>
      </p>
    </>
  );
}
