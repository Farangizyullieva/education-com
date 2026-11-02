'use client';

import { ChangePasswordCard } from '@/components/change-password';
import { Avatar, PageHeader, Panel } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';

// O'qituvchi profili: ma'lumotlarni ko'rish va parolni almashtirish
export default function TeacherProfilePage() {
  const { me } = useAuth();
  return (
    <>
      <PageHeader title="Profil" description="Akkaunt ma'lumotlari va xavfsizlik" />
      <div className="max-w-2xl space-y-4">
        <Panel className="flex items-center gap-4 p-5">
          <Avatar name={me.full_name} src={me.photo_url} size="lg" />
          <div className="min-w-0">
            <p className="text-lg font-semibold">{me.full_name}</p>
            <p className="text-sm text-muted">{me.role_names.map((name) => t(name)).join(', ')}</p>
            <p className="text-sm text-muted">{me.tenant_name}</p>
          </div>
        </Panel>
        <ChangePasswordCard />
      </div>
    </>
  );
}
