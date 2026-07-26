"use client";

import { Drawer } from "@/components/ui/drawer";
import type { AttendanceManagementRecord } from "@/lib/attendance/management/types";
import { USER_ROLE_LABELS, ATTENDANCE_METHOD_LABELS } from "@/lib/constants/labels";
import { googleMapsEmbedUrl, googleMapsUrl } from "@/lib/geocode";
import { formatDate, formatTime } from "@/lib/utils";
import { Clock, Crosshair, ExternalLink, MapPin, Monitor, Phone, Smartphone } from "lucide-react";

function mapEmbedUrl(
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

function EventBlock({
  title,
  markerColor,
  time,
  photoUrl,
  hasPhoto,
  address,
  lat,
  lng,
  accuracy,
  browser,
  os,
  deviceType,
  screenSize,
  timezone,
  userAgent,
  country,
  city,
  street,
  houseNumber,
  photoKind,
  onOpenPhoto,
}: {
  title: string;
  markerColor: string;
  time?: Date | null;
  photoUrl?: string | null;
  hasPhoto?: boolean;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
  browser?: string | null;
  os?: string | null;
  deviceType?: string | null;
  screenSize?: string | null;
  timezone?: string | null;
  userAgent?: string | null;
  country?: string | null;
  city?: string | null;
  street?: string | null;
  houseNumber?: string | null;
  photoKind: "check-in" | "check-out";
  onOpenPhoto?: (kind: "check-in" | "check-out") => void;
}) {
  if (!time) return null;
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <h3 className="font-bold text-slate-800 flex items-center gap-2">
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: markerColor }} />
        {title} — {formatTime(time)} · {formatDate(time)}
      </h3>
      {photoUrl || hasPhoto ? (
        <button
          type="button"
          className="block w-full"
          onClick={() => onOpenPhoto?.(photoKind)}
        >
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={title}
              className="w-full max-h-72 rounded-xl object-cover border hover:opacity-95"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = "none";
                const sibling = e.currentTarget.nextElementSibling as HTMLElement | null;
                if (sibling) sibling.hidden = false;
              }}
            />
          ) : null}
          <p
            className="text-sm text-slate-500 py-8 text-center border rounded-xl"
            hidden={Boolean(photoUrl)}
          >
            {photoUrl ? "אין תמונה זמינה" : "פתח תמונה"}
          </p>
        </button>
      ) : (
        <p className="text-sm text-slate-400">אין תמונה</p>
      )}
      <div className="text-sm space-y-1 text-slate-600">
        <p className="flex items-center gap-2"><MapPin className="h-4 w-4" />{address || "אין נתונים"}</p>
        {(street || city || country) && (
          <p>{[street, houseNumber, city, country].filter(Boolean).join(", ")}</p>
        )}
        {lat != null && lng != null && (
          <>
            <p className="text-xs font-mono">{lat.toFixed(6)}, {lng.toFixed(6)}</p>
            <a href={googleMapsUrl(lat, lng)} target="_blank" rel="noopener noreferrer" className="text-opal-gold-dark text-xs inline-flex items-center gap-1 hover:underline">
              פתח במפה <ExternalLink className="h-3 w-3" />
            </a>
          </>
        )}
        {accuracy != null && (
          <p className="flex items-center gap-1"><Crosshair className="h-3 w-3" />דיוק: ±{Math.round(accuracy)} מ׳</p>
        )}
      </div>
      <div className="text-xs text-slate-500 grid sm:grid-cols-2 gap-2 border-t pt-3">
        {browser && <p><Monitor className="inline h-3 w-3 ml-1" />{browser}</p>}
        {os && <p>מערכת: {os}</p>}
        {deviceType && <p><Smartphone className="inline h-3 w-3 ml-1" />{deviceType}</p>}
        {screenSize && <p>רזולוציה: {screenSize}</p>}
        {timezone && <p>אזור זמן: {timezone}</p>}
        {userAgent && <p className="sm:col-span-2 break-all">{userAgent}</p>}
      </div>
    </div>
  );
}

interface AttendanceRecordDrawerProps {
  open: boolean;
  onClose: () => void;
  record: AttendanceManagementRecord | null;
  onOpenPhoto?: (kind: "check-in" | "check-out") => void;
}

export function AttendanceRecordDrawer({ open, onClose, record, onOpenPhoto }: AttendanceRecordDrawerProps) {
  if (!record) return null;

  const inLat = record.checkInLatitude ?? record.latitude;
  const inLng = record.checkInLongitude ?? record.longitude;
  const mapUrl = mapEmbedUrl(inLat, inLng, record.checkOutLatitude, record.checkOutLongitude);
  const hours = record.durationHours?.toFixed(1) ?? "פעיל";

  return (
    <Drawer open={open} onClose={onClose} title={`פרטי נוכחות — ${record.employee.name}`}>
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-50 p-4 text-sm space-y-1">
          <p className="font-bold text-lg">{record.employee.name}</p>
          <p className="flex items-center gap-2 text-slate-600">
            <Phone className="h-4 w-4" />
            {record.employee.phone || "אין נתונים"}
          </p>
          <p>מחלקה / תפקיד: {USER_ROLE_LABELS[record.employee.role]}</p>
          <p>שיטת רישום: {ATTENDANCE_METHOD_LABELS[record.method]}</p>
          <p className="flex items-center gap-2"><Clock className="h-4 w-4" />משך: {hours} שעות</p>
        </div>

        {mapUrl && (
          <div className="space-y-2">
            <p className="text-sm font-medium">מפה — כניסה (אדום) / יציאה (כחול)</p>
            <iframe title="מפת נוכחות" src={mapUrl} className="w-full h-56 rounded-xl border" loading="lazy" />
          </div>
        )}

        <EventBlock
          title="כניסה"
          markerColor="#ef4444"
          time={record.checkIn}
          photoUrl={record.checkInPhotoUrl}
          hasPhoto={Boolean(record.checkInPhotoUrl || record.checkInPhotoPath)}
          photoKind="check-in"
          address={record.checkInAddress}
          lat={inLat}
          lng={inLng}
          accuracy={record.checkInAccuracy}
          browser={record.checkInDeviceBrowser}
          os={record.checkInDeviceOs}
          deviceType={record.checkInDeviceType}
          screenSize={record.checkInScreenSize}
          timezone={record.checkInTimezone}
          userAgent={record.checkInUserAgent}
          country={record.checkInAddressCountry}
          city={record.checkInAddressCity}
          street={record.checkInAddressStreet}
          houseNumber={record.checkInAddressHouseNumber}
          onOpenPhoto={onOpenPhoto}
        />

        <EventBlock
          title="יציאה"
          markerColor="#3b82f6"
          time={record.checkOut}
          photoUrl={record.checkOutPhotoUrl}
          hasPhoto={Boolean(record.checkOutPhotoUrl || record.checkOutPhotoPath)}
          photoKind="check-out"
          address={record.checkOutAddress}
          lat={record.checkOutLatitude}
          lng={record.checkOutLongitude}
          accuracy={record.checkOutAccuracy}
          browser={record.checkOutDeviceBrowser}
          os={record.checkOutDeviceOs}
          deviceType={record.checkOutDeviceType}
          screenSize={record.checkOutScreenSize}
          timezone={record.checkOutTimezone}
          userAgent={record.checkOutUserAgent}
          country={record.checkOutAddressCountry}
          city={record.checkOutAddressCity}
          street={record.checkOutAddressStreet}
          houseNumber={record.checkOutAddressHouseNumber}
          onOpenPhoto={onOpenPhoto}
        />
      </div>
    </Drawer>
  );
}
