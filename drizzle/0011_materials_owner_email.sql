ALTER TABLE "materials" ADD COLUMN "owner_email" text;
CREATE INDEX "idx_materials_owner" ON "materials" ("owner_email");
