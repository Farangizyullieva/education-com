'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Brain, CheckCircle2, Coins, Crown, Flame, Trophy, XCircle } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorNote, Panel, Button } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { t } from '@/lib/i18n';

interface CoinsData {
  balance: number;
  history: { id: string; amount: number; reason: string; label: string; created_at: string }[];
  leaderboard: { place: number; name: string; coins: number; me: boolean }[];
  me: { place: number; name: string; coins: number } | null;
  rules: { submit_on_time: number; submit_late: number; grade_bonus_max: number };
}

interface QuizData {
  answered: number;
  remaining: number;
  questions: { id: string; text: string; options: string[]; coins: number; group: { id: string; name: string } }[];
}

interface AnswerResult {
  correct: boolean;
  correct_index: number;
  explanation: string | null;
  coins_earned: number;
  balance: number;
}

const errorText = (e: unknown): string => (e instanceof ApiError ? e.message : t('Xatolik yuz berdi'));
export const useCoins = () => useQuery({ queryKey: ['portal', 'coins'], queryFn: () => api<CoinsData>('/portal/coins') });

/** Yuqori paneldagi coin ko'rsatkichi */
export function CoinBadge({ onClick }: { onClick?: () => void }) {
  const q = useCoins();
  return (
    <button type="button" onClick={onClick} aria-label={t('Coinlarim')} className="flex h-9 items-center gap-1.5 rounded-full bg-amber-100 px-3 text-sm font-semibold text-amber-800 ring-1 ring-amber-300/60 hover:bg-amber-200 dark:bg-amber-400/15 dark:text-amber-300 dark:ring-amber-400/30">
      <Coins className="size-4" aria-hidden />
      <span className="tabular-nums">{q.data ? q.data.balance : '—'}</span>
    </button>
  );
}

/** Fan bo'yicha savollar: har bir savolga bir marta javob beriladi, to'g'ri javob coin beradi */
export function QuizTab({ onOpenCoins }: { onOpenCoins: () => void }) {
  const qc = useQueryClient();
  const quiz = useQuery({ queryKey: ['portal', 'quiz'], queryFn: () => api<QuizData>('/portal/quiz') });
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const current = quiz.data?.questions[0];
  const answer = useMutation({
    mutationFn: (choice: number) => api<AnswerResult>(`/portal/quiz/${current?.id ?? ''}/answer`, { method: 'POST', body: { choice } }),
    onSuccess: async (res) => {
      setResult(res);
      await qc.invalidateQueries({ queryKey: ['portal', 'coins'] });
    },
  });
  const next = async () => {
    setPicked(null);
    setResult(null);
    answer.reset();
    await quiz.refetch();
  };

  if (quiz.isError) return <ErrorNote onRetry={() => void quiz.refetch()}>{errorText(quiz.error)}</ErrorNote>;
  if (!quiz.data) return <div className="mt-4 h-48 animate-pulse rounded-2xl bg-surface" role="status" aria-label={t('Yuklanmoqda')} />;
  if (!current)
    return (
      <Panel className="mt-4">
        <EmptyState icon={Trophy} title="Hozircha yangi savol yo'q" hint="Barcha savollarga javob berdingiz. O'qituvchi yangi savol qo'shganda shu yerda ko'rinadi." />
        <div className="pb-5 text-center">
          <Button variant="secondary" onClick={onOpenCoins}>
            Coinlarimni ko'rish
          </Button>
        </div>
      </Panel>
    );

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between text-sm text-muted">
        <span>{t('Javob berilgan: {n}', { n: quiz.data.answered })}</span>
        <span>{t('Qolgan: {n}', { n: quiz.data.remaining })}</span>
      </div>
      <Panel className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand-strong">{current.group.name}</span>
          <span className="flex items-center gap-1 text-sm font-semibold text-amber-700 dark:text-amber-300">
            <Coins className="size-4" aria-hidden /> +{current.coins}
          </span>
        </div>
        <h2 className="mt-4 text-lg font-semibold leading-snug">{current.text}</h2>
        <ul className="mt-4 space-y-2.5">
          {current.options.map((option, i) => {
            const isPicked = picked === i;
            const isRight = result && i === result.correct_index;
            const isWrong = result && isPicked && !result.correct;
            return (
              <li key={option}>
                <button
                  type="button"
                  disabled={Boolean(result) || answer.isPending}
                  onClick={() => {
                    setPicked(i);
                    answer.mutate(i);
                  }}
                  className={clsx(
                    'flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors disabled:cursor-default',
                    isRight ? 'border-success bg-success-soft text-success' : isWrong ? 'border-danger bg-danger-soft text-danger' : isPicked ? 'border-brand bg-brand-soft' : 'border-line hover:bg-canvas',
                  )}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-full border border-current text-xs">{String.fromCharCode(65 + i)}</span>
                  <span className="flex-1">{option}</span>
                  {isRight && <CheckCircle2 className="size-5" aria-label={t("To'g'ri")} />}
                  {isWrong && <XCircle className="size-5" aria-label={t("Noto'g'ri")} />}
                </button>
              </li>
            );
          })}
        </ul>
        {answer.isError && <div className="mt-3"><ErrorNote>{errorText(answer.error)}</ErrorNote></div>}
        {result && (
          <div className={clsx('mt-4 rounded-xl p-4 text-sm', result.correct ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger')} role="status">
            <p className="font-semibold">{result.correct ? t("To'g'ri! +{n} coin", { n: result.coins_earned }) : t("Noto'g'ri. To'g'ri javob: {a}", { a: current.options[result.correct_index] ?? '' })}</p>
            {result.explanation && <p className="mt-1 text-ink/80">{result.explanation}</p>}
            <Button className="mt-3" onClick={() => void next()}>
              Keyingi savol
            </Button>
          </div>
        )}
      </Panel>
    </div>
  );
}

/** Coin balansi, qoidalar, guruhdagi o'rin va so'nggi harakatlar */
export function CoinsTab() {
  const q = useCoins();
  if (q.isError) return <ErrorNote onRetry={() => void q.refetch()}>{errorText(q.error)}</ErrorNote>;
  if (!q.data) return <div className="mt-4 h-48 animate-pulse rounded-2xl bg-surface" role="status" aria-label={t('Yuklanmoqda')} />;
  const d = q.data;
  return (
    <div className="mt-4 space-y-4">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 p-6 text-white shadow-pop">
        <p className="flex items-center gap-2 text-sm font-medium text-white/90">
          <Coins className="size-4" aria-hidden /> {t('Mening coinlarim')}
        </p>
        <p className="mt-1 text-5xl font-bold tabular-nums tracking-tight">{d.balance}</p>
        {d.me && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-white/90">
            <Crown className="size-4" aria-hidden /> {t('Guruhingizda {n}-o\'rin', { n: d.me.place })}
          </p>
        )}
      </section>

      <Panel className="p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Flame className="size-4 text-orange-500" aria-hidden /> {t('Coin qanday olinadi?')}
        </h2>
        <ul className="mt-2 space-y-1.5 text-sm text-muted">
          <li>{t("Vazifani o'z vaqtida topshirsangiz: +{n}", { n: d.rules.submit_on_time })}</li>
          <li>{t('Kechiktirib topshirsangiz: +{n}', { n: d.rules.submit_late })}</li>
          <li>{t("O'qituvchi baholaganda: ball foiziga qarab 0 dan {n} gacha qo'shimcha", { n: d.rules.grade_bonus_max })}</li>
          <li>{t("Savolga to'g'ri javob bersangiz: savolda ko'rsatilgan coin")}</li>
        </ul>
      </Panel>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel className="overflow-hidden">
          <h2 className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm font-semibold">
            <Trophy className="size-4 text-amber-500" aria-hidden /> {t('Guruhdoshlar reytingi')}
          </h2>
          {d.leaderboard.length === 0 ? (
            <EmptyState icon={Trophy} title="Reyting hali yo'q" />
          ) : (
            <ol className="divide-y divide-line">
              {d.leaderboard.map((r) => (
                <li key={`${r.place}-${r.name}`} className={clsx('flex items-center gap-3 px-4 py-2.5 text-sm', r.me && 'bg-brand-soft/60 font-semibold')}>
                  <span className={clsx('grid size-7 place-items-center rounded-full text-xs font-bold', r.place === 1 ? 'bg-amber-400 text-white' : r.place === 2 ? 'bg-slate-300 text-slate-800' : r.place === 3 ? 'bg-orange-300 text-orange-900' : 'bg-canvas text-muted')}>{r.place}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {r.name} {r.me && <span className="text-xs font-medium text-brand">({t('siz')})</span>}
                  </span>
                  <span className="flex items-center gap-1 tabular-nums">
                    <Coins className="size-3.5 text-amber-500" aria-hidden /> {r.coins}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel className="overflow-hidden">
          <h2 className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm font-semibold">
            <Brain className="size-4 text-brand" aria-hidden /> {t("So'nggi harakatlar")}
          </h2>
          {d.history.length === 0 ? (
            <EmptyState icon={Coins} title="Hali coin yo'q" hint="Vazifa topshiring yoki savolga javob bering." />
          ) : (
            <ul className="divide-y divide-line">
              {d.history.map((h) => (
                <li key={h.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{t(h.label)}</p>
                    <p className="text-xs text-muted">{formatDateTime(h.created_at)}</p>
                  </div>
                  <span className="font-semibold tabular-nums text-success">+{h.amount}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
