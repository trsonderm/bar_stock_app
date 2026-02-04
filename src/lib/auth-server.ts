import { getSession } from './auth';
import { redirect } from 'next/navigation';

export async function getOrganizationId() {
    const session = await getSession();
    if (!session) return null;
    return session.organizationId;
}

export async function requireAuth() {
    const session = await getSession();
    if (!session) {
        redirect('/'); // Or login page
    }
    return session;
}

export async function requireSuperAdmin() {
    const session = await getSession();
    if (!session || !session.isSuperAdmin) {
        redirect('/admin'); // or unauthorized page
    }
    return session;
}

export async function requireOrganization() {
    const session = await getSession();
    if (!session || !session.organizationId) {
        redirect('/register'); // If no org, maybe they need to register or select one?
    }
    return session.organizationId;
}
