import 'dotenv/config';
import argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL must be set in .env before seeding.');
}

// Prisma 7 requires a driver adapter for the PostgreSQL datasource.
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  // --- Environment ---------------------------------------------------------
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new Error(
      'ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD must be set in .env before seeding.',
    );
  }

  // --- 1. Stores -----------------------------------------------------------
  const nexora = await prisma.store.upsert({
    where: { code: 'NEXORA' },
    update: {},
    create: {
      code: 'NEXORA',
      name: 'NEXORA',
      domain: 'nexoraonline.de',
      defaultLocale: 'de',
      currency: 'EUR',
      status: 'active',
    },
  });

  const helpmy = await prisma.store.upsert({
    where: { code: 'HELPMEY' },
    update: {},
    create: {
      code: 'HELPMEY',
      name: 'HelpmeY',
      domain: 'helpmy.de',
      defaultLocale: 'de',
      currency: 'EUR',
      status: 'active',
    },
  });

  // --- 2. Store settings ---------------------------------------------------
  await prisma.storeSettings.upsert({
    where: { storeId: nexora.id },
    update: {},
    create: {
      storeId: nexora.id,
      invoicePrefix: 'NEX-',
      nextInvoiceNumber: 1n,
      vatRate: 0.19,
      vatIncludedInPrice: true,
      markupPercentage: 45.0,
      allowedLocales: ['ar', 'en', 'de'],
      refundWindowDays: 14,
    },
  });

  await prisma.storeSettings.upsert({
    where: { storeId: helpmy.id },
    update: {},
    create: {
      storeId: helpmy.id,
      invoicePrefix: 'HLP-',
      nextInvoiceNumber: 1n,
      vatRate: 0.19,
      vatIncludedInPrice: true,
      markupPercentage: 45.0,
      allowedLocales: ['ar', 'en', 'de'],
      refundWindowDays: 14,
    },
  });

  // --- 3. Supplier ---------------------------------------------------------
  await prisma.supplier.upsert({
    where: { code: 'aliexpress' },
    update: {},
    create: {
      code: 'aliexpress',
      name: 'AliExpress',
      status: 'active',
    },
  });

  // --- 4. Super admin ------------------------------------------------------
  // @@unique([storeId, email]) does NOT prevent duplicates when storeId IS NULL
  // in PostgreSQL, so upsert cannot be used here. findFirst + create instead.
  const existingAdmin = await prisma.user.findFirst({
    where: { email: adminEmail, storeId: null },
  });

  if (!existingAdmin) {
    const passwordHash = await argon2.hash(adminPassword, {
      type: argon2.argon2id,
    });

    await prisma.user.create({
      data: {
        storeId: null,
        email: adminEmail,
        passwordHash,
        name: 'Super Admin',
        role: 'super_admin',
        status: 'active',
        emailVerifiedAt: new Date(),
      },
    });
  }

  console.log('✅ Seed complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
