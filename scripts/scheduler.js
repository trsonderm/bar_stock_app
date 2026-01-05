const cron = require('node-cron');
const nodemailer = require('nodemailer');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

console.log('Scheduler started (Business Day Mode: 7am-5am). Waiting for jobs...');

// Run every minute
cron.schedule('* * * * *', async () => {
    try {
        const settings = getSettings();
        if (!settings.report_time) return;

        const now = new Date();
        const currentHHMM = now.toTimeString().slice(0, 5);

        if (currentHHMM === settings.report_time) {
            console.log(`Time match (${currentHHMM}). Generating Business Day report...`);
            await sendDailyReport(settings);
        }
        await runBackup(settings);
        await runStockAlert(settings);
    } catch (e) {
        console.error('Scheduler error:', e);
    }
});

function getSettings() {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const s = {};
    rows.forEach(r => s[r.key] = r.value);
    return s;
}

async function sendDailyReport(settings) {
    if (!settings.report_emails || !settings.smtp_host) {
        console.log('Skipping report: Missing email settings');
        return;
    }

    // Business Day Logic
    // If report runs at 8:00 AM today, it should cover "Yesterday 7:00 AM" to "Today 5:00 AM".
    // Or if report runs at 6:00 AM today, same thing.
    // Generally, a "Business Day" report is generated AFTER the shift closes (e.g. 8am).
    // So "End Time" = Today 05:00 AM.
    // "Start Time" = Yesterday 07:00 AM.

    const now = new Date();
    const today5am = new Date(now);
    today5am.setHours(5, 0, 0, 0);

    const yesterday7am = new Date(now);
    yesterday7am.setDate(yesterday7am.getDate() - 1);
    yesterday7am.setHours(7, 0, 0, 0);

    const startStr = yesterday7am.toISOString();
    const endStr = today5am.toISOString();

    console.log(`Generating report for window: ${startStr} to ${endStr}`);

    // Fetch logs within window
    // Join with users and items for full names
    const logs = db.prepare(`
        SELECT 
            l.action, l.details, l.timestamp,
            u.first_name, u.last_name,
            COALESCE(i.name, json_extract(l.details, '$.itemName')) as item_name,
            COALESCE(i.unit_cost, 0) as unit_cost
        FROM activity_logs l
        LEFT JOIN users u ON l.user_id = u.id
        LEFT JOIN items i ON i.id = json_extract(l.details, '$.itemId')
        WHERE l.timestamp >= ? AND l.timestamp <= ?
        ORDER BY l.timestamp ASC
    `).all(startStr, endStr);

    // Aggregations
    const addedItems = {};
    const removedItems = {};
    let totalAdded = 0;
    let totalRemoved = 0;

    // Financials
    let totalAddedCost = 0;
    let totalUsageCost = 0;
    const bartenderCost = {}; // { "John Doe": 56.50 }

    logs.forEach(log => {
        try {
            const d = JSON.parse(log.details);
            const name = log.item_name || 'Unknown';
            const qty = d.change || d.quantity || 0;
            const cost = log.unit_cost || 0; // Fetched from Query below

            if (log.action === 'ADD_STOCK') {
                addedItems[name] = (addedItems[name] || 0) + qty;
                totalAdded += qty;
                totalAddedCost += (qty * cost);
            }
            if (log.action === 'SUBTRACT_STOCK') {
                removedItems[name] = (removedItems[name] || 0) + qty;
                totalRemoved += qty;
                totalUsageCost += (qty * cost);

                // Track by Bartender
                const user = `${log.first_name} ${log.last_name || ''}`.trim();
                bartenderCost[user] = (bartenderCost[user] || 0) + (qty * cost);
            }
        } catch { }
    });

    // Formatting Helpers
    const formatList = (obj) => Object.entries(obj)
        .sort((a, b) => b[1] - a[1]) // Sort by quantity desc
        .map(([name, qty]) => `
            <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 8px;">${name}</td>
                <td style="padding: 8px; font-weight: bold;">${qty}</td>
            </tr>
        `).join('');

    const formatLogs = logs.map(l => {
        let detailsTxt = '';
        try {
            const d = JSON.parse(l.details);
            const qty = d.change || d.quantity;
            const current = d.quantityAfter !== undefined ? `(Stock: ${d.quantityAfter})` : '';
            detailsTxt = `${l.action === 'ADD_STOCK' ? '+' : '-'}${qty} ${current}`;
        } catch { detailsTxt = l.details; }

        const color = l.action === 'ADD_STOCK' ? '#10b981' : '#ef4444';

        return `
            <tr style="border-bottom: 1px solid #eee; color: #333;">
                <td style="padding: 8px; color: #666; font-size: 0.9em;">${new Date(l.timestamp).toLocaleTimeString()}</td>
                <td style="padding: 8px;">${l.first_name} ${l.last_name || ''}</td>
                <td style="padding: 8px;">${l.item_name || 'Unknown'}</td>
                <td style="padding: 8px; font-weight: bold; color: ${color};">${detailsTxt}</td>
            </tr>
        `;
    }).join('');

    // Stock Alerts
    const threshold = parseInt(settings.low_stock_threshold) || 5;
    const noStock = db.prepare('SELECT name, quantity FROM inventory JOIN items ON item_id = items.id WHERE quantity = 0').all();
    const lowStock = db.prepare('SELECT name, quantity FROM inventory JOIN items ON item_id = items.id WHERE quantity > 0 AND quantity <= ?').all(threshold);

    // Format Lists
    const formatStockList = (items) => items.map(i => `
        <tr style="border-bottom: 1px solid #fee2e2;">
            <td style="padding: 8px;">${i.name}</td>
            <td style="padding: 8px; font-weight: bold;">${i.quantity}</td>
        </tr>`).join('');

    const formatLowStockList = (items) => items.map(i => `
        <tr style="border-bottom: 1px solid #ffedd5;">
            <td style="padding: 8px;">${i.name}</td>
            <td style="padding: 8px; font-weight: bold;">${i.quantity}</td>
        </tr>`).join('');

    // HTML Template
    const html = `
    <html>
    <body style="font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #1f2937;">
        <div style="background: #111827; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0;">Daily Stock Report</h1>
            <p style="margin: 5px 0 0 0; opacity: 0.8;">${yesterday7am.toLocaleString()} — ${today5am.toLocaleString()}</p>
        </div>

        <div style="background: #f8fafc; padding: 15px; margin-top: 20px; border-radius: 8px; border: 1px solid #e2e8f0; display: flex; justify-content: space-around;">
             <div style="text-align: center;">
                <div style="font-size: 0.85em; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Total Usage Cost</div>
                <div style="font-size: 1.5em; font-weight: bold; color: #ef4444;">$${totalUsageCost.toFixed(2)}</div>
             </div>
             <div style="text-align: center;">
                <div style="font-size: 0.85em; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Total Stock Added</div>
                <div style="font-size: 1.5em; font-weight: bold; color: #10b981;">$${totalAddedCost.toFixed(2)}</div>
             </div>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;">
            <div style="background: #fff; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb;">
                <h3 style="margin-top: 0; color: #1f2937;">Liquor Cost by Bartender</h3>
                <table style="width: 100%; border-collapse: collapse;">
                    ${Object.entries(bartenderCost).map(([name, cost]) => `
                        <tr style="border-bottom: 1px solid #eee;">
                            <td style="padding: 8px;">${name}</td>
                            <td style="padding: 8px; font-weight: bold;">$${cost.toFixed(2)}</td>
                        </tr>
                    `).join('') || '<tr><td>No usage</td></tr>'}
                </table>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;">
            <div style="background: #f3f4f6; padding: 15px; border-radius: 8px;">
                <h2 style="margin-top: 0; color: #ef4444;">🔻 Usage (Removed)</h2>
                <table style="width: 100%; border-collapse: collapse;">
                    ${formatList(removedItems) || '<tr><td>No usage recorded</td></tr>'}
                </table>
            </div>
            
            <div style="background: #ecfdf5; padding: 15px; border-radius: 8px;">
                <h2 style="margin-top: 0; color: #10b981;">✅ Restock (Added)</h2>
                <table style="width: 100%; border-collapse: collapse;">
                    ${formatList(addedItems) || '<tr><td>No restock recorded</td></tr>'}
                </table>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;">
            <div style="background: #fee2e2; padding: 15px; border-radius: 8px; border: 1px solid #fca5a5;">
                <h2 style="margin-top: 0; color: #dc2626;">❌ No Stock (0)</h2>
                <table style="width: 100%; border-collapse: collapse;">
                    ${formatStockList(noStock) || '<tr><td>All items in stock</td></tr>'}
                </table>
            </div>

            <div style="background: #ffedd5; padding: 15px; border-radius: 8px; border: 1px solid #fdba74;">
                <h2 style="margin-top: 0; color: #ea580c;">⚠️ Low Stock (≤ ${threshold})</h2>
                <table style="width: 100%; border-collapse: collapse;">
                    ${formatLowStockList(lowStock) || '<tr><td>No low stock items</td></tr>'}
                </table>
            </div>
        </div>

        <h2 style="margin-top: 30px; border-bottom: 2px solid #eee; padding-bottom: 10px;">Detailed Activity Log</h2>
        <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead style="background: #f9fafb;">
                <tr>
                    <th style="padding: 8px;">Time</th>
                    <th style="padding: 8px;">User</th>
                    <th style="padding: 8px;">Item</th>
                    <th style="padding: 8px;">Action</th>
                </tr>
            </thead>
            <tbody>
                ${formatLogs}
            </tbody>
        </table>
    </body>
    </html>
    `;

    // Send Email
    const transporter = nodemailer.createTransport({
        host: settings.smtp_host,
        port: parseInt(settings.smtp_port) || 587,
        secure: false,
        auth: {
            user: settings.smtp_user,
            pass: settings.smtp_pass,
        },
    });

    try {
        await transporter.sendMail({
            from: `"Inventory System" <${settings.smtp_user}>`,
            to: settings.report_emails,
            subject: `${settings.report_title || 'Daily Stock Report'} - ${new Date().toLocaleDateString()}`,
            html: html,
        });
        console.log('Report sent successfully to ' + settings.report_emails);
    } catch (e) {
        console.error('Failed to send email:', e);
    }
}

// Backup Logic
async function runBackup(settings) {
    // Default backup time 06:00
    const backupTime = settings.backup_time || '06:00';
    const now = new Date();
    const currentHHMM = now.toTimeString().slice(0, 5);

    if (currentHHMM !== backupTime) return;

    console.log('Starting Automated Backup...');

    if (!fs.existsSync(path.join(process.cwd(), 'backups'))) {
        fs.mkdirSync(path.join(process.cwd(), 'backups'));
    }

    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(process.cwd(), 'backups', `inventory_${timestamp}.db`);

    // Copy DB
    fs.copyFileSync(dbPath, backupFile);
    console.log(`Backup created: ${backupFile}`);

    // Prune Backups
    pruneBackups();
}

function pruneBackups() {
    console.log('Pruning backups...');
    const backupsDir = path.join(process.cwd(), 'backups');
    const files = fs.readdirSync(backupsDir)
        .filter(f => f.startsWith('inventory_') && f.endsWith('.db'))
        .map(f => {
            const stat = fs.statSync(path.join(backupsDir, f));
            return { name: f, time: stat.mtime };
        })
        .sort((a, b) => b.time - a.time); // Newest first

    if (files.length === 0) return;

    const now = new Date();
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(now.getFullYear() - 1);

    const kept = [];
    const deleted = [];

    // Group by month/year
    const byMonth = {}; // '2025-01': [files...]

    files.forEach(file => {
        const d = new Date(file.time);
        const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
        if (!byMonth[key]) byMonth[key] = [];
        byMonth[key].push(file);
    });

    // Retention Policy:
    // 1. Keep ALL for current month (and previous month maybe? sticking to user request: "keep previous years months")
    // Let's interpret: 
    // - Current Year: Keep all? Or keep all for current month, one per day?
    // User said: "delete after one year for the previous year but keep the previous years months along with the previous years single backup that is retained"
    // Interpretation: 
    // - Older than 1 year: Keep 1 per year? Or 1 per month for previous year?
    // "keep the previous years months along with the previous years single backup" -> Sounds like for last year, keep 1 per month. For older years, keep 1 per year.
    // Let's implement:
    // - Current Month: Keep All.
    // - Past 12 Months: Keep 1 per month (First of month).
    // - Older than 1 year: Keep 1 per year (Jan 1st).

    // Wait, simpler approach based on "configurable options":
    // Let's do:
    // - < 30 days: Keep All
    // - 30d - 1y: Keep 1 per month
    // - > 1y: Keep 1 per year

    const day = 24 * 60 * 60 * 1000;

    files.forEach(file => {
        const age = now.getTime() - file.time.getTime();
        const d = new Date(file.time);
        const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
        const yearKey = `${d.getFullYear()}`;

        if (age < 30 * day) {
            // Keep all recent (last 30 days)
            kept.push(file);
        } else if (age < 365 * day) {
            // Keep 1 per month
            // Since sorted new to old, check if we already have one for this month in `kept`
            const hasMonth = kept.some(k => {
                const kd = new Date(k.time);
                return `${kd.getFullYear()}-${kd.getMonth()}` === monthKey;
            });
            if (!hasMonth) kept.push(file);
            else deleted.push(file);
        } else {
            // Keep 1 per year
            const hasYear = kept.some(k => {
                const kd = new Date(k.time);
                return `${kd.getFullYear()}` === yearKey;
            });
            if (!hasYear) kept.push(file);
            else deleted.push(file);
        }
    });

    deleted.forEach(f => {
        console.log(`Deleting old backup: ${f.name}`);
        fs.unlinkSync(path.join(backupsDir, f.name));
    });
}

// Stock Alert Logic
async function runStockAlert(settings) {
    if (!settings.low_stock_alert_enabled || settings.low_stock_alert_enabled === 'false') return;

    // Default alert time 14:00 (2pm)
    const alertTime = settings.low_stock_alert_time || '14:00';
    const now = new Date();
    const currentHHMM = now.toTimeString().slice(0, 5);

    if (currentHHMM !== alertTime) return;

    console.log('Checking for Low Stock Alerts...');

    const threshold = parseInt(settings.low_stock_threshold) || 5;
    const lowStock = db.prepare('SELECT name, quantity FROM inventory JOIN items ON item_id = items.id WHERE quantity <= ?').all(threshold);

    if (lowStock.length === 0) {
        console.log('No low stock items found.');
        return;
    }

    const emails = settings.low_stock_alert_emails;
    if (!emails || !settings.smtp_host) {
        console.log('Skipping alert: Missing email settings');
        return;
    }

    // New HTML Template corresponding to Preview
    const html = `
        <div style="font-family: sans-serif; color: #1f2937; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
            <div style="background: #7f1d1d; color: white; padding: 20px;">
                <h2 style="margin: 0; font-size: 1.25rem;">⚠️ ${settings.low_stock_alert_title || 'URGENT: Low Stock Alert'}</h2>
            </div>
            <div style="padding: 24px; background: white;">
                <p style="margin-top: 0; color: #374151;">The following items are at or below your threshold (${threshold}):</p>
                
                <ul style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 16px 32px; margin: 16px 0;">
                    ${lowStock.map(i => `<li style="margin-bottom: 8px; color: #7c2d12;">${i.name}: <b>${i.quantity}</b></li>`).join('')}
                </ul>

                <div style="margin-top: 24px;">
                    <a href="http://localhost:3000/admin/dashboard" style="display: inline-block; background: #c2410c; color: white; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; font-size: 0.9rem;">Go to Dashboard</a>
                </div>
            </div>
            <div style="background: #f9fafb; padding: 12px 24px; font-size: 0.75rem; color: #6b7280; border-top: 1px solid #e5e7eb;">
                Sent automatically by Foster's Inventory System
            </div>
        </div>
    `;

    const transporter = nodemailer.createTransport({
        host: settings.smtp_host,
        port: parseInt(settings.smtp_port) || 587,
        secure: false,
        auth: {
            user: settings.smtp_user,
            pass: settings.smtp_pass,
        },
    });

    try {
        await transporter.sendMail({
            from: `"Inventory Alert" <${settings.smtp_user}>`,
            to: emails,
            subject: `${settings.low_stock_alert_title || 'URGENT: Low Stock Alert'} (${lowStock.length} Items)`,
            html: html,
        });
        console.log('Stock Alert sent to ' + emails);
    } catch (e) {
        console.error('Failed to send stock alert:', e);
    }
}
