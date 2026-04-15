import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import InsightsClient from './InsightsClient';

export default async function InsightsPage() {
  const session = await getSession();
  if (!session || session.role !== 'admin') redirect('/login');
  return <InsightsClient />;
}
