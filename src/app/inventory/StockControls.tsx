import { useState } from 'react';
import styles from './inventory.module.css';

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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'flex-end', width: '100%' }}>
            {options.sort((a, b) => a - b).map((amt) => (
                <div key={amt} className={styles.stockGroup}>
                    <span style={{ color: '#9ca3af', fontSize: '0.8rem', marginRight: '0.25rem' }}>{amt}:</span>
                    <button className={`${styles.stockBtn} ${styles.minusBtn}`} disabled={!canSubtractStock} onClick={() => onAdjust(item.id, -amt)}>-</button>
                    <button className={`${styles.stockBtn} ${styles.plusBtn}`} disabled={!canAddStock} onClick={() => onAdjust(item.id, amt)}>+</button>
                </div>
            ))}

            {allowCustom && (
                <div className={styles.stockGroup} style={{ borderLeft: '1px solid #374151', paddingLeft: '1rem' }}>
                    <input
                        type="number"
                        min="0.01"
                        step="any"
                        placeholder="#"
                        value={customAmount}
                        onChange={(e) => setCustomAmount(e.target.value)}
                        style={{ width: '60px', background: '#111827', border: '1px solid #374151', color: 'white', padding: '0.25rem', borderRadius: '0.25rem', marginRight: '0.5rem' }}
                    />
                    <button
                        className={`${styles.stockBtn} ${styles.minusBtn}`}
                        disabled={!canSubtractStock || !customAmount}
                        onClick={() => {
                            const val = parseFloat(customAmount);
                            if (val > 0) onAdjust(item.id, -val);
                        }}
                    >
                        -
                    </button>
                    <button
                        className={`${styles.stockBtn} ${styles.plusBtn}`}
                        disabled={!canAddStock || !customAmount}
                        onClick={() => {
                            const val = parseFloat(customAmount);
                            if (val > 0) onAdjust(item.id, val);
                        }}
                    >
                        +
                    </button>
                </div>
            )}
        </div>
    );
}
