import { NextRequest, NextResponse } from 'next/server';
import { db, pool } from '@/lib/db';
import { getSession } from '@/lib/auth';

interface LinkedDef {
    key: string;
    table: string;
    label: string;
    previewCols: string[];
    whereSql: string;
    params: (parentId: number) => any[];
    deleteOrder: number;
    cascade?: boolean;
    isMainRow?: boolean;
}

interface ObjTypeDef {
    label: string;
    icon: string;
    mainTable: string;
    listSql: (orgId: number, locationId: number | null, q: string) => [string, any[]];
    displayName: (row: any) => string;
    subLabel?: (row: any) => string;
    linked: LinkedDef[];
}

const OBJECT_TYPES: Record<string, ObjTypeDef> = {
    organization: {
        label: 'Organization', icon: '🏢', mainTable: 'organizations',
        listSql: (orgId, loc, q) => {
            const p: any[] = []; let sql = 'SELECT id, name, subdomain, billing_status, subscription_plan FROM organizations WHERE 1=1';
            if (q) { p.push(`%${q}%`); sql += ` AND (name ILIKE $${p.length} OR subdomain ILIKE $${p.length})`; }
            sql += ' ORDER BY name LIMIT 100'; return [sql, p];
        },
        displayName: r => r.name,
        subLabel: r => r.subdomain ? `@${r.subdomain} · ${r.billing_status}` : r.billing_status,
        linked: [
            { key: 'user_locations', table: 'user_locations', label: 'User Location Assignments', previewCols: ['id', 'user_id', 'location_id', 'is_primary'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 5 },
            { key: 'user_schedules', table: 'user_schedules', label: 'Schedule Entries', previewCols: ['id', 'user_id', 'shift_id', 'date'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 10 },
            { key: 'shift_swap_requests', table: 'shift_swap_requests', label: 'Shift Swap Requests', previewCols: ['id', 'status', 'created_at'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 8 },
            { key: 'time_off_requests', table: 'time_off_requests', label: 'Time Off Requests', previewCols: ['id', 'user_id', 'start_date', 'status'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 9 },
            { key: 'notifications', table: 'notifications', label: 'Notifications', previewCols: ['id', 'user_id', 'type', 'title'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 11 },
            { key: 'device_tokens', table: 'device_tokens', label: 'Device Tokens', previewCols: ['id', 'user_id', 'platform', 'created_at'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 12 },
            { key: 'incident_persons', table: 'incident_persons', label: 'Incident Persons', previewCols: ['id', 'incident_id', 'first_name', 'last_name'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 13 },
            { key: 'incident_timeline', table: 'incident_timeline', label: 'Incident Timeline Entries', previewCols: ['id', 'incident_id', 'segment_date', 'description'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 14 },
            { key: 'security_incidents', table: 'security_incidents', label: 'Security Incidents', previewCols: ['id', 'person_name', 'incident_date', 'case_number'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 20 },
            { key: 'security_barred', table: 'security_barred', label: 'Barred Persons', previewCols: ['id', 'name', 'trespassed', 'created_at'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 22 },
            { key: 'support_messages', table: 'support_messages', label: 'Support Messages', previewCols: ['id', 'ticket_id', 'message', 'created_at'], whereSql: 'ticket_id IN (SELECT id FROM support_tickets WHERE organization_id = $1)', params: id => [id], deleteOrder: 15 },
            { key: 'support_tickets', table: 'support_tickets', label: 'Support Tickets', previewCols: ['id', 'subject', 'status', 'created_at'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 25 },
            { key: 'report_runs', table: 'report_runs', label: 'Report Run History', previewCols: ['id', 'report_id', 'ran_at', 'status'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 16 },
            { key: 'report_schedules', table: 'report_schedules', label: 'Report Email Schedules', previewCols: ['id', 'frequency', 'next_run_at', 'active'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 17 },
            { key: 'saved_reports', table: 'saved_reports', label: 'Saved / Custom Reports', previewCols: ['id', 'name', 'created_at'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 30 },
            { key: 'purchase_order_items', table: 'purchase_order_items', label: 'Purchase Order Line Items', previewCols: ['id', 'purchase_order_id', 'item_id', 'quantity'], whereSql: 'purchase_order_id IN (SELECT id FROM purchase_orders WHERE organization_id = $1)', params: id => [id], deleteOrder: 18 },
            { key: 'purchase_orders', table: 'purchase_orders', label: 'Purchase Orders', previewCols: ['id', 'status', 'created_at'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 32 },
            { key: 'pending_orders', table: 'pending_orders', label: 'Pending Orders', previewCols: ['id', 'supplier_id', 'status', 'created_at'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 33 },
            { key: 'shift_closes', table: 'shift_closes', label: 'Shift Close Records', previewCols: ['id', 'user_id', 'location_id', 'closed_at'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 34 },
            { key: 'item_suppliers', table: 'item_suppliers', label: 'Item–Supplier Links', previewCols: ['id', 'item_id', 'supplier_id', 'is_preferred'], whereSql: 'item_id IN (SELECT id FROM items WHERE organization_id = $1)', params: id => [id], deleteOrder: 19 },
            { key: 'item_location_suppliers', table: 'item_location_suppliers', label: 'Location–Supplier Links', previewCols: ['id', 'item_id', 'location_id', 'supplier_id'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 19 },
            { key: 'item_location_prices', table: 'item_location_prices', label: 'Location Price Overrides', previewCols: ['id', 'item_id', 'location_id', 'sale_price'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 19 },
            { key: 'item_global_links', table: 'item_global_links', label: 'Global Product Links', previewCols: ['id', 'item_id', 'global_product_id'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 21 },
            { key: 'inventory', table: 'inventory', label: 'Inventory Records', previewCols: ['id', 'item_id', 'location_id', 'quantity'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 35 },
            { key: 'items', table: 'items', label: 'Items / Products', previewCols: ['id', 'name', 'type', 'unit_cost'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 40 },
            { key: 'sub_categories', table: 'sub_categories', label: 'Sub-Categories', previewCols: ['id', 'category_id', 'name'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 36 },
            { key: 'categories', table: 'categories', label: 'Categories', previewCols: ['id', 'name'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 42 },
            { key: 'suppliers', table: 'suppliers', label: 'Suppliers', previewCols: ['id', 'name', 'contact_email'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 45 },
            { key: 'shifts', table: 'shifts', label: 'Shifts', previewCols: ['id', 'label', 'start_time', 'end_time'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 46 },
            { key: 'bar_map_history', table: 'bar_map_history', label: 'Bar Map History', previewCols: ['id', 'bar_map_id', 'created_at'], whereSql: 'bar_map_id IN (SELECT id FROM bar_maps WHERE organization_id = $1)', params: id => [id], deleteOrder: 37 },
            { key: 'bar_maps', table: 'bar_maps', label: 'Bar Maps', previewCols: ['id', 'name', 'is_active'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 48 },
            { key: 'post_likes', table: 'post_likes', label: 'Post Likes', previewCols: ['id', 'post_id', 'user_id'], whereSql: 'post_id IN (SELECT id FROM org_posts WHERE organization_id = $1)', params: id => [id], deleteOrder: 23 },
            { key: 'post_comments', table: 'post_comments', label: 'Post Comments', previewCols: ['id', 'post_id', 'content'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 24 },
            { key: 'org_posts', table: 'org_posts', label: 'Posts / Feed', previewCols: ['id', 'user_id', 'content', 'created_at'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 49 },
            { key: 'direct_messages', table: 'direct_messages', label: 'Direct Messages', previewCols: ['id', 'thread_id', 'sender_id', 'created_at'], whereSql: 'thread_id IN (SELECT id FROM message_threads WHERE organization_id = $1)', params: id => [id], deleteOrder: 26 },
            { key: 'message_thread_members', table: 'message_thread_members', label: 'Message Thread Members', previewCols: ['id', 'thread_id', 'user_id'], whereSql: 'thread_id IN (SELECT id FROM message_threads WHERE organization_id = $1)', params: id => [id], deleteOrder: 27 },
            { key: 'message_threads', table: 'message_threads', label: 'Message Threads', previewCols: ['id', 'type', 'name', 'created_at'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 50 },
            { key: 'activity_logs', table: 'activity_logs', label: 'Activity Logs', previewCols: ['id', 'user_id', 'action', 'timestamp'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 51 },
            { key: 'email_log', table: 'email_log', label: 'Email Log', previewCols: ['id', 'email_type', 'subject', 'status', 'sent_at'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 52 },
            { key: 'pos_transaction_items', table: 'pos_transaction_items', label: 'POS Transaction Items', previewCols: ['id', 'transaction_id', 'pos_item_name'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 28 },
            { key: 'pos_transactions', table: 'pos_transactions', label: 'POS Transactions', previewCols: ['id', 'pos_type', 'transaction_at', 'total_amount'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 53 },
            { key: 'pos_item_mappings', table: 'pos_item_mappings', label: 'POS Item Mappings', previewCols: ['id', 'pos_type', 'pos_item_name'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 54 },
            { key: 'pos_sync_logs', table: 'pos_sync_logs', label: 'POS Sync Logs', previewCols: ['id', 'pos_type', 'status', 'started_at'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 55 },
            { key: 'pos_sync_settings', table: 'pos_sync_settings', label: 'POS Sync Settings', previewCols: ['id', 'pos_type', 'sync_enabled'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 60 },
            { key: 'user_invitations', table: 'user_invitations', label: 'User Invitations', previewCols: ['id', 'email', 'role', 'created_at'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 61 },
            { key: 'setup_checklist', table: 'setup_checklist', label: 'Setup Checklist', previewCols: ['id', 'step_key', 'completed'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 62 },
            { key: 'payout_types', table: 'payout_types', label: 'Payout Types', previewCols: ['id', 'name'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 63 },
            { key: 'package_pricing_bands', table: 'package_pricing_bands', label: 'Package Pricing Bands', previewCols: ['id', 'name', 'start_time', 'end_time'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 64 },
            { key: 'organization_tokens', table: 'organization_tokens', label: 'API Tokens', previewCols: ['id', 'device_name', 'expires_at'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 65 },
            { key: 'invoices', table: 'invoices', label: 'Invoices', previewCols: ['id', 'amount', 'status', 'created_at'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 66 },
            { key: 'stripe_customers', table: 'stripe_customers', label: 'Stripe Customer', previewCols: ['id', 'stripe_customer_id', 'stripe_subscription_id'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 67 },
            { key: 'global_product_notifications', table: 'global_product_notifications', label: 'Global Product Notifications', previewCols: ['id', 'global_product_id', 'status'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 68 },
            { key: 'data_sync', table: 'data_sync', label: 'Data Sync State', previewCols: ['id', 'data_type', 'updated_at'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 69 },
            { key: 'signatures', table: 'signatures', label: 'Signatures', previewCols: ['id', 'user_id', 'label'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 70 },
            { key: 'settings', table: 'settings', label: 'Org Settings', previewCols: ['id', 'key', 'value'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 75 },
            { key: 'users', table: 'users', label: 'Users', previewCols: ['id', 'first_name', 'last_name', 'email', 'role'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 80 },
            { key: 'locations', table: 'locations', label: 'Locations', previewCols: ['id', 'name', 'address'], whereSql: 'organization_id = $1', params: id => [id], deleteOrder: 85 },
            { key: 'organization_row', table: 'organizations', label: '⚠️ Organization Record Itself', previewCols: ['id', 'name', 'subdomain', 'billing_status'], whereSql: 'id = $1', params: id => [id], deleteOrder: 100, isMainRow: true },
        ],
    },

    location: {
        label: 'Location', icon: '📍', mainTable: 'locations',
        listSql: (orgId, loc, q) => {
            const p: any[] = [orgId]; let sql = 'SELECT id, name, address FROM locations WHERE organization_id = $1';
            if (q) { p.push(`%${q}%`); sql += ` AND name ILIKE $${p.length}`; }
            sql += ' ORDER BY name LIMIT 100'; return [sql, p];
        },
        displayName: r => r.name,
        subLabel: r => r.address || '',
        linked: [
            { key: 'user_locations', table: 'user_locations', label: 'User Assignments', previewCols: ['id', 'user_id', 'is_primary'], whereSql: 'location_id = $1', params: id => [id], deleteOrder: 5, cascade: true },
            { key: 'inventory', table: 'inventory', label: 'Inventory at Location', previewCols: ['id', 'item_id', 'quantity'], whereSql: 'location_id = $1', params: id => [id], deleteOrder: 6, cascade: true },
            { key: 'shifts', table: 'shifts', label: 'Shifts at Location', previewCols: ['id', 'label', 'start_time', 'end_time'], whereSql: 'location_id = $1', params: id => [id], deleteOrder: 7, cascade: true },
            { key: 'user_schedules', table: 'user_schedules', label: 'Schedule Entries at Location', previewCols: ['id', 'user_id', 'shift_id', 'date'], whereSql: 'location_id = $1', params: id => [id], deleteOrder: 8 },
            { key: 'shift_closes', table: 'shift_closes', label: 'Shift Close Records', previewCols: ['id', 'user_id', 'closed_at'], whereSql: 'location_id = $1', params: id => [id], deleteOrder: 9 },
            { key: 'item_location_prices', table: 'item_location_prices', label: 'Location Price Overrides', previewCols: ['id', 'item_id', 'sale_price'], whereSql: 'location_id = $1', params: id => [id], deleteOrder: 10, cascade: true },
            { key: 'item_location_suppliers', table: 'item_location_suppliers', label: 'Location–Supplier Links', previewCols: ['id', 'item_id', 'supplier_id'], whereSql: 'location_id = $1', params: id => [id], deleteOrder: 11, cascade: true },
            { key: 'pos_transactions', table: 'pos_transactions', label: 'POS Transactions', previewCols: ['id', 'pos_type', 'transaction_at', 'total_amount'], whereSql: 'location_id = $1', params: id => [id], deleteOrder: 12 },
            { key: 'pos_sync_logs', table: 'pos_sync_logs', label: 'POS Sync Logs', previewCols: ['id', 'pos_type', 'status', 'started_at'], whereSql: 'location_id = $1', params: id => [id], deleteOrder: 13 },
            { key: 'location_row', table: 'locations', label: '⚠️ Location Record Itself', previewCols: ['id', 'name', 'address'], whereSql: 'id = $1', params: id => [id], deleteOrder: 100, isMainRow: true },
        ],
    },

    user: {
        label: 'User', icon: '👤', mainTable: 'users',
        listSql: (orgId, loc, q) => {
            const p: any[] = [orgId];
            let sql = `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.is_active FROM users u WHERE u.organization_id = $1`;
            if (loc) { p.push(loc); sql += ` AND EXISTS (SELECT 1 FROM user_locations ul WHERE ul.user_id = u.id AND ul.location_id = $${p.length})`; }
            if (q) { p.push(`%${q}%`); sql += ` AND (u.first_name ILIKE $${p.length} OR u.last_name ILIKE $${p.length} OR u.email ILIKE $${p.length})`; }
            sql += ' ORDER BY u.last_name, u.first_name LIMIT 100'; return [sql, p];
        },
        displayName: r => `${r.first_name} ${r.last_name}`,
        subLabel: r => `${r.email || ''} · ${r.role}`,
        linked: [
            { key: 'shift_swap_requests', table: 'shift_swap_requests', label: 'Shift Swap Requests', previewCols: ['id', 'status', 'created_at'], whereSql: 'requester_id = $1 OR target_id = $1', params: id => [id], deleteOrder: 5 },
            { key: 'time_off_requests', table: 'time_off_requests', label: 'Time Off Requests', previewCols: ['id', 'start_date', 'end_date', 'status'], whereSql: 'user_id = $1', params: id => [id], deleteOrder: 6, cascade: true },
            { key: 'device_tokens', table: 'device_tokens', label: 'Device Tokens', previewCols: ['id', 'platform', 'created_at'], whereSql: 'user_id = $1', params: id => [id], deleteOrder: 7, cascade: true },
            { key: 'email_verification_tokens', table: 'email_verification_tokens', label: 'Email Verification Tokens', previewCols: ['id', 'expires_at'], whereSql: 'user_id = $1', params: id => [id], deleteOrder: 8, cascade: true },
            { key: 'mobile_user_settings', table: 'mobile_user_settings', label: 'Mobile Settings', previewCols: ['user_id', 'notifications_enabled'], whereSql: 'user_id = $1', params: id => [id], deleteOrder: 9, cascade: true },
            { key: 'user_schedules', table: 'user_schedules', label: 'Schedule Entries', previewCols: ['id', 'shift_id', 'date'], whereSql: 'user_id = $1', params: id => [id], deleteOrder: 10, cascade: true },
            { key: 'user_locations', table: 'user_locations', label: 'Location Assignments', previewCols: ['id', 'location_id', 'is_primary'], whereSql: 'user_id = $1', params: id => [id], deleteOrder: 11, cascade: true },
            { key: 'notifications', table: 'notifications', label: 'Notifications', previewCols: ['id', 'type', 'title'], whereSql: 'user_id = $1', params: id => [id], deleteOrder: 12, cascade: true },
            { key: 'signatures', table: 'signatures', label: 'Signatures', previewCols: ['id', 'label'], whereSql: 'user_id = $1', params: id => [id], deleteOrder: 13 },
            { key: 'activity_logs', table: 'activity_logs', label: 'Activity Logs', previewCols: ['id', 'action', 'timestamp'], whereSql: 'user_id = $1', params: id => [id], deleteOrder: 20 },
            { key: 'user_row', table: 'users', label: '⚠️ User Record Itself', previewCols: ['id', 'first_name', 'last_name', 'email', 'role'], whereSql: 'id = $1', params: id => [id], deleteOrder: 100, isMainRow: true },
        ],
    },

    item: {
        label: 'Item / Product', icon: '🍾', mainTable: 'items',
        listSql: (orgId, loc, q) => {
            const p: any[] = [orgId];
            let sql = `SELECT i.id, i.name, i.type, i.unit_cost, i.archived_at FROM items i WHERE i.organization_id = $1`;
            if (loc) { p.push(loc); sql += ` AND EXISTS (SELECT 1 FROM inventory inv WHERE inv.item_id = i.id AND inv.location_id = $${p.length})`; }
            if (q) { p.push(`%${q}%`); sql += ` AND i.name ILIKE $${p.length}`; }
            sql += ' ORDER BY i.name LIMIT 100'; return [sql, p];
        },
        displayName: r => r.name,
        subLabel: r => `${r.type}${r.archived_at ? ' · Archived' : ''}`,
        linked: [
            { key: 'inventory', table: 'inventory', label: 'Inventory Records', previewCols: ['id', 'location_id', 'quantity'], whereSql: 'item_id = $1', params: id => [id], deleteOrder: 5, cascade: true },
            { key: 'item_suppliers', table: 'item_suppliers', label: 'Supplier Links', previewCols: ['id', 'supplier_id', 'cost_per_unit', 'is_preferred'], whereSql: 'item_id = $1', params: id => [id], deleteOrder: 6, cascade: true },
            { key: 'item_location_suppliers', table: 'item_location_suppliers', label: 'Location–Supplier Links', previewCols: ['id', 'location_id', 'supplier_id'], whereSql: 'item_id = $1', params: id => [id], deleteOrder: 7, cascade: true },
            { key: 'item_location_prices', table: 'item_location_prices', label: 'Location Price Overrides', previewCols: ['id', 'location_id', 'sale_price'], whereSql: 'item_id = $1', params: id => [id], deleteOrder: 8, cascade: true },
            { key: 'item_global_links', table: 'item_global_links', label: 'Global Product Links', previewCols: ['id', 'global_product_id'], whereSql: 'item_id = $1', params: id => [id], deleteOrder: 9, cascade: true },
            { key: 'purchase_order_items', table: 'purchase_order_items', label: 'Purchase Order Line Items', previewCols: ['id', 'purchase_order_id', 'quantity'], whereSql: 'item_id = $1', params: id => [id], deleteOrder: 10 },
            { key: 'item_row', table: 'items', label: '⚠️ Item Record Itself', previewCols: ['id', 'name', 'type', 'unit_cost'], whereSql: 'id = $1', params: id => [id], deleteOrder: 100, isMainRow: true },
        ],
    },

    category: {
        label: 'Category', icon: '🏷️', mainTable: 'categories',
        listSql: (orgId, loc, q) => {
            const p: any[] = [orgId]; let sql = 'SELECT id, name FROM categories WHERE organization_id = $1';
            if (q) { p.push(`%${q}%`); sql += ` AND name ILIKE $${p.length}`; }
            sql += ' ORDER BY name LIMIT 100'; return [sql, p];
        },
        displayName: r => r.name,
        linked: [
            { key: 'sub_categories', table: 'sub_categories', label: 'Sub-Categories', previewCols: ['id', 'name'], whereSql: 'category_id = $1', params: id => [id], deleteOrder: 5, cascade: true },
            { key: 'items', table: 'items', label: 'Items in Category (will unlink)', previewCols: ['id', 'name', 'type'], whereSql: 'category_id = $1', params: id => [id], deleteOrder: 10 },
            { key: 'category_row', table: 'categories', label: '⚠️ Category Record Itself', previewCols: ['id', 'name'], whereSql: 'id = $1', params: id => [id], deleteOrder: 100, isMainRow: true },
        ],
    },

    incident: {
        label: 'Security Incident', icon: '🚨', mainTable: 'security_incidents',
        listSql: (orgId, loc, q) => {
            const p: any[] = [orgId];
            let sql = `SELECT id, person_name, incident_date, case_number, office_name, created_at FROM security_incidents WHERE organization_id = $1`;
            if (q) { p.push(`%${q}%`); sql += ` AND (person_name ILIKE $${p.length} OR case_number ILIKE $${p.length})`; }
            sql += ' ORDER BY created_at DESC LIMIT 100'; return [sql, p];
        },
        displayName: r => r.person_name || 'Unnamed Incident',
        subLabel: r => [r.case_number, r.incident_date].filter(Boolean).join(' · '),
        linked: [
            { key: 'incident_persons', table: 'incident_persons', label: 'Persons Involved', previewCols: ['id', 'first_name', 'last_name'], whereSql: 'incident_id = $1', params: id => [id], deleteOrder: 5, cascade: true },
            { key: 'incident_timeline', table: 'incident_timeline', label: 'Timeline Entries', previewCols: ['id', 'segment_date', 'description'], whereSql: 'incident_id = $1', params: id => [id], deleteOrder: 6, cascade: true },
            { key: 'incident_row', table: 'security_incidents', label: '⚠️ Incident Record Itself', previewCols: ['id', 'person_name', 'incident_date', 'case_number'], whereSql: 'id = $1', params: id => [id], deleteOrder: 100, isMainRow: true },
        ],
    },

    barred_person: {
        label: 'Barred Person', icon: '🚫', mainTable: 'security_barred',
        listSql: (orgId, loc, q) => {
            const p: any[] = [orgId]; let sql = 'SELECT id, name, trespassed, created_at FROM security_barred WHERE organization_id = $1';
            if (q) { p.push(`%${q}%`); sql += ` AND name ILIKE $${p.length}`; }
            sql += ' ORDER BY name LIMIT 100'; return [sql, p];
        },
        displayName: r => r.name,
        subLabel: r => r.trespassed ? 'Trespassed' : '',
        linked: [
            { key: 'security_incidents', table: 'security_incidents', label: 'Linked Incidents (barred_person_id → NULL)', previewCols: ['id', 'person_name', 'incident_date'], whereSql: 'barred_person_id = $1', params: id => [id], deleteOrder: 5 },
            { key: 'barred_row', table: 'security_barred', label: '⚠️ Barred Person Record Itself', previewCols: ['id', 'name', 'trespassed', 'created_at'], whereSql: 'id = $1', params: id => [id], deleteOrder: 100, isMainRow: true },
        ],
    },

    custom_report: {
        label: 'Custom Report', icon: '📊', mainTable: 'saved_reports',
        listSql: (orgId, loc, q) => {
            const p: any[] = [orgId]; let sql = 'SELECT id, name, created_at, updated_at FROM saved_reports WHERE organization_id = $1';
            if (q) { p.push(`%${q}%`); sql += ` AND name ILIKE $${p.length}`; }
            sql += ' ORDER BY name LIMIT 100'; return [sql, p];
        },
        displayName: r => r.name,
        subLabel: r => r.created_at ? `Created ${new Date(r.created_at).toLocaleDateString()}` : '',
        linked: [
            { key: 'report_runs', table: 'report_runs', label: 'Run History', previewCols: ['id', 'ran_at', 'status'], whereSql: 'report_id = $1', params: id => [id], deleteOrder: 5, cascade: true },
            { key: 'report_schedules', table: 'report_schedules', label: 'Email Schedules', previewCols: ['id', 'frequency', 'next_run_at', 'active'], whereSql: 'report_id = $1', params: id => [id], deleteOrder: 6, cascade: true },
            { key: 'report_row', table: 'saved_reports', label: '⚠️ Report Record Itself', previewCols: ['id', 'name'], whereSql: 'id = $1', params: id => [id], deleteOrder: 100, isMainRow: true },
        ],
    },

    shift: {
        label: 'Shift', icon: '🕐', mainTable: 'shifts',
        listSql: (orgId, loc, q) => {
            const p: any[] = [orgId]; let sql = 'SELECT id, label, start_time, end_time, color FROM shifts WHERE organization_id = $1';
            if (loc) { p.push(loc); sql += ` AND location_id = $${p.length}`; }
            if (q) { p.push(`%${q}%`); sql += ` AND label ILIKE $${p.length}`; }
            sql += ' ORDER BY label LIMIT 100'; return [sql, p];
        },
        displayName: r => r.label,
        subLabel: r => `${r.start_time || ''} – ${r.end_time || ''}`,
        linked: [
            { key: 'user_schedules', table: 'user_schedules', label: 'Schedule Entries', previewCols: ['id', 'user_id', 'date'], whereSql: 'shift_id = $1', params: id => [id], deleteOrder: 5, cascade: true },
            { key: 'shift_row', table: 'shifts', label: '⚠️ Shift Record Itself', previewCols: ['id', 'label', 'start_time', 'end_time'], whereSql: 'id = $1', params: id => [id], deleteOrder: 100, isMainRow: true },
        ],
    },

    shift_close: {
        label: 'Shift Close', icon: '💰', mainTable: 'shift_closes',
        listSql: (orgId, loc, q) => {
            const p: any[] = [orgId];
            let sql = `SELECT sc.id, sc.closed_at, sc.user_id, sc.location_id, sc.over_short, u.first_name || ' ' || u.last_name AS user_name FROM shift_closes sc LEFT JOIN users u ON sc.user_id = u.id WHERE sc.organization_id = $1`;
            if (loc) { p.push(loc); sql += ` AND sc.location_id = $${p.length}`; }
            sql += ' ORDER BY sc.closed_at DESC LIMIT 100'; return [sql, p];
        },
        displayName: r => r.user_name || `User #${r.user_id}`,
        subLabel: r => r.closed_at ? new Date(r.closed_at).toLocaleString() : '',
        linked: [
            { key: 'shift_close_row', table: 'shift_closes', label: '⚠️ Shift Close Record Itself', previewCols: ['id', 'closed_at', 'bank_start', 'bank_end', 'over_short'], whereSql: 'id = $1', params: id => [id], deleteOrder: 100, isMainRow: true },
        ],
    },

    schedule: {
        label: 'Schedule Entry', icon: '📅', mainTable: 'user_schedules',
        listSql: (orgId, loc, q) => {
            const p: any[] = [orgId];
            let sql = `SELECT us.id, us.date, us.user_id, us.shift_id, u.first_name || ' ' || u.last_name AS user_name, s.label AS shift_label FROM user_schedules us LEFT JOIN users u ON us.user_id = u.id LEFT JOIN shifts s ON us.shift_id = s.id WHERE us.organization_id = $1`;
            if (loc) { p.push(loc); sql += ` AND us.location_id = $${p.length}`; }
            sql += ' ORDER BY us.date DESC LIMIT 100'; return [sql, p];
        },
        displayName: r => r.user_name || `User #${r.user_id}`,
        subLabel: r => `${r.date || ''} · ${r.shift_label || 'Shift #' + r.shift_id}`,
        linked: [
            { key: 'shift_swap_requests', table: 'shift_swap_requests', label: 'Swap Requests', previewCols: ['id', 'status', 'created_at'], whereSql: 'requester_schedule_id = $1 OR target_schedule_id = $1', params: id => [id], deleteOrder: 5, cascade: true },
            { key: 'schedule_row', table: 'user_schedules', label: '⚠️ Schedule Entry Itself', previewCols: ['id', 'date', 'user_id', 'shift_id'], whereSql: 'id = $1', params: id => [id], deleteOrder: 100, isMainRow: true },
        ],
    },

    purchase_order: {
        label: 'Purchase Order', icon: '📦', mainTable: 'purchase_orders',
        listSql: (orgId, loc, q) => {
            const p: any[] = [orgId];
            let sql = `SELECT po.id, po.status, po.created_at, s.name AS supplier_name FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id = s.id WHERE po.organization_id = $1`;
            if (loc) { p.push(loc); sql += ` AND po.location_id = $${p.length}`; }
            sql += ' ORDER BY po.created_at DESC LIMIT 100'; return [sql, p];
        },
        displayName: r => `PO #${r.id}${r.supplier_name ? ' — ' + r.supplier_name : ''}`,
        subLabel: r => `${r.status} · ${r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}`,
        linked: [
            { key: 'purchase_order_items', table: 'purchase_order_items', label: 'Line Items', previewCols: ['id', 'item_id', 'quantity', 'received_quantity'], whereSql: 'purchase_order_id = $1', params: id => [id], deleteOrder: 5, cascade: true },
            { key: 'po_row', table: 'purchase_orders', label: '⚠️ Purchase Order Itself', previewCols: ['id', 'status', 'created_at'], whereSql: 'id = $1', params: id => [id], deleteOrder: 100, isMainRow: true },
        ],
    },

    supplier: {
        label: 'Supplier', icon: '🚚', mainTable: 'suppliers',
        listSql: (orgId, loc, q) => {
            const p: any[] = [orgId]; let sql = 'SELECT id, name, contact_email FROM suppliers WHERE organization_id = $1';
            if (q) { p.push(`%${q}%`); sql += ` AND name ILIKE $${p.length}`; }
            sql += ' ORDER BY name LIMIT 100'; return [sql, p];
        },
        displayName: r => r.name,
        subLabel: r => r.contact_email || '',
        linked: [
            { key: 'item_suppliers', table: 'item_suppliers', label: 'Item Links', previewCols: ['id', 'item_id', 'cost_per_unit'], whereSql: 'supplier_id = $1', params: id => [id], deleteOrder: 5, cascade: true },
            { key: 'item_location_suppliers', table: 'item_location_suppliers', label: 'Location–Item Links', previewCols: ['id', 'item_id', 'location_id'], whereSql: 'supplier_id = $1', params: id => [id], deleteOrder: 6 },
            { key: 'pending_orders', table: 'pending_orders', label: 'Pending Orders', previewCols: ['id', 'status', 'created_at'], whereSql: 'supplier_id = $1', params: id => [id], deleteOrder: 10 },
            { key: 'purchase_orders', table: 'purchase_orders', label: 'Purchase Orders', previewCols: ['id', 'status', 'created_at'], whereSql: 'supplier_id = $1', params: id => [id], deleteOrder: 15 },
            { key: 'supplier_row', table: 'suppliers', label: '⚠️ Supplier Record Itself', previewCols: ['id', 'name', 'contact_email'], whereSql: 'id = $1', params: id => [id], deleteOrder: 100, isMainRow: true },
        ],
    },

    support_ticket: {
        label: 'Support Ticket', icon: '🎫', mainTable: 'support_tickets',
        listSql: (orgId, loc, q) => {
            const p: any[] = [orgId]; let sql = 'SELECT id, subject, status, created_at FROM support_tickets WHERE organization_id = $1';
            if (q) { p.push(`%${q}%`); sql += ` AND subject ILIKE $${p.length}`; }
            sql += ' ORDER BY created_at DESC LIMIT 100'; return [sql, p];
        },
        displayName: r => r.subject,
        subLabel: r => r.status,
        linked: [
            { key: 'support_messages', table: 'support_messages', label: 'Messages', previewCols: ['id', 'message', 'created_at'], whereSql: 'ticket_id = $1', params: id => [id], deleteOrder: 5, cascade: true },
            { key: 'ticket_row', table: 'support_tickets', label: '⚠️ Ticket Record Itself', previewCols: ['id', 'subject', 'status'], whereSql: 'id = $1', params: id => [id], deleteOrder: 100, isMainRow: true },
        ],
    },

    price_override: {
        label: 'Price Override', icon: '💲', mainTable: 'item_location_prices',
        listSql: (orgId, loc, q) => {
            const p: any[] = [orgId];
            let sql = `SELECT ilp.id, ilp.item_id, ilp.location_id, ilp.sale_price, i.name AS item_name, l.name AS location_name FROM item_location_prices ilp JOIN items i ON ilp.item_id = i.id JOIN locations l ON ilp.location_id = l.id WHERE ilp.organization_id = $1`;
            if (loc) { p.push(loc); sql += ` AND ilp.location_id = $${p.length}`; }
            if (q) { p.push(`%${q}%`); sql += ` AND i.name ILIKE $${p.length}`; }
            sql += ' ORDER BY i.name LIMIT 100'; return [sql, p];
        },
        displayName: r => r.item_name || `Item #${r.item_id}`,
        subLabel: r => `${r.location_name || 'Location #' + r.location_id} · $${r.sale_price}`,
        linked: [
            { key: 'price_row', table: 'item_location_prices', label: '⚠️ Price Override Record', previewCols: ['id', 'item_id', 'location_id', 'sale_price'], whereSql: 'id = $1', params: id => [id], deleteOrder: 100, isMainRow: true },
        ],
    },
};

// AUTH guard
async function requireSuperAdmin() {
    const session = await getSession();
    if (!session || !(session as any).isSuperAdmin) return null;
    return session;
}

export async function GET(req: NextRequest) {
    if (!await requireSuperAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const { searchParams } = req.nextUrl;
    const action = searchParams.get('action') || '';

    try {
        if (action === 'orgs') {
            const q = searchParams.get('q') || '';
            const p: any[] = [];
            let sql = 'SELECT id, name, subdomain, billing_status, subscription_plan, created_at FROM organizations WHERE 1=1';
            if (q) { p.push(`%${q}%`); sql += ` AND (name ILIKE $${p.length} OR subdomain ILIKE $${p.length})`; }
            sql += ' ORDER BY name LIMIT 200';
            const rows = await db.query(sql, p);
            return NextResponse.json({ orgs: rows });
        }

        if (action === 'locations') {
            const orgId = parseInt(searchParams.get('orgId') || '0');
            if (!orgId) return NextResponse.json({ locations: [] });
            const rows = await db.query('SELECT id, name, address FROM locations WHERE organization_id = $1 ORDER BY name', [orgId]);
            return NextResponse.json({ locations: rows });
        }

        if (action === 'records') {
            const type = searchParams.get('type') || '';
            const orgId = parseInt(searchParams.get('orgId') || '0');
            const locationId = searchParams.get('locationId') ? parseInt(searchParams.get('locationId')!) : null;
            const q = searchParams.get('q') || '';
            const def = OBJECT_TYPES[type];
            if (!def) return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
            const [sql, params] = def.listSql(orgId, locationId, q);
            const rows = await db.query(sql, params);
            return NextResponse.json({ records: rows, displayName: def.displayName.toString(), subLabel: def.subLabel?.toString() });
        }

        if (action === 'linked') {
            const type = searchParams.get('type') || '';
            const parentId = parseInt(searchParams.get('id') || '0');
            const def = OBJECT_TYPES[type];
            if (!def || !parentId) return NextResponse.json({ error: 'Invalid params' }, { status: 400 });

            const groups = await Promise.all(def.linked.map(async g => {
                try {
                    const countRow = await db.one(`SELECT COUNT(*) AS cnt FROM ${g.table} WHERE ${g.whereSql}`, g.params(parentId));
                    const count = parseInt(countRow?.cnt || '0');
                    const rows = count > 0
                        ? await db.query(`SELECT ${g.previewCols.join(', ')} FROM ${g.table} WHERE ${g.whereSql} LIMIT 5`, g.params(parentId))
                        : [];
                    return { key: g.key, table: g.table, label: g.label, previewCols: g.previewCols, count, rows, cascade: g.cascade ?? false, isMainRow: g.isMainRow ?? false };
                } catch {
                    return { key: g.key, table: g.table, label: g.label, previewCols: g.previewCols, count: 0, rows: [], cascade: g.cascade ?? false, isMainRow: g.isMainRow ?? false, error: true };
                }
            }));

            return NextResponse.json({ groups });
        }

        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    } catch (err: any) {
        console.error('[db-cleanup GET]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    if (!await requireSuperAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    try {
        const { mainType, mainId, selectedKeys } = await req.json() as {
            mainType: string; mainId: number; selectedKeys: string[];
        };

        const def = OBJECT_TYPES[mainType];
        if (!def || !mainId || !selectedKeys?.length) {
            return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
        }

        const toDelete = def.linked
            .filter(g => selectedKeys.includes(g.key))
            .sort((a, b) => a.deleteOrder - b.deleteOrder);

        const client = await pool.connect();
        const results: { key: string; table: string; rowCount: number }[] = [];

        try {
            await client.query('BEGIN');
            for (const g of toDelete) {
                const res = await client.query(`DELETE FROM ${g.table} WHERE ${g.whereSql}`, g.params(mainId));
                results.push({ key: g.key, table: g.table, rowCount: res.rowCount ?? 0 });
            }
            await client.query('COMMIT');
        } catch (err: any) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }

        return NextResponse.json({ ok: true, results });
    } catch (err: any) {
        console.error('[db-cleanup POST]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
