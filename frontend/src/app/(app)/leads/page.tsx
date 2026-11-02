'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { CalendarClock, GraduationCap, MessageSquare, Phone, PhoneCall, Plus, StickyNote, Store, Target, Trash2, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { useToast } from '@/components/toast';
import { Avatar, Button, ConfirmDialog, Drawer, EmptyState, ErrorNote, Field, Modal, PageHeader, Panel, SearchInput, Segmented, Select, SelectField, StatusPill, TextareaField, td, th } from '@/components/ui';
import type { Ref } from '@/lib/academic';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatPhone } from '@/lib/format';
import { t } from '@/lib/i18n';
import { ACTIVITY_KINDS, ageOf, ago, followUpState, GUARDIAN_RELATIONS, isoToLocal, localToIso, PREFERRED_TIMES, stageOf, STAGES, TEMPERATURES, type ActivityKind, type Lead, type LeadEvent, type LeadStage, type Temperature } from '@/lib/leads';

const agoText = (iso: string): string => {
  const a = ago(iso);
  return t(a.text, a.vars);
};

const KIND_ICON: Record<ActivityKind, LucideIcon> = { note: StickyNote, call: PhoneCall, message: MessageSquare, visit: Store };

function TemperaturePill({ value }: { value: Temperature }) {
  const tp = TEMPERATURES.find((x) => x.id === value) ?? TEMPERATURES[1]!;
  return <StatusPill tone={tp.tone}>{t(tp.label)}</StatusPill>;
}

/** Keyingi bog'lanish eslatmasi: muddati o'tgan — qizil, bugun — sariq; rang bilan birga matn ham bor */
function FollowUp({ lead, compact }: { lead: Lead; compact?: boolean }) {
  const state = followUpState(lead);
  if (!state || !lead.next_contact_at) return compact ? <span className="text-muted">—</span> : null;
  const text = state === 'overdue' ? t("Bog'lanish muddati o'tgan") : state === 'today' ? t('Bugun bog\'lanish kerak') : t("Keyingi bog'lanish");
  return (
    <span className={clsx('inline-flex items-center gap-1 text-xs font-medium', state === 'overdue' ? 'text-danger' : state === 'today' ? 'text-warning' : 'text-muted')}>
      <CalendarClock className="size-3.5 shrink-0" aria-hidden />
      {compact ? formatDateTime(lead.next_contact_at) : `${text}: ${formatDateTime(lead.next_contact_at)}`}
    </span>
  );
}

function useLeadMutations(onDone?: () => void) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ['leads'] }), queryClient.invalidateQueries({ queryKey: ['dashboard'] })]);
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) => api<Lead>(`/leads/${id}`, { method: 'PATCH', body }),
    onSuccess: async () => {
      await refresh();
      onDone?.();
    },
    onError: (e) => toast.error(e.message),
  });
  return { update, refresh, toast };
}

// Lidlar (TZ M2.3): sotuv voronkasi — birinchi murojaatdan o'quvchi bo'lguncha. Kanban ↔ Ro'yxat.
export default function LeadsPage() {
  const { can } = useAuth();
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [branchId, setBranchId] = useState('');
  const [followUp, setFollowUp] = useState<'' | 'today' | 'overdue'>('');
  const [temperature, setTemperature] = useState<'' | Temperature>('');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<LeadStage | null>(null);
  // Bosqich o'zgarishida qo'shimcha savol kerak bo'lgan holatlar
  const [losing, setLosing] = useState<Lead | null>(null);
  const [converting, setConverting] = useState<Lead | null>(null);
  const { update } = useLeadMutations();
  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const branches = useQuery({ queryKey: ['branches'], queryFn: () => api<Ref[]>('/branches'), enabled: can('branch.view') });
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (branchId) params.set('branch_id', branchId);
  if (followUp) params.set('follow_up', followUp);
  if (temperature) params.set('temperature', temperature);
  const leads = useQuery({ queryKey: ['leads', 'list', q, branchId, followUp, temperature], queryFn: () => api<Lead[]>(`/leads?${params.toString()}`) });
  const all = leads.data ?? [];
  const canEdit = can('lead.update');

  const move = (lead: Lead, stage: LeadStage) => {
    if (lead.stage === stage || lead.stage === 'enrolled') return;
    if (stage === 'lost') setLosing(lead);
    else if (stage === 'enrolled') setConverting(lead);
    else update.mutate({ id: lead.id, stage });
  };
  const closed = all.filter((l) => l.stage === 'enrolled' || l.stage === 'lost').length;
  const won = all.filter((l) => l.stage === 'enrolled').length;
  const addButton = can('lead.create') && (
    <Button onClick={() => setCreating(true)}>
      <Plus className="size-4" aria-hidden /> Lid qo'shish
    </Button>
  );

  return (
    <>
      <PageHeader title="Lidlar" description="Sotuv voronkasi: birinchi murojaatdan o'quvchi bo'lguncha" action={addButton} />
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <Segmented label="Ko'rinish" value={view} onChange={setView} options={[{ id: 'kanban', label: 'Kanban' }, { id: 'list', label: "Ro'yxat" }]} />
        <SearchInput value={search} onChange={setSearch} placeholder="Ism yoki telefon" />
        {(branches.data?.length ?? 0) > 1 && (
          <Select aria-label={t('Filial')} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">{t('Barcha filiallar')}</option>
            {branches.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        )}
        <Segmented label="Eslatma" value={followUp} onChange={setFollowUp} options={[{ id: '', label: 'Barchasi' }, { id: 'today', label: 'Bugun bog\'lanish' }, { id: 'overdue', label: "Muddati o'tgan" }]} />
        <Select aria-label={t('Harorat')} value={temperature} onChange={(e) => setTemperature(e.target.value as '' | Temperature)}>
          <option value="">{t('Barcha harorat')}</option>
          {TEMPERATURES.map((x) => (
            <option key={x.id} value={x.id}>
              {t(x.label)}
            </option>
          ))}
        </Select>
        {all.length > 0 && (
          <p className="ml-auto text-sm text-muted">
            {t('Jami {n} ta lid', { n: all.length })}
            {closed > 0 && <span className="ml-2 font-medium text-success">{t('konversiya {n}%', { n: Math.round((won / closed) * 100) })}</span>}
          </p>
        )}
      </div>

      {leads.isError ? (
        <ErrorNote onRetry={() => void leads.refetch()}>{leads.error.message}</ErrorNote>
      ) : leads.isPending ? (
        <div className="h-72 animate-pulse rounded-xl bg-surface" role="status" />
      ) : all.length === 0 ? (
        <Panel>
          {q || branchId || followUp || temperature ? (
            <EmptyState icon={Target} title="Hech narsa topilmadi" hint="Qidiruv so'zini yoki filtrlarni o'zgartirib ko'ring." />
          ) : (
            <EmptyState icon={Target} title="Hali lid yo'q" hint="Qo'ng'iroq qilgan yoki kelib so'ragan har bir qiziquvchini shu yerga yozing — hech kim unutilmaydi." action={addButton} />
          )}
        </Panel>
      ) : view === 'kanban' ? (
        <>
          <div className="flex gap-3.5 overflow-x-auto pb-3">
            {STAGES.map((stage) => {
              const list = all.filter((l) => l.stage === stage.id);
              return (
                <section
                  key={stage.id}
                  onDragOver={(e) => {
                    if (!dragging) return;
                    e.preventDefault();
                    setOver(stage.id);
                  }}
                  onDragLeave={() => setOver((s) => (s === stage.id ? null : s))}
                  onDrop={(e) => {
                    e.preventDefault();
                    const lead = all.find((l) => l.id === dragging);
                    setDragging(null);
                    setOver(null);
                    if (lead) move(lead, stage.id);
                  }}
                  className={clsx('w-[264px] shrink-0 rounded-xl bg-canvas p-2.5 ring-1 transition-shadow', over === stage.id ? 'ring-2 ring-brand' : 'ring-line')}
                >
                  <header className="mb-2.5 flex items-center gap-2 px-1.5 pt-1">
                    <span className="size-2.5 rounded-full" style={{ background: stage.color }} aria-hidden />
                    <h2 className="flex-1 text-sm font-semibold">{t(stage.label)}</h2>
                    <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium tabular-nums text-muted">{list.length}</span>
                  </header>
                  <ul className="min-h-16 space-y-2.5">
                    {list.map((l) => (
                      <li key={l.id}>
                        <button
                          type="button"
                          draggable={canEdit && l.stage !== 'enrolled'}
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', l.id);
                            setDragging(l.id);
                          }}
                          onDragEnd={() => {
                            setDragging(null);
                            setOver(null);
                          }}
                          onClick={() => setOpenId(l.id)}
                          className={clsx('block w-full rounded-lg border border-line bg-surface p-3 text-left shadow-card transition-colors hover:border-brand/50', dragging === l.id && 'opacity-40')}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium leading-snug">{l.full_name}</p>
                            <TemperaturePill value={l.temperature} />
                          </div>
                          {l.phone && (
                            <p className="mt-1 flex items-center gap-1.5 text-xs tabular-nums text-muted">
                              <Phone className="size-3" aria-hidden /> {formatPhone(l.phone)}
                            </p>
                          )}
                          {(l.discipline || l.lost_reason) && (
                            <p className="mt-2 truncate text-xs">
                              {l.stage === 'lost' && l.lost_reason ? <span className="text-danger">{l.lost_reason}</span> : l.discipline?.name}
                              {l.stage !== 'lost' && l.level && <span className="text-muted"> · {l.level.name}</span>}
                            </p>
                          )}
                          {followUpState(l) && (
                            <p className="mt-2">
                              <FollowUp lead={l} />
                            </p>
                          )}
                          <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-line pt-2.5 text-xs text-muted">
                            <span className="truncate">{l.owner?.full_name ?? t("Mas'ul yo'q")}</span>
                            <span className="shrink-0">{agoText(l.last_activity_at)}</span>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
          {canEdit && <p className="mt-1 text-xs text-muted">{t("Kartochkani boshqa ustunga sudrab bosqichini o'zgartiring yoki bosib batafsil oching.")}</p>}
        </>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-line bg-canvas/50">
              <tr>
                {['Lid', 'Telefon', 'Fan / daraja', 'Bosqich', 'Harorat', "Keyingi bog'lanish", 'Manba', 'Filial', "Mas'ul", 'Oxirgi faoliyat'].map((h) => (
                  <th key={h} className={th}>
                    {t(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {all.map((l) => (
                <tr key={l.id} onClick={() => setOpenId(l.id)} className="cursor-pointer hover:bg-canvas/40">
                  <td className={td}>
                    <span className="flex items-center gap-3">
                      <Avatar name={l.full_name} size="sm" />
                      <span className="font-medium">{l.full_name}</span>
                    </span>
                  </td>
                  <td className={`${td} whitespace-nowrap tabular-nums`}>{formatPhone(l.phone)}</td>
                  <td className={td}>
                    {l.discipline?.name ?? '—'} {l.level && <span className="text-muted">· {l.level.name}</span>}
                  </td>
                  <td className={td}>
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <span className="size-2.5 rounded-full" style={{ background: stageOf(l.stage).color }} aria-hidden /> {t(stageOf(l.stage).label)}
                    </span>
                  </td>
                  <td className={td}>
                    <TemperaturePill value={l.temperature} />
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    <FollowUp lead={l} compact />
                  </td>
                  <td className={`${td} text-muted`}>{l.ad_source?.name ?? '—'}</td>
                  <td className={`${td} text-muted`}>{l.branch.name}</td>
                  <td className={`${td} text-muted`}>{l.owner?.full_name ?? '—'}</td>
                  <td className={`${td} whitespace-nowrap text-muted`}>{agoText(l.last_activity_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {creating && <LeadForm onClose={() => setCreating(false)} />}
      {openId && <LeadDrawer id={openId} onClose={() => setOpenId(null)} onLose={setLosing} onConvert={setConverting} />}
      {losing && <LostDialog lead={losing} onClose={() => setLosing(null)} />}
      {converting && <ConvertDialog lead={converting} onClose={() => setConverting(null)} onDone={() => setOpenId(null)} />}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3.5 rounded-xl border border-line p-4">
      <legend className="px-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{t(title)}</legend>
      {children}
    </fieldset>
  );
}

// Yangi lid anketasi: kim, kimning nomidan murojaat qilmoqda, nimaga qiziqadi, qachon qayta bog'lanish
function LeadForm({ onClose }: { onClose: () => void }) {
  const { can } = useAuth();
  const { refresh, toast } = useLeadMutations();
  const branches = useQuery({ queryKey: ['branches'], queryFn: () => api<Ref[]>('/branches'), enabled: can('branch.view') });
  const disciplines = useQuery({ queryKey: ['dictionaries', 'discipline'], queryFn: () => api<Ref[]>('/dictionaries?kind=discipline') });
  const levels = useQuery({ queryKey: ['dictionaries', 'level'], queryFn: () => api<Ref[]>('/dictionaries?kind=level') });
  const sources = useQuery({ queryKey: ['dictionaries', 'ad_source'], queryFn: () => api<Ref[]>('/dictionaries?kind=ad_source') });
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<Lead>('/leads', { method: 'POST', body }),
    onSuccess: async () => {
      await refresh();
      toast.success("Lid qo'shildi");
      onClose();
    },
  });
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const body: Record<string, unknown> = Object.fromEntries(data);
    body.next_contact_at = localToIso(data.get('next_contact_at'));
    body.trial_at = localToIso(data.get('trial_at'));
    create.mutate(body);
  };
  const fieldError = (field: string): string | undefined => (create.error && 'details' in create.error ? (create.error.details as { field?: string; message: string }[] | undefined)?.find((d) => d.field === field)?.message : undefined);
  const known = ['full_name', 'phone', 'birth_date', 'guardian_phone', 'next_contact_at', 'trial_at'];
  const options = (list?: Ref[]) =>
    list?.map((d) => (
      <option key={d.id} value={d.id}>
        {d.name}
      </option>
    ));

  return (
    <Modal title="Yangi lid" description="Qiziqish bildirgan odam. Keyin bir tugma bilan o'quvchiga aylantirasiz" onClose={onClose} wide>
      <form onSubmit={onSubmit} className="space-y-4">
        <Section title="Lid haqida">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="F.I.O." name="full_name" required minLength={2} autoFocus error={fieldError('full_name')} />
            <Field label="Telefon" name="phone" type="tel" placeholder="+998 90 123 45 67" error={fieldError('phone')} />
            <Field label="Tug'ilgan sana" name="birth_date" type="date" max={new Date().toISOString().slice(0, 10)} error={fieldError('birth_date')} />
            <SelectField label="Jinsi" name="gender" defaultValue="">
              <option value="">—</option>
              <option value="male">{t("O'g'il bola / erkak")}</option>
              <option value="female">{t('Qiz bola / ayol')}</option>
            </SelectField>
            <Field label="Maktab / ish joyi" name="school" maxLength={150} />
            <SelectField label="Filial" name="branch_id" required defaultValue={branches.data?.length === 1 ? branches.data[0]?.id : ''} key={branches.data?.length ?? 0}>
              <option value="">{t('Tanlang…')}</option>
              {options(branches.data)}
            </SelectField>
          </div>
        </Section>

        <Section title="Ota-ona / vakil">
          <p className="-mt-1 text-xs text-muted">{t("Bola uchun murojaat qilingan bo'lsa to'ldiring. O'quvchiga aylantirilganda kartochkaga o'tadi.")}</p>
          <div className="grid gap-3.5 sm:grid-cols-3">
            <Field label="Ism" name="guardian_name" maxLength={150} />
            <SelectField label="Kim bo'ladi" name="guardian_relation" defaultValue="">
              <option value="">—</option>
              {GUARDIAN_RELATIONS.map((r) => (
                <option key={r} value={r}>
                  {t(r)}
                </option>
              ))}
            </SelectField>
            <Field label="Telefon" name="guardian_phone" type="tel" placeholder="+998 90 123 45 67" error={fieldError('guardian_phone')} />
          </div>
        </Section>

        <Section title="Qiziqish">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <SelectField label="Qiziqqan fani" name="discipline_id" defaultValue="">
              <option value="">—</option>
              {options(disciplines.data)}
            </SelectField>
            <SelectField label="Daraja" name="level_id" defaultValue="">
              <option value="">—</option>
              {options(levels.data)}
            </SelectField>
            <SelectField label="Qulay vaqt" name="preferred_time" defaultValue="">
              <option value="">—</option>
              {PREFERRED_TIMES.map((p) => (
                <option key={p.id} value={p.id}>
                  {t(p.label)}
                </option>
              ))}
            </SelectField>
            <SelectField label="Qayerdan bildi" name="ad_source_id" defaultValue="">
              <option value="">—</option>
              {options(sources.data)}
            </SelectField>
          </div>
        </Section>

        <Section title="Keyingi qadam">
          <div className="grid gap-3.5 sm:grid-cols-3">
            <SelectField label="Harorat" name="temperature" defaultValue="warm">
              {TEMPERATURES.map((x) => (
                <option key={x.id} value={x.id}>
                  {t(x.label)}
                </option>
              ))}
            </SelectField>
            <Field label="Qachon bog'lanamiz" name="next_contact_at" type="datetime-local" error={fieldError('next_contact_at')} />
            <Field label="Sinov darsi" name="trial_at" type="datetime-local" error={fieldError('trial_at')} />
          </div>
          <TextareaField label="Izoh" name="note" maxLength={2000} placeholder="Masalan: kechki guruh kerak, narxni so'radi" />
        </Section>

        {create.isError && !known.some((k) => fieldError(k)) && <ErrorNote>{create.error.message}</ErrorNote>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button type="submit" loading={create.isPending}>
            Qo'shish
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function LeadDrawer({ id, onClose, onLose, onConvert }: { id: string; onClose: () => void; onLose: (lead: Lead) => void; onConvert: (lead: Lead) => void }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const { update, refresh, toast } = useLeadMutations();
  const [note, setNote] = useState('');
  const [kind, setKind] = useState<ActivityKind>('note');
  const [followAt, setFollowAt] = useState('');
  const [removing, setRemoving] = useState(false);
  const lead = useQuery({ queryKey: ['leads', 'detail', id], queryFn: () => api<Lead & { events: LeadEvent[] }>(`/leads/${id}`) });
  const addNote = useMutation({
    mutationFn: () => api<unknown>(`/leads/${id}/notes`, { method: 'POST', body: { text: note.trim(), kind, ...(followAt ? { next_contact_at: localToIso(followAt) } : {}) } }),
    onSuccess: async () => {
      setNote('');
      setFollowAt('');
      await queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () => api<unknown>(`/leads/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      onClose();
      await refresh();
      toast.success("Lid o'chirildi");
    },
    onError: (e) => toast.error(e.message),
  });
  const l = lead.data;
  const canEdit = can('lead.update') && l?.stage !== 'enrolled';
  const eventText = (e: LeadEvent): string =>
    e.type === 'created' ? t('Lid yaratildi') : e.type === 'converted' ? t("O'quvchiga aylantirildi") : ['note', 'call', 'message', 'visit'].includes(e.type) ? (e.text ?? '') : `${t(stageOf(e.from_stage ?? 'new').label)} → ${t(stageOf(e.to_stage ?? 'new').label)}${e.text ? ` — ${e.text}` : ''}`;

  return (
    <Drawer
      title={l?.full_name ?? 'Lid'}
      description={l ? `${l.branch.name}${l.owner ? ` · ${l.owner.full_name}` : ''}` : undefined}
      onClose={onClose}
      footer={
        l && (
          <>
            {can('lead.delete') && (
              <Button variant="secondary" onClick={() => setRemoving(true)} className="mr-auto !text-danger">
                <Trash2 className="size-4" aria-hidden /> O'chirish
              </Button>
            )}
            {l.student_id ? (
              <Link href={`/students/${l.student_id}`} className="inline-flex h-9.5 items-center gap-2 rounded-lg bg-brand px-3.5 text-sm font-medium text-white hover:bg-brand-strong">
                <GraduationCap className="size-4" aria-hidden /> {t("O'quvchi kartochkasi")}
              </Link>
            ) : (
              can('student.create') && (
                <Button onClick={() => onConvert(l)}>
                  <GraduationCap className="size-4" aria-hidden /> O'quvchiga aylantirish
                </Button>
              )
            )}
          </>
        )
      }
    >
      {lead.isPending ? (
        <div className="h-64 animate-pulse rounded-lg bg-canvas" role="status" />
      ) : lead.isError ? (
        <ErrorNote onRetry={() => void lead.refetch()}>{lead.error.message}</ErrorNote>
      ) : (
        l && (
          <div className="space-y-6">
            <div>
              <p className="mb-2 text-xs font-medium text-muted">{t('Bosqich')}</p>
              <div className="flex flex-wrap gap-1.5">
                {STAGES.filter((s) => s.id !== 'enrolled' || l.stage === 'enrolled').map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={!canEdit || update.isPending}
                    aria-pressed={l.stage === s.id}
                    onClick={() => (s.id === 'lost' ? onLose(l) : l.stage !== s.id && update.mutate({ id, stage: s.id }))}
                    className={clsx('flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors disabled:cursor-default', l.stage === s.id ? 'border-transparent text-white' : 'border-line text-ink/80 enabled:hover:border-brand/50')}
                    style={l.stage === s.id ? { background: s.color } : undefined}
                  >
                    {l.stage !== s.id && <span className="size-2 rounded-full" style={{ background: s.color }} aria-hidden />}
                    {t(s.label)}
                  </button>
                ))}
              </div>
              {l.stage === 'lost' && l.lost_reason && <p className="mt-2 text-sm text-danger">{t('Sabab: {reason}', { reason: l.lost_reason })}</p>}
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-muted">{t('Harorat')}</p>
              <div className="flex flex-wrap gap-1.5">
                {TEMPERATURES.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    disabled={!canEdit || update.isPending}
                    aria-pressed={l.temperature === x.id}
                    onClick={() => l.temperature !== x.id && update.mutate({ id, temperature: x.id })}
                    className={clsx('h-8 rounded-full border px-3 text-[13px] font-medium transition-colors disabled:cursor-default', l.temperature === x.id ? 'border-brand bg-brand-soft text-brand-strong' : 'border-line text-ink/80 enabled:hover:bg-canvas')}
                  >
                    {t(x.label)}
                  </button>
                ))}
              </div>
            </div>

            {l.stage !== 'enrolled' && l.stage !== 'lost' && (
              <div className="rounded-xl border border-line p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{t("Keyingi bog'lanish")}</p>
                  <FollowUp lead={l} compact />
                </div>
                {canEdit && (
                  <form
                    className="mt-2.5 flex flex-wrap items-end gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const data = new FormData(e.currentTarget);
                      update.mutate({ id, next_contact_at: localToIso(data.get('next_contact_at')), trial_at: localToIso(data.get('trial_at')) });
                    }}
                  >
                    <div className="min-w-44 flex-1">
                      <Field label="Qachon bog'lanamiz" name="next_contact_at" type="datetime-local" defaultValue={isoToLocal(l.next_contact_at)} key={`n${l.next_contact_at ?? ''}`} />
                    </div>
                    <div className="min-w-44 flex-1">
                      <Field label="Sinov darsi" name="trial_at" type="datetime-local" defaultValue={isoToLocal(l.trial_at)} key={`t${l.trial_at ?? ''}`} />
                    </div>
                    <Button type="submit" variant="secondary" loading={update.isPending}>
                      Saqlash
                    </Button>
                  </form>
                )}
              </div>
            )}

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {(
                [
                  ['Telefon', l.phone ? formatPhone(l.phone) : '—'],
                  ['Qiziqqan fani', [l.discipline?.name, l.level?.name].filter(Boolean).join(' · ') || '—'],
                  ['Yoshi', ageOf(l.birth_date) === null ? '—' : t('{n} yosh', { n: ageOf(l.birth_date) as number })],
                  ['Maktab / ish joyi', l.school ?? '—'],
                  ['Ota-ona / vakil', [l.guardian_name, l.guardian_relation && `(${t(l.guardian_relation)})`].filter(Boolean).join(' ') || '—'],
                  ['Vakil telefoni', l.guardian_phone ? formatPhone(l.guardian_phone) : '—'],
                  ['Qulay vaqt', l.preferred_time ? t(PREFERRED_TIMES.find((p) => p.id === l.preferred_time)?.label ?? '') : '—'],
                  ['Sinov darsi', l.trial_at ? formatDateTime(l.trial_at) : '—'],
                  ['Qayerdan bildi', l.ad_source?.name ?? '—'],
                  ['Yaratilgan', formatDateTime(l.created_at)],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted">{t(label)}</dt>
                  <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            {l.note && <p className="whitespace-pre-line rounded-lg bg-canvas px-3.5 py-3 text-sm">{l.note}</p>}

            <div>
              <p className="mb-2 text-xs font-medium text-muted">{t('Tarix va izohlar')}</p>
              {can('lead.update') && l.stage !== 'enrolled' && (
                <form
                  className="mb-3 space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (note.trim()) addNote.mutate();
                  }}
                >
                  <Segmented label="Faoliyat turi" value={kind} onChange={setKind} options={ACTIVITY_KINDS} />
                  <div className="flex gap-2">
                    <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder={t('Nima haqida gaplashdingiz? Natija qanday?')} aria-label={t('Izoh')} className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
                    <Button type="submit" variant="secondary" loading={addNote.isPending} disabled={!note.trim()}>
                      Qo&apos;shish
                    </Button>
                  </div>
                  <Field label="Keyingi bog'lanish (ixtiyoriy)" type="datetime-local" value={followAt} onChange={(e) => setFollowAt(e.target.value)} />
                </form>
              )}
              <ol className="space-y-3">
                {l.events.map((e) => {
                  const Icon = e.type in KIND_ICON ? KIND_ICON[e.type as ActivityKind] : null;
                  const label = ACTIVITY_KINDS.find((k) => k.id === e.type)?.label;
                  return (
                    <li key={e.id} className="flex gap-3 text-sm">
                      {Icon ? (
                        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-brand" title={label ? t(label) : undefined}>
                          <Icon className="size-3.5" aria-hidden />
                        </span>
                      ) : (
                        <span className={clsx('mt-1.5 ml-2 size-2 shrink-0 rounded-full', e.type === 'converted' ? 'bg-success' : 'bg-line')} aria-hidden />
                      )}
                      <div className="min-w-0">
                        <p className={clsx(Icon && 'whitespace-pre-line')}>
                          {label && e.type !== 'note' && <span className="mr-1.5 text-xs font-semibold text-brand">{t(label)}</span>}
                          {eventText(e)}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {formatDateTime(e.created_at)}
                          {e.actor && ` · ${e.actor}`}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        )
      )}
      {removing && l && <ConfirmDialog title="Lidni o'chirish" message={t("«{name}» lidi va uning tarixi butunlay o'chiriladi.", { name: l.full_name })} confirmLabel="O'chirish" danger pending={remove.isPending} onConfirm={() => remove.mutate()} onClose={() => setRemoving(false)} />}
    </Drawer>
  );
}

function LostDialog({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const { update } = useLeadMutations(onClose);
  const reasons = useQuery({ queryKey: ['dictionaries', 'cancel_reason'], queryFn: () => api<Ref[]>('/dictionaries?kind=cancel_reason') });
  const [reason, setReason] = useState('');
  return (
    <Modal
      title="Rad etish sababi"
      description={lead.full_name}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button onClick={() => update.mutate({ id: lead.id, stage: 'lost', lost_reason: reason.trim() })} loading={update.isPending} disabled={reason.trim().length < 2}>
            Saqlash
          </Button>
        </>
      }
    >
      {(reasons.data?.length ?? 0) > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {reasons.data?.map((r) => (
            <button key={r.id} type="button" onClick={() => setReason(r.name)} className={clsx('h-8 rounded-full border px-3 text-[13px]', reason === r.name ? 'border-brand bg-brand-soft text-brand-strong' : 'border-line hover:border-brand/50')}>
              {r.name}
            </button>
          ))}
        </div>
      )}
      <TextareaField label="Sabab" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} required placeholder="Masalan: narx qimmatlik qildi" hint="Sabablar keyin hisobotda ko'rinadi — nimani yaxshilash kerakligini bilasiz" />
    </Modal>
  );
}

function ConvertDialog({ lead, onClose, onDone }: { lead: Lead; onClose: () => void; onDone: () => void }) {
  const router = useRouter();
  const { refresh, toast } = useLeadMutations();
  const queryClient = useQueryClient();
  const convert = useMutation({
    mutationFn: () => api<{ student_id: string }>(`/leads/${lead.id}/convert`, { method: 'POST' }),
    onSuccess: async (result) => {
      await Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: ['students'] })]);
      toast.success("O'quvchi yaratildi. Endi uni guruhga qo'shing");
      onClose();
      onDone();
      router.push(`/students/${result.student_id}`);
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <ConfirmDialog
      title="O'quvchiga aylantirish"
      message={t("«{name}» uchun o'quvchi kartochkasi yaratiladi (ism, telefon va filial liddan olinadi). Keyin uni guruhga qo'shasiz.", { name: lead.full_name })}
      confirmLabel="O'quvchiga aylantirish"
      pending={convert.isPending}
      onConfirm={() => convert.mutate()}
      onClose={onClose}
    />
  );
}
