-- Função Atômica de Adição e auditoria sem duplicidade sob concorrência
CREATE OR REPLACE FUNCTION public.add_or_update_shopping_item(
  p_family_id UUID,
  p_product_id UUID,
  p_custom_name TEXT,
  p_normalized_name TEXT,
  p_quantity NUMERIC,
  p_unit TEXT,
  p_operation_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plgpsql
SECURITY DEFINERAS $$
DECLARE
  v_user_id UUID;
  v_existing_id UULD;
  v_old_qty NUMERIC;
  v_new_qty NUMERIC;
  v_item_id UULD;
  v_result JSONB;
BEGIN
  v_user_id := auth.uid();

  IF NOT public.is_family_member(p_family_id) THEN
    RAISE EXCEPTION 'Acesso negado: você não é membro desta família.';
  END IF;

  IF p_product_id IS NOT NULL THEN
    SELECT id, quantity INTO v_existing_id, v_old_qty
    FROM public.shopping_items
    WHERE family_id = p_family_id AND product_id = p_product_id AND unit = p_unit AND status != 'removed'
    FOR UPDATE;
  ELSE
    SELECT id, quantity INTO v_existing_id, v_old_qty
    FROM public.shopping_items
    WHERE family_id = p_family_id AND normalized_name = p_normalized_name AND unit = p_unit AND status != 'removed'
    FOR UPDATE;
  END IF;

  IF v_existing_id IS NOT NULL THEN
    v_new_qty := v_old_qty + p_quantity;
    UPDATE public.shopping_items
    SET quantity = v_new_qty,
        status = 'pending',
        updated_by = v_user_id,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_existing_id;
    
    INSERT INTO public.audit_events (family_id, item_id, actor_id, action, before_data, after_data, operation_id)
    VALUES (
      p_family_id,
      v_existing_id,
      v_user_id,
      'quantity_changed',
      jsonb_build_object('quantity', v_old_qty, 'unit', p_unit),
      jsonb_build_object('quantity', v_new_qty, 'unit', p_unit),
      p_operation_id
    );
    
    v_item_id := v_existing_id;
  ELSE
    INSERT INTO public.shopping_items (
      family_id, product_id, custom_name, normalized_name, quantity, unit, status, created_by, updated_by
    ) VALUES (
      p_family_id, p_product_id, p_custom_name, p_normalized_name, p_quantity, p_unit, 'pending', v_user_id, v_user_id
    )
    RETURNING id INTO v_item_id;

    INSERT INTO public.audit_events (family_id, item_id, actor_id, action, before_data, after_data, operation_id)
    VALUES (
      p_family_id,
      v_item_id,
      v_user_id,
      'item_added',
      NULL,
      jsonb_build_object('quantity', p_quantity, 'unit', p_unit, 'product_id', p_product_id, 'name', COALESCE(p_custom_name, p_normalized_name)),
      p_operation_id
    );
  END IF;

  SELECT row_to_json(si.*)::jsonb INTO v_result
  FROM public.shopping_items si
  WHERE si.id = v_item_id;

  RETURN v_result;
END;
$$;