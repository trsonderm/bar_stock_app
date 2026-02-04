'use client';

import { useState, useEffect } from 'react';
import styles from '../../admin.module.css';

interface Supplier {
    id: number;
    name: string;
    contact_email?: string;
}

interface User {
    id: number;
    first_name: string;
    last_name: string;
    email?: string;
}

interface AIConfig {
    enabled: boolean;
    require_confirmation: boolean;
    cc_user_ids: number[];
    supplier_ids: number[];
}

export default function OrderingSettingsClient() {
    const [config, setConfig] = useState<AIConfig>({
        enabled: false,
        require_confirmation: true,
        cc_user_ids: [],
        supplier_ids: []
    });

    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetch('/api/admin/settings/ordering')
            .then(res => res.json())
            .then(data => {
                if (data.config) setConfig(data.config);
                if (data.suppliers) setSuppliers(data.suppliers);
                if (data.users) setUsers(data.users);
                setLoading(false);
            });
    }, []);

    const toggleSupplier = (id: number) => {
        const current = config.supplier_ids || [];
        if (current.includes(id)) {
            setConfig({ ...config, supplier_ids: current.filter(sId => sId !== id) });
        } else {
            setConfig({ ...config, supplier_ids: [...current, id] });
        }
    };

    const toggleUser = (id: number) => {
        const current = config.cc_user_ids || [];
        if (current.includes(id)) {
            setConfig({ ...config, cc_user_ids: current.filter(uId => uId !== id) });
        } else {
            setConfig({ ...config, cc_user_ids: [...current, id] });
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await fetch('/api/admin/settings/ordering', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            alert('Settings Saved');
        } catch (e) {
            alert('Error saving');
        } finally {
            setSaving(false);
        }
    };

    // --- preview helpers ---
    const getCCNames = () => {
        if (!config.cc_user_ids || config.cc_user_ids.length === 0) return 'None';
        return users
            .filter(u => config.cc_user_ids.includes(u.id))
            .map(u => u.first_name + ' ' + u.last_name)
            .join(', ');
    };

    if (loading) return <div className={styles.container}>Loading...</div>;

    return (
        <div className={styles.container}>
            <h1 className={styles.pageTitle}>Automated AI Ordering</h1>

            <div className={styles.grid}>

                {/* Master Controls */}
                <div className={styles.card}>
                    <div className={styles.cardTitle}>Master Controls</div>

                    <div style={{ padding: '1rem', background: config.enabled ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', borderRadius: '0.5rem', border: config.enabled ? '1px solid #10b981' : '1px solid #ef4444', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <h3 style={{ margin: 0, color: config.enabled ? '#10b981' : '#ef4444' }}>{config.enabled ? 'System Active' : 'System Disabled'}</h3>
                            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.9rem', color: '#9ca3af' }}>{config.enabled ? 'Orders will be generated automatically based on stock.' : 'No automated orders will be created.'}</p>
                        </div>
                        <label className={styles.switch}>
                            <input
                                type="checkbox"
                                checked={config.enabled}
                                onChange={e => setConfig({ ...config, enabled: e.target.checked })}
                            />
                            <span className={styles.slider}></span>
                        </label>
                    </div>

                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={config.require_confirmation}
                                onChange={e => setConfig({ ...config, require_confirmation: e.target.checked })}
                                style={{ width: '20px', height: '20px' }}
                            />
                            <div>
                                <span style={{ display: 'block', fontWeight: 'bold' }}>Require Manual Confirmation</span>
                                <span style={{ fontSize: '0.85rem', color: '#9ca3af' }}>Email manager for approval BEFORE sending to supplier.</span>
                            </div>
                        </label>
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                        <label className={styles.statLabel}>CC Staff on Orders</label>
                        <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #374151', borderRadius: '0.5rem', background: '#1f2937', padding: '0.5rem' }}>
                            {users.map(u => (
                                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem' }}>
                                    <input
                                        type="checkbox"
                                        checked={(config.cc_user_ids || []).includes(u.id)}
                                        onChange={() => toggleUser(u.id)}
                                    />
                                    <span>{u.first_name} {u.last_name} ({u.email || 'No Email'})</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={{ padding: '0.75rem', background: '#374151', borderRadius: '0.5rem', marginBottom: '1rem' }}>
                        <div style={{ fontSize: '0.9rem', color: '#fbbf24', marginBottom: '0.5rem' }}><strong>Testing:</strong> Click below to simulate an automated check. This will create a pending order and generate an approval link.</div>
                        <button
                            type="button"
                            onClick={async () => {
                                const res = await fetch('/api/admin/ordering/generate', { method: 'POST' });
                                const data = await res.json();
                                if (data.link) alert(`Test Order Generated!\nApproval Link: ${data.link}`);
                                else alert(data.message || 'Error');
                            }}
                            className={styles.submitBtn}
                            style={{ background: '#4b5563', marginTop: 0 }}
                        >
                            Run Test Automation
                        </button>
                    </div>

                    <button className={styles.submitBtn} onClick={handleSave} disabled={saving}>
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>

                {/* Automation Rules */}
                <div className={styles.card}>
                    <div className={styles.cardTitle}>Supplier Automation Rule</div>
                    <p style={{ color: '#9ca3af', marginBottom: '1rem' }}>Select which suppliers are eligible for automated reordering. Suppliers <strong>MUST</strong> have an email address.</p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {suppliers.map(s => {
                            const hasEmail = !!s.contact_email;
                            const isEnabled = (config.supplier_ids || []).includes(s.id);

                            return (
                                <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: '#1f2937', borderRadius: '0.5rem', border: isEnabled ? '1px solid #3b82f6' : '1px solid #374151', opacity: hasEmail ? 1 : 0.6 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: isEnabled ? '#3b82f6' : '#6b7280' }}></div>
                                        <div>
                                            <div style={{ fontWeight: 'bold' }}>{s.name}</div>
                                            <div style={{ fontSize: '0.85rem', color: hasEmail ? '#9ca3af' : '#ef4444' }}>
                                                {s.contact_email || 'No Valid Email — Cannot Automate'}
                                            </div>
                                        </div>
                                    </div>

                                    <label className={styles.switch} style={{ pointerEvents: hasEmail ? 'auto' : 'none' }}>
                                        <input
                                            type="checkbox"
                                            checked={isEnabled}
                                            onChange={() => toggleSupplier(s.id)}
                                            disabled={!hasEmail}
                                        />
                                        <span className={styles.slider}></span> {/* Assuming slider CSS exists, else standard checkbox */}
                                        {!hasEmail && <span style={{ marginLeft: '10px', fontSize: '0.8rem', color: '#ef4444' }}>Blocked</span>}
                                    </label>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Email Preview */}
                <div className={styles.card} style={{ gridColumn: 'span 2' }}>
                    <div className={styles.cardTitle}>Email Preview (Demo)</div>
                    <p style={{ color: '#9ca3af', marginBottom: '1rem' }}>This is how the email will look to your suppliers.</p>

                    <div style={{ background: 'white', borderRadius: '0.5rem', overflow: 'hidden', color: '#333', border: '1px solid #ccc', fontFamily: 'Arial, sans-serif' }}>
                        {/* Header */}
                        <div style={{ background: '#f8f8f8', padding: '1rem', borderBottom: '1px solid #eee' }}>
                            <div style={{ fontSize: '0.9rem', color: '#666' }}>To: <strong>orders@example-supplier.com</strong></div>
                            <div style={{ fontSize: '0.9rem', color: '#666' }}>CC: <strong>{getCCNames()}</strong></div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 'bold', marginTop: '0.5rem' }}>New Order: TopShelf Bar (Order #1023)</div>
                        </div>

                        {/* Body */}
                        <div style={{ padding: '2rem' }}>
                            <p>Hello,</p>
                            <p>Please process the following order for <strong>TopShelf Bar</strong>.</p>

                            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem', marginBottom: '1rem' }}>
                                <thead style={{ background: '#eee' }}>
                                    <tr>
                                        <th style={{ padding: '0.5rem', textAlign: 'left', border: '1px solid #ddd' }}>Item Name</th>
                                        <th style={{ padding: '0.5rem', textAlign: 'center', border: '1px solid #ddd' }}>Quantity</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td style={{ padding: '0.5rem', border: '1px solid #ddd' }}>Vodka 750ml</td>
                                        <td style={{ padding: '0.5rem', textAlign: 'center', border: '1px solid #ddd' }}>12</td>
                                    </tr>
                                    <tr>
                                        <td style={{ padding: '0.5rem', border: '1px solid #ddd' }}>Tequila Silver</td>
                                        <td style={{ padding: '0.5rem', textAlign: 'center', border: '1px solid #ddd' }}>6</td>
                                    </tr>
                                </tbody>
                            </table>

                            <p>Please confirm receipt and estimated delivery date.</p>

                            {config.require_confirmation && (
                                <div style={{ marginTop: '2rem', padding: '1rem', background: '#fff7ed', border: '1px solid #fdba74', borderRadius: '5px', fontSize: '0.9rem', color: '#c2410c' }}>
                                    <strong>Internal Note:</strong> Since "Require Manual Confirmation" is ON, you (the manager) will receive this email FIRST with an [Approve Order] button. The supplier will only receive it after you click Approve.
                                </div>
                            )}

                            <p style={{ marginTop: '2rem', color: '#666', fontSize: '0.9rem' }}>
                                Thank you,<br />
                                TopShelf Bar System
                            </p>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
