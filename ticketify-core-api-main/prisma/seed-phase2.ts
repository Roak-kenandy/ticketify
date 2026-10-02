import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const templates = [
  {
    trigger_key: 'VISIT_SCHEDULED',
    body_template:
      'Medianet: Your service request [SR_ID] is scheduled for approximately [TIME] on [DATE]. Technician: [NAME]. Contact: [CONTACT].',
  },
  {
    trigger_key: 'FEEDBACK_REQUEST',
    body_template:
      'Medianet: Please share feedback for ticket [SR_ID]: [LINK]',
  },
  {
    trigger_key: 'LM_HANDOFF',
    body_template:
      'Dear [NAME], your ticket [SR_ID] requires cabling work and has been handed over to our Last Mile team. The work is expected to be completed within [DAYS] working days. Our team will contact you before the visit. Thank you for your patience. Medianet Support Team',
  },
  {
    trigger_key: 'PAYMENT_REQUEST',
    body_template:
      'Medianet: Invoice [INV_NO] for SR [SR_ID]. Charges: [ITEMS]. Total MVR [TOTAL]. Pay securely: [LINK]',
  },
];

/** Spec §11 predefined charges (MVR) */
const charges = [
  {
    code: 'PAYMENT_TEST_1MVR',
    label: 'Payment test (1 MVR)',
    amount_mvr: '1.00',
  },
  { code: 'RELOCATION', label: 'Relocation charge', amount_mvr: '250.00' },
  { code: 'ONT', label: 'ONT charge', amount_mvr: '500.00' },
  { code: 'LM_CABLE_DAMAGE', label: 'LM Cable Damage Charge', amount_mvr: '750.00' },
  { code: 'INTERNAL_CABLE', label: 'Internal Cable Charge', amount_mvr: '350.00' },
  { code: 'DB_RELOCATION', label: 'DB relocation and Termination', amount_mvr: '250.00' },
  { code: 'DECODER_MXMINI', label: 'Decoder MXMINI', amount_mvr: '999.00' },
  { code: 'CONNECTOR', label: 'Connector Replacement', amount_mvr: '50.00' },
  { code: 'PATCH_CODE', label: 'Patch Code Replacement', amount_mvr: '100.00' },
];

async function main() {
  for (const t of templates) {
    await prisma.notificationTemplate.upsert({
      where: { trigger_key: t.trigger_key },
      create: t,
      update: { body_template: t.body_template, enabled: true },
    });
  }

  for (const c of charges) {
    await prisma.chargeCatalogItem.upsert({
      where: { code: c.code },
      create: {
        code: c.code,
        label: c.label,
        amount_mvr: c.amount_mvr,
        active: true,
      },
      update: {
        label: c.label,
        amount_mvr: c.amount_mvr,
        active: true,
      },
    });
  }

  await prisma.assignmentPolicy.upsert({
    where: { id: 'default-access-manual' },
    create: {
      id: 'default-access-manual',
      department: 'ACCESS',
      region: null,
      mode: 'MANUAL',
      is_default: true,
    },
    update: { mode: 'MANUAL', is_default: true },
  });

  // For AUTO mode, queue_id stores the CRM team id used for the unassigned pool.
  await prisma.assignmentPolicy.upsert({
    where: { id: 'default-access-auto-male' },
    create: {
      id: 'default-access-auto-male',
      department: 'ACCESS',
      region: 'Male',
      queue_id: 'f9006884-5b7e-4513-89ef-86e14acf0b25',
      mode: 'AUTO',
      is_default: false,
    },
    update: {
      mode: 'AUTO',
      queue_id: 'f9006884-5b7e-4513-89ef-86e14acf0b25',
    },
  });

  await prisma.systemConfig.upsert({
    where: { key: 'dispatch.auto_assign' },
    create: {
      key: 'dispatch.auto_assign',
      value: {
        enabled: false,
        updated_by_user_id: null,
        updated_at: null,
        last_run_at: null,
        last_run_summary: null,
      },
    },
    update: {},
  });

  console.log('Phase 2 seed complete (templates, charges, assignment policy).');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
