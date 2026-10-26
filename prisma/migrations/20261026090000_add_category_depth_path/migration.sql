-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "depth" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "path" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "categories_path_idx" ON "categories"("path");

-- Backfill path/depth for existing categories.
-- Only affects rows where path is still empty (fresh installs skip this).
DO $$
DECLARE
  rec RECORD;
  parent_path TEXT;
  parent_depth INT;
BEGIN
  -- Root categories first (no parent)
  UPDATE categories
  SET path = id::text, depth = 0
  WHERE parent_id IS NULL AND path = '';

  -- Then iterate until no more updates (handles arbitrary depth)
  LOOP
    FOR rec IN
      SELECT c.id, c.parent_id FROM categories c
      WHERE c.parent_id IS NOT NULL AND c.path = ''
    LOOP
      SELECT path, depth INTO parent_path, parent_depth
      FROM categories WHERE id = rec.parent_id;

      IF parent_path IS NOT NULL THEN
        UPDATE categories
        SET path = parent_path || '/' || id::text,
            depth = parent_depth + 1
        WHERE id = rec.id;
      END IF;
    END LOOP;

    EXIT WHEN NOT EXISTS (SELECT 1 FROM categories WHERE parent_id IS NOT NULL AND path = '');
  END LOOP;
END $$;
