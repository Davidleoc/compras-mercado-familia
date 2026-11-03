import type { ShoppingItem, ItemStatus, Product, AuditAction } from '../types/database';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  saveCachedItems,
  getCachedItems,
  getCachedItem,
  putCachedItem,
  addPendingOperation,
  addLocalAuditEvent
} from '../lib/indexedDB';

function newId(prefix: string) {
  return prefix + '-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
}

function itemName(item: ShoppingItem) {
  return item.product?.name || item.custom_name || 'Produto';
}

async function logLocalEvent(
  item: ShoppingItem,
  action: AuditAction,
  before: Record<string, any> | null,
  reason?: string
) {
  await addLocalAuditEvent({
    id: newId('ev'),
    family_id: item.family_id,
    item_id: item.id,
    actor_id: 'local',
    actor_name: 'Você',
    action,
    before_data: before,
    after_data: {
      product_name: itemName(item),
      product_id: item.product_id,
      normalized_name: item.normalized_name,
      quantity: item.quantity,
      unit: item.unit,
      status: item.status
    },
    reason: reason || null,
    created_at: new Date().toISOString()
  });
}

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
  unit: string,
  product?: Product
): Promise<ShoppingItem> {
  const opId = newId('op');
  if (!isSupabaseConfigured || !supabase) {
    await addPendingOperation({
      id: opId,
      family_id: familyId,
      type: 'add_item',
      payload: { productId, customName, normalizedName, quantity, unit },
      created_at: new Date().toISOString()
    });

    const now = new Date().toISOString();
    const existing = (await getCachedItems(familyId)).find(
      (i: ShoppingItem) => i.status === 'pending' && i.normalized_name === normalizedName
    ) as ShoppingItem | undefined;

    // Item já está pendente: soma a quantidade em vez de duplicar
    if (existing) {
      const before = { product_name: itemName(existing), quantity: existing.quantity, unit: existing.unit };
      const updated: ShoppingItem = { ...existing, quantity: existing.quantity + quantity, updated_at: now };
      await putCachedItem(updated);
      await logLocalEvent(updated, 'quantity_changed', before);
      return updated;
    }

    const item: ShoppingItem = {
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
      created_at: now,
      updated_at: now,
      removed_at: null,
      product
    };
    await putCachedItem(item);
    await logLocalEvent(item, 'item_added', null);
    return item;
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

export async function updateItemQuantity(
  familyId: string,
  itemId: string,
  quantity: number
): Promise<void> {
  if (quantity <= 0) throw new Error('A quantidade precisa ser maior que zero.');
  if (!isSupabaseConfigured || !supabase) {
    await addPendingOperation({
      id: newId('op'),
      family_id: familyId,
      type: 'update_quantity',
      payload: { itemId, quantity },
      created_at: new Date().toISOString()
    });

    const existing = (await getCachedItem(itemId)) as ShoppingItem | undefined;
    if (!existing) return;
    const before = { product_name: itemName(existing), quantity: existing.quantity, unit: existing.unit };
    const updated: ShoppingItem = { ...existing, quantity, updated_at: new Date().toISOString() };
    await putCachedItem(updated);
    await logLocalEvent(updated, 'quantity_changed', before);
    return;
  }
  const { error } = await supabase.rpc('set_shopping_item_quantity', {
    p_family_id: familyId,
    p_item_id: itemId,
    p_quantity: quantity
  });
  if (error) throw new Error(error.message);
}

export async function updateItemStatus(
  familyId: string,
  itemId: string,
  newStatus: ItemStatus,
  reason?: string
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    await addPendingOperation({
      id: newId('op'),
      family_id: familyId,
      type: newStatus === 'removed' ? 'remove_item' : 'purchase_item',
      payload: { itemId, newStatus, reason },
      created_at: new Date().toISOString()
    });

    const existing = (await getCachedItem(itemId)) as ShoppingItem | undefined;
    if (!existing) return;
    const now = new Date().toISOString();
    const updated: ShoppingItem = {
      ...existing,
      status: newStatus,
      updated_at: now,
      removed_at: newStatus === 'removed' ? now : null
    };
    await putCachedItem(updated);
    const action: AuditAction =
      newStatus === 'removed' ? 'item_removed' : newStatus === 'purchased' ? 'item_purchased' : 'item_restored';
    await logLocalEvent(updated, action, { status: existing.status }, reason);
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
