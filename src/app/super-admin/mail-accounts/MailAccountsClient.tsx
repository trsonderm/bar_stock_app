'use client';

import { useState } from 'react';
import { Card } from '@/app/components/ui/Card';
import { Button } from '@/app/components/ui/Button';
import { Input } from '@/app/components/ui/Input';

interface MailAccountsState {
    reportingHost: string;
    reportingPort: string;
    reportingUser: string;
    reportingPass: string;
    reportingSecure: boolean;

    supportHost: string;
    supportPort: string;
    supportUser: string;
    supportPass: string;
    supportSecure: boolean;

    adminHost: string;
    adminPort: string;
    adminUser: string;
    adminPass: string;
    adminSecure: boolean;
}

export default function MailAccountsClient({ initialSettings }: { initialSettings: Record<string, string> }) {
    const [settings, setSettings] = useState<MailAccountsState>({
        reportingHost: initialSettings.reporting_smtp_host || '',
        reportingPort: initialSettings.reporting_smtp_port || '',
        reportingUser: initialSettings.reporting_smtp_user || '',
        reportingPass: initialSettings.reporting_smtp_pass || '',
        reportingSecure: initialSettings.reporting_smtp_secure === 'true',

        supportHost: initialSettings.support_smtp_host || '',
        supportPort: initialSettings.support_smtp_port || '',
        supportUser: initialSettings.support_smtp_user || '',
        supportPass: initialSettings.support_smtp_pass || '',
        supportSecure: initialSettings.support_smtp_secure === 'true',

        adminHost: initialSettings.admin_smtp_host || '',
        adminPort: initialSettings.admin_smtp_port || '',
        adminUser: initialSettings.admin_smtp_user || '',
        adminPass: initialSettings.admin_smtp_pass || '',
        adminSecure: initialSettings.admin_smtp_secure === 'true',
    });

    const [loading, setLoading] = useState(false);

    const handleSave = async () => {
        setLoading(true);
        try {
            const payload = {
                reporting_smtp_host: settings.reportingHost,
                reporting_smtp_port: settings.reportingPort,
                reporting_smtp_user: settings.reportingUser,
                reporting_smtp_pass: settings.reportingPass,
                reporting_smtp_secure: String(settings.reportingSecure),

                support_smtp_host: settings.supportHost,
                support_smtp_port: settings.supportPort,
                support_smtp_user: settings.supportUser,
                support_smtp_pass: settings.supportPass,
                support_smtp_secure: String(settings.supportSecure),

                admin_smtp_host: settings.adminHost,
                admin_smtp_port: settings.adminPort,
                admin_smtp_user: settings.adminUser,
                admin_smtp_pass: settings.adminPass,
                admin_smtp_secure: String(settings.adminSecure),
            };

            const res = await fetch('/api/super-admin/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) alert('Mail Accounts Saved Successfully');
            else alert('Failed to save settings');
        } catch {
            alert('Error saving settings');
        }
        setLoading(false);
    };

    const renderCard = (title: string, subtitle: string, prefix: 'reporting' | 'support' | 'admin') => (
        <Card title={title} subtitle={subtitle}>
            <div className="space-y-2">
                <Input
                    label="SMTP Host"
                    placeholder="mail.example.com"
                    value={settings[`${prefix}Host` as keyof MailAccountsState] as string}
                    onChange={e => setSettings({ ...settings, [`${prefix}Host`]: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-4">
                    <Input
                        label="Port"
                        placeholder="587"
                        value={settings[`${prefix}Port` as keyof MailAccountsState] as string}
                        onChange={e => setSettings({ ...settings, [`${prefix}Port`]: e.target.value })}
                    />
                    <div className="mt-6 flex items-center">
                        <input
                            type="checkbox"
                            id={`${prefix}Secure`}
                            className="mr-2 w-4 h-4 rounded bg-gray-800 border-gray-700 text-blue-600 focus:ring-blue-500"
                            checked={settings[`${prefix}Secure` as keyof MailAccountsState] as boolean}
                            onChange={e => setSettings({ ...settings, [`${prefix}Secure`]: e.target.checked })}
                        />
                        <label htmlFor={`${prefix}Secure`} className="text-sm text-gray-400">Secure (SSL/TLS)</label>
                    </div>
                </div>
                <Input
                    label="Username (Email)"
                    value={settings[`${prefix}User` as keyof MailAccountsState] as string}
                    onChange={e => setSettings({ ...settings, [`${prefix}User`]: e.target.value })}
                />
                <Input
                    label="Password"
                    type="password"
                    value={settings[`${prefix}Pass` as keyof MailAccountsState] as string}
                    onChange={e => setSettings({ ...settings, [`${prefix}Pass`]: e.target.value })}
                />
            </div>
        </Card>
    );

    return (
        <div className="p-8 max-w-7xl mx-auto pb-40">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Mail Accounts Configuration</h1>
                    <p className="text-gray-400">Configure separate functional SMTP routes bridging internal services to your Mailcow instance.</p>
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
                <div className="space-y-8">
                    {renderCard('Reporting Mail', 'System delivery bound for usage reports', 'reporting')}
                </div>
                <div className="space-y-8">
                    {renderCard('Support Desk', 'Customer service feedback loops', 'support')}
                </div>
                <div className="space-y-8">
                    {renderCard('Site Administrators', 'Critical alerts routing', 'admin')}
                </div>
            </div>
        </div>
    );
}
