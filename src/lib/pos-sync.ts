import { db } from './db';

// ─── Toast POS ─────────────────────────────────────────────────────────────

async function getToastAccessToken(clientId: string, clientSecret: string): Promise<string> {
    const res = await fetch('https://ws-api.toasttab.com/authentication/v1/authentication/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret, userAccessType: 'TOAST_MACHINE_CLIENT' }),
    });
    if (!res.ok) throw new Error(`Toast auth failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    if (!data.token?.accessToken) throw new Error('Toast auth response missing accessToken');
    return data.token.accessToken;
}

export async function syncToastPOS(orgId: number, locationId?: number): Promise<{ fetched: number; inserted: number }> {
    const globalRow = await db.one("SELECT value FROM system_settings WHERE key = 'pos_toast_settings'").catch(() => null);
    const globalSettings: Record<string, string> = globalRow ? JSON.parse(globalRow.value) : {};

    const orgSettings = await db.one(
        "SELECT credentials, config, last_synced_at FROM pos_sync_settings WHERE organization_id = $1 AND pos_type = 'toast'",
        [orgId]
    ).catch(() => null);

    if (!orgSettings?.credentials) throw new Error('Toast credentials not configured for this organization');

    const creds = orgSettings.credentials as Record<string, string>;
    const clientId = globalSettings.client_id || creds.client_id;
    const clientSecret = globalSettings.client_secret || creds.client_secret;
    const restaurantGuid = creds.restaurant_guid;

    if (!clientId || !clientSecret || !restaurantGuid) throw new Error('Incomplete Toast credentials');

    const accessToken = await getToastAccessToken(clientId, clientSecret);

    // Date range: last sync or past 7 days
    const since = orgSettings.last_synced_at ? new Date(orgSettings.last_synced_at) : new Date(Date.now() - 7 * 86400000);
    const startDate = since.toISOString().slice(0, 10).replace(/-/g, '');
    const endDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    const ordersRes = await fetch(
        `https://ws-api.toasttab.com/orders/v2/ordersBulk?startDate=${startDate}&endDate=${endDate}`,
        {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Toast-Restaurant-External-ID': restaurantGuid,
            },
        }
    );
    if (!ordersRes.ok) throw new Error(`Toast orders fetch failed: ${ordersRes.status}`);
    const orders = await ordersRes.json();

    let fetched = 0;
    let inserted = 0;

    for (const order of (Array.isArray(orders) ? orders : [])) {
        if (!order.closedDate || !order.checks) continue;
        fetched++;
        try {
            const transAt = new Date(order.closedDate);
            const total = order.checks.reduce((s: number, c: any) => s + (c.totalAmount || 0), 0) / 100;
            const tax = order.checks.reduce((s: number, c: any) => s + (c.taxAmount || 0), 0) / 100;
            const tip = order.checks.reduce((s: number, c: any) => s + (c.tipAmount || 0), 0) / 100;

            const txRow = await db.one(
                `INSERT INTO pos_transactions
                    (organization_id, location_id, pos_type, external_id, transaction_at, total_amount, tax_amount, tip_amount, status, raw_data)
                 VALUES ($1,$2,'toast',$3,$4,$5,$6,$7,$8,$9)
                 ON CONFLICT (organization_id, pos_type, external_id) DO NOTHING
                 RETURNING id`,
                [orgId, locationId || null, order.guid, transAt, total, tax, tip, order.voided ? 'VOIDED' : 'CLOSED', JSON.stringify(order)]
            ).catch(() => null);

            if (txRow) {
                inserted++;
                for (const check of order.checks) {
                    for (const sel of (check.selections || [])) {
                        await db.execute(
                            `INSERT INTO pos_transaction_items
                                (transaction_id, organization_id, pos_item_id, pos_item_name, category_name, quantity, unit_price, modifiers)
                             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                            [
                                txRow.id, orgId,
                                sel.itemRef?.guid || sel.guid || null,
                                sel.displayName || sel.itemRef?.displayName || 'Unknown Item',
                                sel.salesCategory?.name || null,
                                sel.quantity || 1,
                                (sel.price || 0) / 100,
                                JSON.stringify(sel.modifiers || []),
                            ]
                        ).catch(() => {});
                    }
                }
            }
        } catch { }
    }

    await db.execute(
        `UPDATE pos_sync_settings SET last_synced_at = NOW(), updated_at = NOW()
         WHERE organization_id = $1 AND pos_type = 'toast'`,
        [orgId]
    );

    return { fetched, inserted };
}

// ─── Clover POS ────────────────────────────────────────────────────────────

export async function syncCloverPOS(orgId: number, locationId?: number): Promise<{ fetched: number; inserted: number }> {
    const orgSettings = await db.one(
        "SELECT credentials, config, last_synced_at FROM pos_sync_settings WHERE organization_id = $1 AND pos_type = 'clover'",
        [orgId]
    ).catch(() => null);

    if (!orgSettings?.credentials) throw new Error('Clover credentials not configured for this organization');

    const creds = orgSettings.credentials as Record<string, string>;
    const merchantId = creds.merchant_id;
    const accessToken = creds.access_token;
    if (!merchantId || !accessToken) throw new Error('Incomplete Clover credentials');

    const since = orgSettings.last_synced_at ? new Date(orgSettings.last_synced_at).getTime() : Date.now() - 7 * 86400000;
    const url = `https://api.clover.com/v3/merchants/${merchantId}/orders?filter=clientCreatedTime>${since}&expand=lineItems&limit=1000`;

    const ordersRes = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!ordersRes.ok) throw new Error(`Clover orders fetch failed: ${ordersRes.status}`);
    const data = await ordersRes.json();
    const orders: any[] = data.elements || [];

    let fetched = 0;
    let inserted = 0;

    for (const order of orders) {
        if (order.state === 'locked' || order.state === 'open') continue;
        fetched++;
        try {
            const transAt = new Date(order.clientCreatedTime);
            const total = (order.total || 0) / 100;

            const txRow = await db.one(
                `INSERT INTO pos_transactions
                    (organization_id, location_id, pos_type, external_id, transaction_at, total_amount, status, raw_data)
                 VALUES ($1,$2,'clover',$3,$4,$5,$6,$7)
                 ON CONFLICT (organization_id, pos_type, external_id) DO NOTHING
                 RETURNING id`,
                [orgId, locationId || null, order.id, transAt, total, order.state || 'CLOSED', JSON.stringify(order)]
            ).catch(() => null);

            if (txRow) {
                inserted++;
                for (const item of (order.lineItems?.elements || [])) {
                    await db.execute(
                        `INSERT INTO pos_transaction_items
                            (transaction_id, organization_id, pos_item_id, pos_item_name, quantity, unit_price)
                         VALUES ($1,$2,$3,$4,$5,$6)`,
                        [
                            txRow.id, orgId,
                            item.item?.id || null,
                            item.name || 'Unknown Item',
                            item.unitQty ? item.unitQty / 1000 : 1,
                            (item.price || 0) / 100,
                        ]
                    ).catch(() => {});
                }
            }
        } catch { }
    }

    await db.execute(
        `UPDATE pos_sync_settings SET last_synced_at = NOW(), updated_at = NOW()
         WHERE organization_id = $1 AND pos_type = 'clover'`,
        [orgId]
    );

    return { fetched, inserted };
}

// ─── Orchestration ─────────────────────────────────────────────────────────

export async function runPOSSyncForOrg(orgId: number, triggeredBy = 'cron'): Promise<void> {
    const org = await db.one(
        'SELECT toast_pos_enabled, clover_pos_enabled FROM organizations WHERE id = $1',
        [orgId]
    ).catch(() => null);
    if (!org) return;

    const globalRow = await db.one("SELECT value FROM system_settings WHERE key = 'pos_global_enabled'").catch(() => null);
    const globalEnabled = globalRow?.value === 'true';

    const syncSettings = await db.query(
        "SELECT pos_type, sync_enabled FROM pos_sync_settings WHERE organization_id = $1",
        [orgId]
    );

    for (const ss of syncSettings) {
        if (!ss.sync_enabled) continue;
        const typeEnabled = ss.pos_type === 'toast' ? org.toast_pos_enabled : org.clover_pos_enabled;
        if (!globalEnabled && !typeEnabled) continue;

        const logRow = await db.one(
            `INSERT INTO pos_sync_logs (organization_id, pos_type, started_at, status, triggered_by)
             VALUES ($1,$2,NOW(),'running',$3) RETURNING id`,
            [orgId, ss.pos_type, triggeredBy]
        ).catch(() => null);
        const logId = logRow?.id;

        try {
            const result = ss.pos_type === 'toast'
                ? await syncToastPOS(orgId)
                : await syncCloverPOS(orgId);

            if (logId) {
                await db.execute(
                    `UPDATE pos_sync_logs SET completed_at = NOW(), status = 'success',
                     records_fetched = $1, records_inserted = $2 WHERE id = $3`,
                    [result.fetched, result.inserted, logId]
                );
            }
        } catch (e) {
            if (logId) {
                await db.execute(
                    `UPDATE pos_sync_logs SET completed_at = NOW(), status = 'error', error_message = $1 WHERE id = $2`,
                    [String(e), logId]
                );
            }
        }
    }
}

export async function runAllPOSSync(): Promise<void> {
    const globalRow = await db.one("SELECT value FROM system_settings WHERE key = 'pos_global_enabled'").catch(() => null);
    const globalEnabled = globalRow?.value === 'true';

    const orgs = await db.query(
        globalEnabled
            ? "SELECT id FROM organizations WHERE billing_status = 'active'"
            : "SELECT id FROM organizations WHERE billing_status = 'active' AND (toast_pos_enabled = TRUE OR clover_pos_enabled = TRUE)"
    );

    for (const org of orgs) {
        try {
            await runPOSSyncForOrg(org.id);
        } catch (e) {
            console.error(`[POS Sync] Failed for org ${org.id}:`, e);
        }
    }
}
