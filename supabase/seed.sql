-- Seed do Catalogo Inicial de Produtos (Português Brasileiro)
INSERT INTO public.products (id, name, normalized_name, icon, category, default_unit, is_global)
VALUES
-- Grãos e básicos
('ca110000-0000-0000-0000-000000000001', 'Arroz', 'arroz', '🕚\', 'graos_basicos', 'pacote', true),
('ca110000-0000-0000-0000-000000000002', 'Feijão', 'feijao', '🎙', 'graos_basicos', 'pacote', true),
('ca110000-0000-0000-0000-000000000003', 'Macarrão', 'macarrao', '🕝l', 'graos_basicos', 'pacote', true),
('ca110000-0000-0000-0000-000000000004', 'Farinha de trigo', 'farinha de trigo', '🍾', 'graos_basicos', 'kg', true),
('ca110000-0000-0000-0000-000000000005', '@çúcar', 'acucar', '🕔', 'graos_basicos', 'kg', true),
('ca110000-0000-0000-0000-000000000006', 'Sal', 'sal', '🖱', 'graos_basicos', 'kg', true),
('ca110000-0000-0000-0000-000000000007', 'Café', 'cafe', '☕️', 'graos_basicos', 'pacote', true),
('ca110000-0000-0000-0000-000000000008', 'Óleo de cozinha', 'oleo de cozinha', '����2', 'graos_basicos', 'unidade', true),
-- Laticínios e refrigerados
('ca110000-0000-0000-0000-000000000009', 'Leite', 'leite', '🕛', 'laticinios_refrigerados', 'unidade', true),
('ca110000-0000-0000-0000-000000000010', 'Iogurte grego zero', 'iogurte grego zero', '🕣', 'laticinios_refrigerados', 'unidade', true),
('ca110000-0000-0000-0000-000000000011', 'Iogurte natural', 'iogurte natural', '🕣', 'laticinios_refrigerados', 'unidade', true),
('ca110000-0000-0000-0000-000000000012', 'Queijo', 'queijo', '🕰', 'laticinios_refrigerados', 'g', true),
('ca110000-0000-0000-0000-000000000013', 'Manteiga', 'manteiga', '🕰', 'laticinios_refrigerados', 'pote', true),
('ca110000-0000-0000-0000-000000000014', 'Ovos', 'ovos', '🕚', 'laticinios_refrigerados', 'dúzia', true),
-- Frutas
('ca110000-0000-0000-0000-000000000015', 'Banana', 'banana', '🏌', 'frutas', 'dúzia', true),
('ca110000-0000-0000-0000-000000000016', 'Coco seco', 'coco seco', '🕥', 'frutas', 'unidade', true),
('ca110000-0000-0000-0000-000000000017', 'Maçã', 'maca', '����', 'frutas', 'kg', true),
('ca110000-0000-0000-0000-000000000018', 'Laranja', 'laranja', '🏊', 'frutas', 'kg', true),
('ca110000-0000-0000-0000-000000000019', 'Limão', 'limao', '🏋', 'frutas', 'unidade', true),
('ca110000-0000-0000-0000-000000000020', 'Mamão', 'mamao', '🏏', 'frutas', 'unidade', true),
('ca110000-0000-0000-0000-000000000021', 'Abacate', 'abacate', '🕕', 'frutas', 'unidade', true),
('ca110000-0000-0000-0000-000000000022', 'Uva', 'uva', '����', 'frutas', 'caixa', true)
-- caso já exista, não substituir
ON CONFLICT (id) DO NOTHING;