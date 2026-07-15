// Server + client safe — jsPDF ships a dedicated Node.js bundle (jspdf.node.min.js)
// and an ES module bundle for the browser. Works in both contexts.

export interface PdfMediaItem {
    type: string;
    data: string;
    name: string;
}

export interface PdfPerson {
    first_name: string | null;
    last_name: string | null;
    aliases: string[];
    race: string | null;
    height: string | null;
    weight: string | null;
    hair_color: string | null;
    clothing_description: string | null;
    description: string | null;
    media: PdfMediaItem[];
}

export interface PdfTimeline {
    segment_date: string | null;
    segment_time: string | null;
    description: string;
}

export interface PdfIncident {
    id: number;
    incident_date: string | null;
    incident_time: string | null;
    case_number: string | null;
    office_name: string | null;
    reported_by_name: string | null;
    submitted_by_name: string;
    created_at: string;
    description: string | null;
    media: PdfMediaItem[];
    persons: PdfPerson[];
    timeline: PdfTimeline[];
}

function fmtDate(date: string | null, time: string | null): string {
    if (!date) return '';
    const dateOnly = date.split('T')[0];
    const d = new Date(dateOnly + (time ? `T${time}` : 'T12:00:00'));
    if (isNaN(d.getTime())) return '';
    const datePart = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const timePart = time ? ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
    return datePart + timePart;
}

function imgFmt(dataUri: string): string {
    if (dataUri.includes('image/png')) return 'PNG';
    if (dataUri.includes('image/gif')) return 'GIF';
    if (dataUri.includes('image/webp')) return 'WEBP';
    return 'JPEG';
}

export async function generateIncidentPdf(inc: PdfIncident): Promise<Uint8Array> {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ format: 'a4', unit: 'mm', orientation: 'portrait' });

    const ML = 20, MR = 20, MT = 20, MB = 20;
    const UW = 210 - ML - MR;   // 170 mm usable width
    const BOTTOM = 297 - MB;    // 277 mm
    let y = MT;

    function newPage() { doc.addPage(); y = MT; }
    function need(h: number) { if (y + h > BOTTOM) newPage(); }

    // ── Title ──────────────────────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(20, 20, 20);
    need(15);
    doc.text('INCIDENT REPORT', ML, y);
    y += 8;
    doc.setLineWidth(0.5);
    doc.setDrawColor(20, 20, 20);
    doc.line(ML, y, ML + UW, y);
    y += 8;

    // ── Meta block ─────────────────────────────────────────────────────────────
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    const dateStr = fmtDate(inc.incident_date, inc.incident_time);
    const meta: [string, string][] = [];
    if (dateStr) meta.push(['Date / Time:', dateStr]);
    if (inc.case_number) meta.push(['Case #:', inc.case_number]);
    if (inc.office_name) meta.push(['Reporting Office:', inc.office_name]);
    if (inc.reported_by_name) meta.push(['Reported By:', inc.reported_by_name]);
    meta.push(['Filed By:', inc.submitted_by_name || '']);
    meta.push(['Filed At:', new Date(inc.created_at).toLocaleString('en-US')]);

    for (const [label, val] of meta) {
        need(6);
        doc.setFont('helvetica', 'bold');
        doc.text(label, ML, y);
        doc.setFont('helvetica', 'normal');
        const wrapped = doc.splitTextToSize(val, UW - 52);
        doc.text(wrapped, ML + 52, y);
        y += Math.max(6, wrapped.length * 5);
    }
    y += 4;

    // ── Section header helper ──────────────────────────────────────────────────
    function sectionHead(title: string) {
        need(14);
        y += 2;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(110, 110, 110);
        doc.text(title.toUpperCase(), ML, y);
        y += 2.5;
        doc.setLineWidth(0.25);
        doc.setDrawColor(190, 190, 190);
        doc.line(ML, y, ML + UW, y);
        y += 5;
        doc.setTextColor(20, 20, 20);
        doc.setFontSize(10);
    }

    // ── Persons ────────────────────────────────────────────────────────────────
    if (inc.persons?.length) {
        sectionHead('Persons Involved');

        for (let pi = 0; pi < inc.persons.length; pi++) {
            const p = inc.persons[pi];
            need(12);
            const fullName = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown';

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.setTextColor(20, 20, 20);
            doc.text(`Person ${pi + 1}: ${fullName}`, ML, y);
            y += 6;

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);

            const attrs = [
                p.race && `Race: ${p.race}`,
                p.height && `Height: ${p.height}`,
                p.weight && `Weight: ${p.weight}`,
                p.hair_color && `Hair: ${p.hair_color}`,
            ].filter(Boolean).join('   ');
            if (attrs) {
                need(5);
                doc.setTextColor(90, 90, 90);
                const attrLines = doc.splitTextToSize(attrs, UW - 4);
                doc.text(attrLines, ML + 2, y);
                y += attrLines.length * 5;
                doc.setTextColor(20, 20, 20);
            }

            if (p.aliases?.length) {
                need(5);
                const lines = doc.splitTextToSize(`AKA: ${p.aliases.join(', ')}`, UW - 4);
                doc.text(lines, ML + 2, y);
                y += lines.length * 5;
            }

            if (p.clothing_description) {
                need(5);
                const lines = doc.splitTextToSize(`Clothing: ${p.clothing_description}`, UW - 4);
                doc.text(lines, ML + 2, y);
                y += lines.length * 5;
            }

            if (p.description) {
                need(5);
                const lines = doc.splitTextToSize(p.description, UW - 4);
                for (const line of lines) { need(5); doc.text(line, ML + 2, y); y += 5; }
            }

            const imgs = (p.media || []).filter(m => m.type === 'image');
            const vidCount = (p.media || []).filter(m => m.type === 'video').length;

            if (imgs.length > 0) {
                const IW = 38, IH = 32, GAP = 3;
                const perRow = Math.floor((UW - 2 + GAP) / (IW + GAP));
                for (let r = 0; r < Math.ceil(imgs.length / perRow); r++) {
                    need(IH + 4);
                    for (let c = 0; c < perRow; c++) {
                        const idx = r * perRow + c;
                        if (idx >= imgs.length) break;
                        try {
                            doc.addImage(imgs[idx].data, imgFmt(imgs[idx].data), ML + 2 + c * (IW + GAP), y, IW, IH);
                        } catch { /* skip unrenderable images */ }
                    }
                    y += IH + 4;
                }
            }

            if (vidCount) {
                need(5);
                doc.setFontSize(9);
                doc.setTextColor(130, 130, 130);
                doc.text(`(${vidCount} video file${vidCount !== 1 ? 's' : ''} included in ZIP)`, ML + 2, y);
                y += 5;
                doc.setFontSize(10);
                doc.setTextColor(20, 20, 20);
            }

            y += 5;
        }
    }

    // ── Timeline ───────────────────────────────────────────────────────────────
    if (inc.timeline?.length) {
        sectionHead('Incident Description');

        for (const t of inc.timeline) {
            const ts = [
                t.segment_date
                    ? new Date(t.segment_date.split('T')[0] + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : '',
                t.segment_time || '',
            ].filter(Boolean).join(' · ');

            if (ts) {
                need(5);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                doc.setTextColor(180, 100, 10);
                doc.text(ts, ML + 4, y);
                y += 5;
            }

            need(5);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(20, 20, 20);
            const lines = doc.splitTextToSize(t.description, UW - 4);
            for (const line of lines) { need(5); doc.text(line, ML + 4, y); y += 5; }
            y += 4;
        }
    } else if (inc.description) {
        sectionHead('Description');
        need(5);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(20, 20, 20);
        const lines = doc.splitTextToSize(inc.description, UW);
        for (const line of lines) { need(5); doc.text(line, ML, y); y += 5; }
    }

    // ── Incident-level media ───────────────────────────────────────────────────
    const incImgs = (inc.media || []).filter(m => m.type === 'image');
    const incVids = (inc.media || []).filter(m => m.type === 'video').length;

    if (incImgs.length > 0) {
        sectionHead('Incident Media');
        const IW = 45, IH = 36, GAP = 4;
        const perRow = Math.floor((UW + GAP) / (IW + GAP));
        for (let r = 0; r < Math.ceil(incImgs.length / perRow); r++) {
            need(IH + 4);
            for (let c = 0; c < perRow; c++) {
                const idx = r * perRow + c;
                if (idx >= incImgs.length) break;
                try {
                    doc.addImage(incImgs[idx].data, imgFmt(incImgs[idx].data), ML + c * (IW + GAP), y, IW, IH);
                } catch { /* skip */ }
            }
            y += IH + 4;
        }
    }

    if (incVids) {
        need(6);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(130, 130, 130);
        doc.text(`(${incVids} video file${incVids !== 1 ? 's' : ''} included in ZIP alongside this report)`, ML, y);
        y += 6;
    }

    // ── Footer ─────────────────────────────────────────────────────────────────
    need(14);
    y += 4;
    doc.setLineWidth(0.25);
    doc.setDrawColor(190, 190, 190);
    doc.line(ML, y, ML + UW, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
        `Generated: ${new Date().toLocaleString('en-US')}   ·   Incident ID: #${inc.id}`,
        ML, y
    );

    return new Uint8Array(doc.output('arraybuffer'));
}
