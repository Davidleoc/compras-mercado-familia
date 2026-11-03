export type FamilyRole = 'admin' | 'member';

export interface Profile {
  id: string;
  display_name: string;
  created_at: string;
}

export interface Family {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
}

export interface FamilyMember {
  family_id: string;
  user_id: string;
  role: FamilyRole;
  joined_at: string;
  profile?: Profile;
}

export interface FamilyInvite {
  id: string;
  family_id: string;
  token_hash: string;
  expires_at: string;
  uses_remaining: number;
  revoked_at: string | null;
  created_by: string;
  created_at: string;
}

export type ProductCategory =
  | 'graos_basicos'
  | 'laticinios_refrigerados'
  | 'frutas'
  | 'hortifruti'
  | 'proteinas'
  | 'padaria'
  | 'limpeza'
  | 'higiene_pessoal'
  | 'outros';

export interface Product {
  id: string;
  name: string;
  normalized_name: string;
  icon: string;
  category: ProductCategory;
  default_unit: string;
  is_global: boolean;
  created_by?: string | null;
}

export type ItemStatus = 'pending' | 'purchased' | 'removed';

export interface ShoppingItem {
  id: string;
  family_id: string;
  product_id: string | null;
  custom_name: string | null;
  normalized_name: string;
  quantity: number;
  unit: string;
  status: ItemStatus;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  removed_at: string | null;
  product?: Product;
  creator_name?: string;
}

export type AuditAction =
  | 'item_added'
  | 'quantity_changed'
  | 'item_purchased'
  | 'item_removed'
  | 'item_restored'
  | 'status_changed'
  | 'member_joined'
  | 'member_removed'
  | 'family_created';

export interface AuditEvent {
  id: string;
  family_id: string;
  item_id: string | null;
  actor_id: string;
  actor_name?: string;
  action: AuditAction;
  before_data: Record<string, any> | null;
  after_data: Record<string, any> | null;
  reason: string | null;
  created_at: string;
  operation_id?: string | null;
}

export type SyncState = 'synced' | 'syncing' | 'offline' | 'error';
