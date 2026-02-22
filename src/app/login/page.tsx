'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from './login.module.css';

function LoginContent() {
  const [mode, setMode] = useState<'pin' | 'email'>('email'); // Default to email for demo
  const [pin, setPin] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const registered = searchParams.get('registered');

  const executeLogin = async (payload: any) => {
    setLoading(true);
    setError('');

    try {
      console.log('Attempting login with payload:', payload);
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      console.log('Fetch response status:', res.status);

      const data = await res.json();

      if (res.ok) {
        console.log('Login success:', data);
        if (data.isSuperAdmin) {
          console.log('Redirecting to super-admin...');
          router.refresh();
          router.push('/super-admin');
        } else if (data.role === 'admin') {
          console.log('Redirecting to admin dashboard...');
          router.refresh();
          // Redirect to admin dashboard
          router.push('/admin/dashboard');
        } else {
          console.log('Redirecting to inventory...');
          router.refresh();
          router.push('/inventory');
        }
      } else {
        console.error('Login failed:', data);
        setError(data.error || 'Login failed');
        setLoading(false);
      }
    } catch (err) {
      setError('An error occurred');
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = mode === 'pin' ? { pin } : { email, password };
    await executeLogin(payload);
  };

  const quickLogin = (type: 'admin' | 'orgA_admin' | 'orgA_staff' | 'orgB_admin' | 'orgB_staff' | 'fosters_admin') => {
    if (type === 'admin') {
      setEmail('admin@topshelf.com');
      setPassword('password');
      executeLogin({ email: 'admin@topshelf.com', password: 'password' });
    } else if (type === 'orgA_admin') {
      setEmail('manager@downtown.com');
      setPassword('password');
      executeLogin({ email: 'manager@downtown.com', password: 'password' });
    } else if (type === 'orgA_staff') {
      setEmail('user@downtown.com');
      setPassword('password');
      executeLogin({ email: 'user@downtown.com', password: 'password' });
    } else if (type === 'orgB_admin') {
      setEmail('manager@uptown.com');
      setPassword('password');
      executeLogin({ email: 'manager@uptown.com', password: 'password' });
    } else if (type === 'orgB_staff') {
      setEmail('user@uptown.com');
      setPassword('password');
      executeLogin({ email: 'user@uptown.com', password: 'password' });
    } else if (type === 'fosters_admin') {
      setEmail('tammy@fosters.com');
      setPassword('password');
      executeLogin({ email: 'tammy@fosters.com', password: 'password' });
    }
  };

  const appendDigit = (digit: string) => {
    if (pin.length < 4) {
      setPin(prev => prev + digit);
    }
  };

  const clearPin = () => setPin('');
  const backspace = () => setPin(prev => prev.slice(0, -1));

  const [showQuickLogin, setShowQuickLogin] = useState(false);

  useEffect(() => {
    fetch('/api/system/settings', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        console.log('Quick Login Check:', data);
        setShowQuickLogin(data.quick_login_enabled);
      })
      .catch(err => console.error('Quick Login Check Failed:', err));
  }, []);

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>{mode === 'pin' ? 'Stock Login' : 'Admin Login'}</h1>

      {registered && <p className={styles.success}>Registration successful. Please login.</p>}

      {mode === 'pin' ? (
        <div className={styles.display}>
          <div className={styles.pinParams}>
            {pin.split('').map(() => '•').join('')}
          </div>
          {error && <p className={styles.error}>{error}</p>}

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

          <div className={styles.actions}>
            <button
              onClick={handleLogin}
              disabled={loading || pin.length < 4}
              className={styles.submitBtn}
            >
              {loading ? 'Verifying...' : 'ENTER'}
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleLogin} className={styles.formStack}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className={styles.input}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className={styles.input}
            required
          />
          {error && <p className={styles.error}>{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className={styles.submitBtn}
          >
            {loading ? 'Logging In...' : 'Login'}
          </button>
        </form>
      )}

      <div className={styles.footer}>
        <button
          onClick={() => { setMode(mode === 'pin' ? 'email' : 'pin'); setError(''); }}
          className={styles.switchBtn}
        >
          {mode === 'pin' ? 'Switch to Admin Email Login' : 'Switch to Staff PIN Login'}
        </button>
      </div>

      {showQuickLogin && (
        <div style={{ marginTop: '2rem', borderTop: '1px solid #374151', paddingTop: '1rem' }}>
          <details className="text-center group cursor-pointer">
            <summary className="text-xs text-gray-500 hover:text-gray-300 uppercase tracking-widest list-none font-bold">
              ▼ Developer Quick Login
            </summary>

            <div style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
              {/* Super Admin */}
              <button
                onClick={() => quickLogin('admin')}
                style={{ padding: '0.5rem', background: '#dc2626', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer', fontSize: '0.8rem', width: '100%' }}
              >
                Dev: Super Admin
              </button>

              {/* Downtown Bar (Org 1) */}
              <div className="border border-gray-700 p-2 rounded">
                <p className="text-xs text-gray-400 mb-2 font-bold">Downtown Bar (Org 1)</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <button
                    onClick={() => quickLogin('orgA_admin')}
                    style={{ padding: '0.4rem', background: '#2563eb', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer', fontSize: '0.75rem' }}
                  >
                    Manager
                  </button>
                  <button
                    onClick={() => quickLogin('orgA_staff')}
                    style={{ padding: '0.4rem', background: '#3b82f6', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer', fontSize: '0.75rem' }}
                  >
                    Staff
                  </button>
                </div>
              </div>

              {/* Uptown Club (Org 2) */}
              <div className="border border-gray-700 p-2 rounded">
                <p className="text-xs text-gray-400 mb-2 font-bold">Uptown Club (Org 2)</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <button
                    onClick={() => quickLogin('orgB_admin')}
                    style={{ padding: '0.4rem', background: '#059669', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer', fontSize: '0.75rem' }}
                  >
                    Manager
                  </button>
                  <button
                    onClick={() => quickLogin('orgB_staff')}
                    style={{ padding: '0.4rem', background: '#10b981', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer', fontSize: '0.75rem' }}
                  >
                    Staff
                  </button>
                </div>
              </div>

              {/* Fosters (Org 3) */}
              <div className="border border-gray-700 p-2 rounded">
                <p className="text-xs text-gray-400 mb-2 font-bold">Fosters (Org 3)</p>
                <button
                  onClick={() => quickLogin('fosters_admin')}
                  style={{ padding: '0.4rem', background: '#d97706', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer', fontSize: '0.75rem', width: '100%' }}
                >
                  Admin (Tammy)
                </button>
              </div>

            </div>
          </details>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className={styles.container}>
      <Suspense fallback={<div>Loading...</div>}>
        <LoginContent />
      </Suspense>
    </div>
  );
}
