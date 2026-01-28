'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import styles from './admin.module.css';
import NotificationBell from '@/components/NotificationBell';

export default function AdminNav() {
    const pathname = usePathname();
    const router = useRouter();

    const handleLogout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.push('/');
        router.refresh();
    };

    const isActive = (path: string) => pathname === path;

    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Location Logic
    const [myLocations, setMyLocations] = useState<{ id: number, name: string }[]>([]);
    const [currentLocName, setCurrentLocName] = useState('');
    const [locDropdownOpen, setLocDropdownOpen] = useState(false);

    useEffect(() => {
        // Fetch locations
        fetch('/api/user/locations')
            .then(r => r.json())
            .then(data => {
                if (data.locations) {
                    setMyLocations(data.locations);

                    // Determine current (from cookie or default)
                    const match = document.cookie.match(new RegExp('(^| )current_location_id=([^;]+)'));
                    const cookieId = match ? parseInt(match[2]) : null;

                    if (data.locations.length > 0) {
                        let selected = data.locations[0];
                        if (cookieId) {
                            const found = data.locations.find((l: any) => l.id === cookieId);
                            if (found) selected = found;
                        } else {
                            // Set default cookie if none
                            document.cookie = `current_location_id=${selected.id}; path=/; max-age=31536000`; // 1 year
                        }
                        setCurrentLocName(selected.name);
                    }
                }
            });
    }, []);

    const handleSelectLocation = (loc: { id: number, name: string }) => {
        document.cookie = `current_location_id=${loc.id}; path=/; max-age=31536000`; // 1 year
        setCurrentLocName(loc.name);
        setLocDropdownOpen(false);
        window.location.reload(); // Reload to refresh data with new location context
    };

    return (
        <nav className={styles.nav}>
            <Link href="/admin/dashboard" className={isActive('/admin/dashboard') ? styles.navItemActive : styles.navItem}>Dashboard</Link>
            <Link href="/admin/prices" className={isActive('/admin/prices') ? styles.navItemActive : styles.navItem}>Prices</Link>
            <Link href="/admin/categories" className={isActive('/admin/categories') ? styles.navItemActive : styles.navItem}>Categories</Link>
            <Link href="/admin/products" className={isActive('/admin/products') ? styles.navItemActive : styles.navItem}>Product List</Link>
            <Link href="/admin/query" className={isActive('/admin/query') ? styles.navItemActive : styles.navItem}>Query</Link>
            <Link href="/inventory" className={isActive('/inventory') ? styles.navItemActive : styles.navItem} target="_blank">Stock View</Link>

            {/* Reports Dropdown */}
            <Link href="/admin/reports/bottle-levels" className={isActive('/admin/reports/bottle-levels') ? styles.navItemActive : styles.navItem}>Bottle Levels</Link>
            <Link href="/admin/reports/smart-order" className={isActive('/admin/reports/smart-order') ? styles.navItemActive : styles.navItem}>Smart Order</Link>

            {/* Location Switcher */}
            {myLocations.length > 1 && (
                <div
                    className={styles.dropdownContainer}
                    onMouseEnter={() => setLocDropdownOpen(true)}
                    onMouseLeave={() => setLocDropdownOpen(false)}
                >
                    <button
                        className={styles.navItem}
                        onClick={() => setLocDropdownOpen(!locDropdownOpen)}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '5px' }}
                    >
                        📍 {currentLocName} ▼
                    </button>
                    {locDropdownOpen && (
                        <div className={styles.dropdownMenu}>
                            {myLocations.map(loc => (
                                <div
                                    key={loc.id}
                                    className={styles.dropdownItem}
                                    onClick={() => handleSelectLocation(loc)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    {loc.name}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
            {myLocations.length === 1 && (
                <span className={styles.navItem} style={{ color: '#9ca3af', cursor: 'default' }}>
                    📍 {currentLocName}
                </span>
            )}

            {/* Notification Bell */}
            <div style={{ display: 'flex', alignItems: 'center', marginRight: '1rem' }}>
                <NotificationBell />
            </div>

            {/* Settings Dropdown */}
            <div
                className={styles.dropdownContainer}
                ref={dropdownRef}
                onMouseEnter={() => setDropdownOpen(true)}
                onMouseLeave={() => setDropdownOpen(false)}
            >
                <button
                    className={`${styles.navItem} ${dropdownOpen ? styles.dropdownActive : ''}`}
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 'inherit', display: 'flex', alignItems: 'center', gap: '5px' }}
                >
                    Settings ▼
                </button>
                {dropdownOpen && (
                    <div className={styles.dropdownMenu}>
                        <Link href="/admin/settings" className={styles.dropdownItem}>General Settings</Link>
                        <Link href="/admin/settings/reporting" className={styles.dropdownItem}>Reporting</Link>
                        <Link href="/admin/settings/ordering" className={styles.dropdownItem}>Automated Ordering</Link>
                        <Link href="/admin/users" className={styles.dropdownItem}>Users</Link>
                        <Link href="/admin/billing" className={styles.dropdownItem}>Billing</Link>
                        <Link href="/admin/help" className={styles.dropdownItem}>Help</Link>
                        <Link href="/admin/suppliers" className={styles.dropdownItem}>Suppliers</Link>
                        <Link href="/admin/settings/locations" className={styles.dropdownItem}>Locations</Link>
                    </div>
                )}
            </div>

            <button
                onClick={handleLogout}
                className={styles.navItem}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 'inherit', marginLeft: 'auto' }}
            >
                Logout
            </button>
        </nav>
    );
}
