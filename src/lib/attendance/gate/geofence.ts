/** Haversine distance in meters between two WGS84 points. */
export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function isWithinGeofence(input: {
  userLat: number;
  userLng: number;
  labLat: number;
  labLng: number;
  radiusMeters: number;
}): { ok: boolean; distanceMeters: number } {
  const d = distanceMeters(input.userLat, input.userLng, input.labLat, input.labLng);
  return { ok: d <= input.radiusMeters, distanceMeters: Math.round(d) };
}
