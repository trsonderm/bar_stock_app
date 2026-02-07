const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local manually
const envPath = path.resolve(__dirname, '../.env.local');
let dbUrl = process.env.DATABASE_URL;

if (!dbUrl && fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/DATABASE_URL=(.*)/);
    if (match && match[1]) {
        dbUrl = match[1].trim().replace(/['"]/g, '');
    }
}

if (!dbUrl) {
    console.error('DATABASE_URL not found');
    process.exit(1);
}

const client = new Client({
    connectionString: dbUrl
});

async function migrate() {
    try {
        await client.connect();
        console.log('Connected to database.');

        console.log('Migrating organizations to default plan (base)...');

        // 1. Update subscription_plan to 'base' where missing or legacy 'free_trial'
        const res = await client.query(`
            UPDATE organizations 
            SET subscription_plan = 'base' 
            WHERE subscription_plan IS NULL OR subscription_plan = 'free_trial' OR subscription_plan = '';
        `);

        console.log(`Updated ${res.rowCount} organizations to plan: base`);

        // 2. Ensure billing_status is active for simplicity
        const res2 = await client.query(`
            UPDATE organizations 
            SET billing_status = 'active' 
            WHERE billing_status IS NULL OR billing_status = '';
        `);
        console.log(`Updated ${res2.rowCount} organizations to billing_status: active`);

        console.log('Migration successful.');
    } catch (e) {
        console.error('Migration failed:', e);
        process.exit(1);
    } finally {
        await client.end();
    }
}

migrate();
