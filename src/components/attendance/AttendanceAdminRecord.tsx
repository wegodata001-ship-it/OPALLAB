"use client";

import { useState } from "react";
import type { AttendanceRecord } from "@/lib/types";
import { AttendanceLocationDisplay } from "@/components/attendance/location-display";
import { AttendanceAdminDetailModal } from "@/components/attendance/AttendanceAdminDetailModal";
import { formatDate, formatTime } from "@/lib/utils";
import { Clock } from "lucide-react";

interface AttendanceAdminRecordProps {
  record: AttendanceRecord;
  employeeName: string;
}

export function AttendanceAdminRecord({ record, employeeName }: AttendanceAdminRecordProps) {
  const [detailOpen, setDetailOpen] = useState(false);

  const hours = record.checkOut
    ? ((record.checkOut.getTime() - record.checkIn.getTime()) / 3600000).toFixed(1)
    : "פעיל";

  const inLat = record.checkInLatitude ?? record.latitude;
  const inLng = record.checkInLongitude ?? record.longitude;

  return (
    <>
      <button
        type="button"
        onClick={() => setDetailOpen(true)}
        className="w-full text-right p-4 rounded-xl border bg-white hover:border-opal-gold/50 transition-colors space-y-3"
      >
        <div className="flex items-center justify-between">
          <p className="font-bold text-slate-800">{employeeName}</p>
          <p className="flex items-center gap-1 text-sm font-bold text-opal-gold-dark">
            <Clock className="h-4 w-4" />
            {hours} שע׳
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div className="space-y-1">
            <p className="text-xs text-slate-500">כניסה {formatTime(record.checkIn)}</p>
            <AttendanceLocationDisplay label="" time={record.checkIn} address={record.checkInAddress} lat={inLat} lng={inLng} />
            {record.checkInAccuracy != null && (
              <p className="text-xs text-slate-400">דיוק: ±{Math.round(record.checkInAccuracy)} מ׳</p>
            )}
            {(record.checkInDeviceBrowser || record.checkInDeviceOs) && (
              <p className="text-xs text-slate-500">
                {record.checkInDeviceBrowser && `דפדפן: ${record.checkInDeviceBrowser}`}
                {record.checkInDeviceBrowser && record.checkInDeviceOs && " · "}
                {record.checkInDeviceOs && `מערכת: ${record.checkInDeviceOs}`}
                {record.checkInDeviceType && ` · ${record.checkInDeviceType}`}
              </p>
            )}
          </div>
          {record.checkOut && (
            <div>
              <p className="text-xs text-slate-500">יציאה {formatTime(record.checkOut)}</p>
              <AttendanceLocationDisplay label="" time={record.checkOut} address={record.checkOutAddress} lat={record.checkOutLatitude} lng={record.checkOutLongitude} />
            </div>
          )}
        </div>

        <p className="text-xs text-slate-400">{formatDate(record.checkIn)} · לחץ לפרטים מלאים</p>
      </button>

      <AttendanceAdminDetailModal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        record={record}
        employeeName={employeeName}
      />
    </>
  );
}
