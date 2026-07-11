/** Reverse geocode via OpenStreetMap Nominatim (free, no API key). */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "json");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("accept-language", "he");
    url.searchParams.set("zoom", "18");

    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "OPAL-LAB/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { display_name?: string };
    return data.display_name ?? null;
  } catch {
    return null;
  }
}

export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export function formatLocationLabel(
  address: string | null | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined,
): string {
  if (address?.trim()) return address;
  if (lat != null && lng != null) return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  return "מיקום לא התקבל";
}
