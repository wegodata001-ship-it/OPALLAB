"use client";

import { Modal } from "@/components/ui/modal";
import type { AttendanceRecord } from "@/lib/types";
import { googleMapsUrl, googleMapsEmbedUrl } from "@/lib/geocode";
import { formatDate, formatTime } from "@/lib/utils";
import { Clock, Crosshair, ExternalLink, MapPin, Monitor, Smartphone } from "lucide-react";

interface AttendanceAdminDetailModalProps {
  open: boolean;
  onClose: () => void;
  record: AttendanceRecord;
  employeeName: string;
}

function DetailSection({
  title,
  time,
  photoUrl,
  address,
  lat,
  lng,
  accuracy,
  browser,
  os,
  deviceType,
  userAgent,
  screenSize,
  timezone,
  country,
  city,
  street,
  houseNumber,
}: {
  title: string;
  time?: Date | null;
  photoUrl?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
  browser?: string | null;
  os?: string | null;
  deviceType?: string | null;
  userAgent?: string | null;
  screenSize?: string | null;
  timezone?: string | null;
  country?: string | null;
  city?: string | null;
  street?: string | null;
  houseNumber?: string | null;
}) {
  if (!time) return null;

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <h3 className="font-bold text-slate-800">{title} — {formatTime(time)} · {formatDate(time)}</h3>
      {photoUrl && (
        <img src={photoUrl} alt={title} className="w-full max-h-80 rounded-xl object-cover border" />
      )}
      <div className="text-sm space-y-1 text-slate-600">
        <p className="flex items-center gap-2"><MapPin className="h-4 w-4" />{address || "—"}</p>
        {(street || city || country) && (
          <p>{[street, houseNumber, city, country].filter(Boolean).join(", ")}</p>
        )}
        {lat != null && lng != null && (
          <div className="space-y-2">
            <iframe
              title={`מפה — ${title}`}
              src={googleMapsEmbedUrl(lat, lng)}
              className="w-full h-48 rounded-lg border"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
            <a href={googleMapsUrl(lat, lng)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-opal-gold-dark hover:underline text-sm">
              פתח ב-Google Maps <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
        {accuracy != null && (
          <p className="flex items-center gap-1"><Crosshair className="h-3 w-3" />דיוק: ±{Math.round(accuracy)} מ׳</p>
        )}
        {lat != null && lng != null && (
          <p className="text-xs font-mono text-slate-400">{lat.toFixed(6)}, {lng.toFixed(6)}</p>
        )}
      </div>
      <div className="text-xs text-slate-500 grid sm:grid-cols-2 gap-2 border-t pt-3">
        {browser && <p><Monitor className="inline h-3 w-3 ml-1" />דפדפן: {browser}</p>}
        {os && <p>מערכת: {os}</p>}
        {deviceType && <p><Smartphone className="inline h-3 w-3 ml-1" />מכשיר: {deviceType}</p>}
        {screenSize && <p>מסך: {screenSize}</p>}
        {timezone && <p>אזור זמן: {timezone}</p>}
        {userAgent && <p className="sm:col-span-2 truncate" title={userAgent}>UA: {userAgent}</p>}
      </div>
    </div>
  );
}

export function AttendanceAdminDetailModal({ open, onClose, record, employeeName }: AttendanceAdminDetailModalProps) {
  const hours = record.checkOut
    ? ((record.checkOut.getTime() - record.checkIn.getTime()) / 3600000).toFixed(1)
    : "פעיל";

  return (
    <Modal open={open} onClose={onClose} title={`נוכחות — ${employeeName}`} className="max-w-3xl">
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <Clock className="h-4 w-4" />
          משך עבודה: {hours} שעות
        </div>

        <DetailSection
          title="כניסה"
          time={record.checkIn}
          photoUrl={record.checkInPhotoUrl}
          address={record.checkInAddress}
          lat={record.checkInLatitude ?? record.latitude}
          lng={record.checkInLongitude ?? record.longitude}
          accuracy={record.checkInAccuracy}
          browser={record.checkInDeviceBrowser}
          os={record.checkInDeviceOs}
          deviceType={record.checkInDeviceType}
          userAgent={record.checkInUserAgent}
          screenSize={record.checkInScreenSize}
          timezone={record.checkInTimezone}
          country={record.checkInAddressCountry}
          city={record.checkInAddressCity}
          street={record.checkInAddressStreet}
          houseNumber={record.checkInAddressHouseNumber}
        />

        <DetailSection
          title="יציאה"
          time={record.checkOut}
          photoUrl={record.checkOutPhotoUrl}
          address={record.checkOutAddress}
          lat={record.checkOutLatitude}
          lng={record.checkOutLongitude}
          accuracy={record.checkOutAccuracy}
          browser={record.checkOutDeviceBrowser}
          os={record.checkOutDeviceOs}
          deviceType={record.checkOutDeviceType}
          userAgent={record.checkOutUserAgent}
          screenSize={record.checkOutScreenSize}
          timezone={record.checkOutTimezone}
          country={record.checkOutAddressCountry}
          city={record.checkOutAddressCity}
          street={record.checkOutAddressStreet}
          houseNumber={record.checkOutAddressHouseNumber}
        />
      </div>
    </Modal>
  );
}
