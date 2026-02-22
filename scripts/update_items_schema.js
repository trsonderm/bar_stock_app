const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/topshelf'
});

async function run() {
    try {
        const client = await pool.connect();

        console.log('Adding missing columns to items table...');

        await client.query(`
            ALTER TABLE items 
            ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER DEFAULT 5,
            ADD COLUMN IF NOT EXISTS include_in_audit BOOLEAN DEFAULT TRUE,
            ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;
        `);

        console.log('Columns added. Migrating category_id based on item type...');

        // Update items to link to categories where names match within the same organization
        const res = await client.query(`
            UPDATE items i
            SET category_id = c.id
            FROM categories c
            WHERE i.organization_id = c.organization_id 
            AND i.type = c.name
            AND i.category_id IS NULL;
        `);

        console.log(`Updated ${res.rowCount} items with category_id.`);

        // Also handle global categories (where org_id is null) for items? 
        // Or assume items always have org_id and categories should exist for that org?
        // The previous migration duplicated categories for orgs, so the above query should cover most cases.

        // Let's also set default low_stock_threshold if null (though schema handles default on new inserts, existing rows might need it if added without default previously, but here we add with default)

        client.release();
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await pool.end();
    }
}

run();
