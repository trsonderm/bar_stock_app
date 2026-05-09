import { NextResponse } from 'next/server';
import crypto from 'crypto';

export const API_VERSION = 'v1';

function requestId() {
    return crypto.randomBytes(8).toString('hex');
}

function meta(extras?: Record<string, unknown>) {
    return { api_version: API_VERSION, request_id: requestId(), timestamp: new Date().toISOString(), ...extras };
}

export function apiOk<T>(data: T, extras?: Record<string, unknown>, status = 200) {
    return NextResponse.json({ data, meta: meta(extras) }, { status });
}

export function apiList<T>(
    data: T[],
    pagination: { total: number; limit: number; offset: number },
    status = 200,
) {
    return NextResponse.json({ data, meta: meta(pagination) }, { status });
}

export function apiError(
    code: string,
    message: string,
    status: number,
    details?: Record<string, unknown>,
) {
    return NextResponse.json(
        { error: { code, message, ...(details ? { details } : {}) }, meta: meta() },
        { status },
    );
}

export const Err = {
    unauthorized: () => apiError('UNAUTHORIZED', 'Valid Bearer API key required.', 401),
    forbidden: (scope: string) => apiError('FORBIDDEN', `API key missing required scope: ${scope}`, 403),
    notFound: (resource = 'Resource') => apiError('NOT_FOUND', `${resource} not found.`, 404),
    badRequest: (msg: string) => apiError('BAD_REQUEST', msg, 400),
    internal: (msg = 'Internal server error') => apiError('INTERNAL_ERROR', msg, 500),
};
