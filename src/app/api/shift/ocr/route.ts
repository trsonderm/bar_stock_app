import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

function parseAmount(str: string): number | undefined {
    if (!str) return undefined;
    // Strip currency symbols, whitespace, commas
    const cleaned = str.replace(/[$,\s]/g, '').trim();
    const val = parseFloat(cleaned);
    if (isNaN(val) || val < 0) return undefined;
    return val;
}

function findAmount(lines: string[], patterns: RegExp[]): number | undefined {
    for (const line of lines) {
        for (const pattern of patterns) {
            const match = line.match(pattern);
            if (match) {
                const parsed = parseAmount(match[1] || match[2] || '');
                if (parsed !== undefined) return parsed;
            }
        }
    }
    return undefined;
}

function parseRegisterReceipt(text: string) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const rawLines = lines.slice(0, 30);

    // Normalize lines for matching
    const upper = lines.map(l => l.toUpperCase());

    const cashSales = findAmount(upper, [
        /CASH\s+SALES?\s*[:\-]?\s*\$?([\d,]+\.?\d*)/,
        /CASH\s*[:\-]\s*\$?([\d,]+\.?\d*)/,
        /^CASH\s+\$?([\d,]+\.?\d*)$/,
    ]);

    const cashTips = findAmount(upper, [
        /CASH\s+TIPS?\s*[:\-]?\s*\$?([\d,]+\.?\d*)/,
        /TIPS?\s+CASH\s*[:\-]?\s*\$?([\d,]+\.?\d*)/,
    ]);

    // CC sales: look for CREDIT, VISA, MC, MASTERCARD, AMEX, DISCOVER lines
    const ccSales = findAmount(upper, [
        /CREDIT\s+CARD\s+SALES?\s*[:\-]?\s*\$?([\d,]+\.?\d*)/,
        /CREDIT\s*[:\-]\s*\$?([\d,]+\.?\d*)/,
        /VISA\s*[:\-]\s*\$?([\d,]+\.?\d*)/,
        /MASTERCARD\s*[:\-]?\s*\$?([\d,]+\.?\d*)/,
        /MC\s*[:\-]\s*\$?([\d,]+\.?\d*)/,
        /AMEX\s*[:\-]\s*\$?([\d,]+\.?\d*)/,
        /DISCOVER\s*[:\-]\s*\$?([\d,]+\.?\d*)/,
        /CARD\s+SALES?\s*[:\-]?\s*\$?([\d,]+\.?\d*)/,
        /CC\s+SALES?\s*[:\-]?\s*\$?([\d,]+\.?\d*)/,
        /CHARGE\s*[:\-]\s*\$?([\d,]+\.?\d*)/,
    ]);

    const ccTips = findAmount(upper, [
        /CC\s+TIPS?\s*[:\-]?\s*\$?([\d,]+\.?\d*)/,
        /CREDIT\s+TIPS?\s*[:\-]?\s*\$?([\d,]+\.?\d*)/,
        /CARD\s+TIPS?\s*[:\-]?\s*\$?([\d,]+\.?\d*)/,
        /TIPS?\s+CREDIT\s*[:\-]?\s*\$?([\d,]+\.?\d*)/,
        /TIPS?\s+CARD\s*[:\-]?\s*\$?([\d,]+\.?\d*)/,
        /TIPS?\s*[:\-]\s*\$?([\d,]+\.?\d*)/,
    ]);

    return { cashSales, cashTips, ccSales, ccTips, rawLines };
}

function parseCcBatchReceipt(text: string) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const rawLines = lines.slice(0, 30);
    const upper = lines.map(l => l.toUpperCase());

    const ccSales = findAmount(upper, [
        /NET\s+SALES?\s*[:\-]?\s*\$?([\d,]+\.?\d*)/,
        /BATCH\s+TOTAL\s*[:\-]?\s*\$?([\d,]+\.?\d*)/,
        /BATCH\s+AMOUNT\s*[:\-]?\s*\$?([\d,]+\.?\d*)/,
        /SALES?\s+TOTAL\s*[:\-]?\s*\$?([\d,]+\.?\d*)/,
        /TOTAL\s+SALES?\s*[:\-]?\s*\$?([\d,]+\.?\d*)/,
        /GROSS\s+SALES?\s*[:\-]?\s*\$?([\d,]+\.?\d*)/,
        /SUBTOTAL\s*[:\-]?\s*\$?([\d,]+\.?\d*)/,
        /TOTAL\s*[:\-]\s*\$?([\d,]+\.?\d*)/,
    ]);

    const ccTips = findAmount(upper, [
        /TIPS?\s+TOTAL\s*[:\-]?\s*\$?([\d,]+\.?\d*)/,
        /TOTAL\s+TIPS?\s*[:\-]?\s*\$?([\d,]+\.?\d*)/,
        /TIPS?\s*[:\-]\s*\$?([\d,]+\.?\d*)/,
        /GRATUITY\s*[:\-]?\s*\$?([\d,]+\.?\d*)/,
    ]);

    // Transaction count
    let batchCount: number | undefined;
    for (const line of upper) {
        const m = line.match(/(?:TRANSACTIONS?|TXN|TRANS)\s*[:\-]?\s*(\d+)/);
        if (m) {
            batchCount = parseInt(m[1]);
            break;
        }
    }

    return { ccSales, ccTips, batchCount, rawLines };
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { text, receiptType } = body;

    if (!text || typeof text !== 'string') {
        return NextResponse.json({ error: 'text is required' }, { status: 400 });
    }

    if (receiptType === 'cc') {
        const result = parseCcBatchReceipt(text);
        return NextResponse.json(result);
    } else {
        const result = parseRegisterReceipt(text);
        return NextResponse.json(result);
    }
}
