'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import NotificationBell from '@/components/NotificationBell';
import StockControls from './StockControls';
import BarcodeScanner from '@/components/BarcodeScanner';

// MUI Imports
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Card from '@mui/material/Card';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Grid from '@mui/material/Grid';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import AddIcon from '@mui/icons-material/Add';
import ClearIcon from '@mui/icons-material/Clear';
import SearchIcon from '@mui/icons-material/Search';
import Tooltip from '@mui/material/Tooltip';
import Chip from '@mui/material/Chip';
import InputAdornment from '@mui/material/InputAdornment';

// TopNav for header
import TopNav from '@/components/TopNav';

interface Item {
    id: number;
    name: string;
    type: string;
    secondary_type?: string;
    quantity: number;
    unit_cost: number;
    stock_options?: number[] | string;
}

interface ActivityLog {
    id: number;
    action: string;
    details: string;
    timestamp: string;
}

interface UserSession {
    firstName: string;
    role: string;
    permissions: string[];
    iat?: number;
}

interface InventoryClientProps {
    user: UserSession;
    trackBottleLevels: boolean;
    bottleOptions: any[];
}

export default function InventoryClient({ user, trackBottleLevels: initialTrack, bottleOptions: initialOptions }: InventoryClientProps) {
    const [items, setItems] = useState<Item[]>([]);
    const [myActivity, setMyActivity] = useState<ActivityLog[]>([]);
    const [sort, setSort] = useState<'usage' | 'name'>('usage');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    // Filters
    const [search, setSearch] = useState('');
    const [filterType, setFilterType] = useState('All');
    const [secondaryFilter, setSecondaryFilter] = useState('');

    const [showModal, setShowModal] = useState(false);
    const [showActivityModal, setShowActivityModal] = useState(false);

    // Bottle Level Logic
    const [trackBottleLevels, setTrackBottleLevels] = useState(initialTrack);
    const [bottleOptions, setBottleOptions] = useState<any[]>(initialOptions);
    const [bottleModal, setBottleModal] = useState<{ show: boolean, itemId: number, amount: number, item?: Item } | null>(null);

    // New Item Inline State
    const [newItemName, setNewItemName] = useState('');
    const [newItemType, setNewItemType] = useState('Liquor');
    const [newItemSecondary, setNewItemSecondary] = useState('');
    const [newItemSupplier, setNewItemSupplier] = useState('');
    const [newItemCost, setNewItemCost] = useState('');
    const [newItemQty, setNewItemQty] = useState('');
    const [newItemTrackQty, setNewItemTrackQty] = useState(true);

    const [newItemCustomOrderSizes, setNewItemCustomOrderSizes] = useState('');
    const [newItemStockOptionsMode, setNewItemStockOptionsMode] = useState<'category' | 'custom'>('category');
    const [newItemCustomStockOptions, setNewItemCustomStockOptions] = useState('');

    const [categories, setCategories] = useState<any[]>([]); // Full Category objects
    const [suppliers, setSuppliers] = useState<{ id: number, name: string }[]>([]);
    const [allowCustomIncrement, setAllowCustomIncrement] = useState(false);
    const [loading, setLoading] = useState(false);

    // Pending Orders Check-In State (legacy)
    const [pendingOrders, setPendingOrders] = useState<any[]>([]);
    const [showPendingModal, setShowPendingModal] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<any>(null);
    const [checkInQuantities, setCheckInQuantities] = useState<Record<number, number>>({});
    const [checkingIn, setCheckingIn] = useState(false);

    // Incoming orders banner
    const [incomingOrders, setIncomingOrders] = useState<any[]>([]);
    const [showIncomingDetail, setShowIncomingDetail] = useState(false);
    const [incomingDetailItems, setIncomingDetailItems] = useState<any[]>([]);
    const [incomingDetailOrder, setIncomingDetailOrder] = useState<any>(null);

    // Cost Edit State
    const [editingItem, setEditingItem] = useState<Item | null>(null);
    const [editCost, setEditCost] = useState('');
    const [pack6Cost, setPack6Cost] = useState('');
    const [pack24Cost, setPack24Cost] = useState('');
    const [lastBasis, setLastBasis] = useState<'unit' | '6' | '24'>('unit');

    const router = useRouter();

    const canAddStock = user.role === 'admin' || user.permissions.includes('add_stock') || user.permissions.includes('all');
    const canSubtractStock = user.role === 'admin' || user.permissions.includes('subtract_stock') || user.permissions.includes('all');
    const canAddItem = user.role === 'admin' || user.permissions.includes('add_item_name') || user.permissions.includes('all');

    // Barcode scan state
    const [scanMode, setScanMode] = useState<'add' | 'subtract' | null>(null);
    const [scanResult, setScanResult] = useState<{ barcode: string; item_id?: number; name?: string } | null>(null);
    const [scanError, setScanError] = useState('');
    const [scanAmount, setScanAmount] = useState(1);

    // Site DB enrichment notification — shown non-blocking after a scan hit
    const [siteDbNotice, setSiteDbNotice] = useState<{
        item_id: number;
        item_name: string;
        info: { brand: string | null; name: string; size: string | null; abv: number | null; type: string | null; secondary_type: string | null };
    } | null>(null);
    const [applyingInfo, setApplyingInfo] = useState(false);

    // Pending changes — accumulated until user submits
    // Map of itemId -> { netChange, itemName, originalQty }
    const [pendingChanges, setPendingChanges] = useState<Record<number, { netChange: number; itemName: string; originalQty: number }>>({});
    const [showSubmitModal, setShowSubmitModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const fetchItems = async () => {
        try {
            const res = await fetch(`/api/inventory?sort=${sort}`);
            const data = await res.json();
            if (res.ok) {
                let sorted = data.items;
                if (sort === 'name') {
                    sorted.sort((a: Item, b: Item) => sortDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));
                } else {
                    sorted.sort((a: any, b: any) => sortDir === 'asc' ? a.usage_count - b.usage_count : b.usage_count - a.usage_count);
                }
                setItems(sorted);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const fetchActivity = async () => {
        try {
            const res = await fetch('/api/user/activity');
            if (res.ok) {
                const data = await res.json();
                setMyActivity(data.logs);
            }
        } catch { }
    };

    useEffect(() => {
        fetchItems();
        fetchActivity();
        fetchCat();
        fetchIncomingOrders();
    }, [sort, sortDir]);

    const fetchIncomingOrders = async () => {
        try {
            const res = await fetch('/api/inventory/pending-orders');
            if (res.ok) {
                const data = await res.json();
                setIncomingOrders(data.orders || []);
            }
        } catch { }
    };

    const openIncomingDetail = async (order: any) => {
        setIncomingDetailOrder(order);
        setShowIncomingDetail(true);
        try {
            const res = await fetch(`/api/admin/orders/${order.id}`);
            if (res.ok) {
                const data = await res.json();
                setIncomingDetailItems(data.items || []);
            }
        } catch { }
    };

    const fetchCat = async () => {
        try {
            const [catRes, suppRes] = await Promise.all([
                fetch('/api/categories'),
                fetch('/api/admin/suppliers')
            ]);

            const catData = await catRes.json();
            const suppData = await suppRes.json();

            if (catData.categories) setCategories(catData.categories);
            if (suppData.suppliers) setSuppliers(suppData.suppliers);

            const settingsRes = await fetch('/api/admin/settings');
            const settingsData = await settingsRes.json();
            if (settingsData.settings?.allow_custom_increment === 'true') {
                setAllowCustomIncrement(true);
            }
        } catch { }
    };

    const toggleSort = (field: 'usage' | 'name') => {
        if (sort === field) {
            setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSort(field);
            setSortDir(field === 'name' ? 'asc' : 'desc');
        }
    };

    const handleAdjust = (itemId: number, change: number, bottleLevel?: string) => {
        // Intercept for Bottle Level Tracking
        if (change < 0 && trackBottleLevels && !bottleLevel) {
            const item = items.find(i => i.id === itemId);
            if (item && (item.type === 'Liquor' || item.type === 'Wine')) {
                setBottleModal({ show: true, itemId, amount: change, item });
                return;
            }
        }

        const item = items.find(i => i.id === itemId);
        if (!item) return;

        // Optimistic UI update
        setItems(prev => prev.map(i => i.id === itemId ? { ...i, quantity: Math.max(0, Number(i.quantity) + change) } : i));

        // Accumulate into pending changes (preserve original qty on first touch)
        setPendingChanges(prev => {
            const existing = prev[itemId];
            return {
                ...prev,
                [itemId]: {
                    netChange: (existing?.netChange ?? 0) + change,
                    itemName: item.name,
                    originalQty: existing?.originalQty ?? Number(item.quantity),
                },
            };
        });
    };

    const submitChanges = async () => {
        const entries = Object.entries(pendingChanges).filter(([, v]) => v.netChange !== 0);
        if (entries.length === 0) { setShowSubmitModal(false); return; }
        setSubmitting(true);
        try {
            await Promise.all(entries.map(([idStr, { netChange }]) =>
                fetch('/api/inventory/adjust', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ itemId: parseInt(idStr), change: netChange }),
                })
            ));
            setPendingChanges({});
            setShowSubmitModal(false);
            fetchItems();
            fetchActivity();
        } catch {
            alert('Some changes failed to save. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const cancelAllChanges = () => {
        // Roll back optimistic qty updates to originals
        setItems(prev => prev.map(i => {
            const p = pendingChanges[i.id];
            return p ? { ...i, quantity: p.originalQty } : i;
        }));
        setPendingChanges({});
        setShowSubmitModal(false);
    };

    const handleCreateItem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newItemName) return;
        setLoading(true);
        try {
            // 1. Create the item
            const res = await fetch('/api/inventory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newItemName,
                    type: newItemType,
                    secondary_type: newItemSecondary || undefined,
                    supplier: newItemSupplier || undefined,
                    track_quantity: newItemTrackQty ? 1 : 0,
                    order_size: newItemCustomOrderSizes ? newItemCustomOrderSizes.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n)) : undefined,
                    stock_options: newItemStockOptionsMode === 'custom' && newItemCustomStockOptions ? newItemCustomStockOptions.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n)) : null
                })
            });

            if (res.ok) {
                const data = await res.json();

                // 2. If Cost or Qty provided, update immediately
                if (newItemCost || newItemQty) {
                    await fetch('/api/inventory', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id: data.id,
                            unit_cost: newItemCost ? parseFloat(newItemCost) : 0,
                            quantity: newItemQty ? parseInt(newItemQty) : 0
                        })
                    });
                }

                setShowModal(false);
                // Reset form
                setNewItemName('');
                setNewItemSecondary('');
                setNewItemSupplier('');
                setNewItemCost('');
                setNewItemQty('');
                setNewItemTrackQty(true);
                setNewItemCustomOrderSizes('');
                setNewItemStockOptionsMode('category');
                setNewItemCustomStockOptions('');

                fetchItems();
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to create item');
            }
        } catch (e) {
            console.error(e);
            alert('Error creating item');
        } finally {
            setLoading(false);
        }
    };

    const openPendingOrders = async () => {
        try {
            const res = await fetch('/api/inventory/pending');
            if (res.ok) {
                const data = await res.json();
                setPendingOrders(data.orders || []);
            }
        } catch (e) { console.error(e); }
        setShowPendingModal(true);
        setSelectedOrder(null);
    };

    const selectOrderForCheckIn = (order: any) => {
        setSelectedOrder(order);
        const initialQty: Record<number, number> = {};
        if (order.items) {
            order.items.forEach((item: any) => {
                initialQty[item.item_id] = item.expected_qty;
            });
        }
        setCheckInQuantities(initialQty);
    };

    const submitCheckIn = async () => {
        if (!selectedOrder) return;
        setCheckingIn(true);
        try {
            const payload = {
                order_id: selectedOrder.id,
                check_in_items: selectedOrder.items.map((i: any) => ({
                    item_id: i.item_id,
                    expected_qty: i.expected_qty,
                    received_qty: checkInQuantities[i.item_id] || 0
                }))
            };

            const res = await fetch('/api/inventory/check-in', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                alert('Order checked-in successfully! Variances logged.');
                setShowPendingModal(false);
                setSelectedOrder(null);
                fetchItems();
                fetchActivity();
            } else {
                alert('Failed to check in order.');
            }
        } catch (e) {
            console.error(e);
            alert('Communication Error');
        } finally {
            setCheckingIn(false);
        }
    };

    const openCostModal = (item: Item) => {
        setEditingItem(item);
        const c = item.unit_cost || 0;
        setEditCost(c.toString());
        setPack6Cost((c * 6).toFixed(2));
        setPack24Cost((c * 24).toFixed(2));
    };

    const handleCostChange = (val: string, source: 'unit' | '6' | '24') => {
        if (source === 'unit') {
            setEditCost(val);
            const v = parseFloat(val);
            if (!isNaN(v)) {
                setPack6Cost((v * 6).toFixed(2));
                setPack24Cost((v * 24).toFixed(2));
            }
        } else if (source === '6') {
            setPack6Cost(val);
            const v = parseFloat(val);
            if (!isNaN(v)) {
                const unit = v / 6;
                setEditCost(unit.toFixed(4));
                setPack24Cost((unit * 24).toFixed(2));
            }
        } else if (source === '24') {
            setPack24Cost(val);
            const v = parseFloat(val);
            if (!isNaN(v)) {
                const unit = v / 24;
                setEditCost(unit.toFixed(4));
                setPack6Cost((unit * 6).toFixed(2));
            }
        }
    };

    const saveCost = async () => {
        if (!editingItem) return;
        const cost = parseFloat(editCost);
        if (isNaN(cost)) return;

        await fetch('/api/inventory', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: editingItem.id, unit_cost: cost })
        });
        setEditingItem(null);
        fetchItems();
    };

    const handleLogout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.push('/');
        router.refresh();
    };

    const clearFilters = () => {
        setSearch('');
        setFilterType('All');
        setSecondaryFilter('');
    };

    const handleBarcodeDetected = async (barcode: string) => {
        setScanResult(null);
        setScanError('');
        setScanAmount(1);
        setSiteDbNotice(null);
        // Look up barcode
        try {
            const res = await fetch(`/api/barcode-lookup?barcode=${encodeURIComponent(barcode)}`);
            const data = await res.json();
            // Stash site DB enrichment for later (keyed to item once resolved)
            const pendingSiteInfo = data.site_db_info ?? null;
            if (data.found && data.item_id) {
                // Matched a local inventory item directly
                setScanResult({ barcode, item_id: data.item_id, name: data.name, _siteDbInfo: pendingSiteInfo } as any);
            } else if (data.found && data.name) {
                // External lookup found a product name — try fuzzy match against local inventory
                const exact = items.find(i => i.name.toLowerCase() === data.name.toLowerCase());
                const fuzzy = !exact && items.find(i =>
                    i.name.toLowerCase().includes(data.name.toLowerCase().split(' ')[0]) ||
                    data.name.toLowerCase().includes(i.name.toLowerCase().split(' ')[0])
                );
                const match = exact || fuzzy;
                if (match) {
                    setScanResult({ barcode, item_id: match.id, name: match.name });
                } else {
                    setScanResult({ barcode });
                    setScanError(`Found "${data.name}" via web lookup — not in your inventory. Search by name or add it first.`);
                }
            } else {
                setScanResult({ barcode });
                // Build a clear message about what was checked
                const checked = [];
                if (data.checked_local) checked.push('local inventory');
                if (data.checked_external) checked.push('external database');
                const checkedMsg = checked.length ? ` (checked: ${checked.join(' + ')})` : '';
                if (!data.checked_external && data.external_available) {
                    setScanError(`Barcode ${barcode} not found locally. External lookup is available — enable it in Super Admin → Bottle Lookup.`);
                } else {
                    setScanError(`Barcode ${barcode} not found${checkedMsg}.`);
                }
            }
        } catch {
            setScanResult({ barcode });
            setScanError('Lookup failed. Check network.');
        }
    };

    const applyScanAdjust = () => {
        if (!scanResult?.item_id || !scanMode) return;
        const change = scanMode === 'add' ? scanAmount : -scanAmount;
        handleAdjust(scanResult.item_id, change);
        // Show site DB info notice if available
        const siteInfo = (scanResult as any)._siteDbInfo;
        if (siteInfo) {
            setSiteDbNotice({ item_id: scanResult.item_id, item_name: scanResult.name ?? '', info: siteInfo });
        }
        setScanMode(null);
        setScanResult(null);
        setScanError('');
    };

    const applyItemInfoFromSiteDb = async () => {
        if (!siteDbNotice) return;
        setApplyingInfo(true);
        try {
            await fetch('/api/inventory', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: siteDbNotice.item_id,
                    ...(siteDbNotice.info.type ? { type: siteDbNotice.info.type } : {}),
                    ...(siteDbNotice.info.secondary_type ? { secondary_type: siteDbNotice.info.secondary_type } : {}),
                    ...(siteDbNotice.info.abv != null ? { abv: siteDbNotice.info.abv } : {}),
                    ...(siteDbNotice.info.size ? { bottle_size: siteDbNotice.info.size } : {}),
                }),
            });
            fetchItems();
            setSiteDbNotice(null);
        } finally {
            setApplyingInfo(false);
        }
    };

    // Filter Logic
    const filteredItems = items.filter(item => {
        const matchesType = filterType === 'All' || item.type === filterType;
        const matchesSecondary = !secondaryFilter || item.secondary_type === secondaryFilter;
        const matchesSearch = !search || item.name.toLowerCase().includes(search.toLowerCase());
        return matchesType && matchesSecondary && matchesSearch;
    });

    // Get current category subcats
    const currentCat = categories.find(c => c.name === filterType);
    const subCats = currentCat?.sub_categories || [];

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
            <TopNav user={user}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <NotificationBell />
                    {canAddItem && (
                        <Button
                            variant="contained"
                            color="primary"
                            startIcon={<AddIcon />}
                            onClick={() => setShowModal(true)}
                            size="small"
                        >
                            Add Item
                        </Button>
                    )}
                    {canAddStock && (
                        <Button
                            variant="contained"
                            color="success"
                            onClick={openPendingOrders}
                            size="small"
                        >
                            Check In Order
                        </Button>
                    )}
                    {canAddStock && (
                        <Button
                            variant="contained"
                            size="small"
                            sx={{ background: '#0891b2', '&:hover': { background: '#0e7490' } }}
                            onClick={() => { setScanMode('add'); setScanResult(null); setScanError(''); }}
                        >
                            Scan to Add
                        </Button>
                    )}
                    {canSubtractStock && (
                        <Button
                            variant="contained"
                            size="small"
                            sx={{ background: '#7c3aed', '&:hover': { background: '#6d28d9' } }}
                            onClick={() => { setScanMode('subtract'); setScanResult(null); setScanError(''); }}
                        >
                            Scan to Subtract
                        </Button>
                    )}
                    {canSubtractStock && (
                        <Button
                            variant="outlined"
                            color="warning"
                            onClick={() => router.push('/inventory/close-shift')}
                            size="small"
                        >
                            Close Shift
                        </Button>
                    )}
                    <Button
                        variant="outlined"
                        onClick={() => { fetchActivity(); setShowActivityModal(true); }}
                        size="small"
                    >
                        Activity
                    </Button>
                    {Object.keys(pendingChanges).length > 0 && (
                        <Button
                            variant="contained"
                            size="small"
                            onClick={() => setShowSubmitModal(true)}
                            sx={{ background: '#f59e0b', color: '#000', fontWeight: 700, '&:hover': { background: '#d97706' } }}
                        >
                            Submit Changes ({Object.keys(pendingChanges).length})
                        </Button>
                    )}
                    <Button variant="text" color="error" onClick={handleLogout} size="small">
                        Logout
                    </Button>
                </Box>
            </TopNav>

            <Container maxWidth="xl" sx={{ pb: 6 }}>

                {/* Incoming Orders Banner */}
                {incomingOrders.length > 0 && (
                    <Box sx={{
                        mb: 3,
                        p: 1.5,
                        borderRadius: 2,
                        background: 'linear-gradient(90deg, rgba(59,130,246,0.15) 0%, rgba(16,185,129,0.1) 100%)',
                        border: '1px solid rgba(59,130,246,0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 1
                    }}>
                        <Typography variant="body2" sx={{ color: '#93c5fd', fontWeight: 600 }}>
                            📦 {incomingOrders.length} incoming order{incomingOrders.length > 1 ? 's' : ''} pending
                            {incomingOrders[0]?.supplier_name ? ` from ${incomingOrders[0].supplier_name}` : ''}
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            {incomingOrders.map((o: any) => (
                                <Button
                                    key={o.id}
                                    size="small"
                                    variant="outlined"
                                    sx={{ borderColor: 'rgba(59,130,246,0.5)', color: '#93c5fd', fontSize: '0.75rem' }}
                                    onClick={() => {
                                        if (canAddStock) {
                                            window.location.href = '/admin/orders/tracking';
                                        } else {
                                            openIncomingDetail(o);
                                        }
                                    }}
                                >
                                    {canAddStock ? `Receive Order #${o.id}` : `View Order #${o.id}`}
                                </Button>
                            ))}
                        </Box>
                    </Box>
                )}

                {/* Pending Changes Banner */}
                {Object.keys(pendingChanges).length > 0 && (
                    <Box sx={{
                        mb: 2,
                        p: 1.5,
                        borderRadius: 2,
                        background: 'linear-gradient(90deg, rgba(245,158,11,0.15) 0%, rgba(245,158,11,0.05) 100%)',
                        border: '1px solid rgba(245,158,11,0.4)',
                    }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                            <Typography variant="body2" sx={{ color: '#fbbf24', fontWeight: 700 }}>
                                ⏳ {Object.keys(pendingChanges).length} pending change{Object.keys(pendingChanges).length > 1 ? 's' : ''} — not yet submitted
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                                <Button size="small" variant="contained" onClick={() => setShowSubmitModal(true)}
                                    sx={{ background: '#f59e0b', color: '#000', fontWeight: 700, fontSize: '0.75rem', py: 0.5, '&:hover': { background: '#d97706' } }}>
                                    Submit
                                </Button>
                                <Button size="small" variant="outlined" onClick={cancelAllChanges}
                                    sx={{ borderColor: 'rgba(245,158,11,0.4)', color: '#fbbf24', fontSize: '0.75rem', py: 0.5 }}>
                                    Cancel All
                                </Button>
                            </Box>
                        </Box>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.75 }}>
                            {Object.entries(pendingChanges).map(([idStr, { itemName, netChange }]) => (
                                <Box key={idStr} sx={{
                                    background: 'rgba(245,158,11,0.12)',
                                    border: '1px solid rgba(245,158,11,0.3)',
                                    borderRadius: '6px',
                                    px: 1, py: 0.25,
                                    display: 'flex', alignItems: 'center', gap: 0.5,
                                }}>
                                    <Typography variant="caption" sx={{ color: '#e5e7eb', fontWeight: 500 }}>{itemName}</Typography>
                                    <Typography variant="caption" sx={{ color: netChange > 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                                        {netChange > 0 ? `+${netChange}` : netChange}
                                    </Typography>
                                </Box>
                            ))}
                        </Box>
                    </Box>
                )}

                {/* Header Welcome Title */}
                <Box sx={{ mb: 4 }}>
                    <Typography variant="h4" fontWeight="bold" color="primary">{user.firstName}</Typography>
                    <Typography variant="subtitle1" color="text.secondary">Welcome to Foster's Stock</Typography>
                </Box>

                {/* Filters and Controls */}
                <Box sx={{ mb: 3 }}>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(0, 2fr)' }, gap: 2, alignItems: 'center' }}>
                        <Box>
                            <TextField
                                fullWidth
                                placeholder="Search inventory..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                size="small"
                                InputProps={{
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            {search ? (
                                                <IconButton size="small" onClick={() => setSearch('')}><ClearIcon /></IconButton>
                                            ) : (
                                                <SearchIcon color="action" />
                                            )}
                                        </InputAdornment>
                                    ),
                                }}
                            />
                        </Box>
                        <Box>
                            <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 1 }}>
                                {['All', ...categories.map(c => c.name)].map((type: string) => (
                                    <Chip
                                        key={type}
                                        label={type}
                                        onClick={() => { setFilterType(type); setSecondaryFilter(''); }}
                                        color={filterType === type ? "primary" : "default"}
                                        variant={filterType === type ? "filled" : "outlined"}
                                        sx={{ minWidth: 60, flexShrink: 0 }}
                                    />
                                ))}
                            </Box>
                        </Box>
                    </Box>

                    {subCats.length > 0 && (
                        <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', mt: 1, pb: 1 }}>
                            {subCats.map((sub: string) => (
                                <Chip
                                    key={sub}
                                    label={sub}
                                    onClick={() => setSecondaryFilter(sub === secondaryFilter ? '' : sub)}
                                    color={secondaryFilter === sub ? "secondary" : "default"}
                                    variant={secondaryFilter === sub ? "filled" : "outlined"}
                                    size="small"
                                    sx={{ flexShrink: 0 }}
                                />
                            ))}
                        </Box>
                    )}

                    <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
                        <Button
                            variant={sort === 'usage' ? 'contained' : 'outlined'}
                            color={sort === 'usage' ? 'primary' : 'inherit'}
                            onClick={() => toggleSort('usage')}
                            size="small"
                        >
                            Most Used {sort === 'usage' && (sortDir === 'asc' ? '▲' : '▼')}
                        </Button>
                        <Button
                            variant={sort === 'name' ? 'contained' : 'outlined'}
                            color={sort === 'name' ? 'primary' : 'inherit'}
                            onClick={() => toggleSort('name')}
                            size="small"
                        >
                            A-Z {sort === 'name' && (sortDir === 'asc' ? '▲' : '▼')}
                        </Button>
                    </Box>
                </Box>

                {/* Item List */}
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 2 }}>
                    {filteredItems.map(item => (
                        <Box key={item.id}>
                            <Card sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between', transition: '0.2s', '&:hover': { borderColor: 'primary.main' } }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                                    <Box>
                                        <Typography variant="h6" fontWeight="bold">{item.name}</Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            {item.type}
                                            {item.secondary_type && ` • ${item.secondary_type}`}
                                            {canAddItem && (
                                                <Tooltip title={`Unit Cost: $${item.unit_cost || 0}`}>
                                                    <IconButton size="small" onClick={() => openCostModal(item)} sx={{ ml: 1, p: 0.5 }}>
                                                        <Typography variant="caption">💲</Typography>
                                                    </IconButton>
                                                </Tooltip>
                                            )}
                                        </Typography>
                                    </Box>
                                    <Typography variant="h4" fontWeight="bold" color="text.primary">
                                        {Number(item.quantity).toFixed(2).replace(/\.00$/, '')}
                                    </Typography>
                                </Box>

                                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                                    {(() => {
                                        let options: number[] = [];
                                        // Try item-level stock_options first
                                        let itemOpts = item.stock_options;
                                        if (typeof itemOpts === 'string') { try { itemOpts = JSON.parse(itemOpts); } catch { } }
                                        if (Array.isArray(itemOpts) && itemOpts.length > 0) {
                                            options = itemOpts.map((p: any) => parseInt(p)).filter((n: number) => !isNaN(n));
                                        }
                                        // Fall back to category stock_options
                                        if (options.length === 0) {
                                            const cat = categories.find(c => c.name === item.type);
                                            if (cat && cat.stock_options) {
                                                let catOpts = cat.stock_options;
                                                if (typeof catOpts === 'string') { try { catOpts = JSON.parse(catOpts); } catch { } }
                                                if (Array.isArray(catOpts) && catOpts.length > 0) {
                                                    options = catOpts.map((p: any) => parseInt(p)).filter((n: number) => !isNaN(n));
                                                }
                                            }
                                        }
                                        if (options.length === 0) options = [1];
                                        
                                        return (
                                            <StockControls
                                                item={item}
                                                options={options}
                                                canAddStock={canAddStock}
                                                canSubtractStock={canSubtractStock}
                                                allowCustom={allowCustomIncrement}
                                                onAdjust={handleAdjust}
                                            />
                                        );
                                    })()}
                                </Box>
                            </Card>
                        </Box>
                    ))}
                    {filteredItems.length === 0 && (
                        <Box sx={{ gridColumn: '1 / -1' }}>
                            <Box sx={{ textAlign: 'center', p: 4 }}>
                                <Typography variant="body1" color="text.secondary">No items found match your filters.</Typography>
                            </Box>
                        </Box>
                    )}
                </Box>

            </Container>

            {/* Modals Transformed to Dialogs */}
            <Dialog open={!!editingItem} onClose={() => setEditingItem(null)} maxWidth="sm" fullWidth>
                <DialogTitle>Set Cost: {editingItem?.name}</DialogTitle>
                <DialogContent dividers>
                    <Typography variant="body2" color="text.secondary" gutterBottom>Pricing Basis (Click to select input mode):</Typography>
                    <RadioGroup row value={lastBasis} onChange={(e) => setLastBasis(e.target.value as any)} sx={{ mb: 2 }}>
                        <FormControlLabel value="unit" control={<Radio color="primary" />} label="Unit (Bottle/Can)" />
                        <FormControlLabel value="6" control={<Radio color="primary" />} label="6-Pack" />
                        <FormControlLabel value="24" control={<Radio color="primary" />} label="24-Pack" />
                    </RadioGroup>

                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                        <Box sx={{ gridColumn: '1 / -1' }}>
                            <TextField
                                fullWidth
                                label="Unit Cost ($)"
                                type="number"
                                value={editCost}
                                onChange={(e) => { setLastBasis('unit'); handleCostChange(e.target.value, 'unit'); }}
                                disabled={lastBasis !== 'unit'}
                            />
                        </Box>
                        <Box>
                            <TextField
                                fullWidth
                                label="6-Pack Price"
                                type="number"
                                value={pack6Cost}
                                onChange={(e) => { setLastBasis('6'); handleCostChange(e.target.value, '6'); }}
                                disabled={lastBasis !== '6'}
                            />
                        </Box>
                        <Box>
                            <TextField
                                fullWidth
                                label="24-Pack Price"
                                type="number"
                                value={pack24Cost}
                                onChange={(e) => { setLastBasis('24'); handleCostChange(e.target.value, '24'); }}
                                disabled={lastBasis !== '24'}
                            />
                        </Box>
                    </Box>
                    
                    <Typography variant="body2" color="primary" sx={{ mt: 2 }}>
                        {lastBasis === 'unit' && `Saving Unit Cost: $${editCost}`}
                        {lastBasis === '6' && `Saving Unit Cost: $${editCost} (Derived from 6-Pack: $${pack6Cost})`}
                        {lastBasis === '24' && `Saving Unit Cost: $${editCost} (Derived from 24-Pack: $${pack24Cost})`}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEditingItem(null)}>Cancel</Button>
                    <Button variant="contained" onClick={saveCost}>Save Cost</Button>
                </DialogActions>
            </Dialog>

            <Dialog open={showModal} onClose={() => setShowModal(false)} maxWidth="sm" fullWidth>
                <form onSubmit={handleCreateItem}>
                    <DialogTitle>Add New Item</DialogTitle>
                    <DialogContent dividers>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
                            <TextField
                                fullWidth
                                label="Name"
                                value={newItemName}
                                onChange={e => setNewItemName(e.target.value)}
                                required
                                autoFocus
                            />
                            <FormControl fullWidth>
                                <InputLabel>Type</InputLabel>
                                <Select value={newItemType} label="Type" onChange={e => setNewItemType(e.target.value)}>
                                    {categories.map(c => <MenuItem key={c.id} value={c.name}>{c.name}</MenuItem>)}
                                </Select>
                            </FormControl>

                            {(() => {
                                const cat = categories.find(c => c.name === newItemType);
                                if (cat && cat.sub_categories && cat.sub_categories.length > 0) {
                                    return (
                                        <FormControl fullWidth>
                                            <InputLabel>Sub-Category</InputLabel>
                                            <Select value={newItemSecondary} label="Sub-Category" onChange={e => setNewItemSecondary(e.target.value)}>
                                                <MenuItem value=""><em>(None)</em></MenuItem>
                                                {cat.sub_categories.map((sub: string) => <MenuItem key={sub} value={sub}>{sub}</MenuItem>)}
                                            </Select>
                                        </FormControl>
                                    );
                                }
                                return null;
                            })()}

                            <FormControl fullWidth>
                                {suppliers.length > 0 ? (
                                    <>
                                        <InputLabel>Supplier (Optional)</InputLabel>
                                        <Select value={newItemSupplier} label="Supplier (Optional)" onChange={e => setNewItemSupplier(e.target.value)}>
                                            <MenuItem value=""><em>None</em></MenuItem>
                                            {suppliers.map(s => <MenuItem key={s.id} value={s.name}>{s.name}</MenuItem>)}
                                        </Select>
                                    </>
                                ) : (
                                    <TextField
                                        label="Supplier (Optional)"
                                        value={newItemSupplier}
                                        onChange={e => setNewItemSupplier(e.target.value)}
                                        placeholder="e.g. Acme Distributors"
                                    />
                                )}
                            </FormControl>

                            <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
                                <Box sx={{ flex: 1 }}>
                                    <TextField
                                        fullWidth
                                        label="Cost ($)"
                                        type="number"
                                        value={newItemCost}
                                        onChange={e => setNewItemCost(e.target.value)}
                                        inputProps={{ step: "0.01" }}
                                    />
                                </Box>
                                <Box sx={{ flex: 1 }}>
                                    {(() => {
                                        const cat = categories.find(c => c.name === newItemType);
                                        let options = [1];
                                        if (cat && cat.stock_options) {
                                            let parsed = cat.stock_options;
                                            if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch { } }
                                            if (Array.isArray(parsed) && parsed.length > 0) {
                                                options = parsed.map((p: any) => parseInt(p)).filter((n: number) => !isNaN(n));
                                            }
                                        }
                                        return (
                                            <TextField
                                                fullWidth
                                                label="Initial Qty"
                                                type="number"
                                                inputProps={{ min: 0, max: 24000, step: "any" }}
                                                value={newItemQty}
                                                onChange={e => setNewItemQty(e.target.value)}
                                            />
                                        );
                                    })()}
                                </Box>
                            </Box>

                            <Box sx={{ mt: 1, borderTop: '1px solid', borderColor: 'divider', pt: 2 }}>
                                <Typography variant="subtitle2" fontWeight="bold" gutterBottom>Override Stock Logic</Typography>
                                
                                <TextField
                                    fullWidth
                                    label="Order Qty Matrix (Optional, comma separated e.g. '1, 6, 24')"
                                    value={newItemCustomOrderSizes}
                                    onChange={e => setNewItemCustomOrderSizes(e.target.value)}
                                    sx={{ mb: 2 }}
                                    placeholder="Leave blank for platform default"
                                />

                                <FormControl component="fieldset" fullWidth sx={{ mb: 1 }}>
                                    <Typography variant="body2" color="text.secondary">Stock Subtraction Quantities</Typography>
                                    <RadioGroup
                                        row
                                        value={newItemStockOptionsMode}
                                        onChange={e => setNewItemStockOptionsMode(e.target.value as any)}
                                    >
                                        <FormControlLabel value="category" control={<Radio size="small" />} label="Inherit Database Category Settings" />
                                        <FormControlLabel value="custom" control={<Radio size="small" />} label="Custom Item Override" />
                                    </RadioGroup>
                                </FormControl>
                                
                                {newItemStockOptionsMode === 'custom' && (
                                    <TextField
                                        fullWidth
                                        label="Custom Stock Qty Subtractions (Comma separated e.g. '1, 0.5')"
                                        value={newItemCustomStockOptions}
                                        onChange={e => setNewItemCustomStockOptions(e.target.value)}
                                    />
                                )}
                            </Box>
                        </Box>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setShowModal(false)} disabled={loading}>Cancel</Button>
                        <Button type="submit" variant="contained" disabled={loading}>
                            {loading ? '...' : 'Create Item'}
                        </Button>
                    </DialogActions>
                </form>
            </Dialog>

            <Dialog open={showActivityModal} onClose={() => setShowActivityModal(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Session Activity</DialogTitle>
                <DialogContent dividers>
                    {myActivity.filter(log => !user.iat || new Date(log.timestamp).getTime() > user.iat * 1000).length === 0 ? (
                        <Typography variant="body2" color="text.secondary" align="center">No activity in this session.</Typography>
                    ) : (
                        <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
                            {(() => {
                                const aggregated: Record<string, number> = {};
                                myActivity
                                    .filter(log => !user.iat || new Date(log.timestamp).getTime() > user.iat * 1000)
                                    .forEach(log => {
                                        let details: any = {};
                                        try { details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details; } catch { return; }
                                        if (log.action === 'ADD_STOCK' || log.action === 'SUBTRACT_STOCK') {
                                            const name = details.itemName || 'Unknown Item';
                                            const qty = Number(details.quantity || Math.abs(details.change || 0));
                                            if (!aggregated[name]) aggregated[name] = 0;
                                            if (log.action === 'ADD_STOCK') aggregated[name] += qty;
                                            else aggregated[name] -= qty;
                                        }
                                    });

                                const items = Object.entries(aggregated);
                                if (items.length === 0) return <Typography variant="body2" color="text.secondary" align="center">No stock changes in this session.</Typography>;

                                return items.map(([name, netChange], idx) => (
                                    <Box component="li" key={idx} sx={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid', borderColor: 'divider', py: 1 }}>
                                        <Typography variant="body1" fontWeight="bold">{name}</Typography>
                                        <Typography variant="body1" fontWeight="bold" color={netChange > 0 ? 'success.main' : netChange < 0 ? 'error.main' : 'text.secondary'}>
                                            {netChange > 0 ? '+' : ''}{netChange}
                                        </Typography>
                                    </Box>
                                ));
                            })()}
                        </Box>
                    )}
                </DialogContent>
                <DialogActions sx={{ flexDirection: 'column', gap: 1 }}>
                    <Button
                        variant="contained"
                        fullWidth
                        onClick={() => {
                            if (user.role === 'admin') router.push('/admin/dashboard');
                            else setShowActivityModal(false);
                        }}
                    >
                        {user.role === 'admin' ? 'Return to Dashboard' : 'Keep Working'}
                    </Button>
                    <Button
                        variant="outlined"
                        color="error"
                        fullWidth
                        onClick={handleLogout}
                    >
                        Logout
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={bottleModal !== null && bottleModal.show} onClose={() => setBottleModal(null)} maxWidth="xs" fullWidth>
                <DialogTitle>Existing Bottle Level?</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Replacing <strong>{bottleModal?.item?.name}</strong>. How much was left?
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Button
                            variant="contained"
                            color="success"
                            onClick={() => {
                                if (bottleModal) {
                                    handleAdjust(bottleModal.itemId, bottleModal.amount, 'Standard Replacement');
                                    setBottleModal(null);
                                }
                            }}
                        >
                            Standard Replacement
                        </Button>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>Previous Shift / Partial:</Typography>
                        {bottleOptions.map(opt => (
                            <Button
                                key={opt.id}
                                variant="outlined"
                                onClick={() => {
                                    if (bottleModal) {
                                        handleAdjust(bottleModal.itemId, bottleModal.amount, opt.label);
                                        setBottleModal(null);
                                    }
                                }}
                            >
                                {opt.label}
                            </Button>
                        ))}
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setBottleModal(null)}>Cancel</Button>
                </DialogActions>
            </Dialog>

            {/* PENDING ORDERS MODAL */}
            <Dialog open={showPendingModal} onClose={() => setShowPendingModal(false)} maxWidth="md" fullWidth>
                <DialogTitle>{selectedOrder ? `Checking In Order #${selectedOrder.id}` : 'Pending Supplier Purchase Orders'}</DialogTitle>
                <DialogContent dividers>
                    {!selectedOrder ? (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {pendingOrders.length === 0 ? (
                                <Typography color="text.secondary">No pending orders waiting for stock.</Typography>
                            ) : (
                                pendingOrders.map((o) => (
                                    <Card key={o.id} sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Box>
                                            <Typography variant="h6">Order #{o.id}</Typography>
                                            <Typography variant="body2" color="text.secondary">Supplier: {o.supplier_name || 'Multiple'}</Typography>
                                            <Typography variant="body2" color="text.secondary">Expected: {new Date(o.expected_delivery_date).toLocaleDateString()}</Typography>
                                        </Box>
                                        <Button variant="contained" onClick={() => selectOrderForCheckIn(o)}>Start Check-In</Button>
                                    </Card>
                                ))
                            )}
                        </Box>
                    ) : (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <Typography variant="body2" color="error.main" sx={{ mb: 1 }}>
                                Adjust quantities downward if items were missing. Any difference will be logged as variance.
                            </Typography>
                            {selectedOrder.items?.map((item: any) => {
                                const qty = checkInQuantities[item.item_id] || 0;
                                return (
                                    <Box key={item.item_id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider', pb: 1 }}>
                                        <Box>
                                            <Typography variant="subtitle1" fontWeight="bold">{item.name}</Typography>
                                            <Typography variant="body2" color="text.secondary">Expected: {item.expected_qty}</Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                            <IconButton size="small" onClick={() => setCheckInQuantities(p => ({...p, [item.item_id]: Math.max(0, qty - 1)}))}>
                                                <ClearIcon fontSize="small" />
                                            </IconButton>
                                            <Typography variant="h6" color={qty < item.expected_qty ? 'error.main' : 'success.main'}>{qty}</Typography>
                                            <IconButton size="small" onClick={() => setCheckInQuantities(p => ({...p, [item.item_id]: qty + 1}))}>
                                                <AddIcon fontSize="small" />
                                            </IconButton>
                                        </Box>
                                    </Box>
                                );
                            })}
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    {selectedOrder ? (
                        <>
                            <Button onClick={() => setSelectedOrder(null)} disabled={checkingIn}>Back</Button>
                            <Button variant="contained" color="success" onClick={submitCheckIn} disabled={checkingIn}>
                                {checkingIn ? 'Processing...' : 'Confirm Delivery & Update Stock'}
                            </Button>
                        </>
                    ) : (
                        <Button onClick={() => setShowPendingModal(false)}>Close</Button>
                    )}
                </DialogActions>
            </Dialog>

            {/* View-Only Incoming Order Detail Modal (non add_stock users) */}
            <Dialog open={showIncomingDetail} onClose={() => setShowIncomingDetail(false)} maxWidth="sm" fullWidth>
                <DialogTitle>
                    Incoming Order {incomingDetailOrder ? `#${incomingDetailOrder.id}` : ''}
                    {incomingDetailOrder?.supplier_name && ` — ${incomingDetailOrder.supplier_name}`}
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        This order is pending receipt. Contact your admin to process it.
                    </Typography>
                    {incomingDetailItems.length === 0 ? (
                        <Typography color="text.secondary">Loading items...</Typography>
                    ) : (
                        <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }}>
                            <Box component="thead">
                                <Box component="tr" sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
                                    <Box component="th" sx={{ textAlign: 'left', p: 1, color: 'text.secondary', fontSize: '0.8rem' }}>Item</Box>
                                    <Box component="th" sx={{ textAlign: 'center', p: 1, color: 'text.secondary', fontSize: '0.8rem' }}>Expected Qty</Box>
                                </Box>
                            </Box>
                            <Box component="tbody">
                                {incomingDetailItems.map((item: any) => (
                                    <Box component="tr" key={item.id} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
                                        <Box component="td" sx={{ p: 1 }}>{item.item_name}</Box>
                                        <Box component="td" sx={{ p: 1, textAlign: 'center', fontWeight: 700 }}>{item.quantity}</Box>
                                    </Box>
                                ))}
                            </Box>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setShowIncomingDetail(false)}>Close</Button>
                </DialogActions>
            </Dialog>

            {/* Barcode Scanner — Scan to Add */}
            <BarcodeScanner
                open={scanMode === 'add'}
                title="Scan to Add Stock"
                onClose={() => { setScanMode(null); setScanResult(null); setScanError(''); }}
                onDetected={handleBarcodeDetected}
            />

            {/* Barcode Scanner — Scan to Subtract */}
            <BarcodeScanner
                open={scanMode === 'subtract'}
                title="Scan to Subtract Stock"
                onClose={() => { setScanMode(null); setScanResult(null); setScanError(''); }}
                onDetected={handleBarcodeDetected}
            />

            {/* Scan Result / Confirm Dialog */}
            <Dialog
                open={!!scanResult}
                onClose={() => { setScanResult(null); setScanError(''); setScanMode(null); }}
                maxWidth="xs"
                fullWidth
                PaperProps={{ style: { background: '#111827', color: 'white' } }}
            >
                <DialogTitle style={{ borderBottom: '1px solid #374151' }}>
                    {scanMode === 'add' ? 'Add Stock' : 'Subtract Stock'}
                </DialogTitle>
                <DialogContent style={{ padding: '1.25rem' }}>
                    {scanError ? (
                        <Box sx={{ textAlign: 'center', color: '#ef4444', py: 1 }}>
                            <Typography variant="body2">{scanError}</Typography>
                            <Typography variant="caption" sx={{ color: '#6b7280', display: 'block', mt: 0.5 }}>
                                Barcode: {scanResult?.barcode}
                            </Typography>
                        </Box>
                    ) : scanResult?.item_id ? (
                        <Box>
                            <Typography sx={{ color: '#d1d5db', mb: 0.5, fontSize: '0.85rem' }}>Item found:</Typography>
                            <Typography sx={{ color: 'white', fontWeight: 700, fontSize: '1.1rem', mb: 1.5 }}>{scanResult.name}</Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Button size="small" variant="outlined" sx={{ minWidth: 32, p: '2px 8px' }}
                                    onClick={() => setScanAmount(a => Math.max(1, a - 1))}>−</Button>
                                <Typography sx={{ mx: 1, fontSize: '1.25rem', fontWeight: 700, minWidth: '2rem', textAlign: 'center' }}>{scanAmount}</Typography>
                                <Button size="small" variant="outlined" sx={{ minWidth: 32, p: '2px 8px' }}
                                    onClick={() => setScanAmount(a => a + 1)}>+</Button>
                                <Typography sx={{ color: '#9ca3af', ml: 1, fontSize: '0.85rem' }}>
                                    {scanMode === 'add' ? 'to add' : 'to subtract'}
                                </Typography>
                            </Box>
                        </Box>
                    ) : null}
                </DialogContent>
                <DialogActions style={{ borderTop: '1px solid #374151', padding: '0.75rem 1rem' }}>
                    <Button onClick={() => { setScanResult(null); setScanError(''); setScanMode(null); }}
                        style={{ color: '#9ca3af' }}>Cancel</Button>
                    {!scanError && scanResult?.item_id && (
                        <Button variant="contained" onClick={applyScanAdjust}
                            style={{ background: scanMode === 'add' ? '#0891b2' : '#7c3aed' }}>
                            Confirm {scanMode === 'add' ? 'Add' : 'Subtract'}
                        </Button>
                    )}
                    {(scanError || !scanResult?.item_id) && (
                        <Button variant="outlined" onClick={() => { setScanResult(null); setScanError(''); }}
                            style={{ borderColor: '#4b5563', color: '#d1d5db' }}>
                            Scan Again
                        </Button>
                    )}
                </DialogActions>
            </Dialog>

            {/* Submit Changes Confirmation Modal */}
            <Dialog open={showSubmitModal} onClose={() => setShowSubmitModal(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
                    Submit Stock Changes
                </DialogTitle>
                <DialogContent dividers>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Review the changes below before submitting. Once submitted, these will be recorded in the inventory log.
                    </Typography>
                    <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }}>
                        <Box component="thead">
                            <Box component="tr" sx={{ borderBottom: '2px solid', borderColor: 'divider' }}>
                                <Box component="th" sx={{ textAlign: 'left', pb: 1, color: 'text.secondary', fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', pr: 2 }}>Item</Box>
                                <Box component="th" sx={{ textAlign: 'center', pb: 1, color: 'text.secondary', fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', px: 2 }}>From</Box>
                                <Box component="th" sx={{ textAlign: 'center', pb: 1, color: 'text.secondary', fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', px: 2 }}>Change</Box>
                                <Box component="th" sx={{ textAlign: 'center', pb: 1, color: 'text.secondary', fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', pl: 2 }}>To</Box>
                            </Box>
                        </Box>
                        <Box component="tbody">
                            {Object.entries(pendingChanges).filter(([, v]) => v.netChange !== 0).map(([idStr, { itemName, netChange, originalQty }]) => (
                                <Box component="tr" key={idStr} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
                                    <Box component="td" sx={{ py: 1.25, pr: 2 }}>
                                        <Typography variant="body2" fontWeight={600}>{itemName}</Typography>
                                    </Box>
                                    <Box component="td" sx={{ py: 1.25, textAlign: 'center', px: 2 }}>
                                        <Typography variant="body2" color="text.secondary">{originalQty}</Typography>
                                    </Box>
                                    <Box component="td" sx={{ py: 1.25, textAlign: 'center', px: 2 }}>
                                        <Typography variant="body2" fontWeight={700} color={netChange > 0 ? 'success.main' : 'error.main'}>
                                            {netChange > 0 ? `+${netChange}` : netChange}
                                        </Typography>
                                    </Box>
                                    <Box component="td" sx={{ py: 1.25, textAlign: 'center', pl: 2 }}>
                                        <Typography variant="body2" fontWeight={700}>
                                            {Math.max(0, originalQty + netChange)}
                                        </Typography>
                                    </Box>
                                </Box>
                            ))}
                        </Box>
                    </Box>
                </DialogContent>
                <DialogActions sx={{ gap: 1, px: 2, py: 1.5 }}>
                    <Button
                        variant="outlined"
                        color="error"
                        onClick={cancelAllChanges}
                        disabled={submitting}
                    >
                        Cancel All Changes
                    </Button>
                    <Button
                        variant="outlined"
                        onClick={() => setShowSubmitModal(false)}
                        disabled={submitting}
                    >
                        Keep Without Submitting
                    </Button>
                    <Button
                        variant="contained"
                        color="success"
                        onClick={submitChanges}
                        disabled={submitting}
                    >
                        {submitting ? 'Submitting…' : 'Yes, Submit'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Site DB Enrichment Notification */}
            <Dialog
                open={!!siteDbNotice}
                onClose={() => setSiteDbNotice(null)}
                maxWidth="xs"
                fullWidth
                PaperProps={{ style: { background: '#111827', color: 'white', border: '1px solid #1d4ed8' } }}
            >
                <DialogTitle style={{ borderBottom: '1px solid #374151', fontSize: '1rem', paddingBottom: '0.75rem' }}>
                    Product Info Available
                </DialogTitle>
                <DialogContent style={{ padding: '1.25rem' }}>
                    <Typography variant="body2" sx={{ color: '#93c5fd', mb: 1.5, fontSize: '0.8rem' }}>
                        This barcode was found in the Bottle Lookup Database. You can optionally apply the info below to <strong style={{ color: 'white' }}>{siteDbNotice?.item_name}</strong>.
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                        {siteDbNotice?.info.brand && (
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="caption" sx={{ color: '#6b7280' }}>Brand</Typography>
                                <Typography variant="caption" sx={{ color: '#d1d5db', fontWeight: 600 }}>{siteDbNotice.info.brand}</Typography>
                            </Box>
                        )}
                        {siteDbNotice?.info.name && (
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="caption" sx={{ color: '#6b7280' }}>Name</Typography>
                                <Typography variant="caption" sx={{ color: '#d1d5db', fontWeight: 600 }}>{siteDbNotice.info.name}</Typography>
                            </Box>
                        )}
                        {siteDbNotice?.info.size && (
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="caption" sx={{ color: '#6b7280' }}>Size</Typography>
                                <Typography variant="caption" sx={{ color: '#d1d5db', fontWeight: 600 }}>{siteDbNotice.info.size}</Typography>
                            </Box>
                        )}
                        {siteDbNotice?.info.abv != null && (
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="caption" sx={{ color: '#6b7280' }}>ABV</Typography>
                                <Typography variant="caption" sx={{ color: '#d1d5db', fontWeight: 600 }}>{siteDbNotice.info.abv}%</Typography>
                            </Box>
                        )}
                        {siteDbNotice?.info.type && (
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="caption" sx={{ color: '#6b7280' }}>Type</Typography>
                                <Typography variant="caption" sx={{ color: '#d1d5db', fontWeight: 600 }}>
                                    {siteDbNotice.info.type}{siteDbNotice.info.secondary_type ? ` / ${siteDbNotice.info.secondary_type}` : ''}
                                </Typography>
                            </Box>
                        )}
                    </Box>
                </DialogContent>
                <DialogActions style={{ borderTop: '1px solid #374151', padding: '0.75rem 1rem' }}>
                    <Button onClick={() => setSiteDbNotice(null)} style={{ color: '#9ca3af' }}>
                        Dismiss
                    </Button>
                    <Button
                        variant="contained"
                        disabled={applyingInfo}
                        onClick={applyItemInfoFromSiteDb}
                        style={{ background: '#1d4ed8' }}
                    >
                        {applyingInfo ? 'Applying…' : 'Apply to Item'}
                    </Button>
                </DialogActions>
            </Dialog>

        </Box>
    );
}
