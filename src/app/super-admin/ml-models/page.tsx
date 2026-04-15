import { requireSuperAdmin } from '@/lib/auth-server';
import { redirect } from 'next/navigation';
import MLModelsClient from './MLModelsClient';

export default async function MLModelsPage() {
  const session = await requireSuperAdmin();
  if (!session) redirect('/login');
  return <MLModelsClient />;
}
