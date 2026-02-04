'use client';

import styles from '../../admin.module.css';

export default function SetupGuidePage() {
    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <h1 className={styles.cardTitle} style={{ fontSize: '2rem', marginBottom: '1rem' }}>🚀 Getting Started Guide</h1>
                <p style={{ color: '#d1d5db', marginBottom: '2rem' }}>
                    Follow this step-by-step guide to set up your inventory system correctly.
                </p>

                <div className={styles.grid} style={{ gap: '2rem' }}>

                    {/* Step 1 */}
                    <div className={styles.card} style={{ background: '#1f2937', borderColor: '#374151' }}>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                            <div style={{ background: '#3b82f6', color: 'white', width: '30px', height: '30px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>1</div>
                            <div>
                                <h3 style={{ margin: '0 0 0.5rem 0', color: 'white' }}>Create Suppliers</h3>
                                <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>
                                    Before adding products, add your suppliers so you can assign them to items.
                                </p>
                                <a href="/admin/suppliers" style={{ color: '#60a5fa', textDecoration: 'none' }}>Go to Suppliers &rarr;</a>
                            </div>
                        </div>
                    </div>

                    {/* Step 2 */}
                    <div className={styles.card} style={{ background: '#1f2937', borderColor: '#374151' }}>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                            <div style={{ background: '#3b82f6', color: 'white', width: '30px', height: '30px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>2</div>
                            <div>
                                <h3 style={{ margin: '0 0 0.5rem 0', color: 'white' }}>Define Product Categories</h3>
                                <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>
                                    Create groups for your products (e.g. "Liquor", "Beer").
                                    <strong>Crucial:</strong> Define the "Stock Buttons" (e.g. +1, +6, +24) that staff will use to count inventory.
                                </p>
                                <a href="/admin/categories" style={{ color: '#60a5fa', textDecoration: 'none' }}>Go to Product Categories &rarr;</a>
                            </div>
                        </div>
                    </div>

                    {/* Step 3 */}
                    <div className={styles.card} style={{ background: '#1f2937', borderColor: '#374151' }}>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                            <div style={{ background: '#3b82f6', color: 'white', width: '30px', height: '30px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>3</div>
                            <div>
                                <h3 style={{ margin: '0 0 0.5rem 0', color: 'white' }}>Add Products</h3>
                                <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>
                                    Add your inventory items.
                                    <ul style={{ paddingLeft: '1.2rem', marginTop: '0.5rem' }}>
                                        <li>Assign them to a <strong>Category</strong>.</li>
                                        <li>Select a <strong>Supplier</strong>.</li>
                                        <li>Enable <strong>"Track Quantity"</strong> if you want to count stock levels.</li>
                                    </ul>
                                </p>
                                <a href="/admin/products" style={{ color: '#60a5fa', textDecoration: 'none' }}>Go to Products &rarr;</a>
                            </div>
                        </div>
                    </div>

                    {/* Step 4 */}
                    <div className={styles.card} style={{ background: '#1f2937', borderColor: '#374151' }}>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                            <div style={{ background: '#3b82f6', color: 'white', width: '30px', height: '30px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>4</div>
                            <div>
                                <h3 style={{ margin: '0 0 0.5rem 0', color: 'white' }}>Configure Reporting</h3>
                                <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>
                                    Set up your daily report emails and low stock alerts.
                                </p>
                                <a href="/admin/settings/reporting" style={{ color: '#60a5fa', textDecoration: 'none' }}>Go to Reporting Settings &rarr;</a>
                            </div>
                        </div>
                    </div>

                </div>

                <div style={{ marginTop: '3rem', borderTop: '1px solid #374151', paddingTop: '2rem' }}>
                    <h2 style={{ color: 'white', marginBottom: '1rem' }}>📸 Interface Tour</h2>

                    <div style={{ marginBottom: '2rem' }}>
                        <h3 style={{ color: '#d1d5db' }}>Product Categories (Previously Variances)</h3>
                        <p style={{ color: '#9ca3af' }}>Use this screen to define how products are counted.</p>
                        <div style={{ background: '#000', padding: '2rem', borderRadius: '0.5rem', border: '1px dashed #4b5563', color: '#6b7280', textAlign: 'center' }}>
                            [Screenshot Reuse of Category Page]
                        </div>
                    </div>

                    <div style={{ marginBottom: '2rem' }}>
                        <h3 style={{ color: '#d1d5db' }}>Adding a Product</h3>
                        <p style={{ color: '#9ca3af' }}>Ensure "Track Quantity" is checked for items you want to count.</p>
                        <div style={{ background: '#000', padding: '2rem', borderRadius: '0.5rem', border: '1px dashed #4b5563', color: '#6b7280', textAlign: 'center' }}>
                            [Screenshot Reuse of Add Product Modal]
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
