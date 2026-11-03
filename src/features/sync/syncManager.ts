
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { getPendingOperations, removePendingOperation } from '../../lib/indexedDB';
import { atomicAddItem, updateItemStatus } from '../../services/shoppingService';

export function subscribeToFamily(familyId: string, onChange: () => void) {
  if (!isSupabaseConfigured || !supabase) {
    return () => {};
  }

  const channel = supabase
    .channel('family-shopping-' + familyId)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'shopping_items',
        filter: 'family_id=eq.' + familyId
      },
      () => {
        onChange();
      }
    )
    .subscribe();

  return () => {
    if (supabase) supabase.removeChannel(channel);
  };
}

export async function syncPendingOperations(): Promise<number> {
  if (!isSupabaseConfigured || !supabase) return 0;
  const ops = await getPendingOperations();
  if (!ops.length) return 0;

  let syncedCount = 0;
  for (const op of ops) {
    try {
      if (op.type === 'add_item') {
        await atomicAddItem(
          op.family_id,
          op.payload.productId,
          op.payload.customName,
          op.payload.normalizedName,
          op.payload.quantity,
          op.payload.unit
        );
      } else if (op.type === 'purchase_item' || op.type === 'remove_item') {
        await updateItemStatus(
          op.family_id,
          op.payload.itemId,
          op.payload.newStatus,
          op.payload.reason
        );
      }
      await removePendingOperation(op.id);
      syncedCount++;
    } catch (err) {
      console.error('Falha ao sincronizar operacao pendente:', op, err);
    }
  }
  return syncedCount;
}