'use client';

import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertTriangle, CalendarCheck, CalendarClock, CalendarDays, Clock, DoorOpen, GraduationCap, ClipboardList, Receipt, User, Wallet, type LucideIcon } from 'lucide-react';
import { MARKS } from '@/components/academic';
import { Avatar, EmptyState, Panel, StatusPill } from '@/components/ui';
import { lessonTime, subjectColor, WEEKDAYS_SHORT } from '@/lib/academic';
import { api } from '@/lib/api';
import { formatDate, formatMoney, studentNo } from '@/lib/format';
import { t } from '@/lib/i18n';
import { weekday, type PortalLesson, type PortalMe } from '@/lib/portal';
import { ASSIGNMENT_STATUS, type PortalAssignment, type PortalStats } from '@/lib/lms';
import { STATUS } from '@/lib/students';

export type PortalTab = 'home' | 'groups' | 'lessons' | 'homework' | 'materials' | 'quiz' | 'coins' | 'payments' | 'settings';

export function LessonRow({ lesson, today }: { lesson: PortalLesson; today: string }) {
  const mark = lesson.mark ? MARKS[lesson.mark] : null;
  return (
    <li className={clsx('flex items-stretch gap-3 px-4 py-3', lesson.cancelled && 'opacity-55')}>
      <div className={clsx('grid w-12 shrink-0 place-items-center rounded-xl text-center', lesson.date === today ? 'bg-brand text-white' : 'bg-canvas')}>
        <div>
          <p className="text-[11px] font-medium uppercase leading-none opacity-80">{weekday(lesson.date)}</p>
          <p className="mt-0.5 text-base font-semibold leading-none tabular-nums">{lesson.date.slice(8)}</p>
        </div>
      </div>
      <span className="w-1 shrink-0 rounded-full" style={{ background: subjectColor(lesson.discipline) }} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={clsx('truncate text-sm font-medium', lesson.cancelled && 'line-through')}>{lesson.discipline}</p>
        <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
          <span className="flex items-center gap-1 tabular-nums">
            <Clock className="size-3" aria-hidden />
            {lessonTime(lesson.start_at)}–{lessonTime(lesson.end_at)}
          </span>
          <span className="flex items-center gap-1">
            <User className="size-3" aria-hidden />
            {lesson.teacher}
          </span>
          {lesson.classroom && (
            <span className="flex items-center gap-1">
              <DoorOpen className="size-3" aria-hidden />
              {lesson.classroom}
            </span>
          )}
        </p>
      </div>
      <div className="shrink-0 self-center">
        {lesson.cancelled ? (
          <span className="text-xs text-muted">{t('Bekor qilingan')}</span>
        ) : mark ? (
          <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium', mark.className)}>
            <mark.icon className="size-3.5" strokeWidth={2.5} aria-hidden />
            {t(mark.short)}
          </span>
        ) : null}
      </div>
    </li>
  );
}


const DAY = 86_400_000;

/** Kun nomi bo'yicha salomlashish (Toshkent soati) */
function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Tashkent' }).format(new Date()));
  return hour < 5 ? t('Xayrli tun') : hour < 12 ? t('Xayrli tong') : hour < 18 ? t('Xayrli kun') : t('Xayrli kech');
}

/** Darsgacha qolgan vaqt: "35 daqiqadan keyin", "3 soatdan keyin", "Ertaga" yoki hafta kuni */
function countdown(lesson: PortalLesson, today: string): string {
  const start = new Date(lesson.start_at).getTime();
  const end = new Date(lesson.end_at).getTime();
  const now = Date.now();
  if (now >= start && now < end) return t('Hozir davom etmoqda');
  const minutes = Math.round((start - now) / 60_000);
  if (minutes < 60) return t('{n} daqiqadan keyin', { n: Math.max(1, minutes) });
  if (lesson.date === today) return t('{n} soatdan keyin', { n: Math.round(minutes / 60) });
  const days = Math.round((new Date(`${lesson.date}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / DAY);
  return days === 1 ? t('Ertaga') : `${weekday(lesson.date)}, ${formatDate(lesson.date)}`;
}

/** Vazifa muddati: rang va matn (faqat rangga tayanilmaydi) */
function dueLabel(due: string | null, today: string): { text: string; tone: 'danger' | 'warning' | 'info' | 'neutral' } {
  if (!due) return { text: t('Muddatsiz'), tone: 'neutral' };
  const days = Math.round((new Date(`${due}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / DAY);
  if (days < 0) return { text: t("Muddati o'tgan"), tone: 'danger' };
  if (days === 0) return { text: t('Bugun'), tone: 'warning' };
  if (days === 1) return { text: t('Ertaga'), tone: 'warning' };
  return { text: t('{n} kun qoldi', { n: days }), tone: 'info' };
}

export function ProgressRing({ value, label }: { value: number | null; label: string }) {
  const pct = value ?? 0;
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 56 56" className="size-14 shrink-0 -rotate-90" role="img" aria-label={`${label}: ${value === null ? '—' : `${value}%`}`}>
      <circle cx="28" cy="28" r={r} fill="none" strokeWidth="6" className="stroke-line" />
      <circle cx="28" cy="28" r={r} fill="none" strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} className={pct >= 80 ? 'stroke-success' : pct >= 50 ? 'stroke-warning' : 'stroke-danger'} />
    </svg>
  );
}

export function StudentHero({ d }: { d: PortalMe }) {
  const next = d.upcoming.find((l) => !l.cancelled && new Date(l.end_at).getTime() > Date.now());
  const first = d.student.full_name.split(' ')[1] ?? d.student.full_name.split(' ')[0] ?? d.student.full_name;
  return (
    <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-hero via-hero to-brand-strong text-white shadow-pop">
      <div className="grid gap-5 p-5 sm:p-6 md:grid-cols-5 md:items-center">
        <div className="flex items-center gap-4 md:col-span-3">
          <div className="shrink-0 rounded-full ring-2 ring-white/30">
            <Avatar name={d.student.full_name} src={d.student.photo_url} size="xl" />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-white/70">{greeting()},</p>
            <h1 className="truncate text-2xl font-semibold leading-tight tracking-tight">{first}!</h1>
            <p className="mt-1 truncate text-sm text-white/75">
              <span className="tabular-nums">ID {studentNo(d.student.number)}</span> · {d.student.branch.name}
            </p>
            <div className="mt-2">
              <StatusPill tone={STATUS[d.student.status].tone}>{t(STATUS[d.student.status].label)}</StatusPill>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur md:col-span-2">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-hero-accent">
            <CalendarClock className="size-3.5" aria-hidden /> {t('Keyingi dars')}
          </p>
          {next ? (
            <>
              <p className="mt-1.5 truncate text-lg font-semibold">{next.discipline}</p>
              <p className="text-sm font-medium text-hero-accent">{countdown(next, d.today)}</p>
              <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/75">
                <span className="flex items-center gap-1 tabular-nums">
                  <Clock className="size-3" aria-hidden /> {lessonTime(next.start_at)}–{lessonTime(next.end_at)}
                </span>
                <span className="flex items-center gap-1">
                  <User className="size-3" aria-hidden /> {next.teacher}
                </span>
                {next.classroom && (
                  <span className="flex items-center gap-1">
                    <DoorOpen className="size-3" aria-hidden /> {next.classroom}
                  </span>
                )}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-white/75">{t("Yaqin 7 kunda dars yo'q")}</p>
          )}
        </div>
      </div>
    </section>
  );
}

function Kpi({ icon: Icon, label, value, caption, tone, visual }: { icon: LucideIcon; label: string; value: string; caption?: string; tone: string; visual?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface p-4 shadow-card">
      {visual ?? (
        <span className={clsx('grid size-12 shrink-0 place-items-center rounded-2xl', tone)}>
          <Icon className="size-6" aria-hidden />
        </span>
      )}
      <div className="min-w-0">
        <p className="text-xs text-muted">{t(label)}</p>
        <p className="truncate text-xl font-semibold tabular-nums tracking-tight">{value}</p>
        {caption && <p className="truncate text-xs text-muted">{caption}</p>}
      </div>
    </div>
  );
}

export function StudentStats({ d }: { d: PortalMe }) {
  const stats = useQuery({ queryKey: ['portal', 'stats'], queryFn: () => api<PortalStats>('/portal/stats') });
  const assignments = useQuery({ queryKey: ['portal', 'assignments'], queryFn: () => api<PortalAssignment[]>('/portal/assignments') });
  const pending = (assignments.data ?? []).filter((a) => a.status === 'new' || a.status === 'overdue').length;
  const avg = stats.data?.homework.average ?? null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Kpi icon={CalendarCheck} label="Shu oydagi davomat" value={d.attendance.rate === null ? '—' : `${d.attendance.rate}%`} caption={d.attendance.marked ? t('{total} ta darsdan {came} tasiga keldingiz', { total: d.attendance.marked, came: d.attendance.attended }) : t('Hali belgilanmagan')} tone="" visual={<ProgressRing value={d.attendance.rate} label={t('Davomat')} />} />
      <Kpi icon={ClipboardList} label="Topshirilmagan vazifa" value={assignments.isPending ? '…' : String(pending)} caption={avg === null ? t("Hali baho yo'q") : t("O'rtacha baho: {n}%", { n: avg })} tone={pending > 0 ? 'bg-warning-soft text-warning' : 'bg-success-soft text-success'} />
      <Kpi icon={Wallet} label={d.balance < 0 ? 'Qarzdorlik' : 'Balans'} value={formatMoney(Math.abs(d.balance))} caption={d.next_payment_date ? t("Keyingi to'lov: {date}", { date: formatDate(d.next_payment_date) }) : undefined} tone={d.balance < 0 ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'} />
      <Kpi icon={Receipt} label="Oylik to'lov" value={d.monthly_price ? formatMoney(d.monthly_price) : '—'} caption={t('{n} ta guruh', { n: d.groups.length })} tone="bg-brand-soft text-brand" />
    </div>
  );
}

/** Qarzdorlik yoki yaqinlashayotgan to'lov haqida aniq eslatma */
export function PaymentNotice({ d, onOpen }: { d: PortalMe; onOpen: () => void }) {
  const days = d.next_payment_date ? Math.round((new Date(`${d.next_payment_date}T00:00:00Z`).getTime() - new Date(`${d.today}T00:00:00Z`).getTime()) / DAY) : null;
  const debt = d.balance < 0;
  if (!debt && !(days !== null && days >= 0 && days <= 5)) return null;
  return (
    <button type="button" onClick={onOpen} className={clsx('flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left', debt ? 'border-danger/30 bg-danger-soft text-danger' : 'border-warning/30 bg-warning-soft text-warning')}>
      <AlertTriangle className="size-5 shrink-0" aria-hidden />
      <span className="min-w-0 text-sm font-medium">
        {debt ? t("Qarzdorligingiz: {amount}. To'lovni amalga oshiring.", { amount: formatMoney(Math.abs(d.balance)) }) : t("Keyingi to'lov {n} kundan keyin ({date})", { n: days as number, date: formatDate(d.next_payment_date as string) })}
      </span>
      <span className="ml-auto shrink-0 text-xs font-semibold underline">{t("To'lovlar")}</span>
    </button>
  );
}


function Upcoming({ lessons, today, onAll }: { lessons: PortalLesson[]; today: string; onAll: () => void }) {
  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">{t('Yaqin darslar')}</h2>
        <button type="button" onClick={onAll} className="text-xs font-medium text-brand hover:underline">
          {t("Butun jadval")}
        </button>
      </div>
      {lessons.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Yaqin 7 kunda dars yo'q" />
      ) : (
        <ul className="divide-y divide-line">
          {lessons.map((l) => (
            <LessonRow key={l.id} lesson={l} today={today} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Deadlines({ today, onAll }: { today: string; onAll: () => void }) {
  const list = useQuery({ queryKey: ['portal', 'assignments'], queryFn: () => api<PortalAssignment[]>('/portal/assignments') });
  const open = (list.data ?? [])
    .filter((a) => a.status === 'new' || a.status === 'overdue')
    .sort((a, b) => (a.due_date ?? '9999') .localeCompare(b.due_date ?? '9999'))
    .slice(0, 4);
  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">{t('Topshirilishi kerak vazifalar')}</h2>
        <button type="button" onClick={onAll} className="text-xs font-medium text-brand hover:underline">
          {t('Barchasi')}
        </button>
      </div>
      {list.isPending ? (
        <div className="m-4 h-20 animate-pulse rounded-lg bg-canvas" role="status" aria-label={t('Yuklanmoqda')} />
      ) : open.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Hammasi topshirilgan" hint="Yangi vazifa berilganda shu yerda ko'rinadi." />
      ) : (
        <ul className="divide-y divide-line">
          {open.map((a) => {
            const due = dueLabel(a.due_date, today);
            return (
              <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                <span className="w-1 self-stretch rounded-full" style={{ background: subjectColor(a.group.name) }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.title}</p>
                  <p className="truncate text-xs text-muted">{a.group.name}</p>
                </div>
                <StatusPill tone={due.tone}>{due.text}</StatusPill>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

export function Groups({ d }: { d: PortalMe }) {
  return (
    <Panel className="overflow-hidden">
      <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">{t('Mening guruhlarim')}</h2>
      {d.groups.length === 0 ? (
        <EmptyState icon={GraduationCap} title="Hali guruhga biriktirilmagansiz" hint="Guruhga qo'shilganingizdan keyin jadval shu yerda ko'rinadi." />
      ) : (
        <ul className="divide-y divide-line">
          {d.groups.map((g) => (
            <li key={g.number} className="px-4 py-3.5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl text-sm font-semibold text-white" style={{ background: subjectColor(g.course) }} aria-hidden>
                  {g.course.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{g.name}</p>
                  <p className="truncate text-xs text-muted">
                    {g.course} · {g.teacher}
                    {g.classroom && ` · ${g.classroom}`}
                  </p>
                  {g.schedule && (
                    <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                      {g.schedule.days.map((day) => (
                        <span key={day} className="rounded-md bg-canvas px-1.5 py-0.5 font-medium">
                          {t(WEEKDAYS_SHORT[day - 1] as string)}
                        </span>
                      ))}
                      <span className="ml-1 tabular-nums text-muted">
                        {g.schedule.start_time}–{g.schedule.end_time}
                      </span>
                    </p>
                  )}
                </div>
                <p className="shrink-0 text-sm font-semibold tabular-nums">{formatMoney(g.price_amount)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function StudentHome({ d, goTo }: { d: PortalMe; goTo: (tab: PortalTab) => void }) {
  return (
    <div className="mt-4 space-y-4">
      <PaymentNotice d={d} onOpen={() => goTo('payments')} />
      <div className="grid items-start gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <Upcoming lessons={d.upcoming} today={d.today} onAll={() => goTo('lessons')} />
        </div>
        <div className="space-y-4 lg:col-span-2">
          <Deadlines today={d.today} onAll={() => goTo('homework')} />
          <Groups d={d} />
        </div>
      </div>
      <p className="px-1 text-xs text-muted">{[d.student.branch.address, d.student.branch.phone].filter(Boolean).join(' · ')}</p>
    </div>
  );
}
