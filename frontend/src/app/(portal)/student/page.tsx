'use client';

import { StudentApp } from '@/components/student-app';
import { useAuth } from '@/lib/auth';

// O'quvchi kabineti: butun ilova `StudentApp` ichida (preview sahifasi ham shuni ishlatadi)
export default function PortalPage() {
  const { logout } = useAuth();
  return <StudentApp onLogout={logout} />;
}
