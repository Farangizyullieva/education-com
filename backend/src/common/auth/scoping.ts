import type { AuthContext } from '../context/request-context';
import { AppError } from '../http/app-error';

/**
 * Branch scoping: har bir foydalanuvchi faqat o'z filiallarini ko'radi. Filial biriktirilmagan xodim HECH NARSA ko'rmaydi
 * (oldin bo'sh ro'yxat "barcha filiallar" edi — xavfli). Istisno: filialga biriktirilmagan direktor (`allBranches`).
 */
export function branchIdFilter(auth: AuthContext): { in: string[] } | undefined {
  return auth.allBranches ? undefined : { in: auth.allowedBranchIds };
}

export function canAccessBranch(auth: AuthContext, branchId: string): boolean {
  return auth.allBranches || auth.allowedBranchIds.includes(branchId);
}

/** Ruxsat etilmagan filial mavjudligini oshkor qilmaslik uchun 404 */
export function assertBranchAccess(auth: AuthContext, branchId: string): void {
  if (!canAccessBranch(auth, branchId)) throw AppError.notFound('Filial');
}
