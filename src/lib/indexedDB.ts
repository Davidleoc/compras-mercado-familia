import { openDB, type IDBPDatabase } from 'idb';

export interface PendingOperation {
  id: string;
  family_id: string;
  type: 'add_item' | 'update_quantity' | 'purchase_item' | 'remove_item';
  payload: Record<string, any>;
  created_at: string;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB('mercado-em-familia', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('cache_items')) {
          db.createObjectStore('cache_items', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('pending_ops')) {
          db.createObjectStore('pending_ops', { keyPath: 'id' });
        }
      }
    });
  }
  return dbPromise;
}

export async function saveCachedItems(_familyId: string, items: any[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('cache_items', 'readwrite');
  for (const item of items) {
    await tx.store.put(item);
  }
  await tx.done;
}

export async function getCachedItems(familyId: string): Promise<any[]> {
  const db = await getDB();
  const all = await db.getAll('cache_items');
  return all.filter((i: any) => i.family_id === familyId && i.status !== 'removed');
}

export async function addPendingOperation(op: PendingOperation): Promise<void> {
  const db = await getDB();
  await db.put('pending_ops', op);
}

export async function getPendingOperations(): Promise<PendingOperation[]> {
  const db = await getDB();
  return db.getAll('pending_ops');
}

export async function removePendingOperation(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('pending_ops', id);
}
