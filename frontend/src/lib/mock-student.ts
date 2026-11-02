// Namunaviy (mock) ma'lumot: faqat `/student-demo` preview sahifasi uchun. Haqiqiy kabinet hech qachon bundan foydalanmaydi.
// Serverga ulanmasdan o'quvchi panelining ko'rinishini ko'rish va coin/savol/vazifa oqimini sinash uchun.
import type { PortalAssignment, PortalMaterial } from '@/lib/lms';
import type { PortalLesson, PortalMe } from '@/lib/portal';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const tz = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' });
const dateOf = (ms: number): string => tz.format(new Date(ms));
const now = Date.now();
const today = dateOf(now);
const GROUPS = [
  { id: 'g1', number: 101, name: 'Backend Node.js (kechki)', course: 'Backend', teacher: 'Yusupov Sherzod', classroom: '3-xona' },
  { id: 'g2', number: 102, name: 'Ingliz tili B1', course: 'Ingliz tili', teacher: 'Karimova Zarina', classroom: '1-xona' },
];

const lesson = (id: string, g: (typeof GROUPS)[number], startMs: number, minutes: number, mark: PortalLesson['mark'], cancelled = false): PortalLesson => ({
  id,
  date: dateOf(startMs),
  start_at: new Date(startMs).toISOString(),
  end_at: new Date(startMs + minutes * 60_000).toISOString(),
  cancelled,
  group: g.name,
  discipline: g.course,
  teacher: g.teacher,
  classroom: g.classroom,
  mark,
});

const upcoming: PortalLesson[] = [
  lesson('l1', GROUPS[0]!, now + 2 * HOUR, 90, null),
  lesson('l2', GROUPS[1]!, now + DAY + 3 * HOUR, 90, null),
  lesson('l3', GROUPS[0]!, now + 2 * DAY + 2 * HOUR, 90, null),
  lesson('l4', GROUPS[1]!, now + 4 * DAY + HOUR, 90, null),
];
const past: PortalLesson[] = [
  lesson('p1', GROUPS[0]!, now - 2 * DAY, 90, 'present'),
  lesson('p2', GROUPS[1]!, now - 3 * DAY, 90, 'late'),
  lesson('p3', GROUPS[0]!, now - 5 * DAY, 90, 'present'),
  lesson('p4', GROUPS[1]!, now - 6 * DAY, 90, 'absent_excused'),
  lesson('p5', GROUPS[0]!, now - 8 * DAY, 90, 'present'),
];

const me: PortalMe = {
  center: 'EduERP Learning Center',
  today,
  student: { number: 42, full_name: 'Qodirova Laylo', phone: '+998937000004', status: 'active', photo_url: null, branch: { name: 'Chilonzor filiali', address: "Chilonzor 9-kvartal, 12-uy", phone: '+998712000000' } },
  balance: -150_000,
  monthly_price: 1_200_000,
  next_payment_date: dateOf(now + 3 * DAY),
  attendance: { marked: 5, attended: 4, rate: 80 },
  groups: GROUPS.map((g) => ({ number: g.number, name: g.name, course: g.course, teacher: g.teacher, classroom: g.classroom, schedule: { days: [1, 3, 5], start_time: '18:00', end_time: '19:30' }, price_amount: 600_000, next_payment_date: dateOf(now + 3 * DAY) })),
  upcoming,
};

const assignments: PortalAssignment[] = [
  { id: 'a1', title: "REST API: Todo ro'yxati", description: "CRUD endpointlarini yozing va Postman collection yuboring.", due_date: dateOf(now + DAY), max_score: 100, file: null, group: { id: 'g1', number: 101, name: GROUPS[0]!.name }, lesson: { id: 'p1', date: dateOf(now - 2 * DAY) }, created_at: new Date(now - 2 * DAY).toISOString(), status: 'new', submission: null },
  { id: 'a2', title: 'Essay: My Weekend', description: "80–100 so'zdan iborat insho. Past Simple ishlating.", due_date: dateOf(now - DAY), max_score: 100, file: null, group: { id: 'g2', number: 102, name: GROUPS[1]!.name }, lesson: null, created_at: new Date(now - 6 * DAY).toISOString(), status: 'overdue', submission: null },
  { id: 'a3', title: 'SQL: JOIN mashqlari', description: "3 ta jadval bo'yicha JOIN so'rovlari.", due_date: dateOf(now - 4 * DAY), max_score: 100, file: null, group: { id: 'g1', number: 101, name: GROUPS[0]!.name }, lesson: { id: 'p3', date: dateOf(now - 5 * DAY) }, created_at: new Date(now - 9 * DAY).toISOString(), status: 'graded', submission: { text: 'Javoblar ilovada.', file: null, submitted_at: new Date(now - 5 * DAY).toISOString(), score: 88, feedback: "Yaxshi ish! LEFT JOIN holatiga e'tibor bering." } },
  { id: 'a4', title: 'Listening: BBC 6 Minute English', description: "Epizodni tinglab, 5 ta yangi so'zni izohlang.", due_date: dateOf(now + 4 * DAY), max_score: 100, file: null, group: { id: 'g2', number: 102, name: GROUPS[1]!.name }, lesson: null, created_at: new Date(now - DAY).toISOString(), status: 'submitted', submission: { text: "5 ta so'z yozdim.", file: null, submitted_at: new Date(now - 3 * HOUR).toISOString(), score: null, feedback: null } },
];

const materials: PortalMaterial[] = [
  { id: 'm1', title: 'Oxirgi dars videosi', description: "Darsning yozuvi — o'tirib qolgan bo'lsangiz, ko'rib chiqing", link: 'https://www.youtube.com/@freecodecamp', file: null, lesson: { id: 'p1', date: dateOf(now - 2 * DAY) }, created_at: new Date(now - DAY).toISOString(), group: { id: 'g1', number: 101, name: GROUPS[0]!.name } },
  { id: 'm2', title: 'NestJS hujjatlari', description: "Controller, service va module'lar", link: 'https://docs.nestjs.com', file: null, lesson: null, created_at: new Date(now - 10 * DAY).toISOString(), group: { id: 'g1', number: 101, name: GROUPS[0]!.name } },
  { id: 'm3', title: 'BBC Learning English', description: "Grammatika va lug'at bo'yicha qisqa video darslar", link: 'https://www.bbc.co.uk/learningenglish', file: null, lesson: null, created_at: new Date(now - 12 * DAY).toISOString(), group: { id: 'g2', number: 102, name: GROUPS[1]!.name } },
];

const questions = [
  { id: 'q1', text: "HTTP da yangi resurs yaratish uchun odatda qaysi metod ishlatiladi?", options: ['GET', 'POST', 'DELETE'], correct: 1, explanation: 'POST — yangi yozuv yaratadi.', coins: 5, group: { id: 'g1', name: GROUPS[0]!.name } },
  { id: 'q2', text: "Which sentence is in Past Simple?", options: ['I go to school.', 'I went to school.', 'I am going to school.'], correct: 1, explanation: "'went' — go fe'lining o'tgan zamon shakli.", coins: 5, group: { id: 'g2', name: GROUPS[1]!.name } },
  { id: 'q3', text: '401 status kodi nimani bildiradi?', options: ['Topilmadi', 'Kirish talab qilinadi', 'Server xatosi'], correct: 1, explanation: "401 — foydalanuvchi tizimga kirmagan; 403 — ruxsat yo'q.", coins: 7, group: { id: 'g1', name: GROUPS[0]!.name } },
];
const answered = new Set<string>();
const history: { id: string; amount: number; reason: string; label: string; created_at: string }[] = [
  { id: 'h1', amount: 10, reason: 'homework_submit', label: 'Vazifa topshirildi', created_at: new Date(now - 5 * DAY).toISOString() },
  { id: 'h2', amount: 18, reason: 'homework_grade', label: 'Vazifa uchun baho', created_at: new Date(now - 4 * DAY).toISOString() },
  { id: 'h3', amount: 10, reason: 'homework_submit', label: 'Vazifa topshirildi', created_at: new Date(now - 3 * HOUR).toISOString() },
];
const mates = [['Aliyev V.', 96], ['Karimova Z.', 81], ['Qodirova L.', 38], ['Xolmatov D.', 33], ['Mirzayev A.', 20], ['Ergashev D.', 12]] as const;
let extra = 0;
const balance = (): number => history.reduce((sum, h) => sum + h.amount, 0);

const coins = () => {
  const total = balance();
  const rows = mates.map(([name, c]) => ({ name, coins: name === 'Qodirova L.' ? total : c, me: name === 'Qodirova L.' })).sort((a, b) => b.coins - a.coins).map((r, i) => ({ place: i + 1, ...r }));
  return { balance: total, history: [...history].sort((a, b) => b.created_at.localeCompare(a.created_at)), leaderboard: rows, me: rows.find((r) => r.me) ?? null, rules: { submit_on_time: 10, submit_late: 5, grade_bonus_max: 20 } };
};

export function mockStudentApi(method: string, path: string, body: unknown): unknown {
  const [p] = path.split('?');
  if (method === 'GET') {
    if (p === '/portal/me') return me;
    if (p === '/portal/lessons') return { month: today.slice(0, 7), today, lessons: [...past, ...upcoming] };
    if (p === '/portal/assignments') return assignments;
    if (p === '/portal/materials') return materials;
    if (p === '/portal/stats') {
      const graded = assignments.filter((a) => a.submission?.score != null);
      return { homework: { total: assignments.length, submitted: assignments.filter((a) => a.submission).length, graded: graded.length, missed: assignments.filter((a) => a.status === 'overdue').length, average: graded.length ? Math.round(graded.reduce((s, a) => s + ((a.submission?.score ?? 0) / a.max_score) * 100, 0) / graded.length) : null } };
    }
    if (p === '/portal/coins') return coins();
    if (p === '/portal/quiz') {
      const rest = questions.filter((q) => !answered.has(q.id));
      return { answered: answered.size, remaining: rest.length, questions: rest.map(({ correct: _c, explanation: _e, ...q }) => q) };
    }
    if (p === '/portal/payments') return { balance: me.balance, entries: [{ id: 'e1', type: 'payment', amount: 1_200_000, occurred_at: new Date(now - 27 * DAY).toISOString(), method: 'card', comment: null }, { id: 'e2', type: 'subscription', amount: -1_350_000, occurred_at: new Date(now - 26 * DAY).toISOString(), method: null, comment: null }] };
    return undefined;
  }
  const answer = /^\/portal\/quiz\/([^/]+)\/answer$/.exec(p ?? '');
  if (method === 'POST' && answer) {
    const q = questions.find((x) => x.id === answer[1]);
    if (!q || answered.has(q.id)) return undefined;
    answered.add(q.id);
    const correct = (body as { choice: number }).choice === q.correct;
    if (correct) history.push({ id: `hq${++extra}`, amount: q.coins, reason: 'quiz', label: "Savolga to'g'ri javob", created_at: new Date().toISOString() });
    return { correct, correct_index: q.correct, explanation: q.explanation, coins_earned: correct ? q.coins : 0, balance: balance() };
  }
  const submit = /^\/portal\/assignments\/([^/]+)\/submission$/.exec(p ?? '');
  if (method === 'POST' && submit) {
    const a = assignments.find((x) => x.id === submit[1]);
    if (!a) return undefined;
    const late = a.status === 'overdue';
    if (!a.submission) history.push({ id: `hs${++extra}`, amount: late ? 5 : 10, reason: 'homework_submit', label: 'Vazifa topshirildi', created_at: new Date().toISOString() });
    a.submission = { text: (body as { text?: string }).text ?? null, file: null, submitted_at: new Date().toISOString(), score: null, feedback: null };
    a.status = 'submitted';
    return null;
  }
  if (method === 'POST' && p === '/portal/password') return null;
  return undefined;
}
