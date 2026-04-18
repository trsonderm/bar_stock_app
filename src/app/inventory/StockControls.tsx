import { useState } from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';

interface StockControlsProps {
    item: any;
    options: number[];
    canAddStock: boolean;
    canSubtractStock: boolean;
    allowCustom: boolean;
    onAdjust: (id: number, amount: number) => void;
}

export default function StockControls({ item, options, canAddStock, canSubtractStock, allowCustom, onAdjust }: StockControlsProps) {
    const [customAmount, setCustomAmount] = useState<string>('');
    const [useOrderUnit, setUseOrderUnit] = useState(false);

    // Order unit info from item (order_unit_size=units per case, order_unit_label=e.g. "case")
    const orderUnitSize: number = item.order_unit_size && Number(item.order_unit_size) > 1 ? Number(item.order_unit_size) : 0;
    const orderUnitLabel: string = item.order_unit_label || 'case';

    // If order_unit_size not set, also try first entry of order_size JSON array
    let effectiveOrderQty = orderUnitSize;
    if (!effectiveOrderQty) {
        let orderSizeArr = item.order_size;
        if (typeof orderSizeArr === 'string') { try { orderSizeArr = JSON.parse(orderSizeArr); } catch { } }
        if (Array.isArray(orderSizeArr) && orderSizeArr.length > 0) {
            const first = Number(orderSizeArr[0]);
            if (first > 1) effectiveOrderQty = first;
        }
    }

    const hasOrderUnit = effectiveOrderQty > 1;

    const resolvedAmount = (): number => {
        const raw = parseFloat(customAmount);
        if (isNaN(raw) || raw <= 0) return 0;
        return useOrderUnit && hasOrderUnit ? raw * effectiveOrderQty : raw;
    };

    const unitPreview = useOrderUnit && hasOrderUnit && customAmount
        ? (() => {
            const raw = parseFloat(customAmount);
            if (!isNaN(raw) && raw > 0) return `= ${raw * effectiveOrderQty} units`;
            return null;
        })()
        : null;

    return (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, justifyContent: 'flex-end', width: '100%', alignItems: 'center' }}>
            {options.sort((a, b) => a - b).map((amt) => (
                <Box key={amt} sx={{ display: 'flex', alignItems: 'center', bgcolor: 'background.paper', borderRadius: 1.5, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary', px: 1.5, fontWeight: 'bold', fontSize: '0.9rem' }}>{amt}</Typography>
                    <IconButton
                        disabled={!canSubtractStock}
                        onClick={() => onAdjust(item.id, -amt)}
                        sx={{ borderRadius: 0, borderLeft: '1px solid', borderColor: 'divider', p: 1.25, color: 'error.main', '&:hover': { bgcolor: 'rgba(239,68,68,0.12)' } }}
                    >
                        <RemoveIcon />
                    </IconButton>
                    <IconButton
                        disabled={!canAddStock}
                        onClick={() => onAdjust(item.id, amt)}
                        sx={{ borderRadius: 0, borderLeft: '1px solid', borderColor: 'divider', p: 1.25, color: 'success.main', '&:hover': { bgcolor: 'rgba(16,185,129,0.12)' } }}
                    >
                        <AddIcon />
                    </IconButton>
                </Box>
            ))}

            {allowCustom && (
                <Box sx={{ display: 'flex', alignItems: 'center', borderLeft: '1px solid', borderColor: 'divider', pl: 1.5, gap: 1 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        {/* Unit toggle — only shown when item has an order unit qty */}
                        {hasOrderUnit && (
                            <Box sx={{ display: 'flex', borderRadius: 1, overflow: 'hidden', border: '1px solid', borderColor: 'divider', height: 22 }}>
                                <Box
                                    component="button"
                                    onClick={() => setUseOrderUnit(false)}
                                    sx={{
                                        flex: 1, border: 'none', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 600, px: 1,
                                        bgcolor: !useOrderUnit ? 'primary.main' : 'background.paper',
                                        color: !useOrderUnit ? 'white' : 'text.secondary',
                                        '&:hover': { opacity: 0.85 },
                                    }}
                                >
                                    units
                                </Box>
                                <Box
                                    component="button"
                                    onClick={() => setUseOrderUnit(true)}
                                    sx={{
                                        flex: 1, border: 'none', borderLeft: '1px solid', borderColor: 'divider', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 600, px: 1,
                                        bgcolor: useOrderUnit ? 'primary.main' : 'background.paper',
                                        color: useOrderUnit ? 'white' : 'text.secondary',
                                        '&:hover': { opacity: 0.85 },
                                    }}
                                >
                                    {orderUnitLabel}
                                </Box>
                            </Box>
                        )}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <TextField
                                type="number"
                                size="small"
                                placeholder={useOrderUnit ? `# ${orderUnitLabel}` : '#'}
                                value={customAmount}
                                onChange={(e) => setCustomAmount(e.target.value)}
                                inputProps={{ min: '0.01', step: 'any' }}
                                sx={{ width: 80, '& .MuiInputBase-root': { height: 40 } }}
                            />
                            {unitPreview && (
                                <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap', fontSize: '0.7rem' }}>
                                    {unitPreview}
                                </Typography>
                            )}
                        </Box>
                    </Box>
                    <Box sx={{ display: 'flex', bgcolor: 'background.paper', borderRadius: 1.5, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
                        <IconButton
                            disabled={!canSubtractStock || !customAmount}
                            onClick={() => { const val = resolvedAmount(); if (val > 0) onAdjust(item.id, -val); }}
                            sx={{ borderRadius: 0, p: 1.25, color: 'error.main', '&:hover': { bgcolor: 'rgba(239,68,68,0.12)' } }}
                        >
                            <RemoveIcon />
                        </IconButton>
                        <IconButton
                            disabled={!canAddStock || !customAmount}
                            onClick={() => { const val = resolvedAmount(); if (val > 0) onAdjust(item.id, val); }}
                            sx={{ borderRadius: 0, borderLeft: '1px solid', borderColor: 'divider', p: 1.25, color: 'success.main', '&:hover': { bgcolor: 'rgba(16,185,129,0.12)' } }}
                        >
                            <AddIcon />
                        </IconButton>
                    </Box>
                </Box>
            )}
        </Box>
    );
}
