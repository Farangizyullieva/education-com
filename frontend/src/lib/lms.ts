// Ta'lim moduli (materiallar, uy vazifalari, javoblar) — backend javoblari turlari va umumiy yordamchilar.
// Backend: LmsModule (xodim/o'qituvchi tomoni) va PortalModule (o'quvchi tomoni). Ruxsat tekshiruvi har doim serverda.

export interface FileLink {
  url: string | null;
  name: string | null;
  mime: string;
  size: number;
}

/** Material/vazifa bog'langan dars (bo'lmasa — butun guruh uchun) */
export interface LessonRef {
  id: string;
  date: string;
  start_at?: string;
}

export interface Material {
  id: string;
  title: string;
  description: string | null;
  link: string | null;
  file: FileLink | null;
  lesson: LessonRef | null;
  created_at: string;
}

export interface Assignment {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  max_score: number;
  file: FileLink | null;
  lesson: LessonRef | null;
  created_at: string;
  submitted: number;
  graded: number;
}

export interface SubmissionRow {
  student: { id: string; number: number; full_name: string; photo_url: string | null };
  submission: { id: string; text: string | null; file: FileLink | null; submitted_at: string; score: number | null; feedback: string | null; graded_at: string | null } | null;
}

export interface SubmissionsView {
  assignment: { id: string; title: string; max_score: number; due_date: string | null };
  rows: SubmissionRow[];
}

export type PortalAssignmentStatus = 'new' | 'overdue' | 'submitted' | 'graded';

export interface PortalAssignment {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  max_score: number;
  file: FileLink | null;
  group: { id: string; number: number; name: string };
  lesson: LessonRef | null;
  created_at: string;
  status: PortalAssignmentStatus;
  submission: { text: string | null; file: FileLink | null; submitted_at: string; score: number | null; feedback: string | null } | null;
}

export interface PortalMaterial extends Material {
  group: { id: string; number: number; name: string };
}

export interface PortalStats {
  homework: { total: number; submitted: number; graded: number; missed: number; average: number | null };
}

/** Server ruxsat bergan fayl turlari (PDF, rasm, Word/Excel/PowerPoint, ZIP) va hajm — faqat qulaylik uchun; haqiqiy tekshiruv backend'da */
export const DOCUMENT_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.zip,.docx,.xlsx,.pptx';
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export const formatBytes = (bytes: number): string => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** Fayl tanlanganda: katta fayl serverga yuborilmasdan rad etiladi */
export const fileTooLarge = (file: File | null | undefined): boolean => Boolean(file && file.size > MAX_DOCUMENT_BYTES);

export const ASSIGNMENT_STATUS: Record<PortalAssignmentStatus, { label: string; tone: 'info' | 'danger' | 'warning' | 'success' }> = {
  new: { label: 'Yangi', tone: 'info' },
  overdue: { label: "Muddati o'tgan", tone: 'danger' },
  submitted: { label: 'Tekshirilmoqda', tone: 'warning' },
  graded: { label: 'Baholangan', tone: 'success' },
};

export interface ToReview {
  total: number;
  items: { assignment_id: string; title: string; due_date: string | null; study_unit: { id: string; name: string }; pending: number; oldest_submitted_at: string | null }[];
}

/** Video havola (YouTube, Vimeo, Google Drive, Telegram...) — ro'yxatda "Video" belgisi bilan ko'rsatiladi */
const VIDEO_HOSTS = ['youtube.com', 'youtu.be', 'vimeo.com', 'drive.google.com', 'rutube.ru', 't.me', 'loom.com', 'zoom.us'];
export function isVideoLink(link: string | null): boolean {
  if (!link) return false;
  try {
    const host = new URL(link).hostname.replace(/^www\./, '').toLowerCase();
    return VIDEO_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export type MatrixStatus = 'pending' | 'missed' | 'submitted' | 'late' | 'graded';

/** Guruh bo'yicha "kim topshirdi, kim topshirmadi" jadvali */
export interface HomeworkMatrix {
  assignments: { id: string; title: string; due_date: string | null; max_score: number }[];
  students: { id: string; number: number; full_name: string; cells: { assignment_id: string; status: MatrixStatus; score: number | null }[] }[];
}

export interface QuizQuestionRow {
  id: string;
  text: string;
  options: string[];
  correct_index: number;
  explanation: string | null;
  coins: number;
  answered: number;
  correct: number;
  created_at: string;
}
