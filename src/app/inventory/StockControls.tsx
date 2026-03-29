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

    return (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'flex-end', width: '100%', alignItems: 'center' }}>
            {options.sort((a, b) => a - b).map((amt) => (
                <Box key={amt} sx={{ display: 'flex', alignItems: 'center', bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', px: 1, fontWeight: 'bold' }}>{amt}</Typography>
                    <IconButton size="small" color="error" disabled={!canSubtractStock} onClick={() => onAdjust(item.id, -amt)} sx={{ borderRadius: 0, borderLeft: '1px solid', borderColor: 'divider', p: 0.5 }}>
                        <RemoveIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="success" disabled={!canAddStock} onClick={() => onAdjust(item.id, amt)} sx={{ borderRadius: 0, borderLeft: '1px solid', borderColor: 'divider', p: 0.5 }}>
                        <AddIcon fontSize="small" />
                    </IconButton>
                </Box>
            ))}

            {allowCustom && (
                <Box sx={{ display: 'flex', alignItems: 'center', borderLeft: '1px solid', borderColor: 'divider', pl: 1 }}>
                    <TextField
                        type="number"
                        size="small"
                        placeholder="#"
                        value={customAmount}
                        onChange={(e) => setCustomAmount(e.target.value)}
                        inputProps={{ min: '0.01', step: 'any' }}
                        sx={{ width: 70, mr: 1, '& .MuiInputBase-root': { height: 32 } }}
                    />
                    <Box sx={{ display: 'flex', bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
                        <IconButton size="small" color="error" disabled={!canSubtractStock || !customAmount} onClick={() => { const val = parseFloat(customAmount); if (val > 0) onAdjust(item.id, -val); }} sx={{ borderRadius: 0, p: 0.5 }}>
                            <RemoveIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" color="success" disabled={!canAddStock || !customAmount} onClick={() => { const val = parseFloat(customAmount); if (val > 0) onAdjust(item.id, val); }} sx={{ borderRadius: 0, borderLeft: '1px solid', borderColor: 'divider', p: 0.5 }}>
                            <AddIcon fontSize="small" />
                        </IconButton>
                    </Box>
                </Box>
            )}
        </Box>
    );
}
