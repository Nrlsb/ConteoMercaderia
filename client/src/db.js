import Dexie from 'dexie';

export const db = new Dexie('StockAppDatabase');

db.version(1).stores({
    products: '++id, code, barcode, description, brand', // Use code and barcode as search indexes
    sync_metadata: 'key, last_sync'
});

export default db;
