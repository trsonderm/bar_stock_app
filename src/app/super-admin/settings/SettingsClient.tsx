'use client';

import { useState } from 'react';
import { Card } from '@/app/components/ui/Card';
import { Button } from '@/app/components/ui/Button';
import { Input, Select } from '@/app/components/ui/Input';
import { Badge } from '@/app/components/ui/Badge';

interface SettingsState {
    // Identity
    appName: string;
    supportEmail: string;

    // Auth & Access
    billingEnabled: boolean;
    registrationEnabled: boolean;
    requireEmailVerification: boolean;

    // System
    maintenanceMode: boolean;
    maintenanceMessage: string;

    // SMTP (Existing)
    smtpHost: string;
    smtpPort: string;
    smtpUser: string;
    smtpPass: string;
    smtpSecure: boolean;

    // Trials
    trialDays: number;
}

export default function SettingsClient({ initialSettings }: { initialSettings: any }) {
    const [settings, setSettings] = useState<SettingsState>({
        appName: initialSettings.app_name || 'Foster\'s Inventory',
        supportEmail: initialSettings.support_email || 'support@fosters.com',
        billingEnabled: initialSettings.billing_enabled === 'true',
        registrationEnabled: initialSettings.registration_enabled !== 'false', // Default true
        requireEmailVerification: initialSettings.require_email_verification === 'true',
        maintenanceMode: initialSettings.maintenance_mode === 'true',
        maintenanceMessage: initialSettings.maintenance_message || 'We are undergoing scheduled maintenance.',
        smtpHost: initialSettings.smtp_host || '',
        smtpPort: initialSettings.smtp_port || '',
        smtpUser: initialSettings.smtp_user || '',
        smtpPass: initialSettings.smtp_pass || '',
        smtpSecure: initialSettings.smtp_secure === 'true',
        trialDays: parseInt(initialSettings.trial_days || '14'),
    });

    const [loading, setLoading] = useState(false);

    const handleSave = async () => {
        setLoading(true);
        try {
            // Convert state to flat string map for simple key-value storage
            const payload = Object.entries(settings).reduce((acc, [key, val]) => {
                // Convert camelCase to snake_case for DB consistency if needed, 
                // but our API likely saves raw keys. Let's snakeify for convention
                const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
                acc[snakeKey] = String(val);
                return acc;
            }, {} as Record<string, string>);

            const res = await fetch('/api/super-admin/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) alert('Settings Saved Successfully');
            else alert('Failed to save settings');
        } catch {
            alert('Error saving settings');
        }
        setLoading(false);
    };

    return (
        <div className="p-8 max-w-7xl mx-auto pb-40">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Platform Configuration</h1>
                    <p className="text-gray-400">Manage global variables, feature flags, and system behavior.</p>
                </div>
                <Button
                    onClick={handleSave}
                    isLoading={loading}
                    size="lg"
                    icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>}
                >
                    Save Changes
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Column 1: Identity & Access */}
                <div className="space-y-8">
                    <Card title="Site Identity" subtitle="Branding and Contact">
                        <Input
                            label="Application Name"
                            value={settings.appName}
                            onChange={e => setSettings({ ...settings, appName: e.target.value })}
                        />
                        <Input
                            label="Support Email"
                            value={settings.supportEmail}
                            onChange={e => setSettings({ ...settings, supportEmail: e.target.value })}
                        />
                    </Card>

                    <Card title="Access Control" subtitle="Registration and Login properties">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg border border-gray-800">
                                <div>
                                    <h4 className="font-bold text-white text-sm">Allow Public Registration</h4>
                                    <p className="text-xs text-gray-400">If disabled, only admins can create orgs.</p>
                                </div>
                                <div className="relative inline-block w-12 mr-2 align-middle select-none transition duration-200 ease-in">
                                    <input
                                        type="checkbox"
                                        checked={settings.registrationEnabled}
                                        onChange={e => setSettings({ ...settings, registrationEnabled: e.target.checked })}
                                        className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer translate-x-0 checked:translate-x-6 checked:bg-blue-500 transition-transform"
                                    />
                                    <label className="toggle-label block overflow-hidden h-6 rounded-full bg-gray-700 cursor-pointer"></label>
                                </div>
                            </div>

                            <div className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg border border-gray-800">
                                <div>
                                    <h4 className="font-bold text-white text-sm">Require Email Verification</h4>
                                    <p className="text-xs text-gray-400">Users must verify email before login.</p>
                                </div>
                                <div className="relative inline-block w-12 mr-2 align-middle select-none transition duration-200 ease-in">
                                    <input
                                        type="checkbox"
                                        checked={settings.requireEmailVerification}
                                        onChange={e => setSettings({ ...settings, requireEmailVerification: e.target.checked })}
                                        className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer translate-x-0 checked:translate-x-6 checked:bg-blue-500 transition-transform"
                                    />
                                    <label className="toggle-label block overflow-hidden h-6 rounded-full bg-gray-700 cursor-pointer"></label>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>

                {/* Column 2: Billing & System */}
                <div className="space-y-8">
                    <Card title="Billing & Trials" subtitle="Monetization Settings">
                        <div className="mb-6 flex items-center justify-between p-3 bg-gray-900/50 rounded-lg border border-gray-800">
                            <div>
                                <h4 className="font-bold text-white text-sm">Global Billing System</h4>
                                <p className="text-xs text-gray-400">Master switch for all payments.</p>
                            </div>
                            <div className="relative inline-block w-12 mr-2 align-middle select-none transition duration-200 ease-in">
                                <input
                                    type="checkbox"
                                    checked={settings.billingEnabled}
                                    onChange={e => setSettings({ ...settings, billingEnabled: e.target.checked })}
                                    className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer translate-x-0 checked:translate-x-6 checked:bg-emerald-500 transition-transform"
                                />
                                <label className="toggle-label block overflow-hidden h-6 rounded-full bg-gray-700 cursor-pointer"></label>
                            </div>
                        </div>

                        <Input
                            label="Default Trial Length (Days)"
                            type="number"
                            value={settings.trialDays}
                            onChange={e => setSettings({ ...settings, trialDays: parseInt(e.target.value) })}
                        />
                    </Card>

                    <Card title="System Status" subtitle="Maintenance and Downtime">
                        <div className="mb-4 flex items-center justify-between p-3 bg-red-900/20 rounded-lg border border-red-900/50">
                            <div>
                                <h4 className="font-bold text-red-400 text-sm">Maintenance Mode</h4>
                                <p className="text-xs text-red-300/70">Block all user access.</p>
                            </div>
                            <div className="relative inline-block w-12 mr-2 align-middle select-none transition duration-200 ease-in">
                                <input
                                    type="checkbox"
                                    checked={settings.maintenanceMode}
                                    onChange={e => setSettings({ ...settings, maintenanceMode: e.target.checked })}
                                    className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer translate-x-0 checked:translate-x-6 checked:bg-red-500 transition-transform"
                                />
                                <label className="toggle-label block overflow-hidden h-6 rounded-full bg-gray-700 cursor-pointer"></label>
                            </div>
                        </div>
                        <Input
                            label="Maintenance Message"
                            value={settings.maintenanceMessage}
                            onChange={e => setSettings({ ...settings, maintenanceMessage: e.target.value })}
                            className="text-sm"
                        />
                    </Card>
                </div>

                {/* Column 3: SMTP */}
                <div className="space-y-8">
                    <Card title="SMTP Configuration" subtitle="Email Delivery Settings">
                        <div className="space-y-2">
                            <Input
                                label="SMTP Host"
                                placeholder="smtp.example.com"
                                value={settings.smtpHost}
                                onChange={e => setSettings({ ...settings, smtpHost: e.target.value })}
                            />
                            <div className="grid grid-cols-2 gap-4">
                                <Input
                                    label="Port"
                                    placeholder="587"
                                    value={settings.smtpPort}
                                    onChange={e => setSettings({ ...settings, smtpPort: e.target.value })}
                                />
                                <div className="mt-6 flex items-center">
                                    <input
                                        type="checkbox"
                                        id="secure"
                                        className="mr-2 w-4 h-4 rounded bg-gray-800 border-gray-700 text-blue-600 focus:ring-blue-500"
                                        checked={settings.smtpSecure}
                                        onChange={e => setSettings({ ...settings, smtpSecure: e.target.checked })}
                                    />
                                    <label htmlFor="secure" className="text-sm text-gray-400">Use Secure (SSL/TLS)</label>
                                </div>
                            </div>
                            <Input
                                label="Username"
                                value={settings.smtpUser}
                                onChange={e => setSettings({ ...settings, smtpUser: e.target.value })}
                            />
                            <Input
                                label="Password"
                                type="password"
                                value={settings.smtpPass}
                                onChange={e => setSettings({ ...settings, smtpPass: e.target.value })}
                            />
                        </div>
                    </Card>
                </div>
            </div>

            <style jsx global>{`
                .toggle-checkbox:checked {
                    right: 0;
                    border-color: #3b82f6;
                }
                .toggle-checkbox {
                    right: auto;
                    left: 0;
                    transition: all 0.2s ease-in-out; 
                }
            `}</style>
        </div>
    );
}
