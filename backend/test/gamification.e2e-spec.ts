import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { api, createApp, createTenant, Fixture, login, nextPhone, owner, tokenFor } from './helpers';

const DAY = 86_400_000;
const iso = (offsetDays: number): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date(Date.now() + offsetDays * DAY));

describe('coins, quiz and homework matrix (e2e)', () => {
  let app: INestApplication;
  let fx: Fixture;
  let ownerToken: string;
  let teacherToken: string;
  let unitId: string;
  let foreignUnitId: string;

  const upload = (path: string, auth: string, fields: Record<string, string>) => {
    let req = request(app.getHttpServer()).post(`/api/v1${path}`).set('Authorization', `Bearer ${auth}`);
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    return req;
  };
  const pupil = async (name: string, unit: string) => {
    const id = (await api(app, ownerToken).post('/students', { full_name: name, branch_id: fx.branches.a, phone: nextPhone() })).body.data.id as string;
    await api(app, ownerToken).post(`/study-units/${unit}/members`, { student_id: id, start_date: iso(-2) });
    const creds = (await api(app, ownerToken).post(`/students/${id}/portal`, { password: 'parol-123' })).body.data as { login: string };
    return { id, token: (await login(app, fx, creds.login, 'parol-123')).body.data.access_token as string };
  };
  const balance = async (token: string): Promise<number> => (await api(app, token).get('/portal/coins')).body.data.balance as number;
  const submissionId = async (assignment: string, studentId: string): Promise<string> =>
    ((await api(app, teacherToken).get(`/assignments/${assignment}/submissions`)).body.data.rows as { student: { id: string }; submission: { id: string } | null }[]).find((r) => r.student.id === studentId)!.submission!.id;
  const question = { text: 'Python da ro\'yxat qaysi qavs bilan yoziladi?', options: ['()', '[]', '{}'], correct_index: 1, explanation: "Ro'yxat (list) kvadrat qavs bilan yoziladi", coins: 7 };

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
  });

  afterAll(async () => {
    await app.close();
    await owner.$disconnect();
  });

  describe('coins for homework', () => {
    it('gives +10 on time, +5 late, once per assignment, and a grade bonus once', async () => {
      const s = await pupil('Coin Oquvchi', unitId);
      expect(await balance(s.token)).toBe(0);
      const onTime = (await upload(`/study-units/${unitId}/assignments`, teacherToken, { title: 'Vaqtida', max_score: '10', due_date: iso(3) })).body.data.id as string;
      const late = (await upload(`/study-units/${unitId}/assignments`, teacherToken, { title: 'Kechikkan', max_score: '10', due_date: iso(-1) })).body.data.id as string;

      expect((await upload(`/portal/assignments/${onTime}/submission`, s.token, { text: 'javob' })).status).toBe(204);
      expect(await balance(s.token)).toBe(10);
      expect((await upload(`/portal/assignments/${onTime}/submission`, s.token, { text: 'yangilangan javob' })).status).toBe(204);
      expect(await balance(s.token)).toBe(10); // qayta topshirish ko'paytirmaydi
      expect((await upload(`/portal/assignments/${late}/submission`, s.token, { text: 'kech' })).status).toBe(204);
      expect(await balance(s.token)).toBe(15);

      // Baho: 8/10 → 16 coin bonus; qayta baholash (9/10) qo'shimcha bermaydi
      const sub = await submissionId(onTime, s.id);
      expect((await api(app, teacherToken).put(`/submissions/${sub}/grade`, { score: 8 })).status).toBe(200);
      expect(await balance(s.token)).toBe(31);
      expect((await api(app, teacherToken).put(`/submissions/${sub}/grade`, { score: 9 })).status).toBe(200);
      expect(await balance(s.token)).toBe(31);

      const coins = (await api(app, s.token).get('/portal/coins')).body.data as { history: { reason: string; amount: number; label: string }[]; me: { place: number } };
      expect(coins.history.map((h) => h.reason).sort()).toEqual(['homework_grade', 'homework_submit', 'homework_submit']);
      expect(coins.me.place).toBe(1);
    });

    it('cannot be farmed: a rejected or foreign submission earns nothing', async () => {
      const s = await pupil('Farm Oquvchi', unitId);
      const foreign = (await upload(`/study-units/${foreignUnitId}/assignments`, ownerToken, { title: 'Begona', max_score: '10' })).body.data.id as string;
      expect((await upload(`/portal/assignments/${foreign}/submission`, s.token, { text: 'hujum' })).status).toBe(404);
      const own = (await upload(`/study-units/${unitId}/assignments`, teacherToken, { title: 'Bo\'sh', max_score: '10' })).body.data.id as string;
      expect((await upload(`/portal/assignments/${own}/submission`, s.token, {})).status).toBe(400);
      expect(await balance(s.token)).toBe(0);
    });
  });

  describe('quiz questions', () => {
    it('lets the teacher add questions to own group only, with validation', async () => {
      const t = api(app, teacherToken);
      expect((await t.post(`/study-units/${unitId}/questions`, question)).status).toBe(201);
      expect((await t.post(`/study-units/${unitId}/questions`, { ...question, correct_index: 3 })).status).toBe(400);
      expect((await t.post(`/study-units/${unitId}/questions`, { ...question, options: ['a'] })).status).toBe(400);
      expect((await t.post(`/study-units/${unitId}/questions`, { ...question, options: ['a', 'A'], correct_index: 0 })).status).toBe(400);
      expect((await t.post(`/study-units/${unitId}/questions`, { ...question, coins: 999 })).status).toBe(400);
      expect((await t.post(`/study-units/${foreignUnitId}/questions`, question)).status).toBe(404);
      expect((await t.get(`/study-units/${foreignUnitId}/questions`)).status).toBe(404);
      const list = (await t.get(`/study-units/${unitId}/questions`)).body.data as { correct_index: number }[];
      expect(list.length).toBeGreaterThan(0);
      expect(list[0]!.correct_index).toBe(1);
    });

    it('shows students only own-group questions without the answer, awards coins once, and blocks cheating', async () => {
      const foreignQ = (await api(app, ownerToken).post(`/study-units/${foreignUnitId}/questions`, question)).body.data.id as string;
      const s = await pupil('Quiz Oquvchi', unitId);
      const quiz = (await api(app, s.token).get('/portal/quiz')).body.data as { questions: Record<string, unknown>[] };
      expect(quiz.questions.length).toBeGreaterThan(0);
      for (const q of quiz.questions) {
        expect(q).not.toHaveProperty('correct_index');
        expect(q).not.toHaveProperty('explanation');
        expect(q.id).not.toBe(foreignQ);
      }
      const qid = quiz.questions[0]!.id as string;
      // Noto'g'ri javob: coin yo'q; ikkinchi urinish mumkin emas
      const wrong = await api(app, s.token).post(`/portal/quiz/${qid}/answer`, { choice: 0 });
      expect(wrong.status).toBe(200);
      expect(wrong.body.data).toMatchObject({ correct: false, coins_earned: 0, correct_index: 1 });
      expect((await api(app, s.token).post(`/portal/quiz/${qid}/answer`, { choice: 1 })).status).toBe(409);
      expect(await balance(s.token)).toBe(0);
      // To'g'ri javob: coin beriladi
      const second = (await api(app, ownerToken).post(`/study-units/${unitId}/questions`, { ...question, text: 'Ikkinchi savol: list uzunligi?' })).body.data.id as string;
      const right = await api(app, s.token).post(`/portal/quiz/${second}/answer`, { choice: 1 });
      expect(right.body.data).toMatchObject({ correct: true, coins_earned: 7, balance: 7 });
      expect((await api(app, s.token).post(`/portal/quiz/${second}/answer`, { choice: 1 })).status).toBe(409);
      expect(await balance(s.token)).toBe(7);
      // Begona guruh savoliga javob berib bo'lmaydi, variant chegaradan chiqmaydi
      expect((await api(app, s.token).post(`/portal/quiz/${foreignQ}/answer`, { choice: 1 })).status).toBe(404);
      expect((await api(app, s.token).post(`/portal/quiz/${qid}/answer`, { choice: 9 })).status).toBe(400);
    });

    it('is closed to students for management and to teachers for foreign questions', async () => {
      const s = await pupil('Yopiq Quiz', unitId);
      const foreignQ = (await api(app, ownerToken).post(`/study-units/${foreignUnitId}/questions`, question)).body.data.id as string;
      const st = api(app, s.token);
      expect((await st.post(`/study-units/${unitId}/questions`, question)).status).toBe(403);
      expect((await st.get(`/study-units/${unitId}/questions`)).status).toBe(403);
      expect((await st.delete(`/questions/${foreignQ}`)).status).toBe(403);
      expect((await api(app, teacherToken).delete(`/questions/${foreignQ}`)).status).toBe(404);
      expect((await api(app, ownerToken).delete(`/questions/${foreignQ}`)).status).toBe(204);
      expect((await api(app, teacherToken).get('/portal/coins')).status).toBe(403);
      expect((await request(app.getHttpServer()).get('/api/v1/portal/quiz')).status).toBe(401);
    });
  });

  describe('leaderboard', () => {
    it('lists only classmates with shortened names, ordered by coins', async () => {
      const a = await pupil('Aliyev Vali', unitId);
      const b = await pupil('Karimova Zilola', unitId);
      const outsider = await pupil('Tashqi Oquvchi', foreignUnitId);
      const hw = (await upload(`/study-units/${unitId}/assignments`, teacherToken, { title: 'Reyting', max_score: '10', due_date: iso(5) })).body.data.id as string;
      await upload(`/portal/assignments/${hw}/submission`, a.token, { text: 'a' });
      const board = (await api(app, b.token).get('/portal/coins')).body.data.leaderboard as { name: string; coins: number; me: boolean }[];
      expect(board.map((r) => r.name)).toEqual(expect.arrayContaining(['Aliyev V.', 'Karimova Z.']));
      expect(board.some((r) => r.name.startsWith('Tashqi'))).toBe(false);
      expect(board.find((r) => r.name === 'Karimova Z.')?.me).toBe(true);
      expect(board[0]!.coins).toBeGreaterThanOrEqual(board[board.length - 1]!.coins);
      expect(outsider.id).toBeTruthy();
    });
  });

  describe('who did the homework (matrix)', () => {
    it('shows done / missing / graded per student, only for own groups', async () => {
      const done = await pupil('Matritsa Bajardi', unitId);
      const skipped = await pupil('Matritsa Bajarmadi', unitId);
      const hw = (await upload(`/study-units/${unitId}/assignments`, teacherToken, { title: 'Matritsa vazifasi', max_score: '10', due_date: iso(-1) })).body.data.id as string;
      await upload(`/portal/assignments/${hw}/submission`, done.token, { text: 'javob' });
      const t = api(app, teacherToken);
      const m = (await t.get(`/study-units/${unitId}/homework-matrix`)).body.data as { assignments: { id: string }[]; students: { id: string; cells: { assignment_id: string; status: string }[] }[] };
      const status = (studentId: string): string => m.students.find((s) => s.id === studentId)!.cells.find((c) => c.assignment_id === hw)!.status;
      expect(status(done.id)).toBe('late');
      expect(status(skipped.id)).toBe('missed');
      await t.put(`/submissions/${await submissionId(hw, done.id)}/grade`, { score: 9 });
      const after = (await t.get(`/study-units/${unitId}/homework-matrix`)).body.data as typeof m;
      expect(after.students.find((s) => s.id === done.id)!.cells.find((c) => c.assignment_id === hw)).toMatchObject({ status: 'graded', score: 9 });
      expect((await t.get(`/study-units/${foreignUnitId}/homework-matrix`)).status).toBe(404);
      expect((await api(app, done.token).get(`/study-units/${unitId}/homework-matrix`)).status).toBe(403);
    });
  });
});
