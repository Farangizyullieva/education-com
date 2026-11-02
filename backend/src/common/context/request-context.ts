import { AsyncLocalStorage } from 'node:async_hooks';
import type { PermissionCode, Scope } from '../auth/permissions.catalog';

export interface AuthContext {
  userId: string;
  tenantId: string;
  fullName: string;
  roles: string[];
  roleNames: string[];
  /** Har bir ruxsat uchun rollar bo'yicha eng keng scope */
  permissions: Partial<Record<PermissionCode, Scope>>;
  /** Foydalanuvchiga biriktirilgan filiallar. Bo'sh ro'yxat HECH QANDAY filial emas (faqat `allBranches` bo'lsa hammasi) */
  allowedBranchIds: string[];
  /** Faqat filialga biriktirilmagan direktor (owner) barcha filiallarni ko'radi; boshqa har bir rol faqat o'z filiallarida ishlaydi */
  allBranches: boolean;
}

export interface RequestContext {
  requestId: string;
  ip?: string;
  userAgent?: string;
  auth?: AuthContext;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const RequestContextStore = {
  run: <T>(ctx: RequestContext, fn: () => T): T => storage.run(ctx, fn),
  get: (): RequestContext | undefined => storage.getStore(),
  auth(): AuthContext {
    const auth = storage.getStore()?.auth;
    if (!auth) throw new Error('Auth context is not set');
    return auth;
  },
};
