import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { api, createApp, createTenant, Fixture, login, nextPhone, owner, tokenFor } from './helpers';

const DAY = 86_400_000;
const iso = (offsetDays: number): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date(Date.now() + offsetDays * DAY));

describe('teacher students and lesson-linked homework (e2e)', () => {
  let app: INestApplication;
  let fx: Fixture;
  let ownerToken: string;
  let teacherToken: string;
  let unitId: string;
  let foreignUnitId: string;
  let lessonId: string;
  let foreignLessonId: string;
  let mine: { id: string; token: string };
  let theirs: { id: string };

  const upload = (path: string, auth: string, fields: Record<string, string>) => {
    let req = request(app.getHttpServer()).post(`/api/v1${path}`).set('Authorization', `Bearer ${auth}`);
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    return req;
  };
  const member = async (name: string, unit: string, portal = false) => {
    const id = (await api(app, ownerToken).post('/students', { full_name: name, branch_id: fx.branches.a, phone: nextPhone() })).body.data.id as string;
    await api(app, ownerToken).post(`/study-units/${unit}/members`, { student_id: id, start_date: iso(-2) });
    if (!portal) return { id, token: '' };
    const creds = (await api(app, ownerToken).post(`/students/${id}/portal`, { password: 'parol-123' })).body.data as { login: string };
    return { id, token: (await login(app, fx, creds.login, 'parol-123')).body.data.access_token as string };
  };

  beforeAll(async () => {
    app = await createApp();
    fx = await createTenant();
    ownerToken = await tokenFor(app, fx, 'owner');
    teacherToken = await tokenFor(app, fx, 'teacher');
    const discipline = (await api(app, ownerToken).post('/dictionaries', { kind: 'discipline', name: 'Python' })).body.data.id;
    const unit = async (name: string, teacher: string, start: string) =>
      (await api(app, ownerToken).post('/study-units', { name, branch_id: fx.branches.a, discipline_id: discipline, teacher_id: teacher, capacity: 10, price_amount: 1_000_000, schedule: { days: [1, 2, 3, 4, 5, 6, 7], start_time: start, end_time: `${String(Number(start.slice(0, 2)) + 1).padStart(2, '0')}:00`, period_start: iso(-3), period_end: iso(30) } })).body.data.id as string;
    unitId = await unit('Python 1', fx.users.teacher.id, '09:00');
    foreignUnitId = await unit('Python 2', fx.users.owner.id, '11:00');
    const firstLesson = async (unit: string) => ((await api(app, ownerToken).get(`/lessons?from=${iso(-1)}&to=${iso(1)}&study_unit_id=${unit}`)).body.data as { id: string }[])[0]!.id;
    lessonId = await firstLesson(unitId);
    foreignLessonId = await firstLesson(foreignUnitId);
    mine = await member('Mening Oquvchim', unitId, true);
    theirs = await member('Begona Oquvchi', foreignUnitId);
  });

  afterAll(async () => {
    await app.close();
    await owner.$disconnect();
  });

  describe('students visible to the teacher', () => {
    it('lists only students of own groups, without money, notes or blacklist data', async () => {
      const res = await api(app, teacherToken).get('/teaching/students');
      expect(res.status).toBe(200);
      const rows = res.body.data as Record<string, unknown>[];
      expect(rows.map((r) => r.id)).toContain(mine.id);
      expect(rows.map((r) => r.id)).not.toContain(theirs.id);
      const row = rows.find((r) => r.id === mine.id)!;
      expect(row.phone).toBeNull(); // o'qituvchida student.view_contacts yo'q
      for (const key of ['balance', 'blacklisted', 'note', 'owner', 'blacklist_reason']) expect(row).not.toHaveProperty(key);
      expect(row.groups).toEqual([{ id: unitId, name: 'Python 1' }]);
      const search = (await api(app, teacherToken).get('/teaching/students?q=mening')).body.data as { id: string }[];
      expect(search.map((r) => r.id)).toEqual([mine.id]);
    });

    it('shows a student card only for own groups (id swap returns 404)', async () => {
      const t = api(app, teacherToken);
      const card = await t.get(`/teaching/students/${mine.id}`);
      expect(card.status).toBe(200);
      expect(card.body.data).toMatchObject({ id: mine.id, groups: [{ id: unitId }] });
      expect(card.body.data).not.toHaveProperty('balance');
      expect((await t.get(`/teaching/students/${theirs.id}`)).status).toBe(404);
      expect((await t.get('/teaching/students/not-a-uuid')).status).toBe(400);
    });

    it('is closed to students and unauthenticated callers, and the manager sees the whole branch', async () => {
      expect((await api(app, mine.token).get('/teaching/students')).status).toBe(403);
      expect((await request(app.getHttpServer()).get('/api/v1/teaching/students')).status).toBe(401);
      const mgr = ((await api(app, await tokenFor(app, fx, 'managerA')).get('/teaching/students')).body.data as { id: string }[]).map((r) => r.id);
      expect(mgr).toEqual(expect.arrayContaining([mine.id, theirs.id]));
    });
  });

  describe('homework and materials tied to a lesson', () => {
    it('attaches an assignment and a video link to the lesson, and filters by it', async () => {
      const t = api(app, teacherToken);
      const a = await upload(`/study-units/${unitId}/assignments`, teacherToken, { title: 'Dars uyga vazifasi', max_score: '10', lesson_id: lessonId, due_date: iso(3) });
      expect(a.status).toBe(201);
      const m = await upload(`/study-units/${unitId}/materials`, teacherToken, { title: 'Dars videosi', link: 'https://www.youtube.com/watch?v=abc123', lesson_id: lessonId });
      expect(m.status).toBe(201);
      await upload(`/study-units/${unitId}/assignments`, teacherToken, { title: 'Umumiy vazifa', max_score: '10' });

      const linked = (await t.get(`/study-units/${unitId}/assignments?lesson_id=${lessonId}`)).body.data as { title: string; lesson: { id: string } | null }[];
      expect(linked.map((x) => x.title)).toEqual(['Dars uyga vazifasi']);
      expect(linked[0]!.lesson?.id).toBe(lessonId);
      expect(((await t.get(`/study-units/${unitId}/assignments`)).body.data as unknown[]).length).toBe(2);
      expect(((await t.get(`/study-units/${unitId}/materials?lesson_id=${lessonId}`)).body.data as { title: string }[]).map((x) => x.title)).toEqual(['Dars videosi']);
      expect((await t.get(`/study-units/${unitId}/assignments?lesson_id=xyz`)).status).toBe(400);

      // O'quvchi kabinetida dars sanasi ko'rinadi
      const portal = (await api(app, mine.token).get('/portal/assignments')).body.data as { title: string; lesson: { date: string } | null }[];
      expect(portal.find((x) => x.title === 'Dars uyga vazifasi')?.lesson?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(portal.find((x) => x.title === 'Umumiy vazifa')?.lesson).toBeNull();
      const mats = (await api(app, mine.token).get('/portal/materials')).body.data as { title: string; lesson: unknown }[];
      expect(mats.find((x) => x.title === 'Dars videosi')?.lesson).toBeTruthy();
    });

    it('refuses a lesson of another group or a non-existent lesson (id swap)', async () => {
      const bad = await upload(`/study-units/${unitId}/assignments`, teacherToken, { title: 'Begona dars', lesson_id: foreignLessonId });
      expect(bad.status).toBe(400);
      expect(bad.body.error?.details?.[0]?.field ?? bad.body.details?.[0]?.field).toBe('lesson_id');
      expect((await upload(`/study-units/${unitId}/materials`, teacherToken, { title: 'Begona dars', link: 'https://example.com', lesson_id: foreignLessonId })).status).toBe(400);
      expect((await upload(`/study-units/${unitId}/assignments`, teacherToken, { title: 'Yomon', lesson_id: '00000000-0000-4000-8000-000000000000' })).status).toBe(400);
      // O'qituvchi begona guruhga umuman yoza olmaydi
      expect((await upload(`/study-units/${foreignUnitId}/assignments`, teacherToken, { title: 'Hujum', lesson_id: foreignLessonId })).status).toBe(404);
    });
  });
});
