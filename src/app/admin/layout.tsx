import { getSession } from '@/lib/auth';
import AdminNav from './AdminNav';
import styles from './admin.module.css';

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getSession();

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1 className={styles.title}>Admin Panel</h1>
                {session && <AdminNav />}
            </header>
            <main style={{ marginTop: '2rem' }}>
                {children}
            </main>
        </div>
    );
}
