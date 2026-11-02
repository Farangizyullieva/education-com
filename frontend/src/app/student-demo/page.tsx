'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { StudentApp } from '@/components/student-app';
import { setMockApi } from '@/lib/api';
import { mockStudentApi } from '@/lib/mock-student';

/**
 * O'quvchi panelining namunaviy ko'rinishi (serverga ulanmagan, kirish shart emas): http://localhost:3000/student-demo
 * Ma'lumotlar `lib/mock-student.ts` dan; vazifa topshirish va savollarga javob xotirada ishlaydi (sahifa yangilansa qayta boshlanadi).
 * Kerak bo'lmasa shu papka va lib/mock-student.ts ni o'chirib tashlash mumkin.
 */
export default function StudentDemoPage() {
  const router = useRouter();
  // Mock'ni birinchi so'rovdan oldin o'rnatish uchun render vaqtida (bir marta)
  useState(() => {
    if (typeof window !== 'undefined') setMockApi(mockStudentApi);
    return null;
  });
  return <StudentApp demo onLogout={() => router.push('/login')} />;
}
