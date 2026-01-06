import AdminNav from './AdminNav';
import styles from './admin.module.css';

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1 className={styles.title}>Admin Panel</h1>
                <AdminNav />
            </header>
            <main style={{ marginTop: '2rem' }}>
                {children}
            </main>
        </div>
    );
}
