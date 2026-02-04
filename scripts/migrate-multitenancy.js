const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath, { verbose: console.log });

console.log('Starting Multi-Tenant Migration...');

// 1. Create Organizations Table
db.exec(`
  CREATE TABLE IF NOT EXISTS organizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    subdomain TEXT UNIQUE, -- Optional: for subdomain routing later
    billing_status TEXT DEFAULT 'active', -- active, past_due, canceled
    subscription_plan TEXT DEFAULT 'free_trial',
    trial_ends_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);
console.log('Created organizations table.');

// 2. Create Default Organization (for existing data)
// Check if any org exists first
const existingOrg = db.prepare('SELECT * FROM organizations LIMIT 1').get();
let defaultOrgId;

if (!existingOrg) {
    const info = db.prepare(`
        INSERT INTO organizations (name, subscription_plan, trial_ends_at) 
        VALUES ('Default Organization', 'free_trial', datetime('now', '+14 days'))
    `).run();
    defaultOrgId = info.lastInsertRowid;
    console.log(`Created default organization with ID: ${defaultOrgId}`);
} else {
    defaultOrgId = existingOrg.id;
    console.log(`Using existing organization ID: ${defaultOrgId}`);
}

// 3. Helper to add organization_id column safely
function addOrgIdColumn(tableName) {
    try {
        const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
        const hasOrgId = columns.some(col => col.name === 'organization_id');

        if (!hasOrgId) {
            console.log(`Adding organization_id to ${tableName}...`);
            db.prepare(`ALTER TABLE ${tableName} ADD COLUMN organization_id INTEGER`).run();
            // Assign existing rows to default org
            db.prepare(`UPDATE ${tableName} SET organization_id = ? WHERE organization_id IS NULL`).run(defaultOrgId);
            console.log(`Updated existing ${tableName} records to Org ID ${defaultOrgId}`);
        } else {
            console.log(`Table ${tableName} already has organization_id.`);
        }
    } catch (err) {
        console.error(`Error migrating ${tableName}:`, err.message);
    }
}

// 4. Migrate Tables
const tablesToMigrate = [
    'users',
    'locations',
    'categories',
    'items', // Items are now org-specific? Or verify logic. 
    // Requirement: "seperate instances... for different companies with seperate data for the whole app"
    // YES, items are org specific.
    'inventory', // linked to items/locations which are now org specific, but good to have direct link or rely on joins?
    // Let's add it to key tables first.
    'activity_logs',
    'settings' // Global settings vs Org settings? Existing settings are likely becoming Org Settings.
];

tablesToMigrate.forEach(table => addOrgIdColumn(table));

// 5. Update Users Table for Email/Password Auth (if needed) and Super Admin
// Check for email column
const userCols = db.prepare('PRAGMA table_info(users)').all();
if (!userCols.some(c => c.name === 'email')) {
    db.prepare('ALTER TABLE users ADD COLUMN email TEXT').run();
    db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL').run();
    console.log('Added email column to users with unique index.');
}
if (!userCols.some(c => c.name === 'password_hash')) {
    db.prepare('ALTER TABLE users ADD COLUMN password_hash TEXT').run();
    console.log('Added password_hash column to users.');
}

// Create Super Admin if not exists
const superAdminEmail = 'admin@fosters.com'; // Default initial super admin
const adminUser = db.prepare('SELECT * FROM users WHERE email = ?').get(superAdminEmail);

if (!adminUser) {
    // Check if we can convert the existing "Master Admin"
    const oldAdmin = db.prepare("SELECT * FROM users WHERE role = 'admin' AND email IS NULL LIMIT 1").get();

    if (oldAdmin) {
        console.log('Converting existing Master Admin to Super Admin...');
        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync('admin123', salt); // Default password

        db.prepare(`
            UPDATE users 
            SET email = ?, password_hash = ?, permissions = json_insert(permissions, '$[#]', 'super_admin') 
            WHERE id = ?
        `).run(superAdminEmail, hash, oldAdmin.id);
        console.log(`Converted User ${oldAdmin.id} to Super Admin (${superAdminEmail} / admin123)`);
    }
}

// 6. Create Support Tickets Table
db.exec(`
  CREATE TABLE IF NOT EXISTS support_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER,
    user_id INTEGER,
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT DEFAULT 'open', -- open, in_progress, resolved, closed
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);
console.log('Created support_tickets table.');

// 7. Create Support Ticket Messages Table (for conversation history)
db.exec(`
  CREATE TABLE IF NOT EXISTS support_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL, -- The sender (admin or user)
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);
console.log('Created support_messages table.');


console.log('Migration Complete.');
