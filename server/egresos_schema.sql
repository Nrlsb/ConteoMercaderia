-- =============================================
-- TABLAS PARA EGRESOS DE MERCADERÍA
-- Ejecutar en Supabase SQL Editor
-- =============================================

-- Tabla principal de egresos
create table if not exists egresos (
  id uuid default uuid_generate_v4() primary key,
  reference_number text,
  pdf_filename text,
  status text default 'open',
  created_by text,
  sucursal_id uuid references sucursales(id),
  date timestamp with time zone default now()
);

-- Items de egreso (productos a controlar)
create table if not exists egreso_items (
  id uuid default uuid_generate_v4() primary key,
  egreso_id uuid references egresos(id) on delete cascade,
  product_code text references products(code) on delete cascade,
  expected_quantity numeric default 0,
  scanned_quantity numeric default 0,
  unique (egreso_id, product_code)
);

-- Historial de cambios en egresos
create table if not exists egreso_items_history (
  id uuid default uuid_generate_v4() primary key,
  egreso_id uuid references egresos(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  operation text,
  product_code text,
  old_data jsonb,
  new_data jsonb,
  changed_at timestamp with time zone default now()
);

-- Índices para mejorar rendimiento
create index if not exists idx_egreso_items_egreso_id on egreso_items(egreso_id);
create index if not exists idx_egreso_items_history_egreso_id on egreso_items_history(egreso_id);
