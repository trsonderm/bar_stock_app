import React from 'react';

interface ReportPreviewProps {
    type: 'DAILY' | 'LOW_STOCK';
    data?: any;
    isSample?: boolean;
    showSampleToggle?: boolean;
    onToggleSample?: (showSample: boolean) => void;
    lowStockThreshold?: number;
}

export default function ReportPreview({ type, data, isSample, showSampleToggle, onToggleSample, lowStockThreshold = 5 }: ReportPreviewProps) {

    const renderToggle = () => (
        showSampleToggle ? (
            <div className="flex justify-end mb-2">
                <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={isSample}
                        onChange={(e) => onToggleSample && onToggleSample(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-600 bg-gray-700"
                    />
                    Show Sample Data (Not enough real data)
                </label>
            </div>
        ) : null
    );

    if (isSample) {
        return (
            <div className="w-full">
                {renderToggle()}
                <div className="bg-yellow-900/20 border border-yellow-700/50 p-3 rounded mb-4 text-yellow-200 text-sm flex items-center gap-2">
                    <span>⚠️</span>
                    <strong>SAMPLE DATA PREVIEW</strong>
                    <span className="opacity-80">- Not enough real data to render full report.</span>
                </div>
                {type === 'DAILY' ? <DailyStockMockup /> : <LowStockMockup threshold={lowStockThreshold} />}
            </div>
        );
    }

    // Real Data Rendering (Assuming data structure matches mockup for now, or just generic JSON dump if simpler, but user asked for preview)
    // If real data is missing but isSample is false, we might want to show "No Data" or fallback to Mockup.
    // For now, if !isSample and !data, show "No Data Available".

    if (!data) {
        return (
            <div className="w-full text-center p-8 text-gray-500 border border-gray-700 rounded bg-gray-900">
                No report data generated for this period.
            </div>
        );
    }

    return (
        <div className="w-full">
            {/* If we have real data, we custom render it similar to mockup. For now, assuming distinct component or reusing logic. 
                 Since real report rendering might be complex, I'll focus on the Mockup Part as requested. 
                 If "data" is provided, we can map it. 
             */}
            <div className="bg-green-900/20 border border-green-700/50 p-3 rounded mb-4 text-green-200 text-sm flex items-center gap-2">
                <span>✅</span>
                <strong>PREVIEW (LIVE DATA)</strong>
            </div>
            {/* TODO: Implement real data renderer matching the mockup structure */}
            <pre className="bg-gray-950 p-4 rounded text-xs text-green-400 overflow-auto">{JSON.stringify(data, null, 2)}</pre>
        </div>
    );
}

const DailyStockMockup = () => (
    <div style={{ background: 'white', border: '1px solid #ccc', borderRadius: '0.5rem', overflow: 'hidden', fontFamily: 'sans-serif', color: '#1f2937' }}>
        <div style={{ background: '#111827', color: 'white', padding: '1rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Daily Stock Report</h2>
            <p style={{ margin: '0.25rem 0 0 0', opacity: 0.8, fontSize: '0.875rem' }}>Jan 3, 7:00 AM — Jan 4, 5:00 AM</p>
        </div>

        <div style={{ background: '#f8fafc', padding: '15px', margin: '20px 0 0 0', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-around' }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.85em', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Usage Cost</div>
                <div style={{ fontSize: '1.5em', fontWeight: 'bold', color: '#ef4444' }}>$52.00</div>
            </div>
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.85em', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Stock Added</div>
                <div style={{ fontSize: '1.5em', fontWeight: 'bold', color: '#10b981' }}>$350.00</div>
            </div>
        </div>

        <div style={{ padding: '1rem 1rem 0 1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ background: '#fff', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
                <h3 style={{ margin: '0 0 0.5rem 0', color: '#1f2937', fontSize: '1rem' }}>Liquor Cost by Bartender</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', padding: '0.25rem 0' }}><span>Alice</span><strong>$24.00</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', padding: '0.25rem 0' }}><span>Bob</span><strong>$28.00</strong></div>
            </div>
        </div>

        <div style={{ padding: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ background: '#f3f4f6', padding: '1rem', borderRadius: '0.5rem' }}>
                <h3 style={{ margin: '0 0 0.5rem 0', color: '#ef4444', fontSize: '1rem' }}>🔻 Usage</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #ddd', padding: '0.25rem 0' }}><span>Bud Light</span><strong>24</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #ddd', padding: '0.25rem 0' }}><span>Vodka</span><strong>2</strong></div>
            </div>
            <div style={{ background: '#ecfdf5', padding: '1rem', borderRadius: '0.5rem' }}>
                <h3 style={{ margin: '0 0 0.5rem 0', color: '#10b981', fontSize: '1rem' }}>✅ Restock</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #ddd', padding: '0.25rem 0' }}><span>Jack Daniels</span><strong>12</strong></div>
            </div>
        </div>

        <div style={{ padding: '0 1rem 1rem 1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ background: '#fee2e2', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #fca5a5' }}>
                <h3 style={{ margin: '0 0 0.5rem 0', color: '#dc2626', fontSize: '1rem' }}>❌ No Stock (0 Qty)</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #fca5a5', padding: '0.25rem 0' }}><span>Tequila Silver</span><strong>0</strong></div>
            </div>
        </div>
    </div>
);

const LowStockMockup = ({ threshold }: { threshold: number }) => (
    <div style={{ background: 'white', border: '1px solid #ccc', borderRadius: '0.5rem', overflow: 'hidden', fontFamily: 'sans-serif', color: '#1f2937', maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ background: '#7f1d1d', color: 'white', padding: '1rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'white' }}>⚠️ URGENT: Low Stock Alert</h2>
        </div>
        <div style={{ padding: '1.5rem' }}>
            <p style={{ marginTop: 0 }}>The following items are at or below the threshold ({threshold}):</p>
            <ul style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '0.5rem', padding: '1rem 2rem' }}>
                <li style={{ marginBottom: '0.5rem' }}>Rum: <b>3</b></li>
                <li style={{ marginBottom: '0.5rem' }}>Tequila Silver: <b>0</b></li>
            </ul>
            <div style={{ marginTop: '1.5rem' }}>
                <a href="#" style={{ background: '#c2410c', color: 'white', textDecoration: 'none', padding: '0.5rem 1rem', borderRadius: '0.25rem', fontSize: '0.9rem' }}>Go to Dashboard</a>
            </div>
        </div>
    </div>
);
