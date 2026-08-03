import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors/app-error";
import { appDataService } from "@/lib/services/app-data.service";
import { getLabGateSettings } from "@/lib/attendance/gate/lab-location";
import { isWithinGeofence } from "@/lib/attendance/gate/geofence";
import type { DeviceCaptureResult } from "@/lib/attendance/verification/types";

export type GateDeviceInfo = DeviceCaptureResult;

export type GateGps = {
  latitude: number;
  longitude: number;
  accuracy?: number;
};

function clientIp(requestHeaders: Headers): string | null {
  const fwd = requestHeaders.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || null;
  return requestHeaders.get("x-real-ip");
}

export async function lookupTrustedDevice(deviceKey: string) {
  if (!deviceKey || deviceKey.length < 16) {
    return { status: "unknown" as const };
  }

  const device = await prisma.trustedDevice.findUnique({
    where: { deviceKey },
    include: { user: { select: { id: true, name: true, isActive: true } } },
  });

  if (!device) return { status: "unknown" as const };
  if (!device.user.isActive) return { status: "inactive_user" as const };
  if (device.status === "BLOCKED") return { status: "blocked" as const, userName: device.user.name };
  if (device.status === "REVOKED") return { status: "revoked" as const, userName: device.user.name };

  const open = await appDataService.getOpenAttendanceRecord(device.userId);
  return {
    status: "trusted" as const,
    deviceId: device.id,
    userId: device.userId,
    userName: device.user.name,
    hasOpenRecord: !!open,
    os: device.os,
    browser: device.browser,
    registeredAt: device.registeredAt,
    lastUsedAt: device.lastUsedAt,
  };
}

export async function registerTrustedDevice(input: {
  userId: string;
  deviceKey: string;
  gps: GateGps;
  device: GateDeviceInfo;
  photoPath?: string | null;
  headers: Headers;
}) {
  const existing = await prisma.trustedDevice.findUnique({ where: { deviceKey: input.deviceKey } });
  if (existing && existing.userId !== input.userId) {
    throw new AppError(
      "CONFLICT",
      "מכשיר זה כבר רשום למשתמש אחר. פנו למנהל המערכת.",
      409,
    );
  }
  if (existing && existing.status === "BLOCKED") {
    throw new AppError("FORBIDDEN", "המכשיר חסום ע״י מנהל המערכת", 403);
  }

  const lab = await getLabGateSettings();
  if (lab.geofenceEnabled) {
    const geo = isWithinGeofence({
      userLat: input.gps.latitude,
      userLng: input.gps.longitude,
      labLat: lab.labLatitude!,
      labLng: lab.labLongitude!,
      radiusMeters: lab.geofenceRadiusMeters,
    });
    if (!geo.ok) {
      throw new AppError(
        "VALIDATION_ERROR",
        `יש לבצע רישום בתוך שטח המעבדה (מרחק נוכחי ≈ ${geo.distanceMeters}מ׳, מותר עד ${lab.geofenceRadiusMeters}מ׳)`,
        400,
      );
    }
  }

  const ip = clientIp(input.headers);
  const label = [input.device.deviceType, input.device.os, input.device.browser]
    .filter(Boolean)
    .join(" · ");

  const device = await prisma.trustedDevice.upsert({
    where: { deviceKey: input.deviceKey },
    create: {
      userId: input.userId,
      deviceKey: input.deviceKey,
      label,
      browser: input.device.browser,
      os: input.device.os,
      deviceType: input.device.deviceType,
      userAgent: input.device.userAgent,
      screenSize: input.device.screenSize,
      timezone: input.device.timezone,
      status: "ACTIVE",
      registeredAt: new Date(),
      lastUsedAt: new Date(),
      lastIp: ip,
      registrationPhotoPath: input.photoPath ?? null,
      registrationLatitude: input.gps.latitude,
      registrationLongitude: input.gps.longitude,
    },
    update: {
      status: "ACTIVE",
      label,
      browser: input.device.browser,
      os: input.device.os,
      deviceType: input.device.deviceType,
      userAgent: input.device.userAgent,
      screenSize: input.device.screenSize,
      timezone: input.device.timezone,
      lastUsedAt: new Date(),
      lastIp: ip,
      registrationPhotoPath: input.photoPath ?? undefined,
      registrationLatitude: input.gps.latitude,
      registrationLongitude: input.gps.longitude,
      registeredAt: new Date(),
    },
  });

  return device;
}

export async function punchViaTrustedDevice(input: {
  deviceKey: string;
  gps: GateGps;
  device: GateDeviceInfo;
  headers: Headers;
}): Promise<{
  action: "check-in" | "check-out";
  userName: string;
  userId: string;
  durationHours: number | null;
  duplicate: boolean;
  recordId: string;
}> {
  const device = await prisma.trustedDevice.findUnique({
    where: { deviceKey: input.deviceKey },
    include: { user: true },
  });

  if (!device) {
    throw new AppError("NOT_FOUND", "המכשיר אינו רשום — נדרשת הרשמה חד-פעמית", 404, {
      code: "DEVICE_UNKNOWN",
    });
  }
  if (!device.user.isActive) {
    throw new AppError("FORBIDDEN", "המשתמש אינו פעיל", 403);
  }
  if (device.status === "BLOCKED") {
    throw new AppError("FORBIDDEN", "המכשיר חסום ע״י מנהל המערכת", 403, {
      code: "DEVICE_BLOCKED",
    });
  }
  if (device.status === "REVOKED") {
    throw new AppError("FORBIDDEN", "אישור המכשיר בוטל — יש להירשם מחדש", 403, {
      code: "DEVICE_REVOKED",
    });
  }

  const lab = await getLabGateSettings();
  if (lab.geofenceEnabled) {
    const geo = isWithinGeofence({
      userLat: input.gps.latitude,
      userLng: input.gps.longitude,
      labLat: lab.labLatitude!,
      labLng: lab.labLongitude!,
      radiusMeters: lab.geofenceRadiusMeters,
    });
    if (!geo.ok) {
      throw new AppError(
        "VALIDATION_ERROR",
        `אינך בטווח המעבדה (מרחק ≈ ${geo.distanceMeters}מ׳, מותר עד ${lab.geofenceRadiusMeters}מ׳)`,
        400,
        { code: "OUT_OF_GEOFENCE", distanceMeters: geo.distanceMeters },
      );
    }
  }

  const ip = clientIp(input.headers);
  const meta = {
    latitude: input.gps.latitude,
    longitude: input.gps.longitude,
    accuracy: input.gps.accuracy,
    device: input.device,
    trustedDeviceId: device.id,
    ipAddress: ip ?? undefined,
  };

  const result = await appDataService.toggleAttendanceForUser(
    device.userId,
    "TRUSTED_DEVICE",
    meta,
  );

  await prisma.trustedDevice.update({
    where: { id: device.id },
    data: { lastUsedAt: new Date(), lastIp: ip },
  });

  return {
    action: result.action,
    userName: device.user.name,
    userId: device.userId,
    durationHours: result.durationHours,
    duplicate: result.duplicate,
    recordId: result.recordId,
  };
}

export async function listTrustedDevices() {
  const devices = await prisma.trustedDevice.findMany({
    include: {
      user: { select: { id: true, name: true, username: true, role: true, isActive: true } },
      attendanceRecords: {
        orderBy: { checkIn: "desc" },
        take: 1,
        select: { checkIn: true, checkOut: true, ipAddress: true },
      },
    },
    orderBy: [{ lastUsedAt: "desc" }, { registeredAt: "desc" }],
  });

  return devices.map((d) => ({
    id: d.id,
    userId: d.userId,
    userName: d.user.name,
    username: d.user.username,
    deviceKeyPreview: `${d.deviceKey.slice(0, 8)}…`,
    label: d.label,
    browser: d.browser,
    os: d.os,
    deviceType: d.deviceType,
    status: d.status,
    registeredAt: d.registeredAt,
    lastUsedAt: d.lastUsedAt,
    lastIp: d.lastIp,
    lastPunchAt: d.attendanceRecords[0]?.checkIn ?? null,
  }));
}

export async function setTrustedDeviceStatus(
  id: string,
  status: "ACTIVE" | "BLOCKED" | "REVOKED",
) {
  return prisma.trustedDevice.update({
    where: { id },
    data: { status },
  });
}

export async function deleteTrustedDevice(id: string) {
  await prisma.trustedDevice.delete({ where: { id } });
}

export async function getDevicePunchHistory(deviceId: string, take = 50) {
  return prisma.attendanceRecord.findMany({
    where: { trustedDeviceId: deviceId },
    orderBy: { checkIn: "desc" },
    take,
    select: {
      id: true,
      checkIn: true,
      checkOut: true,
      method: true,
      ipAddress: true,
      checkInLatitude: true,
      checkInLongitude: true,
      checkInAddress: true,
      checkInDeviceOs: true,
      checkInDeviceBrowser: true,
      checkInDeviceType: true,
    },
  });
}
