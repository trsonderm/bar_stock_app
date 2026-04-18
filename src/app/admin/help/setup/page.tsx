'use client';

import { useState } from 'react';
import styles from '../../admin.module.css';

const steps = [
    {
        num: 1,
        title: 'Add Your Locations',
        icon: '📍',
        color: '#0891b2',
        href: '/admin/locations',
        linkLabel: 'Go to Locations →',
        summary: 'If your business has multiple bars, storerooms, or service areas, create a location for each before adding products.',
        details: [
            'Each location gets its own inventory count (unless you enable Shared Inventory in Settings).',
            'Staff can be scoped to a single location using the Permissions system.',
            'Smart Order proposals can be generated per-location, each linked to a different supplier.',
            'You can skip this step if you operate a single location — a default location is created automatically.',
        ],
    },
    {
        num: 2,
        title: 'Create Suppliers',
        icon: '🚚',
        color: '#7c3aed',
        href: '/admin/suppliers',
        linkLabel: 'Go to Suppliers →',
        summary: 'Add the distributors and vendors you order from. Supplier data powers Smart Order proposals and purchase orders.',
        details: [
            'Enter the supplier\'s name, lead time (how many days after ordering until delivery), and delivery days.',
            'Lead time is used to calculate how urgently a reorder is needed.',
            'Each product can have a default supplier, and you can override per-location.',
            'Cost per unit is set on the product, not the supplier.',
        ],
    },
    {
        num: 3,
        title: 'Define Product Categories',
        icon: '🗂️',
        color: '#059669',
        href: '/admin/categories',
        linkLabel: 'Go to Categories →',
        summary: 'Categories group your products and define the quick-count buttons staff use. Set these up before adding products.',
        details: [
            'Create categories like "Liquor", "Beer", "Wine", "Non-Alcohol".',
            'Under each category, define Stock Buttons — preset quantities (e.g. +1, +6, +12) that appear when staff count inventory.',
            'You can add sub-categories (e.g. "Vodka", "Whiskey" under "Liquor") to filter the product list.',
            'Categories also determine which items appear together on the Stock View page.',
        ],
    },
    {
        num: 4,
        title: 'Add Your Products',
        icon: '🍾',
        color: '#d97706',
        href: '/admin/products',
        linkLabel: 'Go to Products →',
        summary: 'Add every item you want to track. Each product can have its own supplier, order sizes, threshold, and counting presets.',
        details: [
            'Name the product exactly as your staff would recognise it.',
            'Assign a Category and (optional) Sub-Category.',
            'Link a Supplier so Smart Order can include it in proposals.',
            'Set Order Sizes (e.g. "Case: 12") — used on purchase orders.',
            'Set a Low Stock Threshold or leave it to use the global default from Settings.',
            'Scan or type a barcode to link it — staff can then scan bottles directly on the Stock View.',
            'Use "Exclude from Smart Order" on seasonal or discontinued items.',
        ],
    },
    {
        num: 5,
        title: 'Configure Staff Access',
        icon: '👤',
        color: '#db2777',
        href: '/admin/users',
        linkLabel: 'Go to Users →',
        summary: 'Invite your staff, set their role, and control what they can add, subtract, or view.',
        details: [
            'Roles: Admin (full access), Manager (reports + stock), Bartender (stock view only).',
            'Fine-grained permissions let you enable or disable individual actions.',
            'Enable Station Mode (Kiosk) on a shared iPad so staff can log in with just a PIN.',
            'Restrict staff to a single location using location-scoped assignments.',
        ],
    },
    {
        num: 6,
        title: 'Set Up Reporting & Alerts',
        icon: '📊',
        color: '#2563eb',
        href: '/admin/settings/reporting',
        linkLabel: 'Go to Reporting Settings →',
        summary: 'Schedule daily inventory emails and configure low stock alert thresholds and recipients.',
        details: [
            'Daily Report: set a time and recipients to get a summary of stock levels every morning.',
            'Low Stock Alerts: when an item drops below its threshold, an email fires immediately.',
            'Set a Global Low Stock Threshold — products that don\'t have their own threshold fall back to this.',
            'Smart Order emails fire automatically when a product crosses its threshold (if enabled).',
        ],
    },
    {
        num: 7,
        title: 'Enable Smart Ordering',
        icon: '🤖',
        color: '#6366f1',
        href: '/admin/settings',
        linkLabel: 'Go to Settings →',
        summary: 'Smart Order uses your usage history to predict what to reorder and when. Needs at least 7 days of activity data.',
        details: [
            'Go to Settings and enable AI Smart Ordering. Set the notification email.',
            'Auto-proposals fire when stock crosses a threshold. Review them under Reports → Smart Order.',
            'Choose analysis window (30 / 60 / 90 days) and forecasting model (SMA, EMA, Linear Regression, etc.).',
            'Items without enough data show an "Insufficient Data" badge — keep recording stock usage to improve accuracy.',
            'Use "Exclude from Smart Order" on individual products to stop them appearing in proposals.',
        ],
    },
];

const tips = [
    { icon: '📷', text: 'Scan barcodes on products during setup to speed up Stock View counting — staff just point their phone camera.' },
    { icon: '📦', text: 'Use the CSV Import on the Products page to bulk-upload your product list from a spreadsheet.' },
    { icon: '🔄', text: 'Enable "Shared Inventory Count" in Settings if all your locations share one central stock pool.' },
    { icon: '📱', text: 'Add the app to your home screen for a native-app feel — tap Share → Add to Home Screen on iOS.' },
    { icon: '🕐', text: 'The more consistently staff log subtractions, the better Smart Order predictions become.' },
];

export default function SetupGuidePage() {
    const [openStep, setOpenStep] = useState<number | null>(1);

    return (
        <div className={styles.container}>
            <div style={{ marginBottom: '2rem' }}>
                <h1 style={{ color: 'white', fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>🚀 Getting Started Guide</h1>
                <p style={{ color: '#9ca3af', marginTop: '0.5rem', fontSize: '0.95rem' }}>
                    Follow these steps in order to get your inventory system fully operational.
                </p>
                {/* Progress bar */}
                <div style={{ display: 'flex', gap: '4px', marginTop: '1rem' }}>
                    {steps.map(s => (
                        <div key={s.num} style={{ flex: 1, height: '4px', borderRadius: '2px', background: openStep && openStep >= s.num ? s.color : '#374151', transition: 'background 0.2s' }} />
                    ))}
                </div>
            </div>

            {/* Steps */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2.5rem' }}>
                {steps.map(s => {
                    const isOpen = openStep === s.num;
                    return (
                        <div key={s.num} style={{ background: '#111827', border: `1px solid ${isOpen ? s.color : '#374151'}`, borderRadius: '10px', overflow: 'hidden', transition: 'border-color 0.2s' }}>
                            <button
                                onClick={() => setOpenStep(isOpen ? null : s.num)}
                                style={{ width: '100%', background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem', cursor: 'pointer', textAlign: 'left' }}
                            >
                                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '1.1rem' }}>{s.icon}</div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ color: 'white', fontWeight: 700, fontSize: '0.95rem' }}>Step {s.num}: {s.title}</div>
                                    <div style={{ color: '#9ca3af', fontSize: '0.8rem', marginTop: '2px' }}>{s.summary}</div>
                                </div>
                                <span style={{ color: '#6b7280', fontSize: '1.2rem', flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
                            </button>
                            {isOpen && (
                                <div style={{ padding: '0 1.25rem 1.25rem', borderTop: '1px solid #1f2937' }}>
                                    <ul style={{ paddingLeft: '1.25rem', margin: '1rem 0', color: '#d1d5db', fontSize: '0.875rem', lineHeight: 1.7 }}>
                                        {s.details.map((d, i) => <li key={i} style={{ marginBottom: '0.3rem' }}>{d}</li>)}
                                    </ul>
                                    <a href={s.href} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: s.color, color: 'white', textDecoration: 'none', padding: '8px 16px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
                                        {s.linkLabel}
                                    </a>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Tips */}
            <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: '10px', padding: '1.25rem' }}>
                <h2 style={{ color: 'white', fontSize: '1.1rem', fontWeight: 700, margin: '0 0 1rem 0' }}>💡 Pro Tips</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {tips.map((t, i) => (
                        <div key={i} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                            <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{t.icon}</span>
                            <p style={{ color: '#d1d5db', fontSize: '0.875rem', margin: 0, lineHeight: 1.6 }}>{t.text}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Help link */}
            <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>
                    Still stuck?{' '}
                    <a href="/admin/help" style={{ color: '#60a5fa' }}>Open a support ticket →</a>
                    {' '}or check the{' '}
                    <a href="/admin/help/faq" style={{ color: '#60a5fa' }}>FAQ →</a>
                </p>
            </div>
        </div>
    );
}
