const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5433/topshelf'
});

async function migrate() {
    console.log('Starting Phase 12 Migration: Billing & Profiles...');

    let client; // Declare client outside try block for finally access
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // 1. Extend Users Table
        console.log('Adding Phone/Bio to Users...');
        await client.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS phone TEXT,
            ADD COLUMN IF NOT EXISTS bio TEXT,
            ADD COLUMN IF NOT EXISTS notes TEXT
        `);

        // 2. Create Invoices Table
        console.log('Creating Invoices Table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS invoices (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                amount DECIMAL(10, 2) NOT NULL,
                status TEXT DEFAULT 'PENDING', -- PENDING, PAID, OVERDUE, CANCELLED
                due_date TIMESTAMP,
                paid_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                pdf_url TEXT
            )
        `);

        // 3. Extend Organizations Table for Billing
        console.log('Adding Billing fields to Organizations...');
        await client.query(`
            ALTER TABLE organizations
            ADD COLUMN IF NOT EXISTS billing_email TEXT,
            ADD COLUMN IF NOT EXISTS tax_id TEXT,
            ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'FREE' -- FREE, PRO, ENTERPRISE
        `);

        await client.query('COMMIT');
        console.log('Migration Complete');
        process.exit(0);
    } catch (e) {
        if (client) {
            await client.query('ROLLBACK');
        }
        console.error('Migration Failed', e);
        process.exit(1);
    } finally {
        if (client) {
            client.release();
        }
    }
}

migrate();
