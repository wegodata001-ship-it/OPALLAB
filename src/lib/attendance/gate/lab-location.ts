import { prisma } from "@/lib/prisma";

export type LabGateSettings = {
  labLatitude: number | null;
  labLongitude: number | null;
  geofenceRadiusMeters: number;
  /** Optional token embedded in QR/NFC URL (?t=...) */
  gateToken: string | null;
  geofenceEnabled: boolean;
};

const DEFAULT_RADIUS = 120;

export async function getLabGateSettings(): Promise<LabGateSettings> {
  const rows = await prisma.labSettings.findMany({
    where: {
      key: {
        in: ["labLatitude", "labLongitude", "geofenceRadiusMeters", "gateToken"],
      },
    },
  });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  const labLatitude = map.labLatitude ? Number(map.labLatitude) : null;
  const labLongitude = map.labLongitude ? Number(map.labLongitude) : null;
  const geofenceRadiusMeters = map.geofenceRadiusMeters
    ? Number(map.geofenceRadiusMeters)
    : DEFAULT_RADIUS;

  return {
    labLatitude: Number.isFinite(labLatitude) ? labLatitude : null,
    labLongitude: Number.isFinite(labLongitude) ? labLongitude : null,
    geofenceRadiusMeters:
      Number.isFinite(geofenceRadiusMeters) && geofenceRadiusMeters > 0
        ? geofenceRadiusMeters
        : DEFAULT_RADIUS,
    gateToken: map.gateToken?.trim() || null,
    geofenceEnabled:
      labLatitude != null &&
      labLongitude != null &&
      Number.isFinite(labLatitude) &&
      Number.isFinite(labLongitude),
  };
}

export async function upsertLabGateSettings(input: {
  labLatitude?: number;
  labLongitude?: number;
  geofenceRadiusMeters?: number;
  gateToken?: string | null;
}): Promise<void> {
  const entries: { key: string; value: string }[] = [];
  if (input.labLatitude != null) entries.push({ key: "labLatitude", value: String(input.labLatitude) });
  if (input.labLongitude != null) entries.push({ key: "labLongitude", value: String(input.labLongitude) });
  if (input.geofenceRadiusMeters != null) {
    entries.push({ key: "geofenceRadiusMeters", value: String(input.geofenceRadiusMeters) });
  }
  if (input.gateToken !== undefined) {
    entries.push({ key: "gateToken", value: input.gateToken ?? "" });
  }

  for (const entry of entries) {
    await prisma.labSettings.upsert({
      where: { key: entry.key },
      create: { key: entry.key, value: entry.value },
      update: { value: entry.value },
    });
  }
}
