import { INestApplication } from '@nestjs/common';
import { api, createApp, createTenant, Fixture, nextPhone, owner, tokenFor } from './helpers';

const HOUR = 3_600_000;

describe('lead details (e2e)', () => {
  let app: INestApplication;
  let fx: Fixture;
  let ownerToken: string;
  let teacherToken: string;
  let adminToken: string;

  const create = (extra: Record<string, unknown> = {}) =>
    api(app, ownerToken).post('/leads', { full_name: 'Aliyev Sardor', branch_id: fx.branches.a, phone: nextPhone(), ...extra });

  beforeAll(async () => {
    app = await createApp();
    fx = await createTenant();
    ownerToken = await tokenFor(app, fx, 'owner');
    teacherToken = await tokenFor(app, fx, 'teacher');
    adminToken = await tokenFor(app, fx, 'admin');
  });

  afterAll(async () => {
    await app.close();
    await owner.$disconnect();
  });

  it('stores and returns the extended questionnaire, with sensible defaults', async () => {
    const plain = await create();
    expect(plain.status).toBe(201);
    expect(plain.body.data).toMatchObject({ temperature: 'warm', guardian_name: null, birth_date: null, next_contact_at: null, trial_at: null });

    const next = new Date(Date.now() + 24 * HOUR).toISOString();
    const res = await create({ gender: 'male', birth_date: '2014-05-17', guardian_name: 'Aliyeva Nodira', guardian_relation: 'Ona', guardian_phone: nextPhone(), school: '25-maktab', preferred_time: 'evening', temperature: 'hot', next_contact_at: next, trial_at: next });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ gender: 'male', birth_date: '2014-05-17', guardian_name: 'Aliyeva Nodira', guardian_relation: 'Ona', school: '25-maktab', preferred_time: 'evening', temperature: 'hot' });
    expect(res.body.data.guardian_phone).toMatch(/^\+998/);
    const got = (await api(app, ownerToken).get(`/leads/${res.body.data.id}`)).body.data;
    expect(got.next_contact_at).toBeTruthy();
    expect(got.trial_at).toBeTruthy();
  });

  it('validates the new fields', async () => {
    expect((await create({ temperature: 'boiling' })).status).toBe(400);
    expect((await create({ preferred_time: 'midnight' })).status).toBe(400);
    expect((await create({ birth_date: '17.05.2014' })).status).toBe(400);
    expect((await create({ gender: 'x' })).status).toBe(400);
    expect((await create({ guardian_phone: '123' })).status).toBe(400);
    expect((await create({ next_contact_at: 'ertaga' })).status).toBe(400);
  });

  it('logs calls/messages/visits as their own activity and sets the next follow-up in one step', async () => {
    const id = (await create()).body.data.id as string;
    const next = new Date(Date.now() + 48 * HOUR).toISOString();
    expect((await api(app, ownerToken).post(`/leads/${id}/notes`, { text: 'Telefon ko\'tardi, ertaga qaytaramiz', kind: 'call', next_contact_at: next })).status).toBe(201);
    expect((await api(app, ownerToken).post(`/leads/${id}/notes`, { text: 'Oddiy izoh' })).status).toBe(201);
    expect((await api(app, ownerToken).post(`/leads/${id}/notes`, { text: 'x', kind: 'dance' })).status).toBe(400);
    const lead = (await api(app, ownerToken).get(`/leads/${id}`)).body.data;
    expect(lead.next_contact_at).toBeTruthy();
    expect(lead.events.map((e: { type: string }) => e.type)).toEqual(expect.arrayContaining(['call', 'note', 'created']));
    // null — eslatmani olib tashlaydi; kalit yuborilmasa — o'zgarmaydi
    await api(app, ownerToken).post(`/leads/${id}/notes`, { text: 'Qayta bog\'lanish shart emas', next_contact_at: null });
    expect((await api(app, ownerToken).get(`/leads/${id}`)).body.data.next_contact_at).toBeNull();
  });

  it('filters follow-ups (overdue / today) and temperature, ignoring closed leads', async () => {
    const past = (await create({ full_name: 'Kechikkan Lid', next_contact_at: new Date(Date.now() - 48 * HOUR).toISOString(), temperature: 'cold' })).body.data.id as string;
    const lost = (await create({ full_name: 'Yopilgan Lid', next_contact_at: new Date(Date.now() - 48 * HOUR).toISOString() })).body.data.id as string;
    await api(app, ownerToken).patch(`/leads/${lost}`, { stage: 'lost', lost_reason: 'Qiziqmadi' });
    const future = (await create({ full_name: 'Kelajak Lid', next_contact_at: new Date(Date.now() + 72 * HOUR).toISOString() })).body.data.id as string;

    const overdue = ((await api(app, ownerToken).get('/leads?follow_up=overdue')).body.data as { id: string }[]).map((l) => l.id);
    expect(overdue).toContain(past);
    expect(overdue).not.toContain(lost);
    expect(overdue).not.toContain(future);
    expect(((await api(app, ownerToken).get('/leads?follow_up=today')).body.data as { id: string }[]).map((l) => l.id)).not.toContain(past);
    expect(((await api(app, ownerToken).get('/leads?temperature=cold')).body.data as { id: string }[]).map((l) => l.id)).toEqual([past]);
    expect((await api(app, ownerToken).get('/leads?follow_up=never')).status).toBe(400);
  });

  it('carries birth date, gender and the guardian over to the student card on conversion', async () => {
    const id = (await create({ gender: 'female', birth_date: '2012-01-09', guardian_name: 'Karimov Bobur', guardian_relation: 'Ota', guardian_phone: nextPhone() })).body.data.id as string;
    const converted = await api(app, ownerToken).post(`/leads/${id}/convert`);
    expect(converted.status).toBe(200);
    const student = (await api(app, ownerToken).get(`/students/${converted.body.data.student_id}`)).body.data;
    expect(JSON.stringify(student)).toContain('2012-01-09');
    expect(JSON.stringify(student)).toContain('Karimov Bobur');
  });

  it('keeps leads closed to teachers, and reception limited to their own branch', async () => {
    const id = (await create()).body.data.id as string;
    const t = api(app, teacherToken);
    expect((await t.get('/leads?follow_up=overdue')).status).toBe(403);
    expect((await t.get(`/leads/${id}`)).status).toBe(403);
    expect((await t.post(`/leads/${id}/notes`, { text: 'hujum', kind: 'call' })).status).toBe(403);
    expect((await t.patch(`/leads/${id}`, { guardian_phone: nextPhone() })).status).toBe(403);
    // Reception (administrator) lidlar bilan ishlaydi, lekin faqat o'z filialida
    const other = (await create({ branch_id: fx.branches.b, full_name: 'B Filial Lidi' })).body.data.id as string;
    const a = api(app, adminToken);
    expect((await a.get(`/leads/${id}`)).status).toBe(200);
    expect((await a.get(`/leads/${other}`)).status).toBe(404);
    expect((await a.post(`/leads/${other}/notes`, { text: 'hujum', kind: 'call' })).status).toBe(404);
    expect((await a.patch(`/leads/${other}`, { temperature: 'hot' })).status).toBe(404);
  });
});
