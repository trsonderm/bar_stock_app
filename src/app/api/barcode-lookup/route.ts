import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { DEFAULT_BOTTLE_LOOKUP_CONFIG, BottleLookupConfig } from '@/lib/bottle-lookup-config';

interface LookupResult {
    found: boolean;
    source: 'local' | 'site' | 'external' | null;
    barcode: string;
    name?: string;
    type?: string;
    secondary_type?: string;
    unit_cost?: number;
    item_id?: number; // if found in local inventory
    raw?: any;
    external_available?: boolean;
    checked_local?: boolean;
    checked_site?: boolean;
    checked_external?: boolean;
}

async function fetchExternalLookup(barcode: string, config: BottleLookupConfig): Promise<LookupResult | null> {
    const provider = config.external_lookup_provider;

    if (provider === 'upcitemdb') {
        const apiKey = config.upcitemdb_api_key;
        const url = `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`;
        const headers: Record<string, string> = { 'Accept': 'application/json' };
        if (apiKey) {
            headers['user_key'] = apiKey;
            headers['key_type'] = '3scale';
        }
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
        if (!res.ok) return null;
        const data = await res.json();
        const item = data?.items?.[0];
        if (!item) return null;

        const title: string = item.title || item.description || '';
        // Heuristic: classify by title keywords
        const type = classifyByName(title);

        return {
            found: true,
            source: 'external',
            barcode,
            name: title,
            type: type.type,
            secondary_type: type.secondary_type,
            raw: item,
        };
    }

    if (provider === 'open_food_facts') {
        const url = `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) return null;
        const data = await res.json();
        if (data.status !== 1 || !data.product) return null;
        const product = data.product;
        const title: string = product.product_name || product.generic_name || '';
        const type = classifyByName(title);
        return {
            found: true,
            source: 'external',
            barcode,
            name: title,
            type: type.type,
            secondary_type: type.secondary_type,
            raw: product,
        };
    }

    if (provider === 'barcodelookup') {
        const apiKey = config.barcodelookup_api_key;
        if (!apiKey) return null;
        const url = `https://api.barcodelookup.com/v3/products?barcode=${encodeURIComponent(barcode)}&formatted=y&key=${apiKey}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) return null;
        const data = await res.json();
        const product = data?.products?.[0];
        if (!product) return null;
        const title: string = product.title || product.product_name || '';
        const type = classifyByName(title);
        return {
            found: true,
            source: 'external',
            barcode,
            name: title,
            type: type.type,
            secondary_type: type.secondary_type,
            raw: product,
        };
    }

    return null;
}

function classifyByName(name: string): { type: string; secondary_type: string } {
    const lower = name.toLowerCase();
    if (/whiskey|whisky|bourbon|scotch|rye whiskey/.test(lower)) return { type: 'Liquor', secondary_type: 'Whiskey' };
    if (/vodka/.test(lower)) return { type: 'Liquor', secondary_type: 'Vodka' };
    if (/rum/.test(lower)) return { type: 'Liquor', secondary_type: 'Rum' };
    if (/tequila|mezcal/.test(lower)) return { type: 'Liquor', secondary_type: 'Tequila' };
    if (/gin/.test(lower)) return { type: 'Liquor', secondary_type: 'Gin' };
    if (/brandy|cognac/.test(lower)) return { type: 'Liquor', secondary_type: 'Brandy' };
    if (/liqueur|schnapps|triple sec|amaretto|baileys/.test(lower)) return { type: 'Liquor', secondary_type: 'Liqueur' };
    if (/wine|chardonnay|cabernet|merlot|pinot|sauvignon|riesling|prosecco|champagne|rosé|rose|shiraz|malbec/.test(lower)) return { type: 'Wine', secondary_type: '' };
    if (/beer|lager|ale|ipa|stout|porter|pilsner|wheat|sour/.test(lower)) return { type: 'Beer', secondary_type: '' };
    if (/soda|cola|sprite|juice|water|red bull|energy/.test(lower)) return { type: 'Mixer', secondary_type: '' };
    return { type: 'Liquor', secondary_type: '' };
}

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rawBarcode = req.nextUrl.searchParams.get('barcode');
    const localOnly = req.nextUrl.searchParams.get('localOnly') === 'true';
    if (!rawBarcode) return NextResponse.json({ error: 'Missing barcode' }, { status: 400 });
    // Normalize UPC-A/EAN-13: strip leading 0 from 13-digit codes
    const barcode = rawBarcode.trim().length === 13 && rawBarcode.trim().startsWith('0')
        ? rawBarcode.trim().slice(1)
        : rawBarcode.trim();

    // Load config
    let config: BottleLookupConfig = { ...DEFAULT_BOTTLE_LOOKUP_CONFIG };
    try {
        const row = await db.one(`SELECT value FROM system_settings WHERE key = 'bottle_lookup_config' LIMIT 1`, []);
        if (row) config = { ...config, ...JSON.parse(row.value) };
    } catch { }

    let checkedLocal = false;
    let checkedSite = false;
    let checkedExternal = false;

    // 1. Local lookup — check JSONB barcodes array AND legacy barcode TEXT column
    if (config.local_lookup_enabled) {
        checkedLocal = true;
        try {
            const byBarcode = await db.one(
                `SELECT id, name, type, secondary_type, unit_cost
                 FROM items
                 WHERE organization_id = $1
                   AND (
                     (barcodes IS NOT NULL AND jsonb_typeof(barcodes) = 'array' AND barcodes @> to_jsonb($2::text))
                     OR barcode = $2
                   )
                 LIMIT 1`,
                [session.organizationId, barcode]
            );
            if (byBarcode) {
                return NextResponse.json({
                    found: true,
                    source: 'local',
                    barcode,
                    name: byBarcode.name,
                    type: byBarcode.type,
                    secondary_type: byBarcode.secondary_type,
                    unit_cost: byBarcode.unit_cost,
                    item_id: byBarcode.id,
                } as LookupResult);
            }
        } catch (e) {
            console.error('[barcode-lookup local]', e);
        }
    }

    // 2. Site bottle DB lookup
    if (!localOnly && config.site_lookup_enabled) {
        checkedSite = true;
        try {
            const siteRow = await db.one(
                `SELECT id, barcode, brand, name, size, abv, type, secondary_type, image_data
                 FROM site_bottle_db WHERE barcode = $1 LIMIT 1`,
                [barcode]
            );
            if (siteRow) {
                return NextResponse.json({
                    found: true,
                    source: 'site',
                    barcode,
                    name: siteRow.brand ? `${siteRow.brand} ${siteRow.name}` : siteRow.name,
                    type: siteRow.type,
                    secondary_type: siteRow.secondary_type,
                    checked_local: checkedLocal,
                    checked_site: true,
                } as LookupResult);
            }
        } catch (e) {
            console.error('[barcode-lookup site]', e);
        }
    }

    // 3. External lookup
    const externalEnabled = !localOnly && config.external_lookup_enabled && config.external_lookup_provider !== 'none';
    if (externalEnabled) {
        checkedExternal = true;
        try {
            const result = await fetchExternalLookup(barcode, config);
            if (result) return NextResponse.json({ ...result, checked_local: checkedLocal, checked_site: checkedSite, checked_external: true });
        } catch (e) {
            console.error('[barcode-lookup external]', e);
        }
    }

    return NextResponse.json({
        found: false,
        source: null,
        barcode,
        checked_local: checkedLocal,
        checked_site: checkedSite,
        checked_external: checkedExternal,
        external_available: config.external_lookup_enabled && config.external_lookup_provider !== 'none',
    } as LookupResult);
}
