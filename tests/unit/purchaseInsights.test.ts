import { describe, it, expect } from 'vitest';
import type { AuditEvent } from '../../src/types/database';
import { purchasesFromEvents, getRunningLow, getLastTrip } from '../../src/features/insights/purchaseInsights';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-03T12:00:00Z').getTime();

function bought(name: string, daysAgo: number, hoursAgo = 0): AuditEvent {
  return {
    id: `${name}-${daysAgo}-${hoursAgo}`,
    family_id: 'f',
    item_id: null,
    actor_id: 'local',
    action: 'item_purchased',
    before_data: null,
    after_data: { product_name: name, quantity: 1, unit: 'kg' },
    reason: null,
    created_at: new Date(NOW - daysAgo * DAY - hoursAgo * 3600000).toISOString(),
  };
}

describe('getRunningLow', () => {
  it('sugere banana comprada toda semana quando já passou uma semana', () => {
    const purchases = purchasesFromEvents([bought('Banana', 22), bought('Banana', 15), bought('Banana', 8)]);
    const result = getRunningLow(purchases, new Set(), NOW);
    expect(result.map((r) => r.name)).toEqual(['Banana']);
    expect(result[0].averageDays).toBe(7);
    expect(result[0].daysSinceLast).toBe(8);
  });

  it('não sugere se ainda está dentro do intervalo de costume', () => {
    const purchases = purchasesFromEvents([bought('Banana', 17), bought('Banana', 10), bought('Banana', 3)]);
    expect(getRunningLow(purchases, new Set(), NOW)).toEqual([]);
  });

  it('não sugere item que já está na lista', () => {
    const purchases = purchasesFromEvents([bought('Banana', 22), bought('Banana', 8)]);
    expect(getRunningLow(purchases, new Set(['banana']), NOW)).toEqual([]);
  });

  it('precisa de compras em dias diferentes', () => {
    const purchases = purchasesFromEvents([bought('Arroz', 30, 2), bought('Arroz', 30)]);
    expect(getRunningLow(purchases, new Set(), NOW)).toEqual([]);
  });
});

describe('getLastTrip', () => {
  it('pega só os itens da última ida ao mercado', () => {
    const purchases = purchasesFromEvents([bought('Arroz', 7), bought('Tomate', 1, 2), bought('Leite', 1)]);
    expect(getLastTrip(purchases).map((p) => p.name).sort()).toEqual(['Leite', 'Tomate']);
  });
});
