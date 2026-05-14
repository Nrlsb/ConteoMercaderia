import Dexie from 'dexie';

export const db = new Dexie('StockAppDatabase');

db.version(4).stores({
    products: '++id, code, barcode, barcode_secondary, provider_code, description, brand, counting_category', // Added counting_category index
    sync_metadata: 'key, last_sync',
    offline_caches: 'id, data, timestamp',
    pending_syncs: '++id, document_id, type, data, timestamp'
});

export default db;
