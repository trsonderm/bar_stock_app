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
                // Auto-login or redirect to login? 
                // Let's redirect to login for simplicity or assume auto-login if API returns token (which it doesn't usually on register unless we implement it).
                // API will just return success.
                router.push('/login?registered=true');
            } else {
                setError(data.error || 'Registration failed');
            }
        } catch (err) {
            setError('An error occurred');
        } finally {
            setLoading(false);
        }
    };

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
