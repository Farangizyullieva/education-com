// Lidlar: sotuv voronkasi bosqichlari va tiplari
import type { Ref } from './academic';

export type Temperature = 'hot' | 'warm' | 'cold';
export type PreferredTime = 'morning' | 'afternoon' | 'evening' | 'weekend';
export type ActivityKind = 'note' | 'call' | 'message' | 'visit';
export type LeadStage = 'new' | 'contacted' | 'trial' | 'contract' | 'enrolled' | 'lost';

export interface Lead {
  id: string;
  full_name: string;
  phone: string | null;
  branch: Ref;
  discipline: Ref | null;
  level: Ref | null;
  ad_source: Ref | null;
  owner: { id: string; full_name: string } | null;
  stage: LeadStage;
  note: string | null;
  lost_reason: string | null;
  student_id: string | null;
  gender: 'male' | 'female' | null;
  birth_date: string | null;
  guardian_name: string | null;
  guardian_relation: string | null;
  guardian_phone: string | null;
  school: string | null;
  preferred_time: PreferredTime | null;
  temperature: Temperature;
  next_contact_at: string | null;
  trial_at: string | null;
  created_at: string;
  last_activity_at: string;
}

export interface LeadEvent {
  id: string;
  type: 'created' | 'stage' | 'converted' | ActivityKind;
  from_stage: LeadStage | null;
  to_stage: LeadStage | null;
  text: string | null;
  actor: string | null;
  created_at: string;
}

export const STAGES: { id: LeadStage; label: string; color: string }[] = [
  { id: 'new', label: 'Yangi', color: '#64748b' },
  { id: 'contacted', label: "Bog'lanildi", color: '#2563eb' },
  { id: 'trial', label: 'Sinov darsi', color: '#7c3aed' },
  { id: 'contract', label: 'Shartnoma', color: '#d97706' },
  { id: 'enrolled', label: "O'quvchi bo'ldi", color: '#15803d' },
  { id: 'lost', label: 'Rad etdi', color: '#dc2626' },
];
export const stageOf = (id: LeadStage) => STAGES.find((s) => s.id === id) as (typeof STAGES)[number];

/** "3 kun oldin" ko'rinishidagi qisqa vaqt */
export function ago(iso: string): { text: string; vars?: Record<string, number> } {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return minutes < 2 ? { text: 'Hozirgina' } : { text: '{n} daqiqa oldin', vars: { n: minutes } };
  const hours = Math.round(minutes / 60);
  if (hours < 24) return { text: '{n} soat oldin', vars: { n: hours } };
  return { text: '{n} kun oldin', vars: { n: Math.round(hours / 24) } };
}

export const TEMPERATURES: { id: Temperature; label: string; tone: 'danger' | 'warning' | 'info' }[] = [
  { id: 'hot', label: 'Issiq', tone: 'danger' },
  { id: 'warm', label: 'Iliq', tone: 'warning' },
  { id: 'cold', label: 'Sovuq', tone: 'info' },
];
export const PREFERRED_TIMES: { id: PreferredTime; label: string }[] = [
  { id: 'morning', label: 'Ertalab (9–12)' },
  { id: 'afternoon', label: 'Kunduzi (12–17)' },
  { id: 'evening', label: 'Kechqurun (17–21)' },
  { id: 'weekend', label: 'Dam olish kunlari' },
];
export const ACTIVITY_KINDS: { id: ActivityKind; label: string }[] = [
  { id: 'note', label: 'Izoh' },
  { id: 'call', label: "Qo'ng'iroq" },
  { id: 'message', label: 'Xabar' },
  { id: 'visit', label: 'Tashrif' },
];
export const GUARDIAN_RELATIONS = ['Ona', 'Ota', 'Bobo/Buvi', 'Aka/Opa', 'Boshqa'];

/** Keyingi bog'lanish holati: faqat yopilmagan lidlar uchun. Toshkent sanasi bo'yicha "bugun" */
export function followUpState(lead: Pick<Lead, 'next_contact_at' | 'stage'>): 'overdue' | 'today' | 'later' | null {
  if (!lead.next_contact_at || lead.stage === 'enrolled' || lead.stage === 'lost') return null;
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' });
  const day = fmt.format(new Date(lead.next_contact_at));
  const today = fmt.format(new Date());
  return day < today ? 'overdue' : day === today ? 'today' : 'later';
}

/** Tug'ilgan sanadan yosh (to'liq yil) */
export function ageOf(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const b = new Date(`${birthDate}T00:00:00Z`);
  const now = new Date();
  let age = now.getUTCFullYear() - b.getUTCFullYear();
  if (now.getUTCMonth() < b.getUTCMonth() || (now.getUTCMonth() === b.getUTCMonth() && now.getUTCDate() < b.getUTCDate())) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

/** <input type="datetime-local"> qiymatini (brauzer vaqti) ISO satrga aylantiradi; bo'sh — null */
export const localToIso = (value: FormDataEntryValue | null | undefined): string | null => (typeof value === 'string' && value ? new Date(value).toISOString() : null);

/** ISO vaqtni datetime-local input uchun (brauzer vaqti) formatga */
export const isoToLocal = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
