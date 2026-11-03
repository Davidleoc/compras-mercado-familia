import { describe, it, expect } from 'vitest';
import { normalizeProductName, areProductsEquivalent } from '../../src/lib/normalizer';

describe('normalizer', () => {
  it('normalizes casing and trailing spaces', () => {
    expect(normalizeProductName('  Arroz  ')).toBe('arroz');
  });

  it('removes accents', () => {
    expect(normalizeProductName('Feijão')).toBe('feijao');
    expect(normalizeProductName('Maçã')).toBe('maca');
  });

  it('collapses multiple spaces', () => {
    expect(normalizeProductName('Iogurte   grego    zero')).toBe('iogurte grego zero');
  });

  it('distinguishes relevant variations correctly', () => {
    expect(areProductsEquivalent('Iogurte grego zero', 'Iogurte natural')).toBe(false);
    expect(areProductsEquivalent('Leite Integral', 'leite integral')).toBe(true);
    expect(areProductsEquivalent('Leite Integral', 'Leite Desnatado')).toBe(false);
  });
});
