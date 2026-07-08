import type { LabSettings } from "@/lib/types";

export const defaultLabSettings: LabSettings = {
  allowedWifiSsids: ["OPAL-LAB", "OPAL_WIFI"],
  wifiAttendanceEnabled: true,
  requireGeofence: true,
  attendanceCode: "opal1234",
};
