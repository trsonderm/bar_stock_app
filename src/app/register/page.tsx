'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../login/login.module.css'; // Reusing login styles for consistency

export default function RegisterPage() {
    const [formData, setFormData] = useState({
        companyName: '',
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        confirmPassword: ''
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [verificationPending, setVerificationPending] = useState(false);
    const [registeredEmail, setRegisteredEmail] = useState('');
    const router = useRouter();

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (formData.password !== formData.confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        setLoading(true);

        try {
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            const data = await res.json();

            if (res.ok) {
                if (data.requiresVerification) {
                    setRegisteredEmail(formData.email);
                    setVerificationPending(true);
                } else {
                    router.push('/login?registered=true');
                }
            } else {
                setError(data.error || 'Registration failed');
            }
        } catch (err) {
            setError('An error occurred');
        } finally {
            setLoading(false);
        }
    };

    if (verificationPending) {
        return (
            <div className={styles.container}>
                <div className={styles.card} style={{ maxWidth: '420px', width: '100%', textAlign: 'center' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✉️</div>
                    <h1 className={styles.title} style={{ fontSize: '1.4rem' }}>Check your inbox</h1>
                    <p style={{ color: '#94a3b8', marginBottom: '0.75rem', lineHeight: 1.6 }}>
                        We sent a verification email to:
                    </p>
                    <p style={{ color: '#d97706', fontWeight: 600, marginBottom: '1rem', wordBreak: 'break-all' }}>
                        {registeredEmail}
                    </p>
                    <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                        Click the link in the email to activate your account. The link expires in 24 hours.
                        If you don't see it, check your spam folder.
                    </p>
                    <a href="/login" className={styles.link}>Back to Login</a>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.card} style={{ maxWidth: '400px', width: '100%' }}>
                <h1 className={styles.title}>Start Your Trial</h1>
                <p style={{ textAlign: 'center', marginBottom: '1.5rem', color: '#94a3b8' }}>
                    Create your organization account
                </p>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <input
                        type="text"
                        name="companyName"
                        placeholder="Company Name"
                        value={formData.companyName}
                        onChange={handleChange}
                        className={styles.input} // Need to ensure styles exist or use inline
                        style={{ padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #4b5563', background: '#1f2937', color: 'white' }}
                        required
                    />
                    <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                        <input
                            type="text"
                            name="firstName"
                            placeholder="First Name"
                            value={formData.firstName}
                            onChange={handleChange}
                            style={{ flex: 1, minWidth: 0, padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #4b5563', background: '#1f2937', color: 'white' }}
                            required
                        />
                        <input
                            type="text"
                            name="lastName"
                            placeholder="Last Name"
                            value={formData.lastName}
                            onChange={handleChange}
                            style={{ flex: 1, minWidth: 0, padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #4b5563', background: '#1f2937', color: 'white' }}
                            required
                        />
                    </div>
                    <input
                        type="email"
                        name="email"
                        placeholder="Admin Email"
                        value={formData.email}
                        onChange={handleChange}
                        style={{ padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #4b5563', background: '#1f2937', color: 'white' }}
                        required
                    />
                    <input
                        type="password"
                        name="password"
                        placeholder="Password"
                        value={formData.password}
                        onChange={handleChange}
                        style={{ padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #4b5563', background: '#1f2937', color: 'white' }}
                        required
                    />
                    <input
                        type="password"
                        name="confirmPassword"
                        placeholder="Confirm Password"
                        value={formData.confirmPassword}
                        onChange={handleChange}
                        style={{ padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #4b5563', background: '#1f2937', color: 'white' }}
                        required
                    />

                    {error && <p className={styles.error}>{error}</p>}

                    <button
                        type="submit"
                        disabled={loading}
                        className={styles.submitBtn}
                    >
                        {loading ? 'Creating Account...' : 'Sign Up'}
                    </button>
                </form>
                <div className={styles.footer}>
                    <a href="/login" className={styles.link}>Already have an account? Login</a>
                </div>
            </div>
        </div>
    );
}
