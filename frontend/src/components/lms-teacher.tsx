'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Brain, CheckCircle2, ClipboardList, Clock, ExternalLink, FileText, Paperclip, Play, Plus, Table2, Trash2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/components/toast';
import { Avatar, Button, ConfirmDialog, EmptyState, ErrorNote, Field, IconButton, Modal, Panel, StatusPill, Tabs, TextareaField } from '@/components/ui';
import { api, ApiError, apiForm } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatDateTime, studentNo } from '@/lib/format';
import { t } from '@/lib/i18n';
import { DOCUMENT_ACCEPT, fileTooLarge, formatBytes, isVideoLink, type Assignment, type HomeworkMatrix, type MatrixStatus, type QuizQuestionRow, type FileLink, type Material, type SubmissionRow, type SubmissionsView } from '@/lib/lms';

const errorText = (e: unknown): string => (e instanceof ApiError ? e.message : t('Xatolik yuz berdi'));

function FileChip({ file }: { file: FileLink }) {
  if (!file.url) return null;
  return (
    <a href={file.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-canvas px-2 py-1 text-xs text-brand hover:underline">
      <Paperclip className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{file.name ?? t('Fayl')}</span>
      <span className="shrink-0 text-muted">{formatBytes(file.size)}</span>
    </a>
  );
}

function LinkChip({ href }: { href: string }) {
  const video = isVideoLink(href);
  const Icon = video ? Play : ExternalLink;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md bg-canvas px-2 py-1 text-xs text-brand hover:underline">
      <Icon className="size-3.5" aria-hidden /> {video ? t('Video') : t('Havola')}
    </a>
  );
}

function LessonBadge({ lesson }: { lesson: { date: string } | null }) {
  if (!lesson) return null;
  return <span className="rounded-md bg-brand-soft px-1.5 py-0.5 text-[11px] font-medium text-brand-strong">{t('Dars: {date}', { date: formatDate(lesson.date).slice(0, 5) })}</span>;
}

function FilePicker({ file, onChange, error }: { file: File | null; onChange: (f: File | null) => void; error?: string }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{t('Fayl')}</label>
      <input
        type="file"
        accept={DOCUMENT_ACCEPT}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="block w-full text-sm text-muted file:mr-3 file:h-9 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:text-sm file:font-medium file:text-ink hover:file:bg-canvas"
      />
      <p className={`mt-1 text-xs ${error || fileTooLarge(file) ? 'text-danger' : 'text-muted'}`}>{error ?? (fileTooLarge(file) ? t('Fayl hajmi 20 MB dan oshmasligi kerak') : t('PDF, rasm, Word/Excel/PowerPoint yoki ZIP · 20 MB gacha'))}</p>
    </div>
  );
}

// ------------------------------------------------------------------- materiallar

function MaterialForm({ unitId, lessonId, onClose }: { unitId: string; lessonId?: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [link, setLink] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () => apiForm(`/study-units/${unitId}/materials`, { title: title.trim(), description: description.trim(), link: link.trim(), lesson_id: lessonId }, file),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['unit-materials', unitId] });
      toast.success("Material qo'shildi");
      onClose();
    },
    onError: (e) => (e instanceof ApiError && e.details.length ? setErrors(e.fieldErrors()) : toast.error(errorText(e))),
  });
  return (
    <Modal
      title={lessonId ? "Dars materiali / video" : "Yangi material"}
      description={lessonId ? "Video havolasi (YouTube, Drive...) yoki fayl — faqat shu dars bo'yicha ko'rinadi" : "Fayl yuklang yoki havola kiriting — guruh o'quvchilari ko'radi"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button loading={save.isPending} disabled={title.trim().length < 2 || fileTooLarge(file) || (!file && !link.trim())} onClick={() => save.mutate()}>
            Qo&apos;shish
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t('Sarlavha')} value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} maxLength={150} required />
        <TextareaField label={t('Izoh')} value={description} onChange={(e) => setDescription(e.target.value)} error={errors.description} maxLength={2000} />
        <FilePicker file={file} onChange={setFile} error={errors.file} />
        <Field label={t('yoki havola')} value={link} onChange={(e) => setLink(e.target.value)} error={errors.link} placeholder="https://" maxLength={500} />
      </div>
    </Modal>
  );
}

function MaterialsTab({ unitId, lessonId }: { unitId: string; lessonId?: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Material | null>(null);
  const list = useQuery({ queryKey: ['unit-materials', unitId, lessonId ?? 'all'], queryFn: () => api<Material[]>(`/study-units/${unitId}/materials${lessonId ? `?lesson_id=${lessonId}` : ''}`) });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/materials/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['unit-materials', unitId] });
      toast.success("Material o'chirildi");
      setRemoving(null);
    },
    onError: (e) => toast.error(errorText(e)),
  });
  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden /> {lessonId ? "Video / material qo'shish" : "Material qo'shish"}
        </Button>
      </div>
      {list.isError ? (
        <ErrorNote onRetry={() => void list.refetch()}>{errorText(list.error)}</ErrorNote>
      ) : list.data && list.data.length === 0 ? (
        <Panel>
          <EmptyState icon={BookOpen} title="Hali material yo'q" hint="Darslik, taqdimot yoki foydali havolani qo'shing" />
        </Panel>
      ) : (
        <Panel className="overflow-hidden">
          <ul className="divide-y divide-line">
            {(list.data ?? []).map((m) => (
              <li key={m.id} className="flex items-start gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{m.title}</p>
                  {m.description && <p className="mt-0.5 whitespace-pre-line text-sm text-muted">{m.description}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {m.file && <FileChip file={m.file} />}
                    {m.link && <LinkChip href={m.link} />}
                    {!lessonId && <LessonBadge lesson={m.lesson} />}
                    <span className="text-xs text-muted">{formatDate(m.created_at.slice(0, 10))}</span>
                  </div>
                </div>
                <IconButton label={t("Materialni o'chirish")} icon={Trash2} onClick={() => setRemoving(m)} />
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {adding && <MaterialForm unitId={unitId} lessonId={lessonId} onClose={() => setAdding(false)} />}
      {removing && <ConfirmDialog title="Materialni o'chirish" message={t("«{name}» o'chiriladi. O'quvchilar uni endi ko'rmaydi.", { name: removing.title })} confirmLabel="O'chirish" danger pending={remove.isPending} onConfirm={() => remove.mutate(removing.id)} onClose={() => setRemoving(null)} />}
    </>
  );
}

// ----------------------------------------------------------------------- vazifalar

function AssignmentForm({ unitId, lessonId, onClose }: { unitId: string; lessonId?: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [due, setDue] = useState('');
  const [max, setMax] = useState('100');
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const maxNum = Number(max);
  const save = useMutation({
    mutationFn: () => apiForm(`/study-units/${unitId}/assignments`, { title: title.trim(), description: description.trim(), due_date: due, max_score: String(maxNum), lesson_id: lessonId }, file),
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: ['unit-assignments', unitId] }), qc.invalidateQueries({ queryKey: ['unit-matrix', unitId] })]);
      toast.success('Vazifa berildi');
      onClose();
    },
    onError: (e) => (e instanceof ApiError && e.details.length ? setErrors(e.fieldErrors()) : toast.error(errorText(e))),
  });
  return (
    <Modal
      title={lessonId ? "Dars uchun uy vazifasi" : "Yangi vazifa"}
      description={lessonId ? "Vazifa shu darsga bog'lanadi va guruh o'quvchilariga ko'rinadi" : "Vazifa faqat shu guruh o'quvchilariga ko'rinadi"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button loading={save.isPending} disabled={title.trim().length < 2 || !Number.isInteger(maxNum) || maxNum < 1 || maxNum > 1000 || fileTooLarge(file)} onClick={() => save.mutate()}>
            Vazifa berish
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t('Sarlavha')} value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} maxLength={150} required />
        <TextareaField label={t('Topshiriq matni')} value={description} onChange={(e) => setDescription(e.target.value)} error={errors.description} maxLength={4000} rows={4} />
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('Topshirish muddati')} type="date" value={due} onChange={(e) => setDue(e.target.value)} error={errors.due_date} />
          <Field label={t('Maksimal ball')} type="number" min={1} max={1000} value={max} onChange={(e) => setMax(e.target.value)} error={errors.max_score} />
        </div>
        <FilePicker file={file} onChange={setFile} error={errors.file} />
      </div>
    </Modal>
  );
}

function GradeRow({ row, max, assignmentId, unitId }: { row: SubmissionRow; max: number; assignmentId: string; unitId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const s = row.submission;
  const [score, setScore] = useState(s?.score != null ? String(s.score) : '');
  const [feedback, setFeedback] = useState(s?.feedback ?? '');
  const num = Number(score);
  const valid = score !== '' && Number.isInteger(num) && num >= 0 && num <= max;
  const grade = useMutation({
    mutationFn: () => api(`/submissions/${s?.id ?? ''}/grade`, { method: 'PUT', body: { score: num, feedback: feedback.trim() || undefined } }),
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: ['assignment-submissions', assignmentId] }), qc.invalidateQueries({ queryKey: ['unit-assignments', unitId] }), qc.invalidateQueries({ queryKey: ['unit-matrix', unitId] })]);
      toast.success('Baho saqlandi');
    },
    onError: (e) => toast.error(errorText(e)),
  });
  return (
    <li className="px-5 py-4">
      <div className="flex items-center gap-3">
        <Avatar name={row.student.full_name} src={row.student.photo_url} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{row.student.full_name}</p>
          <p className="text-xs tabular-nums text-muted">{studentNo(row.student.number)}</p>
        </div>
        {!s ? <StatusPill tone="neutral">{t('Topshirmagan')}</StatusPill> : s.score != null ? <StatusPill tone="success">{t('Baholangan')}</StatusPill> : <StatusPill tone="warning">{t('Tekshirilmoqda')}</StatusPill>}
      </div>
      {s && (
        <div className="mt-3 space-y-2 pl-0 sm:pl-11">
          {s.text && <p className="whitespace-pre-line rounded-lg bg-canvas px-3 py-2 text-sm">{s.text}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {s.file && <FileChip file={s.file} />}
            <span className="text-xs text-muted">{t('Topshirilgan: {date}', { date: formatDateTime(s.submitted_at) })}</span>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-28">
              <Field label={t('Ball (0–{max})', { max })} type="number" min={0} max={max} value={score} onChange={(e) => setScore(e.target.value)} />
            </div>
            <div className="min-w-48 flex-1">
              <Field label={t('Izoh')} value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={1000} />
            </div>
            <Button loading={grade.isPending} disabled={!valid} onClick={() => grade.mutate()}>
              {s.score != null ? 'Yangilash' : 'Baholash'}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function SubmissionsModal({ assignment, unitId, onClose }: { assignment: Assignment; unitId: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ['assignment-submissions', assignment.id], queryFn: () => api<SubmissionsView>(`/assignments/${assignment.id}/submissions`) });
  return (
    <Modal title={assignment.title} description={t("Javoblar · maksimal ball: {max}", { max: assignment.max_score })} onClose={onClose} wide>
      {q.isError ? (
        <ErrorNote onRetry={() => void q.refetch()}>{errorText(q.error)}</ErrorNote>
      ) : !q.data ? (
        <p className="py-6 text-center text-sm text-muted">{t('Yuklanmoqda…')}</p>
      ) : q.data.rows.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Guruhda o'quvchi yo'q" />
      ) : (
        <ul className="-mx-5 -my-4 max-h-[65vh] divide-y divide-line overflow-y-auto">
          {q.data.rows.map((r) => (
            <GradeRow key={`${r.student.id}:${r.submission?.id ?? ''}:${r.submission?.score ?? ''}`} row={r} max={q.data.assignment.max_score} assignmentId={assignment.id} unitId={unitId} />
          ))}
        </ul>
      )}
    </Modal>
  );
}

function AssignmentsTab({ unitId, lessonId }: { unitId: string; lessonId?: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [opened, setOpened] = useState<Assignment | null>(null);
  const [removing, setRemoving] = useState<Assignment | null>(null);
  const list = useQuery({ queryKey: ['unit-assignments', unitId, lessonId ?? 'all'], queryFn: () => api<Assignment[]>(`/study-units/${unitId}/assignments${lessonId ? `?lesson_id=${lessonId}` : ''}`) });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/assignments/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['unit-assignments', unitId] });
      toast.success("Vazifa o'chirildi");
      setRemoving(null);
    },
    onError: (e) => toast.error(errorText(e)),
  });
  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden /> {lessonId ? 'Shu darsga vazifa berish' : 'Vazifa berish'}
        </Button>
      </div>
      {list.isError ? (
        <ErrorNote onRetry={() => void list.refetch()}>{errorText(list.error)}</ErrorNote>
      ) : list.data && list.data.length === 0 ? (
        <Panel>
          <EmptyState icon={ClipboardList} title="Hali vazifa berilmagan" hint="Vazifa berganingizda o'quvchilar kabinetida ko'rinadi" />
        </Panel>
      ) : (
        <Panel className="overflow-hidden">
          <ul className="divide-y divide-line">
            {(list.data ?? []).map((a) => (
              <li key={a.id} className="flex items-start gap-3 px-5 py-3.5">
                <button type="button" onClick={() => setOpened(a)} className="min-w-0 flex-1 text-left">
                  <p className="font-medium hover:text-brand">
                    {a.title} {!lessonId && <LessonBadge lesson={a.lesson} />}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {a.due_date ? t('Muddat: {date}', { date: formatDate(a.due_date) }) : t('Muddatsiz')} · {t('Ball: {n}', { n: a.max_score })}
                  </p>
                  <p className="mt-1 text-xs">
                    <span className="font-medium text-brand">{t('{n} ta javob', { n: a.submitted })}</span>
                    <span className="text-muted"> · {t('{n} ta baholangan', { n: a.graded })}</span>
                  </p>
                </button>
                {a.file && <FileChip file={a.file} />}
                <IconButton label={t("Vazifani o'chirish")} icon={Trash2} onClick={() => setRemoving(a)} />
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {adding && <AssignmentForm unitId={unitId} lessonId={lessonId} onClose={() => setAdding(false)} />}
      {opened && <SubmissionsModal assignment={opened} unitId={unitId} onClose={() => setOpened(null)} />}
      {removing && <ConfirmDialog title="Vazifani o'chirish" message={t("«{name}» va o'quvchilarning barcha javoblari o'chiriladi. Bu amalni qaytarib bo'lmaydi.", { name: removing.title })} confirmLabel="O'chirish" danger pending={remove.isPending} onConfirm={() => remove.mutate(removing.id)} onClose={() => setRemoving(null)} />}
    </>
  );
}


// ----------------------------------------------------------- natijalar (kim qildi, kim qilmadi)

const CELL: Record<MatrixStatus, { label: string; className: string; icon: typeof Clock }> = {
  graded: { label: 'Baholangan', className: 'bg-success-soft text-success', icon: CheckCircle2 },
  submitted: { label: 'Topshirdi', className: 'bg-brand-soft text-brand-strong', icon: CheckCircle2 },
  late: { label: 'Kechikdi', className: 'bg-warning-soft text-warning', icon: Clock },
  missed: { label: 'Topshirmadi', className: 'bg-danger-soft text-danger', icon: XCircle },
  pending: { label: 'Kutilmoqda', className: 'bg-canvas text-muted', icon: Clock },
};

/** Jadval: qatorlar — o'quvchilar, ustunlar — so'nggi vazifalar. Holat rang bilan birga ikonka va matn bilan ham beriladi */
function ResultsTab({ unitId }: { unitId: string }) {
  const q = useQuery({ queryKey: ['unit-matrix', unitId], queryFn: () => api<HomeworkMatrix>(`/study-units/${unitId}/homework-matrix`) });
  if (q.isError) return <ErrorNote onRetry={() => void q.refetch()}>{errorText(q.error)}</ErrorNote>;
  if (!q.data) return <div className="h-32 animate-pulse rounded-xl bg-canvas" role="status" aria-label={t('Yuklanmoqda')} />;
  const { assignments, students } = q.data;
  if (assignments.length === 0 || students.length === 0)
    return (
      <Panel>
        <EmptyState icon={Table2} title={assignments.length === 0 ? 'Hali vazifa berilmagan' : "Guruhda o'quvchi yo'q"} hint="Vazifa berilib, o'quvchilar topshirganda natijalar shu yerda ko'rinadi" />
      </Panel>
    );
  const done = (aId: string): number => students.filter((s) => s.cells.some((c) => c.assignment_id === aId && (c.status === 'submitted' || c.status === 'late' || c.status === 'graded'))).length;
  return (
    <Panel className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th className="sticky left-0 z-10 bg-surface px-4 py-3 font-medium">{t("O'quvchi")}</th>
            {assignments.map((a) => (
              <th key={a.id} className="px-3 py-3 font-medium" title={a.title}>
                <span className="block max-w-32 truncate">{a.title}</span>
                <span className="block font-normal">{a.due_date ? formatDate(a.due_date).slice(0, 5) : t('Muddatsiz')}</span>
              </th>
            ))}
            <th className="px-3 py-3 font-medium">{t('Jami')}</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s) => {
            const submitted = s.cells.filter((c) => c.status === 'submitted' || c.status === 'late' || c.status === 'graded').length;
            return (
              <tr key={s.id} className="border-b border-line last:border-0">
                <td className="sticky left-0 z-10 bg-surface px-4 py-2.5 font-medium">{s.full_name}</td>
                {s.cells.map((c) => {
                  const m = CELL[c.status];
                  return (
                    <td key={c.assignment_id} className="px-3 py-2.5">
                      <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${m.className}`}>
                        <m.icon className="size-3.5" aria-hidden />
                        {c.status === 'graded' && c.score !== null ? c.score : t(m.label)}
                      </span>
                    </td>
                  );
                })}
                <td className="px-3 py-2.5 tabular-nums text-muted">
                  {submitted}/{assignments.length}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-line bg-canvas text-xs text-muted">
            <td className="sticky left-0 bg-canvas px-4 py-2.5 font-medium">{t('Topshirganlar')}</td>
            {assignments.map((a) => (
              <td key={a.id} className="px-3 py-2.5 tabular-nums">
                {done(a.id)}/{students.length}
              </td>
            ))}
            <td />
          </tr>
        </tfoot>
      </table>
    </Panel>
  );
}

// ------------------------------------------------------------------- savollar (coin uchun)

function QuestionForm({ unitId, onClose }: { unitId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState('');
  const [options, setOptions] = useState(['', '', '']);
  const [correct, setCorrect] = useState(0);
  const [explanation, setExplanation] = useState('');
  const [coins, setCoins] = useState('5');
  const filled = options.map((o) => o.trim()).filter(Boolean);
  const coinsNum = Number(coins);
  const save = useMutation({
    mutationFn: () => api(`/study-units/${unitId}/questions`, { method: 'POST', body: { text: text.trim(), options: options.map((o) => o.trim()).filter(Boolean), correct_index: Math.min(correct, filled.length - 1), explanation: explanation.trim() || undefined, coins: coinsNum } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['unit-questions', unitId] });
      toast.success("Savol qo'shildi");
      onClose();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  return (
    <Modal
      title="Yangi savol"
      description="O'quvchilar to'g'ri javob bergani uchun coin oladi"
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button loading={save.isPending} disabled={text.trim().length < 3 || filled.length < 2 || !options[correct]?.trim() || !Number.isInteger(coinsNum) || coinsNum < 1 || coinsNum > 50} onClick={() => save.mutate()}>
            Qo&apos;shish
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <TextareaField label={t('Savol matni')} value={text} onChange={(e) => setText(e.target.value)} maxLength={500} rows={2} />
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">{t("Variantlar (to'g'ri javobni belgilang)")}</legend>
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="radio" name="correct" checked={correct === i} onChange={() => setCorrect(i)} aria-label={t("To'g'ri javob: {n}-variant", { n: i + 1 })} className="size-4 accent-[var(--color-brand)]" />
              <input value={o} onChange={(e) => setOptions((prev) => prev.map((x, k) => (k === i ? e.target.value : x)))} maxLength={200} placeholder={`${t('Variant')} ${String.fromCharCode(65 + i)}`} className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
            </div>
          ))}
          {options.length < 5 && (
            <Button variant="secondary" size="sm" onClick={() => setOptions((prev) => [...prev, ''])}>
              <Plus className="size-4" aria-hidden /> Variant qo&apos;shish
            </Button>
          )}
        </fieldset>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Field label={t('Izoh (javobdan keyin ko\'rsatiladi)')} value={explanation} onChange={(e) => setExplanation(e.target.value)} maxLength={500} />
          </div>
          <Field label={t('Coin')} type="number" min={1} max={50} value={coins} onChange={(e) => setCoins(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

function QuestionsTab({ unitId }: { unitId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<QuizQuestionRow | null>(null);
  const list = useQuery({ queryKey: ['unit-questions', unitId], queryFn: () => api<QuizQuestionRow[]>(`/study-units/${unitId}/questions`) });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/questions/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['unit-questions', unitId] });
      toast.success("Savol o'chirildi");
      setRemoving(null);
    },
    onError: (e) => toast.error(errorText(e)),
  });
  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden /> Savol qo&apos;shish
        </Button>
      </div>
      {list.isError ? (
        <ErrorNote onRetry={() => void list.refetch()}>{errorText(list.error)}</ErrorNote>
      ) : list.data && list.data.length === 0 ? (
        <Panel>
          <EmptyState icon={Brain} title="Hali savol yo'q" hint="Guruh o'quvchilari savollarga javob berib coin yig'adi" />
        </Panel>
      ) : (
        <Panel className="overflow-hidden">
          <ul className="divide-y divide-line">
            {(list.data ?? []).map((q) => (
              <li key={q.id} className="flex items-start gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{q.text}</p>
                  <ul className="mt-1.5 space-y-0.5 text-sm">
                    {q.options.map((o, i) => (
                      <li key={`${q.id}-${i}`} className={i === q.correct_index ? 'font-medium text-success' : 'text-muted'}>
                        {String.fromCharCode(65 + i)}. {o} {i === q.correct_index && <CheckCircle2 className="inline size-3.5" aria-label={t("To'g'ri javob")} />}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-xs text-muted">
                    {t('{n} coin', { n: q.coins })} · {t('Javob berganlar: {a}, to\'g\'ri: {c}', { a: q.answered, c: q.correct })}
                  </p>
                </div>
                <IconButton label={t("Savolni o'chirish")} icon={Trash2} onClick={() => setRemoving(q)} />
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {adding && <QuestionForm unitId={unitId} onClose={() => setAdding(false)} />}
      {removing && <ConfirmDialog title="Savolni o'chirish" message={t("«{name}» va o'quvchilarning javoblari o'chiriladi. Berilgan coinlar saqlanadi.", { name: removing.text })} confirmLabel="O'chirish" danger pending={remove.isPending} onConfirm={() => remove.mutate(removing.id)} onClose={() => setRemoving(null)} />}
    </>
  );
}

/**
 * Guruhning ta'lim bo'limi: vazifalar (javoblarni ko'rish va baholash) va materiallar.
 * Tab'lar faqat tegishli ruxsat bo'lganda ko'rinadi (UX); asosiy tekshiruv backend'da:
 * o'qituvchi faqat o'z guruhida ishlaydi (`own` doirasi), begona guruh id'si 404 qaytaradi.
 */
export function GroupLearning({ unitId }: { unitId: string }) {
  const { can } = useAuth();
  const tabs = [
    ...(can('homework.manage') ? [{ id: 'homework' as const, label: 'Vazifalar' }, { id: 'results' as const, label: 'Natijalar' }] : []),
    ...(can('material.manage') ? [{ id: 'materials' as const, label: 'Materiallar' }] : []),
    ...(can('homework.manage') ? [{ id: 'quiz' as const, label: 'Savollar' }] : []),
  ];
  const [tab, setTab] = useState<'homework' | 'results' | 'materials' | 'quiz'>(tabs[0]?.id ?? 'homework');
  if (tabs.length === 0) return null;
  const active = tabs.some((x) => x.id === tab) ? tab : tabs[0]!.id;
  return (
    <section className="mt-6" aria-label={t("Ta'lim")}>
      <h2 className="mb-2 flex items-center gap-2 text-base font-semibold">
        <FileText className="size-4 text-muted" aria-hidden /> {t("Vazifa va materiallar")}
      </h2>
      <Tabs tabs={tabs} value={active} onChange={setTab} />
      <div className="pt-4">{active === 'homework' ? <AssignmentsTab unitId={unitId} /> : active === 'results' ? <ResultsTab unitId={unitId} /> : active === 'quiz' ? <QuestionsTab unitId={unitId} /> : <MaterialsTab unitId={unitId} />}</div>
    </section>
  );
}

/**
 * Dars o'tgandan keyin: shu darsning uy vazifasi va video/materiallari. Faqat shu darsga bog'langanlari ko'rinadi.
 * Server dars shu guruhniki ekanini va o'qituvchining huquqini tekshiradi.
 */
export function LessonLearning({ unitId, lessonId }: { unitId: string; lessonId: string }) {
  const { can } = useAuth();
  const tabs = [...(can('homework.manage') ? [{ id: 'homework' as const, label: 'Uy vazifasi' }] : []), ...(can('material.manage') ? [{ id: 'materials' as const, label: 'Video va materiallar' }] : [])];
  const [tab, setTab] = useState<'homework' | 'materials'>(tabs[0]?.id ?? 'homework');
  if (tabs.length === 0) return null;
  const active = tabs.some((x) => x.id === tab) ? tab : tabs[0]!.id;
  return (
    <section className="rounded-xl border border-line p-3.5" aria-label={t('Dars uchun vazifa va video')}>
      <Tabs tabs={tabs} value={active} onChange={setTab} />
      <div className="pt-3">{active === 'homework' ? <AssignmentsTab unitId={unitId} lessonId={lessonId} /> : <MaterialsTab unitId={unitId} lessonId={lessonId} />}</div>
    </section>
  );
}
