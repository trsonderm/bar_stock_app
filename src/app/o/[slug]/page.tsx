/**
 * Organization station page (/o/<subdomain>): shows the PIN pad when this device
 * holds a valid station token for the organization.
 */
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { validateStationToken } from '@/lib/dba';
import StationPinPad from '@/components/StationPinPad';

async function getOrganization(slug: string) {
    return await db.one('SELECT id, name, subdomain FROM organizations WHERE subdomain = $1', [slug]);
}

export default async function OrganizationPage({ params }: { params: { slug: string } }) {
    const org = await getOrganization(params.slug);

    if (!org) {
        notFound();
    }

    // Check for a valid station token
    const cookieStore = await cookies();
    const stationTokenValue = cookieStore.get('station_token')?.value;

    let validToken = false;
    let hasFingerprint = false;

    if (stationTokenValue) {
        try {
            // Validate token — don't pass fingerprint here (that's the client's job)
            const row = await validateStationToken(stationTokenValue);
            if (row && Number(row.org_id) === Number(org.id)) {
                validToken = true;
                hasFingerprint = !!row.fingerprint_hash;
            }
        } catch {}
    }

    if (validToken) {
        // Device is registered for this org — show PIN pad (client will re-verify fingerprint)
        return (
            <StationPinPad
                orgName={org.name}
                orgId={org.id}
                requireFingerprint={hasFingerprint}
            />
        );
    }

    // No valid token — show device-not-registered screen
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
                    {org.name}
                </h1>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0 0 1.5rem', lineHeight: 1.6 }}>
                    This device is not registered as a station. An admin must log in and register this device to enable PIN-only access.
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
