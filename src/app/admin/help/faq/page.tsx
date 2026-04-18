'use client';

import { useState } from 'react';
import styles from '../../admin.module.css';

interface FAQItem {
    q: string;
    a: string;
}

const faqGroups: { title: string; icon: string; items: FAQItem[] }[] = [
    {
        title: 'Getting Started',
        icon: '🚀',
        items: [
            {
                q: 'What is the recommended setup order?',
                a: 'Follow this order: Locations → Suppliers → Categories (with stock buttons) → Products → Users → Reporting. Full detail is in the Setup Guide.',
            },
            {
                q: 'Do I need to create locations before adding products?',
                a: 'No — a default location is created automatically. You only need to add more locations if you have multiple bars, storerooms, or service areas.',
            },
            {
                q: 'Can I import my product list from a spreadsheet?',
                a: 'Yes. Go to Products → Import CSV. Download the template, fill it in with your product names, categories, and costs, then upload it. You can map your column headers to the system fields.',
            },
            {
                q: 'How do I add staff and control what they can do?',
                a: 'Go to Users → Invite User. Choose a role (Admin, Manager, Bartender) or use custom permissions to restrict specific actions like adding/subtracting stock, viewing reports, or managing products.',
            },
        ],
    },
    {
        title: 'Stock & Inventory',
        icon: '📦',
        items: [
            {
                q: 'What is the difference between Category and Product counting modes?',
                a: 'Category mode (default) groups products by type on the Stock View — staff see one page per category. Product mode shows a flat master list, useful for large warehouses.',
            },
            {
                q: 'How do I add or subtract stock?',
                a: 'Go to Stock View. Use the + and − buttons next to each item to adjust quantities. Changes accumulate in a pending list at the top of the screen. Tap "Submit Changes" when done.',
            },
            {
                q: 'Can staff scan bottles to adjust stock?',
                a: 'Yes. On the Stock View, tap the camera icon (Scan to Add or Scan to Subtract). Point the camera at any barcode — the product is looked up automatically and the adjustment is applied.',
            },
            {
                q: 'What are "Stock Buttons" on categories?',
                a: 'Stock Buttons are the preset increment amounts shown when staff add or subtract stock. For example, +1 for single bottles, +6 for a six-pack, +12 for a case. Define them per category under Categories.',
            },
            {
                q: 'How does shared inventory work across locations?',
                a: 'In Settings → Multi-Location, enable "One Shared Inventory Count". All locations then see the same total rather than tracking stock independently. Useful if all locations draw from the same central storeroom.',
            },
            {
                q: 'A product is showing wrong stock count. How do I fix it?',
                a: 'Go to Products → Edit the item → set the Qty on Hand field to the correct number. This overrides the current count. For per-location accuracy, make sure the correct location is selected.',
            },
        ],
    },
    {
        title: 'Products & Barcodes',
        icon: '🍾',
        items: [
            {
                q: 'How do I link a barcode to a product?',
                a: 'Open the product edit modal (Products → Edit). Go to the "Basic Info" tab and use the Barcodes section to scan or type the barcode number. Multiple barcodes can be added to one product.',
            },
            {
                q: 'The scanner is adding a leading zero to my barcode. What is happening?',
                a: 'Many camera scanners return a 13-digit EAN-13 code with a leading zero for 12-digit UPC-A barcodes. The system normalises this automatically by stripping the leading zero, so both formats match the same product.',
            },
            {
                q: 'What is the "Exclude from Smart Order" option?',
                a: 'When checked on a product, it will never appear in AI-generated reorder proposals, even if stock is low. Use it for seasonal items, limited editions, or products you purchase through a different channel.',
            },
            {
                q: 'What does the Low Stock Threshold do?',
                a: 'When stock falls below this number, the product appears on the Low Stock report and triggers any configured alert emails. You can set a fixed number, or express it as a multiple of the order quantity or stock buttons.',
            },
            {
                q: 'Can I set different suppliers for different locations?',
                a: 'Yes. When editing a product in a multi-location setup, a per-location supplier override field appears. This is used by Smart Order to send separate proposals to the right supplier per location.',
            },
        ],
    },
    {
        title: 'Low Stock Alerts',
        icon: '🔔',
        items: [
            {
                q: 'How do I set up low stock email alerts?',
                a: 'Go to Settings → Reporting. Enable Low Stock Alerts, enter the recipient emails, choose a daily alert time, and set the global threshold. Individual products can override the threshold from their edit modal.',
            },
            {
                q: 'I am not receiving low stock emails. What should I check?',
                a: 'Check: (1) Low Stock Alerts are enabled in Reporting Settings. (2) A valid email address is entered. (3) The product has "Include in Low Stock Alerts" checked. (4) The product\'s current stock is actually below its threshold.',
            },
            {
                q: 'Can I silence alerts for one specific product?',
                a: 'Yes. Edit the product → go to the "Alerts & Orders" tab → uncheck "Include in Low Stock Alerts". That product will never trigger an alert, regardless of stock level.',
            },
        ],
    },
    {
        title: 'Smart Order & AI Predictions',
        icon: '🤖',
        items: [
            {
                q: 'How does Smart Order work?',
                a: 'Smart Order analyses your subtraction history to calculate a daily burn rate per item. It then compares current stock to projected usage through your supplier\'s next delivery window, factoring in lead time and a safety buffer. Items that will run out before the next delivery are flagged.',
            },
            {
                q: 'Why does a product show "Insufficient Data"?',
                a: 'Smart Order needs at least a few days of real subtraction history to make a reliable prediction. Items with zero usage events, or only very recent ones, show this warning. Keep using the Stock View consistently to build history.',
            },
            {
                q: 'What are the different forecasting models?',
                a: 'SMA (Simple Moving Average) is the default and most stable. EMA and WMA give more weight to recent activity. Linear Regression fits a trend line. Holt applies trend smoothing. NEURAL uses a lightweight neural net — good for items with volatile usage patterns.',
            },
            {
                q: 'Can I stop a product from appearing in Smart Order?',
                a: 'Yes. Edit the product → Alerts & Orders tab → check "Exclude from Smart Order". That product will never appear in AI proposals.',
            },
            {
                q: 'How do I see what data Smart Order used for a recommendation?',
                a: 'In Reports → Smart Order, click on any suggested item. A detail panel shows the data points used: burn rate, days of history, analysis window, and the model selected. Items with thin data display a warning badge.',
            },
            {
                q: 'Smart Order sent an email proposal automatically. Can I approve or reject it?',
                a: 'Currently proposals are informational emails. To act on them, go to Reports → Smart Order, review the list, then use the print/email button to send a formal purchase order, or create a manual order from Ordering.',
            },
        ],
    },
    {
        title: 'Reports',
        icon: '📊',
        items: [
            {
                q: 'How do I schedule a recurring inventory report?',
                a: 'Go to Settings → Reporting. You can set a daily report time and email recipients. For advanced scheduled reports, go to Reports → Saved Reports → Schedule.',
            },
            {
                q: 'What does the Daily Report include?',
                a: 'The daily report shows all items at or below their low stock threshold, grouped by category, with current quantity and threshold. It is sent automatically at the time you configure in Reporting Settings.',
            },
            {
                q: 'How do I see usage history for a product?',
                a: 'Go to Reports → Stock Usage. You can filter by product, date range, and user to see every addition and subtraction logged for any item.',
            },
        ],
    },
    {
        title: 'Account & Billing',
        icon: '💳',
        items: [
            {
                q: 'How do I add or remove users?',
                a: 'Go to Users in the admin menu. Invite new users via email. To remove a user, edit their account and set the status to Inactive, or delete them entirely.',
            },
            {
                q: 'Can I use TopShelf on a shared iPad at the bar?',
                a: 'Yes — enable Station Mode (Kiosk) in Settings. Staff then log in with a short PIN instead of a full email/password. PIN sessions last 90 days on that device.',
            },
            {
                q: 'How do I reset my password?',
                a: 'On the login page, tap "Forgot Password" and enter your email. A reset link will be sent. Admins can also reset staff passwords from the Users page.',
            },
        ],
    },
];

export default function FAQPage() {
    const [openKey, setOpenKey] = useState<string | null>(null);

    const toggle = (key: string) => setOpenKey(prev => prev === key ? null : key);

    return (
        <div className={styles.container}>
            <div style={{ marginBottom: '2rem' }}>
                <h1 style={{ color: 'white', fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>❓ Frequently Asked Questions</h1>
                <p style={{ color: '#9ca3af', marginTop: '0.5rem', fontSize: '0.95rem' }}>
                    Common questions about setting up and using TopShelf Inventory.
                    Can&apos;t find your answer?{' '}
                    <a href="/admin/help" style={{ color: '#60a5fa' }}>Open a support ticket →</a>
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
                    {faqGroups.map(g => (
                        <button key={g.title} onClick={() => { const el = document.getElementById(g.title); el?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                            style={{ background: '#1f2937', color: '#d1d5db', border: '1px solid #374151', borderRadius: '20px', padding: '5px 14px', fontSize: '0.82rem', cursor: 'pointer' }}>
                            {g.icon} {g.title}
                        </button>
                    ))}
                </div>
            </div>

            {faqGroups.map(group => (
                <div key={group.title} id={group.title} style={{ marginBottom: '2rem' }}>
                    <h2 style={{ color: 'white', fontSize: '1rem', fontWeight: 700, margin: '0 0 0.75rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>{group.icon}</span> {group.title}
                    </h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {group.items.map((item, i) => {
                            const key = `${group.title}-${i}`;
                            const isOpen = openKey === key;
                            return (
                                <div key={key} style={{ background: '#111827', border: `1px solid ${isOpen ? '#2563eb' : '#1f2937'}`, borderRadius: '8px', overflow: 'hidden', transition: 'border-color 0.15s' }}>
                                    <button onClick={() => toggle(key)}
                                        style={{ width: '100%', background: 'none', border: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', padding: '0.875rem 1rem', cursor: 'pointer', textAlign: 'left' }}>
                                        <span style={{ color: isOpen ? '#93c5fd' : '#e5e7eb', fontWeight: isOpen ? 600 : 500, fontSize: '0.9rem', lineHeight: 1.4 }}>{item.q}</span>
                                        <span style={{ color: '#6b7280', flexShrink: 0, marginTop: '2px' }}>{isOpen ? '▲' : '▼'}</span>
                                    </button>
                                    {isOpen && (
                                        <div style={{ padding: '0 1rem 0.875rem', borderTop: '1px solid #1f2937' }}>
                                            <p style={{ color: '#d1d5db', fontSize: '0.875rem', lineHeight: 1.7, margin: '0.75rem 0 0' }}>{item.a}</p>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}

            <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: '10px', padding: '1.25rem', marginTop: '1rem', textAlign: 'center' }}>
                <p style={{ color: '#9ca3af', margin: '0 0 0.75rem', fontSize: '0.9rem' }}>Still have questions?</p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <a href="/admin/help" style={{ background: '#2563eb', color: 'white', textDecoration: 'none', padding: '8px 18px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600 }}>Open a Support Ticket</a>
                    <a href="/admin/help/setup" style={{ background: '#374151', color: '#d1d5db', textDecoration: 'none', padding: '8px 18px', borderRadius: '6px', fontSize: '0.85rem' }}>View Setup Guide</a>
                </div>
            </div>
        </div>
    );
}
