import Dexie from 'dexie';

export const db = new Dexie('StockAppDatabase');

db.version(3).stores({
    products: '++id, code, barcode, barcode_secondary, provider_code, description, brand', // Use code, barcode and provider_code as search indexes
    sync_metadata: 'key, last_sync',
    offline_caches: 'id, data, timestamp', // id will be `egreso_cache_${id}`, etc.
    pending_syncs: '++id, document_id, type, data, timestamp' // for offline scan queues
});

export default db;
