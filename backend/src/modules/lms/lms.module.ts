import { Body, Controller, Delete, Get, HttpCode, Injectable, Module, Param, ParseUUIDPipe, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Prisma } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { AuditService } from '../../common/audit/audit.service';
import { RequirePermission } from '../../common/auth/decorators';
import { branchIdFilter } from '../../common/auth/scoping';
import { AuthContext, RequestContextStore } from '../../common/context/request-context';
import { PrismaService, Tx } from '../../common/db/prisma.service';
import { FilesService, MAX_DOCUMENT_BYTES } from '../../common/files/files.service';
import { AppError } from '../../common/http/app-error';
import { awardCoins, gradeBonus } from './gamification';
import { parseDateOnly, toDateOnly } from '../../common/utils/dates';
import { todayIn } from '../academic/domain';

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);
const emptyToUndefined = ({ value }: { value: unknown }): unknown => (typeof value === 'string' && value.trim() === '' ? undefined : typeof value === 'string' ? value.trim() : value);

/** Hujjat yuklash: xotirada qabul qilinadi, hajm multer darajasida ham cheklanadi */
export const documentUpload = () => FileInterceptor('file', { limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 } });
/** multer fayl nomini latin1 deb o'qiydi — o'zbekcha/ruscha nomlar buzilmasligi uchun UTF-8 ga qaytariladi */
export const originalName = (file: Express.Multer.File): string => Buffer.from(file.originalname, 'latin1').toString('utf8');

/** Ixtiyoriy: material/vazifa aniq darsga bog'lanadi (dars shu guruhniki bo'lishi shart) */
class LessonRefDto {
  @IsOptional() @Transform(emptyToUndefined) @IsUUID() lesson_id?: string;
}

class MaterialDto extends LessonRefDto {
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(150) title!: string;
  @IsOptional() @Transform(emptyToUndefined) @IsString() @MaxLength(2000) description?: string;
  /** Faqat http(s) havola — `javascript:` kabi sxemalar rad etiladi */
  @IsOptional() @Transform(emptyToUndefined) @IsString() @MaxLength(500) @Matches(/^https?:\/\/[^\s]+$/i, { message: "Havola http:// yoki https:// bilan boshlanishi kerak" }) link?: string;
}

class AssignmentDto extends LessonRefDto {
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(150) title!: string;
  @IsOptional() @Transform(emptyToUndefined) @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @Transform(emptyToUndefined) @IsDateString({ strict: true }) due_date?: string;
  @IsOptional() @Transform(emptyToUndefined) @Type(() => Number) @IsInt() @Min(1) @Max(1000) max_score?: number;
}

class GradeDto {
  @IsInt() @Min(0) @Max(1000) score!: number;
  @IsOptional() @Transform(emptyToUndefined) @IsString() @MaxLength(1000) feedback?: string;
}

class QuestionDto {
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(500) text!: string;
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(5) @Transform(({ value }) => (Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v.trim() : v)) : value)) @IsString({ each: true }) @MinLength(1, { each: true }) @MaxLength(200, { each: true }) options!: string[];
  @IsInt() @Min(0) @Max(4) correct_index!: number;
  @IsOptional() @Transform(emptyToUndefined) @IsString() @MaxLength(500) explanation?: string;
  @IsOptional() @IsInt() @Min(1) @Max(50) coins?: number;
}

export type FileView = { url: string | null; name: string | null; mime: string; size: number } | null;

/**
 * Ta'lim materiallari va uy vazifalari — o'qituvchi/xodim tomoni.
 * O'qituvchi (`own` scope) faqat o'zi dars beradigan guruhlarda ishlaydi; o'quvchi tomoni — PortalModule'da.
 */
@Injectable()
export class LmsService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly files: FilesService,
  ) {}

  fileView(tenantId: string, file: { id: string; name: string | null; mime: string; size: number } | null): FileView {
    return file ? { url: this.files.url(tenantId, file.id), name: file.name, mime: file.mime, size: file.size } : null;
  }

  private unitScope(auth: AuthContext, permission: 'material.manage' | 'homework.manage' | 'study_unit.view'): Prisma.StudyUnitWhereInput {
    return { branchId: branchIdFilter(auth), teacherId: auth.permissions[permission] === 'own' ? auth.userId : undefined };
  }

  private async unit(tx: Tx, auth: AuthContext, id: string, permission: 'material.manage' | 'homework.manage') {
    const unit = await tx.studyUnit.findFirst({ where: { AND: [{ id }, this.unitScope(auth, permission)] }, select: { id: true, name: true } });
    if (!unit) throw AppError.notFound('Guruh');
    return unit;
  }

  /** Dars shu guruhniki bo'lishi va bekor qilinmagan bo'lishi shart: begona guruh darsiga vazifa yozib bo'lmaydi */
  private async lessonOf(tx: Tx, unitId: string, lessonId: string | undefined): Promise<string | null> {
    if (!lessonId) return null;
    const lesson = await tx.lesson.findFirst({ where: { id: lessonId, studyUnitId: unitId }, select: { id: true, status: true } });
    if (!lesson) throw AppError.field('lesson_id', 'NOT_FOUND', 'Dars topilmadi');
    if (lesson.status === 'cancelled') throw AppError.field('lesson_id', 'LESSON_CANCELLED', "Bekor qilingan darsga biriktirib bo'lmaydi");
    return lesson.id;
  }

  private lessonView(l: { id: string; date: Date; startAt: Date } | null) {
    return l ? { id: l.id, date: toDateOnly(l.date), start_at: l.startAt } : null;
  }

  // ------------------------------------------------------------- darsliklar

  listMaterials(unitId: string, lessonId?: string) {
    const auth = RequestContextStore.auth();
    return this.db.tx(async (tx) => {
      await this.unit(tx, auth, unitId, 'material.manage');
      const rows = await tx.material.findMany({ where: { studyUnitId: unitId, lessonId }, orderBy: { createdAt: 'desc' }, include: { file: true, lesson: { select: { id: true, date: true, startAt: true } } } });
      return rows.map((m) => ({ id: m.id, title: m.title, description: m.description, link: m.link, file: this.fileView(auth.tenantId, m.file), lesson: this.lessonView(m.lesson), created_at: m.createdAt }));
    });
  }

  createMaterial(unitId: string, dto: MaterialDto, file?: Express.Multer.File) {
    const auth = RequestContextStore.auth();
    if (!file?.buffer?.length && !dto.link) throw AppError.field('file', 'REQUIRED', "Fayl yuklang yoki havola kiriting");
    return this.db.tx(async (tx) => {
      const unit = await this.unit(tx, auth, unitId, 'material.manage');
      const lessonId = await this.lessonOf(tx, unitId, dto.lesson_id);
      const fileId = file?.buffer?.length ? await this.files.saveDocument(tx, auth.tenantId, file.buffer, originalName(file), auth.userId) : null;
      const material = await tx.material.create({ data: { tenantId: auth.tenantId, studyUnitId: unitId, lessonId, title: dto.title, description: dto.description, link: dto.link, fileId, createdBy: auth.userId } });
      await this.audit.write(tx, auth.tenantId, { action: 'material.created', entityType: 'study_unit', entityId: unitId, newValue: { name: unit.name, title: dto.title } });
      return { id: material.id };
    });
  }

  removeMaterial(id: string) {
    const auth = RequestContextStore.auth();
    return this.db.tx(async (tx) => {
      const material = await tx.material.findFirst({ where: { id, studyUnit: this.unitScope(auth, 'material.manage') } });
      if (!material) throw AppError.notFound('Darslik');
      await tx.material.delete({ where: { id } });
      await this.files.remove(tx, material.fileId);
      await this.audit.write(tx, auth.tenantId, { action: 'material.deleted', entityType: 'study_unit', entityId: material.studyUnitId, oldValue: { title: material.title } });
    });
  }

  // ---------------------------------------------------------------- vazifalar

  /**
   * O'qituvchining tekshirilishi kerak javoblari (hali baholanmagan). Doira `unitScope` bilan bir xil:
   * `own` — faqat o'z guruhlari, `branch` — filial guruhlari. Eng eski topshirilgan javob birinchi.
   */
  toReview() {
    const auth = RequestContextStore.auth();
    return this.db.tx(async (tx) => {
      const rows = await tx.assignment.findMany({
        where: { studyUnit: this.unitScope(auth, 'homework.manage'), submissions: { some: { score: null } } },
        select: { id: true, title: true, dueDate: true, studyUnit: { select: { id: true, name: true } }, submissions: { where: { score: null }, select: { submittedAt: true } } },
      });
      const items = rows
        .map((a) => ({
          assignment_id: a.id,
          title: a.title,
          due_date: toDateOnly(a.dueDate),
          study_unit: a.studyUnit,
          pending: a.submissions.length,
          oldest_submitted_at: a.submissions.map((x) => x.submittedAt).sort((x, y) => x.getTime() - y.getTime())[0] ?? null,
        }))
        .sort((x, y) => (x.oldest_submitted_at?.getTime() ?? 0) - (y.oldest_submitted_at?.getTime() ?? 0));
      return { total: items.reduce((sum, i) => sum + i.pending, 0), items: items.slice(0, 20) };
    });
  }

  listAssignments(unitId: string, lessonId?: string) {
    const auth = RequestContextStore.auth();
    return this.db.tx(async (tx) => {
      await this.unit(tx, auth, unitId, 'homework.manage');
      const rows = await tx.assignment.findMany({
        where: { studyUnitId: unitId, lessonId },
        orderBy: { createdAt: 'desc' },
        include: { file: true, lesson: { select: { id: true, date: true, startAt: true } }, submissions: { select: { score: true } } },
      });
      return rows.map((a) => ({
        id: a.id,
        title: a.title,
        description: a.description,
        due_date: toDateOnly(a.dueDate),
        max_score: a.maxScore,
        file: this.fileView(auth.tenantId, a.file),
        lesson: this.lessonView(a.lesson),
        created_at: a.createdAt,
        submitted: a.submissions.length,
        graded: a.submissions.filter((s) => s.score !== null).length,
      }));
    });
  }

  createAssignment(unitId: string, dto: AssignmentDto, file?: Express.Multer.File) {
    const auth = RequestContextStore.auth();
    return this.db.tx(async (tx) => {
      const unit = await this.unit(tx, auth, unitId, 'homework.manage');
      const lessonId = await this.lessonOf(tx, unitId, dto.lesson_id);
      const fileId = file?.buffer?.length ? await this.files.saveDocument(tx, auth.tenantId, file.buffer, originalName(file), auth.userId) : null;
      const assignment = await tx.assignment.create({
        data: { tenantId: auth.tenantId, studyUnitId: unitId, lessonId, title: dto.title, description: dto.description, dueDate: dto.due_date ? parseDateOnly(dto.due_date) : null, maxScore: dto.max_score ?? 100, fileId, createdBy: auth.userId },
      });
      await this.audit.write(tx, auth.tenantId, { action: 'assignment.created', entityType: 'study_unit', entityId: unitId, newValue: { name: unit.name, title: dto.title } });
      return { id: assignment.id };
    });
  }

  removeAssignment(id: string) {
    const auth = RequestContextStore.auth();
    return this.db.tx(async (tx) => {
      const assignment = await tx.assignment.findFirst({ where: { id, studyUnit: this.unitScope(auth, 'homework.manage') }, include: { submissions: { select: { fileId: true } } } });
      if (!assignment) throw AppError.notFound('Vazifa');
      await tx.assignment.delete({ where: { id } });
      for (const fileId of [assignment.fileId, ...assignment.submissions.map((s) => s.fileId)]) await this.files.remove(tx, fileId);
      await this.audit.write(tx, auth.tenantId, { action: 'assignment.deleted', entityType: 'study_unit', entityId: assignment.studyUnitId, oldValue: { title: assignment.title } });
    });
  }

  // ------------------------------------------------ guruh test savollari (gamifikatsiya)

  listQuestions(unitId: string) {
    const auth = RequestContextStore.auth();
    return this.db.tx(async (tx) => {
      await this.unit(tx, auth, unitId, 'homework.manage');
      const rows = await tx.quizQuestion.findMany({ where: { studyUnitId: unitId }, orderBy: { createdAt: 'desc' }, include: { answers: { select: { isCorrect: true } } } });
      return rows.map((q) => ({
        id: q.id,
        text: q.text,
        options: q.options as string[],
        correct_index: q.correctIndex,
        explanation: q.explanation,
        coins: q.coins,
        answered: q.answers.length,
        correct: q.answers.filter((a) => a.isCorrect).length,
        created_at: q.createdAt,
      }));
    });
  }

  createQuestion(unitId: string, dto: QuestionDto) {
    const auth = RequestContextStore.auth();
    if (dto.correct_index >= dto.options.length) throw AppError.field('correct_index', 'OUT_OF_RANGE', "To'g'ri javob variantlar ichida bo'lishi kerak");
    if (new Set(dto.options.map((o) => o.toLowerCase())).size !== dto.options.length) throw AppError.field('options', 'DUPLICATE', 'Variantlar bir-biridan farq qilsin');
    return this.db.tx(async (tx) => {
      await this.unit(tx, auth, unitId, 'homework.manage');
      const q = await tx.quizQuestion.create({ data: { tenantId: auth.tenantId, studyUnitId: unitId, text: dto.text, options: dto.options, correctIndex: dto.correct_index, explanation: dto.explanation, coins: dto.coins ?? 5, createdBy: auth.userId } });
      return { id: q.id };
    });
  }

  async deleteQuestion(id: string): Promise<void> {
    const auth = RequestContextStore.auth();
    await this.db.tx(async (tx) => {
      const found = await tx.quizQuestion.findFirst({ where: { id, studyUnit: this.unitScope(auth, 'homework.manage') }, select: { id: true } });
      if (!found) throw AppError.notFound('Savol');
      await tx.quizQuestion.delete({ where: { id } });
    });
  }

  // ------------------------------------------------ kim topshirdi, kim topshirmadi

  /** Guruh bo'yicha jadval: qatorlar — hozirgi o'quvchilar, ustunlar — so'nggi vazifalar, katak — holat (topshirmagan / topshirgan / baholangan / kechikkan) */
  homeworkMatrix(unitId: string) {
    const auth = RequestContextStore.auth();
    const today = todayIn('Asia/Tashkent');
    const todayDate = new Date(`${today}T00:00:00Z`);
    return this.db.tx(async (tx) => {
      await this.unit(tx, auth, unitId, 'homework.manage');
      const assignments = await tx.assignment.findMany({ where: { studyUnitId: unitId }, orderBy: { createdAt: 'desc' }, take: 12, select: { id: true, title: true, dueDate: true, maxScore: true } });
      const members = await tx.enrollment.findMany({
        where: { studyUnitId: unitId, startDate: { lte: todayDate }, OR: [{ endDate: null }, { endDate: { gt: todayDate } }], student: { mergedIntoId: null } },
        select: { studentId: true, student: { select: { number: true, client: { select: { fullName: true } } } } },
      });
      const ids = members.map((m) => m.studentId);
      const subs = ids.length && assignments.length ? await tx.submission.findMany({ where: { studentId: { in: ids }, assignmentId: { in: assignments.map((a) => a.id) } }, select: { assignmentId: true, studentId: true, score: true, submittedAt: true } }) : [];
      const key = (a: string, s: string): string => `${a}:${s}`;
      const bySub = new Map(subs.map((s) => [key(s.assignmentId, s.studentId), s]));
      const cell = (a: (typeof assignments)[number], studentId: string) => {
        const s = bySub.get(key(a.id, studentId));
        const due = toDateOnly(a.dueDate);
        if (!s) return { status: due && due < today ? ('missed' as const) : ('pending' as const), score: null };
        if (s.score !== null) return { status: 'graded' as const, score: s.score };
        const late = due !== null && toDateOnly(s.submittedAt) > due;
        return { status: late ? ('late' as const) : ('submitted' as const), score: null };
      };
      return {
        assignments: assignments.map((a) => ({ id: a.id, title: a.title, due_date: toDateOnly(a.dueDate), max_score: a.maxScore })).reverse(),
        students: members
          .map((m) => ({ id: m.studentId, number: m.student.number, full_name: m.student.client.fullName, cells: assignments.map((a) => ({ assignment_id: a.id, ...cell(a, m.studentId) })).reverse() }))
          .sort((a, b) => a.full_name.localeCompare(b.full_name)),
      };
    });
  }

  // ------------------------------------------------ o'qituvchining o'quvchilari

  /** O'qituvchi (yoki filial rahbari) ko'ra oladigan guruhlarning HOZIRGI o'quvchilari. Pul, izoh va qora ro'yxat maydonlari yo'q */
  teachingStudents(q?: string) {
    const auth = RequestContextStore.auth();
    const today = new Date(`${todayIn('Asia/Tashkent')}T00:00:00Z`);
    const since = new Date(today.getTime() - 30 * 86_400_000);
    const scope = this.unitScope(auth, 'study_unit.view');
    const withPhone = Boolean(auth.permissions['student.view_contacts']);
    return this.db.tx(async (tx) => {
      const enrollments = await tx.enrollment.findMany({
        where: {
          startDate: { lte: today },
          OR: [{ endDate: null }, { endDate: { gt: today } }],
          studyUnit: scope,
          student: { mergedIntoId: null, status: { not: 'archived' }, ...(q ? { client: { fullName: { contains: q, mode: 'insensitive' as const } } } : {}) },
        },
        select: { studentId: true, studyUnit: { select: { id: true, name: true } }, student: { select: { id: true, number: true, status: true, client: { select: { fullName: true, phone: true } } } } },
        take: 3000,
      });
      const byStudent = new Map<string, { student: (typeof enrollments)[number]['student']; groups: { id: string; name: string }[] }>();
      for (const e of enrollments) {
        const entry = byStudent.get(e.studentId) ?? { student: e.student, groups: [] };
        entry.groups.push(e.studyUnit);
        byStudent.set(e.studentId, entry);
      }
      const ids = [...byStudent.keys()];
      const marks = ids.length ? await tx.attendance.findMany({ where: { studentId: { in: ids }, lesson: { studyUnit: scope, date: { gte: since, lt: today } } }, select: { studentId: true, status: true } }) : [];
      const subs = ids.length ? await tx.submission.findMany({ where: { studentId: { in: ids }, assignment: { studyUnit: scope } }, select: { studentId: true, score: true, assignment: { select: { maxScore: true } } } }) : [];
      const rows = [...byStudent.values()].map(({ student, groups }) => {
        const own = marks.filter((m) => m.studentId === student.id);
        const came = own.filter((m) => m.status === 'present' || m.status === 'late').length;
        const mine = subs.filter((s) => s.studentId === student.id);
        const graded = mine.filter((s) => s.score !== null);
        return {
          id: student.id,
          number: student.number,
          full_name: student.client.fullName,
          phone: withPhone ? student.client.phone : null,
          status: student.status,
          groups,
          attendance_rate: own.length ? Math.round((came / own.length) * 100) : null,
          homework: {
            graded: graded.length,
            pending: mine.length - graded.length,
            average: graded.length ? Math.round(graded.reduce((sum, s) => sum + ((s.score as number) / s.assignment.maxScore) * 100, 0) / graded.length) : null,
          },
        };
      });
      return rows.sort((a, b) => a.full_name.localeCompare(b.full_name));
    });
  }

  /** Bitta o'quvchining shu o'qituvchi guruhlaridagi davomati va vazifa natijalari (begona o'quvchi — 404) */
  teachingStudent(studentId: string) {
    const auth = RequestContextStore.auth();
    const today = new Date(`${todayIn('Asia/Tashkent')}T00:00:00Z`);
    const scope = this.unitScope(auth, 'study_unit.view');
    const withPhone = Boolean(auth.permissions['student.view_contacts']);
    return this.db.tx(async (tx) => {
      const enrollments = await tx.enrollment.findMany({
        where: { studentId, startDate: { lte: today }, OR: [{ endDate: null }, { endDate: { gt: today } }], studyUnit: scope, student: { mergedIntoId: null } },
        select: { studyUnit: { select: { id: true, name: true } }, student: { select: { id: true, number: true, status: true, client: { select: { fullName: true, phone: true } } } } },
      });
      const first = enrollments[0];
      if (!first) throw AppError.notFound("O'quvchi");
      const attendance = await tx.attendance.findMany({ where: { studentId, lesson: { studyUnit: scope } }, orderBy: { lesson: { startAt: 'desc' } }, take: 30, select: { status: true, lesson: { select: { date: true, studyUnit: { select: { name: true } } } } } });
      const submissions = await tx.submission.findMany({ where: { studentId, assignment: { studyUnit: scope } }, orderBy: { submittedAt: 'desc' }, take: 30, select: { score: true, feedback: true, submittedAt: true, assignment: { select: { title: true, maxScore: true, studyUnit: { select: { name: true } } } } } });
      return {
        id: first.student.id,
        number: first.student.number,
        full_name: first.student.client.fullName,
        phone: withPhone ? first.student.client.phone : null,
        status: first.student.status,
        groups: enrollments.map((e) => e.studyUnit),
        attendance: attendance.map((a) => ({ date: toDateOnly(a.lesson.date), group: a.lesson.studyUnit.name, status: a.status })),
        homework: submissions.map((s) => ({ title: s.assignment.title, group: s.assignment.studyUnit.name, score: s.score, max_score: s.assignment.maxScore, feedback: s.feedback, submitted_at: s.submittedAt })),
      };
    });
  }

  /** Vazifa bo'yicha guruhdagi har bir o'quvchi: topshirgan/topshirmagan, baho */
  submissions(assignmentId: string) {
    const auth = RequestContextStore.auth();
    return this.db.tx(async (tx) => {
      const assignment = await tx.assignment.findFirst({ where: { id: assignmentId, studyUnit: this.unitScope(auth, 'homework.manage') } });
      if (!assignment) throw AppError.notFound('Vazifa');
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: auth.tenantId }, select: { timezone: true } });
      const today = parseDateOnly(todayIn(tenant.timezone));
      const members = await tx.enrollment.findMany({
        where: { studyUnitId: assignment.studyUnitId, OR: [{ endDate: null }, { endDate: { gt: today } }] },
        select: { studentId: true, student: { select: { number: true, photoFileId: true, client: { select: { fullName: true } } } } },
      });
      const subs = await tx.submission.findMany({ where: { assignmentId }, include: { file: true } });
      const byStudent = new Map(subs.map((s) => [s.studentId, s]));
      // Guruhdan chiqqan bo'lsa ham topshirgan javobi ko'rinadi
      const ids = [...new Set([...members.map((m) => m.studentId), ...subs.map((s) => s.studentId)])];
      const students = await tx.student.findMany({ where: { id: { in: ids } }, select: { id: true, number: true, photoFileId: true, client: { select: { fullName: true } } } });
      return {
        assignment: { id: assignment.id, title: assignment.title, max_score: assignment.maxScore, due_date: toDateOnly(assignment.dueDate) },
        rows: students
          .map((st) => {
            const s = byStudent.get(st.id);
            return {
              student: { id: st.id, number: st.number, full_name: st.client.fullName, photo_url: this.files.url(auth.tenantId, st.photoFileId) },
              submission: s ? { id: s.id, text: s.text, file: this.fileView(auth.tenantId, s.file), submitted_at: s.submittedAt, score: s.score, feedback: s.feedback, graded_at: s.gradedAt } : null,
            };
          })
          .sort((a, b) => Number(Boolean(b.submission)) - Number(Boolean(a.submission)) || a.student.full_name.localeCompare(b.student.full_name)),
      };
    });
  }

  grade(submissionId: string, dto: GradeDto) {
    const auth = RequestContextStore.auth();
    return this.db.tx(async (tx) => {
      const submission = await tx.submission.findFirst({ where: { id: submissionId, assignment: { studyUnit: this.unitScope(auth, 'homework.manage') } }, include: { assignment: { select: { title: true, maxScore: true } } } });
      if (!submission) throw AppError.notFound('Javob');
      if (dto.score > submission.assignment.maxScore) throw AppError.field('score', 'TOO_HIGH', `Baho ${submission.assignment.maxScore} dan oshmasligi kerak`);
      await tx.submission.update({ where: { id: submissionId }, data: { score: dto.score, feedback: dto.feedback ?? null, gradedBy: auth.userId, gradedAt: new Date() } });
      // Baho uchun coin bonusi (bir vazifa uchun bir marta; qayta baholash coinni ko'paytirmaydi)
      await awardCoins(tx, auth.tenantId, submission.studentId, 'homework_grade', submission.assignmentId, gradeBonus(dto.score, submission.assignment.maxScore));
      await this.audit.write(tx, auth.tenantId, { action: 'submission.graded', entityType: 'student', entityId: submission.studentId, newValue: { title: submission.assignment.title, score: dto.score } });
      return { score: dto.score };
    });
  }
}

@Controller()
export class LmsController {
  constructor(private readonly lms: LmsService) {}

  @RequirePermission('material.manage')
  @Get('study-units/:id/materials')
  listMaterials(@Param('id', ParseUUIDPipe) id: string, @Query('lesson_id', new ParseUUIDPipe({ optional: true })) lessonId?: string) {
    return this.lms.listMaterials(id, lessonId);
  }

  @RequirePermission('material.manage')
  @Post('study-units/:id/materials')
  @UseInterceptors(documentUpload())
  createMaterial(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MaterialDto, @UploadedFile() file?: Express.Multer.File) {
    return this.lms.createMaterial(id, dto, file);
  }

  @RequirePermission('material.manage')
  @Delete('materials/:id')
  @HttpCode(204)
  removeMaterial(@Param('id', ParseUUIDPipe) id: string) {
    return this.lms.removeMaterial(id);
  }

  @RequirePermission('homework.manage')
  @Get('study-units/:id/assignments')
  listAssignments(@Param('id', ParseUUIDPipe) id: string, @Query('lesson_id', new ParseUUIDPipe({ optional: true })) lessonId?: string) {
    return this.lms.listAssignments(id, lessonId);
  }

  @RequirePermission('homework.manage')
  @Post('study-units/:id/assignments')
  @UseInterceptors(documentUpload())
  createAssignment(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignmentDto, @UploadedFile() file?: Express.Multer.File) {
    return this.lms.createAssignment(id, dto, file);
  }

  @RequirePermission('homework.manage')
  @Delete('assignments/:id')
  @HttpCode(204)
  removeAssignment(@Param('id', ParseUUIDPipe) id: string) {
    return this.lms.removeAssignment(id);
  }

  @RequirePermission('homework.manage')
  @Get('study-units/:id/questions')
  listQuestions(@Param('id', ParseUUIDPipe) id: string) {
    return this.lms.listQuestions(id);
  }

  @RequirePermission('homework.manage')
  @Post('study-units/:id/questions')
  createQuestion(@Param('id', ParseUUIDPipe) id: string, @Body() dto: QuestionDto) {
    return this.lms.createQuestion(id, dto);
  }

  @RequirePermission('homework.manage')
  @Delete('questions/:id')
  @HttpCode(204)
  deleteQuestion(@Param('id', ParseUUIDPipe) id: string) {
    return this.lms.deleteQuestion(id);
  }

  @RequirePermission('homework.manage')
  @Get('study-units/:id/homework-matrix')
  homeworkMatrix(@Param('id', ParseUUIDPipe) id: string) {
    return this.lms.homeworkMatrix(id);
  }

  @RequirePermission('study_unit.view')
  @Get('teaching/students')
  teachingStudents(@Query('q') q?: string) {
    return this.lms.teachingStudents(q?.trim().slice(0, 100) || undefined);
  }

  @RequirePermission('study_unit.view')
  @Get('teaching/students/:id')
  teachingStudent(@Param('id', ParseUUIDPipe) id: string) {
    return this.lms.teachingStudent(id);
  }

  @RequirePermission('homework.manage')
  @Get('assignments/to-review')
  toReview() {
    return this.lms.toReview();
  }

  @RequirePermission('homework.manage')
  @Get('assignments/:id/submissions')
  submissions(@Param('id', ParseUUIDPipe) id: string) {
    return this.lms.submissions(id);
  }

  @RequirePermission('homework.manage')
  @Put('submissions/:id/grade')
  grade(@Param('id', ParseUUIDPipe) id: string, @Body() dto: GradeDto) {
    return this.lms.grade(id, dto);
  }
}

@Module({ controllers: [LmsController], providers: [LmsService], exports: [LmsService] })
export class LmsModule {}
