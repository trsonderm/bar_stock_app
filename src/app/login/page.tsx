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
  const verified = searchParams.get('verified');
  const oauthError = searchParams.get('error');

  const SSO_LABELS: Record<string, { label: string; bg: string; hoverBg: string; border: string }> = {
    google:    { label: 'Continue with Google',    bg: '#fff',    hoverBg: '#f1f5f9', border: '#d1d5db' },
    github:    { label: 'Continue with GitHub',    bg: '#24292e', hoverBg: '#2d3238', border: '#374151' },
    microsoft: { label: 'Continue with Microsoft', bg: '#2f2f2f', hoverBg: '#3a3a3a', border: '#374151' },
  };
  const SSO_TEXT: Record<string, string> = { google: '#111', github: '#fff', microsoft: '#fff' };
  const SSO_ICONS: Record<string, string> = {
    google: 'G',
    github: 'GH',
    microsoft: 'M',
  };
  const SSO_ERRORS: Record<string, string> = {
    oauth_denied:        'Sign-in was cancelled.',
    oauth_invalid:       'Invalid OAuth response.',
    oauth_state:         'Security check failed. Please try again.',
    oauth_token:         'Failed to exchange token. Check your OAuth app configuration.',
    oauth_no_email:      'Your account has no verified email. Please use email/password login.',
    oauth_error:         'An unexpected error occurred during sign-in.',
    sso_disabled:        'This sign-in provider is currently disabled.',
    sso_not_configured:  'This provider is not fully configured yet.',
    domain_not_allowed:  'Your email domain is not permitted to sign in here.',
    no_account:          'No account found for this identity. Contact your administrator.',
    account_locked:      'Your account has been locked. Contact your administrator.',
    org_disabled:        'Your organization account is suspended.',
  };

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

  const quickLogin = (type: 'admin' | 'orgA_admin' | 'orgA_staff' | 'orgB_admin' | 'orgB_staff' | 'fosters_admin' | 'floyds_admin' | 'floyds_staff') => {
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
    } else if (type === 'floyds_admin') {
      setEmail('admin@floyds.com');
      setPassword('password');
      executeLogin({ email: 'admin@floyds.com', password: 'password' });
    } else if (type === 'floyds_staff') {
      setEmail('staff@floyds.com');
      setPassword('password');
      executeLogin({ email: 'staff@floyds.com', password: 'password' });
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
  const [ssoProviders, setSsoProviders] = useState<string[]>([]);
  const [isRegisteredDevice, setIsRegisteredDevice] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/system/settings', { cache: 'no-store' }).then(r => r.json()).catch(() => ({})),
      fetch('/api/auth/check-station', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ isRegisteredDevice: false })),
    ]).then(([settings, station]) => {
      setShowQuickLogin(settings.quick_login_enabled);
      setSsoProviders(settings.sso_providers || []);
      if (station.isRegisteredDevice) {
        setIsRegisteredDevice(true);
        setMode('pin');
      }
    });
  }, []);

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>{mode === 'pin' ? 'Stock Login' : 'Admin Login'}</h1>

      {registered && <p className={styles.success}>Registration successful. Please login.</p>}
      {verified === 'success' && <p className={styles.success}>✓ Email verified! Your account is now active. Please log in.</p>}
      {verified === 'already' && <p className={styles.success}>✓ Email already verified. Please log in.</p>}
      {verified === 'expired' && <p className={styles.error}>Verification link has expired. Please register again or contact support.</p>}
      {verified === 'invalid' && <p className={styles.error}>Invalid verification link. Please check your email or contact support.</p>}
      {verified === 'error' && <p className={styles.error}>An error occurred during verification. Please try again or contact support.</p>}
      {oauthError && SSO_ERRORS[oauthError] && <p className={styles.error}>{SSO_ERRORS[oauthError]}</p>}

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

      {mode === 'email' && ssoProviders.length > 0 && (
        <div style={{ marginTop: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div style={{ flex: 1, height: '1px', background: '#374151' }} />
            <span style={{ color: '#6b7280', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>or continue with</span>
            <div style={{ flex: 1, height: '1px', background: '#374151' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {ssoProviders.map(provider => {
              const cfg = SSO_LABELS[provider];
              if (!cfg) return null;
              return (
                <a
                  key={provider}
                  href={`/api/auth/oauth/${provider}`}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.625rem',
                    padding: '0.625rem 1rem', borderRadius: '8px', border: `1px solid ${cfg.border}`,
                    background: cfg.bg, color: SSO_TEXT[provider] || '#fff',
                    fontSize: '0.875rem', fontWeight: 600, textDecoration: 'none',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = cfg.hoverBg; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = cfg.bg; }}
                >
                  <span style={{ width: 20, height: 20, borderRadius: 4, background: 'rgba(0,0,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700 }}>
                    {SSO_ICONS[provider]}
                  </span>
                  {cfg.label}
                </a>
              );
            })}
          </div>
        </div>
      )}

      {!isRegisteredDevice && (
        <div className={styles.footer}>
          <button
            type="button"
            onClick={() => { setMode(mode === 'pin' ? 'email' : 'pin'); setError(''); }}
            className={styles.switchBtn}
          >
            {mode === 'pin' ? 'Switch to Admin Email Login' : 'Switch to Staff PIN Login'}
          </button>
        </div>
      )}

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

              {/* Fosters Bars (Org 3) */}
              <div className="border border-gray-700 p-2 rounded">
                <p className="text-xs text-gray-400 mb-2 font-bold">Fosters Bars (Org 3)</p>
                <button
                  onClick={() => quickLogin('fosters_admin')}
                  style={{ padding: '0.4rem', background: '#d97706', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer', fontSize: '0.75rem', width: '100%' }}
                >
                  Admin (Tammy)
                </button>
              </div>

              {/* Floyds (Org 4) */}
              <div className="border border-gray-700 p-2 rounded">
                <p className="text-xs text-gray-400 mb-2 font-bold">Floyds (Org 4)</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <button
                    onClick={() => quickLogin('floyds_admin')}
                    style={{ padding: '0.4rem', background: '#9333ea', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer', fontSize: '0.75rem' }}
                  >
                    Manager
                  </button>
                  <button
                    onClick={() => quickLogin('floyds_staff')}
                    style={{ padding: '0.4rem', background: '#a855f7', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer', fontSize: '0.75rem' }}
                  >
                    Staff
                  </button>
                </div>
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
