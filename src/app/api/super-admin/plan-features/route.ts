import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';

export interface PlanFeature {
    id: string;
    name: string;
    description: string;
    category: string;
    showOnLanding: boolean;
    basic: boolean;
    pro: boolean;
    enterprise: boolean;
}

export const DEFAULT_FEATURES: PlanFeature[] = [
    { id: 'inventory_tracking',        name: 'Inventory Tracking',           description: 'Track stock levels for all products',           category: 'Core',         showOnLanding: true,  basic: true,  pro: true,  enterprise: true  },
    { id: 'unlimited_products',        name: 'Unlimited Products',           description: 'No cap on the number of products',              category: 'Core',         showOnLanding: true,  basic: true,  pro: true,  enterprise: true  },
    { id: 'low_stock_alerts',          name: 'Low Stock Alerts',             description: 'Email notifications when stock runs low',       category: 'Alerts',       showOnLanding: true,  basic: true,  pro: true,  enterprise: true  },
    { id: 'email_reports',             name: 'Email Reports',                description: 'Scheduled shift and inventory email reports',   category: 'Reporting',    showOnLanding: true,  basic: true,  pro: true,  enterprise: true  },
    { id: 'order_management',          name: 'Order Management',             description: 'Create and track purchase orders',              category: 'Operations',   showOnLanding: true,  basic: true,  pro: true,  enterprise: true  },
    { id: 'basic_users',               name: 'Up to 5 Users',                description: 'Add up to 5 staff members',                     category: 'Users',        showOnLanding: true,  basic: true,  pro: false, enterprise: false },
    { id: 'unlimited_users',           name: 'Unlimited Users',              description: 'No limit on staff accounts',                    category: 'Users',        showOnLanding: true,  basic: false, pro: true,  enterprise: true  },
    { id: 'multi_location',            name: 'Multiple Locations',           description: 'Manage inventory across locations',             category: 'Operations',   showOnLanding: true,  basic: false, pro: true,  enterprise: true  },
    { id: 'smart_orders',              name: 'Smart Orders',                 description: 'AI-assisted order quantity recommendations',    category: 'Operations',   showOnLanding: true,  basic: false, pro: true,  enterprise: true  },
    { id: 'audit_log',                 name: 'Audit Log',                    description: 'Full history of all inventory changes',         category: 'Reporting',    showOnLanding: true,  basic: false, pro: true,  enterprise: true  },
    { id: 'custom_reports',            name: 'Custom Reports',               description: 'Build and export custom reports',               category: 'Reporting',    showOnLanding: true,  basic: false, pro: true,  enterprise: true  },
    { id: 'shift_reports',             name: 'Shift Close Reports',          description: 'Automated shift summary emails',                category: 'Reporting',    showOnLanding: false, basic: false, pro: true,  enterprise: true  },
    { id: 'api_access',                name: 'API Access',                   description: 'Integrate with third-party systems via API',    category: 'Integrations', showOnLanding: true,  basic: false, pro: false, enterprise: true  },
    { id: 'custom_integrations',       name: 'Custom Integrations',          description: 'Tailored integrations built for your workflow', category: 'Integrations', showOnLanding: true,  basic: false, pro: false, enterprise: true  },
    { id: 'sso',                       name: 'Single Sign-On (SSO)',         description: 'Login with your existing identity provider',    category: 'Security',     showOnLanding: true,  basic: false, pro: false, enterprise: true  },
    { id: 'priority_support',          name: 'Priority Support',             description: 'Dedicated support with faster response times',  category: 'Support',      showOnLanding: true,  basic: false, pro: false, enterprise: true  },
    { id: 'dedicated_account_manager', name: 'Dedicated Account Manager',    description: 'A named contact for onboarding and success',    category: 'Support',      showOnLanding: true,  basic: false, pro: false, enterprise: true  },
    { id: 'custom_pricing',            name: 'Custom Pricing',               description: 'Volume discounts and negotiated contracts',     category: 'Billing',      showOnLanding: true,  basic: false, pro: false, enterprise: true  },
];

async function getFeatures(): Promise<PlanFeature[]> {
    try {
        const row = await db.one("SELECT value FROM system_settings WHERE key='plan_features'");
        if (row?.value) return JSON.parse(row.value) as PlanFeature[];
    } catch {}
    return DEFAULT_FEATURES;
}

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const features = await getFeatures();
    return NextResponse.json({ features });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.isSuperAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const { features } = await req.json();
    if (!Array.isArray(features)) return NextResponse.json({ error: 'features array required' }, { status: 400 });

    await db.execute(
        `INSERT INTO system_settings (key, value, updated_at) VALUES ('plan_features', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()`,
        [JSON.stringify(features)]
    );

    return NextResponse.json({ saved: true });
}
