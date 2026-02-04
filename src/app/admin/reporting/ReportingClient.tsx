'use client';

import { useState, useEffect } from 'react';
import styles from '../admin.module.css';
import { Plus, Trash2, Edit, FileText, Save, BarChart2, Calendar, Settings } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts';

interface ReportSection {
    id?: number;
    type: 'chart' | 'table' | 'summary';
    title: string;
    data_source: 'inventory' | 'activity' | 'orders' | 'users_stats';
    config: {
        chartType?: 'bar' | 'line';
        showLabels?: boolean;
        dateRange?: 'last_7_days' | 'last_30_days' | 'this_month' | 'last_month'; // Default range
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

export default function ReportingClient() {
    const [view, setView] = useState<'list' | 'builder' | 'view' | 'schedule' | 'standard'>('list');
    const [reports, setReports] = useState<SavedReport[]>([]);
    const [loading, setLoading] = useState(true);

    // Builder State
    const [builderId, setBuilderId] = useState<number | null>(null);
    const [builderName, setBuilderName] = useState('');
    const [builderDesc, setBuilderDesc] = useState('');
    const [builderSections, setBuilderSections] = useState<ReportSection[]>([]);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

    // View State
    const [viewReport, setViewReport] = useState<SavedReport | null>(null);
    const [datePeriod, setDatePeriod] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
    const [dateRange, setDateRange] = useState({ start: '', end: '' });

    // Schedule State
    const [scheduleReport, setScheduleReport] = useState<SavedReport | null>(null);
    const [scheduleForm, setScheduleForm] = useState({
        frequency: 'weekly',
        recipients: '',
        active: true
    });

    useEffect(() => {
        if (view === 'list') fetchReports();
    }, [view]);

    // Set default dates when entering view
    useEffect(() => {
        if (view === 'view') {
            const end = new Date();
            const start = new Date();
            start.setMonth(start.getMonth() - 1); // Default to last month
            setDateRange({
                start: start.toISOString().split('T')[0],
                end: end.toISOString().split('T')[0]
            });
        }
    }, [view]);

    const fetchReports = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/reporting/reports');
            const data = await res.json();
            if (data.reports) setReports(data.reports);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateNew = () => {
        setBuilderId(null);
        setBuilderName('New Report');
        setBuilderDesc('');
        setBuilderSections([]);
        setHasUnsavedChanges(true);
        setView('builder');
    };

    const handleEditReport = async (report: SavedReport) => {
        try {
            const res = await fetch(`/api/admin/reporting/reports/${report.id}`);
            const data = await res.json();
            if (data.report) {
                const r = data.report;
                setBuilderId(r.id);
                setBuilderName(r.name);
                setBuilderDesc(r.description || '');
                setBuilderSections(r.sections || []);
                setHasUnsavedChanges(false);
                setView('builder');
            }
        } catch (e) {
            alert('Failed to load report for editing');
        }
    };

    const handleViewReport = async (report: SavedReport) => {
        try {
            const res = await fetch(`/api/admin/reporting/reports/${report.id}`);
            const data = await res.json();
            if (data.report) {
                setViewReport(data.report);
                setView('view');
            }
        } catch (e) {
            alert('Failed to load report');
        }
    };

    const handleScheduleReport = async (report: SavedReport) => {
        setScheduleReport(report);
        // Fetch existing
        try {
            const res = await fetch(`/api/admin/reporting/schedules?reportId=${report.id}`);
            const data = await res.json();
            if (data.schedule) {
                setScheduleForm({
                    frequency: data.schedule.frequency,
                    recipients: data.schedule.recipients ? data.schedule.recipients.join(', ') : '',
                    active: data.schedule.active
                });
            } else {
                setScheduleForm({ frequency: 'weekly', recipients: '', active: true });
            }
            setView('schedule');
        } catch (e) {
            alert('Error fetching schedule');
        }
    };

    const handleSaveSchedule = async () => {
        if (!scheduleReport) return;
        try {
            const recipientsArray = scheduleForm.recipients.split(',').map(s => s.trim()).filter(s => s);
            await fetch('/api/admin/reporting/schedules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reportId: scheduleReport.id,
                    frequency: scheduleForm.frequency,
                    recipients: recipientsArray,
                    active: scheduleForm.active
                })
            });
            alert('Schedule saved!');
            setView('list');
        } catch (e) {
            alert('Error saving schedule');
        }
    };


    const handleDeleteReport = async (id: number) => {
        if (!confirm('Are you sure you want to delete this report?')) return;
        try {
            await fetch(`/api/admin/reporting/reports/${id}`, { method: 'DELETE' });
            fetchReports();
        } catch (e) {
            alert('Error deleting');
        }
    };

    const handleSaveReport = async () => {
        if (!builderName.trim()) return alert('Name is required');

        try {
            const payload = {
                name: builderName,
                description: builderDesc,
                sections: builderSections
            };

            let res;
            if (builderId) {
                res = await fetch(`/api/admin/reporting/reports/${builderId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } else {
                res = await fetch('/api/admin/reporting/reports', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }

            const d = await res.json();
            if (d.success || d.id) {
                setView('list');
            } else {
                alert('Save failed');
            }
        } catch (e) {
            console.error(e);
            alert('Error saving');
        }
    };

    // DnD Handlers
    const onDragStart = (e: React.DragEvent, index: number) => {
        setDraggedIdx(index);
        e.dataTransfer.effectAllowed = 'move';
    };

    const onDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (draggedIdx === null || draggedIdx === index) return;

        const newSecs = [...builderSections];
        const draggedItem = newSecs[draggedIdx];
        newSecs.splice(draggedIdx, 1);
        newSecs.splice(index, 0, draggedItem);

        setDraggedIdx(index);
        setBuilderSections(newSecs);
    };

    const onDragEnd = () => {
        setDraggedIdx(null);
    };

    // --- Renderers ---

    // Data Hook for Sections
    const SectionChart = ({ section, isLive, datePeriod, dateRange }: { section: ReportSection, isLive: boolean, datePeriod: string, dateRange: any }) => {
        const [data, setData] = useState<any[]>([]);
        const [loading, setLoading] = useState(false);

        useEffect(() => {
            if (isLive) {
                fetchData();
            } else {
                // Sample Data for Builder
                setData(getSampleData(section.data_source, section.type));
            }
        }, [isLive, section, datePeriod, dateRange]);

        const fetchData = async () => {
            setLoading(true);
            try {
                const res = await fetch('/api/admin/reporting/data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        source: section.data_source,
                        type: section.type,
                        period: datePeriod,
                        dateRange: dateRange
                    })
                });
                const d = await res.json();
                if (d.data) setData(d.data);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };

        if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading Data...</div>;

        if (section.type === 'chart') {
            return (
                <div style={{ width: '100%', height: 300 }}>
                    <ResponsiveContainer>
                        <BarChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis dataKey="name" stroke="#9ca3af" />
                            <YAxis stroke="#9ca3af" />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff' }}
                                itemStyle={{ color: '#fff' }}
                            />
                            <Legend />
                            <Bar dataKey="value" fill="#3b82f6" name={section.data_source === 'orders' ? 'Orders' : 'Quantity'}>
                                {section.config.showLabels && (
                                    <LabelList dataKey="value" position="top" style={{ fill: '#fff', fontSize: '0.8rem' }} />
                                )}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            );
        }
        if (section.type === 'table') {
            return (
                <div style={{ width: '100%', overflowX: 'auto', maxHeight: '300px', overflowY: 'auto' }}>
                    <table className={styles.table} style={{ width: '100%' }}>
                        <thead style={{ position: 'sticky', top: 0, background: '#1f2937' }}>
                            <tr>
                                <th>Name</th>
                                <th>Value</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((row, i) => (
                                <tr key={i}>
                                    <td>{row.name}</td>
                                    <td>{row.value}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )
        }
        // Summary Card
        return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div style={{ background: '#374151', padding: '1.5rem', borderRadius: '0.5rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'white' }}>{data.reduce((a, b) => a + Number(b.value), 0).toLocaleString()}</div>
                    <div style={{ color: '#9ca3af' }}>Total {section.data_source.replace('_', ' ')}</div>
                </div>
                <div style={{ background: '#374151', padding: '1.5rem', borderRadius: '0.5rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'white' }}>{data.length > 0 ? Math.floor(data.reduce((a, b) => a + Number(b.value), 0) / data.length).toLocaleString() : 0}</div>
                    <div style={{ color: '#9ca3af' }}>Average</div>
                </div>
            </div>
        );
    };

    const getSampleData = (source: string, type: string) => {
        if (source === 'inventory') {
            return [
                { name: 'Vodka', value: 120 },
                { name: 'Rum', value: 80 },
                { name: 'Gin', value: 45 },
                { name: 'Whiskey', value: 90 },
                { name: 'Beer', value: 200 },
            ];
        }
        if (source === 'activity') {
            return [
                { name: 'Mon', value: 12 },
                { name: 'Tue', value: 15 },
                { name: 'Wed', value: 8 },
                { name: 'Thu', value: 25 },
                { name: 'Fri', value: 40 },
                { name: 'Sat', value: 55 },
                { name: 'Sun', value: 30 },
            ];
        }
        if (source === 'orders') {
            return [
                { name: 'Week 1', value: 5 },
                { name: 'Week 2', value: 3 },
                { name: 'Week 3', value: 6 },
                { name: 'Week 4', value: 4 },
            ];
        }
        if (source === 'users_stats') {
            return [
                { name: 'John Doe', value: 45 },
                { name: 'Jane Smith', value: 32 },
                { name: 'Bob Wilson', value: 28 },
            ];
        }
        return [];
    };

    const renderPreviewChart = (section: ReportSection, isLive = false) => {
        return <SectionChart section={section} isLive={isLive} datePeriod={datePeriod} dateRange={dateRange} />;
    };


    if (view === 'list') {
        return (
            <div className={styles.container}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <h1 className={styles.pageTitle}>Custom Reports</h1>
                    <button
                        onClick={handleCreateNew}
                        style={{ background: '#3b82f6', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', border: 'none', display: 'flex', gap: '0.5rem', alignItems: 'center', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                        <Plus size={20} /> Create New Report
                    </button>
                </div>

                {loading ? <div style={{ color: '#9ca3af' }}>Loading...</div> : (
                    <div className={styles.grid}>
                        {reports.length === 0 ? (
                            <div style={{ gridColumn: '1 / -1', color: '#6b7280', textAlign: 'center', padding: '4rem' }}>
                                No reports found. Create one to get started.
                            </div>
                        ) : (
                            reports.map(r => (
                                <div key={r.id} className={styles.card} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                            <FileText size={20} className="text-blue-400" />
                                            <h3 className={styles.cardTitle} style={{ marginBottom: 0 }}>{r.name}</h3>
                                        </div>
                                        <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>{r.description || 'No description'}</p>
                                        <p style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '0.5rem' }}>Created: {new Date(r.created_at).toLocaleDateString()}</p>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', borderTop: '1px solid #374151', paddingTop: '1rem' }}>
                                        <button onClick={() => handleViewReport(r)} style={{ flex: 1, background: '#374151', color: 'white', border: 'none', padding: '0.5rem', borderRadius: '4px', cursor: 'pointer' }}>View</button>
                                        <button onClick={() => handleEditReport(r)} style={{ background: '#374151', color: '#fbbf24', border: 'none', padding: '0.5rem', borderRadius: '4px', cursor: 'pointer' }} title="Edit Structure"><Edit size={16} /></button>
                                        <button onClick={() => handleScheduleReport(r)} style={{ background: '#374151', color: '#a855f7', border: 'none', padding: '0.5rem', borderRadius: '4px', cursor: 'pointer' }} title="Schedule Email"><Settings size={16} /></button>
                                        <button onClick={() => handleDeleteReport(r.id)} style={{ background: '#374151', color: '#ef4444', border: 'none', padding: '0.5rem', borderRadius: '4px', cursor: 'pointer' }} title="Delete"><Trash2 size={16} /></button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        );
    }

    if (view === 'schedule' && scheduleReport) {
        return (
            <div className={styles.container}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <button onClick={() => setView('list')} style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer' }}>&larr; Back</button>
                        <h1 className={styles.pageTitle}>Schedule Report: {scheduleReport.name}</h1>
                    </div>
                    <button
                        onClick={handleSaveSchedule}
                        style={{ background: '#10b981', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', border: 'none', display: 'flex', gap: '0.5rem', alignItems: 'center', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                        <Save size={20} /> Save Schedule
                    </button>
                </div>

                <div className={styles.card} style={{ maxWidth: '600px' }}>
                    <div style={{ marginBottom: '1.5rem' }}>
                        <label className={styles.label}>Frequency</label>
                        <select
                            className={styles.input}
                            value={scheduleForm.frequency}
                            onChange={(e) => setScheduleForm({ ...scheduleForm, frequency: e.target.value })}
                        >
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                        </select>
                    </div>
                    <div style={{ marginBottom: '1.5rem' }}>
                        <label className={styles.label}>Recipients (Comma separated emails)</label>
                        <input
                            className={styles.input}
                            placeholder="manager@bar.com, owner@bar.com"
                            value={scheduleForm.recipients}
                            onChange={(e) => setScheduleForm({ ...scheduleForm, recipients: e.target.value })}
                        />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                            type="checkbox"
                            checked={scheduleForm.active}
                            onChange={(e) => setScheduleForm({ ...scheduleForm, active: e.target.checked })}
                            style={{ width: '20px', height: '20px', accentColor: '#10b981' }}
                        />
                        <label className={styles.label} style={{ marginBottom: 0 }}>Active</label>
                    </div>
                </div>
            </div>
        );
    }

    if (view === 'builder') {
        return (
            <div className={styles.container}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <button onClick={() => setView('list')} style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer' }}>&larr; Back</button>
                        <h1 className={styles.pageTitle}>{builderId ? 'Edit Report' : 'New Report'}</h1>
                    </div>
                    <button
                        onClick={handleSaveReport}
                        style={{ background: '#10b981', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', border: 'none', display: 'flex', gap: '0.5rem', alignItems: 'center', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                        <Save size={20} /> Save Report
                    </button>
                </div>

                <div className={styles.card} style={{ marginBottom: '2rem' }}>
                    <label className={styles.label}>Report Name</label>
                    <input
                        className={styles.input}
                        value={builderName}
                        onChange={e => setBuilderName(e.target.value)}
                        placeholder="e.g. Monthly Inventory Summary"
                    />
                    <label className={styles.label} style={{ marginTop: '1rem' }}>Description</label>
                    <textarea
                        className={styles.input}
                        value={builderDesc}
                        onChange={e => setBuilderDesc(e.target.value)}
                        placeholder="Optional description..."
                        rows={3}
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ color: 'white', margin: 0 }}>Sections (Drag to Reorder)</h3>
                    <button
                        onClick={() => {
                            setBuilderSections([...builderSections, {
                                type: 'chart',
                                title: 'New Chart Section',
                                data_source: 'inventory',
                                config: { chartType: 'bar', showLabels: true }
                            }]);
                        }}
                        style={{ background: '#374151', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', gap: '0.5rem', alignItems: 'center' }}
                    >
                        <Plus size={16} /> Add Section
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {builderSections.map((sec, idx) => (
                        <div
                            key={idx}
                            className={styles.card}
                            style={{ border: '1px solid #374151', cursor: 'grab', opacity: draggedIdx === idx ? 0.5 : 1 }}
                            draggable
                            onDragStart={(e) => onDragStart(e, idx)}
                            onDragOver={(e) => onDragOver(e, idx)}
                            onDragEnd={onDragEnd}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                                    <span style={{ color: '#6b7280', fontSize: '1.2rem' }}>☰</span>
                                    <input
                                        className={styles.input}
                                        style={{ width: 'auto', flex: 1, marginRight: '1rem' }}
                                        value={sec.title}
                                        onChange={(e) => {
                                            const newSecs = [...builderSections];
                                            newSecs[idx].title = e.target.value;
                                            setBuilderSections(newSecs);
                                        }}
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button
                                        onClick={() => {
                                            const newSecs = [...builderSections];
                                            newSecs.splice(idx, 1);
                                            setBuilderSections(newSecs);
                                        }}
                                        style={{ color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer' }}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                <div>
                                    <label className={styles.label}>Type</label>
                                    <select
                                        className={styles.input}
                                        value={sec.type}
                                        onChange={(e) => {
                                            const newSecs = [...builderSections];
                                            newSecs[idx].type = e.target.value as any;
                                            setBuilderSections(newSecs);
                                        }}
                                    >
                                        <option value="summary">Summary Card</option>
                                        <option value="chart">Chart</option>
                                        <option value="table">Data Table</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={styles.label}>Data Source</label>
                                    <select
                                        className={styles.input}
                                        value={sec.data_source}
                                        onChange={(e) => {
                                            const newSecs = [...builderSections];
                                            newSecs[idx].data_source = e.target.value as any;
                                            setBuilderSections(newSecs);
                                        }}
                                    >
                                        <option value="inventory">Inventory</option>
                                        <option value="activity">User Activity</option>
                                        <option value="orders">Purchase Orders</option>
                                        <option value="users_stats">User Stats (Top Subtractors)</option>
                                    </select>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <input
                                        type="checkbox"
                                        id={`labels-${idx}`}
                                        checked={sec.config.showLabels}
                                        onChange={(e) => {
                                            const newSecs = [...builderSections];
                                            newSecs[idx].config = { ...newSecs[idx].config, showLabels: e.target.checked };
                                            setBuilderSections(newSecs);
                                        }}
                                        style={{ width: '20px', height: '20px', accentColor: '#3b82f6' }}
                                    />
                                    <label htmlFor={`labels-${idx}`} className={styles.label} style={{ marginBottom: 0, cursor: 'pointer' }}>Show Labels</label>
                                </div>
                            </div>

                            {/* LIVE PREVIEW */}
                            <div style={{ borderTop: '1px solid #374151', paddingTop: '1rem' }}>
                                <label className={styles.label} style={{ fontSize: '0.8rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <BarChart2 size={14} /> Live Preview (Sample Data)
                                </label>
                                <div style={{ background: '#111827', borderRadius: '0.5rem', padding: '1rem', marginTop: '0.5rem' }}>
                                    {renderPreviewChart(sec, false)}
                                </div>
                            </div>
                        </div>
                    ))}
                    {builderSections.length === 0 && (
                        <div style={{ color: '#6b7280', textAlign: 'center', padding: '2rem', border: '2px dashed #374151', borderRadius: '0.5rem' }}>
                            No sections added. Click "Add Section" to begin.
                        </div>
                    )}
                </div>
            </div>
        );
    }

    if (view === 'view' && viewReport) {
        return (
            <div className={styles.container}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <button onClick={() => setView('list')} style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer' }}>&larr; Back</button>
                            <h1 className={styles.pageTitle}>{viewReport.name}</h1>
                        </div>
                    </div>

                    {/* Controls Bar */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', background: '#374151', padding: '1rem', borderRadius: '0.5rem', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '1rem' }}>
                            <Calendar size={18} style={{ color: '#9ca3af' }} />
                            <span style={{ color: '#d1d5db', fontWeight: 'bold' }}>Period:</span>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', background: '#1f2937', padding: '4px', borderRadius: '0.5rem' }}>
                            {(['daily', 'weekly', 'monthly'] as const).map(p => (
                                <button
                                    key={p}
                                    onClick={() => setDatePeriod(p)}
                                    style={{
                                        background: datePeriod === p ? '#3b82f6' : 'transparent',
                                        color: datePeriod === p ? 'white' : '#9ca3af',
                                        border: 'none',
                                        padding: '4px 12px',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        textTransform: 'capitalize',
                                        fontSize: '0.9rem',
                                        fontWeight: datePeriod === p ? 'bold' : 'normal'
                                    }}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>

                        <div style={{ width: '1px', height: '24px', background: '#4b5563', margin: '0 0.5rem' }}></div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <label style={{ color: '#d1d5db', fontSize: '0.9rem' }}>From:</label>
                            <input
                                type="date"
                                className={styles.input}
                                style={{ width: 'auto', padding: '4px 8px' }}
                                value={dateRange.start}
                                onChange={e => setDateRange({ ...dateRange, start: e.target.value })}
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <label style={{ color: '#d1d5db', fontSize: '0.9rem' }}>To:</label>
                            <input
                                type="date"
                                className={styles.input}
                                style={{ width: 'auto', padding: '4px 8px' }}
                                value={dateRange.end}
                                onChange={e => setDateRange({ ...dateRange, end: e.target.value })}
                            />
                        </div>
                    </div>
                </div>

                <div style={{ color: '#9ca3af', marginBottom: '2rem' }}>{viewReport.description}</div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    {viewReport.sections?.map((sec, idx) => (
                        <div key={idx} className={styles.card}>
                            <h3 className={styles.cardTitle}>{sec.title}</h3>
                            <p style={{ color: '#6b7280', fontSize: '0.8rem', marginBottom: '1rem' }}>
                                Source: {sec.data_source} | Granularity: {datePeriod}
                            </p>
                            <div style={{ padding: '1rem', background: '#111827', borderRadius: '0.5rem' }}>
                                {renderPreviewChart(sec, true)}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return null;
}
