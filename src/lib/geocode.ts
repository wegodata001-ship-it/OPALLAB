/** Reverse geocode via OpenStreetMap Nominatim (free, no API key). */
export interface GeocodedAddress {
  formatted: string | null;
  country: string | null;
  city: string | null;
  street: string | null;
  houseNumber: string | null;
}

interface NominatimAddress {
  country?: string;
  city?: string;
  town?: string;
  village?: string;
  road?: string;
  house_number?: string;
}

export async function reverseGeocodeDetailed(lat: number, lng: number): Promise<GeocodedAddress> {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "json");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("accept-language", "he");
    url.searchParams.set("zoom", "18");
    url.searchParams.set("addressdetails", "1");

    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "OPAL-LAB/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return { formatted: null, country: null, city: null, street: null, houseNumber: null };
    }

    const data = (await res.json()) as {
      display_name?: string;
      address?: NominatimAddress;
    };

    const addr = data.address;
    return {
      formatted: data.display_name ?? null,
      country: addr?.country ?? null,
      city: addr?.city ?? addr?.town ?? addr?.village ?? null,
      street: addr?.road ?? null,
      houseNumber: addr?.house_number ?? null,
    };
  } catch {
    return { formatted: null, country: null, city: null, street: null, houseNumber: null };
  }
}

/** @deprecated use reverseGeocodeDetailed */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const detailed = await reverseGeocodeDetailed(lat, lng);
  return detailed.formatted;
}

export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export function googleMapsEmbedUrl(lat: number, lng: number): string {
  return `https://maps.google.com/maps?q=${lat},${lng}&z=16&output=embed`;
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
