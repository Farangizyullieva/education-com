// Vaqtinchalik namuna ma'lumotlar: interfeysni to'ldirib ko'rish uchun.
//   pnpm db:demo         — qo'shadi (avvalgi namunalarni almashtiradi)
//   pnpm db:demo:clear   — faqat namuna ma'lumotlarni o'chiradi, haqiqiy yozuvlarga tegmaydi
// Belgilar: filial kodi "DM…", xodim emaili "@demo.educrm.uz", o'quvchi custom_data.demo = true.
// Balanslar ataylab 0: balans faqat ledger yozuvlaridan hosil bo'ladi (M6.4), qo'lda yozilmaydi.
import 'dotenv/config';
import { hash } from '@node-rs/argon2';
import { AttendanceStatus, LeadStage, Prisma, PrismaClient, StudentStatus } from '@prisma/client';
import { recomputeStudentStatus, regenerateLessons, saveAttendance, todayIn } from '../src/modules/academic/domain';
import { nextNumber } from '../src/common/db/sequences';
import { chargeSubscriptions, postEntry } from '../src/modules/finance/ledger';

const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_MIGRATE_URL });
const DEMO_PASSWORD = 'demo-parol-2026';
const EMAIL_DOMAIN = '@demo.educrm.uz';

// Har safar bir xil natija chiqishi uchun oddiy deterministik generator
let seed = 20261011;
const rnd = (): number => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)] as T;

const SURNAMES = ['Karimov', 'Rahimov', 'Yusupov', 'Aliyev', 'Saidov', 'Nazarov', 'Tursunov', 'Ergashev', 'Qodirov', 'Ismoilov', 'Abdullayev', 'Xolmatov', 'Mirzayev', 'Sobirov', 'Usmonov', 'Hamidov'];
const MALE = ['Aziz', 'Sardor', 'Bobur', 'Jasur', 'Timur', 'Javohir', 'Behruz', 'Otabek', 'Sherzod', 'Diyor', 'Asadbek', 'Ulugbek'];
const FEMALE = ['Malika', 'Dilnoza', 'Madina', 'Nodira', 'Sevinch', 'Gulnora', 'Shahzoda', 'Zarina', 'Kamola', 'Mohira', 'Laylo', 'Rayhona'];
const fullName = (gender: 'male' | 'female'): string => {
  const surname = pick(SURNAMES);
  return `${gender === 'female' ? `${surname}a` : surname} ${pick(gender === 'female' ? FEMALE : MALE)}`;
};
const toIso = (d: Date): string => d.toISOString().slice(0, 10);
const phone = (n: number): string => `+99893${String(7000000 + n).padStart(7, '0')}`;

const BRANCHES = [
  { name: 'Chilonzor filiali', code: 'DMCHZ', address: 'Chilonzor tumani, 9-kvartal, 12-uy', phone: '+998712000101', rooms: ['101-xona', '102-xona', '201-xona', 'Kompyuter xonasi'] },
  { name: 'Yunusobod filiali', code: 'DMYUN', address: "Yunusobod tumani, Amir Temur ko'chasi, 108", phone: '+998712000202', rooms: ['A-1', 'A-2', 'B-1'] },
];
const EMPLOYEES: { name: string; role: string; branch?: number }[] = [
  { name: 'Tosheva Gulnora', role: 'branch_manager', branch: 0 },
  { name: 'Rahimov Otabek', role: 'branch_manager', branch: 1 },
  { name: 'Aliyeva Malika', role: 'administrator', branch: 0 },
  { name: 'Saidov Jasur', role: 'sales_manager' },
  { name: 'Nazarova Dilnoza', role: 'sales_manager' },
  { name: 'Yusupov Sherzod', role: 'teacher' },
  { name: 'Karimova Zarina', role: 'teacher' },
  { name: 'Hamidova Laylo', role: 'teacher' },
  { name: 'Sobirov Diyor', role: 'teacher' },
  { name: 'Usmonov Behruz', role: 'teacher' },
  { name: 'Ergashev Timur', role: 'accountant' },
];
const STATUS_WEIGHTS: [StudentStatus, number][] = [['active', 58], ['new', 18], ['paused', 10], ['finished', 14]];
const TEACHERS = ['Yusupov Sherzod', 'Karimova Zarina', 'Hamidova Laylo', 'Sobirov Diyor', 'Usmonov Behruz'];
// branch: 0 = asosiy filial, 1/2 = namuna filiallar; price — oylik abonement narxi so'mda
const GROUPS = [
  { name: 'ENG-A2-01', subject: 'Ingliz tili', level: 'A2', teacher: 1, branch: 0, room: '101-xona', days: [1, 3, 5], start: '09:00', end: '10:30', price: 600_000, paused: false },
  { name: 'ENG-B1-02', subject: 'Ingliz tili', level: 'B1', teacher: 1, branch: 0, room: '101-xona', days: [1, 3, 5], start: '11:00', end: '12:30', price: 650_000, paused: false },
  { name: 'BACK-JR-03', subject: 'Backend', level: 'Junior', teacher: 0, branch: 0, room: 'Kompyuter xonasi', days: [1, 3, 5], start: '18:00', end: '20:00', price: 1_200_000, paused: false },
  { name: 'FRONT-BG-01', subject: 'Frontend', level: 'Beginner', teacher: 3, branch: 0, room: 'Kompyuter xonasi', days: [2, 4, 6], start: '18:00', end: '20:00', price: 1_100_000, paused: false },
  { name: 'ENG-A1-04', subject: 'Ingliz tili', level: 'A1', teacher: 2, branch: 1, room: '102-xona', days: [2, 4, 6], start: '10:00', end: '11:30', price: 550_000, paused: false },
  { name: 'ENG-B2-05', subject: 'Ingliz tili', level: 'B2', teacher: 2, branch: 1, room: '201-xona', days: [2, 4, 6], start: '15:00', end: '17:00', price: 800_000, paused: false },
  { name: 'FRONT-BG-02', subject: 'Frontend', level: 'Beginner', teacher: 3, branch: 1, room: 'Kompyuter xonasi', days: [1, 3, 5], start: '15:00', end: '17:00', price: 1_100_000, paused: false },
  { name: 'BACK-JR-04', subject: 'Backend', level: 'Junior', teacher: 4, branch: 2, room: 'A-1', days: [2, 4, 6], start: '14:00', end: '16:00', price: 1_200_000, paused: false },
  { name: 'ENG-A2-06', subject: 'Ingliz tili', level: 'A2', teacher: 4, branch: 2, room: 'A-2', days: [1, 3, 5], start: '16:30', end: '18:00', price: 600_000, paused: true },
] as const;
const MAIN_ROOMS = ['101-xona', 'Kompyuter xonasi'];
const MARKS: [AttendanceStatus, number][] = [['present', 80], ['late', 7], ['absent_unexcused', 8], ['absent_excused', 5]];
const METHODS = ['cash', 'cash', 'payme', 'click', 'card', 'bank'];
const STUDENTS = 140;
const DAYS = 90;

async function clear(tx: Prisma.TransactionClient): Promise<void> {
  // Namuna lidlar: faqat demo filiallardagilar (lead_events cascade bilan o'chadi)
  await tx.lead.deleteMany({ where: { branch: { code: { startsWith: 'DM' } } } });
  const students = await tx.student.findMany({ where: { customData: { path: ['demo'], equals: true } }, select: { id: true, clientId: true } });
  const clientIds = students.map((s) => s.clientId);
  // Namuna xodimlar va namuna o'quvchilarning kabinet foydalanuvchilari
  const users = await tx.user.findMany({ where: { OR: [{ email: { endsWith: EMAIL_DOMAIN } }, { portalStudent: { customData: { path: ['demo'], equals: true } } }] }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  const branches = await tx.branch.findMany({ where: { code: { startsWith: 'DM' } }, select: { id: true } });
  const branchIds = branches.map((b) => b.id);

  await tx.notification.deleteMany({ where: { userId: { in: userIds } } });
  const chats = await tx.chatParticipant.findMany({ where: { userId: { in: userIds } }, select: { chatId: true } });
  const chatIds = [...new Set(chats.map((c) => c.chatId))];
  await tx.chatMessage.deleteMany({ where: { chatId: { in: chatIds } } });
  await tx.chatParticipant.deleteMany({ where: { chatId: { in: chatIds } } });
  await tx.chat.deleteMany({ where: { id: { in: chatIds } } });

  // Akademik va moliyaviy namunalar. Ledger append-only: namuna yozuvlarni o'chirish uchun himoya trigger'i
  // faqat shu (lokal, jadval egasi nomidan ishlaydigan) skriptda vaqtincha o'chiriladi.
  const studentIds = students.map((s) => s.id);
  const units = await tx.studyUnit.findMany({ where: { name: { in: GROUPS.map((g) => g.name) } }, select: { id: true } });
  // Demo o'qituvchisiga biriktirilgan, lekin demo ro'yxatida bo'lmagan guruhlar (qo'lda yaratilgan yoki eski demo qoldig'i).
  // Ular o'qituvchini o'chirishga to'sqinlik qiladi. Odatda o'chirilmaydi (haqiqiy o'quvchilar yozilgan bo'lishi mumkin):
  // `DEMO_FORCE=1 pnpm db:demo` bilan ular ham guruh, dars va yozilishlari bilan birga o'chiriladi.
  const extra = await tx.studyUnit.findMany({ where: { teacherId: { in: userIds }, id: { notIn: units.map((u) => u.id) } }, select: { id: true, name: true } });
  if (extra.length && process.env.DEMO_FORCE !== '1') {
    throw new Error(`Demo o'qituvchilarga biriktirilgan boshqa guruhlar bor: ${extra.map((e) => e.name).join(', ')}.\nAvval ularni ilovada boshqa o'qituvchiga o'tkazing yoki o'chiring.\nYoki ularni ham o'chirish uchun: DEMO_FORCE=1 pnpm db:demo`);
  }
  const unitIds = [...units, ...extra].map((u) => u.id);
  await tx.attendance.deleteMany({ where: { OR: [{ studentId: { in: studentIds } }, { lesson: { studyUnitId: { in: unitIds } } }] } });
  await tx.$executeRaw`ALTER TABLE ledger_entries DISABLE TRIGGER ledger_entries_append_only`;
  await tx.ledgerEntry.deleteMany({ where: { studentId: { in: studentIds } } });
  await tx.$executeRaw`ALTER TABLE ledger_entries ENABLE TRIGGER ledger_entries_append_only`;
  await tx.messageLog.deleteMany({ where: { studentId: { in: studentIds } } });
  await tx.enrollment.deleteMany({ where: { OR: [{ studentId: { in: studentIds } }, { studyUnitId: { in: unitIds } }] } });
  await tx.lesson.deleteMany({ where: { studyUnitId: { in: unitIds } } });
  await tx.scheduleRule.deleteMany({ where: { studyUnitId: { in: unitIds } } });
  await tx.studyUnit.deleteMany({ where: { id: { in: unitIds } } });
  await tx.classroom.deleteMany({ where: { name: { in: MAIN_ROOMS }, branch: { code: { not: { startsWith: 'DM' } } }, studyUnits: { none: {} }, lessons: { none: {} } } });

  await tx.student.deleteMany({ where: { id: { in: studentIds } } });
  await tx.contactPerson.deleteMany({ where: { clientId: { in: clientIds } } });
  await tx.client.deleteMany({ where: { id: { in: clientIds } } });
  // Namuna filialiga qo'lda qo'shilgan haqiqiy o'quvchi bo'lsa, filial o'chirilmaydi
  const busy = await tx.student.findMany({ where: { branchId: { in: branchIds } }, select: { branchId: true }, distinct: ['branchId'] });
  const removable = branchIds.filter((id) => !busy.some((b) => b.branchId === id));
  await tx.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
  await tx.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await tx.userBranch.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { branchId: { in: removable } }] } });
  await tx.student.updateMany({ where: { ownerId: { in: userIds } }, data: { ownerId: null } });
  await tx.lead.updateMany({ where: { ownerId: { in: userIds } }, data: { ownerId: null } });
  await tx.user.deleteMany({ where: { id: { in: userIds } } });
  await tx.classroom.deleteMany({ where: { branchId: { in: removable } } });
  await tx.holiday.deleteMany({ where: { branchId: { in: removable } } });
  await tx.branch.deleteMany({ where: { id: { in: removable } } });
  console.log(`tozalandi: ${students.length} o'quvchi, ${users.length} xodim, ${removable.length} filial`);
}

async function fill(tx: Prisma.TransactionClient, tenantId: string): Promise<void> {
  const main = await tx.branch.findFirst({ where: { code: { not: { startsWith: 'DM' } }, isActive: true }, orderBy: { createdAt: 'asc' } });
  if (!main) throw new Error('Avval `pnpm db:seed` ni ishga tushiring');
  const roles = new Map((await tx.role.findMany()).map((r) => [r.code, r.id]));
  const dict = await tx.dictionaryItem.findMany({ where: { isActive: true } });
  const ofKind = (kind: string) => dict.filter((d) => d.kind === kind).map((d) => d.id);

  const branchIds = [main.id];
  for (const b of BRANCHES) {
    // Namuna filialida qo'lda qo'shilgan haqiqiy o'quvchi bo'lsa, tozalash uni o'chirmaydi — shunda filial qayta ishlatiladi
    const existing = await tx.branch.findFirst({ where: { code: b.code } });
    const branch = existing ?? (await tx.branch.create({ data: { tenantId, name: b.name, code: b.code, address: b.address, phone: b.phone, workingHours: '09:00–21:00' } }));
    if (existing && !existing.isActive) await tx.branch.update({ where: { id: existing.id }, data: { isActive: true } });
    branchIds.push(branch.id);
    await tx.classroom.createMany({
      data: b.rooms.map((name, i) => ({ tenantId, branchId: branch.id, name, capacity: 10 + ((i * 4) % 11), equipment: i % 2 ? 'Proyektor, doska' : 'Doska' })),
      skipDuplicates: true,
    });
  }

  await tx.classroom.createMany({ data: MAIN_ROOMS.map((name, i) => ({ tenantId, branchId: main.id, name, capacity: 14 + i * 4, equipment: i ? 'Kompyuterlar, proyektor' : 'Proyektor, doska' })), skipDuplicates: true });

  const passwordHash = await hash(DEMO_PASSWORD);
  const owners: string[] = [];
  const teacherIds = new Map<string, string>();
  for (const [i, e] of EMPLOYEES.entries()) {
    const user = await tx.user.create({
      data: {
        tenantId,
        fullName: e.name,
        phone: `+9989010000${String(i + 1).padStart(2, '0')}`,
        email: `${e.name.split(' ')[1]?.toLowerCase()}${EMAIL_DOMAIN}`,
        passwordHash,
        roles: { create: { tenantId, roleId: roles.get(e.role) as string } },
        // Har bir xodim kamida bitta filialga biriktiriladi (filialsiz xodim hech narsa ko'rmaydi). Umumiy rollar — barcha namuna filiallar
        branches: { create: (e.branch === undefined ? branchIds : [branchIds[e.branch + 1] as string]).map((branchId) => ({ tenantId, branchId })) },
      },
    });
    if (e.role === 'sales_manager' || e.role === 'administrator') owners.push(user.id);
    if (e.role === 'teacher') teacherIds.set(e.name, user.id);
  }

  // Yaratilgan vaqt bo'yicha tartiblab, ID raqamlari xronologik beriladi
  const now = Date.now();
  const createdAt = Array.from({ length: STUDENTS }, () => new Date(now - Math.pow(rnd(), 1.7) * DAYS * 86_400_000 - rnd() * 3_600_000)).sort((a, b) => a.getTime() - b.getTime());
  const start = (await tx.student.aggregate({ _max: { number: true } }))._max.number ?? 0;
  const totalWeight = STATUS_WEIGHTS.reduce((sum, [, w]) => sum + w, 0);

  const created: { id: string; branchId: string; status: StudentStatus; at: Date }[] = [];
  for (const [i, at] of createdAt.entries()) {
    const gender = rnd() < 0.5 ? 'male' : 'female';
    const age = 8 + Math.floor(rnd() * 17);
    let roll = rnd() * totalWeight;
    const status = (STATUS_WEIGHTS.find(([, w]) => (roll -= w) < 0) ?? STATUS_WEIGHTS[0])?.[0] as StudentStatus;
    const parentGender = rnd() < 0.7 ? 'female' : 'male';
    const branchId = branchIds[rnd() < 0.45 ? 0 : rnd() < 0.6 ? 1 : 2] as string;
    const seeded = now - at.getTime() < 6 * 86_400_000 && rnd() < 0.7 ? 'new' : status;
    const student = await tx.student.create({
      data: {
        tenantId,
        number: start + i + 1,
        // Asosiy filial ko'proq o'quvchiga ega
        branch: { connect: { id: branchId } },
        owner: rnd() < 0.8 ? { connect: { id: pick(owners) } } : undefined,
        adSource: rnd() < 0.85 ? { connect: { id: pick(ofKind('ad_source')) } } : undefined,
        learningGoal: rnd() < 0.6 ? { connect: { id: pick(ofKind('learning_goal')) } } : undefined,
        blacklisted: i % 47 === 46,
        blacklistReason: i % 47 === 46 ? "Ikki oy to'lov qilmagan" : null,
        customData: { demo: true },
        createdAt: at,
        client: {
          create: {
            tenantId,
            fullName: fullName(gender),
            phone: phone(i),
            gender,
            birthDate: new Date(Date.UTC(new Date().getUTCFullYear() - age, Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 28))),
            createdAt: at,
            contactPersons:
              age < 18
                ? { create: { tenantId, fullName: fullName(parentGender), relation: parentGender === 'female' ? 'Ona' : 'Ota', phone: phone(5000 + i), isBillRecipient: true, createdAt: at } }
                : undefined,
          },
        },
      },
    });
    created.push({ id: student.id, branchId, status: seeded, at });
  }

  // --- Guruhlar, jadval, a'zolik, davomat va to'lovlar: haqiqiy biznes mantiq orqali (domain.ts, ledger.ts) ---
  const timeZone = 'Asia/Tashkent';
  const today = todayIn(timeZone);
  const day = (offset: number): Date => new Date(new Date(`${today}T00:00:00Z`).getTime() + offset * 86_400_000);
  const dictId = (kind: string, name: string): string | undefined => dict.find((d) => d.kind === kind && d.name === name)?.id;
  const rooms = await tx.classroom.findMany({ select: { id: true, name: true, branchId: true } });
  const pool = new Map<string, typeof created>(branchIds.map((id) => [id, created.filter((c) => c.branchId === id && c.status !== 'new')]));
  let lessonsTotal = 0;
  let marksTotal = 0;
  const unitsData: { id: string; name: string; subject: string; teacherId: string; members: typeof created }[] = [];

  for (const g of GROUPS) {
    const branchId = branchIds[g.branch] as string;
    const unit = await tx.studyUnit.create({
      data: {
        tenantId,
        number: await nextNumber(tx, tenantId, 'study_unit'),
        branchId,
        name: g.name,
        disciplineId: dictId('discipline', g.subject) as string,
        levelId: dictId('level', g.level),
        teacherId: teacherIds.get(TEACHERS[g.teacher] as string) as string,
        classroomId: rooms.find((r) => r.branchId === branchId && r.name === g.room)?.id,
        capacity: 14,
        priceAmount: BigInt(g.price * 100),
        status: 'active',
      },
    });
    const rule = await tx.scheduleRule.create({ data: { tenantId, studyUnitId: unit.id, daysOfWeek: [...g.days], startTime: g.start, endTime: g.end, periodStart: day(-28), periodEnd: day(60) } });
    lessonsTotal += await regenerateLessons(tx, tenantId, unit, rule, timeZone, toIso(day(-28)));

    // Shu filialdagi o'quvchilardan 9–13 tasi; "tugatgan"lar a'zoligi yopilgan bo'ladi
    const members = (pool.get(branchId) ?? []).splice(0, 9 + Math.floor(rnd() * 5));
    for (const m of members) {
      // A'zolik o'quvchi qo'shilgan kundan: eskiroqlari uchun 2–3 oylik abonement hisoblanadi
      const startDate = new Date(`${toIso(m.at)}T00:00:00Z`);
      await tx.enrollment.create({ data: { tenantId, studentId: m.id, studyUnitId: unit.id, startDate, endDate: m.status === 'finished' && startDate < day(-3) ? day(-3) : null, priceAmount: unit.priceAmount } });
    }

    unitsData.push({ id: unit.id, name: g.name, subject: g.subject, teacherId: unit.teacherId as string, members });

    // Oylik abonement: har bir boshlangan oy uchun bitta yechim (davomatga bog'liq emas)
    await chargeSubscriptions(tx, tenantId, today, { studyUnitId: unit.id });

    // O'tgan darslarga davomat (pul hisobiga ta'sir qilmaydi)
    const past = await tx.lesson.findMany({ where: { studyUnitId: unit.id, date: { lt: day(0) } }, orderBy: { startAt: 'asc' } });
    for (const lesson of past) {
      const entries = members
        .filter((m) => m.at.getTime() <= lesson.startAt.getTime() && (m.status !== 'finished' || lesson.date <= day(-3)))
        .map((m) => {
          let roll = rnd() * 100;
          return { studentId: m.id, status: (MARKS.find(([, w]) => (roll -= w) < 0) ?? MARKS[0])?.[0] as AttendanceStatus };
        });
      await saveAttendance(tx, tenantId, lesson, entries, null);
      marksTotal += entries.length;
    }
    await tx.lesson.updateMany({ where: { id: { in: past.map((l) => l.id) } }, data: { status: 'completed', completedAt: new Date() } });
    if (g.paused) await tx.studyUnit.update({ where: { id: unit.id }, data: { status: 'paused' } });
  }

  // --- Ta'lim: materiallar, uy vazifalari va javoblar (o'qituvchi "tekshirilishi kerak" ro'yxati va o'quvchi kabineti to'lishi uchun) ---
  const MATERIALS: Record<string, { title: string; description: string; link: string }[]> = {
    'Ingliz tili': [
      { title: 'BBC Learning English', description: "Grammatika va lug'at bo'yicha qisqa video darslar", link: 'https://www.bbc.co.uk/learningenglish' },
      { title: 'VOA Learning English', description: "Sekin tezlikdagi yangiliklar — tinglab tushunish mashqi", link: 'https://learningenglish.voanews.com' },
      { title: "Irregular verbs ro'yxati", description: "Har dars oldidan 10 ta fe'lni yodlang", link: 'https://www.englishpage.com/irregularverbs/irregularverbs.html' },
    ],
    Backend: [
      { title: 'Node.js rasmiy hujjatlari', description: 'API ma\'lumotnomasi', link: 'https://nodejs.org/docs/latest/api/' },
      { title: 'NestJS hujjatlari', description: "Controller, service va module'lar", link: 'https://docs.nestjs.com' },
      { title: 'PostgreSQL qo\'llanma', description: 'SQL asoslari va indekslar', link: 'https://www.postgresql.org/docs/current/tutorial.html' },
    ],
    Frontend: [
      { title: 'MDN Learn Web Development', description: 'HTML, CSS va JavaScript asoslari', link: 'https://developer.mozilla.org/en-US/docs/Learn' },
      { title: 'React: Quick Start', description: 'Komponentlar va state', link: 'https://react.dev/learn' },
      { title: 'CSS Flexbox o\'yini', description: "Flexbox'ni o'yin orqali o'rganing", link: 'https://flexboxfroggy.com' },
    ],
  };
  const ASSIGNMENTS: Record<string, { title: string; description: string }[]> = {
    'Ingliz tili': [
      { title: 'Unit 3: Past Simple mashqlari', description: "Darslikdagi 4–6-mashqlarni bajaring va 10 ta o'z gapingizni yozing." },
      { title: 'Essay: My Weekend', description: '80–100 so\'zdan iborat insho yozing. Past Simple ishlating.' },
      { title: "Listening: BBC 6 Minute English", description: "Tanlangan epizodni tinglab, 5 ta yangi so'zni izohlang." },
    ],
    Backend: [
      { title: 'REST API: Todo ro\'yxati', description: 'CRUD endpointlarini yozing va Postman collection yuboring.' },
      { title: 'SQL: JOIN mashqlari', description: "3 ta jadval bo'yicha JOIN so'rovlari (fayl sifatida .sql yuboring)." },
      { title: 'DTO validatsiya', description: "class-validator bilan ro'yxatdan o'tish DTO'sini yozing." },
    ],
    Frontend: [
      { title: 'Landing sahifa maketi', description: "Berilgan maket bo'yicha HTML/CSS sahifa (responsive)." },
      { title: 'JavaScript: massivlar', description: "map, filter va reduce bilan 8 ta mashq." },
      { title: 'React: counter komponenti', description: "useState bilan hisoblagich va reset tugmasi." },
    ],
  };
  const ANSWERS = ["Vazifani bajardim, javoblar ilovada.", 'Hammasini qildim, bitta joyini tushunmadim.', 'Mana mening ishim. Tekshirib bering, iltimos.', 'Vazifa tayyor. Qo\'shimcha savollarim bor.'];
  const FEEDBACK = ['Yaxshi ish! Xatolarni qayta ko\'rib chiqing.', 'Aʼlo! Shunday davom eting.', 'Yaxshi, lekin batafsilroq yozish kerak edi.', "Asosiy g'oya to'g'ri, imlo xatolariga e'tibor bering.", 'Juda yaxshi tuzilgan, barakalla!'];
  const DUE = [-7, 1, 6];
  const SUBMIT_RATE = [0.85, 0.4, 0.1];
  let materialsTotal = 0;
  let assignmentsTotal = 0;
  let submissionsTotal = 0;
  for (const u of unitsData) {
    // O'tgan darslar: vazifa va video aynan o'sha darsga bog'lanadi (o'qituvchi "dars o'tgach vazifa berish" oqimi)
    const pastLessons = await tx.lesson.findMany({ where: { studyUnitId: u.id, date: { lt: day(0) } }, orderBy: { startAt: 'desc' }, take: 4, select: { id: true } });
    if (pastLessons[0]) {
      await tx.material.create({ data: { tenantId, studyUnitId: u.id, lessonId: pastLessons[0].id, title: "Oxirgi dars videosi", description: "Darsning yozuvi — o'tirib qolgan bo'lsangiz, ko'rib chiqing", link: 'https://www.youtube.com/@freecodecamp', createdBy: u.teacherId, createdAt: new Date(now - 86_400_000) } });
      materialsTotal++;
    }
    for (const [i, m] of (MATERIALS[u.subject] ?? []).entries()) {
      await tx.material.create({ data: { tenantId, studyUnitId: u.id, title: m.title, description: m.description, link: m.link, createdBy: u.teacherId, createdAt: new Date(now - (20 - i * 6) * 86_400_000) } });
      materialsTotal++;
    }
    for (const [i, a] of (ASSIGNMENTS[u.subject] ?? []).entries()) {
      const due = day(DUE[i] as number);
      const assignment = await tx.assignment.create({ data: { tenantId, studyUnitId: u.id, lessonId: i === 0 ? (pastLessons[2]?.id ?? null) : i === 1 ? (pastLessons[0]?.id ?? null) : null, title: a.title, description: a.description, dueDate: due, maxScore: 100, createdBy: u.teacherId, createdAt: new Date(due.getTime() - 9 * 86_400_000) } });
      assignmentsTotal++;
      for (const m of u.members) {
        if (m.status === 'finished' || rnd() > (SUBMIT_RATE[i] as number)) continue;
        const gradeIt = i === 0 && rnd() < 0.7; // faqat muddati o'tgan vazifaning ko'pi baholangan, qolganlari tekshirilishi kutilmoqda
        await tx.submission.create({
          data: {
            tenantId,
            assignmentId: assignment.id,
            studentId: m.id,
            text: pick(ANSWERS),
            submittedAt: new Date(Math.min(now, due.getTime()) - Math.floor(rnd() * 3 * 86_400_000)),
            score: gradeIt ? 55 + Math.floor(rnd() * 46) : null,
            feedback: gradeIt ? pick(FEEDBACK) : null,
            gradedBy: gradeIt ? u.teacherId : null,
            gradedAt: gradeIt ? new Date(due.getTime() + 86_400_000) : null,
          },
        });
        submissionsTotal++;
        // Coinlar: topshirgani uchun +10, baholangan bo'lsa ball foiziga qarab bonus (ilovadagi qoidalar bilan bir xil)
        await tx.coinTransaction.create({ data: { tenantId, studentId: m.id, amount: 10, reason: 'homework_submit', refId: assignment.id } });
        if (gradeIt) await tx.coinTransaction.create({ data: { tenantId, studentId: m.id, amount: 8 + Math.floor(rnd() * 13), reason: 'homework_grade', refId: assignment.id } });
      }
    }
  }

  // --- Savollar (gamifikatsiya): har bir guruhga o'z fani bo'yicha test savollari ---
  const QUESTIONS: Record<string, { text: string; options: string[]; correct: number; explanation: string; coins: number }[]> = {
    'Ingliz tili': [
      { text: "Which sentence is in Past Simple?", options: ['I go to school.', 'I went to school.', 'I am going to school.'], correct: 1, explanation: "'went' — go fe'lining o'tgan zamon shakli.", coins: 5 },
      { text: "Choose the correct article: ___ apple a day.", options: ['A', 'An', 'The'], correct: 1, explanation: "Unli tovush bilan boshlanadigan so'z oldidan 'an' ishlatiladi.", coins: 5 },
      { text: "What is the plural of 'child'?", options: ['childs', 'children', 'childes'], correct: 1, explanation: "'child' — noto'g'ri ko'plik: children.", coins: 7 },
    ],
    Backend: [
      { text: "HTTP da yangi resurs yaratish uchun odatda qaysi metod ishlatiladi?", options: ['GET', 'POST', 'DELETE'], correct: 1, explanation: "POST — yangi yozuv yaratadi.", coins: 5 },
      { text: "SQL da ikki jadvalni bog'lash uchun qaysi kalit so'z ishlatiladi?", options: ['MERGE', 'JOIN', 'UNION ALL'], correct: 1, explanation: "JOIN jadvallarni umumiy ustun bo'yicha bog'laydi.", coins: 5 },
      { text: "401 status kodi nimani bildiradi?", options: ['Topilmadi', 'Kirish talab qilinadi (avtorizatsiya yo\'q)', 'Server xatosi'], correct: 1, explanation: "401 — foydalanuvchi tizimga kirmagan; 403 — ruxsat yo'q.", coins: 7 },
    ],
    Frontend: [
      { text: "CSS da elementni gorizontal markazlash uchun flex konteynerda qaysi xossa ishlatiladi?", options: ['align-items', 'justify-content', 'z-index'], correct: 1, explanation: "justify-content asosiy o'q bo'ylab joylashtiradi.", coins: 5 },
      { text: "JavaScript da massivning har bir elementini o'zgartirib yangi massiv qaytaradigan metod?", options: ['filter', 'map', 'forEach'], correct: 1, explanation: "map yangi massiv qaytaradi; forEach hech narsa qaytarmaydi.", coins: 5 },
      { text: "React da komponent holatini saqlash uchun qaysi hook ishlatiladi?", options: ['useState', 'useRoute', 'useStyle'], correct: 0, explanation: "useState holatni saqlaydi.", coins: 7 },
    ],
  };
  const questionsByUnit = new Map<string, { id: string; correct: number; coins: number }[]>();
  let questionsTotal = 0;
  for (const u of unitsData) {
    const made: { id: string; correct: number; coins: number }[] = [];
    for (const q of QUESTIONS[u.subject] ?? []) {
      const row = await tx.quizQuestion.create({ data: { tenantId, studyUnitId: u.id, text: q.text, options: q.options, correctIndex: q.correct, explanation: q.explanation, coins: q.coins, createdBy: u.teacherId } });
      made.push({ id: row.id, correct: q.correct, coins: q.coins });
      questionsTotal++;
    }
    questionsByUnit.set(u.id, made);
  }

  // --- O'quvchi kabineti: birinchi guruhlardan bir nechta faol o'quvchiga kirish ochiladi (login — telefon) ---
  const portalPick = unitsData.slice(0, 3).flatMap((u) => u.members.filter((m) => m.status === 'active' || m.status === 'new').slice(0, 2));
  const studentRole = roles.get('student');
  const portalLogins: { name: string; phone: string }[] = [];
  if (studentRole) {
    for (const m of portalPick) {
      const st = await tx.student.findUniqueOrThrow({ where: { id: m.id }, select: { client: { select: { fullName: true, phone: true } } } });
      if (!st.client.phone) continue;
      const user = await tx.user.create({ data: { tenantId, phone: st.client.phone, fullName: st.client.fullName, passwordHash, roles: { create: { tenantId, roleId: studentRole } }, branches: { create: { tenantId, branchId: m.branchId } } } });
      await tx.student.update({ where: { id: m.id }, data: { portalUserId: user.id } });
      portalLogins.push({ name: st.client.fullName, phone: st.client.phone });
      // Kabinet ochilgan o'quvchilar bir-ikki savolga javob bergan (kimdir xato, kimdir to'g'ri)
      const unit = unitsData.find((u) => u.members.some((x) => x.id === m.id));
      for (const [k, q] of (questionsByUnit.get(unit?.id ?? '') ?? []).slice(0, 2).entries()) {
        const ok = rnd() < 0.7 || k === 0;
        await tx.quizAnswer.create({ data: { tenantId, questionId: q.id, studentId: m.id, choice: ok ? q.correct : (q.correct + 1) % 3, isCorrect: ok } });
        if (ok) await tx.coinTransaction.create({ data: { tenantId, studentId: m.id, amount: q.coins, reason: 'quiz', refId: q.id } });
      }
    }
  }

  // Lidlar: sotuv voronkasining har bosqichida bir nechtadan (faqat demo filiallarda)
  const LEAD_STAGES: [LeadStage, number][] = [['new', 7], ['contacted', 6], ['trial', 4], ['contract', 3], ['lost', 4]];
  const SCHOOLS = ['12-maktab', '25-maktab', '3-sonli litsey', '45-maktab', 'IT Park litseyi'];
  const LEAD_NOTES = ["Kechki guruh kerak, narxni so'radi", 'Opasi tavsiya qildi, sinov darsiga kelmoqchi', 'Instagramdan yozdi, jadval qiziqtiradi'];
  const LEAD_ACTIVITY = { call: "Qo'ng'iroq qilindi: guruh va narx haqida gaplashildi", message: 'Telegramga jadval va narx yuborildi', visit: 'Markazga kelib, xonalar bilan tanishdi' } as const;
  const LOST = ['Narx qimmatlik qildi', "Vaqti to'g'ri kelmadi", 'Boshqa markazni tanladi', "Telefonga javob bermayapti"];
  const leadDict = (kind: string) => dict.filter((d) => d.kind === kind);
  let leadNo = 0;
  for (const [stage, count] of LEAD_STAGES) {
    for (let i = 0; i < count; i++) {
      leadNo++;
      const at = new Date(Date.now() - Math.floor(rnd() * 20 * 86_400_000) - 3_600_000);
      const open = stage !== 'lost';
      const child = rnd() < 0.7; // ko'pchilik lid bola nomidan, ota-ona murojaat qiladi
      const gender = rnd() < 0.5 ? 'female' : 'male';
      const parentGender = rnd() < 0.7 ? 'female' : 'male';
      // Keyingi bog'lanish: ba'zilari muddati o'tgan, ba'zilari bugun, qolganlari kelgusida
      const followRoll = rnd();
      const nextContactAt = !open ? null : followRoll < 0.3 ? new Date(Date.now() - (1 + Math.floor(rnd() * 3)) * 86_400_000) : followRoll < 0.55 ? new Date(`${today}T18:00:00+05:00`) : new Date(Date.now() + (1 + Math.floor(rnd() * 5)) * 86_400_000);
      const lead = await tx.lead.create({
        data: {
          tenantId,
          branchId: branchIds[leadNo % branchIds.length] as string,
          fullName: fullName(gender),
          phone: child ? null : phone(5000 + leadNo),
          gender,
          birthDate: child ? new Date(Date.UTC(new Date().getUTCFullYear() - (7 + Math.floor(rnd() * 11)), Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 28))) : null,
          guardianName: child ? fullName(parentGender) : null,
          guardianRelation: child ? (parentGender === 'female' ? 'Ona' : 'Ota') : null,
          guardianPhone: child ? phone(5000 + leadNo) : null,
          school: child ? pick(SCHOOLS) : null,
          preferredTime: pick(['morning', 'afternoon', 'evening', 'evening', 'weekend']),
          temperature: stage === 'contract' ? 'hot' : stage === 'lost' ? 'cold' : pick(['hot', 'warm', 'warm', 'cold']),
          nextContactAt,
          trialAt: stage === 'trial' ? new Date(Date.now() + (1 + Math.floor(rnd() * 4)) * 86_400_000) : null,
          disciplineId: leadDict('discipline').length ? pick(leadDict('discipline')).id : null,
          levelId: leadDict('level').length ? pick(leadDict('level')).id : null,
          adSourceId: leadDict('ad_source').length ? pick(leadDict('ad_source')).id : null,
          ownerId: owners.length ? (owners[leadNo % owners.length] as string) : null,
          stage,
          lostReason: stage === 'lost' ? pick(LOST) : null,
          note: stage === 'new' ? pick(LEAD_NOTES) : null,
          createdAt: at,
          lastActivityAt: at,
        },
      });
      await tx.leadEvent.create({ data: { tenantId, leadId: lead.id, type: 'created', toStage: 'new', createdAt: at } });
      // Birinchi bosqichdan keyingi lidlarda faoliyat tarixi: qo'ng'iroq, xabar, tashrif
      if (stage !== 'new') {
        const kinds = ['call', 'message', 'visit'] as const;
        for (const [k, kind] of kinds.slice(0, 1 + (leadNo % 3)).entries()) {
          await tx.leadEvent.create({ data: { tenantId, leadId: lead.id, type: kind, text: LEAD_ACTIVITY[kind], actorId: owners.length ? (owners[leadNo % owners.length] as string) : null, createdAt: new Date(at.getTime() + (k + 1) * 3_600_000 * 5) } });
        }
      }
    }
  }

  // To'lovlar: ko'pchilik to'lagan (bir qismi avans bilan), bir qismi qisman, qolgani to'lamagan → qarzdorlar
  const enrolled = await tx.student.findMany({ where: { enrollments: { some: {} }, customData: { path: ['demo'], equals: true } }, select: { id: true, cachedBalance: true, enrollments: { select: { priceAmount: true }, take: 1 } } });
  let payments = 0;
  for (const s of enrolled) {
    const roll = rnd();
    const owed = -s.cachedBalance;
    const month = s.enrollments[0]?.priceAmount ?? 0n;
    if (owed <= 0n || roll > 0.85) continue;
    // Ko'pchilik to'liq to'lagan (ba'zilari keyingi oy uchun oldindan), bir qismi qisman
    const amount = roll < 0.6 ? owed + (rnd() < 0.2 ? month : 0n) : (owed * BigInt(30 + Math.floor(rnd() * 50))) / 100n;
    const rounded = (amount / 1_000_000n) * 1_000_000n; // 10 000 so'mgacha yaxlit — real to'lovga o'xshash
    if (rounded <= 0n) continue;
    const ago = rnd() < 0.12 ? rnd() * 0.3 : rnd() * 24;
    await postEntry(tx, tenantId, { studentId: s.id, entryType: 'payment', amount: rounded, occurredAt: new Date(now - ago * 86_400_000), sourceType: 'manual', method: pick(METHODS), createdBy: pick(owners) });
    payments++;
  }
  for (const c of created) await recomputeStudentStatus(tx, c.id, today);
  console.log(`qo'shildi: ${GROUPS.length} guruh, ${lessonsTotal} dars, ${marksTotal} davomat belgisi, ${payments} to'lov`);
  await tx.$executeRaw`
    INSERT INTO number_sequences (tenant_id, kind, year, last_value) VALUES (${tenantId}::uuid, 'student', 0, ${start + STUDENTS})
    ON CONFLICT (tenant_id, kind, year) DO UPDATE SET last_value = GREATEST(number_sequences.last_value, EXCLUDED.last_value)`;

  console.log(`qo'shildi: ${BRANCHES.length} filial, ${EMPLOYEES.length} xodim, ${STUDENTS} o'quvchi`);
  console.log(`ta'lim: ${materialsTotal} material, ${assignmentsTotal} vazifa, ${submissionsTotal} javob, ${questionsTotal} savol; kabinet ochilgan o'quvchilar: ${portalLogins.length}`);
  const ROLE_LABEL: Record<string, string> = { branch_manager: 'Filial boshqaruvchisi', administrator: 'Administrator (reception)', sales_manager: 'Sotuv menejeri', teacher: "O'qituvchi", accountant: 'Buxgalter' };
  console.log('\n=== NAMUNA AKKAUNTLAR (har bir rol uchun) ===');
  console.log(`Direktor (owner)          : ${process.env.SEED_OWNER_PHONE ?? '(.env: SEED_OWNER_PHONE)'}  /  parol: .env dagi SEED_OWNER_PASSWORD`);
  for (const [i, e] of EMPLOYEES.entries()) console.log(`${(ROLE_LABEL[e.role] ?? e.role).padEnd(26)}: +9989010000${String(i + 1).padStart(2, '0')}  /  ${DEMO_PASSWORD}   (${e.name})`);
  for (const p of portalLogins) console.log(`${"O'quvchi (kabinet)".padEnd(26)}: ${p.phone}  /  ${DEMO_PASSWORD}   (${p.name})`);
  console.log("Xodimlar kirish sahifasi: /login · o'quvchilar: o'quvchi kirish sahifasi (telefon + parol)");
}

async function main(): Promise<void> {
  const tenant = await db.tenant.findUniqueOrThrow({ where: { slug: process.env.DEFAULT_TENANT_SLUG ?? 'najot-talim' } });
  await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenant.id}, true)`;
      await clear(tx);
      if (process.argv[2] !== 'clear') await fill(tx, tenant.id);
    },
    { timeout: 600_000, maxWait: 20_000 },
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
