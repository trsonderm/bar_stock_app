// Native fetch is available in Node 18+
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

const BASE_URL = 'http://localhost:6050/api/auth/login';

async function testLogin(name, body, headers = {}) {
    console.log(`\nTesting: ${name}`);
    try {
        // Native fetch in Node 18+
        const response = await fetch(BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...headers
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        console.log(`Status: ${response.status}`);
        console.log(`Response:`, JSON.stringify(data));
        return { status: response.status, data };
    } catch (e) {
        console.error('Request failed:', e.message);
        return { status: 500, error: e.message };
    }
}

async function run() {
    // 1. PIN Login - No Token
    await testLogin('PIN Login - No Token (Expect 401)', { pin: '0420' });

    // 2. PIN Login - Invalid Token
    await testLogin('PIN Login - Invalid Token (Expect 401)', { pin: '0420' }, {
        'Cookie': 'station_token=invalid_token'
    });

    // 3. Setup Valid Token
    const orgId = 1; // Assuming default organization
    // Check if org exists, if not create (init-db might not create orgs table properly?)
    // Orgs table check:
    try {
        const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(orgId);
        if (!org) {
            console.log('Inserting default organization...');
            db.prepare('INSERT INTO organizations (id, name, subdomain) VALUES (?, ?, ?)').run(orgId, 'Default Bar', 'default');
        }
    } catch (e) {
        // Table might not exist based on previous exploration?
        // Step 124 showed 'organizations' and 'organization_tokens' exist.
    }

    const { v4: uuidv4 } = require('uuid');
    const validToken = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 1);

    console.log(`Inserting valid token: ${validToken}`);
    db.prepare('INSERT INTO organization_tokens (organization_id, token, device_name, expires_at) VALUES (?, ?, ?, ?)').run(orgId, validToken, 'Test Device', expiresAt.toISOString());

    // 4. PIN Login - Valid Token
    await testLogin('PIN Login - Valid Token (Expect 200)', { pin: '0420' }, {
        'Cookie': `station_token=${validToken}`
    });

    // 5. Email Login - No Token (Should work for super admin/legacy)
    // Need a valid email user.
    // 'Super Admin' has email? Check db.
    const user = db.prepare('SELECT * FROM users WHERE email IS NOT NULL LIMIT 1').get();
    if (user) {
        // We don't know the password... 
        // Create a temp email user?
        // Actually, we can just test that it DOESN'T return "Station not authorized".
        // If credentials invalid, it returns 401 "Invalid credentials".
        // If station check fails, it returns 401 "Station not authorized".
        const res = await testLogin('Email Login - No Token (Expect 401 Invalid Creds, NOT Station Error)', { email: 'fake@example.com', password: 'wrong' });
        if (res.data.error === 'Station not authorized. Please log in with email and password.') {
            console.error('FAILED: Email login got station error!');
        } else {
            console.log('SUCCESS: Email login bypassed station check (got other error or success).');
        }
    } else {
        console.log('No email user found to test email login completely, but testing bypass logic.');
        const res = await testLogin('Email Login - No Token (Expect 401 Invalid Creds)', { email: 'fake@example.com', password: 'wrong' });
        if (res.data.error === 'Station not authorized. Please log in with email and password.') {
            console.error('FAILED: Email login got station error!');
        } else {
            console.log('SUCCESS: Email login bypassed station check.');
        }
    }
}

run();
