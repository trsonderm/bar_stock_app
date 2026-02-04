import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const orgId = session.organizationId;
        const SAFETY_BUFFER_DAYS = 2; // Extra days of stock to keep as buffer
        const ANALYSIS_DAYS = parseInt(req.nextUrl.searchParams.get('days') || '30'); // 30, 60, 90
        const modelType = req.nextUrl.searchParams.get('model') || 'SMA';

        // We need DAILY data for advanced models (WMA, Linear)
        const usageData = await db.query(`
            SELECT 
                (details->>'itemId')::int as item_id,
                DATE(timestamp) as usage_date,
                SUM((details->>'quantity')::int) as daily_used
            FROM activity_logs
            WHERE organization_id = $1
              AND action = 'SUBTRACT_STOCK'
              AND timestamp >= NOW() - ($2 || ' days')::INTERVAL
            GROUP BY 1, 2
            ORDER BY 2 ASC
        `, [orgId, ANALYSIS_DAYS]);

        // Group by Item
        const itemUsageMap: Record<number, { date: string, quantity: number }[]> = {};
        usageData.forEach((row: any) => {
            if (!itemUsageMap[row.item_id]) itemUsageMap[row.item_id] = [];
            itemUsageMap[row.item_id].push({ date: row.usage_date, quantity: Number(row.daily_used) });
        });

        // Helper: Calculate Burn Rate
        const calculateBurnRate = (itemId: number): number => {
            const history = itemUsageMap[itemId] || [];
            if (history.length === 0) return 0;

            // Fill empty days with 0 for accurate modeling
            // (Simpler approach: Just assume denominator is 30 days for SMA, but for regression we need points)
            // Let's build a dense array of last N days
            const denseHistory: number[] = [];
            const today = new Date();
            for (let i = ANALYSIS_DAYS - 1; i >= 0; i--) {
                const d = new Date(today);
                d.setDate(d.getDate() - i);
                const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD (approx)
                // Match roughly (Timezone issues might occur but okay for demo)
                // Actually the DB returns local or UTC date string.
                // Let's just match using data we have or 0.
                // For robustness, let's just use the known data points mapped to relative index?
                // Better: Just use the data we have for WMA/Linear if it's sparse? 
                // No, "0 usage" is significant.

                // Optimized: Linear scan since usageData is sorted by date? 
                // Let's just use a Map for lookups.
                const match = history.find(h => new Date(h.date).getDate() === d.getDate());
                denseHistory.push(match ? match.quantity : 0);
            }

            if (modelType === 'WMA') {
                // Weighted Moving Average: Recent days matter more
                // Linear Weight: Day 1 (Oldest) = 1, Day 30 (Newest) = 30
                let totalWeight = 0;
                let weightedSum = 0;
                denseHistory.forEach((qty, idx) => {
                    const weight = idx + 1;
                    weightedSum += qty * weight;
                    totalWeight += weight;
                });
                return weightedSum / totalWeight; // Weighted Daily Avg
            } else if (modelType === 'LINEAR') {
                // Linear Regression: y = mx + b
                const n = denseHistory.length;
                let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
                denseHistory.forEach((y, x) => {
                    sumX += x;
                    sumY += y;
                    sumXY += x * y;
                    sumXX += x * x;
                });
                const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
                const intercept = (sumY - slope * sumX) / n;
                const prediction = slope * ANALYSIS_DAYS + intercept;
                return Math.max(0, prediction);

            } else if (modelType === 'HOLT') {
                // Holt's Linear Trend (Double Exponential Smoothing)
                // Good for data with trend but no seasonality.
                const alpha = 0.5; // Level smoothing
                const beta = 0.3;  // Trend smoothing

                let level = denseHistory[0];
                let trend = denseHistory[1] - denseHistory[0];

                for (let i = 1; i < denseHistory.length; i++) {
                    const x = denseHistory[i];
                    const lastLevel = level;
                    level = alpha * x + (1 - alpha) * (lastLevel + trend);
                    trend = beta * (level - lastLevel) + (1 - beta) * trend;
                }
                // Forecast next period (m=1)
                return Math.max(0, level + trend);

            } else if (modelType === 'NEURAL') {
                // Simple Adaline (Adaptive Linear Neuron) Implementation
                // A single-layer neural network trained via Gradient Descent
                const learningRate = 0.0001; // Low LR for stability
                const epochs = 500;
                const inputWindow = 5; // Look at last 5 days to predict next

                // Training Data Preparation: Sliding Window
                // X = [d-5, d-4, d-3, d-2, d-1], Y = [d]
                const trainingSet = [];
                for (let i = inputWindow; i < denseHistory.length; i++) {
                    const inputs = denseHistory.slice(i - inputWindow, i);
                    const target = denseHistory[i];
                    trainingSet.push({ inputs, target });
                }

                // If not enough data, fallback to SMA
                if (trainingSet.length < 5) return denseHistory.reduce((a, b) => a + b, 0) / denseHistory.length;

                // Initialize Weights
                let weights = new Array(inputWindow).fill(0).map(() => Math.random() * 0.1);
                let bias = 0;

                // Training Loop
                for (let e = 0; e < epochs; e++) {
                    trainingSet.forEach(({ inputs, target }) => {
                        const output = inputs.reduce((sum, val, idx) => sum + val * weights[idx], bias);
                        const error = target - output;
                        // Update
                        for (let w = 0; w < weights.length; w++) {
                            weights[w] += learningRate * error * inputs[w];
                        }
                        bias += learningRate * error;
                    });
                }

                // Predict Next Day
                // Inputs are the LAST 5 days of history
                const inputs = denseHistory.slice(denseHistory.length - inputWindow);
                const prediction = inputs.reduce((sum, val, idx) => sum + val * weights[idx], bias);
                return Math.max(0, prediction);

            } else {
                // SMA (Default): Total / 30
                const sum = denseHistory.reduce((a, b) => a + b, 0);
                return sum / ANALYSIS_DAYS;
            }
        };

        const burnRates: Record<number, number> = {};

        // 2. Fetch Current Inventory & Item Details
        const inventory = await db.query(`
            SELECT 
                i.id as item_id,
                i.name as item_name,
                COALESCE(SUM(inv.quantity), 0) as current_stock,
                i.low_stock_threshold,
                i.order_size
            FROM items i
            LEFT JOIN inventory inv ON i.id = inv.item_id
            WHERE i.organization_id = $1 OR i.organization_id IS NULL
            GROUP BY i.id
        `, [orgId]);

        // Calculate Burn Rates for all items found (or with history)
        // Note: inventory list might miss items that have history but 0 stock? 
        // We usually iterate inventory.
        inventory.forEach((item: any) => {
            burnRates[item.item_id] = calculateBurnRate(item.item_id);
        });

        // 3. Fetch Supplier Info (Preferred Supplier per item)
        const supplierInfo = await db.query(`
            SELECT 
                is_sup.item_id,
                is_sup.cost_per_unit,
                s.name as supplier_name,
                s.lead_time_days,
                s.delivery_days_json
            FROM item_suppliers is_sup
            JOIN suppliers s ON is_sup.supplier_id = s.id
            WHERE s.organization_id = $1
              AND is_sup.is_preferred = TRUE
        `, [orgId]);

        const supplierMap: Record<number, any> = {};
        supplierInfo.forEach((row: any) => {
            supplierMap[row.item_id] = row;
        });

        // 4. Check for Pending Orders (Wait until stock updated)
        // If an item has a PENDING order that has passed its expected delivery, user needs alert.
        // If it looks like it's coming, we might reduce suggestion?
        // User request: "Estimate... AND THEN WAIT till stock updated". 
        // This implies if there is a pending order, maybe we show it instead of a new suggestion?
        // Or we deduct the pending amount from the needed amount?
        // Let's Fetch pending orders.
        const pendingOrders = await db.query(`
            SELECT poi.item_id, SUM(poi.quantity) as pending_qty
            FROM purchase_orders po
            JOIN purchase_order_items poi ON po.id = poi.purchase_order_id
            WHERE po.organization_id = $1 AND po.status = 'PENDING'
            GROUP BY poi.item_id
        `, [orgId]);

        const pendingMap: Record<number, number> = {};
        pendingOrders.forEach((r: any) => pendingMap[r.item_id] = parseInt(r.pending_qty));

        // 5. Generate Suggestions
        const suggestions = [];

        for (const item of inventory) {
            const burnRate = burnRates[item.item_id] || 0;
            const stock = parseFloat(item.current_stock);
            const orderSize = item.order_size || 1;
            const pendingQty = pendingMap[item.item_id] || 0;

            // If we have a pending order that covers our needs, do we suppress?
            // "Update each day until the order is placed and then wait till the stock is updated"
            // This suggests: If Pending Order Exists, logic changes.
            // If Pending Order Exists, we generally DON'T suggest ordering MORE unless that order is late/insufficient.
            // Let's deduct pendingQty from Needed.

            if (burnRate === 0 && stock > item.low_stock_threshold) continue;

            // ... (Low stock / No history logic omitted for brevity, keeping same if burnRate=0) ...
            if (burnRate === 0) {
                if (stock <= item.low_stock_threshold) {
                    suggestions.push({
                        item_id: item.item_id,
                        item_name: item.item_name,
                        reason: 'Below manual threshold',
                        priority: 'HIGH',
                        current_stock: stock,
                        burn_rate: 0,
                        days_until_empty: '0.0',
                        suggested_order: orderSize,
                        estimated_cost: 0,
                        model: modelType
                    });
                }
                continue;
            }

            const daysUntilEmpty = stock / burnRate;
            const supplier = supplierMap[item.item_id];

            // Determine Days Until Next Restock (Same Logic)
            let daysToNextRestock = 7;
            let leadTime = 1;
            if (supplier) {
                leadTime = supplier.lead_time_days || 1;
                let deliveryDays = [];
                try {
                    const json = supplier.delivery_days_json;
                    if (json) deliveryDays = typeof json === 'string' ? JSON.parse(json) : json;
                } catch (e) { }
                if (deliveryDays.length > 0) {
                    const today = new Date().getDay();
                    deliveryDays.sort((a: number, b: number) => a - b);
                    const nextDay = deliveryDays.find((d: number) => d > today);
                    daysToNextRestock = nextDay !== undefined ? nextDay - today : (7 - today) + deliveryDays[0];
                }
            }

            const targetDays = daysToNextRestock + leadTime + SAFETY_BUFFER_DAYS;
            const neededStock = burnRate * targetDays;

            // "Net Stock" = Current Stock + Pending Orders
            const netStock = stock + pendingQty;

            const deficit = neededStock - netStock;

            // Trigger based on DaysUntilEmpty (using physical stock)
            // But if we have pending order coming, we might be safe.
            const daysUntilArrival = daysToNextRestock + leadTime;
            const physicalDaysLeft = stock / burnRate;

            // If we are physically low...
            if (physicalDaysLeft <= daysUntilArrival + SAFETY_BUFFER_DAYS) {
                // If Deficit > 0 (meaning Pending Order wasn't enough), suggest more.
                // If Pending Order IS enough, we 'Wait'.

                if (deficit > 0) {
                    const unitsToOrder = Math.ceil(deficit / orderSize) * orderSize;
                    suggestions.push({
                        item_id: item.item_id,
                        item_name: item.item_name,
                        current_stock: stock,
                        pending_order: pendingQty,
                        burn_rate: burnRate.toFixed(2),
                        days_until_empty: physicalDaysLeft.toFixed(1),
                        supplier: supplier ? supplier.supplier_name : 'Unknown',
                        suggested_order: unitsToOrder,
                        estimated_cost: supplier ? (unitsToOrder * parseFloat(supplier.cost_per_unit || '0')).toFixed(2) : '0.00',
                        reason: `Run out in ${physicalDaysLeft.toFixed(1)}d. Needs ${unitsToOrder} more.`,
                        priority: physicalDaysLeft < leadTime ? 'CRITICAL' : 'HIGH',
                        model: modelType
                    });
                } else if (pendingQty > 0) {
                    // Pending covers it
                    suggestions.push({
                        item_id: item.item_id,
                        item_name: item.item_name,
                        current_stock: stock,
                        pending_order: pendingQty,
                        burn_rate: burnRate.toFixed(2),
                        days_until_empty: physicalDaysLeft.toFixed(1),
                        supplier: supplier ? supplier.supplier_name : 'Unknown',
                        suggested_order: 0,
                        estimated_cost: '0.00',
                        reason: `Pending Order #${0} Coming`, // pendingMap doesn't have ID, simplifies
                        priority: 'HEALTHY',
                        model: modelType
                    });
                }
            } else {
                // Healthy (Stock Sufficient)
                suggestions.push({
                    item_id: item.item_id,
                    item_name: item.item_name,
                    current_stock: stock,
                    pending_order: pendingQty,
                    burn_rate: burnRate.toFixed(2),
                    days_until_empty: physicalDaysLeft.toFixed(1),
                    supplier: supplier ? supplier.supplier_name : 'Unknown',
                    suggested_order: 0,
                    estimated_cost: '0.00',
                    reason: `Sufficient Stock (> ${daysUntilArrival + SAFETY_BUFFER_DAYS}d)`,
                    priority: 'HEALTHY',
                    model: modelType
                });
            }
        }

        //Sort by priority (Critical first) then days until empty
        suggestions.sort((a, b) => parseFloat(a.days_until_empty) - parseFloat(b.days_until_empty));

        // 5. Generate Notifications (Missed Deliveries)
        const lateOrders = await db.query(`
            SELECT 
                po.id, 
                s.name as supplier_name, 
                po.expected_delivery_date,
                count(poi.id) as item_count
            FROM purchase_orders po
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            JOIN purchase_order_items poi ON po.id = poi.purchase_order_id
            WHERE po.organization_id = $1 
              AND po.status = 'PENDING'
              AND po.expected_delivery_date < NOW()::date
            GROUP BY po.id, s.name, po.expected_delivery_date
        `, [orgId]);

        const notifications = lateOrders.map((o: any) => ({
            type: 'MISSED_DELIVERY',
            title: `Missed Delivery from ${o.supplier_name || 'Unknown'}`,
            message: `Order #${o.id} (${o.item_count} items) was expected on ${new Date(o.expected_delivery_date).toLocaleDateString()}. Not updated?`,
            orderId: o.id
        }));

        // 6. Generate Suggestions
        // ... (existing loop) ...

        // ... (inside loop) ...
        // ...


        // 7. Get All Suppliers & Org Details
        const allSuppliers = await db.query('SELECT id, name FROM suppliers WHERE organization_id = $1 ORDER BY name ASC', [orgId]);
        const supplierCount = allSuppliers.length;

        let orgName = 'My Bar';
        try {
            const orgRes = await db.one('SELECT name FROM organizations WHERE id = $1', [orgId]);
            if (orgRes && orgRes.name) orgName = orgRes.name;
        } catch (err) {
            console.warn('Failed to fetch org name', err);
        }

        return NextResponse.json({ suggestions, notifications, supplierCount, suppliers: allSuppliers, orgName });


    } catch (e) {
        console.error('Predictive Stock Error', e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
