-- DropForeignKey
ALTER TABLE "products" DROP CONSTRAINT "products_supplier_id_fkey";

-- DropForeignKey
ALTER TABLE "supplier_order_items" DROP CONSTRAINT "supplier_order_items_supplier_variant_id_fkey";

-- DropForeignKey
ALTER TABLE "supplier_products" DROP CONSTRAINT "supplier_products_product_id_fkey";

-- DropForeignKey
ALTER TABLE "supplier_products" DROP CONSTRAINT "supplier_products_supplier_id_fkey";

-- DropForeignKey
ALTER TABLE "supplier_variants" DROP CONSTRAINT "supplier_variants_product_variant_id_fkey";

-- DropForeignKey
ALTER TABLE "supplier_variants" DROP CONSTRAINT "supplier_variants_supplier_product_id_fkey";

-- DropIndex
DROP INDEX "products_supplier_id_idx";

-- DropIndex
DROP INDEX "supplier_order_items_supplier_variant_id_idx";

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "aliexpress_variant_id" VARCHAR(100);

-- AlterTable
ALTER TABLE "products" DROP COLUMN "supplier_id",
ADD COLUMN     "aliexpress_product_id" VARCHAR(100);

-- AlterTable
ALTER TABLE "supplier_order_items" DROP COLUMN "supplier_variant_id";

-- DropTable
DROP TABLE "supplier_products";

-- DropTable
DROP TABLE "supplier_variants";

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_aliexpress_variant_id_key" ON "product_variants"("aliexpress_variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_aliexpress_product_id_key" ON "products"("aliexpress_product_id");
