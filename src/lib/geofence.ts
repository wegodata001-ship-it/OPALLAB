/** Point-in-polygon (ray casting) for geofence auto-checkout */
export interface LatLng {
  lat: number;
  lng: number;
}

export const LAB_GEOFENCE: LatLng[] = [
  { lat: 32.8658, lng: 35.2962 },
  { lat: 32.8658, lng: 35.2994 },
  { lat: 32.8630, lng: 35.2994 },
  { lat: 32.8630, lng: 35.2962 },
];

export const LAB_CENTER: LatLng = { lat: 32.8644, lng: 35.2978 };

export function isInsidePolygon(point: LatLng, polygon: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;
    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
