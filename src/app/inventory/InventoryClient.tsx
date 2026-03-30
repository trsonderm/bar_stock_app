'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import NotificationBell from '@/components/NotificationBell';
import StockControls from './StockControls';

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

    const [categories, setCategories] = useState<any[]>([]); // Full Category objects
    const [suppliers, setSuppliers] = useState<{ id: number, name: string }[]>([]);
    const [allowCustomIncrement, setAllowCustomIncrement] = useState(false);
    const [loading, setLoading] = useState(false);

    // Pending Orders Check-In State
    const [pendingOrders, setPendingOrders] = useState<any[]>([]);
    const [showPendingModal, setShowPendingModal] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<any>(null);
    const [checkInQuantities, setCheckInQuantities] = useState<Record<number, number>>({});
    const [checkingIn, setCheckingIn] = useState(false);

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
    }, [sort, sortDir]);

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

    const handleAdjust = async (itemId: number, change: number, bottleLevel?: string) => {
        // Intercept for Bottle Level Tracking
        if (change < 0 && trackBottleLevels && !bottleLevel) {
            const item = items.find(i => i.id === itemId);
            if (item && (item.type === 'Liquor' || item.type === 'Wine')) {
                setBottleModal({ show: true, itemId, amount: change, item });
                return;
            }
        }
        // Optimistic update
        setItems(prev => prev.map(i => i.id === itemId ? { ...i, quantity: Math.max(0, Number(i.quantity) + change) } : i));

        try {
            const res = await fetch('/api/inventory/adjust', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemId, change, bottleLevel })
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                fetchItems(); // Sync back
                alert(`Failed to update stock: ${errData.error || res.statusText}`);
            } else {
                fetchActivity();
            }
        } catch (e) {
            fetchItems();
        }
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
                    track_quantity: newItemTrackQty ? 1 : 0
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
                    <Button
                        variant="outlined"
                        onClick={() => { fetchActivity(); setShowActivityModal(true); }}
                        size="small"
                    >
                        Activity
                    </Button>
                    <Button variant="text" color="error" onClick={handleLogout} size="small">
                        Logout
                    </Button>
                </Box>
            </TopNav>

            <Container maxWidth="xl" sx={{ pb: 6 }}>
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
                                        let options = [1];
                                        if (item.stock_options) {
                                            let parsed = item.stock_options;
                                            if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch { } }
                                            if (Array.isArray(parsed) && parsed.length > 0) {
                                                options = parsed.map((p: any) => parseInt(p)).filter((n: number) => !isNaN(n));
                                            }
                                        } else {
                                            const cat = categories.find(c => c.name === item.type);
                                            if (cat && cat.stock_options) {
                                                let parsed = cat.stock_options;
                                                if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch { } }
                                                if (Array.isArray(parsed) && parsed.length > 0) {
                                                    options = parsed.map((p: any) => parseInt(p)).filter((n: number) => !isNaN(n));
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
                                            <FormControl fullWidth>
                                                <InputLabel>Initial Qty</InputLabel>
                                                <Select value={newItemQty} label="Initial Qty" onChange={e => setNewItemQty(e.target.value as string)}>
                                                    <MenuItem value="">0</MenuItem>
                                                    {options.sort((a, b) => a - b).map(opt => (
                                                        <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                                                    ))}
                                                </Select>
                                            </FormControl>
                                        );
                                    })()}
                                </Box>
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

        </Box>
    );
}
