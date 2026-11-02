-- Lidlarni chuqurlashtirish: faqat yangi NULL (yoki default'li) ustunlar — mavjud ma'lumotlar o'zgarmaydi.
ALTER TABLE "leads"
  ADD COLUMN "gender" "gender",
  ADD COLUMN "birth_date" DATE,
  ADD COLUMN "guardian_name" TEXT,
  ADD COLUMN "guardian_relation" TEXT,
  ADD COLUMN "guardian_phone" TEXT,
  ADD COLUMN "school" TEXT,
  ADD COLUMN "preferred_time" TEXT,
  ADD COLUMN "temperature" TEXT NOT NULL DEFAULT 'warm',
  ADD COLUMN "next_contact_at" TIMESTAMPTZ,
  ADD COLUMN "trial_at" TIMESTAMPTZ;

CREATE INDEX "leads_tenant_id_next_contact_at_idx" ON "leads"("tenant_id", "next_contact_at");
