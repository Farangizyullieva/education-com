import { Tx } from '../../common/db/prisma.service';

/**
 * Coin qoidalari (hammasi serverda; mijozdan kelgan qiymatga ishonilmaydi):
 *  - vazifani o'z vaqtida topshirish: +10, kechiktirib: +5 (har bir vazifa uchun bir marta);
 *  - o'qituvchi baholaganda: ball foiziga qarab 0..20 qo'shimcha (har bir vazifa uchun bir marta);
 *  - savolga to'g'ri javob: savolning coini (har bir savol uchun bir marta).
 */
export const COINS = { submitOnTime: 10, submitLate: 5, gradeBonusMax: 20 } as const;

export type CoinReason = 'homework_submit' | 'homework_grade' | 'quiz';

/** (o'quvchi, sabab, ob'ekt) bo'yicha yagona: takroriy chaqiruv ikkinchi marta coin bermaydi. Berilgan miqdorni qaytaradi (0 — oldin berilgan) */
export async function awardCoins(tx: Tx, tenantId: string, studentId: string, reason: CoinReason, refId: string, amount: number): Promise<number> {
  if (amount <= 0) return 0;
  const created = await tx.coinTransaction.createMany({ data: [{ tenantId, studentId, reason, refId, amount }], skipDuplicates: true });
  return created.count > 0 ? amount : 0;
}

export async function coinBalance(tx: Tx, studentId: string): Promise<number> {
  const sum = await tx.coinTransaction.aggregate({ where: { studentId }, _sum: { amount: true } });
  return sum._sum.amount ?? 0;
}

export const gradeBonus = (score: number, maxScore: number): number => (maxScore > 0 ? Math.round((Math.min(score, maxScore) / maxScore) * COINS.gradeBonusMax) : 0);
