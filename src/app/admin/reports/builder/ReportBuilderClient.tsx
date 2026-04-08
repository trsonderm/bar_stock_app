'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { BarChart2, Table, Hash, Plus, Trash2, GripVertical, Save, Clock, Eye, ChevronLeft, RefreshCw } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import styles from '../../admin.module.css';

const COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#a855f7', '#ef4444', '#06b6d4'];

type SectionType = 'chart' | 'table' | 'kpi';
type DataSource = 'add_stock' | 'remove_stock' | 'bottle_levels' | 'cost';
type ChartType = 'bar' | 'line' | 'pie';
type GroupBy = 'none' | 'user' | 'item' | 'category';
type Aggregation = 'sum' | 'count' | 'avg';
type TimeFrameType = 'workday' | 'last7' | 'last30' | 'custom';

interface ReportSection {
    id: string;
    type: SectionType;
    title: string;
    dataSource: DataSource;
    chartType: ChartType;
    groupBy: GroupBy;
    aggregation: Aggregation;
    timeFrame: { type: TimeFrameType; from?: string; to?: string };
    previewData?: any;
    loading?: boolean;
}

interface ScheduleConfig {
    frequency: 'daily' | 'weekly' | 'monthly';
    days?: number[];     // 0-6 for weekly
    dayOfMonth?: number; // 1-31 for monthly
    time: string;        // HH:MM
    recipients: string;  // comma-sep emails
}

const uid = () => Math.random().toString(36).slice(2, 9);

const SECTION_TYPES: { type: SectionType; icon: React.ReactNode; label: string; desc: string }[] = [
    { type: 'chart', icon: <BarChart2 size={20} />, label: 'Chart', desc: 'Bar, line, or pie visualization' },
    { type: 'table', icon: <Table size={20} />, label: 'Table', desc: 'Tabular data view' },
    { type: 'kpi', icon: <Hash size={20} />, label: 'KPI', desc: 'Summary number cards' },
];

const DATA_SOURCES: { value: DataSource; label: string }[] = [
    { value: 'add_stock', label: 'Stock Added' },
    { value: 'remove_stock', label: 'Stock Removed' },
    { value: 'bottle_levels', label: 'Bottle Levels' },
    { value: 'cost', label: 'Cost Activity' },
];

const TIME_FRAMES: { value: TimeFrameType; label: string }[] = [
    { value: 'workday', label: 'Today (Workday)' },
    { value: 'last7', label: 'Last 7 Days' },
    { value: 'last30', label: 'Last 30 Days' },
    { value: 'custom', label: 'Custom Range' },
];

const defaultSection = (): ReportSection => ({
    id: uid(),
    type: 'chart',
    title: 'New Section',
    dataSource: 'add_stock',
    chartType: 'bar',
    groupBy: 'none',
    aggregation: 'sum',
    timeFrame: { type: 'last7' },
});

export default function ReportBuilderClient({ user }: { user: any }) {
    const [reportName, setReportName] = useState('My Custom Report');
    const [sections, setSections] = useState<ReportSection[]>([defaultSection()]);
    const [selectedId, setSelectedId] = useState<string | null>(sections[0].id);

    const [isScheduled, setIsScheduled] = useState(false);
    const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig>({
        frequency: 'daily',
        days: [1, 2, 3, 4, 5],
        dayOfMonth: 1,
        time: '08:00',
        recipients: '',
    });

    const [saving, setSaving] = useState(false);
    const [savedReports, setSavedReports] = useState<any[]>([]);
    const [loadingReports, setLoadingReports] = useState(true);
    const [dragOverId, setDragOverId] = useState<string | null>(null);
    const dragSrcId = useRef<string | null>(null);
    const [activeTab, setActiveTab] = useState<'builder' | 'saved'>('builder');

    const [users, setUsers] = useState<{ id: number; first_name: string; last_name: string; email: string }[]>([]);
    const [locations, setLocations] = useState<{ id: number; name: string }[]>([]);

    useEffect(() => {
        fetchSaved();
        fetch('/api/admin/users').then(r => r.json()).then(d => setUsers(d.users || []));
        fetch('/api/user/locations').then(r => r.json()).then(d => setLocations(d.locations || []));
    }, []);

    const fetchSaved = async () => {
        setLoadingReports(true);
        try {
            const res = await fetch('/api/admin/reports/saved');
            const data = await res.json();
            setSavedReports(data.reports || []);
        } catch { } finally {
            setLoadingReports(false);
        }
    };

    const fetchPreview = useCallback(async (section: ReportSection) => {
        setSections(prev => prev.map(s => s.id === section.id ? { ...s, loading: true } : s));
        try {
            const res = await fetch('/api/admin/reports/data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ section })
            });
            const data = await res.json();
            setSections(prev => prev.map(s => s.id === section.id ? { ...s, previewData: data, loading: false } : s));
        } catch {
            setSections(prev => prev.map(s => s.id === section.id ? { ...s, loading: false } : s));
        }
    }, []);

    const updateSection = (id: string, updates: Partial<ReportSection>) => {
        setSections(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    };

    const addSection = (type: SectionType) => {
        const s = { ...defaultSection(), type, id: uid() };
        setSections(prev => [...prev, s]);
        setSelectedId(s.id);
    };

    const removeSection = (id: string) => {
        setSections(prev => {
            const next = prev.filter(s => s.id !== id);
            if (selectedId === id) setSelectedId(next[0]?.id || null);
            return next;
        });
    };

    const handleDragStart = (id: string) => { dragSrcId.current = id; };
    const handleDragOver = (e: React.DragEvent, id: string) => { e.preventDefault(); setDragOverId(id); };
    const handleDrop = (targetId: string) => {
        if (!dragSrcId.current || dragSrcId.current === targetId) { setDragOverId(null); return; }
        setSections(prev => {
            const srcIdx = prev.findIndex(s => s.id === dragSrcId.current);
            const tgtIdx = prev.findIndex(s => s.id === targetId);
            const next = [...prev];
            const [moved] = next.splice(srcIdx, 1);
            next.splice(tgtIdx, 0, moved);
            return next;
        });
        dragSrcId.current = null;
        setDragOverId(null);
    };

    const handleSave = async () => {
        if (!reportName.trim()) { alert('Enter a report name.'); return; }
        setSaving(true);
        try {
            const config = { sections: sections.map(({ previewData, loading, ...s }) => s) };
            const res = await fetch('/api/admin/reports/saved', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: reportName, config, is_scheduled: isScheduled, schedule_config: isScheduled ? scheduleConfig : null })
            });
            if (res.ok) {
                alert('Report saved!');
                fetchSaved();
            } else {
                const d = await res.json();
                alert(d.error || 'Failed to save');
            }
        } finally {
            setSaving(false);
        }
    };

    const deleteSaved = async (id: number) => {
        if (!confirm('Delete this report?')) return;
        await fetch(`/api/admin/reports/saved/${id}`, { method: 'DELETE' });
        fetchSaved();
    };

    const selectedSection = sections.find(s => s.id === selectedId) || null;

    // Render preview for a section
    const renderPreview = (section: ReportSection) => {
        if (section.loading) return <div style={{ color: '#6b7280', padding: '1rem', textAlign: 'center' }}>Loading preview...</div>;
        const data = section.previewData;
        if (!data || !data.rows || data.rows.length === 0) {
            return (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#4b5563', border: '1px dashed #374151', borderRadius: '0.5rem' }}>
                    <p style={{ margin: 0, fontSize: '0.9rem' }}>No data yet — click <strong>Refresh Preview</strong> to load.</p>
                </div>
            );
        }

        const rows = data.rows.map((r: any) => ({
            ...r,
            date: r.date ? new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : r.option_label || r.item_name || r.user_name || '',
            value: parseFloat(r.value || r.count || 0),
        }));

        if (section.type === 'kpi') {
            const s = data.summary || {};
            return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem' }}>
                    {[
                        { label: 'Transactions', value: s.total_transactions || 0 },
                        { label: 'Total Qty', value: parseFloat(s.total_quantity || 0).toFixed(0) },
                        { label: 'Users', value: s.unique_users || 0 },
                        { label: 'Items', value: s.unique_items || 0 },
                    ].map(k => (
                        <div key={k.label} style={{ background: '#1f2937', borderRadius: '0.5rem', padding: '1rem', textAlign: 'center' }}>
                            <div style={{ color: '#f59e0b', fontSize: '1.6rem', fontWeight: 700 }}>{k.value}</div>
                            <div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{k.label}</div>
                        </div>
                    ))}
                </div>
            );
        }

        if (section.type === 'table') {
            return (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid #374151' }}>
                                {Object.keys(rows[0] || {}).map(k => (
                                    <th key={k} style={{ padding: '0.5rem', textAlign: 'left', color: '#9ca3af', textTransform: 'capitalize' }}>{k}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.slice(0, 20).map((r: any, i: number) => (
                                <tr key={i} style={{ borderBottom: '1px solid #1f2937' }}>
                                    {Object.values(r).map((v: any, j) => (
                                        <td key={j} style={{ padding: '0.5rem', color: '#e5e7eb' }}>{String(v)}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        }

        // Chart
        const chartData = rows;
        const dataKey = rows[0]?.user_name !== undefined ? 'user_name' : rows[0]?.item_name !== undefined ? 'item_name' : rows[0]?.category !== undefined ? 'category' : 'date';

        if (section.chartType === 'pie') {
            return (
                <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                        <Pie data={chartData} dataKey="value" nameKey={dataKey} cx="50%" cy="50%" outerRadius={80} label>
                            {chartData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                        <Legend />
                    </PieChart>
                </ResponsiveContainer>
            );
        }

        if (section.chartType === 'line') {
            return (
                <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={chartData}>
                        <XAxis dataKey={dataKey} tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Line type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={2} dot={false} />
                    </LineChart>
                </ResponsiveContainer>
            );
        }

        return (
            <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                    <XAxis dataKey={dataKey} tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        );
    };

    return (
        <div style={{ minHeight: '100vh', background: '#0f172a', color: 'white', padding: '1.5rem' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                <a href="/admin/reports" style={{ color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '0.25rem', textDecoration: 'none', fontSize: '0.9rem' }}>
                    <ChevronLeft size={16} /> Reports
                </a>
                <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#fbbf24', flex: 1 }}>Report Builder</h1>
                <span style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7', padding: '0.2rem 0.6rem', borderRadius: '2rem', fontSize: '0.75rem', fontWeight: 700 }}>PRO</span>
            </div>

            {/* Tab switcher */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid #1e293b', paddingBottom: '0.5rem' }}>
                {(['builder', 'saved'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        style={{
                            padding: '0.5rem 1rem',
                            background: activeTab === tab ? '#1e293b' : 'transparent',
                            color: activeTab === tab ? '#fbbf24' : '#9ca3af',
                            border: 'none',
                            borderRadius: '0.5rem',
                            cursor: 'pointer',
                            fontWeight: activeTab === tab ? 700 : 400,
                            fontSize: '0.9rem',
                        }}
                    >
                        {tab === 'builder' ? 'Build Report' : `Saved Reports (${savedReports.length})`}
                    </button>
                ))}
            </div>

            {activeTab === 'saved' && (
                <div>
                    {loadingReports ? (
                        <p style={{ color: '#9ca3af' }}>Loading saved reports...</p>
                    ) : savedReports.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: '#4b5563' }}>
                            <p>No saved reports yet. Build one above.</p>
                            <button onClick={() => setActiveTab('builder')} style={{ marginTop: '1rem', padding: '0.6rem 1.5rem', background: '#d97706', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 700 }}>
                                + Build Report
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {savedReports.map(r => (
                                <div key={r.id} style={{ background: '#1e293b', borderRadius: '0.75rem', border: '1px solid #334155', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    <div>
                                        <div style={{ fontWeight: 700, color: 'white', marginBottom: '0.25rem' }}>{r.name}</div>
                                        <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                                            {r.config?.sections?.length || 0} sections
                                            {r.is_scheduled && <span style={{ marginLeft: '0.5rem', color: '#a855f7' }}>• Scheduled</span>}
                                            {' • '}Updated {new Date(r.updated_at).toLocaleDateString()}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button
                                            onClick={() => deleteSaved(r.id)}
                                            style={{ padding: '0.4rem 0.75rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '0.4rem', cursor: 'pointer', fontSize: '0.8rem' }}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'builder' && (
                <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 280px', gap: '1.5rem', alignItems: 'start' }}>

                    {/* LEFT: Section palette */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div style={{ fontWeight: 700, color: '#9ca3af', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Add Section</div>
                        {SECTION_TYPES.map(st => (
                            <button
                                key={st.type}
                                onClick={() => addSection(st.type)}
                                style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', padding: '0.75rem', background: '#1e293b', border: '1px dashed #334155', borderRadius: '0.5rem', cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.2s' }}
                                onMouseEnter={e => (e.currentTarget.style.borderColor = '#f59e0b')}
                                onMouseLeave={e => (e.currentTarget.style.borderColor = '#334155')}
                            >
                                <span style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.9rem' }}>
                                    {st.icon} {st.label}
                                </span>
                                <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>{st.desc}</span>
                            </button>
                        ))}
                    </div>

                    {/* CENTER: Canvas */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <input
                                value={reportName}
                                onChange={e => setReportName(e.target.value)}
                                style={{ flex: 1, minWidth: '180px', background: '#1e293b', border: '1px solid #334155', color: 'white', padding: '0.6rem 1rem', borderRadius: '0.5rem', fontSize: '1rem', fontWeight: 700 }}
                                placeholder="Report name..."
                            />
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                style={{ padding: '0.6rem 1.25rem', background: '#d97706', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: saving ? 0.7 : 1 }}
                            >
                                <Save size={16} /> {saving ? 'Saving...' : 'Save Report'}
                            </button>
                        </div>

                        {sections.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '4rem', border: '2px dashed #1e293b', borderRadius: '1rem', color: '#4b5563' }}>
                                <Plus size={32} style={{ margin: '0 auto 0.5rem' }} />
                                <p>Click a section type on the left to add it here.</p>
                            </div>
                        )}

                        {sections.map(section => (
                            <div
                                key={section.id}
                                draggable
                                onDragStart={() => handleDragStart(section.id)}
                                onDragOver={e => handleDragOver(e, section.id)}
                                onDrop={() => handleDrop(section.id)}
                                onDragEnd={() => setDragOverId(null)}
                                onClick={() => setSelectedId(section.id)}
                                style={{
                                    background: '#1e293b',
                                    borderRadius: '0.75rem',
                                    border: `2px solid ${selectedId === section.id ? '#f59e0b' : dragOverId === section.id ? '#3b82f6' : '#334155'}`,
                                    padding: '1rem',
                                    cursor: 'grab',
                                    transition: 'border-color 0.15s',
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <GripVertical size={16} color="#4b5563" />
                                        <input
                                            value={section.title}
                                            onChange={e => { e.stopPropagation(); updateSection(section.id, { title: e.target.value }); }}
                                            onClick={e => e.stopPropagation()}
                                            style={{ background: 'transparent', border: 'none', color: 'white', fontWeight: 700, fontSize: '1rem', outline: 'none', width: '100%' }}
                                            placeholder="Section title"
                                        />
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button
                                            onClick={e => { e.stopPropagation(); fetchPreview(section); }}
                                            style={{ padding: '0.3rem 0.6rem', background: '#334155', color: '#93c5fd', border: 'none', borderRadius: '0.3rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem' }}
                                        >
                                            <RefreshCw size={12} /> Preview
                                        </button>
                                        <button
                                            onClick={e => { e.stopPropagation(); removeSection(section.id); }}
                                            style={{ padding: '0.3rem 0.6rem', background: '#450a0a', color: '#ef4444', border: 'none', borderRadius: '0.3rem', cursor: 'pointer' }}
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                </div>

                                <div style={{ background: '#0f172a', borderRadius: '0.5rem', padding: '1rem', minHeight: '120px' }}>
                                    {renderPreview(section)}
                                </div>

                                <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#4b5563', display: 'flex', gap: '0.75rem' }}>
                                    <span style={{ textTransform: 'capitalize' }}>{section.type}</span>
                                    <span>•</span>
                                    <span>{DATA_SOURCES.find(d => d.value === section.dataSource)?.label}</span>
                                    <span>•</span>
                                    <span>{TIME_FRAMES.find(t => t.value === section.timeFrame.type)?.label}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* RIGHT: Config panel */}
                    <div style={{ background: '#1e293b', borderRadius: '0.75rem', border: '1px solid #334155', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', position: 'sticky', top: '1rem' }}>
                        {!selectedSection ? (
                            <p style={{ color: '#4b5563', fontSize: '0.9rem', textAlign: 'center' }}>Select a section to configure</p>
                        ) : (
                            <>
                                <div style={{ fontWeight: 700, color: '#fbbf24', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Configure: {selectedSection.title}</div>

                                {/* Section type */}
                                <div>
                                    <label style={{ color: '#9ca3af', fontSize: '0.8rem', display: 'block', marginBottom: '0.25rem' }}>Type</label>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        {SECTION_TYPES.map(st => (
                                            <button
                                                key={st.type}
                                                onClick={() => updateSection(selectedSection.id, { type: st.type })}
                                                style={{ flex: 1, padding: '0.4rem', background: selectedSection.type === st.type ? '#334155' : 'transparent', border: `1px solid ${selectedSection.type === st.type ? '#f59e0b' : '#334155'}`, color: selectedSection.type === st.type ? '#fbbf24' : '#6b7280', borderRadius: '0.35rem', cursor: 'pointer', fontSize: '0.75rem' }}
                                            >
                                                {st.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Data source */}
                                <div>
                                    <label style={{ color: '#9ca3af', fontSize: '0.8rem', display: 'block', marginBottom: '0.25rem' }}>Data Source</label>
                                    <select
                                        value={selectedSection.dataSource}
                                        onChange={e => updateSection(selectedSection.id, { dataSource: e.target.value as DataSource })}
                                        style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', color: 'white', padding: '0.4rem', borderRadius: '0.35rem', fontSize: '0.85rem' }}
                                    >
                                        {DATA_SOURCES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                                    </select>
                                </div>

                                {/* Chart type (only for chart sections) */}
                                {selectedSection.type === 'chart' && (
                                    <div>
                                        <label style={{ color: '#9ca3af', fontSize: '0.8rem', display: 'block', marginBottom: '0.25rem' }}>Chart Type</label>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            {(['bar', 'line', 'pie'] as ChartType[]).map(ct => (
                                                <button
                                                    key={ct}
                                                    onClick={() => updateSection(selectedSection.id, { chartType: ct })}
                                                    style={{ flex: 1, padding: '0.4rem', background: selectedSection.chartType === ct ? '#334155' : 'transparent', border: `1px solid ${selectedSection.chartType === ct ? '#f59e0b' : '#334155'}`, color: selectedSection.chartType === ct ? '#fbbf24' : '#6b7280', borderRadius: '0.35rem', cursor: 'pointer', textTransform: 'capitalize', fontSize: '0.75rem' }}
                                                >
                                                    {ct}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Time frame */}
                                <div>
                                    <label style={{ color: '#9ca3af', fontSize: '0.8rem', display: 'block', marginBottom: '0.25rem' }}>Time Frame</label>
                                    <select
                                        value={selectedSection.timeFrame.type}
                                        onChange={e => updateSection(selectedSection.id, { timeFrame: { type: e.target.value as TimeFrameType } })}
                                        style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', color: 'white', padding: '0.4rem', borderRadius: '0.35rem', fontSize: '0.85rem' }}
                                    >
                                        {TIME_FRAMES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                    </select>
                                    {selectedSection.timeFrame.type === 'custom' && (
                                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                                            <input type="date" value={selectedSection.timeFrame.from || ''} onChange={e => updateSection(selectedSection.id, { timeFrame: { ...selectedSection.timeFrame, from: e.target.value } })} style={{ flex: 1, background: '#0f172a', border: '1px solid #334155', color: 'white', padding: '0.3rem', borderRadius: '0.3rem', fontSize: '0.8rem' }} />
                                            <input type="date" value={selectedSection.timeFrame.to || ''} onChange={e => updateSection(selectedSection.id, { timeFrame: { ...selectedSection.timeFrame, to: e.target.value } })} style={{ flex: 1, background: '#0f172a', border: '1px solid #334155', color: 'white', padding: '0.3rem', borderRadius: '0.3rem', fontSize: '0.8rem' }} />
                                        </div>
                                    )}
                                </div>

                                {/* Group by */}
                                <div>
                                    <label style={{ color: '#9ca3af', fontSize: '0.8rem', display: 'block', marginBottom: '0.25rem' }}>Group By</label>
                                    <select
                                        value={selectedSection.groupBy}
                                        onChange={e => updateSection(selectedSection.id, { groupBy: e.target.value as GroupBy })}
                                        style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', color: 'white', padding: '0.4rem', borderRadius: '0.35rem', fontSize: '0.85rem' }}
                                    >
                                        <option value="none">None</option>
                                        <option value="user">User</option>
                                        <option value="item">Item</option>
                                        <option value="category">Category</option>
                                    </select>
                                </div>

                                {/* Aggregation */}
                                <div>
                                    <label style={{ color: '#9ca3af', fontSize: '0.8rem', display: 'block', marginBottom: '0.25rem' }}>Aggregation</label>
                                    <select
                                        value={selectedSection.aggregation}
                                        onChange={e => updateSection(selectedSection.id, { aggregation: e.target.value as Aggregation })}
                                        style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', color: 'white', padding: '0.4rem', borderRadius: '0.35rem', fontSize: '0.85rem' }}
                                    >
                                        <option value="sum">Sum</option>
                                        <option value="count">Count</option>
                                        <option value="avg">Average</option>
                                    </select>
                                </div>

                                <button
                                    onClick={() => fetchPreview(selectedSection)}
                                    style={{ padding: '0.6rem', background: '#0f172a', border: '1px solid #334155', color: '#93c5fd', borderRadius: '0.4rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
                                >
                                    <Eye size={14} /> Refresh Preview
                                </button>
                            </>
                        )}

                        {/* Schedule toggle */}
                        <div style={{ borderTop: '1px solid #334155', paddingTop: '1rem', marginTop: '0.5rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', color: 'white', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                                <input
                                    type="checkbox"
                                    checked={isScheduled}
                                    onChange={e => setIsScheduled(e.target.checked)}
                                    style={{ width: '16px', height: '16px', accentColor: '#a855f7' }}
                                />
                                <Clock size={16} color="#a855f7" /> Schedule This Report
                            </label>

                            {isScheduled && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <div>
                                        <label style={{ color: '#9ca3af', fontSize: '0.8rem', display: 'block', marginBottom: '0.25rem' }}>Frequency</label>
                                        <select
                                            value={scheduleConfig.frequency}
                                            onChange={e => setScheduleConfig(p => ({ ...p, frequency: e.target.value as any }))}
                                            style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', color: 'white', padding: '0.4rem', borderRadius: '0.35rem', fontSize: '0.85rem' }}
                                        >
                                            <option value="daily">Every Day</option>
                                            <option value="weekly">Specific Days of Week</option>
                                            <option value="monthly">Monthly on a Day</option>
                                        </select>
                                    </div>

                                    {scheduleConfig.frequency === 'weekly' && (
                                        <div>
                                            <label style={{ color: '#9ca3af', fontSize: '0.8rem', display: 'block', marginBottom: '0.25rem' }}>Days</label>
                                            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d, i) => {
                                                    const active = scheduleConfig.days?.includes(i);
                                                    return (
                                                        <button
                                                            key={d}
                                                            onClick={() => setScheduleConfig(p => ({
                                                                ...p,
                                                                days: active ? (p.days || []).filter(x => x !== i) : [...(p.days || []), i]
                                                            }))}
                                                            style={{ padding: '0.3rem 0.5rem', background: active ? '#a855f7' : '#0f172a', border: `1px solid ${active ? '#a855f7' : '#334155'}`, color: active ? 'white' : '#6b7280', borderRadius: '0.3rem', cursor: 'pointer', fontSize: '0.75rem' }}
                                                        >
                                                            {d}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {scheduleConfig.frequency === 'monthly' && (
                                        <div>
                                            <label style={{ color: '#9ca3af', fontSize: '0.8rem', display: 'block', marginBottom: '0.25rem' }}>Day of Month</label>
                                            <input
                                                type="number"
                                                min="1" max="31"
                                                value={scheduleConfig.dayOfMonth || 1}
                                                onChange={e => setScheduleConfig(p => ({ ...p, dayOfMonth: parseInt(e.target.value) }))}
                                                style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', color: 'white', padding: '0.4rem', borderRadius: '0.35rem' }}
                                            />
                                        </div>
                                    )}

                                    <div>
                                        <label style={{ color: '#9ca3af', fontSize: '0.8rem', display: 'block', marginBottom: '0.25rem' }}>Time</label>
                                        <input
                                            type="time"
                                            value={scheduleConfig.time}
                                            onChange={e => setScheduleConfig(p => ({ ...p, time: e.target.value }))}
                                            style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', color: 'white', padding: '0.4rem', borderRadius: '0.35rem' }}
                                        />
                                    </div>

                                    <div>
                                        <label style={{ color: '#9ca3af', fontSize: '0.8rem', display: 'block', marginBottom: '0.25rem' }}>Recipients (emails, comma-separated)</label>
                                        <input
                                            value={scheduleConfig.recipients}
                                            onChange={e => setScheduleConfig(p => ({ ...p, recipients: e.target.value }))}
                                            placeholder="manager@bar.com, owner@bar.com"
                                            style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', color: 'white', padding: '0.4rem', borderRadius: '0.35rem', fontSize: '0.8rem', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
