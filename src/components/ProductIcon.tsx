import type { Product } from '../types/database';
import { INITIAL_CATALOG } from '../features/products/catalog';

// Ícones desenhados para produtos que não têm emoji próprio.
// No catálogo e nos itens, eles são guardados como "svg:<nome>".
const CUSTOM_ICONS: Record<string, { label: string; svg: React.ReactNode }> = {
  requeijao: {
    label: 'Requeijão',
    svg: (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        {/* copo */}
        <path d="M6 11h20l-1.6 15.2A3 3 0 0 1 21.4 29H10.6a3 3 0 0 1-3-2.8z" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1" />
        {/* creme */}
        <path d="M6.6 16h18.8l-1 9.9A2.4 2.4 0 0 1 22 28H10a2.4 2.4 0 0 1-2.4-2.1z" fill="#fff7e6" />
        {/* rótulo */}
        <path d="M7.1 17.5h17.8l-.6 5.5H7.7z" fill="#1d4ed8" />
        <rect x="11" y="19" width="10" height="2.4" rx="1.2" fill="#facc15" />
        {/* tampa */}
        <rect x="4.5" y="6" width="23" height="5.5" rx="2" fill="#2563eb" />
        <rect x="6" y="7" width="20" height="1.4" rx=".7" fill="#60a5fa" />
      </svg>
    ),
  },
  'leite-caixa': {
    label: 'Leite de caixinha (1 litro)',
    svg: (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        {/* topo da caixa */}
        <path d="M9 9.5 12 3h8l3 6.5z" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1" strokeLinejoin="round" />
        <rect x="13" y="1.6" width="6" height="2" rx=".6" fill="#2563eb" />
        {/* corpo */}
        <rect x="9" y="9.5" width="14" height="20" rx="1.5" fill="#ffffff" stroke="#94a3b8" strokeWidth="1" />
        <rect x="9.5" y="16" width="13" height="8.5" fill="#3b82f6" />
        {/* gota de leite */}
        <path d="M16 12.2c1.6 2 2.4 3.2 2.4 4.3a2.4 2.4 0 0 1-4.8 0c0-1.1.8-2.3 2.4-4.3z" fill="#ffffff" stroke="#3b82f6" strokeWidth=".9" />
        <text x="16" y="22.6" textAnchor="middle" fontSize="5.2" fontWeight="700" fill="#ffffff" fontFamily="system-ui, sans-serif">1L</text>
      </svg>
    ),
  },
};

export const CUSTOM_ICON_KEYS = Object.keys(CUSTOM_ICONS).map((k) => 'svg:' + k);

/** Usa sempre o ícone atual do catálogo, para itens salvos antes de um ícone mudar. */
export function resolveProductIcon(product?: Pick<Product, 'id' | 'icon'> | null, fallback = '📦'): string {
  if (!product) return fallback;
  const fromCatalog = INITIAL_CATALOG.find((p) => p.id === product.id);
  return fromCatalog?.icon || product.icon || fallback;
}

export function ProductIcon({ icon, className }: { icon: string; className?: string }) {
  if (icon.startsWith('svg:')) {
    const custom = CUSTOM_ICONS[icon.slice(4)];
    if (custom) {
      return (
        <span className={`custom-icon ${className || ''}`} role="img" aria-label={custom.label} title={custom.label}>
          {custom.svg}
        </span>
      );
    }
    return <span className={className}>📦</span>;
  }
  return <span className={className}>{icon}</span>;
}
