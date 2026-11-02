import { redirect } from 'next/navigation';

// Eski O'quvchi kirish manzili: endi hamma yagona /login sahifasidan kiradi
export default function LegacyLoginRedirect(): never {
  redirect('/login');
}
