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
                <div>
                    <h1 className={styles.title} style={{ fontSize: '1.2rem', marginBottom: '0.2rem' }}>Admin Panel</h1>
                    <div style={{ fontSize: '0.8rem', color: '#9ca3af', fontWeight: 'normal' }}>Fosters Bars</div>
                </div>
                {session && <AdminNav user={session} />}
            </header>
            <main style={{ marginTop: '2rem' }}>
                {children}
            </main>
        </div>
    );
}
