import type { Product } from '../../types/database';
import { normalizeProductName } from '../../lib/normalizer';

export interface CatalogItemDefinition {
  id: string;
  name: string;
  icon: string;
  category: Product['category'];
  default_unit: string;
}

export const INITIAL_CATALOG_ITEMS: CatalogItemDefinition[] = [
  // Grãos e básicos
  { id: 'prod-arroz', name: 'Arroz', icon: '🍚', category: 'graos_basicos', default_unit: 'pacote' },
  { id: 'prod-feijao', name: 'Feijão', icon: '🫘', category: 'graos_basicos', default_unit: 'pacote' },
  { id: 'prod-macarrao', name: 'Macarrão', icon: '🍝', category: 'graos_basicos', default_unit: 'pacote' },
  { id: 'prod-farinha', name: 'Farinha de trigo', icon: '🌾', category: 'graos_basicos', default_unit: 'kg' },
  { id: 'prod-acucar', name: 'Açúcar', icon: '🥄', category: 'graos_basicos', default_unit: 'kg' },
  { id: 'prod-sal', name: 'Sal', icon: '�싂', category: 'graos_basicos', default_unit: 'kg' },
  { id: 'prod-cafe', name: 'Café', icon: '☕', category: 'graos_basicos', default_unit: 'pacote' },
  { id: 'prod-oleo', name: 'Óleo de cozinha', icon: '🫒', category: 'graos_basicos', default_unit: 'unidade' },

  // Laticínios e refrigerados
  { id: 'prod-leite', name: 'Leite', icon: '🥛', category: 'laticinios_refrigerados', default_unit: 'unidade' },
  { id: 'prod-iogurte-grego-zero', name: 'Iogurte grego zero', icon: '🥣', category: 'laticinios_refrigerados', default_unit: 'unidade' },
  { id: 'prod-iogurte-natural', name: 'Iogurte natural', icon: '🥣', category: 'laticinios_refrigerados', default_unit: 'unidade' },
  { id: 'prod-queijo', name: 'Queijo', icon: '�샀', category: 'laticinios_refrigerados', default_unit: 'g' },
  { id: 'prod-manteiga', name: 'Manteiga', icon: '�죈', category: 'laticinios_refrigerados', default_unit: 'pote' },
  { id: 'prod-ovos', name: 'Ovos', icon: '🥚', category: 'laticinios_refrigerados', default_unit: 'dúzia' },

  // Frutas
  { id: 'prod-banana', name: 'Banana', icon: '🍌', category: 'frutas', default_unit: 'dúzia' },
  { id: 'prod-coco-seco', name: 'Coco seco', icon: '🥥', category: 'frutas', default_unit: 'unidade' },
  { id: 'prod-maca', name: 'Maçã', icon: '🍎', category: 'frutas', default_unit: 'kg' },
  { id: 'prod-laranja', name: 'Laranja', icon: '🍊', category: 'frutas', default_unit: 'kg' },
  { id: 'prod-limao', name: 'Limão', icon: '🍋', category: 'frutas', default_unit: 'unidade' },
  { id: 'prod-mamao', name: 'Mamão', icon: '🍈', category: 'frutas', default_unit: 'unidade' },
  { id: 'prod-abacate', name: 'Abacate', icon: '🥑', category: 'frutas', default_unit: 'unidade' },
  { id: 'prod-uva', name: 'Uva', icon: '🍇', category: 'frutas', default_unit: 'caixa' },

  // Hortifruti
  { id: 'prod-tomate', name: 'Tomate', icon: '🍅', category: 'hortifruti', default_unit: 'kg' },
  { id: 'prod-batata', name: 'Batata', icon: '🥔', category: 'hortifruti', default_unit: 'kg' },
  { id: 'prod-cebola', name: 'Cebola', icon: '🧅', category: 'hortifruti', default_unit: 'kg' },
  { id: 'prod-alho', name: 'Alho', icon: '🧄', category: 'hortifruti', default_unit: 'cabeça' },
  { id: 'prod-cenoura', name: 'Cenoura', icon: '🥕', category: 'hortifruti', default_unit: 'kg' },
  { id: 'prod-alface', name: 'Alface', icon: '🥬', category: 'hortifruti', default_unit: 'maço' },
  { id: 'prod-brocolis', name: 'Brócolis', icon: '🥦', category: 'hortifruti', default_unit: 'unidade' },

  // Proteínas
  { id: 'prod-frango', name: 'Frango', icon: '🍗', category: 'proteinas', default_unit: 'kg' },
  { id: 'prod-carne', name: 'Carne bovina', icon: '🥩', category: 'proteinas', default_unit: 'kg' },
  { id: 'prod-peixe', name: 'Peixe', icon: '🐟', category: 'proteinas', default_unit: 'kg' },

  // Padaria
  { id: 'prod-pao-frances', name: 'Pão francês', icon: '🥖', category: 'padaria', default_unit: 'unidade' },
  { id: 'prod-pao-forma', name: 'Pão de forma', icon: '🍞', category: 'padaria', default_unit: 'pacote' },

  // Limpeza
  { id: 'prod-detergente', name: 'Detergente', icon: '🧴', category: 'limpeza', default_unit: 'frasco' },
  { id: 'prod-sabao-po', name: 'Sabão em pó', icon: '🧺', category: 'limpeza', default_unit: 'caixa' },
  { id: 'prod-desinfetante', name: 'Desinfetante', icon: '🧴', category: 'limpeza', default_unit: 'frasco' },
  { id: 'prod-esponja', name: 'Esponja', icon: '🧽', category: 'limpeza', default_unit: 'unidade' },
  { id: 'prod-papel-higienico', name: 'Papel higiênico', icon: '🧻', category: 'limpeza', default_unit: 'pacote' },

  // Higiene pessoal
  { id: 'prod-pasta-dente', name: 'Pasta de dente', icon: '🪥', category: 'higiene_pessoal', default_unit: 'tubo' },
  { id: 'prod-sabonete', name: 'Sabonete', icon: '🧼', category: 'higiene_pessoal', default_unit: 'unidade' },
  { id: 'prod-shampoo', name: 'Shampoo', icon: '🧴', category: 'higiene_pessoal', default_unit: 'frasco' },
];

export const INITIAL_CATALOG: Product[] = INITIAL_CATALOG_ITEMS.map((item) => ({
  ...item,
  normalized_name: normalizeProductName(item.name),
  is_global: true,
  created_by: null,
}));

export const FREQUENT_SUGGESTIONS: Product[] = [
  INITIAL_CATALOG.find((p) => p.name === 'Arroz')!
  || INITIAL_CATALOG[0],
  INITIAL_CATALOG.find((p) => p.name === 'Feijão')!
  || INITIAL_CATALOG[1],
  INITIAL_CATALOG.find((p) => p.name === 'Leite')!
  || INITIAL_CATALOG[8],
  INITIAL_CATALOG.find((p) => p.name === 'Iogurte grego zero')!
  || INITIAL_CATALOG[9],
  INITIAL_CATALOG.find((p) => p.name === 'Banana')!
  || INITIAL_CATALOG[14],
  INITIAL_CATALOG.find((p) => p.name === 'Coco seco')!
  || INITIAL_CATALOG[15],
  INITIAL_CATALOG.find((p) => p.name === 'Maçã')!
  || INITIAL_CATALOG[16],
];
