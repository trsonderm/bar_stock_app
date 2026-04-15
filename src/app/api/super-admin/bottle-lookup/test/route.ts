import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { BottleLookupConfig, DEFAULT_BOTTLE_LOOKUP_CONFIG } from '@/lib/bottle-lookup-config';

const SETTINGS_KEY = 'bottle_lookup_config';

interface StepEvent {
    step: string;
    status: 'checking' | 'hit' | 'miss' | 'error' | 'skipped';
    message: string;
    durationMs?: number;
    result?: Record<string, unknown>;
}

function sse(event: string, data: unknown): string {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function loadConfig(): Promise<BottleLookupConfig> {
    try {
        const row = await db.one(`SELECT value FROM system_settings WHERE key = $1 LIMIT 1`, [SETTINGS_KEY]);
        if (!row) return DEFAULT_BOTTLE_LOOKUP_CONFIG;
        return { ...DEFAULT_BOTTLE_LOOKUP_CONFIG, ...JSON.parse(row.value) };
    } catch {
        return DEFAULT_BOTTLE_LOOKUP_CONFIG;
    }
}

async function lookupLocal(barcode: string, organizationId?: number): Promise<{ found: boolean; item?: Record<string, unknown> }> {
    // Search barcodes JSONB array and legacy barcode TEXT column
    const rows = await db.query(`
        SELECT id, name, type, supplier
        FROM items
        WHERE
            (barcodes @> $1::jsonb OR barcode = $2)
            ${organizationId ? 'AND organization_id = $3' : ''}
        LIMIT 1
    `, organizationId
        ? [`["${barcode}"]`, barcode, organizationId]
        : [`["${barcode}"]`, barcode]
    );
    if (rows.length > 0) return { found: true, item: rows[0] };
    return { found: false };
}

async function lookupUpcItemDb(barcode: string, apiKey: string): Promise<{ found: boolean; item?: Record<string, unknown>; rawStatus?: number; error?: string }> {
    const url = `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`;
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (apiKey) {
        headers['user_key'] = apiKey;
        headers['key_type'] = '3scale';
    }
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { found: false, rawStatus: res.status, error: `HTTP ${res.status}` };
    const data = await res.json();
    if (data.items && data.items.length > 0) {
        const item = data.items[0];
        return {
            found: true,
            item: {
                name: item.title,
                brand: item.brand,
                category: item.category,
                description: item.description?.slice(0, 200),
                images: item.images?.slice(0, 1),
                ean: item.ean,
                upc: item.upc,
            },
        };
    }
    return { found: false, rawStatus: res.status };
}

async function lookupOpenFoodFacts(barcode: string): Promise<{ found: boolean; item?: Record<string, unknown>; error?: string }> {
    const url = `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`;
    const res = await fetch(url, { headers: { 'User-Agent': 'BarStockApp/1.0' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { found: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    if (data.status === 1 && data.product) {
        const p = data.product;
        return {
            found: true,
            item: {
                name: p.product_name || p.product_name_en,
                brand: p.brands,
                category: p.categories_tags?.[0]?.replace('en:', ''),
                quantity: p.quantity,
                image: p.image_url,
            },
        };
    }
    return { found: false };
}

async function lookupBarcodeLookup(barcode: string, apiKey: string): Promise<{ found: boolean; item?: Record<string, unknown>; error?: string }> {
    if (!apiKey) return { found: false, error: 'No API key configured' };
    const url = `https://api.barcodelookup.com/v3/products?barcode=${encodeURIComponent(barcode)}&formatted=y&key=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { found: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    if (data.products && data.products.length > 0) {
        const p = data.products[0];
        return {
            found: true,
            item: {
                name: p.product_name,
                brand: p.brand,
                category: p.category,
                description: p.description?.slice(0, 200),
                image: p.images?.[0],
            },
        };
    }
    return { found: false };
}

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || !session.isSuperAdmin) {
        return new Response(sse('error', { message: 'Unauthorized' }), { status: 401 });
    }

    const barcode = req.nextUrl.searchParams.get('barcode')?.trim();
    if (!barcode) {
        return new Response(sse('error', { message: 'No barcode provided' }), { status: 400 });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const send = (event: string, data: unknown) => {
                controller.enqueue(encoder.encode(sse(event, data)));
            };

            try {
                send('start', { barcode, ts: Date.now() });

                const config = await loadConfig();
                send('config', {
                    local_lookup_enabled: config.local_lookup_enabled,
                    external_lookup_enabled: config.external_lookup_enabled,
                    external_lookup_provider: config.external_lookup_provider,
                    has_upcitemdb_key: !!config.upcitemdb_api_key,
                    has_barcodelookup_key: !!config.barcodelookup_api_key,
                });

                // Step 1 — local
                if (config.local_lookup_enabled) {
                    send('step', { step: 'local', status: 'checking', message: 'Searching local inventory database...' } satisfies StepEvent);
                    const t0 = Date.now();
                    try {
                        const local = await lookupLocal(barcode, session.organizationId ?? undefined);
                        const durationMs = Date.now() - t0;
                        if (local.found) {
                            send('step', { step: 'local', status: 'hit', message: `Found in local inventory: ${(local.item as any)?.name}`, durationMs, result: local.item } satisfies StepEvent);
                            send('done', { success: true, source: 'local', result: local.item });
                            controller.close();
                            return;
                        } else {
                            send('step', { step: 'local', status: 'miss', message: 'Not found in local inventory.', durationMs } satisfies StepEvent);
                        }
                    } catch (e: any) {
                        send('step', { step: 'local', status: 'error', message: `Local lookup error: ${e?.message || 'unknown'}`, durationMs: Date.now() - t0 } satisfies StepEvent);
                    }
                } else {
                    send('step', { step: 'local', status: 'skipped', message: 'Local lookup disabled.' } satisfies StepEvent);
                }

                // Step 2 — external
                if (!config.external_lookup_enabled || config.external_lookup_provider === 'none') {
                    send('step', { step: 'external', status: 'skipped', message: 'External lookup disabled.' } satisfies StepEvent);
                    send('done', { success: false, source: null, result: null });
                    controller.close();
                    return;
                }

                const providerLabel: Record<string, string> = {
                    upcitemdb: 'UPCitemdb',
                    open_food_facts: 'Open Food Facts',
                    barcodelookup: 'Barcode Lookup',
                };
                const label = providerLabel[config.external_lookup_provider] ?? config.external_lookup_provider;

                send('step', { step: 'external', status: 'checking', message: `Querying ${label}...` } satisfies StepEvent);
                const t1 = Date.now();

                try {
                    let externalResult: { found: boolean; item?: Record<string, unknown>; rawStatus?: number; error?: string };

                    if (config.external_lookup_provider === 'upcitemdb') {
                        externalResult = await lookupUpcItemDb(barcode, config.upcitemdb_api_key);
                    } else if (config.external_lookup_provider === 'open_food_facts') {
                        externalResult = await lookupOpenFoodFacts(barcode);
                    } else if (config.external_lookup_provider === 'barcodelookup') {
                        externalResult = await lookupBarcodeLookup(barcode, config.barcodelookup_api_key);
                    } else {
                        externalResult = { found: false, error: 'Unknown provider' };
                    }

                    const durationMs = Date.now() - t1;

                    if (externalResult.found) {
                        send('step', { step: 'external', status: 'hit', message: `Found via ${label}: ${(externalResult.item as any)?.name ?? 'Product found'}`, durationMs, result: externalResult.item } satisfies StepEvent);
                        send('done', { success: true, source: config.external_lookup_provider, result: externalResult.item });
                    } else {
                        const errMsg = externalResult.error ? ` (${externalResult.error})` : '';
                        send('step', { step: 'external', status: 'miss', message: `Not found via ${label}${errMsg}.`, durationMs } satisfies StepEvent);
                        send('done', { success: false, source: null, result: null });
                    }
                } catch (e: any) {
                    const durationMs = Date.now() - t1;
                    const msg = e?.name === 'TimeoutError' ? `${label} timed out after 8s` : (e?.message || 'Request failed');
                    send('step', { step: 'external', status: 'error', message: msg, durationMs } satisfies StepEvent);
                    send('done', { success: false, source: null, result: null, error: msg });
                }

            } catch (e: any) {
                controller.enqueue(encoder.encode(sse('error', { message: e?.message || 'Internal error' })));
            } finally {
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}
