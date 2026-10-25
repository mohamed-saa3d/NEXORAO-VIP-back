import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_APP! }),
});

let nexoraId: string;
let helpmyId: string;
let testOrderId: string;

describe('RLS tenant isolation', () => {
  beforeAll(async () => {
    const nexora = await prisma.store.findUnique({ where: { code: 'NEXORA' } });
    const helpmy = await prisma.store.findUnique({ where: { code: 'HELPMEY' } });
    if (!nexora || !helpmy) throw new Error('Seed data missing — run pnpm db:seed first');
    nexoraId = nexora.id;
    helpmyId = helpmy.id;

    // Create the test order INSIDE a tenant context — RLS WITH CHECK rejects it otherwise.
    testOrderId = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_store_id', ${nexoraId}, true)`;
      const order = await tx.order.create({
        data: {
          storeId: nexoraId,
          orderNumber: 'NEX-TEST-' + Date.now(),
          idempotencyKey: 'test-' + Date.now(),
          idempotencyPayloadHash: 'x'.repeat(64),
          status: 'PENDING_PAYMENT',
          paymentStatus: 'pending',
          currency: 'EUR',
          subtotal: 100,
          taxTotal: 19,
          grandTotal: 119,
          customerEmail: 'rls-test@nexora.de',
          shippingAddressSnapshot: { city: 'Berlin', country: 'DE' },
        },
      });
      return order.id;
    });
  });

  afterAll(async () => {
    // Deletion is also tenant-scoped: run it inside the NEXORA context.
    await prisma
      .$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_store_id', ${nexoraId}, true)`;
        await tx.order.delete({ where: { id: testOrderId }, });
      })
      .catch(() => { });
    await prisma.$disconnect();
  });

  it('HELPMEY cannot see NEXORA orders', async () => {
    const asHelpmy = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_store_id', ${helpmyId}, true)`;
      return tx.order.findMany();
    });
    expect(asHelpmy.find((o) => o.id === testOrderId)).toBeUndefined();
  });

  it('NEXORA can see its own order', async () => {
    const asNexora = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_store_id', ${nexoraId}, true)`;
      return tx.order.findMany();
    });
    expect(asNexora.find((o) => o.id === testOrderId)).toBeDefined();
  });

  it('Store model itself has no RLS (used at app level)', async () => {
    const stores = await prisma.store.findMany();
    expect(stores.length).toBeGreaterThanOrEqual(2);
  });
});
