-- Migration to fix get_remitos_consolidado function and resolve uuid = text comparison type mismatch error.
-- First, drop the overloaded functions to avoid conflicts (PGRST203)
DROP FUNCTION IF EXISTS public.get_remitos_consolidado(text, text);
DROP FUNCTION IF EXISTS public.get_remitos_consolidado(text, uuid);

-- Recreate the function with a single signature (text, text)
CREATE OR REPLACE FUNCTION public.get_remitos_consolidado(
    p_user_role text,
    p_user_sucursal_id text
)
RETURNS TABLE (
    id uuid,
    remito_number text,
    items jsonb,
    status text,
    created_by text,
    date timestamptz,
    numero_pv text,
    sucursal text,
    branch_sucursal_id uuid,
    id_inventory text,
    count_name text,
    progress integer,
    scanned_brands text[],
    is_finalized boolean,
    type text
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sucursal_name text := '';
BEGIN
    -- Si es branch_admin, buscar el nombre de la sucursal correspondiente al UUID de entrada
    IF p_user_role = 'branch_admin' AND p_user_sucursal_id IS NOT NULL AND p_user_sucursal_id <> '' THEN
        SELECT name INTO v_sucursal_name
        FROM sucursales s
        WHERE s.id::text = p_user_sucursal_id::text;
        
        IF v_sucursal_name IS NULL THEN
            v_sucursal_name := '';
        END IF;
    END IF;

    RETURN QUERY
    WITH scans_summary AS (
        -- Resumen de escaneos por order_number
        SELECT 
            order_number,
            COALESCE(SUM(quantity), 0)::numeric as total_scanned,
            ARRAY_AGG(DISTINCT p.brand) FILTER (WHERE p.brand IS NOT NULL AND p.brand <> '') as brands
        FROM inventory_scans s
        LEFT JOIN products p ON p.code = s.code
        GROUP BY order_number
    ),
    general_counts_linked_items AS (
        -- Items agrupados de pre-remitos vinculados a conteos generales (que comiencen con STOCK-)
        SELECT 
            gc_id,
            jsonb_strip_nulls(jsonb_agg(elem)) as items
        FROM (
            SELECT 
                gc.id as gc_id,
                elem
            FROM general_counts gc
            CROSS JOIN regexp_split_to_table(gc.name, ',\s*') AS part
            JOIN pre_remitos pr ON pr.order_number = part
            CROSS JOIN jsonb_array_elements(pr.items) AS elem
            WHERE part LIKE 'STOCK-%'
        ) sub
        GROUP BY gc_id
    )
    SELECT * FROM (
        -- 1. Remitos finalizados (tabla remitos)
        SELECT 
            r.id,
            r.remito_number,
            r.items,
            r.status,
            r.created_by,
            r.date,
            pv.numero_pv,
            COALESCE(pv.sucursal, s.name, '-') as sucursal,
            gc.sucursal_id as branch_sucursal_id,
            pr.id_inventory,
            COALESCE(gc.name, r.remito_number) as count_name,
            NULL::integer as progress,
            NULL::text[] as scanned_brands,
            true as is_finalized,
            'remito' as type
        FROM remitos r
        LEFT JOIN pedidos_ventas pv ON pv.order_number = r.remito_number
        LEFT JOIN pre_remitos pr ON pr.order_number = r.remito_number
        LEFT JOIN general_counts gc ON gc.id::text = r.remito_number
        LEFT JOIN sucursales s ON s.id = gc.sucursal_id
        WHERE r.deleted_at IS NULL
          AND r.date >= NOW() - INTERVAL '1 month'

        UNION ALL

        -- 2. Pre-remitos pendientes (tabla pre_remitos)
        SELECT 
            pr.id,
            pr.order_number as remito_number,
            pr.items,
            'pending_scanned' as status,
            'Múltiples' as created_by,
            pr.created_at as date,
            pv.numero_pv,
            COALESCE(pv.sucursal, '-') as sucursal,
            NULL::uuid as branch_sucursal_id,
            pr.id_inventory,
            COALESCE(gc.name, pr.id_inventory, pr.order_number) as count_name,
            CASE 
                WHEN (SELECT COALESCE(SUM((elem->>'quantity')::numeric), 0) FROM jsonb_array_elements(pr.items) elem) > 0 THEN
                    LEAST(ROUND((COALESCE(ss.total_scanned, 0) / (SELECT COALESCE(SUM((elem->>'quantity')::numeric), 0) FROM jsonb_array_elements(pr.items) elem) * 100))::integer, 100)
                ELSE 0
            END as progress,
            COALESCE(ss.brands[1:5], '{}'::text[]) as scanned_brands,
            false as is_finalized,
            'pre_remito' as type
        FROM pre_remitos pr
        LEFT JOIN pedidos_ventas pv ON pv.order_number = pr.order_number
        LEFT JOIN general_counts gc ON gc.id::text = pr.order_number
        LEFT JOIN scans_summary ss ON ss.order_number = pr.order_number
        WHERE pr.status = 'pending'
          AND pr.deleted_at IS NULL
          AND pr.created_at >= NOW() - INTERVAL '1 month'

        UNION ALL

        -- 3. General Counts abiertos (tabla general_counts)
        SELECT 
            gc.id,
            gc.id::text as remito_number,
            COALESCE(gcli.items, '[]'::jsonb) as items,
            'pending_scanned' as status,
            COALESCE(gc.created_by::text, 'Admin') as created_by,
            gc.created_at as date,
            (
                SELECT string_agg(DISTINCT pv.numero_pv, ', ') 
                FROM regexp_split_to_table(gc.name, ',\s*') AS part
                JOIN pedidos_ventas pv ON pv.order_number = part
            ) as numero_pv,
            COALESCE(
                (
                    SELECT string_agg(DISTINCT pv.sucursal, ', ') 
                    FROM regexp_split_to_table(gc.name, ',\s*') AS part
                    JOIN pedidos_ventas pv ON pv.order_number = part
                ),
                s.name,
                '-'
            ) as sucursal,
            gc.sucursal_id as branch_sucursal_id,
            (
                SELECT pr.id_inventory 
                FROM regexp_split_to_table(gc.name, ',\s*') AS part
                JOIN pre_remitos pr ON pr.order_number = part
                WHERE part LIKE 'STOCK-%'
                LIMIT 1
            ) as id_inventory,
            gc.name as count_name,
            NULL::integer as progress,
            COALESCE(
                (
                    SELECT array_agg(DISTINCT brand) FILTER (WHERE brand IS NOT NULL AND brand <> '')
                    FROM (
                        SELECT p.brand
                        FROM inventory_scans s
                        JOIN products p ON p.code = s.code
                        WHERE s.order_number = gc.id::text
                        LIMIT 5
                    ) b
                ), 
                '{}'::text[]
            ) as scanned_brands,
            false as is_finalized,
            'general_count' as type
        FROM general_counts gc
        LEFT JOIN general_counts_linked_items gcli ON gcli.gc_id = gc.id
        LEFT JOIN sucursales s ON s.id = gc.sucursal_id
        WHERE gc.status = 'open'
          AND gc.deleted_at IS NULL
          AND gc.created_at >= NOW() - INTERVAL '1 month'

        UNION ALL

        -- 4. General Counts cerrados que no están en la tabla remitos
        SELECT 
            gc.id,
            gc.id::text as remito_number,
            '[]'::jsonb as items,
            'processed' as status,
            COALESCE(gc.created_by::text, 'Admin') as created_by,
            COALESCE(gc.closed_at, gc.created_at) as date,
            (
                SELECT string_agg(DISTINCT pv.numero_pv, ', ') 
                FROM regexp_split_to_table(gc.name, ',\s*') AS part
                JOIN pedidos_ventas pv ON pv.order_number = part
            ) as numero_pv,
            COALESCE(
                (
                    SELECT string_agg(DISTINCT pv.sucursal, ', ') 
                    FROM regexp_split_to_table(gc.name, ',\s*') AS part
                    JOIN pedidos_ventas pv ON pv.order_number = part
                ),
                s.name,
                '-'
            ) as sucursal,
            gc.sucursal_id as branch_sucursal_id,
            NULL::text as id_inventory,
            gc.name as count_name,
            NULL::integer as progress,
            NULL::text[] as scanned_brands,
            true as is_finalized,
            'general_count' as type
        FROM general_counts gc
        LEFT JOIN sucursales s ON s.id = gc.sucursal_id
        WHERE gc.status = 'closed'
          AND gc.deleted_at IS NULL
          AND gc.created_at >= NOW() - INTERVAL '1 month'
          AND NOT EXISTS (
              SELECT 1 FROM remitos r WHERE r.remito_number = gc.id::text
          )
    ) q
    WHERE 
        p_user_role != 'branch_admin' 
        OR (
            -- Filtro seguro para branch_admin:
            -- 1. Coincide con branch_sucursal_id (general_counts) casteando ambos a text de forma segura
            (q.branch_sucursal_id::text = p_user_sucursal_id)
            -- 2. O la sucursal de PV coincide con el nombre de sucursal del usuario
            OR (v_sucursal_name <> '' AND q.sucursal IS NOT NULL AND LOWER(q.sucursal) LIKE '%' || LOWER(v_sucursal_name) || '%')
        )
    ORDER BY q.date DESC;
END;
$$;
