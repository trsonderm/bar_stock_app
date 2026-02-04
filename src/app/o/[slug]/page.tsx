import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { ShieldCheck, Smartphone } from 'lucide-react';
import Image from 'next/image';

// We need to fetch org details
async function getOrganization(slug: string) {
    const org = await db.one('SELECT * FROM organizations WHERE subdomain = ?', [slug]);
    return org;
}

export default async function OrganizationPage({ params }: { params: { slug: string } }) {
    const org = await getOrganization(params.slug);

    if (!org) {
        notFound();
    }

    // Check for Station Token
    const cookieStore = cookies();
    const stationToken = cookieStore.get('station_token');

    // Logic: 
    // 1. If stationToken is valid for this org -> Show PIN Pad (User Selection)
    // 2. If valid session cookie (already logged in as user/admin) -> Redirect to dashboard? 
    //    Actually, if they are logged in, maybe they want to be here to switch modes or logout?
    //    Let's assume standard behavior: if logged in, go to dashboard.

    // For now, let's implement the "Login Options" view which is the default entry.
    // Ideally, we check validation of token here or in middleware.
    // If valid token:
    //   - Use stored logic to verify token in DB (we haven't built that table yet).
    //   - If valid, render "Select User & PIN" screen.
    // If invalid/no token:
    //   - Render "Admin Login" or "Device Registration" prompt.

    // PLACEHOLDER: Since we haven't built the token table yet, we'll assume NO token for now 
    // and just show the Login Interface tailored for the Org.

    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md bg-gray-800 rounded-2xl shadow-2xl p-8 border border-gray-700">
                <div className="text-center mb-8">
                    <div className="mx-auto w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mb-4">
                        <ShieldCheck className="w-8 h-8 text-amber-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-white">{org.name}</h1>
                    <p className="text-gray-400 text-sm mt-1">Authorized Access Only</p>
                </div>

                <div className="space-y-4">
                    {/* Standard Login (for Admins mainly, or initial setup) */}
                    <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-700">
                        <h2 className="text-lg font-medium text-white mb-4">Admin Access</h2>
                        {/* We can re-use existing login form logic or redirect to main login with org context? 
                             For simplicity, let's redirect to main login but maybe pre-fill org?
                             Actually, the requirement implies a specialized organization login.
                             Let's keep it simple: Link to the main login page but maybe pass a query param?
                         */}
                        <Link href={`/login?org=${org.subdomain}`} className="block w-full text-center bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 rounded-lg transition-colors">
                            Login with Email & Password
                        </Link>
                    </div>

                    {/* Station Mode Prompt (Placeholder until implemented) */}
                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-600"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-2 bg-gray-800 text-gray-400">Station Mode</span>
                        </div>
                    </div>

                    <div className="text-center">
                        {stationToken ? (
                            <div className="p-4 bg-green-900/20 border border-green-500/30 rounded-lg">
                                <p className="text-green-400 font-medium flex items-center justify-center gap-2">
                                    <Smartphone className="w-4 h-4" /> Device Registered
                                </p>
                                <button className="mt-3 w-full bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg text-sm">
                                    Refresh PIN Access
                                </button>
                            </div>
                        ) : (
                            <p className="text-gray-500 text-sm italic">
                                This device is not registered for Station Mode. <br />
                                Login as Admin to enable 90-day PIN access.
                            </p>
                        )}
                    </div>
                </div>

                <div className="mt-8 text-center">
                    <Link href="/" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">
                        &larr; Back to Home
                    </Link>
                </div>
            </div>
        </div>
    );
}
