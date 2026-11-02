-- Gamifikatsiya: coinlar (vazifa va savollar uchun) va guruh bo'yicha test savollari. Faqat yangi jadvallar.
CREATE TABLE "coin_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "ref_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "coin_transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quiz_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "study_unit_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correct_index" INTEGER NOT NULL,
    "explanation" TEXT,
    "coins" INTEGER NOT NULL DEFAULT 5,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "quiz_questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quiz_answers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "choice" INTEGER NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "quiz_answers_pkey" PRIMARY KEY ("id")
);

-- Bir sabab + ob'ekt uchun bitta tranzaksiya: takroriy topshirish/baholash coinni ikki marta bermaydi
CREATE UNIQUE INDEX "coin_transactions_student_id_reason_ref_id_key" ON "coin_transactions"("student_id", "reason", "ref_id");
CREATE INDEX "coin_transactions_tenant_id_student_id_created_at_idx" ON "coin_transactions"("tenant_id", "student_id", "created_at" DESC);
CREATE INDEX "quiz_questions_study_unit_id_idx" ON "quiz_questions"("study_unit_id");
-- Har bir savolga o'quvchi bir marta javob beradi
CREATE UNIQUE INDEX "quiz_answers_question_id_student_id_key" ON "quiz_answers"("question_id", "student_id");
CREATE INDEX "quiz_answers_student_id_idx" ON "quiz_answers"("student_id");

ALTER TABLE "coin_transactions" ADD CONSTRAINT "coin_transactions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_study_unit_id_fkey" FOREIGN KEY ("study_unit_id") REFERENCES "study_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quiz_answers" ADD CONSTRAINT "quiz_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "quiz_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quiz_answers" ADD CONSTRAINT "quiz_answers_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS (TZ 8.4)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['coin_transactions','quiz_questions','quiz_answers']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = nullif(current_setting(''app.current_tenant'', true), '''')::uuid)
         WITH CHECK (tenant_id = nullif(current_setting(''app.current_tenant'', true), '''')::uuid)', t);
  END LOOP;
END $$;
