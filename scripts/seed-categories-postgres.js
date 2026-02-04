const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/topshelf'
});

async function seed() {
    const client = await pool.connect();
    try {
        console.log('Seeding Categories for PG...');

        // Default Templates
        // Note: We use JSON arrays for stock_options now (integers)
        const defaults = [
            {
                name: 'Liquor',
                stock_options: JSON.stringify([1]),
                sub_categories: JSON.stringify(["Whiskey", "Bourbon", "Vodka", "Tequila", "Schnapps", "Cognac", "Gin", "Rum", "Scotch", "Cordials"])
            },
            {
                name: 'Beer',
                stock_options: JSON.stringify([1, 6, 12, 24, 48]), // Updated as per request
                sub_categories: JSON.stringify([])
            },
            {
                name: 'Wine',
                stock_options: JSON.stringify([1, 6, 12]),
                sub_categories: JSON.stringify(["Red", "White", "Rose", "Sparkling"])
            },
            {
                name: 'Mixers',
                stock_options: JSON.stringify([1]),
                sub_categories: JSON.stringify([])
            }
        ];

        const res = await client.query('SELECT id, name FROM organizations');
        const orgs = res.rows;

        for (const org of orgs) {
            console.log(`Processing Org: ${org.name} (${org.id})`);
            for (const def of defaults) {
                // Check if exists
                const check = await client.query('SELECT id FROM categories WHERE name = $1 AND organization_id = $2', [def.name, org.id]);
                if (check.rows.length === 0) {
                    await client.query(
                        'INSERT INTO categories (name, stock_options, sub_categories, organization_id) VALUES ($1, $2, $3, $4)',
                        [def.name, def.stock_options, def.sub_categories, org.id]
                    );
                    console.log(`  + Added ${def.name}`);
                } else {
                    console.log(`  . ${def.name} exists, updating stock_options...`);
                    // Force update stock_options to ensure migration effect
                    await client.query(
                        'UPDATE categories SET stock_options = $1 WHERE id = $2',
                        [def.stock_options, check.rows[0].id]
                    );
                }
            }
        }
        console.log('Done.');
    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        pool.end();
    }
}

seed();
