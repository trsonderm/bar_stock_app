import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

// ── Shared types ──────────────────────────────────────────────────────────────
interface UsageRow { date: string; quantity: number; }
interface InventoryRow {
    item_id: number;
    item_name: string;
    current_stock: number;
    low_stock_threshold: number;
    order_size: any;
    exclude_from_smart_order?: boolean;
}
interface SupplierRow {
    item_id: number;
    cost_per_unit: string;
    supplier_name: string;
    lead_time_days: number;
    delivery_days_json: any;
}
interface Suggestion {
    item_id: number;
    item_name: string;
    current_stock: number;
    pending_order: number;
    burn_rate: string;
    days_until_empty: number;
    supplier: string;
    suggested_order: number;
    estimated_cost: string;
    reason: string;
    priority: 'CRITICAL' | 'HIGH' | 'HEALTHY';
    model: string;
    data_points: number;          // number of days with usage events
    analysis_days: number;        // window used
    insufficient_data: boolean;   // true when < 7 distinct days of data
}

// ── Burn-rate calculation (all models) ───────────────────────────────────────
function calcBurnRate(
    itemId: number,
    itemUsageMap: Record<number, UsageRow[]>,
    analysisDays: number,
    modelType: string
): number {
    const history = itemUsageMap[itemId] || [];
    if (history.length === 0) return 0;

    // Build a dense day-by-day array (oldest → newest)
    const today = new Date();
    const denseHistory: number[] = [];
    for (let i = analysisDays - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const match = history.find(h => new Date(h.date).toDateString() === d.toDateString());
        denseHistory.push(match ? match.quantity : 0);
    }

    switch (modelType) {
        case 'EMA': {
            const alpha = 2 / (analysisDays + 1);
            let ema = denseHistory[0];
            for (let i = 1; i < denseHistory.length; i++) {
                ema = alpha * denseHistory[i] + (1 - alpha) * ema;
            }
            return Math.max(0, ema);
        }
        case 'WMA': {
            let totalWeight = 0, weightedSum = 0;
            denseHistory.forEach((qty, idx) => {
                const w = idx + 1;
                weightedSum += qty * w;
                totalWeight += w;
            });
            return totalWeight > 0 ? weightedSum / totalWeight : 0;
        }
        case 'LINEAR':
        case 'LINEAR_REGRESSION': {
            const n = denseHistory.length;
            let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
            denseHistory.forEach((y, x) => { sumX += x; sumY += y; sumXY += x * y; sumXX += x * x; });
            const denom = n * sumXX - sumX * sumX;
            if (denom === 0) return sumY / n;
            const slope = (n * sumXY - sumX * sumY) / denom;
            const intercept = (sumY - slope * sumX) / n;
            return Math.max(0, slope * analysisDays + intercept);
        }
        case 'HOLT': {
            const alpha = 0.5, beta = 0.3;
            let level = denseHistory[0];
            let trend = denseHistory.length > 1 ? denseHistory[1] - denseHistory[0] : 0;
            for (let i = 1; i < denseHistory.length; i++) {
                const lastLevel = level;
                level = alpha * denseHistory[i] + (1 - alpha) * (lastLevel + trend);
                trend = beta * (level - lastLevel) + (1 - beta) * trend;
            }
            return Math.max(0, level + trend);
        }
        case 'NEURAL': {
            const lr = 0.0001, epochs = 500, win = 5;
            const training = [];
            for (let i = win; i < denseHistory.length; i++) {
                training.push({ inputs: denseHistory.slice(i - win, i), target: denseHistory[i] });
            }
            if (training.length < 5) return denseHistory.reduce((a, b) => a + b, 0) / denseHistory.length;
            let weights = Array.from({ length: win }, () => Math.random() * 0.1);
            let bias = 0;
            for (let e = 0; e < epochs; e++) {
                training.forEach(({ inputs, target }) => {
                    const out = inputs.reduce((s, v, i) => s + v * weights[i], bias);
                    const err = target - out;
                    weights = weights.map((w, i) => w + lr * err * inputs[i]);
                    bias += lr * err;
                });
            }
            const inputs = denseHistory.slice(-win);
            return Math.max(0, inputs.reduce((s, v, i) => s + v * weights[i], bias));
        }
        default: // SMA
            return denseHistory.reduce((a, b) => a + b, 0) / analysisDays;
    }
}

// ── Generate suggestions for one location ───────────────────────────────────
function buildSuggestions(
    inventory: InventoryRow[],
    itemUsageMap: Record<number, UsageRow[]>,
    supplierMap: Record<number, SupplierRow>,
    pendingMap: Record<number, number>,
    analysisDays: number,
    modelType: string,
    safetyBufferDays: number
): Suggestion[] {
    const suggestions: Suggestion[] = [];

    for (const item of inventory) {
        // Skip items explicitly excluded from smart ordering
        if (item.exclude_from_smart_order) continue;

        const burnRate = calcBurnRate(item.item_id, itemUsageMap, analysisDays, modelType);
        const stock = parseFloat(String(item.current_stock));
        const history = itemUsageMap[item.item_id] || [];
        const dataPoints = history.length; // distinct days with usage events
        const insufficientData = dataPoints < 7;

        let orderSize = 1;
        if (Array.isArray(item.order_size) && item.order_size.length > 0) {
            const first = item.order_size[0];
            // Handle both legacy number format [1, 6] and new {label, amount} format
            orderSize = typeof first === 'object' && first !== null
                ? Number(first.amount)
                : Number(first);
        } else if (typeof item.order_size === 'number') {
            orderSize = item.order_size;
        } else if (typeof item.order_size === 'string') {
            try {
                const parsed = JSON.parse(item.order_size);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    const first = parsed[0];
                    orderSize = typeof first === 'object' ? Number(first.amount) : Number(first);
                }
            } catch { }
        }
        if (!orderSize || isNaN(orderSize) || orderSize <= 0) orderSize = 1;

        const pendingQty = pendingMap[item.item_id] || 0;

        // No usage history and stock is above threshold — skip
        if (burnRate === 0 && stock > (item.low_stock_threshold || 0)) continue;

        // No usage history but below threshold
        if (burnRate === 0) {
            suggestions.push({
                item_id: item.item_id, item_name: item.item_name,
                current_stock: Math.floor(stock), pending_order: pendingQty,
                burn_rate: '0.00', days_until_empty: 0,
                supplier: supplierMap[item.item_id]?.supplier_name || 'Unassigned',
                suggested_order: orderSize, estimated_cost: '0.00',
                reason: 'Below manual threshold — no usage history',
                priority: 'HIGH', model: modelType,
                data_points: dataPoints, analysis_days: analysisDays, insufficient_data: true,
            });
            continue;
        }

        const supplier = supplierMap[item.item_id];
        let leadTime = supplier?.lead_time_days || 1;
        let daysToNextRestock = 7;

        if (supplier) {
            let deliveryDays: number[] = [];
            try {
                const j = supplier.delivery_days_json;
                if (j) deliveryDays = typeof j === 'string' ? JSON.parse(j) : j;
            } catch { }
            if (deliveryDays.length > 0) {
                const today = new Date().getDay();
                deliveryDays.sort((a, b) => a - b);
                const next = deliveryDays.find(d => d > today);
                daysToNextRestock = next !== undefined ? next - today : (7 - today) + deliveryDays[0];
            }
        }

        const physicalDaysLeft = stock / burnRate;
        const daysUntilArrival = daysToNextRestock + leadTime;
        const targetDays = daysUntilArrival + safetyBufferDays;
        const neededStock = burnRate * targetDays;
        const netStock = stock + pendingQty;
        const deficit = neededStock - netStock;

        if (physicalDaysLeft <= daysUntilArrival + safetyBufferDays) {
            if (deficit > 0) {
                const unitsToOrder = Math.ceil(deficit / orderSize) * orderSize;
                suggestions.push({
                    item_id: item.item_id, item_name: item.item_name,
                    current_stock: Math.floor(stock), pending_order: pendingQty,
                    burn_rate: burnRate.toFixed(2),
                    days_until_empty: Math.floor(physicalDaysLeft),
                    supplier: supplier?.supplier_name || 'Unassigned',
                    suggested_order: unitsToOrder,
                    estimated_cost: supplier
                        ? (unitsToOrder * parseFloat(supplier.cost_per_unit || '0')).toFixed(2)
                        : '0.00',
                    reason: `Run out in ${Math.floor(physicalDaysLeft)}d. Needs ${unitsToOrder} more.`,
                    priority: physicalDaysLeft < leadTime ? 'CRITICAL' : 'HIGH',
                    model: modelType,
                    data_points: dataPoints, analysis_days: analysisDays, insufficient_data: insufficientData,
                });
            } else if (pendingQty > 0) {
                suggestions.push({
                    item_id: item.item_id, item_name: item.item_name,
                    current_stock: Math.floor(stock), pending_order: pendingQty,
                    burn_rate: burnRate.toFixed(2),
                    days_until_empty: Math.floor(physicalDaysLeft),
                    supplier: supplier?.supplier_name || 'Unassigned',
                    suggested_order: 0, estimated_cost: '0.00',
                    reason: 'Pending order covers need',
                    priority: 'HEALTHY', model: modelType,
                    data_points: dataPoints, analysis_days: analysisDays, insufficient_data: insufficientData,
                });
            }
        } else {
            suggestions.push({
                item_id: item.item_id, item_name: item.item_name,
                current_stock: Math.floor(stock), pending_order: pendingQty,
                burn_rate: burnRate.toFixed(2),
                days_until_empty: Math.floor(physicalDaysLeft),
                supplier: supplier?.supplier_name || 'Unassigned',
                suggested_order: 0, estimated_cost: '0.00',
                reason: `Sufficient stock (> ${Math.floor(daysUntilArrival + safetyBufferDays)}d)`,
                priority: 'HEALTHY', model: modelType,
                data_points: dataPoints, analysis_days: analysisDays, insufficient_data: insufficientData,
            });
        }
    }

    suggestions.sort((a, b) => {
        const p = { CRITICAL: 0, HIGH: 1, HEALTHY: 2 };
        const pd = p[a.priority] - p[b.priority];
        if (pd !== 0) return pd;
        return a.days_until_empty - b.days_until_empty;
    });

    return suggestions;
}

// ── Route Handler ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const orgId = session.organizationId;
        const SAFETY_BUFFER_DAYS = 2;
        const ANALYSIS_DAYS = parseInt(req.nextUrl.searchParams.get('days') || '30');
        const modelType = req.nextUrl.searchParams.get('model') || 'SMA';
        const singleLocParam = req.nextUrl.searchParams.get('locationId');

        // ── Fetch all locations for this org ──────────────────────────────────
        const allLocations: { id: number; name: string }[] = await db.query(
            'SELECT id, name FROM locations WHERE organization_id = $1 ORDER BY id ASC',
            [orgId]
        );

        if (allLocations.length === 0) {
            return NextResponse.json({ byLocation: [], suggestions: [], suppliers: [], orgName: 'My Bar', supplierCount: 0, notifications: [] });
        }

        // If a specific location was requested, restrict to just that one
        const locationsToProcess = singleLocParam
            ? allLocations.filter(l => l.id === parseInt(singleLocParam))
            : allLocations;

        // ── Shared: supplier info (org-wide) ─────────────────────────────────
        const supplierInfo: SupplierRow[] = await db.query(`
            SELECT
                is_sup.item_id,
                is_sup.cost_per_unit,
                s.name as supplier_name,
                s.lead_time_days,
                s.delivery_days_json
            FROM item_suppliers is_sup
            JOIN suppliers s ON is_sup.supplier_id = s.id
            WHERE s.organization_id = $1 AND is_sup.is_preferred = TRUE
        `, [orgId]);

        const supplierMap: Record<number, SupplierRow> = {};
        supplierInfo.forEach(r => { supplierMap[r.item_id] = r; });

        // ── Shared: late orders (org-wide) ───────────────────────────────────
        const lateOrders = await db.query(`
            SELECT po.id, po.location_id, s.name as supplier_name, po.expected_delivery_date,
                   COUNT(poi.id) as item_count
            FROM purchase_orders po
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            JOIN purchase_order_items poi ON po.id = poi.purchase_order_id
            WHERE po.organization_id = $1
              AND po.status = 'PENDING'
              AND po.expected_delivery_date < NOW()::date
            GROUP BY po.id, s.name, po.expected_delivery_date, po.location_id
        `, [orgId]);

        // ── Org/supplier meta ─────────────────────────────────────────────────
        const allSuppliers = await db.query(
            'SELECT id, name FROM suppliers WHERE organization_id = $1 ORDER BY name ASC',
            [orgId]
        );
        let orgName = 'My Bar';
        try {
            const orgRes = await db.one('SELECT name FROM organizations WHERE id = $1', [orgId]);
            if (orgRes?.name) orgName = orgRes.name;
        } catch { }

        // ── Per-location predictions ──────────────────────────────────────────
        const byLocation: {
            locationId: number;
            locationName: string;
            suggestions: Suggestion[];
            notifications: any[];
        }[] = [];

        for (const loc of locationsToProcess) {
            const locId = loc.id;

            // Usage data scoped to this location
            const usageData = await db.query(`
                SELECT
                    (details->>'itemId')::int as item_id,
                    DATE(timestamp) as usage_date,
                    SUM((details->>'quantity')::numeric) as daily_used
                FROM activity_logs
                WHERE organization_id = $1
                  AND action = 'SUBTRACT_STOCK'
                  AND timestamp >= NOW() - ($2 * INTERVAL '1 day')
                  AND (details->>'locationId')::int = $3
                GROUP BY 1, 2
                ORDER BY 2 ASC
            `, [orgId, ANALYSIS_DAYS, locId]);

            const itemUsageMap: Record<number, UsageRow[]> = {};
            usageData.forEach((row: any) => {
                if (!itemUsageMap[row.item_id]) itemUsageMap[row.item_id] = [];
                itemUsageMap[row.item_id].push({ date: row.usage_date, quantity: Number(row.daily_used) });
            });

            // Inventory for this location
            const inventory: InventoryRow[] = await db.query(`
                SELECT
                    i.id as item_id,
                    i.name as item_name,
                    COALESCE(inv.quantity, 0) as current_stock,
                    COALESCE(i.low_stock_threshold, 5) as low_stock_threshold,
                    i.order_size,
                    COALESCE(i.exclude_from_smart_order, false) as exclude_from_smart_order
                FROM items i
                JOIN inventory inv ON i.id = inv.item_id AND inv.location_id = $2
                WHERE i.organization_id = $1
            `, [orgId, locId]);

            // Pending orders for this location
            const pendingOrders = await db.query(`
                SELECT poi.item_id, SUM(poi.quantity) as pending_qty
                FROM purchase_orders po
                JOIN purchase_order_items poi ON po.id = poi.purchase_order_id
                WHERE po.organization_id = $1
                  AND po.status = 'PENDING'
                  AND (po.location_id = $2 OR po.location_id IS NULL)
                GROUP BY poi.item_id
            `, [orgId, locId]);

            const pendingMap: Record<number, number> = {};
            pendingOrders.forEach((r: any) => { pendingMap[r.item_id] = parseInt(r.pending_qty); });

            const suggestions = buildSuggestions(
                inventory, itemUsageMap, supplierMap, pendingMap,
                ANALYSIS_DAYS, modelType, SAFETY_BUFFER_DAYS
            );

            // Notifications for this location
            const notifications = lateOrders
                .filter((o: any) => o.location_id === locId || o.location_id === null)
                .map((o: any) => ({
                    type: 'MISSED_DELIVERY',
                    title: `Missed Delivery from ${o.supplier_name || 'Unknown'}`,
                    message: `Order #${o.id} (${o.item_count} items) was expected on ${new Date(o.expected_delivery_date).toLocaleDateString()}.`,
                    orderId: o.id,
                    locationId: locId,
                }));

            byLocation.push({ locationId: locId, locationName: loc.name, suggestions, notifications });
        }

        // For backward-compat: flat suggestions = first location (or selected)
        const primarySuggestions = byLocation[0]?.suggestions ?? [];
        const primaryNotifications = byLocation[0]?.notifications ?? [];

        return NextResponse.json({
            byLocation,                                // per-location breakdown
            suggestions: primarySuggestions,           // backward compat
            notifications: primaryNotifications,
            supplierCount: allSuppliers.length,
            suppliers: allSuppliers,
            orgName,
            locationId: locationsToProcess[0]?.id ?? null,
        });

    } catch (e: any) {
        console.error('[Predictive Stock Error]', e);
        return NextResponse.json({ error: e.message || 'Internal Error' }, { status: 500 });
    }
}
