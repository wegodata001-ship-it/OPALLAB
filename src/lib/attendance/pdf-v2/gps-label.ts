import { googleMapsUrl } from "@/lib/geocode";

export function extractCityName(
  city?: string | null,
  address?: string | null,
): string | null {
  if (city?.trim()) return city.trim();
  if (!address?.trim()) return null;
  const parts = address.split(/[,،]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 2] ?? parts[0] ?? null;
  return parts[0] ?? null;
}

export function gpsLocationHtml(
  city?: string | null,
  address?: string | null,
  lat?: number | null,
  lng?: number | null,
): string {
  const name = extractCityName(city, address);
  if (!name && (lat == null || lng == null)) {
    return '<span class="muted">—</span>';
  }
  const label = name ? `📍 ${escapeHtml(name)}` : '<span class="muted">—</span>';
  if (lat != null && lng != null) {
    const url = googleMapsUrl(lat, lng);
    return `<div class="gps-cell">${label}<a class="map-link" href="${url}">פתח במפות</a></div>`;
  }
  return `<div class="gps-cell">${label}</div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
