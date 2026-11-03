-- Altera a quantidade de um item pendente da lista, com auditoria
CREATE OR REPLACE FUNCTION public.set_shopping_item_quantity(
  p_family_id UUID,
  p_item_id UUID,
  p_quantity NUMERIC,
  p_operation_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_old_qty NUMERIC;
  v_unit TEXT;
  v_result JSONB;
BEGIN
  IF NOT public.is_family_member(p_family_id) THEN
    RAISE EXCEPTION 'Acesso negado: você não é membro desta família.';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'A quantidade precisa ser maior que zero.';
  END IF;

  SELECT quantity, unit INTO v_old_qty, v_unit
  FROM public.shopping_items
  WHERE id = p_item_id AND family_id = p_family_id;

  IF v_old_qty IS NULL THEN
    RAISE EXCEPTION 'Item não encontrado.';
  END IF;

  UPDATE public.shopping_items
  SET quantity = p_quantity,
      updated_by = v_user_id,
      updated_at = timezone('utc'::text, now())
  WHERE id = p_item_id;

  INSERT INTO public.audit_events (family_id, item_id, actor_id, action, before_data, after_data, operation_id)
  VALUES (
    p_family_id,
    p_item_id,
    v_user_id,
    'quantity_changed',
    jsonb_build_object('quantity', v_old_qty, 'unit', v_unit),
    jsonb_build_object('quantity', p_quantity, 'unit', v_unit),
    p_operation_id
  );

  SELECT to_jsonb(si.*) INTO v_result
  FROM public.shopping_items si
  WHERE si.id = p_item_id;

  RETURN v_result;
END;
$$;
