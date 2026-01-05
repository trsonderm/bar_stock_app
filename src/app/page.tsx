'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import styles from './login.module.css';

export default function LoginPage() {
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
          router.push('/admin/dashboard');
        } else {
          router.push('/inventory');
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

  const appendDigit = (digit: string) => {
    if (pin.length < 4) {
      setPin(prev => prev + digit);
    }
  };

  const clearPin = () => setPin('');
  const backspace = () => setPin(prev => prev.slice(0, -1));

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Stock Login</h1>

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
        >
          {loading ? 'Verifying...' : 'ENTER'}
        </button>
      </div>

      <div className={styles.footer}>
        <a href="/admin/login" className={styles.link} style={{
          display: 'inline-block',
          marginTop: '1rem',
          padding: '0.75rem 1.5rem',
          background: '#4b5563',
          color: 'white',
          borderRadius: '0.5rem',
          textDecoration: 'none',
          fontWeight: 'bold'
        }}>
          Admin Access
        </a>
      </div>
    </div>
  );
}
