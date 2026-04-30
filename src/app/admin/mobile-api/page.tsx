import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function MobileApiDocsPage() {
    const session = await getSession();
    if (!session || session.role !== 'admin') redirect('/admin/login');

    const base = 'https://www.topshelfInventory.com';

    return (
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1rem', color: 'white', fontFamily: 'inherit' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.5rem' }}>Mobile API Guide</h1>
            <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
                Use these endpoints to integrate TopShelf Inventory data into a mobile app.
                All requests go to <code style={code}>{base}</code>.
            </p>

            <Section title="Authentication">
                <p style={p}>All API calls require a Bearer token. Obtain one by calling the login endpoint:</p>
                <Block label="POST /api/mobile/auth" method="POST">
{`// Request body (JSON):
{
  "organization_subdomain": "your-bar",   // required — your org's subdomain
  "email": "admin@yourbar.com",           // use email+password OR pin
  "password": "yourpassword"
  // OR
  "pin": "1234"                           // 4-digit PIN login
}

// Success response (200):
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 604800,   // seconds (7 days)
  "user": {
    "id": 42,
    "first_name": "Alex",
    "last_name": "Smith",
    "email": "admin@yourbar.com",
    "role": "admin",
    "permissions": ["all"]
  },
  "organization": {
    "id": 7,
    "name": "The Rusty Nail",
    "subdomain": "your-bar",
    "subscription_plan": "pro"
  }
}`}
                </Block>
                <p style={p}>Save the <code style={code}>token</code> value and include it in every subsequent request header:</p>
                <Block label="Authorization Header" method="ALL">
{`Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`}
                </Block>
                <p style={{ ...p, color: '#f59e0b' }}>⚠ Tokens expire after 7 days. Re-authenticate to get a new one. Store tokens securely (Keychain on iOS, EncryptedSharedPreferences on Android).</p>
            </Section>

            <Section title="Dashboard Feed">
                <p style={p}>Retrieve the organization activity feed (posts, photos, tagged users).</p>
                <Block label="GET /api/mobile/feed" method="GET">
{`// Query parameters (all optional):
?page=1        // page number (default 1)
?limit=20      // results per page (max 50)

// Success response (200):
{
  "posts": [
    {
      "id": 101,
      "content": "Counted the liquor shelf — all good!",
      "images": [],            // array of base64 data-URLs
      "tagged_user_ids": [3],  // array of user IDs mentioned
      "created_at": "2026-04-30T14:22:00Z",
      "user_id": 5,
      "author_name": "Alex Smith",
      "author_avatar": "data:image/jpeg;base64,..."  // or null
    }
  ],
  "total": 84,
  "page": 1,
  "users": [
    { "id": 3, "display_name": "Jamie Lee", "profile_picture": null }
  ]
}`}
                </Block>
                <p style={p}>To resolve tagged users, match <code style={code}>tagged_user_ids</code> against the <code style={code}>users</code> array.</p>
            </Section>

            <Section title="Barred List">
                <p style={p}>Retrieve the list of barred/banned persons for the venue.</p>
                <Block label="GET /api/mobile/barred" method="GET">
{`// Query parameters (all optional):
?trespassed_only=true   // only persons with a trespass order

// Success response (200):
{
  "barred": [
    {
      "id": 1,
      "name": "John Doe",
      "aliases": ["Johnny D"],
      "photo": "data:image/jpeg;base64,...",  // or null
      "description": "Assault incident on 2026-03-12.",
      "barred_by_name": "Alex Smith",
      "trespassed": true,
      "created_at": "2026-03-12T20:00:00Z"
    }
  ],
  "total": 3
}`}
                </Block>
                <p style={{ ...p, color: '#fca5a5' }}>
                    ⚠ If <code style={code}>trespassed</code> is <code style={code}>true</code>, display a prominent warning in your app — this person must not be admitted.
                </p>
            </Section>

            <Section title="Out-of-Stock / Low Stock Items">
                <p style={p}>Returns all items that are at or below their low-stock threshold, sorted by quantity ascending.</p>
                <Block label="GET /api/mobile/out-of-stock" method="GET">
{`// Query parameters (optional):
?location_id=2   // filter to a specific location ID

// Success response (200):
{
  "items": [
    {
      "id": 88,
      "name": "Tito's Vodka 750ml",
      "type": "Liquor",
      "secondary_type": "Vodka",
      "quantity": 0,
      "low_stock_threshold": 3,
      "order_size": [{ "label": "Case", "amount": 12 }],
      "supplier": "Southern Glazers"
    }
  ],
  "total": 12,
  "out_of_stock": 4,
  "low_stock": 8
}`}
                </Block>
            </Section>

            <Section title="User Registration (Invite Flow)">
                <p style={p}>Admins generate invite links from the Users settings page. The link contains a one-time token valid for 7 days. Mobile apps can use these two endpoints to register new users without a browser:</p>

                <Block label="GET /api/mobile/register?token=..." method="GET">
{`// No auth header needed — validates the invite token
// Returns org info and pre-filled email if admin set one

// Success response (200):
{
  "valid": true,
  "org_name": "The Rusty Nail",
  "email": "newstaff@yourbar.com",  // pre-filled (may be null)
  "role": "user"
}

// Error responses:
// 404 — { "error": "Invalid token" }
// 410 — { "error": "Invitation already used" }
// 410 — { "error": "Invitation expired" }`}
                </Block>

                <Block label="POST /api/mobile/register" method="POST">
{`// No auth header needed — completes registration
// Returns a Bearer token (same format as /api/mobile/auth)

// Request body (JSON):
{
  "token": "abc123...",           // required — from invite link
  "firstName": "Alex",           // required
  "lastName": "Smith",           // required
  "displayName": "Alex S.",      // optional — shown in feed & messages
  "email": "alex@yourbar.com",   // required if not pre-filled by admin
  "phone": "5550001234",         // optional
  "password": "securepass",      // required — min 6 characters
  "pin": "1234"                  // required — exactly 4 digits
}

// Success response (200):
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expires_in": 604800,
  "user": {
    "id": 55,
    "first_name": "Alex",
    "last_name": "Smith",
    "role": "user",
    "email": "alex@yourbar.com"
  },
  "organization": { "id": 7, "name": "The Rusty Nail" }
}`}
                </Block>
                <p style={{ ...p, color: '#60a5fa' }}>
                    After registration, save the returned <code style={code}>token</code> and use it as your Bearer token for all subsequent requests.
                    Each invite link can only be used once.
                </p>
            </Section>

            <Section title="Error Responses">
                <p style={p}>All endpoints return standard HTTP status codes:</p>
                <Block label="Error format" method="">
{`// 401 Unauthorized — missing or expired token:
{ "error": "Unauthorized" }

// 403 Forbidden — insufficient permissions:
{ "error": "Permission denied" }

// 404 Not Found:
{ "error": "Organization not found" }

// 400 Bad Request:
{ "error": "Description is required" }

// 500 Internal Server Error:
{ "error": "Internal server error" }`}
                </Block>
            </Section>

            <Section title="Quick Start (React Native example)">
                <Block label="Authentication + fetch feed" method="">
{`const BASE = 'https://www.topshelfInventory.com';

async function login(subdomain, email, password) {
  const res = await fetch(\`\${BASE}/api/mobile/auth\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ organization_subdomain: subdomain, email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data.token; // store this securely
}

async function getFeed(token, page = 1) {
  const res = await fetch(\`\${BASE}/api/mobile/feed?page=\${page}\`, {
    headers: { 'Authorization': \`Bearer \${token}\` },
  });
  return res.json();
}

async function getBarredList(token) {
  const res = await fetch(\`\${BASE}/api/mobile/barred\`, {
    headers: { 'Authorization': \`Bearer \${token}\` },
  });
  return res.json();
}

async function getOutOfStock(token, locationId) {
  const url = locationId
    ? \`\${BASE}/api/mobile/out-of-stock?location_id=\${locationId}\`
    : \`\${BASE}/api/mobile/out-of-stock\`;
  const res = await fetch(url, {
    headers: { 'Authorization': \`Bearer \${token}\` },
  });
  return res.json();
}`}
                </Block>
            </Section>

            <div style={{ marginTop: '2rem', color: '#374151', fontSize: '0.8rem', textAlign: 'center' }}>
                TopShelf Inventory Mobile API · {base}
            </div>
        </div>
    );
}

const p: React.CSSProperties = { color: '#d1d5db', fontSize: '0.9rem', lineHeight: 1.6, margin: '0 0 0.75rem' };
const code: React.CSSProperties = { background: '#1f2937', color: '#60a5fa', padding: '1px 6px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.85em' };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'white', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid #374151' }}>{title}</h2>
            {children}
        </div>
    );
}

function Block({ label, method, children }: { label: string; method: string; children: string }) {
    const methodColors: Record<string, string> = { GET: '#10b981', POST: '#3b82f6', DELETE: '#ef4444', ALL: '#6b7280', '': '#6b7280' };
    return (
        <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                {method && (
                    <span style={{ background: methodColors[method] || '#6b7280', color: 'white', fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>{method}</span>
                )}
                <code style={{ color: '#e5e7eb', fontSize: '0.875rem', fontWeight: 600 }}>{label}</code>
            </div>
            <pre style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', padding: '1rem', overflowX: 'auto', fontSize: '0.82rem', color: '#94a3b8', margin: 0, lineHeight: 1.6 }}>
                {children.trim()}
            </pre>
        </div>
    );
}
