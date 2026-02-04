const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'inventory.db');
const db = new Database(dbPath);

try {
    console.log('Cleaning up duplicate locations...');

    // Keep only the entry with the lowest ID for each (organization_id, name)
    const result = db.prepare(`
        DELETE FROM locations 
        WHERE id NOT IN (
            SELECT MIN(id) 
            FROM locations 
            GROUP BY organization_id, name
        )
    `).run();

    console.log(`Deleted ${result.changes} duplicate locations.`);

} catch (error) {
    console.error('Cleanup failed:', error);
}
