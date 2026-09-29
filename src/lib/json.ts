/**
 * Reads a JSON / JSONB database column.
 *
 * node-postgres already parses JSONB columns into objects, but some columns
 * (or older databases) hold the same data as a JSON string. Calling
 * JSON.parse on an object throws, so always go through this helper.
 * Returns `fallback` for null, empty or malformed values.
 */
export function parseJsonColumn<T>(value: unknown, fallback: T): T {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value !== 'string') return value as T;
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}
