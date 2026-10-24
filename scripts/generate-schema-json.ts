/**
 * scripts/generate-schema-json.ts
 * Generates docs/database-schema.json by parsing prisma/schema.prisma directly.
 * No external Prisma API needed — pure text parsing.
 * Re-runnable.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SCHEMA_PATH = path.join(ROOT, 'prisma', 'schema.prisma');
const OUT_PATH = path.join(ROOT, 'docs', 'database-schema.json');

// ── type helpers ─────────────────────────────────────────────────────────────

interface FieldEntry {
  name: string;
  columnName: string;
  type: string;
  nullable: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  array?: boolean;
  default?: unknown;
  isUpdatedAt?: boolean;
}

interface OutboundRelation {
  name: string;
  toModel: string;
  fromFields: string[];
  toFields: string[];
  onDelete: string | null;
  onUpdate: string | null;
  isList: boolean;
}

interface ModelEntry {
  name: string;
  table: string;
  group: string;
  primaryKey: string[];
  uniqueConstraints: string[][];
  indexes: string[][];
  fields: FieldEntry[];
  relations: OutboundRelation[];
}

interface TopRelation {
  from: string;
  to: string;
  type: string;
  fromFields: string[];
  toFields: string[];
  onDelete: string | null;
  onUpdate: string | null;
}

// ── config maps ───────────────────────────────────────────────────────────────

const GROUP_MAP: Record<string, string> = {
  Store: 'tenancy', StoreSettings: 'tenancy',
  User: 'identity', UserSession: 'identity', Address: 'identity',
  Supplier: 'supply', SupplierConnection: 'supply',
  Category: 'catalog', CategoryTranslation: 'catalog',
  Product: 'catalog', ProductTranslation: 'catalog',
  ProductVariant: 'catalog', ProductImage: 'catalog',
  ProductCategory: 'catalog', SupplierProduct: 'catalog',
  SupplierVariant: 'catalog',
  Cart: 'commerce', CartItem: 'commerce',
  Order: 'commerce', OrderItem: 'commerce',
  Payment: 'payment', PaymentEvent: 'payment', WebhookEvent: 'payment',
  SupplierOrder: 'fulfillment', SupplierOrderItem: 'fulfillment',
  Shipment: 'fulfillment', ShipmentEvent: 'fulfillment',
  Invoice: 'finance', Refund: 'finance',
  SupplierRefund: 'finance', FinancialTransaction: 'finance',
  BackgroundJob: 'ops', IntegrationLog: 'ops',
};

// ── native type resolver ─────────────────────────────────────────────────────

function resolveType(prismaType: string, isList: boolean, dbAnnotation: string | null): string {
  if (isList) {
    // String[] → text[], etc.
    return 'text[]';
  }
  if (dbAnnotation) {
    // @db.VarChar(255) → varchar(255), @db.Uuid → uuid, etc.
    const m = dbAnnotation.match(/@db\.(\w+)(?:\(([^)]+)\))?/);
    if (m) {
      const typeName = m[1];
      const args = m[2];
      switch (typeName) {
        case 'Uuid': return 'uuid';
        case 'VarChar': return `varchar(${args})`;
        case 'Text': return 'text';
        case 'Decimal': return `decimal(${args})`;
        case 'Timestamptz': return 'timestamptz';
        case 'Char': return `char(${args})`;
        case 'SmallInt': return 'smallint';
        case 'Integer': return 'integer';
        case 'BigInt': return 'bigint';
        case 'DoublePrecision': return 'double precision';
        case 'Boolean': return 'boolean';
        case 'Json': return 'jsonb';
        default: return typeName.toLowerCase();
      }
    }
  }
  // Fallback from Prisma scalar type
  switch (prismaType) {
    case 'String':   return 'text';
    case 'Int':      return 'integer';
    case 'BigInt':   return 'bigint';
    case 'Float':    return 'double precision';
    case 'Boolean':  return 'boolean';
    case 'DateTime': return 'timestamptz';
    case 'Decimal':  return 'decimal';
    case 'Json':     return 'jsonb';
    case 'Bytes':    return 'bytea';
    default:         return prismaType.toLowerCase();
  }
}

// ── default value parser ─────────────────────────────────────────────────────

function parseDefault(rawDefault: string): unknown {
  const v = rawDefault.trim();
  // @default(dbgenerated("gen_random_uuid()"))
  const dbgen = v.match(/^dbgenerated\("([^"]+)"\)$/);
  if (dbgen) return dbgen[1];
  // @default(now())
  if (v === 'now()') return 'now()';
  // @default(autoincrement())
  if (v === 'autoincrement()') return 'autoincrement()';
  // @default(uuid())
  if (v === 'uuid()') return 'uuid()';
  // boolean
  if (v === 'true') return true;
  if (v === 'false') return false;
  // number
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  // string literal "..."
  const strMatch = v.match(/^"([^"]*)"$/);
  if (strMatch) return strMatch[1];
  // array literal ["ar","en","de"]
  if (v.startsWith('[') && v.endsWith(']')) {
    try { return JSON.parse(v); } catch { return v; }
  }
  return v;
}

// ── model block parser ────────────────────────────────────────────────────────

function parseModel(block: string): ModelEntry {
  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);

  const modelNameMatch = lines[0].match(/^model\s+(\w+)\s*\{$/);
  const modelName = modelNameMatch ? modelNameMatch[1] : 'Unknown';

  let tableName = modelName.toLowerCase();
  const mapMatch = block.match(/@@map\("([^"]+)"\)/);
  if (mapMatch) tableName = mapMatch[1];

  // @@id([...]) composite primary key
  const compositeIdMatch = block.match(/@@id\(\[([^\]]+)\]\)/);
  const compositePk: string[] = compositeIdMatch
    ? compositeIdMatch[1].split(',').map((s) => s.trim())
    : [];

  // @@unique([...]) — can appear multiple times
  const compositeUniques: string[][] = [];
  const uniqueRe = /@@unique\(\[([^\]]+)\]\)/g;
  let uMatch: RegExpExecArray | null;
  while ((uMatch = uniqueRe.exec(block)) !== null) {
    compositeUniques.push(uMatch[1].split(',').map((s) => s.trim()));
  }

  // @@index([...]) — may appear multiple times
  const indexes: string[][] = [];
  const idxRe = /@@index\(\[([^\]]+)\]\)/g;
  let idxMatch: RegExpExecArray | null;
  while ((idxMatch = idxRe.exec(block)) !== null) {
    indexes.push(idxMatch[1].split(',').map((s) => s.trim()));
  }

  const fields: FieldEntry[] = [];
  const relations: OutboundRelation[] = [];
  let singlePk: string | null = null;
  const singleUniques: string[] = [];

  // field line pattern: fieldName  Type[?][]  modifiers...
  const fieldRe =
    /^(\w+)\s+([\w]+)(\?)?(\[\])?\s+(.*?)(?:\/\/.*)?$/;

  for (const line of lines) {
    if (
      line.startsWith('model ') ||
      line.startsWith('@@') ||
      line === '{' ||
      line === '}'
    ) continue;

    const fm = line.match(fieldRe);
    if (!fm) continue;

    const fieldName = fm[1];
    const prismaType = fm[2];
    const nullable = fm[3] === '?';
    const isList = fm[4] === '[]';
    const modifiers = fm[5] ?? '';

    // Skip relation fields (type is a model name — capitalised, not a scalar)
    const SCALAR_TYPES = new Set([
      'String','Int','BigInt','Float','Boolean','DateTime','Decimal','Json','Bytes',
    ]);
    const isScalar = SCALAR_TYPES.has(prismaType);
    const isEnum = false; // no enums in this schema
    const isRelation = !isScalar && !isEnum && /^[A-Z]/.test(prismaType);

    if (isRelation) {
      // Parse relation fields/references
      const ffMatch = modifiers.match(/fields:\s*\[([^\]]+)\]/);
      const rfMatch = modifiers.match(/references:\s*\[([^\]]+)\]/);
      const delMatch = modifiers.match(/onDelete:\s*(\w+)/);
      const updMatch = modifiers.match(/onUpdate:\s*(\w+)/);

      if (ffMatch && rfMatch) {
        relations.push({
          name: fieldName,
          toModel: prismaType,
          fromFields: ffMatch[1].split(',').map((s) => s.trim()),
          toFields: rfMatch[1].split(',').map((s) => s.trim()),
          onDelete: delMatch ? delMatch[1] : null,
          onUpdate: updMatch ? updMatch[1] : null,
          isList,
        });
      }
      continue;
    }

    // Extract @map
    const mapM = modifiers.match(/@map\("([^"]+)"\)/);
    const columnName = mapM ? mapM[1] : fieldName;

    // Extract @db annotation
    const dbM = modifiers.match(/(@db\.\w+(?:\([^)]+\))?)/);
    const dbAnnotation = dbM ? dbM[1] : null;

    // Resolve type
    const resolvedType = resolveType(prismaType, isList, dbAnnotation);

    // Extract @default
    const defM = modifiers.match(/@default\((.+?)\)(?:\s|$)/);
    const defaultVal = defM ? parseDefault(defM[1]) : undefined;

    // Flags
    const isPK = modifiers.includes('@id');
    const isUniq = modifiers.includes('@unique');
    const isUpdatedAt = modifiers.includes('@updatedAt');

    if (isPK && !compositeIdMatch) singlePk = fieldName;
    if (isUniq) singleUniques.push(fieldName);

    const entry: FieldEntry = {
      name: fieldName,
      columnName,
      type: resolvedType,
      nullable: nullable || isList, // lists are always nullable semantically
    };
    if (isPK) entry.primaryKey = true;
    if (isUniq) entry.unique = true;
    if (isList) entry.array = true;
    if (defaultVal !== undefined) entry.default = defaultVal;
    if (isUpdatedAt) entry.isUpdatedAt = true;

    fields.push(entry);
  }

  const allSingleUniques: string[][] = singleUniques.map((f) => [f]);
  const allUniqueConstraints: string[][] = [...allSingleUniques, ...compositeUniques];

  return {
    name: modelName,
    table: tableName,
    group: GROUP_MAP[modelName] ?? 'misc',
    primaryKey: singlePk ? [singlePk] : compositePk,
    uniqueConstraints: allUniqueConstraints,
    indexes,
    fields,
    relations,
  };
}

// ── main ─────────────────────────────────────────────────────────────────────

function main(): void {
  console.log(`Reading schema from ${SCHEMA_PATH}`);
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');

  // Split into model blocks
  const modelBlockRe = /^model\s+\w+\s*\{[^}]+\}/gm;
  const blocks = schema.match(modelBlockRe) ?? [];

  if (blocks.length === 0) {
    throw new Error('No model blocks found in schema!');
  }

  const models: ModelEntry[] = blocks.map(parseModel);

  // Build top-level relations list
  const topRelations: TopRelation[] = [];
  for (const model of models) {
    for (const rel of model.relations) {
      // Determine if 1-to-1 or 1-to-many
      const fkFieldName = rel.fromFields[0];
      const fkField = model.fields.find((f) => f.name === fkFieldName);
      const isOneToOne = fkField?.unique === true || fkField?.primaryKey === true;

      // Junction table: no single PK field, composite PK
      const isJunction = model.primaryKey.length >= 2 && !model.fields.some((f) => f.primaryKey);

      topRelations.push({
        from: model.name,
        to: rel.toModel,
        type: isJunction ? 'junction' : isOneToOne ? '1-to-1' : '1-to-many',
        fromFields: rel.fromFields,
        toFields: rel.toFields,
        onDelete: rel.onDelete,
        onUpdate: rel.onUpdate,
      });
    }
  }

  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      prismaVersion: '7.10.1',
      database: 'PostgreSQL 17 (Neon)',
      modelCount: models.length,
      tenantIsolation: 'PostgreSQL RLS via app.current_store_id (set_config)',
    },
    stores: [
      { code: 'NEXORA', domain: 'nexoraonline.de', currency: 'EUR', defaultLocale: 'de' },
      { code: 'HELPMEY', domain: 'helpmy.de', currency: 'EUR', defaultLocale: 'de' },
    ],
    groups: {
      tenancy:     ['Store', 'StoreSettings'],
      identity:    ['User', 'UserSession', 'Address'],
      supply:      ['Supplier', 'SupplierConnection'],
      catalog:     ['Category', 'CategoryTranslation', 'Product', 'ProductTranslation',
                    'ProductVariant', 'ProductImage', 'ProductCategory',
                    'SupplierProduct', 'SupplierVariant'],
      commerce:    ['Cart', 'CartItem', 'Order', 'OrderItem'],
      payment:     ['Payment', 'PaymentEvent', 'WebhookEvent'],
      fulfillment: ['SupplierOrder', 'SupplierOrderItem', 'Shipment', 'ShipmentEvent'],
      finance:     ['Invoice', 'Refund', 'SupplierRefund', 'FinancialTransaction'],
      ops:         ['BackgroundJob', 'IntegrationLog'],
    },
    models,
    relations: topRelations,
    rlsProtectedTables: [
      'orders', 'order_items', 'payments', 'payment_events', 'refunds',
      'invoices', 'shipments', 'shipment_events', 'supplier_orders',
      'supplier_order_items', 'carts', 'cart_items', 'addresses',
      'user_sessions', 'users', 'financial_transactions',
    ],
    notes: [
      'All monetary amounts use DECIMAL(12,2).',
      'All IDs are UUID via gen_random_uuid() (PostgreSQL 13+).',
      'sellingPrice = ROUND(supplierCost * exchangeRate * 1.45, 2).',
      'OrderItem snapshots (productNameSnapshot, variantSnapshot, unitSalePrice, unitSupplierCost) are immutable historical values.',
      'Invoices: UNIQUE(store_id, invoice_number).',
      'Supplier connections tokens encrypted at rest (application-level AES-256-GCM).',
    ],
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), 'utf-8');

  const sizeKb = (fs.statSync(OUT_PATH).size / 1024).toFixed(1);
  console.log(
    `✅ Wrote ${OUT_PATH} (${output.models.length} models, ${topRelations.length} relations, ${sizeKb} KB)`,
  );
}

main();
