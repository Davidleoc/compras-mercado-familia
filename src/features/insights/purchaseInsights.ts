import type { AuditEvent } from '../../types/database';
import { normalizeProductName } from '../../lib/normalizer';

const DAY = 24 * 60 * 60 * 1000;
// Compras do mesmo produto com menos de 12h de diferença contam como uma só
const SAME_TRIP_GAP = 12 * 60 * 60 * 1000;
// Itens comprados até 4h antes da última compra fazem parte da mesma ida ao mercado
const TRIP_WINDOW = 4 * 60 * 60 * 1000;

export interface PurchaseRecord {
  normalized_name: string;
  name: string;
  product_id: string | null;
  quantity: number;
  unit: string;
  at: number;
}

export interface RunningLowSuggestion extends PurchaseRecord {
  daysSinceLast: number;
  averageDays: number;
}

/** Extrai as compras do histórico (eventos "item_purchased" com nome do produto). */
export function purchasesFromEvents(events: AuditEvent[]): PurchaseRecord[] {
  const out: PurchaseRecord[] = [];
  for (const ev of events) {
    if (ev.action !== 'item_purchased') continue;
    const data = ev.after_data || {};
    const name: string | undefined = data.product_name || data.name;
    if (!name) continue;
    out.push({
      normalized_name: data.normalized_name || normalizeProductName(name),
      name,
      product_id: data.product_id ?? null,
      quantity: Number(data.quantity) || 1,
      unit: data.unit || 'unidade',
      at: new Date(ev.created_at).getTime(),
    });
  }
  return out.sort((a, b) => a.at - b.at);
}

/**
 * Produtos comprados com frequência que já passaram do intervalo de costume
 * e não estão na lista. Precisa de pelo menos 2 compras em dias diferentes.
 */
export function getRunningLow(
  purchases: PurchaseRecord[],
  pendingNormalizedNames: Set<string>,
  now: number = Date.now()
): RunningLowSuggestion[] {
  const byProduct = new Map<string, PurchaseRecord[]>();
  for (const p of purchases) {
    const list = byProduct.get(p.normalized_name) || [];
    const last = list[list.length - 1];
    if (last && p.at - last.at < SAME_TRIP_GAP) {
      list[list.length - 1] = p;
    } else {
      list.push(p);
    }
    byProduct.set(p.normalized_name, list);
  }

  const result: (RunningLowSuggestion & { ratio: number })[] = [];
  for (const [norm, list] of byProduct) {
    if (list.length < 2 || pendingNormalizedNames.has(norm)) continue;
    const first = list[0];
    const last = list[list.length - 1];
    const averageMs = (last.at - first.at) / (list.length - 1);
    if (averageMs < DAY) continue;
    const sinceMs = now - last.at;
    if (sinceMs < averageMs) continue;
    result.push({
      ...last,
      daysSinceLast: Math.floor(sinceMs / DAY),
      averageDays: Math.round(averageMs / DAY),
      ratio: sinceMs / averageMs,
    });
  }
  return result
    .sort((a, b) => b.ratio - a.ratio)
    .map(({ ratio: _ratio, ...rest }) => rest);
}

/** Itens da última ida ao mercado (um por produto). */
export function getLastTrip(purchases: PurchaseRecord[]): PurchaseRecord[] {
  if (!purchases.length) return [];
  const latest = purchases[purchases.length - 1].at;
  const seen = new Map<string, PurchaseRecord>();
  for (const p of purchases) {
    if (latest - p.at <= TRIP_WINDOW) seen.set(p.normalized_name, p);
  }
  return [...seen.values()];
}
