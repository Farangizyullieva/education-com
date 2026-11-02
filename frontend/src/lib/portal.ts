// O'quvchi kabineti: backend (`/portal/*`) javob turlari va umumiy yordamchilar
import { t } from '@/lib/i18n';
import { WEEKDAYS_SHORT, type Mark } from '@/lib/academic';
import type { StudentStatus } from '@/lib/students';

export interface PortalLesson {
  id: string;
  date: string;
  start_at: string;
  end_at: string;
  cancelled: boolean;
  group: string;
  discipline: string;
  teacher: string;
  classroom: string | null;
  mark: Mark | null;
}

export interface PortalMe {
  center: string;
  today: string;
  student: { number: number; full_name: string; phone: string | null; status: StudentStatus; photo_url: string | null; branch: { name: string; address: string | null; phone: string | null } };
  balance: number;
  monthly_price: number;
  next_payment_date: string | null;
  attendance: { marked: number; attended: number; rate: number | null };
  groups: { number: number; name: string; course: string; teacher: string; classroom: string | null; schedule: { days: number[]; start_time: string; end_time: string } | null; price_amount: number; next_payment_date: string | null }[];
  upcoming: PortalLesson[];
}

export interface PortalPayments {
  balance: number;
  entries: { id: string; type: string; amount: number; occurred_at: string; method: string | null; comment: string | null }[];
}

export const ENTRY: Record<string, string> = { payment: "To'lov", subscription: 'Oylik abonement', charge: 'Yechim', reversal: 'Yechim bekor qilindi', refund: 'Qaytarish', adjustment: 'Tuzatish' };
export const weekday = (date: string): string => t(WEEKDAYS_SHORT[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7] as string);
export const shiftMonth = (ym: string, by: number): string => {
  const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + by, 1));
  return d.toISOString().slice(0, 7);
};

