'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, ClipboardList, ExternalLink, Paperclip, Play } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/components/toast';
import { Button, EmptyState, ErrorNote, Modal, Panel, StatusPill, TextareaField } from '@/components/ui';
import { api, ApiError, apiForm } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { t } from '@/lib/i18n';
import { ASSIGNMENT_STATUS, DOCUMENT_ACCEPT, fileTooLarge, formatBytes, isVideoLink, type FileLink, type PortalAssignment, type PortalMaterial, type PortalStats } from '@/lib/lms';

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

function SubmitModal({ assignment, onClose }: { assignment: PortalAssignment; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState(assignment.submission?.text ?? '');
  const [file, setFile] = useState<File | null>(null);
  const hasOld = Boolean(assignment.submission?.file);
  const send = useMutation({
    // Faqat matn va fayl yuboriladi: ball, izoh va o'quvchi identifikatori serverda belgilanadi
    mutationFn: () => apiForm(`/portal/assignments/${assignment.id}/submission`, { text: text.trim() }, file),
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: ['portal', 'assignments'] }), qc.invalidateQueries({ queryKey: ['portal', 'stats'] }), qc.invalidateQueries({ queryKey: ['portal', 'coins'] })]);
      toast.success(t('Javob topshirildi. Coinlar hisobingizga qo\'shildi'));
      onClose();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const empty = !text.trim() && !file && !hasOld;
  return (
    <Modal
      title={assignment.title}
      description={assignment.submission ? "Javobni baholanguncha yangilashingiz mumkin" : 'Javobingizni yozing yoki fayl yuklang'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button loading={send.isPending} disabled={empty || fileTooLarge(file)} onClick={() => send.mutate()}>
            {assignment.submission ? 'Yangilash' : 'Topshirish'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <TextareaField label={t('Javob matni')} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} rows={5} />
        <div>
          <label className="mb-1.5 block text-sm font-medium">{t('Fayl')}</label>
          <input type="file" accept={DOCUMENT_ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm text-muted file:mr-3 file:h-9 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:text-sm file:font-medium file:text-ink hover:file:bg-canvas" />
          <p className={`mt-1 text-xs ${fileTooLarge(file) ? 'text-danger' : 'text-muted'}`}>{fileTooLarge(file) ? t('Fayl hajmi 20 MB dan oshmasligi kerak') : t('PDF, rasm, Word/Excel/PowerPoint yoki ZIP · 20 MB gacha')}</p>
          {hasOld && !file && <p className="mt-1 text-xs text-muted">{t('Oldingi yuklangan fayl saqlanadi')}</p>}
        </div>
      </div>
    </Modal>
  );
}

function Homework() {
  const [submitting, setSubmitting] = useState<PortalAssignment | null>(null);
  const list = useQuery({ queryKey: ['portal', 'assignments'], queryFn: () => api<PortalAssignment[]>('/portal/assignments') });
  const stats = useQuery({ queryKey: ['portal', 'stats'], queryFn: () => api<PortalStats>('/portal/stats') });
  const h = stats.data?.homework;
  if (list.isError) return <ErrorNote onRetry={() => void list.refetch()}>{errorText(list.error)}</ErrorNote>;
  return (
    <div className="mt-4 space-y-3">
      {h && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            [t('Jami vazifa'), h.total],
            [t('Topshirilgan'), h.submitted],
            [t('Baholangan'), h.graded],
            [t("O'rtacha baho"), h.average == null ? '—' : `${h.average}%`],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border border-line bg-surface px-3 py-2.5">
              <p className="text-xs text-muted">{label}</p>
              <p className="text-lg font-semibold tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      )}
      {list.data && list.data.length === 0 ? (
        <Panel>
          <EmptyState icon={ClipboardList} title="Hozircha vazifa yo'q" hint="O'qituvchi vazifa berganda shu yerda ko'rinadi" />
        </Panel>
      ) : (
        <ul className="space-y-3">
          {(list.data ?? []).map((a) => {
            const st = ASSIGNMENT_STATUS[a.status];
            const sub = a.submission;
            return (
              <li key={a.id}>
                <Panel className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{a.title}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {a.group.name}
                        {a.lesson && ` · ${t('Dars: {date}', { date: formatDate(a.lesson.date).slice(0, 5) })}`} · {a.due_date ? t('Muddat: {date}', { date: formatDate(a.due_date) }) : t('Muddatsiz')}
                      </p>
                    </div>
                    <StatusPill tone={st.tone}>{t(st.label)}</StatusPill>
                  </div>
                  {a.description && <p className="mt-2 whitespace-pre-line text-sm text-muted">{a.description}</p>}
                  {a.file && (
                    <div className="mt-2">
                      <FileChip file={a.file} />
                    </div>
                  )}
                  {sub && (
                    <div className="mt-3 space-y-1.5 rounded-lg bg-canvas px-3 py-2.5 text-sm">
                      <p className="text-xs text-muted">{t('Topshirilgan: {date}', { date: formatDateTime(sub.submitted_at) })}</p>
                      {sub.text && <p className="whitespace-pre-line">{sub.text}</p>}
                      {sub.file && <FileChip file={sub.file} />}
                      {sub.score != null && (
                        <p className="font-semibold text-success">
                          {t('Baho')}: {sub.score} / {a.max_score}
                        </p>
                      )}
                      {sub.feedback && <p className="text-muted">{t("O'qituvchi izohi")}: {sub.feedback}</p>}
                    </div>
                  )}
                  {a.status !== 'graded' && (
                    <div className="mt-3">
                      <Button size="sm" variant={sub ? 'secondary' : 'primary'} onClick={() => setSubmitting(a)}>
                        {sub ? 'Javobni yangilash' : 'Javob topshirish'}
                      </Button>
                    </div>
                  )}
                </Panel>
              </li>
            );
          })}
        </ul>
      )}
      {submitting && <SubmitModal assignment={submitting} onClose={() => setSubmitting(null)} />}
    </div>
  );
}

function Materials() {
  const list = useQuery({ queryKey: ['portal', 'materials'], queryFn: () => api<PortalMaterial[]>('/portal/materials') });
  if (list.isError) return <ErrorNote onRetry={() => void list.refetch()}>{errorText(list.error)}</ErrorNote>;
  if (list.data && list.data.length === 0)
    return (
      <Panel className="mt-4">
        <EmptyState icon={BookOpen} title="Hozircha material yo'q" />
      </Panel>
    );
  return (
    <Panel className="mt-4 overflow-hidden">
      <ul className="divide-y divide-line">
        {(list.data ?? []).map((m) => (
          <li key={m.id} className="px-4 py-3.5">
            <p className="font-medium">{m.title}</p>
            <p className="text-xs text-muted">
              {m.group.name}
              {m.lesson && ` · ${t('Dars: {date}', { date: formatDate(m.lesson.date).slice(0, 5) })}`}
            </p>
            {m.description && <p className="mt-1 whitespace-pre-line text-sm text-muted">{m.description}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {m.file && <FileChip file={m.file} />}
              {m.link && (
                <a href={m.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md bg-canvas px-2 py-1 text-xs text-brand hover:underline">
                  {isVideoLink(m.link) ? <Play className="size-3.5" aria-hidden /> : <ExternalLink className="size-3.5" aria-hidden />} {isVideoLink(m.link) ? t('Video') : t('Havola')}
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function StudentHomework() {
  return <Homework />;
}

export function StudentMaterials() {
  return <Materials />;
}
