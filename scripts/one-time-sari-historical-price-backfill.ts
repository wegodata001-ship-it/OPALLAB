/**
 * ONE-TIME MIGRATION / RECONCILIATION
 * Historical pricing + CHARGE backfill for Dr. Sari Daher's 158 SHIPPED orders.
 *
 * NOT wired to startup / deploy / cron.
 *
 * Usage:
 *   npx tsx scripts/one-time-sari-historical-price-backfill.ts
 *   npx tsx scripts/one-time-sari-historical-price-backfill.ts --execute
 *
 * Default = DRY RUN only. --execute performs WRITE after guards pass.
 */
import { config } from "dotenv";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

config({ path: ".env.local" });
config();

const EXPECTED_TARGET = 158;
const SARI_DOCTOR_ID = "cmt4c80zd000104jsan713hhl";
const SARI_NAME_NEEDLE = "סארי דאהר";
const EXECUTE = process.argv.includes("--execute");

type RowStatus =
  | "PRICABLE"
  | "SKIP_UNPRICED"
  | "SKIP_EXISTING_CHARGE"
  | "SKIP_ZERO_PRICE"
  | "ERROR";

type PlanRow = {
  orderId: string;
  serialNumber: string;
  doctorId: string | null;
  doctorName: string;
  patientName: string;
  materials: string[];
  workTypes: string[];
  splintTypeIds: string[];
  selectedTeeth: number[];
  teethCount: number;
  pricingMode: string;
  allInXType: string | null;
  otherWorkKind: string | null;
  oldTotalPrice: number | null;
  oldCalculatedPrice: number | null;
  oldPriceUnit: number | null;
  oldPriceLines: unknown;
  oldLedgerChargeId: string | null;
  matchingCodes: string[];
  missingCodes: string[];
  unitPrice: number | null;
  pricePerJaw: number | null;
  quantity: number;
  jawCount: number;
  calculatedPrice: number | null;
  finalBackfillPrice: number | null;
  priceLines: unknown[];
  pricingModeResolved: string;
  canPrice: boolean;
  status: RowStatus;
  reason: string | null;
  existingChargeId: string | null;
  chargeId?: string | null;
};

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`STOP: ${msg}`);
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { mapOrderCatalogOption } = await import("../src/lib/mappers/prisma-to-app");
  const {
    computeOrderPricing,
    parsePricingMode,
    parseOtherWorkKind,
    resolveFinalPrice,
  } = await import("../src/lib/orders/doctor-pricing");
  const {
    ensureOrderWorkCharge,
    findOrderWorkCharge,
    workChargeDescription,
  } = await import("../src/lib/orders/order-ledger");
  const { writeAuditLog } = await import("../src/lib/audit-log");

  const doctor = await prisma.doctor.findUnique({
    where: { id: SARI_DOCTOR_ID },
    select: { id: true, name: true, balance: true },
  });
  assert(doctor, `Doctor ${SARI_DOCTOR_ID} not found`);
  assert(
    doctor.name.includes(SARI_NAME_NEEDLE),
    `Doctor name mismatch: expected contains "${SARI_NAME_NEEDLE}", got "${doctor.name}"`,
  );

  const balanceBefore = doctor.balance;

  const targets = await prisma.order.findMany({
    where: {
      status: "SHIPPED",
      doctorId: SARI_DOCTOR_ID,
      totalPrice: null,
      ledgerChargeId: null,
      deletedAt: null,
    },
    include: {
      patient: { select: { name: true } },
      doctor: { select: { id: true, name: true } },
      payments: {
        where: { type: "CHARGE" },
        select: { id: true, amount: true, description: true, type: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (targets.length !== EXPECTED_TARGET) {
    console.error(
      JSON.stringify(
        {
          STOP: true,
          expected: EXPECTED_TARGET,
          actual: targets.length,
          doctorId: SARI_DOCTOR_ID,
          doctorName: doctor.name,
          hint: "Target set changed since Audit — no WRITE performed.",
        },
        null,
        2,
      ),
    );
    await prisma.$disconnect();
    process.exit(2);
  }

  const doctorIds = new Set(targets.map((o) => o.doctorId));
  if (doctorIds.size !== 1 || !doctorIds.has(SARI_DOCTOR_ID)) {
    console.error(
      JSON.stringify(
        {
          STOP: true,
          reason: "UNEXPECTED_DOCTOR_IDS",
          doctorIds: [...doctorIds],
        },
        null,
        2,
      ),
    );
    await prisma.$disconnect();
    process.exit(2);
  }

  const [billableRows, priceRows, splintRows] = await Promise.all([
    prisma.orderCatalogOption.findMany({
      where: { category: "BILLABLE", isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.doctorPrice.findMany({
      where: { doctorId: SARI_DOCTOR_ID, isActive: true },
    }),
    prisma.splintType.findMany({ select: { id: true, code: true, isActive: true } }),
  ]);

  const billableOptions = billableRows.map(mapOrderCatalogOption);
  const pricesByOptionId = new Map(priceRows.map((p) => [p.catalogOptionId, p.price]));
  const priceByCode = new Map(
    priceRows.map((p) => {
      const opt = billableRows.find((b) => b.id === p.catalogOptionId);
      return [opt?.code ?? p.catalogOptionId, p.price] as const;
    }),
  );

  // Actor for audit: prefer ADMIN/OWNER
  const actor =
    (await prisma.user.findFirst({
      where: { isActive: true, OR: [{ role: "OWNER" }, { role: "ADMIN" }] },
      select: { id: true, username: true },
    })) ?? null;
  assert(actor, "No ADMIN/OWNER user for audit actor");

  const plans: PlanRow[] = [];

  for (const order of targets) {
    const existingByDesc = await prisma.payment.findFirst({
      where: {
        orderId: order.id,
        type: "CHARGE",
        description: { startsWith: "חיוב עבודה" },
      },
      select: { id: true },
    });
    const existingLinked = order.payments[0] ?? null;
    const existingChargeId = existingByDesc?.id ?? existingLinked?.id ?? null;

    if (existingChargeId || order.ledgerChargeId) {
      plans.push({
        orderId: order.id,
        serialNumber: order.serialNumber,
        doctorId: order.doctorId,
        doctorName: order.doctor?.name ?? doctor.name,
        patientName: order.patient.name,
        materials: order.materials,
        workTypes: order.workTypes,
        splintTypeIds: order.splintTypeIds,
        selectedTeeth: order.selectedTeeth,
        teethCount: order.selectedTeeth.length,
        pricingMode: order.pricingMode,
        allInXType: order.allInXType,
        otherWorkKind: order.otherWorkKind,
        oldTotalPrice: order.totalPrice,
        oldCalculatedPrice: order.calculatedPrice,
        oldPriceUnit: order.priceUnit,
        oldPriceLines: order.priceLines,
        oldLedgerChargeId: order.ledgerChargeId,
        matchingCodes: [],
        missingCodes: [],
        unitPrice: null,
        pricePerJaw: null,
        quantity: order.selectedTeeth.length,
        jawCount: 0,
        calculatedPrice: null,
        finalBackfillPrice: null,
        priceLines: [],
        pricingModeResolved: order.pricingMode,
        canPrice: false,
        status: "SKIP_EXISTING_CHARGE",
        reason: "ALREADY_CHARGED",
        existingChargeId,
      });
      continue;
    }

    let pricingMode = parsePricingMode(order.pricingMode);
    const otherWorkKind = parseOtherWorkKind(order.otherWorkKind);
    if (otherWorkKind || order.workTypes.includes("OTHER")) pricingMode = "OTHER";

    // Historical REGULAR orders with no materials/work/splints cannot be priced.
    if (
      pricingMode === "REGULAR" &&
      order.materials.length === 0 &&
      order.workTypes.length === 0 &&
      order.splintTypeIds.length === 0
    ) {
      plans.push({
        orderId: order.id,
        serialNumber: order.serialNumber,
        doctorId: order.doctorId,
        doctorName: order.doctor?.name ?? doctor.name,
        patientName: order.patient.name,
        materials: order.materials,
        workTypes: order.workTypes,
        splintTypeIds: order.splintTypeIds,
        selectedTeeth: order.selectedTeeth,
        teethCount: order.selectedTeeth.length,
        pricingMode: order.pricingMode,
        allInXType: order.allInXType,
        otherWorkKind: order.otherWorkKind,
        oldTotalPrice: order.totalPrice,
        oldCalculatedPrice: order.calculatedPrice,
        oldPriceUnit: order.priceUnit,
        oldPriceLines: order.priceLines,
        oldLedgerChargeId: order.ledgerChargeId,
        matchingCodes: [],
        missingCodes: [],
        unitPrice: null,
        pricePerJaw: null,
        quantity: order.selectedTeeth.length,
        jawCount: 0,
        calculatedPrice: null,
        finalBackfillPrice: null,
        priceLines: [],
        pricingModeResolved: pricingMode,
        canPrice: false,
        status: "SKIP_UNPRICED",
        reason: "MISSING_MATERIAL",
        existingChargeId: null,
      });
      continue;
    }

    const computed = computeOrderPricing({
      pricingMode,
      materials: pricingMode === "REGULAR" ? order.materials : [],
      workTypes: pricingMode === "REGULAR" ? order.workTypes : [],
      splintTypeIds: pricingMode === "REGULAR" ? order.splintTypeIds : [],
      splintTypes: splintRows,
      selectedTeeth: order.selectedTeeth,
      billableOptions,
      pricesByOptionId,
      otherWorkKind: pricingMode === "OTHER" ? otherWorkKind : null,
      repairPrice: null,
      allInXType: pricingMode === "ALL_IN_X" ? order.allInXType : null,
    });

    const finalPrice = resolveFinalPrice({
      calculatedPrice: computed.calculatedPrice,
      priceManuallyEdited: false,
      manualFinalPrice: null,
      mode: computed.mode,
    });

    let status: RowStatus = "PRICABLE";
    let reason: string | null = null;
    let canPrice = true;

    if (computed.mode === "EMPTY" || computed.codes.length === 0 && pricingMode !== "OTHER") {
      canPrice = false;
      status = "SKIP_UNPRICED";
      reason =
        order.materials.length === 0 ? "MISSING_MATERIAL" : "NO_PRICE_BOOK_MATCH";
    } else if (computed.missing.length > 0 && computed.lines.length === 0) {
      canPrice = false;
      status = "SKIP_UNPRICED";
      reason = "NO_PRICE_BOOK_MATCH";
    } else if (computed.missing.length > 0 && computed.lines.length > 0) {
      // Partial match — ambiguous / incomplete for historical certainty
      canPrice = false;
      status = "SKIP_UNPRICED";
      reason = "AMBIGUOUS_WORK_TYPE";
    } else if (finalPrice == null || !Number.isFinite(finalPrice)) {
      canPrice = false;
      status = "SKIP_UNPRICED";
      reason = "MISSING_QUANTITY";
    } else if (!(finalPrice > 0)) {
      canPrice = false;
      status = "SKIP_ZERO_PRICE";
      reason = "ZERO_PRICE";
    }

    // Quantity must be meaningful for REGULAR
    if (canPrice && pricingMode === "REGULAR" && computed.quantity <= 0) {
      canPrice = false;
      status = "SKIP_UNPRICED";
      reason = "MISSING_QUANTITY";
    }
    if (canPrice && pricingMode === "ALL_IN_X" && computed.jawCount <= 0) {
      canPrice = false;
      status = "SKIP_UNPRICED";
      reason = "MISSING_QUANTITY";
    }

    plans.push({
      orderId: order.id,
      serialNumber: order.serialNumber,
      doctorId: order.doctorId,
      doctorName: order.doctor?.name ?? doctor.name,
      patientName: order.patient.name,
      materials: order.materials,
      workTypes: order.workTypes,
      splintTypeIds: order.splintTypeIds,
      selectedTeeth: order.selectedTeeth,
      teethCount: order.selectedTeeth.length,
      pricingMode: order.pricingMode,
      allInXType: order.allInXType,
      otherWorkKind: order.otherWorkKind,
      oldTotalPrice: order.totalPrice,
      oldCalculatedPrice: order.calculatedPrice,
      oldPriceUnit: order.priceUnit,
      oldPriceLines: order.priceLines,
      oldLedgerChargeId: order.ledgerChargeId,
      matchingCodes: computed.codes,
      missingCodes: computed.missing.map((m) => m.code),
      unitPrice: computed.unitPrice,
      pricePerJaw: computed.pricePerJaw,
      quantity: computed.quantity,
      jawCount: computed.jawCount,
      calculatedPrice: computed.calculatedPrice,
      finalBackfillPrice: canPrice ? finalPrice : null,
      priceLines: computed.lines,
      pricingModeResolved: computed.pricingMode,
      canPrice,
      status: canPrice ? "PRICABLE" : status,
      reason: canPrice ? null : reason,
      existingChargeId: null,
    });
  }

  const pricable = plans.filter((p) => p.status === "PRICABLE");
  const unpriced = plans.filter((p) => p.status === "SKIP_UNPRICED" || p.status === "SKIP_ZERO_PRICE");
  const existing = plans.filter((p) => p.status === "SKIP_EXISTING_CHARGE");
  const proposedTotal = pricable.reduce((s, p) => s + (p.finalBackfillPrice ?? 0), 0);

  // Breakdown by work type / unit price
  const breakdownMap = new Map<
    string,
    { type: string; orders: number; quantity: number; unitOrJaw: number; total: number }
  >();
  for (const p of pricable) {
    const type = p.matchingCodes.join("+") || p.materials.join("+") || "UNKNOWN";
    const unit =
      p.pricingModeResolved === "ALL_IN_X"
        ? (p.pricePerJaw ?? 0)
        : (p.unitPrice ?? (p.quantity ? (p.finalBackfillPrice ?? 0) / p.quantity : 0));
    const key = `${type}::${unit}`;
    const row = breakdownMap.get(key) ?? {
      type,
      orders: 0,
      quantity: 0,
      unitOrJaw: unit,
      total: 0,
    };
    row.orders += 1;
    row.quantity += p.pricingModeResolved === "ALL_IN_X" ? p.jawCount : p.quantity;
    row.total += p.finalBackfillPrice ?? 0;
    breakdownMap.set(key, row);
  }

  const outDir = join("tmp", "sari-backfill");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  const dryReport = {
    mode: EXECUTE ? "EXECUTE_PENDING" : "DRY_RUN",
    generatedAt: new Date().toISOString(),
    oneTime: true,
    source: "CURRENT_DOCTOR_PRICE_BOOK",
    reason: "ONE_TIME_APPROVED_RECONCILIATION",
    doctor: { id: doctor.id, name: doctor.name, balanceBefore },
    priceBookCodes: [...priceByCode.entries()].map(([code, price]) => ({ code, price })),
    guards: {
      expectedTarget: EXPECTED_TARGET,
      actualTarget: targets.length,
      unexpectedDoctors: false,
      existingChargesInTarget: existing.length,
    },
    totals: {
      target: plans.length,
      pricable: pricable.length,
      unpriced: unpriced.length,
      skipExistingCharge: existing.length,
      proposedChargesSum: proposedTotal,
    },
    breakdown: [...breakdownMap.values()].sort((a, b) => b.total - a.total),
    byDoctor: [{ doctor: doctor.name, orders: plans.length, proposed: proposedTotal }],
    plans,
  };

  writeFileSync(
    join(outDir, `dry-run-${stamp}.json`),
    JSON.stringify(dryReport, null, 2),
    "utf8",
  );
  writeFileSync(
    join(outDir, `before-snapshot-${stamp}.json`),
    JSON.stringify(
      {
        doctorBalanceBefore: balanceBefore,
        orders: plans.map((p) => ({
          orderId: p.orderId,
          orderNumber: p.serialNumber,
          doctorId: p.doctorId,
          oldTotalPrice: p.oldTotalPrice,
          oldCalculatedPrice: p.oldCalculatedPrice,
          oldPriceUnit: p.oldPriceUnit,
          oldPriceLines: p.oldPriceLines,
          oldLedgerChargeId: p.oldLedgerChargeId,
          proposedFinalPrice: p.finalBackfillPrice,
          status: p.status,
          reason: p.reason,
        })),
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        phase: "DRY_RUN",
        targetOrders: plans.length,
        pricable: pricable.length,
        unpriced: unpriced.length,
        skipExisting: existing.length,
        proposedTotalIls: proposedTotal,
        doctor: doctor.name,
        balanceBefore,
        executeRequested: EXECUTE,
        breakdown: [...breakdownMap.values()],
        unpricedReasons: Object.fromEntries(
          [...unpriced.reduce((m, p) => {
            const r = p.reason ?? "?";
            m.set(r, (m.get(r) ?? 0) + 1);
            return m;
          }, new Map<string, number>())],
        ),
      },
      null,
      2,
    ),
  );

  if (!EXECUTE) {
    console.log("\nDRY RUN only. Re-run with --execute to WRITE.");
    await prisma.$disconnect();
    return;
  }

  // ========== WRITE ==========
  assert(plans.length === EXPECTED_TARGET, "Target changed before WRITE");
  assert(existing.length === 0, "Unexpected existing charges in target — abort WRITE");

  let charged = 0;
  let priced = 0;
  let failures: Array<{ serial: string; error: string }> = [];
  const chargedList: PlanRow[] = [];

  for (const plan of pricable) {
    try {
      await prisma.$transaction(async (tx) => {
        // Re-check inside tx
        const fresh = await tx.order.findUnique({ where: { id: plan.orderId } });
        assert(fresh, "order missing");
        assert(fresh.totalPrice == null, `${plan.serialNumber} already priced`);
        assert(fresh.ledgerChargeId == null, `${plan.serialNumber} already linked`);

        const existing = await findOrderWorkCharge(tx, plan.orderId, null);
        assert(!existing, `${plan.serialNumber} charge exists`);

        await tx.order.update({
          where: { id: plan.orderId },
          data: {
            totalPrice: plan.finalBackfillPrice,
            calculatedPrice: plan.calculatedPrice,
            priceUnit: plan.unitPrice,
            priceQuantity: plan.quantity,
            priceLines: plan.priceLines as object[],
            pricingMode: plan.pricingModeResolved,
            allInXType: plan.allInXType,
            pricePerJaw: plan.pricePerJaw,
            jawCount: plan.jawCount,
            priceManuallyEdited: false,
            updatedAt: new Date(),
          },
        });

        const billed = await ensureOrderWorkCharge(tx, {
          orderId: plan.orderId,
          serialNumber: plan.serialNumber,
          doctorId: plan.doctorId,
          totalPrice: plan.finalBackfillPrice,
          patientName: plan.patientName,
          ledgerChargeId: null,
          actorId: actor.id,
          completedAt: new Date(), // backfill time — do not fake historical createdAt
        });

        assert(billed.created && billed.chargeId, `${plan.serialNumber} charge not created`);
        plan.chargeId = billed.chargeId;
      });

      priced += 1;
      charged += 1;
      chargedList.push(plan);

      await writeAuditLog({
        userId: actor.id,
        action: "HISTORICAL_ORDER_PRICE_BACKFILL",
        entityType: "Order",
        entityId: plan.orderId,
        details: {
          orderId: plan.orderId,
          orderNumber: plan.serialNumber,
          doctorId: plan.doctorId,
          calculatedPrice: plan.calculatedPrice,
          finalPrice: plan.finalBackfillPrice,
          chargeId: plan.chargeId ?? null,
          performedAt: new Date().toISOString(),
          source: "CURRENT_DOCTOR_PRICE_BOOK",
          reason: "ONE_TIME_APPROVED_RECONCILIATION",
          matchingCodes: plan.matchingCodes,
          quantity: plan.quantity,
          jawCount: plan.jawCount,
        },
      });
    } catch (e) {
      failures.push({
        serial: plan.serialNumber,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const doctorAfter = await prisma.doctor.findUniqueOrThrow({
    where: { id: SARI_DOCTOR_ID },
    select: { balance: true },
  });

  // Verification
  const verifyCharged = await prisma.order.findMany({
    where: { id: { in: chargedList.map((p) => p.orderId) } },
    select: {
      id: true,
      serialNumber: true,
      totalPrice: true,
      ledgerChargeId: true,
      doctorId: true,
      payments: {
        where: { type: "CHARGE" },
        select: { id: true, amount: true, doctorId: true, description: true },
      },
    },
  });

  let mismatches = 0;
  let missingLink = 0;
  let missingCharge = 0;
  let doctorMismatch = 0;
  for (const o of verifyCharged) {
    if (o.totalPrice == null || !(o.totalPrice > 0)) mismatches++;
    if (!o.ledgerChargeId) missingLink++;
    const ch = o.payments.find((p) => p.id === o.ledgerChargeId) ?? o.payments[0];
    if (!ch) missingCharge++;
    else {
      if (Math.abs(ch.amount - (o.totalPrice ?? 0)) > 1e-9) mismatches++;
      if (ch.doctorId !== o.doctorId) doctorMismatch++;
    }
  }

  const chargeCounts = await prisma.payment.groupBy({
    by: ["orderId"],
    where: {
      type: "CHARGE",
      orderId: { in: chargedList.map((p) => p.orderId) },
      description: { startsWith: "חיוב עבודה" },
    },
    _count: true,
  });
  const duplicateCharges = chargeCounts.filter((c) => c._count > 1 && c.orderId);

  // Second-run eligibility (idempotency)
  const stillEligible = await prisma.order.count({
    where: {
      status: "SHIPPED",
      doctorId: SARI_DOCTOR_ID,
      totalPrice: null,
      ledgerChargeId: null,
      deletedAt: null,
    },
  });

  const auditCount = await prisma.auditLog.count({
    where: { action: "HISTORICAL_ORDER_PRICE_BACKFILL" },
  });

  const totalChargedSum = chargedList.reduce((s, p) => s + (p.finalBackfillPrice ?? 0), 0);
  const expectedBalance = balanceBefore - totalChargedSum;

  const finalReport = {
    mode: "EXECUTED",
    generatedAt: new Date().toISOString(),
    before: {
      doctor: doctor.name,
      balance: balanceBefore,
      targeted: EXPECTED_TARGET,
      existingCharges: 0,
    },
    after: {
      priced: priced,
      charged: charged,
      unpriced: unpriced.length,
      failures: failures.length,
      totalChargesIls: totalChargedSum,
      balance: doctorAfter.balance,
      expectedBalance,
      balanceMatches: Math.abs(doctorAfter.balance - expectedBalance) < 1e-6,
    },
    equation: {
      priced: priced,
      unpriced: unpriced.length,
      existing: existing.length,
      failures: failures.length,
      sum: priced + unpriced.length + existing.length + failures.length,
      expected: EXPECTED_TARGET,
    },
    verification: {
      mismatches,
      missingLink,
      missingCharge,
      doctorMismatch,
      duplicateCharges: duplicateCharges.length,
      stillEligibleForBackfill: stillEligible,
      auditRecords: auditCount,
    },
    breakdown: [...breakdownMap.values()],
    chargedOrders: chargedList.map((p) => ({
      orderNumber: p.serialNumber,
      patient: p.patientName,
      workType: p.matchingCodes.join("+"),
      quantityOrJaws:
        p.pricingModeResolved === "ALL_IN_X" ? p.jawCount : p.quantity,
      calculatedPrice: p.calculatedPrice,
      finalPrice: p.finalBackfillPrice,
      chargeId: p.chargeId,
      status: "SHIPPED",
    })),
    skipped: unpriced.map((p) => ({
      orderNumber: p.serialNumber,
      patient: p.patientName,
      material: p.materials,
      teeth: p.teethCount,
      reason: p.reason,
    })),
    failures,
  };

  writeFileSync(
    join(outDir, `final-report-${stamp}.json`),
    JSON.stringify(finalReport, null, 2),
    "utf8",
  );

  const pass =
    failures.length === 0 &&
    mismatches === 0 &&
    missingLink === 0 &&
    missingCharge === 0 &&
    doctorMismatch === 0 &&
    duplicateCharges.length === 0 &&
    stillEligible === unpriced.length && // remaining null-price = only unpriced leftovers
    finalReport.after.balanceMatches;

  console.log(JSON.stringify({ ...finalReport, BACKFILL_STATUS: pass ? (unpriced.length ? "PARTIAL" : "PASS") : "FAILED" }, null, 2));

  await prisma.$disconnect();
  if (!pass && failures.length) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
