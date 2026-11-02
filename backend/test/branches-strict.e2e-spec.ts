import { INestApplication } from '@nestjs/common';
import { api, createApp, createTenant, Fixture, login, nextPhone, owner, PASSWORD, tokenFor } from './helpers';

/** Filial qoidasi: har kim faqat o'z filialini ko'radi; filialsiz xodim hech narsa ko'rmaydi (faqat filialsiz direktor hammasini ko'radi) */
describe('strict branch scoping (e2e)', () => {
  let app: INestApplication;
  let fx: Fixture;
  let ownerToken: string;
  let studentA: string;
  let studentB: string;

  beforeAll(async () => {
    app = await createApp();
    fx = await createTenant();
    ownerToken = await tokenFor(app, fx, 'owner');
    studentA = (await api(app, ownerToken).post('/students', { full_name: 'A Filial Oquvchi', branch_id: fx.branches.a, phone: nextPhone() })).body.data.id;
    studentB = (await api(app, ownerToken).post('/students', { full_name: 'B Filial Oquvchi', branch_id: fx.branches.b, phone: nextPhone() })).body.data.id;
  });

  afterAll(async () => {
    await app.close();
    await owner.$disconnect();
  });

  it('shows each employee only their own branch, and the unassigned owner everything', async () => {
    const mgr = api(app, await tokenFor(app, fx, 'managerA'));
    const ids = ((await mgr.get('/students')).body.data as { id: string }[]).map((s) => s.id);
    expect(ids).toContain(studentA);
    expect(ids).not.toContain(studentB);
    expect((await mgr.get(`/students/${studentB}`)).status).toBe(404);
    const all = ((await api(app, ownerToken).get('/students')).body.data as { id: string }[]).map((s) => s.id);
    expect(all).toEqual(expect.arrayContaining([studentA, studentB]));
  });

  it('refuses to create or edit a non-owner employee without a branch', async () => {
    const o = api(app, ownerToken);
    const base = { full_name: 'Filialsiz', password: PASSWORD, role_ids: [fx.roles.branch_manager] };
    expect((await o.post('/employees', { ...base, phone: nextPhone() })).status).toBe(400);
    expect((await o.post('/employees', { ...base, phone: nextPhone(), branch_ids: [] })).status).toBe(400);
    const ok = await o.post('/employees', { ...base, phone: nextPhone(), branch_ids: [fx.branches.a] });
    expect(ok.status).toBe(201);
    // Filialni olib tashlash ham mumkin emas, rolni filialsiz owner'ga almashtirish faqat owner ruxsati bilan
    expect((await o.patch(`/employees/${ok.body.data.id}`, { branch_ids: [] })).status).toBe(400);
    // Direktor (owner) filialsiz yaratilishi mumkin
    expect((await o.post('/employees', { full_name: 'Yangi Direktor', phone: nextPhone(), password: PASSWORD, role_ids: [fx.roles.owner], branch_ids: [] })).status).toBe(201);
  });

  it('shows nothing to a branch-scoped user whose branch assignments were removed in the database', async () => {
    const phone = nextPhone();
    const created = await api(app, ownerToken).post('/employees', { full_name: 'Keyin Filialsiz', phone, password: PASSWORD, role_ids: [fx.roles.branch_manager], branch_ids: [fx.branches.a] });
    expect(created.status).toBe(201);
    // Eski ma'lumotlar: bazada filiali yo'q xodim (oldin "hamma filial" edi) — endi hech narsa ko'rmaydi
    await owner.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant', ${fx.tenantId}, true)`;
      expect((await tx.userBranch.deleteMany({ where: { userId: created.body.data.id as string } })).count).toBe(1);
    });
    const token = (await login(app, fx, phone)).body.data.access_token as string;
    const a = api(app, token);
    expect((await a.get('/students')).body.data).toEqual([]);
    expect((await a.get('/leads')).body.data).toEqual([]);
    expect((await a.get('/study-units')).body.data).toEqual([]);
    expect((await a.get(`/students/${studentA}`)).status).toBe(404);
    expect((await a.post('/branches', { name: 'Hujum', code: 'HJ' })).status).toBe(403);
  });
});
