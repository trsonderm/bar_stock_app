const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/topshelf',
});

async function createSuperAdmin() {
    const email = process.argv[2];
    const password = process.argv[3];

    if (!email || !password) {
        console.error('Usage: node scripts/create_super_admin.js <email> <password>');
        process.exit(1);
    }

    try {
        const client = await pool.connect();
        console.log(`Checking if email ${email} exists...`);

        const userCheck = await client.query('SELECT id FROM users WHERE email = $1', [email]);
        
        const passHash = await bcrypt.hash(password, 10);
        const pinHash = await bcrypt.hash('1234', 10); // Default pin

        if (userCheck.rows.length > 0) {
            console.log('User exists. Upgrading to Super Admin...');
            await client.query(`
                UPDATE users 
                SET role = 'super_admin', permissions = '["all", "super_admin"]', password_hash = $1
                WHERE email = $2
            `, [passHash, email]);
            console.log('✅ User upgraded to Super Admin successfully!');
        } else {
            console.log('User does not exist. Creating new Super Admin...');
            
            // Generate a dummy organization for the super admin to belong to
            const orgRes = await client.query(`INSERT INTO organizations (name, billing_status) VALUES ('Super Admin Global', 'active') RETURNING id`);
            const orgId = orgRes.rows[0].id;

            await client.query(`
                INSERT INTO users (first_name, last_name, email, password_hash, pin_hash, role, permissions, organization_id)
                VALUES ('Super', 'Admin', $1, $2, $3, 'super_admin', '["all", "super_admin"]', $4)
            `, [email, passHash, pinHash, orgId]);

            console.log('✅ Super Admin account created successfully!');
        }

        client.release();
        process.exit(0);

    } catch (error) {
        console.error('Fatal Error:', error);
        process.exit(1);
    }
}

createSuperAdmin();
