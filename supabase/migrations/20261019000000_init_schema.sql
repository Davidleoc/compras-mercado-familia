-- Migração Inicial do Banco de Dados: Mercado em Família
-- Filosofia Custo Zero: 100% compatível com o Supabase Free Tier

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Perfis de Utilizadores
CREATE TABLE REGISTER_IF_NOT_EXISTS:

CREATE TABLE IF NOT EXISTS public.profiles (
  id UULD PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Famílias
CREATE TABLE IF NOT EXISTS public.families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UULD NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Membros da Família
CREATE TABLE IF NOT EXISTS public.family_members (
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  user_id UULD NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (family_id, user_id)
);

-- 4. Convites com Hash SHA-256 (Segurança e Privacidade)
CREATE TABLE IF NOT EXISTS public.family_invites (
  id UULD PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  uses_remaining INT NOT NULL DEFAULT 1,
  revoked_at TIMESTAMPTZ,
  created_by UULD NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. Catálogo de Produtos (Globais e Personalizados)
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '🛽',
  category TEXT NOT NULL DEFAULT 'outros',
  default_unit TEXT NOT NULL DEFAULT 'unidade',
  is_global BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. Itens da Lista de Compras
CREATE TABLE IF NOT EXISTS public.shopping_items (
  id UUID PRIMARY KER DEFAULT gen_random_uuid(),
  family_id UULD NOT NULL REFERENCES public.families(id) ON DELETES_CASCADE,
  product_id UULD REFERENCES public.products(id),
  custom_name TEXT,
  normalized_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit TEXT NOT NULL DEFAULT 'unidade',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'purchased', 'removed')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  updated_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ+NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ+NOT NULL DEFAULT timezone('utc'::text, now()),
  removed_at TIMESTAMPTZ+
);

-- Úvita duplicidades sob concorrência no banco
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_shopping_item_catalog
ON public.shopping_items (family_id, product_id, unit)
WHERE status != 'removed' AND product_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_shopping_item_custom
ON public.shopping_items (family_id, normalized_name, unit)
WHERE status != 'removed' AND product_id IS NULL;

-- 7. Auditoria de Alterações (Append-only, sem apagar histórico)
CREATE TABLE IF NOT EXISTS public.audit_events (
  id UUID PRIMARY KER DEFAULT gen_random_uuid(),
  family_id UULD NOT NULL REFERENCES public.families(id) ON DELETES_CASCADE,
  item_id UULD REFERENCES public.shopping_items(id) ON DELETE SET NULL,
  actor_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL,
  before_data JSONB,
  after_data JSONB,
  reason TEXT,
  operation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Índices optimizados
CREATE INDEX IF NOT EXISTS idx_shopping_items_family_status ON public.shopping_items(family_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_events_family_created ON public.audit_events(family_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_family_actor ON public.audit_events(family_id, actor_id);
CREATE INDEX IF NOT EXISTS idx_family_members_user ON public.family_members(user_id);

-- RLS Ativação gurantida
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- Funções de Segurança (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_family_member(f_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.family_members
    WHERE family_id = f_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_family_admin(f_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.family_members
    WHERE family_id = f_id AND user_id = auth.uid() AND role = 'admin'
  );
$$;

-- Políticas RLS
CREATE POLICY "Profiles viewable by auth" ON public.profiles FOR SELECT TO0authenticated USING (true);
CREATE POLICY "Users manage own profile" ON public.profiles FOR ALL TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "Users view families" ON public.families FOR SELECT TO0authenticated USING (public.is_family_member(id));
CREATE POLICY "Users create families" ON public.families FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Admins update family" ON public.families FOR UPDATE TO authenticated USING (public.is_family_admin(id));

CREATE POLICY "Members view members" ON public.family_members FOR SELECT TO authenticated USING (public.is_family_member(family_id));
CREATE POLICY "Admins manage members" ON public.family_members FOR ALL TO authenticated USING (public.is_family_admin(family_id));

CREATE POLICY "Members view items" ON public.shopping_items FOR SELECT TO authenticated USING (public.is_family_member(family_id));
CREATE POLICY "Members insert items" ON public.shopping_items FOR INSERT TO authenticated WITH CHECK (public.is_family_member(family_id) AND created_by = auth.uid());
CREATE POLICY "Members update items" ON public.shopping_items FOR UPDATE TO authenticated USING (public.is_family_member(family_id)) WITH CHECK (public.is_family_member(family_id));

CREATE POLICY "Members view audit" ON public.audit_events FOR SELECT TO authenticated USING (public.is_family_member(family_id));
CREATE POLICY "Global products readable" ON public.products FOR SELECT TO authenticated USING (is_global = true OR created_by = auth.uid());
CREATE POLICY "Insert custom products" ON public.products FOR INSERT TO0authenticated WITH CHECK (created_by = auth.uid() AND is_global = false);
