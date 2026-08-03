"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import {
  attendanceExportUrl,
  deleteAttendancePhoto,
  fetchAttendanceRecords,
} from "@/lib/attendance/management/client";
import type {
  AttendanceEmployeeRosterRow,
  AttendanceLabGeo,
  AttendanceManagementRecord,
} from "@/lib/attendance/management/types";
import { AttendancePhotoModal, type AttendancePhotoItem } from "@/components/attendance/management/AttendancePhotoModal";
import { EmployeeAvatar } from "@/components/attendance/management/EmployeeAvatar";
import { distanceMeters } from "@/lib/attendance/gate/geofence";
import { googleMapsEmbedUrl, googleMapsUrl } from "@/lib/geocode";
import { USER_ROLE_LABELS } from "@/lib/constants/labels";
import { formatDate, formatTime, cn } from "@/lib/utils";
import {
  AlertTriangle,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Loader2,
  MapPin,
  Phone,
  Smartphone,
} from "lucide-react";

type RangePreset = "day" | "week" | "month" | "year";

function rangeForPreset(preset: RangePreset): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const start = new Date(now);
  if (preset === "day") start.setHours(0, 0, 0, 0);
  else if (preset === "week") start.setDate(start.getDate() - 6);
  else if (preset === "month") start.setDate(1);
  else start.setMonth(0, 1);
  return { from: start.toISOString().slice(0, 10), to };
}

function mapsLink(lat?: number | null, lng?: number | null): string | null {
  if (lat == null || lng == null) return null;
  return googleMapsUrl(lat, lng);
}

function GeoBlock({
  label,
  lat,
  lng,
  address,
  labGeo,
}: {
  label: string;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  labGeo: AttendanceLabGeo;
}) {
  if (lat == null || lng == null) {
    return (
      <p className="text-xs text-slate-400">
        {label}: אין GPS
      </p>
    );
  }
  const dist =
    labGeo.labLatitude != null && labGeo.labLongitude != null
      ? Math.round(distanceMeters(lat, lng, labGeo.labLatitude, labGeo.labLongitude))
      : null;
  const outOfRange =
    dist != null && labGeo.geofenceEnabled && dist > labGeo.geofenceRadiusMeters;
  const link = mapsLink(lat, lng);

  return (
    <div className="space-y-1 text-xs">
      <p className="font-medium text-slate-700">{label}</p>
      <p className="text-slate-600" dir="ltr">
        {lat.toFixed(5)}, {lng.toFixed(5)}
      </p>
      {address && <p className="text-slate-500">{address}</p>}
      {dist != null && (
        <p className={cn(outOfRange ? "text-red-600 font-semibold" : "text-slate-500")}>
          מרחק מהמעבדה: {dist}מ׳
          {outOfRange ? " — מחוץ לרדיוס המותר" : ""}
        </p>
      )}
      {link && (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sky-700 hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          פתח במפות
        </a>
      )}
    </div>
  );
}

export function EmployeeAttendanceCard({
  open,
  row,
  labGeo,
  onClose,
  onDevicesChanged,
}: {
  open: boolean;
  row: AttendanceEmployeeRosterRow | null;
  labGeo: AttendanceLabGeo;
  onClose: () => void;
  onDevicesChanged?: () => void;
}) {
  const [preset, setPreset] = useState<RangePreset>("month");
  const [records, setRecords] = useState<AttendanceManagementRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [photoModal, setPhotoModal] = useState<{ photos: AttendancePhotoItem[]; index: number } | null>(
    null,
  );
  const [busyDevice, setBusyDevice] = useState(false);

  const range = useMemo(() => rangeForPreset(preset), [preset]);

  const load = useCallback(async () => {
    if (!row) return;
    setLoading(true);
    try {
      const result = await fetchAttendanceRecords({
        userId: row.employee.id,
        from: range.from,
        to: range.to,
        page: 1,
        limit: 200,
        sortBy: "checkIn",
        sortDir: "desc",
      });
      if (result.mode === "records") setRecords(result.records);
      else setRecords([]);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [row, range.from, range.to]);

  useEffect(() => {
    if (open && row) void load();
  }, [open, row, load]);

  const gallery = useMemo(() => {
    const items: AttendancePhotoItem[] = [];
    for (const r of records) {
      if (r.checkInPhotoUrl || r.checkInPhotoPath) {
        items.push({
          url: r.checkInPhotoUrl,
          label: `כניסה ${formatDate(r.checkIn)} ${formatTime(r.checkIn)}`,
          recordId: r.id,
          kind: "check-in",
        });
      }
      if (r.checkOutPhotoUrl || r.checkOutPhotoPath) {
        items.push({
          url: r.checkOutPhotoUrl,
          label: `יציאה ${r.checkOut ? `${formatDate(r.checkOut)} ${formatTime(r.checkOut)}` : ""}`,
          recordId: r.id,
          kind: "check-out",
        });
      }
    }
    return items;
  }, [records]);

  const mapUrl = useMemo(() => {
    const withGps = records.find(
      (r) =>
        (r.checkInLatitude ?? r.latitude) != null &&
        (r.checkInLongitude ?? r.longitude) != null,
    );
    if (!withGps) return null;
    const inLat = withGps.checkInLatitude ?? withGps.latitude;
    const inLng = withGps.checkInLongitude ?? withGps.longitude;
    return mapEmbed(
      inLat,
      inLng,
      withGps.checkOutLatitude,
      withGps.checkOutLongitude,
    );
  }, [records]);

  const deviceAction = async (action: "reset" | "delete" | "approve") => {
    if (!row?.deviceId) return;
    setBusyDevice(true);
    try {
      if (action === "delete") {
        if (!confirm("למחוק את המכשיר המאושר? העובד יידרש להירשם מחדש.")) return;
        await fetch(`/api/attendance/trusted-devices?deviceId=${encodeURIComponent(row.deviceId)}`, {
          method: "DELETE",
          credentials: "include",
        });
      } else {
        const status = action === "reset" ? "REVOKED" : "ACTIVE";
        await fetch("/api/attendance/trusted-devices", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId: row.deviceId, status }),
        });
      }
      onDevicesChanged?.();
    } finally {
      setBusyDevice(false);
    }
  };

  const openPhotos = (record: AttendanceManagementRecord, kind: "check-in" | "check-out") => {
    const photos: AttendancePhotoItem[] = [];
    if (record.checkInPhotoUrl || record.checkInPhotoPath) {
      photos.push({
        url: record.checkInPhotoUrl,
        label: "תמונת כניסה",
        recordId: record.id,
        kind: "check-in",
      });
    }
    if (record.checkOutPhotoUrl || record.checkOutPhotoPath) {
      photos.push({
        url: record.checkOutPhotoUrl,
        label: "תמונת יציאה",
        recordId: record.id,
        kind: "check-out",
      });
    }
    const index = Math.max(
      0,
      photos.findIndex((p) => p.kind === kind),
    );
    if (photos.length) setPhotoModal({ photos, index });
  };

  const removePhoto = async (recordId: string, kind: "check-in" | "check-out") => {
    if (!confirm("למחוק את התמונה מהרשומה?")) return;
    await deleteAttendancePhoto(recordId, kind);
    await load();
    setPhotoModal(null);
  };

  if (!row) return null;
  const emp = row.employee;
  const exportQuery = {
    userId: emp.id,
    from: range.from,
    to: range.to,
  };

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        title={`כרטסת נוכחות — ${emp.name}`}
        className="max-w-3xl"
      >
        <div className="space-y-6">
          <section className="flex items-start gap-3">
            <EmployeeAvatar name={emp.name} color={emp.color} />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-lg text-slate-900">{emp.name}</p>
              <p className="text-sm text-slate-500">
                {USER_ROLE_LABELS[emp.role] ?? emp.role}
              </p>
              {emp.phone && (
                <p className="text-sm text-slate-600 flex items-center gap-1 mt-1">
                  <Phone className="h-3.5 w-3.5" />
                  {emp.phone}
                </p>
              )}
              <div className="mt-2 text-xs text-slate-600 flex flex-wrap gap-x-3 gap-y-1">
                <span className="inline-flex items-center gap-1">
                  <Smartphone className="h-3.5 w-3.5" />
                  {row.deviceStatus === "NONE"
                    ? "אין מכשיר מאושר"
                    : `${row.deviceLabel || "מכשיר"} · ${row.deviceOs || "—"} · ${row.deviceBrowser || "—"}`}
                </span>
                <span>
                  סטטוס:{" "}
                  {row.deviceStatus === "ACTIVE"
                    ? "מאושר"
                    : row.deviceStatus === "BLOCKED"
                      ? "חסום"
                      : row.deviceStatus === "REVOKED"
                        ? "בוטל"
                        : "ללא"}
                </span>
              </div>
              {row.deviceId && (
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyDevice}
                    onClick={() => void deviceAction("reset")}
                  >
                    איפוס מכשיר
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyDevice}
                    onClick={() => void deviceAction("approve")}
                  >
                    אישור מחדש
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600"
                    disabled={busyDevice}
                    onClick={() => void deviceAction("delete")}
                  >
                    מחיקת מכשיר
                  </Button>
                </div>
              )}
            </div>
          </section>

          {mapUrl && (
            <section className="space-y-2">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-opal-gold" />
                מפת נוכחות אחרונה
              </h3>
              <iframe
                title="מפת נוכחות"
                src={mapUrl}
                className="w-full h-48 rounded-xl border"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </section>
          )}

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-800">היסטוריית נוכחות</h3>
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    ["day", "יום"],
                    ["week", "שבוע"],
                    ["month", "חודש"],
                    ["year", "שנה"],
                  ] as const
                ).map(([id, label]) => (
                  <Button
                    key={id}
                    size="sm"
                    variant={preset === id ? "default" : "outline"}
                    onClick={() => setPreset(id)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(attendanceExportUrl(exportQuery, "csv"), "_blank")}
              >
                <FileSpreadsheet className="h-4 w-4 ml-1" />
                Excel
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(attendanceExportUrl(exportQuery, "pdf"), "_blank")}
              >
                <FileText className="h-4 w-4 ml-1" />
                PDF
              </Button>
            </div>

            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-opal-gold" />
              </div>
            ) : records.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">אין רשומות בטווח שנבחר</p>
            ) : (
              <div className="space-y-2">
                {records.map((r) => {
                  const expanded = expandedId === r.id;
                  const hours = r.durationHours != null ? r.durationHours.toFixed(1) : r.checkOut ? "—" : "פעיל";
                  const status = r.checkOut ? (r.isLate ? "יצא · איחור" : "נסגרה") : "פתוחה";
                  return (
                    <div key={r.id} className="rounded-xl border border-slate-200 overflow-hidden">
                      <button
                        type="button"
                        className="w-full text-right px-3 py-2.5 hover:bg-slate-50 grid grid-cols-2 sm:grid-cols-5 gap-1 text-xs sm:text-sm"
                        onClick={() => setExpandedId(expanded ? null : r.id)}
                      >
                        <span>{formatDate(r.checkIn)}</span>
                        <span>כניסה {formatTime(r.checkIn)}</span>
                        <span>{r.checkOut ? `יציאה ${formatTime(r.checkOut)}` : "—"}</span>
                        <span>{hours} שע׳</span>
                        <span className={cn(r.isLate && "text-amber-700", !r.checkOut && "text-emerald-700")}>
                          {status}
                        </span>
                      </button>
                      {expanded && (
                        <div className="border-t bg-slate-50/80 p-3 space-y-4 text-sm">
                          <div className="grid sm:grid-cols-2 gap-4">
                            <GeoBlock
                              label="📍 כניסה"
                              lat={r.checkInLatitude ?? r.latitude}
                              lng={r.checkInLongitude ?? r.longitude}
                              address={r.checkInAddress}
                              labGeo={labGeo}
                            />
                            <GeoBlock
                              label="📍 יציאה"
                              lat={r.checkOutLatitude}
                              lng={r.checkOutLongitude}
                              address={r.checkOutAddress}
                              labGeo={labGeo}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <PhotoCell
                              label="תמונת כניסה"
                              url={r.checkInPhotoUrl}
                              has={Boolean(r.checkInPhotoUrl || r.checkInPhotoPath)}
                              onOpen={() => openPhotos(r, "check-in")}
                              onDelete={() => void removePhoto(r.id, "check-in")}
                            />
                            <PhotoCell
                              label="תמונת יציאה"
                              url={r.checkOutPhotoUrl}
                              has={Boolean(r.checkOutPhotoUrl || r.checkOutPhotoPath)}
                              onOpen={() => openPhotos(r, "check-out")}
                              onDelete={() => void removePhoto(r.id, "check-out")}
                            />
                          </div>

                          <div className="rounded-lg border bg-white p-3 space-y-1 text-xs text-slate-600">
                            <p className="font-semibold text-slate-800 mb-1">Audit</p>
                            <p>זמן כניסה: {formatDate(r.checkIn)} {formatTime(r.checkIn)}</p>
                            <p>
                              זמן יציאה:{" "}
                              {r.checkOut ? `${formatDate(r.checkOut)} ${formatTime(r.checkOut)}` : "—"}
                            </p>
                            <p>כתובת IP: {r.ipAddress || "—"}</p>
                            <p>
                              סוג מכשיר: {r.checkInDeviceType || r.deviceInfo || "—"}
                            </p>
                            <p>מערכת הפעלה: {r.checkInDeviceOs || "—"}</p>
                            <p className="break-all">User Agent: {r.checkInUserAgent || "—"}</p>
                            {r.notes && <p>הערות: {r.notes}</p>}
                            {r.isLate && (
                              <p className="text-amber-700 flex items-center gap-1">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                חריגה: איחור בכניסה
                              </p>
                            )}
                            {!r.gpsValid && (
                              <p className="text-red-600 flex items-center gap-1">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                חריגה: GPS לא תקין
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {gallery.length > 0 && (
            <section className="space-y-2">
              <h3 className="font-semibold text-slate-800">גלריית תמונות</h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {gallery.map((g, i) => (
                  <button
                    key={`${g.recordId}-${g.kind}`}
                    type="button"
                    className="relative aspect-square rounded-lg overflow-hidden border bg-slate-100"
                    onClick={() => setPhotoModal({ photos: gallery, index: i })}
                  >
                    {g.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={g.url} alt={g.label} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-slate-500 flex items-center justify-center h-full">
                        תמונה
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </Drawer>

      {photoModal && (
        <AttendancePhotoModal
          open
          photos={photoModal.photos}
          startIndex={photoModal.index}
          allowDownload
          onClose={() => setPhotoModal(null)}
          onDelete={(photo) => {
            if (photo.recordId && photo.kind) void removePhoto(photo.recordId, photo.kind);
          }}
        />
      )}
    </>
  );
}

function mapEmbed(
  inLat?: number | null,
  inLng?: number | null,
  outLat?: number | null,
  outLng?: number | null,
): string | null {
  if (inLat != null && inLng != null && outLat != null && outLng != null) {
    return `https://maps.google.com/maps?saddr=${inLat},${inLng}&daddr=${outLat},${outLng}&output=embed`;
  }
  if (inLat != null && inLng != null) return googleMapsEmbedUrl(inLat, inLng);
  if (outLat != null && outLng != null) return googleMapsEmbedUrl(outLat, outLng);
  return null;
}

function PhotoCell({
  label,
  url,
  has,
  onOpen,
  onDelete,
}: {
  label: string;
  url?: string | null;
  has: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  if (!has) {
    return (
      <div className="rounded-lg border border-dashed p-3 text-xs text-slate-400 text-center">
        {label}: אין
      </div>
    );
  }
  return (
    <div className="rounded-lg border overflow-hidden bg-white">
      <button type="button" className="block w-full" onClick={onOpen}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={label} className="w-full h-28 object-cover" />
        ) : (
          <div className="h-28 flex items-center justify-center text-xs text-slate-500">{label}</div>
        )}
      </button>
      <div className="flex justify-between px-2 py-1 text-[11px]">
        <button type="button" className="text-sky-700" onClick={onOpen}>
          הגדל
        </button>
        <button type="button" className="text-red-600" onClick={onDelete}>
          מחק
        </button>
      </div>
    </div>
  );
}
