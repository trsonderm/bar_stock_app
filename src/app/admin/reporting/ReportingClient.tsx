'use client';

import { useState, useEffect } from 'react';
import styles from '../admin.module.css';
import { Plus, Trash2, Edit, FileText, Save, BarChart2, Calendar, Settings, AlertTriangle, Activity, UserCheck, Printer } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts';

interface ReportSection {
    id?: number;
    type: 'chart' | 'table' | 'summary';
    title: string;
    data_source: 'inventory' | 'activity' | 'orders' | 'users_stats';
    config: {
        chartType?: 'bar' | 'line';
        showLabels?: boolean;
        dateRange?: 'last_7_days' | 'last_30_days' | 'this_month' | 'last_month';
    };
    sort_order?: number;
}

interface SavedReport {
    id: number;
    name: string;
    description: string;
    created_at: string;
    sections?: ReportSection[];
}

type SystemReportType = 'bottle_levels' | 'daily_report' | 'low_stock' | 'builder' | 'schedule';

export default function ReportingClient() {
    // Main View State: ID of the custom report, or a system report string
    const [selectedReportId, setSelectedReportId] = useState<string | number>('daily_report');

    const [reports, setReports] = useState<SavedReport[]>([]);
    const [loading, setLoading] = useState(true);

    // --- System Report Options ---
    const systemReports = [
        { id: 'daily_report', name: 'Daily Report', icon: <Activity size={18} /> },
        { id: 'low_stock', name: 'Low Stock Alert', icon: <AlertTriangle size={18} /> },
        { id: 'bottle_levels', name: 'Bottle Levels', icon: <BarChart2 size={18} /> },
        { id: 'usage_trends', name: 'Usage Trends', icon: <BarChart2 size={18} /> },
        { id: 'employee_usage', name: 'Employee Usage', icon: <UserCheck size={18} /> },
    ];

    // --- Sub-View States ---
    // Builder
    const [builderId, setBuilderId] = useState<number | null>(null);
    const [builderName, setBuilderName] = useState('');
    const [builderDesc, setBuilderDesc] = useState('');
    const [builderSections, setBuilderSections] = useState<ReportSection[]>([]);
    const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

    // Schedule
    const [scheduleReport, setScheduleReport] = useState<SavedReport | null>(null);
    const [scheduleForm, setScheduleForm] = useState({ frequency: 'weekly', recipients: '', active: true });

    // Date Filters (Global)
    const [dateRange, setDateRange] = useState({
        start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    });
    const [selectedCategory, setSelectedCategory] = useState<string>(''); // For Usage Trends

    // Bottle Level State
    const [bottleData, setBottleData] = useState<any[]>([]);
    const [bottleOptions, setBottleOptions] = useState<string[]>([]); // New state for dynamic columns
    const [blFilters, setBlFilters] = useState({
        userId: '',
        categoryId: '',
        shiftId: ''
    });
    const [blLoading, setBlLoading] = useState(false);
    const [users, setUsers] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [shifts, setShifts] = useState<any[]>([]);
    const [locations, setLocations] = useState<any[]>([]); // Added locations
    const [showBottleLevels, setShowBottleLevels] = useState(true);

    // Low Stock State
    const [lowStockData, setLowStockData] = useState<any[]>([]);
    const [lsLoading, setLsLoading] = useState(false);

    // Daily Stats State
    // Daily Stats State
    const [dailyStats, setDailyStats] = useState<any>(null);
    const [dsLoading, setDsLoading] = useState(false);
    const [dailyReportConfig, setDailyReportConfig] = useState({
        showItems: true,
        showAudits: true,
        showStaff: true
    });

    // Usage Trends State
    const [usageData, setUsageData] = useState<any>({}); // Changed to object for complex data
    const [usageLoading, setUsageLoading] = useState(false);

    // Employee Usage State
    const [empUsageData, setEmpUsageData] = useState<{ summary: any[], logs: any[] }>({ summary: [], logs: [] });
    const [empUsageLoading, setEmpUsageLoading] = useState(false);
    const [empFilters, setEmpFilters] = useState({ shiftId: '', userIds: [] as number[] });


    // Initial Load
    useEffect(() => {
        fetchReports();
        fetchSettings();
        fetchCommonData();
    }, []);

    // Effect: Load Specific Report Data when selection changes

    useEffect(() => {
        if (selectedReportId === 'bottle_levels') fetchBottleData();
        if (selectedReportId === 'low_stock') fetchLowStock();
        if (selectedReportId === 'daily_report') fetchDailyReport();
        if (selectedReportId === 'usage_trends') fetchUsageData();
        if (selectedReportId === 'employee_usage') fetchEmployeeUsage();
    }, [selectedReportId, dateRange, blFilters, empFilters, selectedCategory]); // Dependencies for refetching

    const fetchSettings = () => {
        fetch('/api/admin/settings').then(r => r.json()).then(d => {
            if (d.settings) setShowBottleLevels(d.settings.track_bottle_levels !== 'false');
        });
    };

    // ... common data ...

    const fetchUsageData = async () => {
        setUsageLoading(true);
        try {
            const query = `start=${dateRange.start}&end=${dateRange.end}&locationId=${reportConfig.locationId || ''}&categoryId=${selectedCategory}`;
            const res = await fetch(`/api/admin/reports/usage?${query}`);
            const d = await res.json();
            setUsageData(d.data || { history: [], ranking: [], projections: [], insights: [] });
        } catch (e) { console.error(e); }
        finally { setUsageLoading(false); }
    };

    const fetchCommonData = () => {
        // Optimistically fetch these for filters
        fetch('/api/admin/users').then(r => r.json()).then(d => setUsers(d.users || []));
        fetch('/api/admin/categories').then(r => r.json()).then(d => setCategories(d.categories || []));
        fetch('/api/admin/settings/shifts').then(r => r.json()).then(d => setShifts(d.shifts || []));
        fetch('/api/admin/locations').then(r => r.json()).then(d => setLocations(d.locations || []));
    };

    const fetchReports = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/reporting/reports');
            const data = await res.json();
            setReports(data.reports || []);
        } catch (e) { console.error(e); } finally { setLoading(false); }
    };

    const fetchEmployeeUsage = async () => {
        setEmpUsageLoading(true);
        try {
            const res = await fetch('/api/admin/reports/employee-usage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dateRange,
                    shiftId: empFilters.shiftId || undefined,
                    userIds: empFilters.userIds.length > 0 ? empFilters.userIds : undefined,
                    locationId: reportConfig.locationId || undefined // Pass location
                })
            });
            const d = await res.json();
            setEmpUsageData(d);
        } catch (e) { console.error(e); }
        finally { setEmpUsageLoading(false); }
    };

    // --- Fetchers ---

    const fetchBottleData = async () => {
        setBlLoading(true);
        try {
            const res = await fetch('/api/admin/reporting/bottle-levels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dateRange,
                    userId: blFilters.userId || undefined,
                    categoryId: blFilters.categoryId || undefined,
                    shiftId: blFilters.shiftId || undefined,
                    locationId: reportConfig.locationId || undefined // Pass location
                })
            });
            const d = await res.json();
            setBottleData(d.data || []);
            setBottleOptions(d.options || []);
        } catch (e) {
            console.error(e);
            // alert('Error loading bottle data');
        } finally {
            setBlLoading(false);
        }
    };


    const fetchLowStock = async () => {
        setLsLoading(true);
        try {
            // Reusing inventory endpoint with low_stock flag or creating new one?
            // Assuming we have to create a dedicated one or use inventory list filtered.
            // Let's rely on a specific endpoint I will ensure exists: /api/inventory/low-stock
            const res = await fetch('/api/admin/reporting/low-stock');
            if (!res.ok) throw new Error('Failed to fetch');
            const d = await res.json();
            setLowStockData(d.items || []);
        } catch (e) {
            console.error(e);
            // setLowStockData([]); // Fail gracefully
        } finally { setLsLoading(false); }
    };

    const fetchDailyReport = async () => {
        setDsLoading(true);
        try {
            // Use the detailed endpoint
            // Use 'end' date from range as the target date for 'Daily' report
            const res = await fetch(`/api/admin/reporting/daily?date=${dateRange.end}`);
            if (res.ok) {
                const d = await res.json();
                setDailyStats(d);
            }
        } catch (e) { console.error(e); } finally { setDsLoading(false); }
    };

    const loadDailyReportPreview = () => {
        const mockData = {
            is_preview: true,
            date: new Date().toISOString().split('T')[0],
            summary: {
                total_usage_cost: 1240.50,
                total_restock_cost: 850.00,
                net_value_change: -390.50,
                total_usage_items: 45,
                total_restock_items: 24
            },
            alerts: {
                low_stock: [
                    { name: 'Grey Goose', quantity: 2, low_stock_threshold: 5, unit_cost: 32.0 },
                    { name: 'Lime Juice', quantity: 1, low_stock_threshold: 10, unit_cost: 5.0 },
                    { name: 'Napkins', quantity: 20, low_stock_threshold: 50, unit_cost: 0.05 }
                ],
                run_out: [
                    { name: 'Titos Vodka', quantity: 3, reason: 'Usage spike (5 used today)', unit_cost: 22.0 }
                ]
            },
            usage: {
                by_user: [
                    { name: 'Alice', items: 15, cost: 450.0 },
                    { name: 'Bob', items: 12, cost: 380.5 },
                    { name: 'Charlie', items: 18, cost: 410.0 }
                ],
                by_item: [
                    { name: 'Titos Vodka', quantity: 5, cost: 110.0 },
                    { name: 'Jack Daniels', quantity: 4, cost: 100.0 },
                    { name: 'Bud Light', quantity: 20, cost: 24.0 },
                    { name: 'Cabernet', quantity: 8, cost: 120.0 }
                ]
            },
            restock: {
                by_user: [{ name: 'Inventory Mgr', items: 24, cost: 850.0 }],
                by_item: [{ name: 'Grey Goose', quantity: 12, cost: 400.0 }, { name: 'Patron', quantity: 12, cost: 450.0 }]
            }
        };
        setDailyStats(mockData);
    };


    // --- Actions ---

    const handleCreateNew = () => {
        setBuilderId(null);
        setBuilderName('New Report');
        setBuilderDesc('');
        setBuilderSections([]);
        setSelectedReportId('builder');
    };

    const handleEditReport = async (report: SavedReport) => {
        setBuilderId(report.id);
        setBuilderName(report.name);
        setBuilderDesc(report.description);
        setBuilderSections(report.sections || []);
        setSelectedReportId('builder');
    };

    const handleDeleteReport = async (id: number) => {
        if (!confirm('Are you sure?')) return;
        await fetch(`/api/admin/reporting/reports/${id}`, { method: 'DELETE' });
        fetchReports();
        if (selectedReportId === id) setSelectedReportId('daily_report');
    };

    const handleSaveReport = async () => {
        if (!builderName) return alert('Name required');
        const payload = { name: builderName, description: builderDesc, sections: builderSections };
        const method = builderId ? 'PUT' : 'POST';
        const url = builderId ? `/api/admin/reporting/reports/${builderId}` : '/api/admin/reporting/reports';

        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            fetchReports();
            const d = await res.json();
            setSelectedReportId(builderId || d.id); // Go to the new report
        } else {
            alert('Save failed');
        }
    };

    // Placeholder for new variables/functions introduced by the DateFilterBar change
    const runReport = () => {
        // This function needs to be implemented based on actual report logic
        console.log("Running report with current date range:", dateRange);
        // Trigger fetch functions based on selectedReportId
        if (selectedReportId === 'daily_report') fetchDailyReport();
        if (selectedReportId === 'usage_trends') fetchUsageData();
        if (selectedReportId === 'employee_usage') fetchEmployeeUsage();
        if (selectedReportId === 'bottle_levels') fetchBottleData();
        if (selectedReportId === 'low_stock') fetchLowStock();
    };

    const handlePrint = () => {
        if (selectedReportId === 'daily_report' && dailyStats) {
            const printWindow = window.open('', '_blank');
            if (!printWindow) return alert('Please allow popups to print');

            const title = `Daily Report - ${dailyStats.date}`;
            const styles = `
                body { font-family: system-ui, -apple-system, sans-serif; color: #000; padding: 20px; }
                h1 { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
                h2 { margin-top: 30px; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background-color: #f3f4f6; font-weight: bold; }
                .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px; }
                .card { border: 1px solid #ccc; padding: 15px; border-radius: 4px; }
                .card-title { font-size: 0.875rem; color: #666; text-transform: uppercase; font-weight: bold; margin-bottom: 5px; }
                .card-value { font-size: 1.5rem; font-weight: bold; }
                .text-right { text-align: right; }
                .text-center { text-align: center; }
                @media print { .no-print { display: none; } }
            `;

            const html = `
                <html>
                <head>
                    <title>${title}</title>
                    <style>${styles}</style>
                </head>
                <body>
                    <h1>Daily Closing Report</h1>
                    <div style="margin-bottom: 20px;">
                        <strong>Date:</strong> ${dailyStats.date}<br>
                        <strong>Generated:</strong> ${new Date().toLocaleString()}
                    </div>

                    <div class="summary-grid">
                        <div class="card">
                            <div class="card-title">Total Cost</div>
                            <div class="card-value">$${Number(dailyStats.summary.total_usage_cost || 0).toFixed(2)}</div>
                        </div>
                        <div class="card">
                            <div class="card-title">Items Used</div>
                            <div class="card-value">${dailyStats.summary.total_usage_items || 0}</div>
                        </div>
                        <div class="card">
                            <div class="card-title">Restock Value</div>
                            <div class="card-value">$${Number(dailyStats.summary.total_restock_cost || 0).toFixed(2)}</div>
                        </div>
                    </div>

                    <h2>User Activity</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>User</th>
                                <th class="text-center">Items Used</th>
                                <th class="text-right">Value Used</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${dailyStats.usage.by_user.length ? dailyStats.usage.by_user.map((u: any) => `
                                <tr>
                                    <td>${u.name}</td>
                                    <td class="text-center">${u.items}</td>
                                    <td class="text-right">$${Number(u.cost).toFixed(2)}</td>
                                </tr>
                            `).join('') : '<tr><td colspan="3" class="text-center">No Activity</td></tr>'}
                        </tbody>
                    </table>

                    <h2>Item Usage (Top 20)</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th class="text-center">Qty</th>
                                <th class="text-right">Cost</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${dailyStats.usage.by_item.slice(0, 20).map((i: any) => `
                                <tr>
                                    <td>${i.name}</td>
                                    <td class="text-center">${i.quantity}</td>
                                    <td class="text-right">$${Number(i.cost).toFixed(2)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>

                    ${dailyStats.alerts.low_stock.length > 0 ? `
                        <h2>⚠️ Low Stock Alerts</h2>
                        <ul>
                            ${dailyStats.alerts.low_stock.map((a: any) => `
                                <li><strong>${a.name}</strong>: ${a.quantity} remaining (Threshold: ${a.low_stock_threshold})</li>
                            `).join('')}
                        </ul>
                    ` : ''}

                    <div class="no-print" style="margin-top: 40px; text-align: center;">
                        <button onclick="window.print()" style="padding: 10px 20px; background: #2563eb; color: white; border: none; border-radius: 4px; cursor: pointer;">Print Report</button>
                        <button onclick="window.close()" style="padding: 10px 20px; background: #ccc; border: none; border-radius: 4px; cursor: pointer; margin-left: 10px;">Close</button>
                    </div>
                </body>
                </html>
            `;
            printWindow.document.write(html);
            printWindow.document.close();
        } else {
            alert('Printing is currently only optimized for the Daily Report. Please select Daily Report and ensure data is loaded.');
        }
    };
    const [previewDismissed, setPreviewDismissed] = useState(false); // Placeholder
    const [showPreview, setShowPreview] = useState(false); // Placeholder

    // --- Sub-Components ---

    const DateFilterBar = () => {
        // For Daily Report: Show only ONE date picker (or shift selection)
        // For Usage/Others: Show Range
        const isSingleDate = selectedReportId === 'daily_report';

        return (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1f2937', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1rem', border: '1px solid #374151' }}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    {isSingleDate ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ color: '#9ca3af', fontSize: '0.875rem' }}>Date:</span>
                            <input
                                type="date"
                                value={dateRange.end} // Use 'end' as the single 'target date' for simplicity or specific state
                                onChange={e => {
                                    // Set both start and end to same day to represent "This Day" effectively in logic if needed,
                                    // or just update 'end' and let logic handle.
                                    // Ideally Daily Report API just takes 'date'.
                                    // Let's set both to be safe for now, acting as a single day range.
                                    setDateRange({ start: e.target.value, end: e.target.value });
                                }}
                                className={styles.input}
                                style={{ width: 'auto', padding: '0.5rem', background: '#111827', border: '1px solid #4b5563', color: 'white', borderRadius: '0.25rem' }}
                            />
                        </div>
                    ) : (
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ color: '#9ca3af', fontSize: '0.875rem' }}>From:</span>
                                <input
                                    type="date"
                                    value={dateRange.start}
                                    onChange={e => setDateRange(p => ({ ...p, start: e.target.value }))}
                                    className={styles.input}
                                    style={{ width: 'auto', padding: '0.5rem', background: '#111827', border: '1px solid #4b5563', color: 'white', borderRadius: '0.25rem' }}
                                />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ color: '#9ca3af', fontSize: '0.875rem' }}>To:</span>
                                <input
                                    type="date"
                                    value={dateRange.end}
                                    onChange={e => setDateRange(p => ({ ...p, end: e.target.value }))}
                                    className={styles.input}
                                    style={{ width: 'auto', padding: '0.5rem', background: '#111827', border: '1px solid #4b5563', color: 'white', borderRadius: '0.25rem' }}
                                />
                            </div>
                        </>
                    )}

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                            onClick={runReport}
                            style={{
                                background: '#2563eb', color: 'white', padding: '0.5rem 1.5rem', borderRadius: '0.25rem', border: 'none',
                                cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem'
                            }}
                        >
                            Run
                        </button>
                        <button
                            onClick={handlePrint}
                            style={{
                                background: '#374151', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.25rem', border: 'none',
                                cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem'
                            }}
                            title="Print Report"
                        >
                            <Printer size={18} />
                            Print
                        </button>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {!previewDismissed && !showPreview && (
                        <button
                            onClick={togglePreview}
                            style={{ color: '#9ca3af', background: 'none', border: '1px solid #4b5563', padding: '0.25rem 0.75rem', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.875rem' }}
                        >
                            Show Preview
                        </button>
                    )}
                    {showPreview && (
                        <button
                            onClick={togglePreview}
                            style={{ color: '#ef4444', background: 'none', border: '1px solid #ef4444', padding: '0.25rem 0.75rem', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.875rem' }}
                        >
                            Exit Preview
                        </button>
                    )}
                </div>
            </div>
        );
    };

    // Helper to render filters inline
    const renderUsageFilters = () => {
        if (selectedReportId !== 'usage_trends') return null;
        return (
            <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem' }}>
                {renderCategoryFilterDropdown()}
                {renderItemFilterDropdown()}
            </div>
        );
    };

    // --- Main Render ---

    // --- New Sub-Components ---

    // --- Report Config State ---
    const [configExpanded, setConfigExpanded] = useState(false);
    const [reportConfig, setReportConfig] = useState({
        enabled: false,
        frequency: 'weekly',
        runTime: '08:00',
        runDay: 'monday',
        runDate: '',
        recipients: '',
        cc: '',
        bcc: '',
        subject: 'Report',
        lookbackPeriod: '1_month', // Default for usage trends
        locationId: '' // Default 'All Locations'
    });

    const handleSaveConfig = () => {
        console.log("Saving Config for", selectedReportId, reportConfig);
        alert("Schedule settings saved!");
    };

    // --- Item Filter State ---
    const [selectedItems, setSelectedItems] = useState<number[]>([]);
    const [itemsList, setItemsList] = useState<any[]>([]);
    const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);

    useEffect(() => {
        if (itemsList.length === 0) fetch('/api/inventory').then(r => r.json()).then(d => setItemsList(d.items || []));
    }, []); // Fetch once

    const toggleItem = (id: number) => {
        if (selectedItems.includes(id)) setSelectedItems(selectedItems.filter(i => i !== id));
        else setSelectedItems([...selectedItems, id]);
    };

    // --- Filter Logic Helpers ---
    const filterBottleData = (data: any[]) => {
        if (selectedItems.length === 0) return data;
        return data.filter(d => selectedItems.includes(d.id));
    };
    const filterLowStockData = (data: any[]) => {
        if (selectedItems.length === 0) return data;
        return data.filter(d => selectedItems.includes(d.id));
    };

    // --- Wrappers ---
    const filteredBottleData = filterBottleData(bottleData);
    const filteredLowStockData = filterLowStockData(lowStockData);

    // Usage Data filtering
    const filteredUsageRanking = usageData.ranking ?
        (selectedItems.length === 0 ? usageData.ranking : usageData.ranking.filter((r: any) => selectedItems.includes(Number(r.id))))
        : [];
    const filteredUsageProjections = usageData.projections ?
        (selectedItems.length === 0 ? usageData.projections : usageData.projections.filter((p: any) => selectedItems.includes(Number(p.id))))
        : [];


    // --- Render Helpers (Not Components) ---
    const renderReportConfigPanel = () => {
        return (
            <div style={{ background: '#111827', borderRadius: '0.5rem', marginBottom: '1rem', border: '1px solid #374151', overflow: 'hidden' }}>
                <div
                    onClick={() => setConfigExpanded(!configExpanded)}
                    style={{ padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: configExpanded ? '#1f2937' : 'transparent' }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold' }}>
                        <Settings size={16} color="#9ca3af" />
                        <span>Report Configuration & Schedule</span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{configExpanded ? '▲ Collapse' : '▼ Expand'}</span>
                </div>

                {configExpanded && (
                    <div style={{ padding: '1rem', borderTop: '1px solid #374151' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', color: '#9ca3af', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Schedule Enabled</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <input
                                        type="checkbox"
                                        checked={reportConfig.enabled}
                                        onChange={e => setReportConfig({ ...reportConfig, enabled: e.target.checked })}
                                        style={{ accentColor: '#2563eb', transform: 'scale(1.2)' }}
                                    />
                                    <span style={{ color: reportConfig.enabled ? '#10b981' : '#6b7280' }}>{reportConfig.enabled ? 'Active' : 'Disabled'}</span>
                                </div>
                            </div>
                            <div>
                                <label style={{ display: 'block', color: '#9ca3af', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Frequency</label>
                                <select
                                    className={styles.input}
                                    value={reportConfig.frequency}
                                    onChange={e => setReportConfig({ ...reportConfig, frequency: e.target.value })}
                                >
                                    <option value="daily">Daily</option>
                                    <option value="weekly">Weekly</option>
                                    <option value="biweekly">Bi-Weekly</option>
                                    <option value="monthly">Monthly</option>
                                    <option value="one_time">One Time (Future)</option>
                                </select>
                            </div>
                        </div>

                        {/* Frequency Details */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                            {(reportConfig.frequency === 'weekly' || reportConfig.frequency === 'biweekly') && (
                                <div>
                                    <label style={{ display: 'block', color: '#9ca3af', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Day of Week</label>
                                    <select className={styles.input} value={reportConfig.runDay} onChange={e => setReportConfig({ ...reportConfig, runDay: e.target.value })}>
                                        {['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map(d => (
                                            <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            {reportConfig.frequency === 'one_time' && (
                                <div>
                                    <label style={{ display: 'block', color: '#9ca3af', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Run Date</label>
                                    <input type="date" className={styles.input} value={reportConfig.runDate} onChange={e => setReportConfig({ ...reportConfig, runDate: e.target.value })} />
                                </div>
                            )}
                            <div>
                                <label style={{ display: 'block', color: '#9ca3af', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Run Time</label>
                                <input type="time" className={styles.input} value={reportConfig.runTime} onChange={e => setReportConfig({ ...reportConfig, runTime: e.target.value })} />
                            </div>
                        </div>

                        <hr style={{ borderColor: '#374151', margin: '1rem 0' }} />

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div style={{ gridColumn: 'span 2' }}>
                                <label style={{ display: 'block', color: '#9ca3af', fontSize: '0.75rem', marginBottom: '0.25rem' }}>To (Emails)</label>
                                <input className={styles.input} placeholder="x@gm.com, y@gm.com" value={reportConfig.recipients} onChange={e => setReportConfig({ ...reportConfig, recipients: e.target.value })} />
                            </div>
                            <div>
                                <label style={{ display: 'block', color: '#9ca3af', fontSize: '0.75rem', marginBottom: '0.25rem' }}>CC</label>
                                <input className={styles.input} placeholder="Optional" value={reportConfig.cc} onChange={e => setReportConfig({ ...reportConfig, cc: e.target.value })} />
                            </div>
                            <div>
                                <label style={{ display: 'block', color: '#9ca3af', fontSize: '0.75rem', marginBottom: '0.25rem' }}>BCC</label>
                                <input className={styles.input} placeholder="Optional" value={reportConfig.bcc} onChange={e => setReportConfig({ ...reportConfig, bcc: e.target.value })} />
                            </div>
                            <div style={{ gridColumn: 'span 2' }}>
                                <label style={{ display: 'block', color: '#9ca3af', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Subject Line</label>
                                <input className={styles.input} value={reportConfig.subject} onChange={e => setReportConfig({ ...reportConfig, subject: e.target.value })} />
                            </div>
                        </div>

                        {/* USAGE TRENDS SPECIFIC: Lookback Period */}
                        {selectedReportId === 'usage_trends' && (
                            <div style={{ marginTop: '1rem', borderTop: '1px solid #374151', paddingTop: '1rem' }}>
                                <label style={{ display: 'block', color: '#9ca3af', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Lookback Period (Usage Trends Only)</label>
                                <select
                                    className={styles.input}
                                    value={reportConfig.lookbackPeriod || '1_month'}
                                    onChange={e => setReportConfig({ ...reportConfig, lookbackPeriod: e.target.value })}
                                >
                                    <option value="1_week">1 Week Back</option>
                                    <option value="2_weeks">2 Weeks Back</option>
                                    <option value="3_weeks">3 Weeks Back</option>
                                    <option value="1_month">1 Month Back</option>
                                    <option value="2_months">2 Months Back</option>
                                    <option value="3_months">3 Months Back</option>
                                    <option value="6_months">6 Months Back</option>
                                    <option value="1_year">1 Year Back</option>
                                </select>
                            </div>
                        )}

                        {/* Location Selector (Available for all reports if org has locations) */}
                        <div style={{ marginTop: '1rem', borderTop: '1px solid #374151', paddingTop: '1rem' }}>
                            <label style={{ display: 'block', color: '#9ca3af', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Location Filter</label>
                            <select
                                className={styles.input}
                                value={reportConfig.locationId || ''}
                                onChange={e => setReportConfig({ ...reportConfig, locationId: e.target.value })}
                            >
                                <option value="">All Locations</option>
                                {locations.map(loc => (
                                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                            <button onClick={handleSaveConfig} style={{ background: '#059669', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.25rem', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
                                Save Configuration
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderItemFilterDropdown = () => {
        return (
            <div style={{ position: 'relative' }}>
                <button
                    onClick={() => setFilterDropdownOpen(!filterDropdownOpen)}
                    className={styles.input}
                    style={{ textAlign: 'left', minWidth: '200px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                    <span>{selectedItems.length === 0 ? 'All Items' : `${selectedItems.length} Selected`}</span>
                    <span style={{ fontSize: '0.8rem' }}>▼</span>
                </button>
                {filterDropdownOpen && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', maxHeight: '300px', overflowY: 'auto', background: '#1f2937', border: '1px solid #4b5563', borderRadius: '0.25rem', zIndex: 50, padding: '0.5rem' }}>
                        <div
                            onClick={() => setSelectedItems([])}
                            style={{ padding: '0.25rem', cursor: 'pointer', color: selectedItems.length === 0 ? '#60a5fa' : '#9ca3af', borderBottom: '1px solid #374151', marginBottom: '0.5rem' }}
                        >
                            Show All
                        </div>
                        {itemsList.map(item => (
                            <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={selectedItems.includes(item.id)}
                                    onChange={() => toggleItem(item.id)}
                                />
                                <span style={{ color: '#d1d5db', fontSize: '0.875rem' }}>{item.name}</span>
                            </label>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const renderCategoryFilterDropdown = () => (
        <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className={styles.input}
            style={{ width: 'auto' }}
        >
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
    );

    const togglePreview = () => {
        if (!showPreview) {
            // Turning ON preview
            if (selectedReportId === 'daily_report') {
                loadDailyReportPreview();
            }
        } else {
            // Turning OFF - refresh real data
            if (selectedReportId === 'daily_report') {
                fetchDailyReport();
            }
        }
        setShowPreview(!showPreview);
    };



    if (selectedReportId === 'builder') {
        return (
            <div className={styles.container}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <button onClick={() => setSelectedReportId('daily_report')} style={{ color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}>&larr; Cancel</button>
                    <button onClick={handleSaveReport} className="bg-green-600 text-white px-4 py-2 rounded">Save</button>
                </div>
                <div className={styles.card}>
                    <h2 className={styles.cardTitle}>{builderId ? 'Edit Report' : 'New Report'}</h2>
                    <input className={styles.input} value={builderName} onChange={e => setBuilderName(e.target.value)} placeholder="Report Name" />
                    <textarea className={styles.input} value={builderDesc} onChange={e => setBuilderDesc(e.target.value)} placeholder="Description" rows={2} style={{ marginTop: '1rem' }} />
                </div>
                <div className={styles.card} style={{ marginTop: '1rem' }}>
                    <p style={{ color: '#9ca3af' }}>Section editing is simplified here. (Imagine drag/drop blocks)</p>
                    <button
                        onClick={() => setBuilderSections([...builderSections, { type: 'chart', title: 'New Chart', data_source: 'inventory', config: { chartType: 'bar' } }])}
                        style={{ marginTop: '1rem', background: '#374151', color: 'white', padding: '0.5rem', borderRadius: '4px' }}
                    >
                        + Add Section
                    </button>
                    {builderSections.map((s, i) => (
                        <div key={i} style={{ padding: '0.5rem', border: '1px solid #4b5563', marginTop: '0.5rem' }}>
                            {s.title} ({s.type})
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // Determine current report object if custom
    const currentCustomReport = typeof selectedReportId === 'number' ? reports.find(r => r.id === selectedReportId) : null;

    return (
        <div className={styles.container}>
            {/* Header / Selector */}
            <div style={{ marginBottom: '2rem' }}>
                <h1 className={styles.pageTitle} style={{ marginBottom: '1rem' }}>Reporting</h1>

                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <select
                        className={styles.input}
                        style={{ maxWidth: '300px' }}
                        value={selectedReportId}
                        onChange={e => {
                            const val = e.target.value;
                            setSelectedReportId(isNaN(Number(val)) ? val : Number(val));
                        }}
                    >
                        <optgroup label="System Reports">
                            {systemReports.map(r => (
                                (!showBottleLevels && r.id === 'bottle_levels') ? null :
                                    <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                        </optgroup>
                        {reports.length > 0 && (
                            <optgroup label="Custom Reports">
                                {reports.map(r => (
                                    <option key={r.id} value={r.id}>{r.name}</option>
                                ))}
                            </optgroup>
                        )}
                    </select>

                    <button
                        onClick={handleCreateNew}
                        style={{ background: '#3b82f6', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.5rem', border: 'none', display: 'flex', gap: '0.5rem', alignItems: 'center', cursor: 'pointer' }}
                    >
                        <Plus size={16} /> New Custom Report
                    </button>

                </div>
            </div>

            {/* Config Panel & Filters */}
            {selectedReportId && typeof selectedReportId !== 'number' && selectedReportId !== 'builder' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {renderReportConfigPanel()}
                    {renderUsageFilters()}
                    <DateFilterBar />
                    {/* Item Filter Dropdown (Only for relevant reports) */}
                    {(selectedReportId === 'usage_trends' || selectedReportId === 'bottle_levels') && (
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
                            <span style={{ color: '#9ca3af', fontWeight: 'bold' }}>Filter Items:</span>
                            {renderItemFilterDropdown()}
                        </div>
                    )}

                    {/* Employee Usage Filters */}
                    {selectedReportId === 'employee_usage' && (
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
                            {/* Shift Selector */}
                            <div>
                                <label style={{ color: '#9ca3af', fontSize: '0.8rem', marginRight: '0.5rem' }}>Filter by Shift:</label>
                                <select
                                    className={styles.input}
                                    value={empFilters.shiftId}
                                    onChange={e => {
                                        const sid = e.target.value;
                                        setEmpFilters(p => ({ ...p, shiftId: sid }));
                                        // Auto-Select Users assigned to this shift? (Optional UX, maybe just let backend handle if userIds empty)
                                        // Creating a better UX: If shift selected, show "Shift Defaults" or let user override.
                                    }}
                                >
                                    <option value="">All Shifts / No Shift</option>
                                    {shifts.map(s => <option key={s.id} value={s.id}>{s.label} ({s.start_time}-{s.end_time})</option>)}
                                </select>
                            </div>

                            {/* User Multi Select (Simple for now) */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Filter Users:</span>
                                <div style={{ display: 'flex', gap: '0.5rem', background: '#111827', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #374151' }}>
                                    {users.map(u => (
                                        <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={empFilters.userIds.includes(u.id)}
                                                onChange={e => {
                                                    if (e.target.checked) setEmpFilters(p => ({ ...p, userIds: [...p.userIds, u.id] }));
                                                    else setEmpFilters(p => ({ ...p, userIds: p.userIds.filter(id => id !== u.id) }));
                                                }}
                                            />
                                            <span style={{ color: 'white', fontSize: '0.8rem' }}>{u.first_name}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}



            {/* Content Area */}
            <div className={styles.content}>

                {/* --- DAILY REPORT --- */}
                {selectedReportId === 'daily_report' && (
                    <div className={styles.grid}>
                        {dsLoading ? <div style={{ gridColumn: 'span 2', textAlign: 'center' }}>Loading Report...</div> : (
                            dailyStats ? (
                                <>
                                    {/* Top Summary Cards */}
                                    <div className={styles.card} style={{ gridColumn: 'span 2' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                            <h3 className={styles.cardTitle}>{dailyStats.is_preview ? 'Daily Summary (PREVIEW DATA)' : 'Daily Summary'}</h3>
                                            <span style={{ fontSize: '0.875rem', color: '#9ca3af' }}>{dailyStats.date}</span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                                            <div style={{ background: '#111827', padding: '1.5rem', borderRadius: '0.5rem', textAlign: 'center', border: '1px solid #374151' }}>
                                                <div style={{ color: '#ef4444', fontSize: '1.5rem', fontWeight: 'bold' }}>-${dailyStats.summary?.total_usage_cost?.toFixed(2)}</div>
                                                <div style={{ color: '#9ca3af', fontSize: '0.875rem' }}>Total Usage Value</div>
                                            </div>
                                            <div style={{ background: '#111827', padding: '1.5rem', borderRadius: '0.5rem', textAlign: 'center', border: '1px solid #374151' }}>
                                                <div style={{ color: '#10b981', fontSize: '1.5rem', fontWeight: 'bold' }}>+${dailyStats.summary?.total_restock_cost?.toFixed(2)}</div>
                                                <div style={{ color: '#9ca3af', fontSize: '0.875rem' }}>Total Restock Value</div>
                                            </div>
                                            <div style={{ background: '#111827', padding: '1.5rem', borderRadius: '0.5rem', textAlign: 'center', border: '1px solid #374151' }}>
                                                <div style={{ color: (dailyStats.summary?.net_value_change >= 0 ? '#10b981' : '#ef4444'), fontSize: '1.5rem', fontWeight: 'bold' }}>
                                                    {dailyStats.summary?.net_value_change >= 0 ? '+' : ''}${dailyStats.summary?.net_value_change?.toFixed(2)}
                                                </div>
                                                <div style={{ color: '#9ca3af', fontSize: '0.875rem' }}>Net Inventory Change</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Alerts Section */}
                                    {(dailyStats.alerts?.low_stock?.length > 0 || dailyStats.alerts?.run_out?.length > 0) && (
                                        <div className={styles.card} style={{ gridColumn: 'span 2', borderColor: '#f59e0b' }}>
                                            <h3 className={styles.cardTitle} style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <AlertTriangle size={20} /> Critical Alerts
                                            </h3>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
                                                {/* Low Stock Table */}
                                                {dailyStats.alerts.low_stock.length > 0 && (
                                                    <div>
                                                        <h4 style={{ color: '#ef4444', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Low Stock Items</h4>
                                                        <table className={styles.table} style={{ width: '100%' }}>
                                                            <thead>
                                                                <tr>
                                                                    <th>Item</th>
                                                                    <th>Quantity</th>
                                                                    <th>Unit Cost</th>
                                                                    <th>Threshold</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {dailyStats.alerts.low_stock.map((item: any, i: number) => (
                                                                    <tr key={i}>
                                                                        <td>{item.name}</td>
                                                                        <td style={{ color: '#ef4444', fontWeight: 'bold' }}>{item.quantity}</td>
                                                                        <td>${item.unit_cost || '-'}</td>
                                                                        <td>{item.low_stock_threshold}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}

                                                {/* Run Out Predictions Table */}
                                                {dailyStats.alerts.run_out.length > 0 && (
                                                    <div style={{ marginTop: '1rem' }}>
                                                        <h4 style={{ color: '#f59e0b', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Run-out Risks</h4>
                                                        <table className={styles.table} style={{ width: '100%' }}>
                                                            <thead>
                                                                <tr>
                                                                    <th>Item</th>
                                                                    <th>Reason</th>
                                                                    <th>Current Scale</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {dailyStats.alerts.run_out.map((item: any, i: number) => (
                                                                    <tr key={i}>
                                                                        <td>{item.name}</td>
                                                                        <td>{item.reason}</td>
                                                                        <td>{item.quantity}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* --- CHARTS SECTION --- */}
                                    <div style={{ gridColumn: 'span 2', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div className={styles.card}>
                                            <h3 className={styles.cardTitle}>Usage by User</h3>
                                            <div style={{ height: '250px', width: '100%' }}>
                                                {dailyStats.usage?.by_user?.length > 0 ? (
                                                    <ResponsiveContainer>
                                                        <BarChart data={dailyStats.usage.by_user} layout="vertical" margin={{ left: 10, right: 10 }}>
                                                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                                            <XAxis type="number" stroke="#9ca3af" hide />
                                                            <YAxis dataKey="name" type="category" width={70} stroke="#9ca3af" fontSize={11} tick={{ fill: '#9ca3af' }} />
                                                            <Tooltip
                                                                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                                                contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff' }}
                                                            />
                                                            <Bar dataKey="cost" name="Value ($)" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={20} />
                                                        </BarChart>
                                                    </ResponsiveContainer>
                                                ) : <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>No data</div>}
                                            </div>
                                        </div>

                                        <div className={styles.card}>
                                            <h3 className={styles.cardTitle}>Top Items (Qty)</h3>
                                            <div style={{ height: '250px', width: '100%' }}>
                                                {dailyStats.usage?.by_item?.length > 0 ? (
                                                    <ResponsiveContainer>
                                                        <BarChart data={dailyStats.usage.by_item.slice(0, 5)} layout="vertical" margin={{ left: 10, right: 10 }}>
                                                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                                            <XAxis type="number" stroke="#9ca3af" hide />
                                                            <YAxis dataKey="name" type="category" width={70} stroke="#9ca3af" fontSize={11} tick={{ fill: '#9ca3af' }} />
                                                            <Tooltip
                                                                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                                                contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff' }}
                                                            />
                                                            <Bar dataKey="quantity" name="Qty" fill="#10b981" radius={[0, 4, 4, 0]} barSize={20} />
                                                        </BarChart>
                                                    </ResponsiveContainer>
                                                ) : <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>No data</div>}
                                            </div>
                                        </div>
                                    </div>


                                    {/* User Usage Table */}
                                    <div className={styles.card} style={{ gridColumn: 'span 2' }}>
                                        <h3 className={styles.cardTitle}>User Activity Summary</h3>
                                        {dailyStats.usage?.by_user?.length > 0 ? (
                                            <table className={styles.table} style={{ width: '100%' }}>
                                                <thead>
                                                    <tr>
                                                        <th>User</th>
                                                        <th>Items Used</th>
                                                        <th>Total Cost</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {dailyStats.usage.by_user.map((user: any, idx: number) => (
                                                        <tr key={idx}>
                                                            <td>{user.name}</td>
                                                            <td>{user.items}</td>
                                                            <td>${user.cost.toFixed(2)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        ) : <p style={{ color: '#9ca3af', padding: '1rem' }}>No user activity recorded.</p>}
                                    </div>

                                    {/* Item Usage Table */}
                                    <div className={styles.card} style={{ gridColumn: 'span 2' }}>
                                        <h3 className={styles.cardTitle}>Item Usage Summary</h3>
                                        {dailyStats.usage?.by_item?.length > 0 ? (
                                            <table className={styles.table} style={{ width: '100%' }}>
                                                <thead>
                                                    <tr>
                                                        <th>Item</th>
                                                        <th>Quantity Used</th>
                                                        <th>Total Cost</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {dailyStats.usage.by_item.map((item: any, idx: number) => (
                                                        <tr key={idx}>
                                                            <td>{item.name}</td>
                                                            <td>{item.quantity}</td>
                                                            <td>${item.cost.toFixed(2)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        ) : <p style={{ color: '#9ca3af', padding: '1rem' }}>No item usage recorded.</p>}
                                    </div>

                                    {/* Restock Activity Table */}
                                    <div className={styles.card} style={{ gridColumn: 'span 2' }}>
                                        <h3 className={styles.cardTitle}>Restock Activity Overview</h3>
                                        {dailyStats.restock?.by_item?.length > 0 ? (
                                            <table className={styles.table} style={{ width: '100%' }}>
                                                <thead>
                                                    <tr>
                                                        <th>Item</th>
                                                        <th>Qty Added</th>
                                                        <th>Total Cost</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {dailyStats.restock.by_item.map((item: any, idx: number) => (
                                                        <tr key={idx}>
                                                            <td>{item.name}</td>
                                                            <td style={{ color: '#10b981' }}>+{item.quantity}</td>
                                                            <td>${item.cost.toFixed(2)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        ) : <p style={{ color: '#9ca3af', padding: '1rem' }}>No restock activity today.</p>}
                                    </div>
                                </>
                            ) : (
                                <div style={{ gridColumn: 'span 2', textAlign: 'center', color: '#9ca3af' }}>
                                    No report data loaded.
                                </div>
                            )
                        )}
                    </div>
                )}

                {/* --- LOW STOCK ALERT --- */}
                {selectedReportId === 'low_stock' && (
                    <div className={styles.card}>
                        <h3 className={styles.cardTitle}>Low Stock Items</h3>
                        {lsLoading ? <p>Loading...</p> : (
                            <table className={styles.table} style={{ width: '100%' }}>
                                <thead>
                                    <tr>
                                        <th>Item</th>
                                        <th>Category</th>
                                        <th>Current Stock</th>
                                        <th>Min Level</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredLowStockData.length > 0 ? filteredLowStockData.map((item: any) => (
                                        <tr key={item.id}>
                                            <td>{item.name}</td>
                                            <td>{item.category}</td>
                                            <td style={{ color: item.current < item.min ? '#ef4444' : 'white', fontWeight: 'bold' }}>{item.current} {item.unit}</td>
                                            <td>{item.min} {item.unit}</td>
                                            <td>
                                                <span style={{ background: '#ef4444', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>LOW</span>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>All items are well stocked.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}

                {/* --- BOTTLE LEVELS --- */}
                {selectedReportId === 'bottle_levels' && (
                    <div className={styles.card}>
                        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                            <select className={styles.input} style={{ width: 'auto' }} value={blFilters.shiftId} onChange={e => setBlFilters({ ...blFilters, shiftId: e.target.value })}>
                                <option value="">All Shifts</option>
                                {shifts.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                            </select>
                            <select className={styles.input} style={{ width: 'auto' }} value={blFilters.categoryId} onChange={e => setBlFilters({ ...blFilters, categoryId: e.target.value })}>
                                <option value="">All Categories</option>
                                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <select className={styles.input} style={{ width: 'auto' }} value={blFilters.userId} onChange={e => setBlFilters({ ...blFilters, userId: e.target.value })}>
                                <option value="">All Staff</option>
                                {users.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
                            </select>
                        </div>

                        {blLoading ? <div style={{ color: '#9ca3af' }}>Loading Data...</div> : (
                            <div style={{ width: '100%', overflowX: 'auto', maxHeight: '400px', overflowY: 'auto' }}>
                                {filteredBottleData.length > 0 ? (
                                    <table className={styles.table} style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse' }}>
                                        <thead style={{ position: 'sticky', top: 0, background: '#1f2937', zIndex: 10 }}>
                                            <tr>
                                                <th style={{ textAlign: 'left', minWidth: '150px', padding: '12px' }}>Item Name</th>
                                                {bottleOptions.map((opt: string) => (
                                                    <th key={opt} style={{ textAlign: 'center', padding: '12px' }}>{opt}</th>
                                                ))}
                                                <th style={{ textAlign: 'center', fontWeight: 'bold', padding: '12px' }}>Total Alerts</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredBottleData.map((row: any) => (
                                                <tr key={row.id} style={{ borderBottom: '1px solid #374151' }}>
                                                    <td style={{ fontWeight: '500', padding: '12px' }}>{row.name}</td>
                                                    {bottleOptions.map((opt: string) => (
                                                        <td key={opt} style={{ textAlign: 'center', padding: '12px', color: row[opt] ? '#fbbf24' : '#4b5563', fontWeight: row[opt] ? 'bold' : 'normal' }}>
                                                            {row[opt] || '-'}
                                                        </td>
                                                    ))}
                                                    <td style={{ textAlign: 'center', padding: '12px', fontWeight: 'bold', color: '#10b981' }}>{row.total}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <div style={{ textAlign: 'center', paddingTop: '4rem', color: '#6b7280' }}>
                                        No filtered data available.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* --- USAGE TRENDS & PREDICTIONS --- */}
                {selectedReportId === 'usage_trends' && (
                    <div className={styles.grid}>
                        <div className={styles.card} style={{ gridColumn: 'span 2' }}>
                            <h3 className={styles.cardTitle}>Predictive Insights</h3>
                            <div style={{ background: 'rgba(31, 41, 55, 0.5)', padding: '1rem', borderRadius: '0.5rem', borderLeft: '4px solid #8b5cf6' }}>
                                {usageData.insights && usageData.insights.length > 0 ? (
                                    <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                                        {usageData.insights.map((insight: string, idx: number) => (
                                            <li key={idx} style={{ marginBottom: '0.5rem', color: '#e5e7eb' }}>{insight}</li>
                                        ))}
                                    </ul>
                                ) : <p style={{ color: '#9ca3af' }}>No insights available yet.</p>}
                            </div>
                        </div>

                        <div className={styles.card} style={{ gridColumn: 'span 2' }}>
                            <h3 className={styles.cardTitle}>Future Stock Projection (Top Items)</h3>
                            {usageLoading ? <p>Loading...</p> : (
                                <div style={{ height: '400px', width: '100%' }}>
                                    <ResponsiveContainer>
                                        <LineChart>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                            <XAxis dataKey="date" stroke="#9ca3af" type="category" allowDuplicatedCategory={false} />
                                            <YAxis stroke="#9ca3af" label={{ value: 'Stock Level', angle: -90, position: 'insideLeft' }} />
                                            <Tooltip contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff' }} />
                                            <Legend />
                                            {filteredUsageProjections.map((prod: any, idx: number) => (
                                                <Line
                                                    key={idx}
                                                    data={prod.data}
                                                    type="monotone"
                                                    dataKey="stock"
                                                    name={prod.item}
                                                    stroke={['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][idx % 5]}
                                                    strokeWidth={2}
                                                    dot={false}
                                                />
                                            ))}
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>

                        <div className={styles.card}>
                            <h3 className={styles.cardTitle}>Usage Ranking</h3>
                            {usageLoading ? <p>Loading...</p> : (
                                <div style={{ height: '300px', width: '100%' }}>
                                    <ResponsiveContainer>
                                        <BarChart data={filteredUsageRanking} layout="vertical" margin={{ left: 20 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                            <XAxis type="number" stroke="#9ca3af" />
                                            <YAxis dataKey="name" type="category" width={100} stroke="#9ca3af" />
                                            <Tooltip contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff' }} />
                                            <Legend />
                                            <Bar dataKey="total_used" name="Units Used" fill="#8b5cf6" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>

                        <div className={styles.card}>
                            <h3 className={styles.cardTitle}>Usage by Category</h3>
                            {usageLoading ? <p>Loading...</p> : (
                                <div style={{ height: '300px', width: '100%' }}>
                                    {(usageData.categoryUsage && usageData.categoryUsage.length > 0) ? (
                                        <ResponsiveContainer>
                                            <BarChart data={usageData.categoryUsage}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                                <XAxis dataKey="name" stroke="#9ca3af" />
                                                <YAxis stroke="#9ca3af" />
                                                <Tooltip contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff' }} />
                                                <Legend />
                                                <Bar dataKey="total_used" name="Total Used" fill="#10b981" />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    ) : <p style={{ color: '#9ca3af', textAlign: 'center', paddingTop: '4rem' }}>No usage data by category.</p>}
                                </div>
                            )}
                        </div>
                    </div>
                )}



                {/* --- EMPLOYEE USAGE REPORT --- */}
                {selectedReportId === 'employee_usage' && (
                    <div className={styles.grid}>
                        {empUsageLoading ? <div style={{ gridColumn: 'span 2', textAlign: 'center' }}>Loading...</div> : (
                            <>
                                <div className={styles.card} style={{ gridColumn: 'span 2' }}>
                                    <h3 className={styles.cardTitle}>Usage Summary</h3>
                                    <table className={styles.table} style={{ width: '100%' }}>
                                        <thead>
                                            <tr>
                                                <th>Staff Member</th>
                                                <th>Total Actions</th>
                                                <th>Items Used (Qty)</th>
                                                <th>Total Value</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {empUsageData.summary && empUsageData.summary.length > 0 ? empUsageData.summary.map((s: any, idx: number) => (
                                                <tr key={idx}>
                                                    <td>{s.name}</td>
                                                    <td>{s.actions}</td>
                                                    <td>{s.items_used}</td>
                                                    <td>${s.value.toFixed(2)}</td>
                                                </tr>
                                            )) : <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9ca3af', padding: '1rem' }}>No activity found.</td></tr>}
                                        </tbody>
                                    </table>
                                </div>

                                <div className={styles.card} style={{ gridColumn: 'span 2' }}>
                                    <h3 className={styles.cardTitle}>Detailed Activity</h3>
                                    <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                        <table className={styles.table} style={{ width: '100%' }}>
                                            <thead>
                                                <tr>
                                                    <th>Time</th>
                                                    <th>User</th>
                                                    <th>Item</th>
                                                    <th>Qty</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {empUsageData.logs && empUsageData.logs.map((l: any, idx: number) => (
                                                    <tr key={idx}>
                                                        <td>{new Date(l.time).toLocaleTimeString()} <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>{new Date(l.time).toLocaleDateString()}</span></td>
                                                        <td>{l.user}</td>
                                                        <td>{l.item}</td>
                                                        <td>{l.qty}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* --- CUSTOM REPORT --- */}
                {currentCustomReport && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <p style={{ color: '#9ca3af' }}>{currentCustomReport.description}</p>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button onClick={() => handleEditReport(currentCustomReport)} style={{ background: '#4b5563', color: 'white', padding: '0.5rem', borderRadius: '0.5rem', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Edit size={16} /> Edit
                                </button>
                                <button onClick={() => handleDeleteReport(currentCustomReport.id)} style={{ background: '#ef4444', color: 'white', padding: '0.5rem', borderRadius: '0.5rem', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Trash2 size={16} /> Delete
                                </button>
                            </div>
                        </div>

                        {currentCustomReport.sections?.map((sec, idx) => (
                            <div key={idx} className={styles.card}>
                                <h3 className={styles.cardTitle}>{sec.title}</h3>
                                {/* Re-use the SectionChart component logic if we broke it out, or embed simplifed version here */}
                                <div style={{ padding: '2rem', textAlign: 'center', background: '#111827', borderRadius: '0.5rem', color: '#6b7280' }}>
                                    [Chart Preview for {sec.title} - Type: {sec.type}]
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {/* Mock Preview Overlay - Only for other reports if needed, or remove completely if Daily Report handles it internally */}
                {/* <MockPreviewOverlay /> */}

            </div>
        </div>
    );
}
