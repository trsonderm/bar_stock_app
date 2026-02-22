const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/topshelf'
});

async function run() {
    const client = await pool.connect();
    try {
        console.log('--- Organization Analysis ---\n');

        const orgs = await client.query('SELECT id, name, created_at FROM organizations ORDER BY id');

        for (const org of orgs.rows) {
            console.log(`[ORG ID: ${org.id}] ${org.name} (Created: ${new Date(org.created_at).toISOString().split('T')[0]})`);

            // Locations
            const locs = await client.query('SELECT id, name FROM locations WHERE organization_id = $1', [org.id]);
            if (locs.rows.length > 0) {
                console.log('  Locations:');
                locs.rows.forEach(l => console.log(`    - [Loc ID: ${l.id}] ${l.name}`));
            } else {
                console.log('  Locations: (None)');
            }

            // Users
            const users = await client.query('SELECT id, first_name, last_name, email, role FROM users WHERE organization_id = $1', [org.id]);
            if (users.rows.length > 0) {
                console.log('  Users:');
                users.rows.forEach(u => console.log(`    - [User ID: ${u.id}] ${u.first_name} ${u.last_name} (${u.role}) - ${u.email || 'No Email'}`));
            } else {
                console.log('  Users: (None)');
            }
            console.log('\n');
        }

        console.log('--- Duplicate User Analysis (By Name) ---');
        const dups = await client.query(`
            SELECT first_name, last_name, count(*) as count, array_agg(organization_id) as orgs 
            FROM users 
            GROUP BY first_name, last_name 
            HAVING count(*) > 1
        `);

        if (dups.rows.length > 0) {
            dups.rows.forEach(d => {
                console.log(`User "${d.first_name} ${d.last_name}" appears in Org IDs: ${d.orgs.join(', ')}`);
            });
        } else {
            console.log('No duplicate user names found.');
        }

    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        pool.end();
    }
}

run();
