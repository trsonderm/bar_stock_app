import { requireSuperAdmin } from '@/lib/auth-server';
import CronAnalyzerClient from './CronAnalyzerClient';

export const metadata = {
    title: 'Cron & Email Analyzer | Super Admin',
};

export default async function CronAnalyzerPage() {
    await requireSuperAdmin();
    return <CronAnalyzerClient />;
}
