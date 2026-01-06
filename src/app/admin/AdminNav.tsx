'use client';
import { usePathname, useRouter } from 'next/navigation';
import styles from './admin.module.css';

export default function AdminNav() {
    const pathname = usePathname();
    const router = useRouter();

    const handleLogout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.push('/');
        router.refresh();
    };

    const isActive = (path: string) => pathname === path;

    return (
        <nav className={styles.nav}>
            {isActive('/admin/dashboard') ? <span className={styles.navItemActive}>Dashboard</span> : <a href="/admin/dashboard" className={styles.navItem}>Dashboard</a>}
            {isActive('/admin/users') ? <span className={styles.navItemActive}>Users</span> : <a href="/admin/users" className={styles.navItem}>Users</a>}
            {isActive('/admin/prices') ? <span className={styles.navItemActive}>Prices</span> : <a href="/admin/prices" className={styles.navItem}>Prices</a>}
            {isActive('/admin/categories') ? <span className={styles.navItemActive}>Categories</span> : <a href="/admin/categories" className={styles.navItem}>Categories</a>}
            {isActive('/admin/query') ? <span className={styles.navItemActive}>Query</span> : <a href="/admin/query" className={styles.navItem}>Query</a>}
            {isActive('/admin/settings') ? <span className={styles.navItemActive}>Settings</span> : <a href="/admin/settings" className={styles.navItem}>Settings</a>}
            <a href="/inventory" className={styles.navItem} target="_blank">Stock View</a>
            <button
                onClick={handleLogout}
                className={styles.navItem}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 'inherit' }}
            >
                Logout
            </button>
        </nav>
    );
}
