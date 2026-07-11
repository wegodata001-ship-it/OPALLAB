"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import type { AttendanceRecord } from "@/lib/types";
import { Camera, MapPin, MonitorSmartphone } from "lucide-react";

interface AttendanceVerificationCardProps {
  record: AttendanceRecord;
  canView: boolean;
}

export function AttendanceVerificationCard({ record, canView }: AttendanceVerificationCardProps) {
  const [open, setOpen] = useState(false);
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [activeLabel, setActiveLabel] = useState("תמונה");

  if (!canView) return null;

  const items = [
    { label: "צילום כניסה", url: record.checkInPhotoUrl, path: record.checkInPhotoPath },
    { label: "צילום יציאה", url: record.checkOutPhotoUrl, path: record.checkOutPhotoPath },
  ].filter((item) => Boolean(item.url));

  if (items.length === 0) return null;

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-700"><Camera className="h-4 w-4" />אימות נוכחות</div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            className="rounded-lg border border-slate-200 bg-white p-1"
            onClick={() => {
              setActiveUrl(item.url ?? null);
              setActiveLabel(item.label);
              setOpen(true);
            }}
          >
            <img src={item.url!} alt={item.label} className="h-14 w-14 rounded-md object-cover" />
          </button>
        ))}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={activeLabel} className="max-w-2xl">
        {activeUrl ? <img src={activeUrl} alt={activeLabel} className="w-full rounded-xl" /> : <p className="text-sm text-slate-500">אין תמונה זמינה</p>}
      </Modal>
    </div>
  );
}
