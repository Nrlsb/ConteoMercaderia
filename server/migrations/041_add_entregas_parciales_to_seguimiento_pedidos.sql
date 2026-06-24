-- Migration to add entregas_parciales JSONB column to seguimiento_pedidos
ALTER TABLE seguimiento_pedidos ADD COLUMN IF NOT EXISTS entregas_parciales JSONB DEFAULT '[]'::jsonb;

-- Populate existing rows with partial delivery data
UPDATE seguimiento_pedidos
SET entregas_parciales = (
    SELECT COALESCE(
        jsonb_agg(elem),
        '[]'::jsonb
    )
    FROM (
        SELECT jsonb_build_object(
            'fecha', contacto_proveedor_fecha,
            'cantidad', COALESCE(contacto_proveedor_cant_parcial, 0),
            'confirmada', COALESCE(fecha_confirmada, FALSE),
            'fecha_confirmacion_deposito', fecha_confirmacion_deposito,
            'fecha_coordinacion', fecha_coordinacion
        ) AS elem
        WHERE (contacto_proveedor_fecha IS NOT NULL OR contacto_proveedor_cant_parcial IS NOT NULL) AND contacto_proveedor_entrega = 'Parcial'
        
        UNION ALL
        
        SELECT jsonb_build_object(
            'fecha', contacto_proveedor_fecha_pendiente,
            'cantidad', COALESCE(contacto_proveedor_cant_pendiente, 0),
            'confirmada', COALESCE(fecha_pendiente_confirmada, FALSE),
            'fecha_confirmacion_deposito', fecha_pendiente_confirmacion_deposito,
            'fecha_coordinacion', fecha_coordinacion_pendiente
        ) AS elem
        WHERE (contacto_proveedor_fecha_pendiente IS NOT NULL OR contacto_proveedor_cant_pendiente IS NOT NULL) AND contacto_proveedor_entrega = 'Parcial'
    ) sub
)
WHERE contacto_proveedor_entrega = 'Parcial';
