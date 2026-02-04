import { db } from './db';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

class Scheduler {
    private interval: NodeJS.Timeout | null = null;
    private tasks: { name: string; cron: string; run: () => Promise<void> }[] = [];

    constructor() {
        this.tasks = [
            { name: 'Daily Cleanup', cron: '0 4 * * *', run: this.cleanupLogs }, // 4 AM
            { name: 'Billing Check', cron: '0 5 * * *', run: this.checkBilling }, // 5 AM
        ];
    }

    start() {
        if (this.interval) return;
        console.log('Scheduler Started');

        // Simple checker every minute
        this.interval = setInterval(() => {
            const now = new Date();
            if (now.getSeconds() < 2) { // Allow some drift but only run once per minute
                this.checkTasks(now);
            }
        }, 1000 * 60);
    }

    stop() {
        if (this.interval) clearInterval(this.interval);
        this.interval = null;
    }

    private async checkTasks(now: Date) {
        // Very basic cron parser: 'min hr * * *'
        const currentMin = now.getMinutes();
        const currentHr = now.getHours();

        for (const task of this.tasks) {
            const [min, hr] = task.cron.split(' ');
            if (
                (min === '*' || parseInt(min) === currentMin) &&
                (hr === '*' || parseInt(hr) === currentHr)
            ) {
                console.log(`Running Task: ${task.name}`);
                try {
                    await task.run();
                    await this.logRun(task.name, 'SUCCESS');
                } catch (e) {
                    console.error(`Task Failed: ${task.name}`, e);
                    await this.logRun(task.name, 'FAILED', String(e));
                }
            }
        }
    }

    // --- Tasks ---

    private async cleanupLogs() {
        // Delete logs older than 90 days
        await db.execute("DELETE FROM activity_logs WHERE timestamp < NOW() - INTERVAL '90 days'");
    }

    private async checkBilling() {
        console.log("Checking for due invoices...");
        // 1. Get all active organizations
        // 2. Check if they have an invoice for this month
        // 3. If not, generate one
        try {
            const orgs = await db.query("SELECT id, name, subscription_plan FROM organizations WHERE billing_status = 'active'");
            const now = new Date();
            const currentMonth = now.toISOString().slice(0, 7); // YYYY-MM

            for (const org of orgs) {
                // Check invoice
                const existingRows = await db.query(
                    "SELECT id FROM invoices WHERE organization_id = $1 AND TO_CHAR(created_at, 'YYYY-MM') = $2",
                    [org.id, currentMonth]
                );

                if (existingRows.length === 0) {
                    console.log(`Generating Invoice for ${org.name}`);
                    const amount = org.subscription_plan === 'PRO' ? 49.00 : 0.00;
                    if (amount > 0) {
                        await db.execute(
                            "INSERT INTO invoices (organization_id, amount, status, due_date) VALUES ($1, $2, 'PENDING', $3)",
                            [org.id, amount, new Date(now.getFullYear(), now.getMonth() + 1, 0)] // End of month
                        );
                    }
                }
            }
        } catch (e) {
            console.error('Billing Job Failed', e);
        }
    }

    // --- Helpers ---

    private async logRun(name: string, status: string, error?: string) {
        // We could create a cron_logs table, or just console for now to save complexity
        console.log(`[CRON] ${name}: ${status} ${error || ''}`);
    }

    // Public method to run manual backup
    async runBackup() {
        const backupDir = path.join(process.cwd(), 'backups');
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

        const filename = `backup-${new Date().toISOString().split('T')[0]}-${Date.now()}.sql`;
        const filepath = path.join(backupDir, filename);

        // This assumes pg_dump is available in the environment (Docker container needs it)
        const cmd = `pg_dump "${process.env.DATABASE_URL}" > "${filepath}"`;

        return new Promise((resolve, reject) => {
            exec(cmd, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Backup error: ${error.message}`);
                    return reject(error);
                }
                resolve(filename);
            });
        });
    }

    getBackups() {
        const backupDir = path.join(process.cwd(), 'backups');
        if (!fs.existsSync(backupDir)) return [];
        return fs.readdirSync(backupDir).filter(f => f.endsWith('.sql')).map(f => ({
            name: f,
            created: fs.statSync(path.join(backupDir, f)).birthtime
        }));
    }
}

export const scheduler = new Scheduler();
