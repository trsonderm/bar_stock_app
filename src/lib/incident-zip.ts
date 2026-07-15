// Pure zip builder — no browser or Node-specific APIs, safe on both sides.

const _crc32Table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        t[i] = c;
    }
    return t;
})();

export function crc32(data: Uint8Array): number {
    let crc = 0xFFFFFFFF;
    for (const b of data) crc = _crc32Table[(crc ^ b) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

export function buildZip(entries: { name: string; data: Uint8Array }[]): Uint8Array {
    const enc = new TextEncoder();
    const localParts: Uint8Array[] = [];
    const cdParts: Uint8Array[] = [];
    let offset = 0;

    for (const entry of entries) {
        const nameBytes = enc.encode(entry.name);
        const checksum = crc32(entry.data);
        const size = entry.data.length;

        const local = new Uint8Array(30 + nameBytes.length);
        const lv = new DataView(local.buffer);
        lv.setUint32(0, 0x04034B50, true);
        lv.setUint16(4, 20, true);
        lv.setUint32(14, checksum, true);
        lv.setUint32(18, size, true);
        lv.setUint32(22, size, true);
        lv.setUint16(26, nameBytes.length, true);
        local.set(nameBytes, 30);

        const cd = new Uint8Array(46 + nameBytes.length);
        const cv = new DataView(cd.buffer);
        cv.setUint32(0, 0x02014B50, true);
        cv.setUint16(4, 20, true);
        cv.setUint16(6, 20, true);
        cv.setUint32(16, checksum, true);
        cv.setUint32(20, size, true);
        cv.setUint32(24, size, true);
        cv.setUint16(28, nameBytes.length, true);
        cv.setUint32(42, offset, true);
        cd.set(nameBytes, 46);

        localParts.push(local, entry.data);
        cdParts.push(cd);
        offset += local.length + size;
    }

    const cdStart = offset;
    const cdSize = cdParts.reduce((s, b) => s + b.length, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054B50, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, cdStart, true);

    const all = [...localParts, ...cdParts, eocd];
    const total = all.reduce((s, b) => s + b.length, 0);
    const out = new Uint8Array(total);
    let pos = 0;
    for (const p of all) { out.set(p, pos); pos += p.length; }
    return out;
}

export function parseDataUri(uri: string): { bytes: Uint8Array; mime: string } | null {
    const m = uri.match(/^data:([^;]+);base64,([\s\S]+)$/);
    if (!m) return null;
    // Buffer.from works in Node; atob+loop works in both
    let bytes: Uint8Array;
    if (typeof Buffer !== 'undefined') {
        const buf = Buffer.from(m[2], 'base64');
        bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } else {
        const bin = atob(m[2]);
        bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    }
    return { mime: m[1], bytes };
}

export function mimeToExt(mime: string): string {
    return ({
        'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
        'image/gif': 'gif', 'image/webp': 'webp',
        'video/mp4': 'mp4', 'video/webm': 'webm',
        'video/quicktime': 'mov', 'video/x-msvideo': 'avi',
    } as Record<string, string>)[mime] || 'bin';
}
