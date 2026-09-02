import {
  formatHHmmJerusalem,
  parseHHmm,
  resolveEditedAttendanceTimes,
  zonedJerusalemDate,
} from "./edit-time";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function approxEqual(a: number, b: number, eps = 1e-6) {
  return Math.abs(a - b) < eps;
}

function run() {
  assert(parseHHmm("10:21")?.hour === 10 && parseHHmm("10:21")?.minute === 21, "parse ok");
  assert(parseHHmm("25:00") === null, "invalid hour");
  assert(parseHHmm("10:60") === null, "invalid minute");

  const checkIn = zonedJerusalemDate(2026, 9, 2, 10, 21);
  assert(formatHHmmJerusalem(checkIn) === "10:21", `format got ${formatHHmmJerusalem(checkIn)}`);

  // Edit check-in only 10:21 → 10:00, checkout 16:00 → 6h
  const withOut = resolveEditedAttendanceTimes({
    field: "checkIn",
    timeHHmm: "10:00",
    currentCheckIn: checkIn,
    currentCheckOut: zonedJerusalemDate(2026, 9, 2, 16, 0),
  });
  assert(formatHHmmJerusalem(withOut.checkIn) === "10:00", "checkIn edited");
  assert(withOut.checkOut != null, "checkout kept");
  const hours =
    (withOut.checkOut!.getTime() - withOut.checkIn.getTime()) / 3_600_000;
  assert(approxEqual(hours, 6), `expected 6h got ${hours}`);

  // Edit checkout only
  const outOnly = resolveEditedAttendanceTimes({
    field: "checkOut",
    timeHHmm: "17:00",
    currentCheckIn: zonedJerusalemDate(2026, 9, 2, 10, 0),
    currentCheckOut: zonedJerusalemDate(2026, 9, 2, 16, 0),
  });
  assert(formatHHmmJerusalem(outOnly.checkOut!) === "17:00", "checkout edited");

  // Add missing checkout
  const added = resolveEditedAttendanceTimes({
    field: "checkOut",
    timeHHmm: "16:00",
    currentCheckIn: zonedJerusalemDate(2026, 9, 2, 10, 0),
    currentCheckOut: null,
  });
  assert(added.checkOut != null, "checkout added");
  assert(formatHHmmJerusalem(added.checkOut!) === "16:00", "added time");

  // Same-day checkout before checkin → overnight next day
  const overnight = resolveEditedAttendanceTimes({
    field: "checkOut",
    timeHHmm: "02:00",
    currentCheckIn: zonedJerusalemDate(2026, 9, 2, 22, 0),
    currentCheckOut: null,
  });
  assert(overnight.checkOut!.getTime() > overnight.checkIn.getTime(), "overnight after");
  const oh =
    (overnight.checkOut!.getTime() - overnight.checkIn.getTime()) / 3_600_000;
  assert(approxEqual(oh, 4), `overnight 4h got ${oh}`);

  // Moving check-in after checkout must fail
  let failed = false;
  try {
    resolveEditedAttendanceTimes({
      field: "checkIn",
      timeHHmm: "18:00",
      currentCheckIn: zonedJerusalemDate(2026, 9, 2, 10, 0),
      currentCheckOut: zonedJerusalemDate(2026, 9, 2, 16, 0),
    });
  } catch {
    failed = true;
  }
  assert(failed, "checkIn after checkout should fail");

  console.log("attendance-edit-time.selftest: ALL PASSED");
}

run();
