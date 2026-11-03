import type { ShoppingItem, ItemStatus } from '../types/database';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { saveCachedItems, getCachedItems, addPendingOperation } from '../lib/indexedDB';

export async function fetchShoppingItems(familyId: string): Promise<ShoppingItem[]> {
  if (!isSupabaseConfigured || !supabase) {
    const cached = await getCachedItems(familyId);
    return cached as ShoppingItem[];
  }
  const { data, error } = await supabase
    .from('shopping_items')
    .select('*, product:products(*)')
    .eq('family_id', familyId)
    .neq('status', 'removed')
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('Erro ao buscar itens, usando cache local:', error.message);
    return (await getCachedItems(familyId)) as ShoppingItem[];
  }
  await saveCachedItems(familyId, data || []);
  return (data || []) as ShoppingItem[];
}

export async function atomicAddItem(
  familyId: string,
  productId: string | null,
  customName: string | null,
  normalizedName: string,
  quantity: number,
  unit: string
): Promise<ShoppingItem> {
  const opId = 'op-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
  if (!isSupabaseConfigured || !supabase) {
    await addPendingOperation({
      id: opId,
      family_id: familyId,
      type: 'add_item',
      payload: { productId, customName, normalizedName, quantity, unit },
      created_at: new Date().toISOString()
    });
    return {
      id: 'temp-' + opId,
      family_id: familyId,
      product_id: productId,
      custom_name: customName,
      normalized_name: normalizedName,
      quantity,
      unit,
      status: 'pending',
      created_by: 'local',
      updated_by: 'local',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      removed_at: null
    };
  }
  const { data, error } = await supabase.rpc('add_or_update_shopping_item', {
    p_family_id: familyId,
    p_product_id: productId,
    p_custom_name: customName,
    p_normalized_name: normalizedName,
    p_quantity: quantity,
    p_unit: unit,
    p_operation_id: opId
  });
  if (error) throw new Error(error.message);
  return data as ShoppingItem;
}

export async function updateItemStatus(
  familyId: string,
  itemId: string,
  newStatus: ItemStatus,
  reason?: string
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    await addPendingOperation({
      id: 'op-' + Date.now(),
      family_id: familyId,
      type: newStatus === 'removed' ? 'remove_item' : 'purchase_item',
      payload: { itemId, newStatus, reason },
      created_at: new Date().toISOString()
    });
    return;
  }
  const { error } = await supabase.rpc('update_shopping_item_status', {
    p_family_id: familyId,
    p_item_id: itemId,
    p_new_status: newStatus,
    p_reason: reason || null
  });
  if (error) throw new Error(error.message);
}
