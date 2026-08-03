/**
 * Best-effort deep links to OS / browser permission settings.
 * Browsers block most direct settings URLs; we guide the user clearly.
 */
export function openPermissionHelp(): void {
  if (typeof window === "undefined") return;

  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);

  // Chrome Android sometimes supports this experimental URL
  if (isAndroid) {
    try {
      window.open("intent://settings#Intent;scheme=android.settings.APPLICATION_DETAILS_SETTINGS;end", "_blank");
      return;
    } catch {
      /* fall through */
    }
  }

  if (isIOS) {
    // iOS Safari cannot open Settings.app from web — show alert via caller
    return;
  }

  // Desktop: open browser site-settings if possible (Chrome)
  try {
    window.open("chrome://settings/content", "_blank");
  } catch {
    /* ignore */
  }
}

export function permissionHelpText(): string {
  if (typeof navigator === "undefined") {
    return "פתחו את הגדרות הדפדפן ואפשרו מיקום ומצלמה לאתר זה.";
  }
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return "ב־iPhone: הגדרות ← פרטיות ואבטחה ← שירותי מיקום / מצלמה ← Safari ← אפשרו גישה. לאחר מכן חזרו לכאן ורעננו.";
  }
  if (/Android/i.test(ua)) {
    return "באנדרואיד: הגדרות ← אפליקציות ← הדפדפן ← הרשאות ← הפעילו מיקום ומצלמה. לאחר מכן חזרו לכאן.";
  }
  return "לחצו על מנעול/הגדרות האתר בשורת הכתובת ואפשרו מיקום ומצלמה.";
}
