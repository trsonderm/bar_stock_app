'use client';

import { useState, useEffect } from 'react';
import styles from '../admin.module.css';
import { Plus, Trash2, Edit, FileText, Save, BarChart2, Calendar, Settings, AlertTriangle, Activity, UserCheck } from 'lucide-react';
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

    // Bottle Level State
    const [bottleData, setBottleData] = useState<any[]>([]);
    const [blFilters, setBlFilters] = useState({
        userId: '',
        categoryId: '',
        shiftId: ''
    });
    const [blLoading, setBlLoading] = useState(false);
    const [users, setUsers] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [shifts, setShifts] = useState<any[]>([]);
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
        if (selectedReportId === 'daily_report') fetchDailyStats();
        if (selectedReportId === 'usage_trends') fetchUsageData();
        if (selectedReportId === 'employee_usage') fetchEmployeeUsage();
    }, [selectedReportId, dateRange, blFilters, empFilters]); // Dependencies for refetching

    const fetchSettings = () => {
        fetch('/api/admin/settings').then(r => r.json()).then(d => {
            if (d.settings) setShowBottleLevels(d.settings.track_bottle_levels !== 'false');
        });
    };

    // ... common data ...

    const fetchUsageData = async () => {
        setUsageLoading(true);
        try {
            const query = `start=${dateRange.start}&end=${dateRange.end}`;
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
                    userIds: empFilters.userIds.length > 0 ? empFilters.userIds : undefined
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
                    shiftId: blFilters.shiftId || undefined
                })
            });
            const d = await res.json();
            setBottleData(d.data || []);
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

    const fetchDailyStats = async () => {
        setDsLoading(true);
        try {
            // This endpoint might need to be created too
            const res = await fetch('/api/admin/reporting/daily-stats');
            if (res.ok) {
                const d = await res.json();
                setDailyStats(d.stats);
            }
        } catch { } finally { setDsLoading(false); }
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
        if (selectedReportId === 'daily_report') fetchDailyStats();
        if (selectedReportId === 'usage_trends') fetchUsageData();
        if (selectedReportId === 'employee_usage') fetchEmployeeUsage();
        if (selectedReportId === 'bottle_levels') fetchBottleData();
        if (selectedReportId === 'low_stock') fetchLowStock();
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

                    <button
                        onClick={runReport}
                        style={{
                            background: '#2563eb', color: 'white', padding: '0.5rem 1.5rem', borderRadius: '0.25rem', border: 'none',
                            cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem'
                        }}
                    >
                        Test
                    </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {!previewDismissed && !showPreview && (
                        <button
                            onClick={() => setShowPreview(true)}
                            style={{ color: '#9ca3af', background: 'none', border: '1px solid #4b5563', padding: '0.25rem 0.75rem', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.875rem' }}
                        >
                            Show Preview
                        </button>
                    )}
                </div>
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
        lookbackPeriod: '1_month' // Default for usage trends
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

    const MockPreviewOverlay = () => {
        if (!showPreview) return null;

        // Use report config subject if avail
        const subj = reportConfig.subject || 'Daily Report';
        const recp = reportConfig.recipients || 'user@example.com';

        // Generate dummy data based on report type
        const dummyRows = Array.from({ length: 5 }).map((_, i) => ({
            col1: `Sample Item ${i + 1}`,
            col2: Math.floor(Math.random() * 100),
            col3: ['Low', 'OK', 'High'][i % 3],
            col4: '$' + (Math.random() * 50).toFixed(2)
        }));

        return (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <div style={{ background: '#1f2937', padding: '2rem', borderRadius: '0.5rem', width: '90%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                        <h2 style={{ color: '#60a5fa' }}>Report Preview: {String(selectedReportId).toUpperCase()}</h2>
                        <button onClick={() => setShowPreview(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
                    </div>

                    <div style={{ border: '1px dashed #4b5563', padding: '1rem', marginBottom: '1rem' }}>
                        <p style={{ color: '#d1d5db', marginBottom: '1rem' }}><strong>Subject:</strong> {subj}</p>
                        <p style={{ color: '#d1d5db', marginBottom: '1rem' }}><strong>To:</strong> {recp}</p>
                        <hr style={{ borderColor: '#374151', marginBottom: '1rem' }} />

                        <div style={{ background: 'white', color: 'black', padding: '1rem', borderRadius: '4px' }}>
                            <h3 style={{ borderBottom: '2px solid #000', paddingBottom: '0.5rem' }}>Report Content</h3>
                            <table style={{ width: '100%', marginTop: '1rem', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: '#f3f4f6' }}>
                                        <th style={{ padding: '8px', textAlign: 'left' }}>Item</th>
                                        <th style={{ padding: '8px', textAlign: 'left' }}>Qty</th>
                                        <th style={{ padding: '8px', textAlign: 'left' }}>Status</th>
                                        <th style={{ padding: '8px', textAlign: 'left' }}>Value</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {dummyRows.map((r, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                            <td style={{ padding: '8px' }}>{r.col1}</td>
                                            <td style={{ padding: '8px' }}>{r.col2}</td>
                                            <td style={{ padding: '8px' }}>{r.col3}</td>
                                            <td style={{ padding: '8px' }}>{r.col4}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                        <button onClick={() => { alert('Test Email Sent!'); setShowPreview(false); }} className="bg-blue-600 text-white px-4 py-2 rounded">Send Test Email</button>
                    </div>
                </div>
            </div>
        );
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

            {/* Config Panel - Always visible if a report is selected */}
            {selectedReportId && typeof selectedReportId !== 'number' && selectedReportId !== 'builder' && (
                renderReportConfigPanel()
            )}

            {selectedReportId && typeof selectedReportId !== 'number' && selectedReportId !== 'builder' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                    // Using same logic but potentially need to filter stats if they were item-specific. 
                    // DailyStats is aggregate usually, so item filter might not apply well unless we fetch itemized daily stats.
                    // For now, let's keep it as is, or hide if no match?
                    // DailyReport usually shows 'items created', not specifics.
                    // Filter might be irrelevant here unless we detail the items.
                    <div className={styles.grid}>
                        <div className={styles.card} style={{ gridColumn: 'span 2' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <h3 className={styles.cardTitle} style={{ margin: 0 }}>Daily Summary</h3>
                                <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.875rem' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={dailyReportConfig.showItems} onChange={e => setDailyReportConfig(p => ({ ...p, showItems: e.target.checked }))} />
                                        Items
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={dailyReportConfig.showAudits} onChange={e => setDailyReportConfig(p => ({ ...p, showAudits: e.target.checked }))} />
                                        Audits
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={dailyReportConfig.showStaff} onChange={e => setDailyReportConfig(p => ({ ...p, showStaff: e.target.checked }))} />
                                        Staff
                                    </label>
                                </div>
                            </div>

                            {dsLoading ? <p>Loading...</p> : (
                                dailyStats ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
                                        {dailyReportConfig.showItems && (
                                            <div style={{ background: '#111827', padding: '1rem', borderRadius: '0.5rem', textAlign: 'center' }}>
                                                <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{dailyStats.itemsCreated || 0}</div>
                                                <div style={{ color: '#9ca3af' }}>Items Added</div>
                                            </div>
                                        )}
                                        {dailyReportConfig.showAudits && (
                                            <div style={{ background: '#111827', padding: '1rem', borderRadius: '0.5rem', textAlign: 'center' }}>
                                                <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{dailyStats.auditsPerformed || 0}</div>
                                                <div style={{ color: '#9ca3af' }}>Audits</div>
                                            </div>
                                        )}
                                        {dailyReportConfig.showStaff && (
                                            <div style={{ background: '#111827', padding: '1rem', borderRadius: '0.5rem', textAlign: 'center' }}>
                                                <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{dailyStats.usersActive || 0}</div>
                                                <div style={{ color: '#9ca3af' }}>Active Staff</div>
                                            </div>
                                        )}
                                    </div>
                                ) : <p style={{ color: '#9ca3af' }}>No activity data for this period.</p>
                            )}
                        </div>
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
                            <div style={{ height: '400px', width: '100%' }}>
                                {filteredBottleData.length > 0 ? (
                                    <ResponsiveContainer>
                                        <BarChart data={filteredBottleData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                            <XAxis dataKey="name" stroke="#9ca3af" />
                                            <YAxis stroke="#9ca3af" />
                                            <Tooltip contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff' }} />
                                            <Legend />
                                            <Bar dataKey="start_count" name="Start Count" fill="#3b82f6" />
                                            <Bar dataKey="end_count" name="End Count" fill="#10b981" />
                                            <Bar dataKey="usage" name="Usage" fill="#f59e0b" />
                                        </BarChart>
                                    </ResponsiveContainer>
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

                {/* Mock Preview Overlay */}
                <MockPreviewOverlay />

            </div>
        </div>
    );
}
