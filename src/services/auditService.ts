import type { AuditEvent } from '../types/database';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { getLocalAuditEvents } from '../lib/indexedDB';

export interface AuditFilters {
  action?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  actorId?: string;
}

export async function fetchAuditEvents(
  familyId: string,
  filters: AuditFilters,
  page: number = 1,
  pageSize: number = 20
): Promise<{ events: AuditEvent[]; total: number }> {
  if (!isSupabaseConfigured || !supabase) {
    let events = (await getLocalAuditEvents(familyId)) as AuditEvent[];
    if (filters.action) events = events.filter((e) => e.action === filters.action);
    const from = (page - 1) * pageSize;
    return { events: events.slice(from, from + pageSize), total: events.length };
  }
  let query = supabase
    .from('audit_events')
    .select('*, profiles:profiles(actor_id(display_name))', { count: 'exact' })
    .eq('family_id', familyId)
    .order('created_at', { ascending: false });
  if (filters.action) query = query.eq('action', filters.action);
  if (filters.startDate) query = query.gte('created_at', filters.startDate);
  if (filters.endDate) query = query.lte('created_at', filters.endDate);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, count, error } = await query.range(from, to);
  if (error) throw new Error(error.message);
  return { events: (data || []) as AuditEvent[], total: count || 0 };
}

export function exportEventsToCSV(events: AuditEvent[]): string {
  const headers = ['Data/Hora', 'Acao', 'Autor', 'Detalhes', 'Motivo'];
  const rows = events.map(e => [
    new Date(e.created_at).toLocaleString('pt-BR'),
    e.action,
    e.actor_name || e.actor_id,
    JSON.stringify(e.after_data || {}).split('"').join('""'),
    (e.reason || '').split('"').join('""')
  ]);
  return [headers, ...rows]
    .map(r => r.map(c => '"' + c + '"').join(';'))
    .join('\n');
}
