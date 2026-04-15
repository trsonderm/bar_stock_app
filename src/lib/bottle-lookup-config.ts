export interface BottleLookupConfig {
    local_lookup_enabled: boolean;
    external_lookup_enabled: boolean;
    external_lookup_provider: 'upcitemdb' | 'barcodelookup' | 'open_food_facts' | 'none';
    upcitemdb_api_key: string;
    barcodelookup_api_key: string;
    auto_fill_on_scan: boolean;
    save_scanned_barcodes: boolean;
    fallback_to_manual: boolean;
}

export const DEFAULT_BOTTLE_LOOKUP_CONFIG: BottleLookupConfig = {
    local_lookup_enabled: true,
    external_lookup_enabled: false,
    external_lookup_provider: 'upcitemdb',
    upcitemdb_api_key: '',
    barcodelookup_api_key: '',
    auto_fill_on_scan: true,
    save_scanned_barcodes: true,
    fallback_to_manual: true,
};
