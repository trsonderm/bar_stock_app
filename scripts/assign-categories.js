const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/topshelf',
});

async function main() {
    const client = await pool.connect();
    try {
        console.log('Starting Category Enforcement...');

        // 1. Get all Organizations
        const orgsRes = await client.query('SELECT id, name FROM organizations');
        const orgs = orgsRes.rows;
        console.log(`Found ${orgs.length} organizations.`);

        // 2. Define Standard Categories (Superset)
        const defaults = [
            { name: 'Liquor', options: [1] },
            { name: 'Beer', options: [1, 6, 24] },
            { name: 'Wine', options: [1] },
            { name: 'Mixers', options: [1] },
            { name: 'Food', options: [1] },
            { name: 'Merch', options: [1] },
            { name: 'Seltzer', options: [1, 4, 8] },
            { name: 'THC', options: [1] }
        ];

        // 3. For each Org, ensure they have these categories
        for (const org of orgs) {
            console.log(`\nChecking org: ${org.name} (${org.id})...`);

            for (const def of defaults) {
                // Check match
                const check = await client.query(
                    'SELECT id FROM categories WHERE organization_id = $1 AND name = $2',
                    [org.id, def.name]
                );

                if (check.rows.length === 0) {
                    console.log(`  -> Creating missing category "${def.name}"...`);
                    await client.query(
                        `INSERT INTO categories 
                        (name, organization_id, stock_options, sub_categories) 
                        VALUES ($1, $2, $3, $4)`,
                        [
                            def.name,
                            org.id,
                            JSON.stringify(def.options),
                            JSON.stringify([])
                        ]
                    );
                } else {
                    // console.log(`  -> "${def.name}" exists.`);
                }
            }
        }

        console.log('\nEnforcement Complete.');
    } catch (err) {
        console.error('Migration Failed:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
