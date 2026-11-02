'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { BookOpen, Brain, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Coins, GraduationCap, House, KeyRound, LogOut, Menu, Moon, Settings, Sun, Users, Wallet, X, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { StudentHomework, StudentMaterials } from '@/components/lms-student';
import { CoinBadge, CoinsTab, QuizTab } from '@/components/student-gamify';
import { Groups, LessonRow, StudentHero, StudentHome, StudentStats, type PortalTab } from '@/components/student-home';
import { useToast } from '@/components/toast';
import { Button, ConfirmDialog, EmptyState, ErrorNote, Field, IconButton, Modal, Panel } from '@/components/ui';
import { METHODS } from '@/lib/academic';
import { api, ApiError } from '@/lib/api';
import { formatDateTime, formatMoney } from '@/lib/format';
import { t } from '@/lib/i18n';
import { ENTRY, shiftMonth, type PortalLesson, type PortalMe, type PortalPayments } from '@/lib/portal';
import { useTheme } from '@/lib/theme';

const NAV: { id: PortalTab; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: 'Bosh sahifa', icon: House },
  { id: 'groups', label: 'Mening guruhlarim', icon: Users },
  { id: 'lessons', label: 'Jadval', icon: CalendarDays },
  { id: 'homework', label: 'Vazifalar', icon: ClipboardList },
  { id: 'materials', label: 'Materiallar', icon: BookOpen },
  { id: 'quiz', label: 'Savollar', icon: Brain },
  { id: 'coins', label: 'Coinlarim', icon: Coins },
  { id: 'payments', label: "To'lovlar", icon: Wallet },
  { id: 'settings', label: 'Sozlamalar', icon: Settings },
];
const MOBILE_BAR: PortalTab[] = ['home', 'lessons', 'homework', 'quiz'];

/** Qora yon menyu (desktop doimiy, telefonda ochiladigan panel) */
function Sidebar({ tab, onSelect, onClose }: { tab: PortalTab; onSelect: (tab: PortalTab) => void; onClose?: () => void }) {
  return (
    <div className="flex h-full flex-col bg-[#0d1030] text-white">
      <div className="flex items-center gap-3 px-6 pb-6 pt-7">
        <span className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-400 to-violet-500 shadow-lg shadow-indigo-900/40">
          <GraduationCap className="size-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xl font-bold leading-tight tracking-tight">EduERP</p>
          <p className="text-xs font-medium text-indigo-300">Learning Center</p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label={t('Yopish')} className="grid size-9 place-items-center rounded-lg text-white/70 hover:bg-white/10">
            <X className="size-5" aria-hidden />
          </button>
        )}
      </div>
      <nav aria-label={t("Bo'limlar")} className="flex-1 space-y-1 overflow-y-auto px-4 pb-6">
        {NAV.map((x) => {
          const active = tab === x.id;
          return (
            <button
              key={x.id}
              type="button"
              onClick={() => onSelect(x.id)}
              aria-current={active ? 'page' : undefined}
              className={clsx('flex w-full items-center gap-4 rounded-2xl px-4 py-3 text-left text-[15px] font-medium transition-all', active ? 'bg-gradient-to-r from-indigo-600 to-violet-500 text-white shadow-lg shadow-indigo-950/50' : 'text-white/80 hover:bg-white/5 hover:text-white')}
            >
              <span className={clsx('grid size-8 shrink-0 place-items-center rounded-lg', active ? 'bg-white/20 text-white' : 'bg-indigo-400/15 text-indigo-200')}>
                <x.icon className="size-[18px]" aria-hidden />
              </span>
              {t(x.label)}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function SettingsTab({ onPassword, onLogout }: { onPassword: () => void; onLogout: () => void }) {
  const { theme, toggle } = useTheme();
  return (
    <div className="mt-4 max-w-xl space-y-3">
      {[
        { icon: theme === 'dark' ? Sun : Moon, title: theme === 'dark' ? "Yorug' rejim" : "Qorong'i rejim", hint: "Ko'rinishni o'zgartirish", action: toggle },
        { icon: KeyRound, title: "Parolni o'zgartirish", hint: "Xavfsizlik uchun parolingizni yangilang", action: onPassword },
        { icon: LogOut, title: 'Chiqish', hint: "Kabinetdan chiqish", action: onLogout },
      ].map((row) => (
        <button key={row.title} type="button" onClick={row.action} className="flex w-full items-center gap-4 rounded-2xl border border-line bg-surface p-4 text-left shadow-card hover:bg-canvas">
          <span className="grid size-11 place-items-center rounded-xl bg-brand-soft text-brand">
            <row.icon className="size-5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block font-medium">{t(row.title)}</span>
            <span className="block text-sm text-muted">{t(row.hint)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * O'quvchi kabinetining butun ilovasi. Haqiqiy kabinet (`/student`) va namunaviy preview (`/student-demo`) shuni ishlatadi:
 * ular faqat chiqish amali va `api` manbai bilan farq qiladi (preview'da `setMockApi` o'rnatilgan).
 */
export function StudentApp({ onLogout, demo = false }: { onLogout: () => void | Promise<void>; demo?: boolean }) {
  const [tab, setTab] = useState<PortalTab>('home');
  const [month, setMonth] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [changing, setChanging] = useState(false);
  const [menu, setMenu] = useState(false);
  const me = useQuery({ queryKey: ['portal', 'me'], queryFn: () => api<PortalMe>('/portal/me') });
  const lessons = useQuery({ queryKey: ['portal', 'lessons', month], queryFn: () => api<{ month: string; today: string; lessons: PortalLesson[] }>(`/portal/lessons${month ? `?month=${month}` : ''}`), enabled: tab === 'lessons' });
  const payments = useQuery({ queryKey: ['portal', 'payments'], queryFn: () => api<PortalPayments>('/portal/payments'), enabled: tab === 'payments' });
  const d = me.data;
  const select = (next: PortalTab): void => {
    setTab(next);
    setMenu(false);
  };
  const title = NAV.find((x) => x.id === tab)?.label ?? 'Bosh sahifa';

  return (
    <div className="min-h-dvh bg-canvas">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 md:block">
        <Sidebar tab={tab} onSelect={select} />
      </aside>
      {menu && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label={t('Menyu')}>
          <button type="button" className="absolute inset-0 bg-black/50" aria-label={t('Yopish')} onClick={() => setMenu(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-pop">
            <Sidebar tab={tab} onSelect={select} onClose={() => setMenu(false)} />
          </div>
        </div>
      )}

      <div className="md:pl-72">
        {demo && <p className="bg-amber-100 px-4 py-2 text-center text-xs font-medium text-amber-900">{t("Demo rejim: ma'lumotlar namunaviy, serverga ulanmagan")}</p>}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur md:px-8">
          <button type="button" onClick={() => setMenu(true)} aria-label={t('Menyu')} className="grid size-10 place-items-center rounded-lg text-ink hover:bg-canvas md:hidden">
            <Menu className="size-5" aria-hidden />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">{t(title)}</h1>
          <CoinBadge onClick={() => select('coins')} />
        </header>

        <main className="mx-auto max-w-5xl px-4 pb-28 pt-5 md:px-8 md:pb-12">
          {me.isPending ? (
            <div className="space-y-4" role="status" aria-label={t('Yuklanmoqda')}>
              <div className="h-44 animate-pulse rounded-3xl bg-surface" />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-20 animate-pulse rounded-2xl bg-surface" />
                ))}
              </div>
            </div>
          ) : me.isError ? (
            <ErrorNote onRetry={() => void me.refetch()}>{me.error.message}</ErrorNote>
          ) : (
            d && (
              <>
                {tab === 'home' && (
                  <div className="space-y-4">
                    <StudentHero d={d} />
                    <StudentStats d={d} />
                  </div>
                )}
                {tab === 'home' && <StudentHome d={d} goTo={select} />}
                {tab === 'groups' && (
                  <div className="mt-1">
                    <Groups d={d} />
                  </div>
                )}

              {tab === 'lessons' && (
                <Panel className="mt-4 overflow-hidden">
                  <div className="flex items-center justify-between border-b border-line px-2 py-2">
                    <button type="button" onClick={() => setMonth(shiftMonth(lessons.data?.month ?? d.today.slice(0, 7), -1))} aria-label={t('Oldingi oy')} className="grid size-9 place-items-center rounded-lg hover:bg-canvas">
                      <ChevronLeft className="size-4" aria-hidden />
                    </button>
                    <p className="text-sm font-semibold tabular-nums">{(lessons.data?.month ?? d.today.slice(0, 7)).split('-').reverse().join('.')}</p>
                    <button type="button" onClick={() => setMonth(shiftMonth(lessons.data?.month ?? d.today.slice(0, 7), 1))} aria-label={t('Keyingi oy')} className="grid size-9 place-items-center rounded-lg hover:bg-canvas">
                      <ChevronRight className="size-4" aria-hidden />
                    </button>
                  </div>
                  {lessons.isPending ? (
                    <div className="m-4 h-40 animate-pulse rounded-lg bg-canvas" role="status" />
                  ) : lessons.isError ? (
                    <div className="p-4">
                      <ErrorNote onRetry={() => void lessons.refetch()}>{lessons.error.message}</ErrorNote>
                    </div>
                  ) : lessons.data.lessons.length === 0 ? (
                    <EmptyState icon={CalendarDays} title="Bu oyda dars yo'q" />
                  ) : (
                    <ul className="divide-y divide-line">
                      {lessons.data.lessons.map((l) => (
                        <LessonRow key={l.id} lesson={l} today={lessons.data.today} />
                      ))}
                    </ul>
                  )}
                </Panel>
              )}

                {tab === 'homework' && <StudentHomework />}
                {tab === 'materials' && <StudentMaterials />}
                {tab === 'quiz' && <QuizTab onOpenCoins={() => select('coins')} />}
                {tab === 'coins' && <CoinsTab />}
                {tab === 'settings' && <SettingsTab onPassword={() => setChanging(true)} onLogout={() => setLeaving(true)} />}

              {tab === 'payments' && (
                <Panel className="mt-4 overflow-hidden">
                  {payments.isPending ? (
                    <div className="m-4 h-40 animate-pulse rounded-lg bg-canvas" role="status" />
                  ) : payments.isError ? (
                    <div className="p-4">
                      <ErrorNote onRetry={() => void payments.refetch()}>{payments.error.message}</ErrorNote>
                    </div>
                  ) : payments.data.entries.length === 0 ? (
                    <EmptyState icon={Wallet} title="Hali to'lov va yechim yo'q" />
                  ) : (
                    <ul className="divide-y divide-line">
                      {payments.data.entries.map((e) => (
                        <li key={e.id} className="flex items-center justify-between gap-4 px-4 py-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{t(ENTRY[e.type] ?? e.type)}</p>
                            <p className="truncate text-xs tabular-nums text-muted">{e.type === 'subscription' ? e.comment : [formatDateTime(e.occurred_at), e.method && t(METHODS[e.method] ?? e.method)].filter(Boolean).join(' · ')}</p>
                          </div>
                          <span className={clsx('shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums', e.amount > 0 ? 'text-success' : 'text-ink')}>
                            {e.amount > 0 ? '+' : ''}
                            {formatMoney(e.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              )}
              </>
            )
          )}
        </main>
      </div>

      <nav aria-label={t("Bo'limlar")} className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {MOBILE_BAR.map((id) => {
            const x = NAV.find((n) => n.id === id) as (typeof NAV)[number];
            return (
              <li key={id}>
                <button type="button" onClick={() => select(id)} aria-current={tab === id ? 'page' : undefined} className={clsx('flex w-full flex-col items-center gap-0.5 py-2 text-[11px] font-medium', tab === id ? 'text-brand' : 'text-muted')}>
                  <span className={clsx('grid h-7 w-12 place-items-center rounded-full transition-colors', tab === id && 'bg-brand-soft')}>
                    <x.icon className="size-5" aria-hidden />
                  </span>
                  {t(x.label)}
                </button>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => setMenu(true)} className="flex w-full flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted">
              <span className="grid h-7 w-12 place-items-center rounded-full">
                <Menu className="size-5" aria-hidden />
              </span>
              {t('Yana')}
            </button>
          </li>
        </ul>
      </nav>

      {changing && <ChangePassword onClose={() => setChanging(false)} />}
      {leaving && <ConfirmDialog title="Tizimdan chiqish" message="Kabinetdan chiqmoqchimisiz?" confirmLabel="Chiqish" onConfirm={() => void onLogout()} onClose={() => setLeaving(false)} />}
    </div>
  );
}

/** O'quvchi parolni o'zi tanlaydi: joriy parol va yangisi (kamida 6 belgi) */
function ChangePassword({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ current: '', next: '', repeat: '' });
  const save = useMutation({
    mutationFn: () => api<unknown>('/portal/password', { method: 'POST', body: { current_password: form.current, new_password: form.next } }),
    onSuccess: () => {
      toast.success('Parol o\'zgartirildi');
      onClose();
    },
  });
  const errors = save.error instanceof ApiError ? save.error.fieldErrors() : {};
  const mismatch = form.repeat.length > 0 && form.repeat !== form.next;
  return (
    <Modal title="Parolni o'zgartirish" description="O'zingiz eslab qoladigan parol tanlang — kamida 6 ta belgi" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!mismatch) save.mutate();
        }}
      >
        <Field label="Joriy parol" type="password" autoComplete="current-password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} required autoFocus error={errors.current_password} />
        <Field label="Yangi parol" type="password" autoComplete="new-password" minLength={6} value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} required error={errors.new_password} />
        <Field label="Yangi parolni takrorlang" type="password" autoComplete="new-password" value={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.value })} required error={mismatch ? t('Parollar bir xil emas') : undefined} />
        {save.isError && Object.keys(errors).length === 0 && <ErrorNote>{save.error.message}</ErrorNote>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button type="submit" loading={save.isPending} disabled={mismatch}>
            Saqlash
          </Button>
        </div>
      </form>
    </Modal>
  );
}
