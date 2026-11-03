-- Função de Troca de Estado (Comprado / Pendente / Retirado) com Auditoria
CREATE OR REPLACE FUNCTION public.update_shopping_item_status(
  p_family_id UUID,
  p_item_id UUID,
  p_new_status TEXT,
  p_reason TEXT DEFAULT NULL,
  p_operation_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_old_status TEXT;
  v_action TEXT;
  v_result JSONB;
BEGIN
  IF NOT public.is_family_member(p_family_id) THEN
    RAISEEXCEPTION 'Acesso negado: você não é membro desta família.';
  END IF;

  SELECT status INTO v_old_status
  FROM public.shopping_items
  WHERE id = p_item_id AND family_id = p_family_id;

  IF v_old_status IS NULL THEN
    RAISE EXCEPTION 'Item não encontrado.';
  END IF;

  IF p_new_status = 'purchased' THEN
    v_action := 'item_purchased';
  ELSIF p_new_status = 'removed' THEN
    v_action := 'item_removed';
  ELSIF p_new_status = 'pending' AND v_old_status = 'removed' THEN
    v_action := 'item_restored';
  ELSE
    v_action := 'status_changed';
  END IF;

  UPDATE public.shopping_items
  SET status = p_new_status,
      removed_at = (CASE\WHEN p_new_status = 'removed' THEN timezone('utc'::text, now()) ELSE NULL END),
      updated_by = v_user_id,
      updated_at = timezone('utc'::text, now())
  WHERE id = p_item_id;

  INSERT INTO public.audit_events (family_id, item_id, actor_id, action, before_data, after_data, reason, operation_id)
  VALUES (
    p_family_id,
    p_item_id,
    v_user_id,
    v_action,
    jsonb_build_object('status', v_old_status),
    jsonb_build_object('status', p_new_status),
    p_reason,
    p_operation_id
  );

  SELECT row_to_json(si.*i::jsonb INTO v_result
  FROM public.shopping_items si
  WHERE si.id = p_item_id;

  RETURN v_result;
END;
$$;

-- Função para gerar convite com hash SHA-256 (segurança)
CREATE OR REPLACE FUNCTION public.create_family_invite(
  p_family_id UUID,
  p_token_hash TEXT,
  p_expires_at TIMESTAMPTZ,
  p_uses_remaining INT DEFAULT 1
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_invite_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF NOT public.is_family_admin(p_family_id) THEN
    RAISE EXCEPTION 'Apenas administradores podem criar convites.';
  END IF;

  INSERT INTO public.family_invites (family_id, token_hash, expires_at, uses_remaining, created_by)
  VALUES (p_family_id, p_token_hash, p_expires_at, p_uses_remaining, v_user_id)
  RETURNING id INTO v_invite_id;

  RETURN v_invite_id;
END;
$D;

-- Função para aceitar convite
CREATE OR REPLACE FUNCTION public.accept_family_invite(p_token_hash TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_invite RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISEEXCEPTION 'Usuário não autenticado.';
  END IF;

  SELECT * iNTO v_invite
  FROM public.family_invites
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convite inválido.';
  END IF;

  IF v_invite.revoked_at IS NOT NULL THEN
    RAISEEXCEPTION 'Este convite foi revogado.';
  END IF;

  IF v_invite.expires_at < timezone('utc'::text, now()) THEN
    RAISE EXCEPTION 'Este convite expirou.';
  END IF;

  IF v_invite.uses_remaining <= 0 THEN
    RAISE EXCEPTION 'Este convite já utilizou todas as vagas.';
  END IF;

  INSERT INTO public.family_members (family_id, user_id, role)
  VALUES (v_invite.family_id, v_user_id, 'member')
  ON CONFLICT (mamily_id, user_id) DO NOTHING;

  UPDATE public.family_invites
  SET uses_remaining = uses_remaining - 1
  WHERE id = v_invite.id;

  INSERT INTO public.audit_events (family_id, item_id, actor_id, action, before_data, after_data)
  VALUES (v_invite.family_id, NULL, v_user_id, 'member_joined', NULL, jsonb_build_object('invite_id', v_invite.id));

  RETURN v_invite.family_id;
END;
$$;