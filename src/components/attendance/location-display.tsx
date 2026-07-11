"use client";

import { MapPin, ExternalLink } from "lucide-react";
import { formatLocationLabel, googleMapsUrl } from "@/lib/geocode";
import { formatTime } from "@/lib/utils";

interface AttendanceLocationDisplayProps {
  label: string;
  time: Date;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export function AttendanceLocationDisplay({
  label,
  time,
  address,
  lat,
  lng,
}: AttendanceLocationDisplayProps) {
  const locationText = formatLocationLabel(address, lat, lng);
  const hasMap = lat != null && lng != null;

  return (
    <div className="text-sm space-y-0.5">
      <p className="font-medium text-slate-800">
        {label ? `${label}: ` : ""}{formatTime(time)}
      </p>
      <p className="text-slate-600 flex items-start gap-1.5">
        <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>{locationText}</span>
      </p>
      {hasMap && (
        <a
          href={googleMapsUrl(lat, lng)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-opal-gold-dark hover:underline inline-flex items-center gap-1"
        >
          פתח במפה
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
