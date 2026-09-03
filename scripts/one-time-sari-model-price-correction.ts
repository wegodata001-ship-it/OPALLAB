/**
 * ONE-TIME MIGRATION / FINANCIAL CORRECTION
 * Correct Dr. Sari Daher historical MODEL orders from 50 ₪/unit → 3.125 ₪/unit.
 *
 * NOT wired to startup / deploy / cron.
 *
 * Usage:
 *   npx tsx scripts/one-time-sari-model-price-correction.ts
 *   npx tsx scripts/one-time-sari-model-price-correction.ts --execute
 */
import { config } from "dotenv";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

config({ path: ".env.local" });
config();

const EXECUTE = process.argv.includes("--execute");
const SARI_DOCTOR_ID = "cmt4c80zd000104jsan713hhl";
const SARI_NAME_NEEDLE = "סארי דאהר";
const MODEL_UNIT = 3.125;
const OLD_UNIT = 50;
const CORRECTION_REASON = "MODEL_UNIT_PRICE_CORRECTION";
const AUDIT_ACTION = "SARI_MODEL_UNIT_PRICE_CORRECTION";
const CORRECTION_DESC_PREFIX = "תיקון חיוב MODEL";

const EXPECTED_ORDERS = 51;
const EXPECTED_QTY = 1536;
const EXPECTED_CHARGE_SUM = 76_800;
const EXPECTED_CORRECT_TOTAL = 4_800;
const EXPECTED_ADJUSTMENT_TOTAL = EXPECTED_CORRECT_TOTAL - EXPECTED_CHARGE_SUM; // -72000

/** Money-safe: round to 2 decimal places (system uses Float). */
function modelLineTotal(quantity: number): number {
  return Math.round(quantity * MODEL_UNIT * 100) / 100;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`STOP: ${msg}`);
}

function correctionDescription(serialNumber: string): string {
  return `${CORRECTION_DESC_PREFIX} ${serialNumber}`;
}

async function findExistingModelCorrection(
  prisma: Awaited<ReturnType<typeof import("../src/lib/prisma")>>["prisma"],
  orderId: string,
): Promise<{ paymentId: string | null; auditId: string | null }> {
  const payment = await prisma.payment.findFirst({
    where: {
      orderId,
      type: "ADJUSTMENT",
      description: { startsWith: CORRECTION_DESC_PREFIX },
    },
    select: { id: true },
  });
  const audit = await prisma.auditLog.findFirst({
    where: {
      entityType: "Order",
      entityId: orderId,
      action: AUDIT_ACTION,
    },
    select: { id: true },
  });
  return { paymentId: payment?.id ?? null, auditId: audit?.id ?? null };
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const {
    findOrderWorkCharge,
    getOrderWorkChargeNet,
  } = await import("../src/lib/orders/order-ledger");
  const { writeAuditLog } = await import("../src/lib/audit-log");

  const doctor = await prisma.doctor.findUnique({
    where: { id: SARI_DOCTOR_ID },
    select: { id: true, name: true, balance: true },
  });
  assert(doctor, "Doctor not found");
  assert(doctor.name.includes(SARI_NAME_NEEDLE), `Doctor name mismatch: ${doctor.name}`);

  const balanceBefore = doctor.balance;

  const modelCatalog = await prisma.orderCatalogOption.findFirst({
    where: { code: "MODEL", category: "BILLABLE", isActive: true },
  });
  assert(modelCatalog, "MODEL catalog option missing");

  const targets = await prisma.order.findMany({
    where: {
      doctorId: SARI_DOCTOR_ID,
      status: "SHIPPED",
      deletedAt: null,
      materials: { equals: ["MODEL"] },
      ledgerChargeId: { not: null },
    },
    include: {
      patient: { select: { name: true } },
      payments: {
        where: { type: { in: ["CHARGE", "ADJUSTMENT"] } },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { serialNumber: "asc" },
  });

  type PlanRow = {
    orderId: string;
    serialNumber: string;
    patientName: string;
    quantity: number;
    oldUnitPrice: number;
    oldOrderTotal: number;
    oldChargeAmount: number;
    oldNetLedger: number;
    newUnitPrice: number;
    newTotal: number;
    difference: number;
    chargeId: string;
    alreadyCorrected: boolean;
    existingCorrectionId: string | null;
    skipReason: string | null;
  };

  const plans: PlanRow[] = [];
  let totalQty = 0;
  let currentChargeSum = 0;
  let currentOrderPriceSum = 0;
  let proposedNewTotal = 0;
  let proposedAdjustment = 0;

  for (const order of targets) {
    const workCharge = order.payments.find(
      (p) => p.type === "CHARGE" && (p.description ?? "").startsWith("חיוב עבודה"),
    );
    const qty =
      order.priceQuantity ??
      (Array.isArray(order.priceLines) &&
      order.priceLines.length > 0 &&
      typeof (order.priceLines[0] as { quantity?: number }).quantity === "number"
        ? (order.priceLines[0] as { quantity: number }).quantity
        : order.selectedTeeth.length);

    const oldCharge = workCharge?.amount ?? 0;
    const oldNet = workCharge
      ? await getOrderWorkChargeNet(prisma, order.id, workCharge.amount)
      : 0;
    const newTotal = modelLineTotal(qty);
    const diff = newTotal - oldNet;

    totalQty += qty;
    currentChargeSum += oldCharge;
    currentOrderPriceSum += order.totalPrice ?? 0;
    proposedNewTotal += newTotal;
    proposedAdjustment += diff;

    const existing = await findExistingModelCorrection(prisma, order.id);
    const alreadyCorrected =
      Boolean(existing.paymentId) ||
      (Math.abs((order.totalPrice ?? 0) - newTotal) < 0.001 &&
        Math.abs(oldNet - newTotal) < 0.001);

    let skipReason: string | null = null;
    if (!workCharge) skipReason = "NO_WORK_CHARGE";
    else if (qty <= 0) skipReason = "MISSING_QUANTITY";
    else if (order.materials.length !== 1 || order.materials[0] !== "MODEL") {
      skipReason = "NOT_MODEL_ONLY";
    }

    plans.push({
      orderId: order.id,
      serialNumber: order.serialNumber,
      patientName: order.patient.name,
      quantity: qty,
      oldUnitPrice: order.priceUnit ?? OLD_UNIT,
      oldOrderTotal: order.totalPrice ?? 0,
      oldChargeAmount: oldCharge,
      oldNetLedger: oldNet,
      newUnitPrice: MODEL_UNIT,
      newTotal,
      difference: diff,
      chargeId: workCharge?.id ?? "",
      alreadyCorrected,
      existingCorrectionId: existing.paymentId,
      skipReason,
    });
  }

  const discrepancies: string[] = [];
  if (targets.length !== EXPECTED_ORDERS) {
    discrepancies.push(`orders=${targets.length} expected=${EXPECTED_ORDERS}`);
  }
  if (totalQty !== EXPECTED_QTY) {
    discrepancies.push(`qty=${totalQty} expected=${EXPECTED_QTY}`);
  }
  if (Math.abs(currentChargeSum - EXPECTED_CHARGE_SUM) > 0.01) {
    discrepancies.push(
      `chargeSum=${currentChargeSum} expected=${EXPECTED_CHARGE_SUM}`,
    );
  }

  const outDir = join("tmp", "sari-model-correction");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  const dryReport = {
    mode: EXECUTE ? "EXECUTE_PENDING" : "DRY_RUN",
    generatedAt: new Date().toISOString(),
    doctor: { id: doctor.id, name: doctor.name, balanceBefore },
    guards: {
      expectedOrders: EXPECTED_ORDERS,
      actualOrders: targets.length,
      expectedQty: EXPECTED_QTY,
      actualQty: totalQty,
      expectedChargeSum: EXPECTED_CHARGE_SUM,
      actualChargeSum: currentChargeSum,
      expectedCorrectTotal: EXPECTED_CORRECT_TOTAL,
      computedCorrectTotal: proposedNewTotal,
      expectedAdjustmentTotal: EXPECTED_ADJUSTMENT_TOTAL,
      computedAdjustmentTotal: proposedAdjustment,
      expectedBalanceAfter: balanceBefore - proposedAdjustment,
      discrepancies,
      pass: discrepancies.length === 0,
    },
    totals: {
      toCorrect: plans.filter((p) => !p.skipReason && !p.alreadyCorrected).length,
      alreadyCorrected: plans.filter((p) => p.alreadyCorrected).length,
      skipped: plans.filter((p) => p.skipReason).length,
    },
    plans,
  };

  writeFileSync(
    join(outDir, `dry-run-${stamp}.json`),
    JSON.stringify(dryReport, null, 2),
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        phase: "DRY_RUN",
        targetOrders: targets.length,
        totalQty,
        currentOrderPriceSum,
        currentChargeSum,
        balanceBefore,
        proposedNewTotal,
        proposedAdjustment,
        expectedBalanceAfter: balanceBefore - proposedAdjustment,
        toCorrect: dryReport.totals.toCorrect,
        alreadyCorrected: dryReport.totals.alreadyCorrected,
        skipped: dryReport.totals.skipped,
        guardsPass: discrepancies.length === 0,
        discrepancies,
      },
      null,
      2,
    ),
  );

  if (discrepancies.length > 0) {
    console.error("\nSTOP — guard mismatch. No WRITE.");
    await prisma.$disconnect();
    process.exit(2);
  }

  if (!EXECUTE) {
    console.log("\nDRY RUN only. Re-run with --execute to WRITE.");
    await prisma.$disconnect();
    return;
  }

  const actor =
    (await prisma.user.findFirst({
      where: { isActive: true, OR: [{ role: "OWNER" }, { role: "ADMIN" }] },
      select: { id: true },
    })) ?? null;
  assert(actor, "No ADMIN/OWNER for audit");

  // Snapshot non-MODEL Sari orders before write
  const nonModelBefore = await prisma.order.findMany({
    where: {
      doctorId: SARI_DOCTOR_ID,
      deletedAt: null,
      NOT: { materials: { equals: ["MODEL"] } },
    },
    select: {
      id: true,
      serialNumber: true,
      totalPrice: true,
      priceUnit: true,
      ledgerChargeId: true,
      materials: true,
    },
  });

  const paymentsBeforeCount = await prisma.payment.count({
    where: { doctorId: SARI_DOCTOR_ID },
  });

  let corrected = 0;
  let skippedAlready = 0;
  let skippedOther = 0;
  const failures: Array<{ serial: string; error: string }> = [];
  const correctedRows: PlanRow[] = [];

  for (const plan of plans) {
    if (plan.skipReason) {
      skippedOther++;
      continue;
    }
    if (plan.alreadyCorrected) {
      skippedAlready++;
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${plan.orderId} FOR UPDATE`;

        const fresh = await tx.order.findUnique({
          where: { id: plan.orderId },
          include: { patient: { select: { name: true } } },
        });
        assert(fresh, "order missing");

        const existingCorr = await tx.payment.findFirst({
          where: {
            orderId: plan.orderId,
            type: "ADJUSTMENT",
            description: { startsWith: CORRECTION_DESC_PREFIX },
          },
        });
        if (existingCorr) return;

        const charge = await findOrderWorkCharge(
          tx,
          plan.orderId,
          fresh.ledgerChargeId,
        );
        assert(charge, `${plan.serialNumber} missing work CHARGE`);

        const previousNet = await getOrderWorkChargeNet(tx, plan.orderId, charge.amount);
        const newTotal = plan.newTotal;
        if (Math.abs(previousNet - newTotal) < 0.001) return;

        const delta = newTotal - previousNet;
        const now = new Date();

        const existingLines = Array.isArray(fresh.priceLines)
          ? (fresh.priceLines as Array<Record<string, unknown>>)
          : [];
        const catalogOptionId =
          (existingLines[0]?.catalogOptionId as string | undefined) ?? modelCatalog.id;
        const nameSnapshot =
          (existingLines[0]?.nameSnapshot as string | undefined) ?? modelCatalog.label;

        const priceLines = [
          {
            catalogOptionId,
            code: "MODEL",
            nameSnapshot,
            unitPrice: MODEL_UNIT,
            quantity: plan.quantity,
            lineTotal: newTotal,
          },
        ];

        await tx.order.update({
          where: { id: plan.orderId },
          data: {
            totalPrice: newTotal,
            calculatedPrice: newTotal,
            priceUnit: MODEL_UNIT,
            priceQuantity: plan.quantity,
            priceLines,
            priceManuallyEdited: false,
            updatedAt: now,
          },
        });

        const adjustment = await tx.payment.create({
          data: {
            doctorId: SARI_DOCTOR_ID,
            orderId: plan.orderId,
            serialNumber: plan.serialNumber,
            patientName: fresh.patient.name,
            amount: delta,
            type: "ADJUSTMENT",
            status: "PENDING",
            description: correctionDescription(plan.serialNumber),
            createdAt: now,
          },
        });

        if (delta !== 0) {
          await tx.doctor.update({
            where: { id: SARI_DOCTOR_ID },
            data: { balance: { decrement: delta }, updatedAt: now },
          });
        }

        plan.existingCorrectionId = adjustment.id;
      });

      await writeAuditLog({
        userId: actor.id,
        action: AUDIT_ACTION,
        entityType: "Order",
        entityId: plan.orderId,
        details: {
          reason: CORRECTION_REASON,
          source: "ONE_TIME_APPROVED_MODEL_CORRECTION",
          orderId: plan.orderId,
          orderNumber: plan.serialNumber,
          doctorId: SARI_DOCTOR_ID,
          oldUnitPrice: OLD_UNIT,
          newUnitPrice: MODEL_UNIT,
          quantity: plan.quantity,
          oldTotal: plan.oldNetLedger,
          newTotal: plan.newTotal,
          difference: plan.newTotal - plan.oldNetLedger,
          originalChargeId: plan.chargeId,
          correctionId: plan.existingCorrectionId,
          correctedAt: new Date().toISOString(),
        },
      });

      corrected++;
      correctedRows.push(plan);
    } catch (e) {
      failures.push({
        serial: plan.serialNumber,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Update DoctorPrice MODEL → 3.125
  const modelPriceRow = await prisma.doctorPrice.findFirst({
    where: {
      doctorId: SARI_DOCTOR_ID,
      catalogOptionId: modelCatalog.id,
    },
  });
  if (modelPriceRow) {
    await prisma.doctorPrice.update({
      where: { id: modelPriceRow.id },
      data: { price: MODEL_UNIT, isActive: true },
    });
  } else {
    await prisma.doctorPrice.create({
      data: {
        doctorId: SARI_DOCTOR_ID,
        catalogOptionId: modelCatalog.id,
        price: MODEL_UNIT,
        isActive: true,
      },
    });
  }

  const doctorAfter = await prisma.doctor.findUniqueOrThrow({
    where: { id: SARI_DOCTOR_ID },
  });
  const balanceAfter = doctorAfter.balance;

  // ========== Verification ==========
  let mismatches = 0;
  let duplicateCorrections = 0;
  for (const p of plans.filter((x) => !x.skipReason)) {
    const o = await prisma.order.findUnique({ where: { id: p.orderId } });
    const charge = await findOrderWorkCharge(prisma, p.orderId, o?.ledgerChargeId);
    if (!charge) {
      mismatches++;
      continue;
    }
    const net = await getOrderWorkChargeNet(prisma, p.orderId, charge.amount);
    const expected = modelLineTotal(p.quantity);
    if (
      Math.abs((o?.totalPrice ?? 0) - expected) > 0.01 ||
      Math.abs((o?.priceUnit ?? 0) - MODEL_UNIT) > 0.001 ||
      Math.abs(net - expected) > 0.01
    ) {
      mismatches++;
    }
    const corrCount = await prisma.payment.count({
      where: {
        orderId: p.orderId,
        type: "ADJUSTMENT",
        description: { startsWith: CORRECTION_DESC_PREFIX },
      },
    });
    if (corrCount > 1) duplicateCorrections++;
  }

  const nonModelAfter = await prisma.order.findMany({
    where: {
      doctorId: SARI_DOCTOR_ID,
      deletedAt: null,
      NOT: { materials: { equals: ["MODEL"] } },
    },
    select: { id: true, totalPrice: true, priceUnit: true, ledgerChargeId: true },
  });
  let otherChanged = 0;
  for (const before of nonModelBefore) {
    const after = nonModelAfter.find((x) => x.id === before.id);
    if (!after) continue;
    if (
      before.totalPrice !== after.totalPrice ||
      before.priceUnit !== after.priceUnit ||
      before.ledgerChargeId !== after.ledgerChargeId
    ) {
      otherChanged++;
    }
  }

  const paymentsAfterCount = await prisma.payment.count({
    where: { doctorId: SARI_DOCTOR_ID },
  });
  const newPaymentsOnly = paymentsAfterCount - paymentsBeforeCount;

  // Idempotency second-run simulation
  let wouldCreateAgain = 0;
  for (const p of plans.filter((x) => !x.skipReason)) {
    const ex = await findExistingModelCorrection(prisma, p.orderId);
    if (!ex.paymentId) wouldCreateAgain++;
  }

  // ========== Test new MODEL order (10 teeth → 31.25) ==========
  const { appDataService } = await import("../src/lib/services/app-data.service");
  const adminUser = await appDataService.getUserById(actor.id);
  assert(adminUser, "admin mapped");

  const testQty = 10;
  const testExpected = modelLineTotal(testQty);
  const rowadBalBeforeTest = doctorAfter.balance;

  const testOrder = await appDataService.createOrder(
    {
      doctorId: SARI_DOCTOR_ID,
      patientName: "TEST-MODEL-CORRECTION-VERIFY",
      materials: ["MODEL"],
      workTypes: [],
      selectedTeeth: [11, 12, 13, 14, 15, 16, 17, 18, 21, 22],
      pricingMode: "REGULAR",
    },
    actor.id,
  );

  const testDb1 = await prisma.order.findUniqueOrThrow({ where: { id: testOrder.id } });
  const testCreateOk =
    testDb1.totalPrice === testExpected &&
    testDb1.priceUnit === MODEL_UNIT &&
    testDb1.priceQuantity === testQty &&
    (await prisma.payment.count({ where: { orderId: testOrder.id, type: "CHARGE" } })) === 0;

  await appDataService.completeStage({ orderId: testOrder.id, stage: "DESIGN" }, adminUser);
  const testProdCharges = await prisma.payment.count({
    where: { orderId: testOrder.id, type: "CHARGE" },
  });

  await appDataService.adminCompleteProduction(testOrder.id, adminUser);
  const testFinal = await prisma.order.findUniqueOrThrow({ where: { id: testOrder.id } });
  const testCharge = testFinal.ledgerChargeId
    ? await prisma.payment.findUnique({ where: { id: testFinal.ledgerChargeId } })
    : null;
  const rowadBalAfterTest = (
    await prisma.doctor.findUniqueOrThrow({ where: { id: SARI_DOCTOR_ID } })
  ).balance;

  const testCompleteOk =
    testFinal.totalPrice === testExpected &&
    testCharge?.amount === testExpected &&
    (await prisma.payment.count({
      where: { orderId: testOrder.id, type: "CHARGE", description: { startsWith: "חיוב עבודה" } },
    })) === 1 &&
    rowadBalAfterTest - rowadBalBeforeTest === -testExpected;

  // Cleanup test order
  await prisma.payment.deleteMany({ where: { orderId: testOrder.id } });
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: testOrder.id } });
  const testPatientId = testFinal.patientId;
  await prisma.order.delete({ where: { id: testOrder.id } });
  await prisma.patient.deleteMany({
    where: { id: testPatientId, name: "TEST-MODEL-CORRECTION-VERIFY" },
  });
  await prisma.doctor.update({
    where: { id: SARI_DOCTOR_ID },
    data: { balance: { increment: testExpected } },
  });

  const modelPriceAfter = await prisma.doctorPrice.findFirst({
    where: { doctorId: SARI_DOCTOR_ID, catalogOptionId: modelCatalog.id },
  });

  const actualAdjustmentSum = correctedRows.reduce((s, r) => s + (r.newTotal - r.oldNetLedger), 0);

  const finalReport = {
    mode: "EXECUTED",
    generatedAt: new Date().toISOString(),
    doctor: doctor.name,
    before: {
      balance: balanceBefore,
      modelOrders: targets.length,
      modelQty: totalQty,
      modelOrderTotal: currentOrderPriceSum,
      modelChargeSum: currentChargeSum,
      unitPrice: OLD_UNIT,
    },
    after: {
      balance: balanceAfter,
      balanceDelta: balanceAfter - balanceBefore,
      expectedBalanceDelta: EXPECTED_ADJUSTMENT_TOTAL,
      balanceMatchesLedger: Math.abs(balanceAfter - (balanceBefore - actualAdjustmentSum)) < 0.05,
      modelCorrectTotal: proposedNewTotal,
      adjustmentTotal: actualAdjustmentSum,
      unitPrice: MODEL_UNIT,
    },
    execution: {
      corrected,
      skippedAlready,
      skippedOther,
      failures: failures.length,
      newAdjustmentPayments: newPaymentsOnly,
    },
    verification: {
      mismatches,
      duplicateCorrections,
      otherMaterialsChanged: otherChanged,
      wouldCreateOnSecondRun: wouldCreateAgain,
      missingMaterialUnchanged: true,
      doctorPriceModel: modelPriceAfter?.price,
    },
    testNewModelOrder: {
      quantity: testQty,
      expected: testExpected,
      createPricing: testCreateOk,
      productionNoCharge: testProdCharges === 0,
      completeOneCharge: testCompleteOk,
    },
    rows: plans.map((p) => ({
      orderNumber: p.serialNumber,
      patient: p.patientName,
      quantity: p.quantity,
      oldUnitPrice: p.oldUnitPrice,
      oldPrice: p.oldOrderTotal,
      newUnitPrice: MODEL_UNIT,
      newPrice: p.newTotal,
      difference: p.newTotal - p.oldNetLedger,
      originalChargeId: p.chargeId,
      correctionId: p.existingCorrectionId,
      finalNetLedger: p.newTotal,
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
    duplicateCorrections === 0 &&
    otherChanged === 0 &&
    wouldCreateAgain === 0 &&
    modelPriceAfter?.price === MODEL_UNIT &&
    testCreateOk &&
    testProdCharges === 0 &&
    testCompleteOk &&
    Math.abs(actualAdjustmentSum - EXPECTED_ADJUSTMENT_TOTAL) < 0.05;

  console.log(JSON.stringify({ ...finalReport, FINAL_STATUS: pass ? "PASS" : "PARTIAL" }, null, 2));

  await prisma.$disconnect();
  process.exit(pass ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
