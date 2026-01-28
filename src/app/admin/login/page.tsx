'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import styles from '../../login/login.module.css';

export default function AdminLoginPage() {
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin }),
            });

            const data = await res.json();

            if (res.ok) {
                if (data.role === 'admin') {
                    router.refresh();
                    // Force full reload so AdminLayout picks up the session cookie immediately
                    window.location.href = '/admin/dashboard';
                } else {
                    setError('Access Denied: Not an admin');
                }
            } else {
                setError(data.error || 'Login failed');
            }
        } catch (err) {
            setError('An error occurred');
        } finally {
            setLoading(false);
        }
    };

    // Reuse keypad logic or just simple input? Result says "Admin link... requires a password 4365".
    // I will use a simple form for admin to look more "official" or just reuse the keypad. Keypad is mobile friendly.

    const appendDigit = (digit: string) => {
        if (pin.length < 4) {
            setPin(prev => prev + digit);
        }
    };

    const clearPin = () => setPin('');
    const backspace = () => setPin(prev => prev.slice(0, -1));


    return (
        <div className={styles.container}>
            <div className={styles.card} style={{ borderColor: 'rgba(127, 29, 29, 0.3)', borderStyle: 'solid', borderWidth: '1px' }}>
                <h1 className={styles.title} style={{ color: '#ef4444' }}>Admin Authentication</h1>

                <div className={styles.display}>
                    <div className={styles.pinParams}>
                        {pin.split('').map(() => '•').join('')}
                    </div>
                    {error && <p className={styles.error}>{error}</p>}
                </div>

                <div className={styles.keypad}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                        <button
                            key={num}
                            onClick={() => appendDigit(num.toString())}
                            className={styles.key}
                            type="button"
                        >
                            {num}
                        </button>
                    ))}
                    <button
                        onClick={clearPin}
                        className={`${styles.key} ${styles.keyClr}`}
                        type="button"
                    >
                        CLR
                    </button>
                    <button
                        onClick={() => appendDigit('0')}
                        className={styles.key}
                        type="button"
                    >
                        0
                    </button>
                    <button
                        onClick={backspace}
                        className={styles.key}
                        type="button"
                    >
                        ⌫
                    </button>
                </div>


                <button
                    onClick={handleLogin}
                    disabled={loading || pin.length < 4}
                    className={styles.submitBtn}
                    style={{ backgroundColor: '#dc2626' }}
                >
                    {loading ? 'UNLOCKING...' : 'ACCESS DASHBOARD'}
                </button>

                <div className={styles.footer}>
                    <a href="/" className={styles.link}>Cancel</a>
                </div>
            </div>
        </div>
    );
}
