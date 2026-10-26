/**
 * scripts/generate-schema-json.ts
 *
 * Generates docs/database-schema.json from prisma/schema.prisma.
 *
 * This is a deliberate ground-up rewrite, not a patch of the b01c294 parser.
 * That parser produced 327 fields / 39 relations because it parsed model blocks
 * with /^model\s+\w+\s*\{[^}]+\}/gm — and `[^}]+` stops at the first `}`, i.e. inside
 * `@relation(fields: [...])` or `@default("{}")`. Every model was therefore truncated
 * at its first inline brace. This version is line-oriented and has no such failure mode.
 *
 * Output shape mirrors the authoritative docs/database-schema.json committed in 8ad4937
 * (see docs/13-migration-report.md §2.5).
 *
 * Re-runnable. Run: pnpm exec tsx scripts/generate-schema-json.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SCHEMA_PATH = join(ROOT, "prisma", "schema.prisma");
const OUT_PATH = join(ROOT, "docs", "database-schema.json");

// ── Types ─────────────────────

interface ScalarFieldJson {
  name: string;
  columnName: string;
  type: string;
  nullable: boolean;
  isRelation: false;
  primaryKey?: true;
  unique?: true;
  array?: true;
  isUpdatedAt?: true;
  default?: string | number | boolean | unknown[];
}

interface RelationFieldJson {
  name: string;
  columnName: string;
  type: string; // target model name
  nullable: boolean;
  isRelation: true;
  array?: true;
  relatesTo: string;
  fromFields?: string[];
  toFields?: string[];
  onDelete?: string | null;
  onUpdate?: string | null;
}

type FieldJson = ScalarFieldJson | RelationFieldJson;

interface IndexJson {
  fields: string[];
  type: "primary" | "unique" | "index";
}

interface ModelJson {
  name: string;
  table: string;
  group: string;
  primaryKey: string[];
  uniqueConstraints: string[][];
  indexes: IndexJson[];
  fields: FieldJson[];
}

interface RelationJson {
  from: string;
  fromField: string;
  to: string;
  toField: string;
  type: "1-to-1" | "1-to-many";
  onDelete: string | null;
  onUpdate: string | null;
}

// ── Canonical metadata (carried over verbatim from the authoritative file) ─────

const GROUP_MAP: Record<string, string> = {
  Store: "tenancy",
  StoreSettings: "tenancy",
  User: "identity",
  UserSession: "identity",
  Address: "identity",
  Supplier: "supply",
  SupplierConnection: "supply",
  Category: "catalog",
  CategoryTranslation: "catalog",
  Product: "catalog",
  ProductTranslation: "catalog",
  ProductVariant: "catalog",
  ProductImage: "catalog",
  ProductCategory: "catalog",
  SupplierProduct: "catalog",
  SupplierVariant: "catalog",
  Cart: "commerce",
  CartItem: "commerce",
  Order: "commerce",
  OrderItem: "commerce",
  Payment: "payment",
  PaymentEvent: "payment",
  WebhookEvent: "payment",
  SupplierOrder: "fulfillment",
  SupplierOrderItem: "fulfillment",
  Shipment: "fulfillment",
  ShipmentEvent: "fulfillment",
  Invoice: "finance",
  Refund: "finance",
  SupplierRefund: "finance",
  FinancialTransaction: "finance",
  BackgroundJob: "ops",
  IntegrationLog: "ops",
};

/** Tables that actually have RLS enabled+forced (verified against pg_class on Neon). */
const RLS_PROTECTED_TABLES = [
  "orders",
  "order_items",
  "payments",
  "payment_events",
  "refunds",
  "invoices",
  "shipments",
  "shipment_events",
  "supplier_orders",
  "supplier_order_items",
  "carts",
  "cart_items",
  "addresses",
  "financial_transactions",
  "supplier_refunds",
];

const NOTES = [
  "All monetary amounts use DECIMAL(12,2).",
  "All IDs are UUID via gen_random_uuid() (PostgreSQL 13+).",
  "sellingPrice = ROUND(supplierCost * 1.45, 2). Exchange rate conversion is deferred to a future fx module.",
  "OrderItem snapshots (productNameSnapshot, variantSnapshot, unitSalePrice, unitSupplierCost) are immutable historical values.",
  "Invoices: UNIQUE(store_id, invoice_number).",
  "Supplier connections tokens encrypted at rest (application-level AES-256-GCM).",
  "indexes[] contains ALL index types per model: primary, unique, and regular indexes.",
  "relations[] contains only FK-bearing sides (child models). fromField is the FK scalar field.",
  "rlsProtectedTables lists tables with RLS enabled and FORCEd; the app role must connect as a non-BYPASSRLS role (see docs/13-migration-report.md).",
];

const SCALAR_PRISMA_TYPES = new Set([
  "String",
  "Int",
  "BigInt",
  "Float",
  "Boolean",
  "DateTime",
  "Decimal",
  "Json",
  "Bytes",
]);

// ── Type resolution ───────────────────────────

/** Turn `@db.Decimal(12, 2)` into `decimal(12, 2)` (note the space, as in the canonical file). */
function resolveNativeType(
  prismaType: string,
  isList: boolean,
  dbType: string | null,
): string {
  if (isList) return "text[]";
  if (dbType) return dbType;
  switch (prismaType) {
    case "String":
      return "text";
    case "Int":
      return "integer";
    case "BigInt":
      return "bigint";
    case "Float":
      return "double precision";
    case "Boolean":
      return "boolean";
    case "DateTime":
      return "timestamptz";
    case "Decimal":
      return "decimal";
    case "Json":
      return "jsonb";
    case "Bytes":
      return "bytea";
    default:
      return prismaType.toLowerCase();
  }
}

/**
 * Extract the `@db.X(...)` annotation and lower-case it to a PostgreSQL type name.
 * Handles nested parens: `Decimal(12, 2)`.
 */
function parseDbType(line: string): string | null {
  const at = line.indexOf("@db.");
  if (at === -1) return null;
  const rest = line.slice(at + 4); // after "@db."
  const nameMatch = rest.match(/^([A-Za-z0-9_]+)/);
  if (!nameMatch) return null;
  const rawName = nameMatch[1];
  const cursor = rawName.length;
  const alias: Record<string, string> = {
    uuid: "uuid",
    varchar: "varchar",
    char: "char",
    text: "text",
    smallint: "smallint",
    integer: "integer",
    bigint: "bigint",
    real: "real",
    doubleprecision: "double precision",
    boolean: "boolean",
    timestamptz: "timestamptz",
    timestamp: "timestamp",
    date: "date",
    time: "time",
    json: "json",
    jsonb: "jsonb",
    bytea: "bytea",
    inet: "inet",
    citext: "citext",
  };
  const lower = rawName.toLowerCase();
  const base = alias[lower] ?? lower;
  if (rest[cursor] === "(") {
    let depth = 0;
    let end = -1;
    for (let i = cursor; i < rest.length; i++) {
      if (rest[i] === "(") depth++;
      else if (rest[i] === ")") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end !== -1) {
      const args = rest.slice(cursor + 1, end).replace(/\s+/g, "");
      // The canonical file omits precision for timestamps: @db.Timestamptz(6) → timestamptz.
      if (base === "timestamptz" || base === "timestamp" || base === "time")
        return base;
      // Decimal keeps a space after the comma: @db.Decimal(12, 2) → decimal(12, 2).
      if (base === "decimal" || base === "numeric") {
        const nums = args.split(",").filter(Boolean);
        return nums.length === 2
          ? `${base}(${nums[0]}, ${nums[1]})`
          : `${base}(${nums.join(", ")})`;
      }
      return `${base}(${args})`;
    }
  }
  return base;
}

// ── Default-value resolution ─────────────────

/** Parse the argument of `@default(...)`, supporting one level of nested parens. */
function parseDefaultArg(line: string): string | null {
  const at = line.indexOf("@default(");
  if (at === -1) return null;
  let depth = 0;
  const start = at + "@default(".length;
  for (let i = at + "@default(".length - 1; i < line.length; i++) {
    if (line[i] === "(") depth++;
    else if (line[i] === ")") {
      depth--;
      if (depth === 0) return line.slice(start, i).trim();
    }
  }
  return null;
}

function resolveDefault(raw: string): string | number | boolean | unknown[] {
  const v = raw.trim();
  // dbgenerated("gen_random_uuid()") → gen_random_uuid()
  const dbgen = v.match(/^dbgenerated\(\s*"([^"]*)"\s*\)$/);
  if (dbgen) return dbgen[1];
  if (!v) return v;

  // Function calls like now(), uuid(), autoincrement() — canonical form keeps the parens.
  if (/^[A-Za-z_][A-Za-z0-9_]*\(\)$/.test(v)) return v;

  if (v === "true") return true;
  if (v === "false") return false;

  // Quoted string → array → number are mutually exclusive.
  const strMatch = v.match(/^"((?:[^"\\]|\\.)*)"$/);
  if (strMatch) return strMatch[1];
  if (v.startsWith("[") && v.endsWith("]")) {
    try {
      return JSON.parse(v) as unknown[];
    } catch {
      /* fall through */
    }
  }
  if (/^-?\d+$/.test(v)) return Number(v);
  if (/^-?\d*\.\d+$/.test(v)) return Number(v);

  return v;
}

// ── Line helpers ─────────────────────────────

/** Strip trailing `//` comments that are not inside a string literal. */
function stripComment(line: string): string {
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuote = !inQuote;
    else if (!inQuote && c === "/" && line[i + 1] === "/") {
      // `///` doc comments are skipped by the caller; plain `//` is trimmed here.
      return line.slice(0, i);
    }
  }
  return line;
}

/** `[a, b]` → ['a', 'b'] */
function parseBracketList(text: string): string[] {
  return text
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Extract the contents of the first `[...]` following `key` in `line`. */
function parseAttrList(line: string, key: string): string[] | null {
  const at = line.indexOf(key);
  if (at === -1) return null;
  const open = line.indexOf("[", at);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < line.length; i++) {
    if (line[i] === "[") depth++;
    else if (line[i] === "]") {
      depth--;
      if (depth === 0) return parseBracketList(line.slice(open, i + 1));
    }
  }
  return null;
}

/** Extract `onDelete: X` / `onUpdate: X`. */
function parseReferentialAction(line: string, key: string): string | null {
  const m = line.match(new RegExp(`${key}:\\s*([A-Za-z]+)`));
  return m ? m[1] : null;
}

// ── Model block extraction ───────────────────

interface RawModel {
  name: string;
  bodyLines: string[];
}

/**
 * Walk the schema top-down, tracking brace depth so that braces inside attributes
 * (`@default("{}")`, `@relation(...)`) never terminate a model. Comments are ignored.
 */
function extractModels(schema: string): RawModel[] {
  const models: RawModel[] = [];
  const lines = schema.split(/\r?\n/);
  let current: RawModel | null = null;
  let depth = 0;

  for (const line of lines) {
    if (!current) {
      const start = line.match(/^\s*model\s+(\w+)\s*\{/);
      if (start) {
        current = { name: start[1], bodyLines: [] };
        depth = 1;
        // Anything after the opening brace on the same line is body content.
        const tail = line.slice(line.indexOf("{") + 1).trim();
        if (tail) {
          if (tail.startsWith("}")) {
            models.push(current);
            current = null;
            depth = 0;
          } else {
            current.bodyLines.push(tail);
          }
        }
      }
      continue;
    }

    const trimmed = line.trim();
    if (trimmed === "}") {
      models.push(current);
      current = null;
      depth = 0;
      continue;
    }
    current.bodyLines.push(line);
    void depth;
  }

  return models;
}

// ── Model parsing ────────────────────────────

function parseModel(raw: RawModel): ModelJson {
  let table = raw.name;
  const explicitId: string[] | null = (() => {
    for (const l of raw.bodyLines) {
      const t = l.trim();
      if (t.startsWith("@@id(")) return parseAttrList(t, "@@id(");
    }
    return null;
  })();

  const uniqueConstraints: string[][] = [];
  const plainIndexes: string[][] = [];
  const fields: FieldJson[] = [];
  const singleUniques: string[] = [];
  let singlePk: string | null = null;

  for (const rawLine of raw.bodyLines) {
    const trimmedRaw = rawLine.trim();

    // Skip blanks, doc comments (///), and regular comments (//).
    if (!trimmedRaw) continue;
    if (trimmedRaw.startsWith("///")) continue;
    if (trimmedRaw.startsWith("//")) continue;

    // ── Block attributes ──
    if (trimmedRaw.startsWith("@@")) {
      if (trimmedRaw.startsWith("@@map(")) {
        const m = trimmedRaw.match(/@@map\("([^"]+)"\)/);
        if (m) table = m[1];
      } else if (trimmedRaw.startsWith("@@unique(")) {
        const list = parseAttrList(trimmedRaw, "@@unique(");
        if (list) uniqueConstraints.push(list);
      } else if (trimmedRaw.startsWith("@@index(")) {
        const list = parseAttrList(trimmedRaw, "@@index(");
        if (list) plainIndexes.push(list);
      }
      continue;
    }

    const line = stripComment(trimmedRaw).trim();
    if (!line) continue;

    // ── Field line: `name Type[?|[]] [attributes]` ──
    const fm = line.match(
      /^([A-Za-z_]\w*)\s+([A-Za-z_]\w*)(\?|\[\])?(\s+.*)?$/,
    );
    if (!fm) continue;

    const name = fm[1];
    const typeToken = fm[2];
    const modifier = fm[3] ?? "";
    const attrs = fm[4] ?? "";

    const nullable = modifier === "?";
    const isList = modifier === "[]";

    const isScalar = SCALAR_PRISMA_TYPES.has(typeToken);
    const isRelation = !isScalar && /^[A-Z]/.test(typeToken);

    if (isRelation) {
      const fromFields = parseAttrList(attrs, "fields:");
      const toFields = parseAttrList(attrs, "references:");
      const rel: RelationFieldJson = {
        name,
        columnName: name,
        type: typeToken,
        nullable,
        isRelation: true,
        relatesTo: typeToken,
      };
      if (isList) rel.array = true;
      if (fromFields) rel.fromFields = fromFields;
      if (toFields) rel.toFields = toFields;
      // Only FK-bearing sides carry the referential actions; back-relations omit the keys entirely.
      if (fromFields && toFields) {
        rel.onDelete = parseReferentialAction(attrs, "onDelete");
        rel.onUpdate = parseReferentialAction(attrs, "onUpdate");
      }
      fields.push(rel);
      continue;
    }

    // Scalar field
    const mapMatch = attrs.match(/@map\("([^"]+)"\)/);
    const columnName = mapMatch ? mapMatch[1] : name;
    const dbType = parseDbType(attrs);
    const resolvedType = resolveNativeType(typeToken, isList, dbType);

    const isId = /@id\b/.test(attrs);
    const isUnique = /@unique\b/.test(attrs);
    const isUpdatedAt = /@updatedAt\b/.test(attrs);

    const field: ScalarFieldJson = {
      name,
      columnName,
      type: resolvedType,
      nullable,
      isRelation: false,
    };
    if (isId) field.primaryKey = true;
    if (isUnique) field.unique = true;
    if (isList) field.array = true;
    if (isUpdatedAt) field.isUpdatedAt = true;

    const defArg = parseDefaultArg(attrs);
    if (defArg !== null) field.default = resolveDefault(defArg);

    if (isId) singlePk = name;
    if (isUnique) singleUniques.push(name);

    fields.push(field);
  }

  const primaryKey = explicitId ?? (singlePk ? [singlePk] : []);

  // indexes[] carries every index type, ordered primary → unique → regular.
  const indexes: IndexJson[] = [];
  if (primaryKey.length > 0)
    indexes.push({ fields: primaryKey, type: "primary" });
  for (const u of singleUniques) indexes.push({ fields: [u], type: "unique" });
  for (const u of uniqueConstraints)
    indexes.push({ fields: u, type: "unique" });
  for (const i of plainIndexes) indexes.push({ fields: i, type: "index" });

  const allUniques: string[][] = [
    ...singleUniques.map((f) => [f]),
    ...uniqueConstraints,
  ];

  return {
    name: raw.name,
    table,
    group: GROUP_MAP[raw.name] ?? "misc",
    primaryKey,
    uniqueConstraints: allUniques,
    indexes,
    fields,
  };
}

// ── Relation extraction ──────────────────────

/**
 * Emit one entry per FK-bearing relation field. Nullable relations are NOT skipped —
 * that defect dropped UserSession→Store and SupplierConnection→Store.
 */
function extractRelations(models: ModelJson[]): RelationJson[] {
  const out: RelationJson[] = [];

  for (const model of models) {
    for (const field of model.fields) {
      if (!field.isRelation) continue;
      const rel = field as RelationFieldJson;
      if (!rel.fromFields || rel.fromFields.length === 0) continue;
      if (!rel.toFields || rel.toFields.length === 0) continue;

      // A relation is 1-to-1 when the single FK column is itself unique/PK.
      const fkName = rel.fromFields[0];
      const fkField = model.fields.find((f) => f.name === fkName) as
        ScalarFieldJson | undefined;
      let isOneToOne =
        rel.fromFields.length === 1 &&
        (fkField?.unique === true || fkField?.primaryKey === true);
      // Also 1-to-1 when a composite unique covers exactly the FK columns.
      if (!isOneToOne && fkField) {
        isOneToOne = model.uniqueConstraints.some(
          (u) =>
            u.length === rel.fromFields!.length &&
            u.every((c, i) => c === rel.fromFields![i]),
        );
      }

      out.push({
        from: model.name,
        fromField: fkName,
        to: rel.relatesTo,
        toField: rel.toFields[0],
        type: isOneToOne ? "1-to-1" : "1-to-many",
        onDelete: rel.onDelete ?? null,
        onUpdate: rel.onUpdate ?? null,
      });
    }
  }

  return out;
}

// ── Main ─────────────────────

function main(): void {
  const schema = readFileSync(SCHEMA_PATH, "utf8");
  const rawModels = extractModels(schema);

  if (rawModels.length === 0) {
    throw new Error(`No models found in ${SCHEMA_PATH}`);
  }

  const models = rawModels.map(parseModel);
  const relations = extractRelations(models);

  const fieldCount = models.reduce((n, m) => n + m.fields.length, 0);
  const indexCount = models.reduce((n, m) => n + m.indexes.length, 0);

  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      prismaVersion: "7.10.1",
      database: "PostgreSQL 17 (Neon)",
      modelCount: models.length,
      relationCount: relations.length,
      totalFields: fieldCount,
      totalIndexCount: indexCount,
      tenantIsolation: "PostgreSQL RLS via app.current_store_id (set_config)",
    },
    stores: [
      {
        code: "NEXORA",
        domain: "nexoraonline.de",
        currency: "EUR",
        defaultLocale: "de",
      },
      {
        code: "HELPMEY",
        domain: "helpmy.de",
        currency: "EUR",
        defaultLocale: "de",
      },
    ],
    groups: Object.fromEntries(
      Object.entries(GROUP_MAP).reduce<Array<[string, string[]]>>(
        (acc, [model, group]) => {
          const bucket = acc.find(([g]) => g === group);
          if (bucket) bucket[1].push(model);
          else acc.push([group, [model]]);
          return acc;
        },
        [],
      ),
    ),
    models,
    relations,
    rlsProtectedTables: RLS_PROTECTED_TABLES,
    notes: NOTES,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(
    `Wrote ${OUT_PATH}\n` +
    `  models=${models.length} relations=${relations.length} fields=${fieldCount} indexes=${indexCount}`,
  );
}

main();
