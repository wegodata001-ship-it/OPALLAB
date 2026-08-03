/**
 * Smoke test for attendance PDF V2 — Hebrew/Arabic/RTL + embedded fonts.
 * Run: npx tsx scripts/test-attendance-pdf-v2.ts
 */
import fs from "fs";
import path from "path";
import { buildAttendancePdfV2 } from "../src/lib/attendance/pdf-v2/build-pdf";
import type { AttendanceManagementRecord } from "../src/lib/attendance/management/types";

function mockRecord(partial: Partial<AttendanceManagementRecord> & Pick<AttendanceManagementRecord, "id" | "checkIn">): AttendanceManagementRecord {
  return {
    userId: "u1",
    method: "GPS",
    durationHours: 9.5,
    isLate: true,
    gpsValid: true,
    anomalies: ["late"],
    complianceStatus: "anomaly",
    outOfGeofence: false,
    isEarlyLeave: false,
    isOvertime: true,
    channelLabel: "GPS",
    createdAt: partial.checkIn,
    employee: {
      id: "u1",
      name: partial.employee?.name ?? "יוסי כהן",
      phone: null,
      role: "TECHNICIAN",
      roles: ["TECHNICIAN"],
      color: null,
    },
    checkOut: new Date(partial.checkIn.getTime() + 9.5 * 3_600_000),
    checkInLatitude: 32.6996,
    checkInLongitude: 35.3035,
    checkInAddressCity: "נצרת",
    checkOutLatitude: 32.794,
    checkOutLongitude: 34.9896,
    checkOutAddressCity: "חיפה",
    checkInDeviceOs: "Android 14",
    checkInDeviceBrowser: "Chrome 120",
    checkInDeviceType: "mobile",
    ipAddress: "192.168.1.42",
    ...partial,
  };
}

async function main() {
  const count = Number(process.argv[2] ?? "30");
  const records: AttendanceManagementRecord[] = [
    mockRecord({ id: "1", checkIn: new Date("2026-07-01T06:15:00Z") }),
    mockRecord({
      id: "2",
      checkIn: new Date("2026-07-02T06:00:00Z"),
      employee: { id: "u2", name: "محمد أحمد", phone: null, role: "TECHNICIAN", roles: ["TECHNICIAN"], color: null },
      method: "NFC",
      nfcTagId: "NFC-ABC-123",
      channelLabel: "NFC",
      isLate: false,
      anomalies: [],
      complianceStatus: "ok",
      checkInAddressCity: "ירושלים",
      checkInLatitude: 31.7683,
      checkInLongitude: 35.2137,
    }),
    mockRecord({
      id: "3",
      checkIn: new Date("2026-07-03T07:30:00Z"),
      employee: { id: "u3", name: "John Smith", phone: null, role: "MANAGER", roles: ["MANAGER"], color: null },
      method: "TRUSTED_DEVICE",
      channelLabel: "QR / מכשיר מאושר",
      durationHours: 8,
      isOvertime: false,
    }),
  ];

  // Generate many rows to test pagination
  for (let i = 4; i <= count; i++) {
    const d = new Date("2026-07-01T06:00:00Z");
    d.setDate(d.getDate() + i);
    records.push(mockRecord({ id: String(i), checkIn: d, isLate: i % 3 === 0 }));
  }

  console.log("Building PDF with", records.length, "records...");
  const start = Date.now();
  const result = await buildAttendancePdfV2({
    records,
    meta: {
      generatedAt: new Date(),
      generatedByName: "מנהל המערכת",
      employeeName: null,
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      mode: "general",
    },
  });
  const elapsed = Date.now() - start;

  const outDir = path.join(process.cwd(), "tmp");
  fs.mkdirSync(outDir, { recursive: true });
  const pdfPath = path.join(outDir, "attendance-v2-test.pdf");
  const htmlPath = path.join(outDir, "attendance-v2-test.html");
  fs.writeFileSync(pdfPath, result.buffer);
  fs.writeFileSync(htmlPath, result.html, "utf-8");

  console.log(`Done in ${elapsed}ms`);
  console.log("PDF:", pdfPath, `(${(result.buffer.byteLength / 1024).toFixed(1)} KB)`);
  console.log("HTML:", htmlPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
