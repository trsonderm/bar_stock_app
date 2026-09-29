/**
 * Stores user-uploaded files (support ticket attachments, branding logos)
 * under public/uploads and returns their public URL.
 *
 * Only an allow-list of image / PDF extensions is accepted: files in public/
 * are served from the app's own origin, so accepting e.g. .html or .svg would
 * allow stored cross-site scripting.
 */
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf']);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Saves `file` with a random name and returns its URL path (e.g. /uploads/<uuid>.png).
 * Throws if the extension is not allowed or the file is too large.
 */
export async function saveFile(file: File): Promise<string> {
    const ext = (path.extname(file.name) || '.jpg').toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
        throw new Error(`File type ${ext} is not allowed`);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
        throw new Error('File is too large');
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = `${randomUUID()}${ext}`;
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');

    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, filename), buffer);

    return `/uploads/${filename}`;
}
