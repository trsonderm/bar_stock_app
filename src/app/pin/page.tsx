import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { validateStationToken } from '@/lib/dba';
import StationPinPad from '@/components/StationPinPad';

export default async function PinPage({
    searchParams,
}: {
    searchParams: { orgId?: string };
}) {
    const orgId = Number(searchParams.orgId);

    const cookieStore = await cookies();
    const stationTokenValue = cookieStore.get('station_token')?.value;

    // Also check station_org_id cookie as a fallback for orgId
    const cookieOrgId = cookieStore.get('station_org_id')?.value;
    const resolvedOrgId = orgId || Number(cookieOrgId) || null;

    let validToken = false;
    let hasFingerprint = false;
    let orgName: string | undefined;

    if (stationTokenValue) {
        try {
            const row = await validateStationToken(stationTokenValue);
            if (row) {
                // If orgId specified, ensure the token belongs to that org
                if (!resolvedOrgId || Number(row.org_id) === resolvedOrgId) {
                    validToken = true;
                    hasFingerprint = !!row.fingerprint_hash;
                    orgName = row.org_name;

                    // If org has a subdomain, redirect to the canonical URL
                    if (row.subdomain) {
                        redirect(`/o/${row.subdomain}`);
                    }
                }
            }
        } catch {}
    }

    // If orgId given but no token — try to get org name for display
    if (!orgName && resolvedOrgId) {
        try {
            const org = await db.one('SELECT name FROM organizations WHERE id = $1', [resolvedOrgId]);
            if (org) orgName = org.name;
        } catch {}
    }

    if (validToken) {
        return (
            <StationPinPad
                orgName={orgName}
                orgId={resolvedOrgId || undefined}
                requireFingerprint={hasFingerprint}
            />
        );
    }

    // No valid token
    return (
        <div style={{
            minHeight: '100vh', background: '#0f172a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
        }}>
            <div style={{
                background: '#1e293b', borderRadius: '1.5rem', padding: '2.5rem 2rem',
                width: '100%', maxWidth: '360px', border: '1px solid #334155',
                boxShadow: '0 25px 50px rgba(0,0,0,0.5)', textAlign: 'center',
            }}>
                <div style={{
                    width: 56, height: 56, background: 'rgba(217,119,6,0.1)',
                    borderRadius: '50%', margin: '0 auto 1.25rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.5rem',
                }}>📱</div>
                <h1 style={{ color: 'white', margin: '0 0 0.25rem', fontSize: '1.2rem', fontWeight: 700 }}>
                    {orgName || 'Station Login'}
                </h1>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0 0 1.5rem', lineHeight: 1.6 }}>
                    This device is not registered. An admin must log in and register this device from the Settings page.
                </p>
                <a
                    href="/login"
                    style={{
                        display: 'inline-block', background: '#d97706', color: 'white',
                        padding: '0.6rem 1.75rem', borderRadius: '0.5rem',
                        fontSize: '0.875rem', fontWeight: 600, textDecoration: 'none',
                    }}
                >
                    Admin Login
                </a>
            </div>
        </div>
    );
}
