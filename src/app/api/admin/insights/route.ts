import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import {
  DEFAULT_ML_CONFIG,
  MLModelConfig,
  burnRate,
  detectAnomalies,
  dowPattern,
  computeSMA,
} from '@/lib/ml';

interface ItemUsageRow {
  item_id: number;
  item_name: string;
  unit_cost: number;
  low_stock_threshold: number;
  log_date: string;
  usage: number;
  restocked: number;
}

interface InventoryRow {
  id: number;
  name: string;
  type: string;
  unit_cost: number;
  low_stock_threshold: number;
  current_stock: number;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.organizationId || session.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get('days') || '90');
  const locationId = searchParams.get('locationId') ? parseInt(searchParams.get('locationId')!) : null;
  const orgId = session.organizationId;

  try {
    // Load ML config
    const configRow = await db.one(
      "SELECT value FROM system_settings WHERE key = 'ml_model_config' LIMIT 1",
      []
    );
    const config: MLModelConfig = configRow
      ? { ...DEFAULT_ML_CONFIG, ...JSON.parse(configRow.value) }
      : DEFAULT_ML_CONFIG;

    // --- a. Daily usage per item ---
    let usageQuery = `
      SELECT
        i.id as item_id, i.name as item_name, i.unit_cost, i.low_stock_threshold,
        DATE(al.timestamp) as log_date,
        SUM(CASE WHEN al.action = 'SUBTRACT_STOCK' THEN ABS((al.details->>'quantity')::numeric) ELSE 0 END) as usage,
        SUM(CASE WHEN al.action = 'ADD_STOCK' THEN ABS((al.details->>'quantity')::numeric) ELSE 0 END) as restocked
      FROM activity_logs al
      JOIN items i ON (al.details->>'itemId')::int = i.id
      WHERE al.organization_id = $1
        AND al.timestamp >= NOW() - INTERVAL '${days} days'
        AND (al.action = 'SUBTRACT_STOCK' OR al.action = 'ADD_STOCK')
    `;
    const usageParams: unknown[] = [orgId];
    if (locationId) {
      usageQuery += ` AND (al.details->>'locationId')::int = $2`;
      usageParams.push(locationId);
    }
    usageQuery += ' GROUP BY i.id, i.name, i.unit_cost, i.low_stock_threshold, DATE(al.timestamp) ORDER BY i.id, log_date';

    const usageRows: ItemUsageRow[] = await db.query(usageQuery, usageParams);

    // --- b. Current inventory ---
    let invQuery = `
      SELECT i.id, i.name, i.type, i.unit_cost, i.low_stock_threshold,
        COALESCE(SUM(inv.quantity), 0) as current_stock
      FROM items i
      LEFT JOIN inventory inv ON i.id = inv.item_id
    `;
    const invParams: unknown[] = [orgId];
    if (locationId) {
      invQuery += ` AND inv.location_id = $2`;
      invParams.push(locationId);
    }
    invQuery += ' WHERE i.organization_id = $1 GROUP BY i.id, i.name, i.type, i.unit_cost, i.low_stock_threshold';

    const inventoryRows: InventoryRow[] = await db.query(invQuery, invParams);

    // Group usage rows by item
    const itemUsageMap: Record<number, ItemUsageRow[]> = {};
    for (const row of usageRows) {
      if (!itemUsageMap[row.item_id]) itemUsageMap[row.item_id] = [];
      itemUsageMap[row.item_id].push(row);
    }

    // Build date range
    const now = new Date();
    const dateList: string[] = [];
    for (let d = days - 1; d >= 0; d--) {
      const dt = new Date(now);
      dt.setDate(dt.getDate() - d);
      dateList.push(dt.toISOString().slice(0, 10));
    }
    const last7Dates = new Set(dateList.slice(-7));
    const prior7Dates = new Set(dateList.slice(-14, -7));

    // Per-item analysis
    interface ItemAnalysis {
      item_id: number;
      item_name: string;
      unit_cost: number;
      low_stock_threshold: number;
      current_stock: number;
      dailyUsageValues: number[];
      burn: number;
      last7Avg: number;
      prior7Avg: number;
      changePercent: number;
      costImpact: number;
      anomalies: ReturnType<typeof detectAnomalies>['anomalies'];
      anomalyMean: number;
      anomalyStdDev: number;
      zScore: number;
      hasActivity: boolean;
    }

    const analyses: ItemAnalysis[] = [];
    const allDateValues: { date: string; value: number }[] = [];

    for (const inv of inventoryRows) {
      const rows = itemUsageMap[inv.id] || [];
      const usageByDate: Record<string, number> = {};
      for (const r of rows) {
        usageByDate[r.log_date] = (usageByDate[r.log_date] || 0) + Number(r.usage);
      }

      const dailyUsageValues = dateList.map(d => usageByDate[d] || 0);

      for (const d of dateList) {
        allDateValues.push({ date: d, value: usageByDate[d] || 0 });
      }

      const br = burnRate(dailyUsageValues, config, config.insights_model);
      const last7Vals = dateList.slice(-7).map(d => usageByDate[d] || 0);
      const prior7Vals = dateList.slice(-14, -7).map(d => usageByDate[d] || 0);
      const last7Avg = last7Vals.reduce((a, b) => a + b, 0) / 7;
      const prior7Avg = prior7Vals.reduce((a, b) => a + b, 0) / 7;
      const changePercent = prior7Avg === 0 ? 0 : ((last7Avg - prior7Avg) / prior7Avg) * 100;
      const costImpact = br * Number(inv.unit_cost) * 7;

      const { anomalies, mean: anomalyMean, stdDev: anomalyStdDev } = detectAnomalies(
        dailyUsageValues,
        config.anomaly_z_threshold
      );

      const recentAnomalies = anomalies.filter(a => last7Dates.has(dateList[a.index]));
      const maxZ = recentAnomalies.length > 0 ? Math.max(...recentAnomalies.map(a => a.zScore)) : 0;

      analyses.push({
        item_id: inv.id,
        item_name: inv.name,
        unit_cost: Number(inv.unit_cost),
        low_stock_threshold: Number(inv.low_stock_threshold),
        current_stock: Number(inv.current_stock),
        dailyUsageValues,
        burn: br,
        last7Avg,
        prior7Avg,
        changePercent,
        costImpact,
        anomalies: recentAnomalies,
        anomalyMean,
        anomalyStdDev,
        zScore: maxZ,
        hasActivity: rows.length > 0,
      });
    }

    // --- c. Dead stock (current_stock > 0 but 0 usage last 21 days) ---
    const deadStockItems = analyses.filter(a => {
      const last21 = a.dailyUsageValues.slice(-21).reduce((s, v) => s + v, 0);
      return a.current_stock > 0 && last21 === 0;
    });

    // --- d. Frequent stockout (had activity but current_stock <= threshold in last 14 days) ---
    const frequentStockout = analyses.filter(a => {
      const last14 = a.dailyUsageValues.slice(-14).reduce((s, v) => s + v, 0);
      return last14 > 0 && a.current_stock <= a.low_stock_threshold;
    });

    // --- e. KPIs ---
    const totalItems = inventoryRows.length;
    const belowThreshold = analyses.filter(a => a.current_stock <= a.low_stock_threshold).length;
    const healthScore = totalItems > 0 ? 100 - Math.round((belowThreshold / totalItems) * 100) : 100;
    const anomalyCount = analyses.reduce((sum, a) => sum + a.anomalies.length, 0);
    const weeklyUsageCost = analyses.reduce((sum, a) => sum + a.costImpact, 0);

    // This week vs prior week cost
    const thisWeekCost = analyses.reduce((sum, a) => {
      const w = a.dailyUsageValues.slice(-7).reduce((s, v) => s + v, 0);
      return sum + w * a.unit_cost;
    }, 0);
    const priorWeekCost = analyses.reduce((sum, a) => {
      const w = a.dailyUsageValues.slice(-14, -7).reduce((s, v) => s + v, 0);
      return sum + w * a.unit_cost;
    }, 0);
    const weekVsPriorWeek = priorWeekCost === 0 ? 0 : ((thisWeekCost - priorWeekCost) / priorWeekCost) * 100;

    const deadStockCount = deadStockItems.length;

    // Estimated waste score: high CV items
    const estimatedWasteScore = analyses.filter(a => {
      if (a.anomalyMean === 0) return false;
      const cv = a.anomalyStdDev / a.anomalyMean;
      return cv > 1.0 && a.current_stock > 0;
    }).length;

    // --- f. Day of week patterns ---
    const dowStats = dowPattern(allDateValues);

    // --- g. Anomaly list ---
    interface AnomalyInsight {
      item_id: number;
      item_name: string;
      unit_cost: number;
      anomalyType: 'SPIKE' | 'DROP' | 'HIGH_VARIANCE';
      severity: 'critical' | 'warning' | 'info';
      recentAvg: number;
      baselineAvg: number;
      changePercent: number;
      zScore: number;
      costImpact: number;
      recommendation: string;
    }

    const anomalyInsights: AnomalyInsight[] = [];
    for (const a of analyses) {
      if (a.anomalies.length === 0) continue;
      const dominant = a.anomalies.sort((x, y) => y.zScore - x.zScore)[0];
      const anomalyType: 'SPIKE' | 'DROP' | 'HIGH_VARIANCE' =
        a.anomalyStdDev / (a.anomalyMean || 1) > 1.2 ? 'HIGH_VARIANCE' :
          dominant.direction === 'spike' ? 'SPIKE' : 'DROP';
      const severity: 'critical' | 'warning' | 'info' =
        dominant.zScore >= 3.0 ? 'critical' : dominant.zScore >= 2.0 ? 'warning' : 'info';

      const recommendation =
        anomalyType === 'SPIKE'
          ? `Unusually high consumption detected for ${a.item_name}. Verify counts and check for waste or spillage.`
          : anomalyType === 'DROP'
            ? `Unusually low usage for ${a.item_name}. Verify this item is being tracked properly.`
            : `Highly variable demand for ${a.item_name}. Consider more frequent smaller reorders.`;

      anomalyInsights.push({
        item_id: a.item_id,
        item_name: a.item_name,
        unit_cost: a.unit_cost,
        anomalyType,
        severity,
        recentAvg: a.last7Avg,
        baselineAvg: a.anomalyMean,
        changePercent: a.changePercent,
        zScore: dominant.zScore,
        costImpact: a.costImpact,
        recommendation,
      });
    }

    anomalyInsights.sort((a, b) => b.zScore - a.zScore);

    // --- h. Suggestions ---
    interface Suggestion {
      icon: string;
      title: string;
      description: string;
      priority: 'high' | 'medium' | 'low';
      impact?: string;
    }

    const suggestions: Suggestion[] = [];

    // Dead stock
    for (const item of deadStockItems.slice(0, 2)) {
      suggestions.push({
        icon: '📦',
        title: `Move dead stock: ${item.item_name}`,
        description: `Consider reducing par level or promoting ${item.item_name} to move inventory. No usage in 21+ days.`,
        priority: 'medium',
        impact: `$${(item.current_stock * item.unit_cost).toFixed(2)} tied up`,
      });
    }

    // Frequent stockout
    for (const item of frequentStockout.slice(0, 2)) {
      const lowCount = item.dailyUsageValues.slice(-14).filter(v => v > 0).length;
      suggestions.push({
        icon: '⚠️',
        title: `Increase reorder point: ${item.item_name}`,
        description: `${item.item_name} ran low ${lowCount} times in the last 14 days. Increase par level or set an earlier reorder point.`,
        priority: 'high',
        impact: 'Prevent stockouts',
      });
    }

    // High cost + high burn
    const highBurnCost = [...analyses]
      .filter(a => a.burn > 0 && a.unit_cost > 20)
      .sort((a, b) => b.costImpact - a.costImpact)
      .slice(0, 1);
    for (const item of highBurnCost) {
      suggestions.push({
        icon: '💰',
        title: `High value burn: ${item.item_name}`,
        description: `${item.item_name} is consuming ~$${item.costImpact.toFixed(2)}/week. Ensure tight inventory controls and verify counts frequently.`,
        priority: 'high',
        impact: `$${item.costImpact.toFixed(2)}/week`,
      });
    }

    // High variance
    const highVariance = analyses.filter(a => {
      if (a.anomalyMean === 0) return false;
      return (a.anomalyStdDev / a.anomalyMean) > 1.0;
    }).slice(0, 1);
    for (const item of highVariance) {
      suggestions.push({
        icon: '📊',
        title: `Unpredictable demand: ${item.item_name}`,
        description: `${item.item_name} has highly variable demand. Consider more frequent smaller orders to avoid overstock and waste.`,
        priority: 'medium',
      });
    }

    // Items with no threshold
    const noThreshold = analyses.filter(a => !a.low_stock_threshold || a.low_stock_threshold === 0).slice(0, 1);
    for (const item of noThreshold) {
      suggestions.push({
        icon: '🔔',
        title: `Set threshold: ${item.item_name}`,
        description: `No low stock threshold set for ${item.item_name}. Set one to enable automated alerts and prevent stockouts.`,
        priority: 'low',
      });
    }

    // Items approaching stockout
    const approaching = analyses
      .filter(a => a.burn > 0 && a.current_stock > 0)
      .map(a => ({ ...a, daysLeft: a.current_stock / a.burn }))
      .filter(a => a.daysLeft <= 7 && a.daysLeft > 0)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 1);
    for (const item of approaching) {
      suggestions.push({
        icon: '🕐',
        title: `Reorder soon: ${item.item_name}`,
        description: `${item.item_name} will run out in ~${Math.floor(item.daysLeft)} days at current burn rate. Plan a reorder now.`,
        priority: 'high',
        impact: `~${Math.floor(item.daysLeft)} days remaining`,
      });
    }

    // Best performing
    const stable = analyses
      .filter(a => a.burn > 0 && a.anomalies.length === 0 && a.current_stock > a.low_stock_threshold)
      .slice(0, 1);
    for (const item of stable) {
      suggestions.push({
        icon: '✅',
        title: `Well-calibrated: ${item.item_name}`,
        description: `${item.item_name} has consistent stock levels and no anomalies. Current par level appears well-calibrated.`,
        priority: 'low',
      });
    }

    const topSuggestions = suggestions.slice(0, 8);

    // Top cost items
    const topCostItems = [...analyses]
      .filter(a => a.burn > 0)
      .sort((a, b) => b.costImpact - a.costImpact)
      .slice(0, 10)
      .map(a => ({
        item_name: a.item_name,
        weekly_cost: a.costImpact,
        burn_rate: a.burn,
        current_stock: a.current_stock,
      }));

    return NextResponse.json({
      kpis: {
        healthScore,
        totalItems,
        belowThreshold,
        anomalyCount,
        weeklyUsageCost,
        weekVsPriorWeek,
        deadStockCount,
        estimatedWasteScore,
      },
      anomalies: anomalyInsights,
      suggestions: topSuggestions,
      dowPattern: dowStats,
      topCostItems,
      config,
    });
  } catch (e) {
    console.error('[insights GET]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
