'use client';

import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import InputLabel from '@mui/material/InputLabel';
import FormControl from '@mui/material/FormControl';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import NotificationsIcon from '@mui/icons-material/Notifications';
import InventoryIcon from '@mui/icons-material/Inventory';
import AssessmentIcon from '@mui/icons-material/Assessment';
import ScheduleIcon from '@mui/icons-material/Schedule';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import AutoGraphIcon from '@mui/icons-material/AutoGraph';
import TrackChangesIcon from '@mui/icons-material/TrackChanges';
import PersonIcon from '@mui/icons-material/Person';
import SaveIcon from '@mui/icons-material/Save';

// ── Email chip input ──────────────────────────────────────────────────────────

function EmailList({ label, value, onChange, disabled }: {
    label: string;
    value: string[];
    onChange: (v: string[]) => void;
    disabled?: boolean;
}) {
    const [input, setInput] = useState('');

    const add = () => {
        const v = input.trim().toLowerCase();
        if (v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && !value.includes(v)) {
            onChange([...value, v]);
        }
        setInput('');
    };

    return (
        <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>{label}</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1, minHeight: 32 }}>
                {value.map(email => (
                    <Chip
                        key={email}
                        label={email}
                        size="small"
                        onDelete={disabled ? undefined : () => onChange(value.filter(e => e !== email))}
                    />
                ))}
                {value.length === 0 && <Typography variant="caption" color="text.disabled" sx={{ pt: 0.5 }}>No recipients</Typography>}
            </Box>
            {!disabled && (
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <TextField
                        size="small"
                        placeholder="email@example.com"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
                        sx={{ flex: 1 }}
                    />
                    <Button size="small" variant="outlined" onClick={add}>Add</Button>
                </Box>
            )}
        </Box>
    );
}

// ── Schedule picker ───────────────────────────────────────────────────────────

function SchedulePicker({ value, onChange, includePerShift = false, disabled }: {
    value: { frequency: string; time: string };
    onChange: (v: { frequency: string; time: string }) => void;
    includePerShift?: boolean;
    disabled?: boolean;
}) {
    return (
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <FormControl size="small" sx={{ minWidth: 150 }} disabled={disabled}>
                <InputLabel>Frequency</InputLabel>
                <Select
                    label="Frequency"
                    value={value.frequency}
                    onChange={e => onChange({ ...value, frequency: e.target.value })}
                >
                    {includePerShift && <MenuItem value="per_shift">Per Shift</MenuItem>}
                    <MenuItem value="daily">Daily</MenuItem>
                    <MenuItem value="weekly">Weekly</MenuItem>
                    <MenuItem value="monthly">Monthly</MenuItem>
                </Select>
            </FormControl>
            {value.frequency !== 'per_shift' && (
                <TextField
                    size="small"
                    type="time"
                    label="Send time"
                    value={value.time}
                    onChange={e => onChange({ ...value, time: e.target.value })}
                    disabled={disabled}
                    inputProps={{ style: { width: 110 } }}
                />
            )}
        </Box>
    );
}

// ── Section card ─────────────────────────────────────────────────────────────

function Section({ icon, title, description, badge, defaultExpanded = false, children }: {
    icon: React.ReactNode;
    title: string;
    description: string;
    badge?: string;
    defaultExpanded?: boolean;
    children: React.ReactNode;
}) {
    return (
        <Accordion defaultExpanded={defaultExpanded} sx={{ mb: 1, '&:before': { display: 'none' }, border: '1px solid', borderColor: 'divider', borderRadius: '8px !important' }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
                    <Box sx={{ color: 'primary.main' }}>{icon}</Box>
                    <Box sx={{ flex: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography fontWeight={600}>{title}</Typography>
                            {badge && (
                                <Chip label={badge} size="small" sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'rgba(168,85,247,0.15)', color: '#a855f7', fontWeight: 700 }} />
                            )}
                        </Box>
                        <Typography variant="caption" color="text.secondary">{description}</Typography>
                    </Box>
                </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
                <Divider sx={{ mb: 2 }} />
                {children}
            </AccordionDetails>
        </Accordion>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NotificationsClient() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        fetch('/api/admin/notifications-settings')
            .then(r => r.json())
            .then(d => { setData(d); setLoading(false); });
    }, []);

    const setS = (key: string, val: any) =>
        setData((prev: any) => ({ ...prev, settings: { ...prev.settings, [key]: val } }));

    const setP = (key: string, val: any) =>
        setData((prev: any) => ({ ...prev, profile: { ...prev.profile, [key]: val } }));

    const handleSave = async () => {
        setSaving(true);
        await fetch('/api/admin/notifications-settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings: data.settings, profile: data.profile }),
        });
        setSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;

    const { settings: s, profile: p, access } = data;
    const { isAdmin, canAudit, canInventory } = access;
    const hasSomeOrgAccess = isAdmin || canAudit || canInventory;

    return (
        <Box sx={{ maxWidth: 800, mx: 'auto' }}>
            <Box sx={{ mb: 3 }}>
                <Typography variant="h5" fontWeight={700}>Notification Settings</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    Manage where and how you receive alerts and reports. Only sections relevant to your access level are shown.
                </Typography>
            </Box>

            {saved && <Alert severity="success" sx={{ mb: 2 }}>Settings saved successfully.</Alert>}

            {/* ── Personal Preferences ── */}
            <Section
                icon={<PersonIcon />}
                title="Personal Notifications"
                description="Your individual in-app notification preferences."
                defaultExpanded
            >
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    {[
                        { key: 'new_message', label: 'New Messages', desc: 'Notify when you receive a direct message' },
                        { key: 'post_tag', label: 'Post Tags', desc: 'Notify when you are tagged in a post' },
                        { key: 'low_stock', label: 'Low Stock Alerts', desc: 'Notify when items fall below threshold' },
                        { key: 'shift_report', label: 'Shift Reports', desc: 'Notify when a shift report is generated' },
                    ].map(({ key, label, desc }) => (
                        <Box key={key} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                            <Box>
                                <Typography variant="body2" fontWeight={500}>{label}</Typography>
                                <Typography variant="caption" color="text.secondary">{desc}</Typography>
                            </Box>
                            <Switch
                                checked={!!p[key]}
                                onChange={e => setP(key, e.target.checked)}
                                size="small"
                            />
                        </Box>
                    ))}
                </Box>
            </Section>

            {/* ── Org-level sections (gated) ── */}
            {!hasSomeOrgAccess && (
                <Alert severity="info" sx={{ mt: 2 }}>
                    Organization-level notification settings are only available to administrators and users with reporting permissions.
                </Alert>
            )}

            {/* Low Stock Alerts */}
            {canInventory && (
                <Section
                    icon={<InventoryIcon />}
                    title="Low Stock Alerts"
                    description="Email alerts when inventory items fall at or below their threshold."
                    badge={isAdmin ? undefined : 'View only if not admin'}
                >
                    <FormControlLabel
                        control={
                            <Switch
                                checked={s.low_stock_alert_enabled === 'true'}
                                onChange={e => setS('low_stock_alert_enabled', e.target.checked ? 'true' : 'false')}
                                disabled={!isAdmin}
                            />
                        }
                        label="Enable low stock alerts"
                        sx={{ mb: 2 }}
                    />
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, opacity: s.low_stock_alert_enabled === 'true' ? 1 : 0.5 }}>
                        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <TextField
                                size="small"
                                label="Alert subject line"
                                value={s.low_stock_alert_title || ''}
                                onChange={e => setS('low_stock_alert_title', e.target.value)}
                                disabled={!isAdmin}
                                sx={{ flex: 1, minWidth: 200 }}
                            />
                            <TextField
                                size="small"
                                label="Default threshold (units)"
                                type="number"
                                value={s.low_stock_threshold || '5'}
                                onChange={e => setS('low_stock_threshold', e.target.value)}
                                disabled={!isAdmin}
                                inputProps={{ min: 0, style: { width: 80 } }}
                            />
                        </Box>
                        <EmailList
                            label="To"
                            value={s.low_stock_alert_emails?.to || []}
                            onChange={v => setS('low_stock_alert_emails', { ...s.low_stock_alert_emails, to: v })}
                            disabled={!isAdmin}
                        />
                        <EmailList
                            label="CC"
                            value={s.low_stock_alert_emails?.cc || []}
                            onChange={v => setS('low_stock_alert_emails', { ...s.low_stock_alert_emails, cc: v })}
                            disabled={!isAdmin}
                        />
                        <Box>
                            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>Alert schedule</Typography>
                            <SchedulePicker
                                value={s.low_stock_alert_schedule || { frequency: 'daily', time: '14:00' }}
                                onChange={v => setS('low_stock_alert_schedule', v)}
                                disabled={!isAdmin}
                            />
                        </Box>
                    </Box>
                </Section>
            )}

            {/* Audit Alerts */}
            {canAudit && (
                <Section
                    icon={<TrackChangesIcon />}
                    title="Audit Report Alerts"
                    description="Email notifications when inventory audits are completed."
                >
                    <FormControlLabel
                        control={
                            <Switch
                                checked={s.audit_alert_enabled === 'true'}
                                onChange={e => setS('audit_alert_enabled', e.target.checked ? 'true' : 'false')}
                                disabled={!isAdmin && !canAudit}
                            />
                        }
                        label="Email audit reports on completion"
                        sx={{ mb: 2 }}
                    />
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, opacity: s.audit_alert_enabled === 'true' ? 1 : 0.5 }}>
                        <EmailList
                            label="To"
                            value={s.audit_alert_emails?.to || []}
                            onChange={v => setS('audit_alert_emails', { ...s.audit_alert_emails, to: v })}
                        />
                        <EmailList
                            label="CC"
                            value={s.audit_alert_emails?.cc || []}
                            onChange={v => setS('audit_alert_emails', { ...s.audit_alert_emails, cc: v })}
                        />
                        <FormControl size="small" sx={{ maxWidth: 250 }}>
                            <InputLabel>Notify for</InputLabel>
                            <Select
                                label="Notify for"
                                value={s.audit_alert_actions || 'both'}
                                onChange={e => setS('audit_alert_actions', e.target.value)}
                            >
                                <MenuItem value="both">All audit actions</MenuItem>
                                <MenuItem value="additions">Additions only</MenuItem>
                                <MenuItem value="reductions">Reductions only</MenuItem>
                            </Select>
                        </FormControl>
                    </Box>
                </Section>
            )}

            {/* Admin-only sections */}
            {isAdmin && (
                <>
                    {/* Scheduled Inventory Reports */}
                    <Section
                        icon={<AssessmentIcon />}
                        title="Scheduled Inventory Reports"
                        description="Automated inventory reports sent on a recurring schedule."
                        badge="Admin"
                    >
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <TextField
                                size="small"
                                label="Report subject line"
                                value={s.report_title || ''}
                                onChange={e => setS('report_title', e.target.value)}
                                sx={{ maxWidth: 400 }}
                            />
                            <EmailList
                                label="To"
                                value={s.report_emails?.to || []}
                                onChange={v => setS('report_emails', { ...s.report_emails, to: v })}
                            />
                            <EmailList
                                label="CC"
                                value={s.report_emails?.cc || []}
                                onChange={v => setS('report_emails', { ...s.report_emails, cc: v })}
                            />
                            <Box>
                                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>Report schedule</Typography>
                                <SchedulePicker
                                    value={s.report_schedule || { frequency: 'daily', time: '08:00' }}
                                    onChange={v => setS('report_schedule', v)}
                                />
                            </Box>
                        </Box>
                    </Section>

                    {/* Shift Reports */}
                    <Section
                        icon={<ScheduleIcon />}
                        title="Shift Close Reports"
                        description="Email reports sent when a shift is closed or on a digest schedule."
                        badge="Admin"
                    >
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={s.shift_report_enabled === 'true'}
                                    onChange={e => setS('shift_report_enabled', e.target.checked ? 'true' : 'false')}
                                />
                            }
                            label="Enable shift reports"
                            sx={{ mb: 2 }}
                        />
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, opacity: s.shift_report_enabled === 'true' ? 1 : 0.5 }}>
                            <TextField
                                size="small"
                                label="Report subject line"
                                value={s.shift_report_title || ''}
                                onChange={e => setS('shift_report_title', e.target.value)}
                                sx={{ maxWidth: 400 }}
                            />
                            <EmailList
                                label="To"
                                value={s.shift_report_emails?.to || []}
                                onChange={v => setS('shift_report_emails', { ...s.shift_report_emails, to: v })}
                            />
                            <EmailList
                                label="CC"
                                value={s.shift_report_emails?.cc || []}
                                onChange={v => setS('shift_report_emails', { ...s.shift_report_emails, cc: v })}
                            />
                            <Box>
                                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>Send frequency</Typography>
                                <SchedulePicker
                                    value={s.shift_report_schedule || { frequency: 'per_shift', time: '00:00' }}
                                    onChange={v => setS('shift_report_schedule', v)}
                                    includePerShift
                                />
                            </Box>
                        </Box>
                    </Section>

                    {/* Smart Order / AI Ordering */}
                    <Section
                        icon={<AutoGraphIcon />}
                        title="Smart Order Alerts"
                        description="AI-generated order proposals when inventory falls critically low."
                        badge="Admin"
                    >
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={!!s.ai_ordering_enabled}
                                        onChange={e => setS('ai_ordering_enabled', e.target.checked)}
                                    />
                                }
                                label="Enable smart order alerts"
                            />
                            <TextField
                                size="small"
                                label="Recipient email"
                                type="email"
                                value={s.ai_ordering_email || ''}
                                onChange={e => setS('ai_ordering_email', e.target.value)}
                                disabled={!s.ai_ordering_enabled}
                                sx={{ maxWidth: 340 }}
                                helperText="Smart order proposals will be emailed here for review"
                            />
                        </Box>
                    </Section>

                    {/* Order Confirmations */}
                    <Section
                        icon={<ShoppingCartIcon />}
                        title="Order Received Confirmations"
                        description="Notify these users when a purchase order is marked as received."
                        badge="Admin"
                    >
                        <Box>
                            {(s.order_confirmation_recipients || []).length > 0 ? (
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                                    {s.order_confirmation_recipients.map((u: any) => (
                                        <Chip
                                            key={u.id}
                                            label={`${u.first_name} ${u.last_name} <${u.email}>`}
                                            size="small"
                                        />
                                    ))}
                                </Box>
                            ) : (
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                    No recipients configured. Set these in Settings → Ordering.
                                </Typography>
                            )}
                            <Typography variant="caption" color="text.secondary">
                                To add or remove recipients, go to{' '}
                                <a href="/admin/settings/ordering" style={{ color: 'inherit' }}>Settings → Ordering</a>.
                            </Typography>
                        </Box>
                    </Section>
                </>
            )}

            {/* Save button */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3, pb: 4 }}>
                <Button
                    variant="contained"
                    startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                    onClick={handleSave}
                    disabled={saving}
                    size="large"
                >
                    {saving ? 'Saving…' : 'Save Changes'}
                </Button>
            </Box>
        </Box>
    );
}
