'use client';

import { useQuery } from '@tanstack/react-query';
import { GraduationCap, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MARKS } from '@/components/academic';
import { Avatar, Drawer, EmptyState, ErrorNote, PageHeader, Panel, SearchInput, StatusPill } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDate, studentNo } from '@/lib/format';
import { t } from '@/lib/i18n';
import type { Mark } from '@/lib/academic';

interface TeachingStudent {
  id: string;
  number: number;
  full_name: string;
  phone: string | null;
  status: string;
  groups: { id: string; name: string }[];
  attendance_rate: number | null;
  homework: { graded: number; pending: number; average: number | null };
}

interface TeachingStudentCard {
  id: string;
  number: number;
  full_name: string;
  phone: string | null;
  groups: { id: string; name: string }[];
  attendance: { date: string; group: string; status: Mark }[];
  homework: { title: string; group: string; score: number | null; max_score: number; feedback: string | null; submitted_at: string }[];
}

const rateTone = (rate: number | null): 'success' | 'warning' | 'danger' | 'neutral' => (rate === null ? 'neutral' : rate >= 80 ? 'success' : rate >= 50 ? 'warning' : 'danger');

function StudentCard({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ['teaching', 'student', id], queryFn: () => api<TeachingStudentCard>(`/teaching/students/${id}`) });
  const s = q.data;
  return (
    <Drawer title={s?.full_name ?? t("O'quvchi")} description={s ? `ID ${studentNo(s.number)} · ${s.groups.map((g) => g.name).join(', ')}` : undefined} onClose={onClose}>
      {q.isError ? (
        <ErrorNote onRetry={() => void q.refetch()}>{q.error.message}</ErrorNote>
      ) : !s ? (
        <div className="h-24 animate-pulse rounded-lg bg-canvas" role="status" aria-label={t('Yuklanmoqda')} />
      ) : (
        <div className="space-y-5">
          {s.phone && <p className="text-sm text-muted">{s.phone}</p>}
          <section>
            <h3 className="mb-2 text-sm font-semibold">{t('Oxirgi davomat')}</h3>
            {s.attendance.length === 0 ? (
              <p className="text-sm text-muted">{t('Hali davomat belgilanmagan')}</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {s.attendance.map((a, i) => {
                  const m = MARKS[a.status];
                  return (
                    <li key={`${a.date}-${i}`} title={`${a.group} · ${t(m.label)}`} className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${m.className}`}>
                      <m.icon className="size-3" strokeWidth={2.5} aria-hidden />
                      {formatDate(a.date).slice(0, 5)}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <section>
            <h3 className="mb-2 text-sm font-semibold">{t('Vazifa natijalari')}</h3>
            {s.homework.length === 0 ? (
              <p className="text-sm text-muted">{t('Hali topshirilgan vazifa yo\'q')}</p>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {s.homework.map((h, i) => (
                  <li key={`${h.title}-${i}`} className="px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{h.title}</p>
                        <p className="truncate text-xs text-muted">{h.group}</p>
                      </div>
                      {h.score === null ? <StatusPill tone="warning">{t('Tekshirilmoqda')}</StatusPill> : <StatusPill tone="success">{`${h.score} / ${h.max_score}`}</StatusPill>}
                    </div>
                    {h.feedback && <p className="mt-1 text-xs text-muted">{h.feedback}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}

// O'qituvchi paneli: o'z guruhlaridagi o'quvchilar (server faqat shu o'qituvchining guruhlarini qaytaradi; pul va izohlar yo'q)
export default function TeacherStudentsPage() {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);
  const list = useQuery({ queryKey: ['teaching', 'students', q], queryFn: () => api<TeachingStudent[]>(`/teaching/students${q ? `?q=${encodeURIComponent(q)}` : ''}`) });

  return (
    <>
      <PageHeader title="O'quvchilarim" description="Guruhlaringizdagi o'quvchilar: davomat va vazifa natijalari" />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Ism bo'yicha qidirish" />
        {list.data && <p className="ml-auto text-sm text-muted">{t('{n} ta o\'quvchi', { n: list.data.length })}</p>}
      </div>
      {list.isError ? (
        <ErrorNote onRetry={() => void list.refetch()}>{list.error.message}</ErrorNote>
      ) : list.isPending ? (
        <div className="space-y-2" role="status" aria-label={t('Yuklanmoqda')}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
      ) : list.data.length === 0 ? (
        <Panel>
          <EmptyState icon={q ? Users : GraduationCap} title={q ? "Hech kim topilmadi" : "Hozircha guruhingizda o'quvchi yo'q"} hint={q ? "Boshqa ism bilan qidirib ko'ring" : "Guruhga o'quvchi qo'shilganda shu yerda ko'rinadi"} />
        </Panel>
      ) : (
        <Panel className="overflow-hidden">
          <ul className="divide-y divide-line">
            {list.data.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => setOpen(s.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-canvas">
                  <Avatar name={s.full_name} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.full_name}</p>
                    <p className="truncate text-xs text-muted">
                      <span className="tabular-nums">{studentNo(s.number)}</span> · {s.groups.map((g) => g.name).join(', ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                    <StatusPill tone={rateTone(s.attendance_rate)}>{`${t('Davomat')}: ${s.attendance_rate === null ? '—' : `${s.attendance_rate}%`}`}</StatusPill>
                    {s.homework.pending > 0 && <StatusPill tone="warning">{t('{n} ta tekshirilmagan', { n: s.homework.pending })}</StatusPill>}
                    {s.homework.average !== null && <StatusPill tone="info">{`${t('Baho')}: ${s.homework.average}%`}</StatusPill>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {open && <StudentCard id={open} onClose={() => setOpen(null)} />}
    </>
  );
}
