'use client';

import { useMutation } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/components/toast';
import { Button, Field, Panel } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';

const MIN_LENGTH = 10; // backend (employees.dto) bilan bir xil parol siyosati

/**
 * Xodim (o'qituvchi, administrator, ...) o'z parolini almashtiradi: POST /auth/password.
 * Muvaffaqiyatda server barcha sessiyalarni bekor qiladi, shuning uchun foydalanuvchi qayta kirishi kerak.
 */
export function ChangePasswordCard() {
  const { logout } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mismatch = again.length > 0 && next !== again;
  const change = useMutation({
    mutationFn: () => api('/auth/password', { method: 'POST', body: { current_password: current, new_password: next } }),
    onSuccess: async () => {
      toast.success(t('Parol almashtirildi. Qayta kiring.'));
      await logout();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.details.length) setErrors(e.fieldErrors());
      else toast.error(e instanceof ApiError ? e.message : t('Xatolik yuz berdi'));
    },
  });
  return (
    <Panel className="p-5">
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
          <KeyRound className="size-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{t('Parolni almashtirish')}</h2>
          <p className="mt-1 text-sm text-muted">{t("Parol almashgach barcha qurilmalardan chiqarilasiz va qayta kirishingiz kerak bo'ladi.")}</p>
          <div className="mt-4 max-w-sm space-y-3">
            <Field label={t('Joriy parol')} type="password" autoComplete="current-password" value={current} onChange={(e) => { setCurrent(e.target.value); setErrors({}); }} error={errors.current_password} />
            <Field label={t('Yangi parol')} type="password" autoComplete="new-password" value={next} onChange={(e) => { setNext(e.target.value); setErrors({}); }} error={errors.new_password} hint={t('Kamida {n} ta belgi', { n: MIN_LENGTH })} />
            <Field label={t('Yangi parolni takrorlang')} type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} error={mismatch ? t('Parollar mos emas') : undefined} />
            <Button loading={change.isPending} disabled={!current || next.length < MIN_LENGTH || next !== again} onClick={() => change.mutate()}>
              {t('Parolni almashtirish')}
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  );
}
