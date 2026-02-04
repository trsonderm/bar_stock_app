const { Pool } = require('pg');

const pool = new Pool({
    connectionString: 'postgresql://postgres:postgres@localhost:5433/topshelf',
});

async function createTable() {
    const client = await pool.connect();
    try {
        console.log('Creating item_suppliers table...');

        const query = `
            CREATE TABLE IF NOT EXISTS item_suppliers (
                item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
                supplier_id INTEGER REFERENCES suppliers(id) ON DELETE CASCADE,
                cost_per_unit DECIMAL(10, 2) NOT NULL DEFAULT 0,
                supplier_sku VARCHAR(255),
                is_preferred BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (item_id, supplier_id)
            );
            
            -- Add index for faster lookups
            CREATE INDEX IF NOT EXISTS idx_item_suppliers_supplier ON item_suppliers(supplier_id);
            CREATE INDEX IF NOT EXISTS idx_item_suppliers_item ON item_suppliers(item_id);
        `;

        await client.query(query);
        console.log('Table created successfully.');

    } catch (e) {
        console.error('Error creating table:', e);
    } finally {
        client.release();
        pool.end();
    }
}

createTable();
