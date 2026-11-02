-- Vazifa va materiallarni aniq darsga bog'lash (ixtiyoriy): faqat yangi NULL ustunlar, mavjud ma'lumotlar o'zgarmaydi.
-- Dars o'chirilsa, vazifa/material guruhda qoladi (lesson_id NULL bo'ladi).
ALTER TABLE "assignments" ADD COLUMN "lesson_id" UUID;
ALTER TABLE "materials" ADD COLUMN "lesson_id" UUID;

ALTER TABLE "assignments" ADD CONSTRAINT "assignments_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "materials" ADD CONSTRAINT "materials_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "assignments_lesson_id_idx" ON "assignments"("lesson_id");
CREATE INDEX "materials_lesson_id_idx" ON "materials"("lesson_id");
