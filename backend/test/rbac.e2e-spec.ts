import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { api, createApp, createTenant, Fixture, login, nextPhone, owner, PASSWORD, tokenFor } from './helpers';

const DAY = 86_400_000;
const iso = (offsetDays: number): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date(Date.now() + offsetDays * DAY));
const PDF = Buffer.from('%PDF-1.4\n% rbac\n');

/**
 * Rollar o'rtasidagi chegaralar (RBAC audit). Har bir tekshiruv HTTP orqali — frontend'ga tayanilmaydi:
 *  - xodim boshqa (kuchliroq) xodim akkauntini egallay olmaydi;
 *  - o'qituvchi faqat o'z guruhining vazifa/material/javoblari bilan ishlaydi (id almashtirib bo'lmaydi);
 *  - o'quvchi faqat o'zining ma'lumotini ko'radi va himoyalangan maydonlarni o'zgartira olmaydi;
 *  - administrator (reception) boshqaruv/rol/sozlamalarga kira olmaydi.
 */
describe('role boundaries (e2e)', () => {
  let app: INestApplication;
  let fx: Fixture;
  let ownerToken: string;
  let teacherToken: string;
  let managerToken: string;
  let adminToken: string;
  let salesToken: string;
  let unitId: string; // o'qituvchining guruhi (A filial)
  let foreignUnitId: string; // boshqa o'qituvchining guruhi (A filial)
  let branchBUnitId: string; // B filialdagi guruh

  const upload = (path: string, auth: string, fields: Record<string, string>, file?: { content: Buffer; name: string }) => {
    let req = request(app.getHttpServer()).post(`/api/v1${path}`).set('Authorization', `Bearer ${auth}`);
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    return file ? req.attach('file', file.content, file.name) : req;
  };

  /** Guruhga a'zo o'quvchi va unga ochilgan kabinet tokeni */
  const student = async (name: string, unit: string, branch = fx.branches.a) => {
    const id = (await api(app, ownerToken).post('/students', { full_name: name, branch_id: branch, phone: nextPhone() })).body.data.id as string;
    await api(app, ownerToken).post(`/study-units/${unit}/members`, { student_id: id, start_date: iso(-2) });
    const creds = (await api(app, ownerToken).post(`/students/${id}/portal`, { password: 'parol-123' })).body.data as { login: string };
    return { id, token: (await login(app, fx, creds.login, 'parol-123')).body.data.access_token as string };
  };

  const createEmployee = async (role: string, branches: string[], name = 'Xodim') => {
    const phone = nextPhone();
    const res = await api(app, ownerToken).post('/employees', { full_name: name, phone, password: PASSWORD, role_ids: [fx.roles[role]], branch_ids: branches });
    expect(res.status).toBe(201);
    return { id: res.body.data.id as string, phone };
  };

  beforeAll(async () => {
    app = await createApp();
    fx = await createTenant();
    ownerToken = await tokenFor(app, fx, 'owner');
    teacherToken = await tokenFor(app, fx, 'teacher');
    managerToken = await tokenFor(app, fx, 'managerA');
    adminToken = await tokenFor(app, fx, 'admin');
    salesToken = await tokenFor(app, fx, 'sales');
    const discipline = (await api(app, ownerToken).post('/dictionaries', { kind: 'discipline', name: 'Python' })).body.data.id;
    const schedule = (start: string) => ({ days: [1, 2, 3, 4, 5, 6, 7], start_time: start, end_time: `${String(Number(start.slice(0, 2)) + 1).padStart(2, '0')}:00`, period_start: iso(-3), period_end: iso(30) });
    const unit = async (name: string, branch: string, teacher: string, start: string) =>
      (await api(app, ownerToken).post('/study-units', { name, branch_id: branch, discipline_id: discipline, teacher_id: teacher, capacity: 10, price_amount: 1_000_000, schedule: schedule(start) })).body.data.id as string;
    unitId = await unit('Python 1', fx.branches.a, fx.users.teacher.id, '09:00');
    foreignUnitId = await unit('Python 2', fx.branches.a, fx.users.owner.id, '11:00');
    branchBUnitId = await unit('Python B', fx.branches.b, fx.users.owner.id, '13:00');
  });

  afterAll(async () => {
    await app.close();
    await owner.$disconnect();
  });

  describe('staff accounts', () => {
    it('does not let a manager take over, demote or lock out a more privileged colleague', async () => {
      const accountant = await createEmployee('accountant', [fx.branches.a], 'Buxgalter');
      const mgr = api(app, managerToken);
      // Buxgalterda menejerda yo'q ruxsatlar bor (payroll.pay) — parolni almashtirib kira olmasligi kerak
      expect((await mgr.patch(`/employees/${accountant.id}`, { password: 'hacked-password-1' })).status).toBe(403);
      expect((await mgr.patch(`/employees/${accountant.id}`, { phone: nextPhone() })).status).toBe(403);
      expect((await mgr.patch(`/employees/${accountant.id}`, { role_ids: [fx.roles.teacher] })).status).toBe(403);
      expect((await mgr.post(`/employees/${accountant.id}/deactivate`)).status).toBe(403);
      // Parol o'zgarmagan — eskisi bilan kirish mumkin
      expect((await login(app, fx, accountant.phone)).status).toBe(200);
      expect((await login(app, fx, accountant.phone, 'hacked-password-1')).status).toBe(401);
    });

    it('still lets a manager manage staff whose permissions they fully cover', async () => {
      const teacher = await createEmployee('teacher', [fx.branches.a], 'O\'qituvchi 2');
      const mgr = api(app, managerToken);
      expect((await mgr.patch(`/employees/${teacher.id}`, { full_name: 'Yangi Ism' })).status).toBe(200);
      expect((await mgr.patch(`/employees/${teacher.id}`, { password: 'new-password-123' })).status).toBe(200);
      expect((await login(app, fx, teacher.phone, 'new-password-123')).status).toBe(200);
      expect((await mgr.post(`/employees/${teacher.id}/deactivate`)).status).toBe(200);
      expect((await mgr.post(`/employees/${teacher.id}/activate`)).status).toBe(200);
    });

    it('lets the owner manage everyone', async () => {
      const accountant = await createEmployee('accountant', [fx.branches.a], 'Buxgalter 2');
      expect((await api(app, ownerToken).patch(`/employees/${accountant.id}`, { full_name: 'Buxgalter Yangi' })).status).toBe(200);
    });

    it('keeps reception (administrator) away from staff, roles and settings', async () => {
      const a = api(app, adminToken);
      expect((await a.get('/employees')).status).toBe(403);
      expect((await a.post('/employees', { full_name: 'X Y', phone: nextPhone(), password: PASSWORD, role_ids: [fx.roles.teacher], branch_ids: [fx.branches.a] })).status).toBe(403);
      expect((await a.patch(`/employees/${fx.users.sales.id}`, { password: 'hacked-password-1' })).status).toBe(403);
      expect((await a.get('/roles/' + fx.roles.owner)).status).toBe(403);
      expect((await a.get('/permissions')).status).toBe(403);
      expect((await a.put(`/roles/${fx.roles.administrator}/permissions`, { permissions: [{ code: 'settings.manage', scope: 'all' }] })).status).toBe(403);
      expect((await a.post('/dictionaries', { kind: 'discipline', name: 'Nope' })).status).toBe(403);
      expect((await a.post('/branches', { name: 'Nope', code: 'NO' })).status).toBe(403);
      expect((await a.get('/finance/summary')).status).toBe(403);
      // Reception hech qanday vazifa/material boshqaruviga ega emas
      expect((await a.get(`/study-units/${unitId}/assignments`)).status).toBe(403);
      expect((await a.get(`/study-units/${unitId}/materials`)).status).toBe(403);
    });

    it('limits reception to their own branch when opening a student portal', async () => {
      const own = (await api(app, ownerToken).post('/students', { full_name: 'A Filial', branch_id: fx.branches.a, phone: nextPhone() })).body.data.id;
      const other = (await api(app, ownerToken).post('/students', { full_name: 'B Filial', branch_id: fx.branches.b, phone: nextPhone() })).body.data.id;
      const a = api(app, adminToken);
      expect((await a.post(`/students/${own}/portal`, {})).status).toBe(200);
      expect((await a.post(`/students/${other}/portal`, {})).status).toBe(404);
      expect((await a.get(`/students/${other}`)).status).toBe(404);
    });

    it('never grants the sales manager staff or learning management', async () => {
      const s = api(app, salesToken);
      expect((await s.get('/employees')).status).toBe(403);
      expect((await s.get(`/study-units/${unitId}/assignments`)).status).toBe(403);
      expect((await s.put('/submissions/00000000-0000-4000-8000-000000000000/grade', { score: 5 })).status).toBe(403);
    });
  });

  describe('teacher', () => {
    it('cannot see or change another teacher\'s group, homework, materials or submissions (by id)', async () => {
      // Begona guruhda vazifa, material va javob yaratamiz (owner nomidan)
      const assignment = (await upload(`/study-units/${foreignUnitId}/assignments`, ownerToken, { title: 'Begona vazifa', max_score: '10' })).body.data.id as string;
      const material = (await upload(`/study-units/${foreignUnitId}/materials`, ownerToken, { title: 'Begona material', link: 'https://example.com/x' })).body.data.id as string;
      const pupil = await student('Begona Oquvchi', foreignUnitId);
      expect((await upload(`/portal/assignments/${assignment}/submission`, pupil.token, { text: 'javob' })).status).toBe(204);
      const submissionId = ((await api(app, ownerToken).get(`/assignments/${assignment}/submissions`)).body.data.rows as { submission: { id: string } | null }[]).find((r) => r.submission)!.submission!.id;

      const t = api(app, teacherToken);
      expect((await t.get(`/study-units/${foreignUnitId}`)).status).toBe(404);
      expect((await t.get(`/study-units/${foreignUnitId}/assignments`)).status).toBe(404);
      expect((await t.get(`/study-units/${foreignUnitId}/materials`)).status).toBe(404);
      expect((await upload(`/study-units/${foreignUnitId}/assignments`, teacherToken, { title: 'Hujum' })).status).toBe(404);
      expect((await t.get(`/assignments/${assignment}/submissions`)).status).toBe(404);
      expect((await t.put(`/submissions/${submissionId}/grade`, { score: 10, feedback: 'ruxsatsiz' })).status).toBe(404);
      expect((await t.delete(`/assignments/${assignment}`)).status).toBe(404);
      expect((await t.delete(`/materials/${material}`)).status).toBe(404);
      // Baho o'zgarmagan
      const row = ((await api(app, ownerToken).get(`/assignments/${assignment}/submissions`)).body.data.rows as { submission: { score: number | null } | null }[]).find((r) => r.submission)!;
      expect(row.submission!.score).toBeNull();
    });

    it('cannot reach other groups\' lessons, attendance or students, or any other branch', async () => {
      const t = api(app, teacherToken);
      const visible = (await t.get(`/lessons?from=${iso(-1)}&to=${iso(1)}`)).body.data as { study_unit: { id: string } }[];
      expect(visible.length).toBeGreaterThan(0);
      expect(visible.every((l) => l.study_unit.id === unitId)).toBe(true);
      const foreignLessons = (await api(app, ownerToken).get(`/lessons?from=${iso(-1)}&to=${iso(1)}&study_unit_id=${foreignUnitId}`)).body.data as { id: string }[];
      expect(foreignLessons.length).toBeGreaterThan(0);
      const foreignLesson = foreignLessons[0]!.id;
      expect((await t.get(`/lessons/${foreignLesson}/attendance`)).status).toBe(404);
      expect((await t.put(`/lessons/${foreignLesson}/attendance`, { entries: [] })).status).toBe(404);
      expect((await t.post(`/lessons/${foreignLesson}/cancel`, { reason: 'x' })).status).toBe(403);
      expect((await t.get(`/study-units/${branchBUnitId}`)).status).toBe(404);
      expect((await t.get('/students')).body.data).toEqual([]); // o'qituvchi sotuv egasi emas: mijozlar bazasi ko'rinmaydi
    });

    it('has no access to money, sales, staff or settings, and the dashboard hides them', async () => {
      const t = api(app, teacherToken);
      for (const url of ['/finance/summary', '/finance/balances', '/payments', '/leads', '/employees', '/roles', '/permissions', '/messaging/log']) {
        expect([url, (await t.get(url)).status]).toEqual([url, 403]);
      }
      expect((await t.post('/payments', {})).status).toBe(403);
      expect((await t.post('/branches', { name: 'N', code: 'N' })).status).toBe(403);
      const summary = (await t.get('/dashboard/summary')).body.data;
      expect(summary.revenue ?? null).toBeNull();
      expect(summary.employees ?? null).toBeNull();
      expect(summary.company ?? null).toBeNull();
    });

    it('keeps working for their own group (legitimate access is not broken)', async () => {
      const t = api(app, teacherToken);
      expect((await t.get(`/study-units/${unitId}`)).status).toBe(200);
      const created = await upload(`/study-units/${unitId}/assignments`, teacherToken, { title: 'Oz vazifam', max_score: '10', due_date: iso(3) }, { content: PDF, name: 'v.pdf' });
      expect(created.status).toBe(201);
      expect((await t.get(`/study-units/${unitId}/assignments`)).status).toBe(200);
      expect((await upload(`/study-units/${unitId}/materials`, teacherToken, { title: 'Oz materialim', link: 'https://example.com/m' })).status).toBe(201);
    });
  });

  describe('teacher panel additions', () => {
    it('lists only own ungraded submissions in to-review, and keeps it closed to students and reception', async () => {
      const mine = (await upload(`/study-units/${unitId}/assignments`, teacherToken, { title: 'Tekshiruv uchun', max_score: '10' })).body.data.id as string;
      const foreign = (await upload(`/study-units/${foreignUnitId}/assignments`, ownerToken, { title: 'Begona tekshiruv', max_score: '10' })).body.data.id as string;
      const own = await student('Tekshiruv Oquvchi', unitId);
      const other = await student('Begona Tekshiruv', foreignUnitId);
      expect((await upload(`/portal/assignments/${mine}/submission`, own.token, { text: 'javob' })).status).toBe(204);
      expect((await upload(`/portal/assignments/${foreign}/submission`, other.token, { text: 'javob' })).status).toBe(204);

      const res = (await api(app, teacherToken).get('/assignments/to-review')).body.data as { total: number; items: { assignment_id: string; pending: number; study_unit: { id: string } }[] };
      expect(res.items.some((i) => i.assignment_id === mine && i.pending === 1)).toBe(true);
      expect(res.items.some((i) => i.assignment_id === foreign)).toBe(false);
      expect(res.items.every((i) => i.study_unit.id === unitId)).toBe(true);
      // Baholangach ro'yxatdan chiqadi
      const rows = (await api(app, teacherToken).get(`/assignments/${mine}/submissions`)).body.data.rows as { student: { id: string }; submission: { id: string } | null }[];
      const sub = rows.find((r) => r.student.id === own.id)!.submission!.id;
      expect((await api(app, teacherToken).put(`/submissions/${sub}/grade`, { score: 8 })).status).toBe(200);
      const after = (await api(app, teacherToken).get('/assignments/to-review')).body.data as typeof res;
      expect(after.items.some((i) => i.assignment_id === mine)).toBe(false);

      expect((await api(app, own.token).get('/assignments/to-review')).status).toBe(403);
      expect((await api(app, adminToken).get('/assignments/to-review')).status).toBe(403);
      expect((await api(app, salesToken).get('/assignments/to-review')).status).toBe(403);
    });

    it('lets staff change their own password only with the current one, and ends old sessions', async () => {
      const t = await createEmployee('teacher', [fx.branches.a], 'Parol Oqituvchi');
      const first = (await login(app, fx, t.phone)).body.data as { access_token: string; refresh_token: string };
      const a = api(app, first.access_token);
      expect((await a.post('/auth/password', { current_password: 'notogri-parol-1', new_password: 'yangi-parol-12345' })).status).toBe(400);
      expect((await a.post('/auth/password', { current_password: PASSWORD, new_password: PASSWORD })).status).toBe(400);
      expect((await a.post('/auth/password', { current_password: PASSWORD, new_password: 'qisqa' })).status).toBe(400);
      expect((await a.post('/auth/password', { current_password: PASSWORD, new_password: 'yangi-parol-12345' })).status).toBe(204);
      expect((await login(app, fx, t.phone, PASSWORD)).status).toBe(401);
      expect((await login(app, fx, t.phone, 'yangi-parol-12345')).status).toBe(200);
      // Eski sessiya (refresh token) endi ishlamaydi
      expect((await request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refresh_token: first.refresh_token })).status).toBe(401);
      // O'quvchi kabineti foydalanuvchisi bu endpointdan foydalana olmaydi (u uchun portal/password)
      const pupil = await student('Parol Oquvchi', unitId);
      expect((await api(app, pupil.token).post('/auth/password', { current_password: 'parol-123', new_password: 'yangi-parol-12345' })).status).toBe(403);
    });
  });

  describe('student', () => {
    it('sees only own groups\' homework and own submission/grade, never classmates\' or other groups\'', async () => {
      const assignment = (await upload(`/study-units/${unitId}/assignments`, teacherToken, { title: 'Umumiy vazifa', max_score: '10', due_date: iso(2) })).body.data.id as string;
      const foreignAssignment = (await upload(`/study-units/${foreignUnitId}/assignments`, ownerToken, { title: 'Boshqa guruh vazifasi' })).body.data.id as string;
      const a = await student('Oquvchi A', unitId);
      const b = await student('Oquvchi B', unitId);

      expect((await upload(`/portal/assignments/${assignment}/submission`, a.token, { text: 'A javobi' })).status).toBe(204);
      expect((await upload(`/portal/assignments/${assignment}/submission`, b.token, { text: 'B javobi' })).status).toBe(204);
      const rows = (await api(app, teacherToken).get(`/assignments/${assignment}/submissions`)).body.data.rows as { student: { id: string }; submission: { id: string } | null }[];
      const aSubmission = rows.find((r) => r.student.id === a.id)!.submission!.id;
      expect((await api(app, teacherToken).put(`/submissions/${aSubmission}/grade`, { score: 9, feedback: 'Yaxshi' })).status).toBe(200);

      const mineA = (await api(app, a.token).get('/portal/assignments')).body.data as { id: string; submission: { text: string; score: number | null; feedback: string | null } | null }[];
      expect(mineA.map((x) => x.id)).toContain(assignment);
      expect(mineA.map((x) => x.id)).not.toContain(foreignAssignment);
      expect(mineA.find((x) => x.id === assignment)!.submission).toMatchObject({ text: 'A javobi', score: 9, feedback: 'Yaxshi' });
      const mineB = (await api(app, b.token).get('/portal/assignments')).body.data as typeof mineA;
      expect(mineB.find((x) => x.id === assignment)!.submission).toMatchObject({ text: 'B javobi', score: null });
      // Boshqa guruh vazifasiga javob topshirib bo'lmaydi (id almashtirish)
      expect((await upload(`/portal/assignments/${foreignAssignment}/submission`, a.token, { text: 'hujum' })).status).toBe(404);
      expect((await api(app, a.token).get(`/portal/assignments?group=${foreignUnitId}`)).body.data).toEqual([]);
    });

    it('cannot set score/feedback/student id through the submission request, or resubmit after grading', async () => {
      const assignment = (await upload(`/study-units/${unitId}/assignments`, teacherToken, { title: 'Himoya', max_score: '10' })).body.data.id as string;
      const s = await student('Himoyalangan', unitId);
      for (const extra of <Record<string, string>[]>[{ score: '10' }, { feedback: 'a\'lo' }, { student_id: fx.users.owner.id }, { graded_by: fx.users.owner.id }]) {
        expect((await upload(`/portal/assignments/${assignment}/submission`, s.token, { text: 'javob', ...extra })).status).toBe(400);
      }
      expect((await upload(`/portal/assignments/${assignment}/submission`, s.token, { text: 'haqiqiy javob' })).status).toBe(204);
      const subId = ((await api(app, teacherToken).get(`/assignments/${assignment}/submissions`)).body.data.rows as { student: { id: string }; submission: { id: string } | null }[]).find((r) => r.student.id === s.id)!.submission!.id;
      expect((await api(app, teacherToken).put(`/submissions/${subId}/grade`, { score: 7 })).status).toBe(200);
      expect((await upload(`/portal/assignments/${assignment}/submission`, s.token, { text: 'o\'zgartirish' })).status).toBe(409);
      // Maksimaldan yuqori baho rad etiladi
      expect((await api(app, teacherToken).put(`/submissions/${subId}/grade`, { score: 11 })).status).toBe(400);
    });

    it('is locked out of every staff endpoint, including homework management and grading', async () => {
      const assignment = (await upload(`/study-units/${unitId}/assignments`, teacherToken, { title: 'Yopiq', max_score: '10' })).body.data.id as string;
      const s = await student('Yopiq Oquvchi', unitId);
      const st = api(app, s.token);
      const attempts: [string, number][] = [];
      for (const url of ['/students', '/employees', '/employees/options', '/roles', '/permissions', '/finance/summary', '/payments', '/leads', '/dashboard/summary', '/branches', '/dictionaries', '/study-units', `/study-units/${unitId}`, `/study-units/${unitId}/assignments`, `/study-units/${unitId}/materials`, `/assignments/${assignment}/submissions`, '/chats', '/notifications']) {
        attempts.push([url, (await st.get(url)).status]);
      }
      expect(attempts.filter(([, status]) => status !== 403)).toEqual([]);
      expect((await st.put('/submissions/00000000-0000-4000-8000-000000000000/grade', { score: 10 })).status).toBe(403);
      expect((await st.delete(`/assignments/${assignment}`)).status).toBe(403);
      expect((await st.post(`/students/${s.id}/portal`, {})).status).toBe(403);
      expect((await st.patch(`/students/${s.id}`, { full_name: 'Hacked' })).status).toBe(403);
      expect((await st.patch(`/employees/${fx.users.owner.id}`, { password: 'hacked-password-1' })).status).toBe(403);
      expect((await st.put(`/roles/${fx.roles.student}/permissions`, { permissions: [{ code: 'settings.manage', scope: 'all' }] })).status).toBe(403);
    });

    it('cannot forge or reuse file links of other users, and signed links reject tampering', async () => {
      const a = await student('Fayl A', unitId);
      const assignment = (await upload(`/study-units/${unitId}/assignments`, teacherToken, { title: 'Fayl vazifa', max_score: '10' })).body.data.id as string;
      expect((await upload(`/portal/assignments/${assignment}/submission`, a.token, {}, { content: PDF, name: 'javob.pdf' })).status).toBe(204);
      const url = ((await api(app, a.token).get('/portal/assignments')).body.data as { id: string; submission: { file: { url: string } | null } | null }[]).find((x) => x.id === assignment)!.submission!.file!.url;
      const u = new URL(url);
      expect((await request(app.getHttpServer()).get(u.pathname + u.search)).status).toBe(200);
      // Imzoni, muddatni yoki tenantni o'zgartirish ishlamaydi
      expect((await request(app.getHttpServer()).get(`${u.pathname}?t=${u.searchParams.get('t')}&exp=${Number(u.searchParams.get('exp')) + 99999}&sig=${u.searchParams.get('sig')}`)).status).toBe(404);
      expect((await request(app.getHttpServer()).get(`${u.pathname}?t=${fx.tenantId.replace(/.$/, fx.tenantId.endsWith('0') ? '1' : '0')}&exp=${u.searchParams.get('exp')}&sig=${u.searchParams.get('sig')}`)).status).toBe(404);
      expect((await request(app.getHttpServer()).get(`${u.pathname}?t=${u.searchParams.get('t')}&exp=${u.searchParams.get('exp')}`)).status).toBe(404);
    });
  });
});
