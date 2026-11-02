/**
 * "Nega kira olmayapman?" diagnostikasi. Bazadagi akkauntlarni ko'rsatadi va har biri uchun parol, qulf, faollik va filialni tekshiradi.
 * Ishga tushirish:  pnpm db:check-logins
 * Hech narsani o'zgartirmaydi (faqat o'qiydi). Parollar chiqarilmaydi.
 */
import 'dotenv/config';
import { verify } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';

const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'demo-parol-2026';
const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_MIGRATE_URL });

async function main(): Promise<void> {
  const slug = process.env.DEFAULT_TENANT_SLUG || undefined;
  const tenants = await db.tenant.findMany({ select: { id: true, slug: true } });
  console.log(`Tashkilotlar bazada: ${tenants.map((t) => t.slug).join(', ') || '(yo\'q)'}`);
  console.log(`.env DEFAULT_TENANT_SLUG: ${slug ?? '(bo\'sh — birinchi tashkilot ishlatiladi)'}`);
  if (slug && !tenants.some((t) => t.slug === slug)) console.log(`  ⚠ Bu slug bazada yo'q! Kirish "Login yoki parol noto'g'ri" deydi. .env dagi slug'ni yuqoridagilardan biriga tenglang.`);
  const tenant = tenants.find((t) => t.slug === slug) ?? tenants[0];
  if (!tenant) {
    console.log('Baza bo\'sh. Avval: pnpm db:migrate && pnpm db:seed');
    return;
  }
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenant.id}, true)`;
    const users = await tx.user.findMany({ orderBy: { createdAt: 'asc' }, select: { phone: true, email: true, fullName: true, isActive: true, passwordHash: true, failedLoginCount: true, lockedUntil: true, roles: { select: { role: { select: { code: true } } } }, branches: { select: { branchId: true } } } });
    console.log(`\nFoydalanuvchilar (${tenant.slug}): ${users.length} ta\n`);
    if (!users.length) {
      console.log("Hech kim yo'q. Direktor yaratish: pnpm db:seed, demo xodimlar: pnpm db:demo");
      return;
    }
    const ownerPhone = process.env.SEED_OWNER_PHONE;
    const ownerPassword = process.env.SEED_OWNER_PASSWORD;
    for (const u of users.slice(0, 40)) {
      const roles = u.roles.map((r) => r.role.code);
      const isOwner = roles.includes('owner');
      const candidates = [DEMO_PASSWORD, ...(isOwner && ownerPassword ? [ownerPassword] : [])];
      let which: string | null = null;
      for (const c of candidates) if (await verify(u.passwordHash, c).catch(() => false)) which = c === DEMO_PASSWORD ? 'demo-parol' : '.env SEED_OWNER_PASSWORD';
      const problems: string[] = [];
      if (!u.isActive) problems.push('AKKAUNT O\'CHIRILGAN (is_active=false)');
      if (u.lockedUntil && u.lockedUntil > new Date()) problems.push(`QULFLANGAN ${u.lockedUntil.toISOString()} gacha (${u.failedLoginCount} marta xato)`);
      if (!isOwner && u.branches.length === 0 && !roles.every((r) => r === 'student' || r === 'parent')) problems.push("filial biriktirilmagan (kirasiz, lekin hech narsa ko'rmaysiz)");
      if (!which) problems.push(`parol demo-parol ham${isOwner ? ' va .env SEED_OWNER_PASSWORD ham' : ''} emas`);
      console.log(`${(u.phone ?? u.email ?? '').padEnd(16)} ${roles.join(',').padEnd(18)} ${u.fullName.padEnd(26)} parol: ${which ?? '?'}${problems.length ? '\n    ⚠ ' + problems.join('\n    ⚠ ') : '  ✓'}`);
    }
    if (ownerPhone && !users.some((u) => u.phone === ownerPhone)) console.log(`\n⚠ .env dagi SEED_OWNER_PHONE (${ownerPhone}) bazada yo'q. Direktor shu raqam bilan kira olmaydi.`);
    if (users.length > 40) console.log(`... va yana ${users.length - 40} ta`);
  });
  console.log('\nKirish: http://localhost:3000/login — telefonni +998 bilan, parolni yuqoridagi manbaga mos yozing.');
}
main().finally(() => db.$disconnect());
