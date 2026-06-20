


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "unaccent" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."increment_inventory_scan"("p_order_number" "text", "p_user_id" "uuid", "p_code" "text", "p_delta" numeric) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    INSERT INTO inventory_scans (order_number, user_id, code, quantity, timestamp)
    VALUES (p_order_number, p_user_id, p_code, p_delta, now())
    ON CONFLICT (order_number, user_id, code)
    DO UPDATE SET 
        quantity = inventory_scans.quantity + p_delta,
        timestamp = now();
END;
$$;


ALTER FUNCTION "public"."increment_inventory_scan"("p_order_number" "text", "p_user_id" "uuid", "p_code" "text", "p_delta" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_inventory_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.inventory_scans_history (
      operation,
      id, order_number, user_id, code, quantity, timestamp,
      new_data
    ) VALUES (
      'INSERT',
      NEW.id, NEW.order_number, NEW.user_id, NEW.code, NEW.quantity, NEW.timestamp,
      to_jsonb(NEW)
    );
    RETURN NEW;
    
  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO public.inventory_scans_history (
      operation,
      id, order_number, user_id, code, quantity, timestamp,
      old_data, new_data
    ) VALUES (
      'UPDATE',
      NEW.id, NEW.order_number, NEW.user_id, NEW.code, NEW.quantity, NEW.timestamp,
      to_jsonb(OLD), to_jsonb(NEW)
    );
    RETURN NEW;
    
  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO public.inventory_scans_history (
      operation,
      id, order_number, user_id, code, quantity, timestamp,
      old_data
    ) VALUES (
      'DELETE',
      OLD.id, OLD.order_number, OLD.user_id, OLD.code, OLD.quantity, OLD.timestamp,
      to_jsonb(OLD)
    );
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."log_inventory_changes"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "barcode" "text",
    "code" "text",
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "current_stock" numeric DEFAULT 0,
    "brand" "text",
    "brand_code" "text",
    "provider_code" "text",
    "excel_order" integer,
    "primary_unit" "text",
    "secondary_unit" "text",
    "conversion_factor" numeric,
    "conversion_type" "text",
    "provider_description" "text",
    "barcode_secondary" "text",
    "capacity" "text",
    "counting_category" "text",
    "cost_price" numeric(12,2) DEFAULT 0,
    "tes" "text",
    "lista001" numeric(12,2) DEFAULT 0,
    "lista500" numeric(12,2) DEFAULT 0,
    "moneda" "text"
);


ALTER TABLE "public"."products" OWNER TO "postgres";


COMMENT ON COLUMN "public"."products"."brand" IS 'Nombre de la marca del producto';



COMMENT ON COLUMN "public"."products"."brand_code" IS 'Código numérico de la marca';



CREATE OR REPLACE FUNCTION "public"."search_products"("search_term" "text") RETURNS SETOF "public"."products"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM products
  WHERE
    -- 1. Exact phrase match (Highest Priority)
    description ILIKE '%' || search_term || '%'
    OR code ILIKE '%' || search_term || '%'
    OR
    -- 2. Smart Search (All words must be present using AND logic)
    -- This prevents "Pintor 11" from showing "Pintor 14" just because of "Pintor"
    to_tsvector('spanish', coalesce(description, '') || ' ' || coalesce(code, '')) @@ plainto_tsquery('spanish', search_term)
  ORDER BY
    -- Sorting Priority
    CASE
      -- Exact matches come first
      WHEN description ILIKE '%' || search_term || '%' THEN 0
      WHEN code ILIKE '%' || search_term || '%' THEN 0
      ELSE 1
    END ASC,
    -- Then shorter results (usually more relevant)
    length(description) ASC;
END;
$$;


ALTER FUNCTION "public"."search_products"("search_term" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."app_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."barcode_history" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "action_type" "text",
    "product_id" "uuid",
    "product_description" "text",
    "details" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."barcode_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."branch_dye_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "branch_name" character varying(255) NOT NULL,
    "dye_type" character varying(50) NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "colorants" "jsonb" DEFAULT '[]'::"jsonb",
    CONSTRAINT "branch_dye_types_dye_type_check" CHECK ((("dye_type")::"text" = ANY ((ARRAY['Automotor'::character varying, 'Hogar y Obra'::character varying])::"text"[])))
);


ALTER TABLE "public"."branch_dye_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bug_reports" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid",
    "username" "text",
    "description" "text",
    "error_data" "jsonb",
    "page_url" "text",
    "user_agent" "text",
    "app_version" "text",
    "status" "text" DEFAULT 'open'::"text",
    "sucursal_id" "uuid"
);


ALTER TABLE "public"."bug_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dye_count_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "dye_count_id" "uuid",
    "product_code" "text" NOT NULL,
    "description" "text",
    "theoretical_stock" numeric DEFAULT 0,
    "excel_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."dye_count_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dye_counting_lists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "closed_at" timestamp with time zone,
    "status" "text" DEFAULT 'open'::"text",
    "sucursal_id" "uuid",
    "created_by" "text",
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."dye_counting_lists" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."egreso_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "egreso_id" "uuid",
    "product_code" "text",
    "expected_quantity" numeric DEFAULT 0,
    "scanned_quantity" numeric DEFAULT 0,
    "last_scanned_at" timestamp with time zone DEFAULT "now"(),
    "shortage_reason" "text"
);


ALTER TABLE "public"."egreso_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."egreso_items_history" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "egreso_id" "uuid",
    "user_id" "uuid",
    "operation" "text",
    "product_code" "text",
    "old_data" "jsonb",
    "new_data" "jsonb",
    "changed_at" timestamp with time zone DEFAULT "now"(),
    "description" "text"
);


ALTER TABLE "public"."egreso_items_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."egresos" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "reference_number" "text",
    "pdf_filename" "text",
    "status" "text" DEFAULT 'open'::"text",
    "created_by" "text",
    "sucursal_id" "uuid",
    "date" timestamp with time zone DEFAULT "now"(),
    "failed_items" "jsonb" DEFAULT '[]'::"jsonb",
    "is_devolucion" boolean DEFAULT false,
    "is_transferencia" boolean DEFAULT false,
    "receipt_id" "uuid",
    "document_url" "text"
);


ALTER TABLE "public"."egresos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."general_counts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "closed_at" timestamp with time zone,
    "sucursal_id" "uuid",
    "product_codes" "text"[],
    "deleted_at" timestamp with time zone,
    "parent_count_id" "uuid",
    CONSTRAINT "general_counts_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."general_counts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_scans" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "order_number" "text" NOT NULL,
    "user_id" "uuid",
    "code" "text" NOT NULL,
    "quantity" numeric DEFAULT 0 NOT NULL,
    "timestamp" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."inventory_scans" OWNER TO "postgres";


COMMENT ON COLUMN "public"."inventory_scans"."order_number" IS 'References either pre_remitos.order_number or general_counts.id';



CREATE TABLE IF NOT EXISTS "public"."inventory_scans_history" (
    "history_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "operation" "text" NOT NULL,
    "changed_at" timestamp with time zone DEFAULT "now"(),
    "id" "uuid",
    "order_number" "text",
    "user_id" "uuid",
    "code" "text",
    "quantity" numeric,
    "timestamp" timestamp with time zone,
    "old_data" "jsonb",
    "new_data" "jsonb"
);


ALTER TABLE "public"."inventory_scans_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."label_print_history" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "type" "text" NOT NULL,
    "data" "jsonb" NOT NULL,
    "user_id" "uuid",
    "user_name" "text",
    "sucursal_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."label_print_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."layout_missing" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "code" "text" NOT NULL,
    "description" "text" NOT NULL,
    "brand" "text",
    "source" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_found" boolean DEFAULT false
);


ALTER TABLE "public"."layout_missing" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pedidos_ventas" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "order_number" "text",
    "numero_pv" "text",
    "sucursal" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."pedidos_ventas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pre_remitos" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "order_number" "text" NOT NULL,
    "items" "jsonb",
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "inventory_id" "text",
    "id_inventory" "text",
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."pre_remitos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_measurements" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "product_code" "text" NOT NULL,
    "product_description" "text",
    "weight" numeric(10,3) NOT NULL,
    "unit" "text" DEFAULT 'kg'::"text",
    "user_id" "uuid",
    "username" "text",
    "timestamp" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb",
    "created_by" "text"
);


ALTER TABLE "public"."product_measurements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."receipt_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "receipt_id" "uuid",
    "product_code" "text",
    "expected_quantity" numeric DEFAULT 0,
    "scanned_quantity" numeric DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "origin_expected_quantity" numeric DEFAULT 0,
    "origin_shortage_reason" "text"
);


ALTER TABLE "public"."receipt_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."receipt_items_history" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "receipt_id" "uuid",
    "user_id" "uuid",
    "operation" "text" NOT NULL,
    "product_code" "text" NOT NULL,
    "old_data" "jsonb",
    "new_data" "jsonb",
    "changed_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."receipt_items_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."receipts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "remito_number" "text",
    "status" "text" DEFAULT 'open'::"text",
    "date" timestamp with time zone DEFAULT "now"(),
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "sucursal_id" "uuid",
    "deleted_at" timestamp with time zone,
    "type" "text" DEFAULT 'normal'::"text",
    "failed_items" "jsonb" DEFAULT '[]'::"jsonb",
    "document_url" "text"
);


ALTER TABLE "public"."receipts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."remitos" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "remito_number" "text",
    "items" "jsonb",
    "discrepancies" "jsonb",
    "clarification" "text",
    "status" "text" DEFAULT 'processed'::"text",
    "created_by" "text",
    "date" timestamp with time zone DEFAULT "now"(),
    "inventory_id" "text",
    "id_inventory" "text",
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."remitos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."security_logs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "actor_id" "uuid",
    "target_user_id" "uuid",
    "action" "text" NOT NULL,
    "details" "jsonb",
    "ip_address" "text",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."security_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_sucursal" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "product_code" "text",
    "sucursal_id" "uuid",
    "quantity" numeric DEFAULT 0,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."stock_sucursal" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sucursales" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "location" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "code" "text"
);


ALTER TABLE "public"."sucursales" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "username" "text" NOT NULL,
    "password" "text" NOT NULL,
    "current_session_id" "text",
    "role" "text" DEFAULT 'user'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_session_active" boolean DEFAULT false,
    "last_seen" timestamp with time zone,
    "sucursal_id" "uuid",
    "permissions" "text"[] DEFAULT '{}'::"text"[],
    "active_count_id" "text",
    "allow_multiple_sessions" boolean DEFAULT false,
    "preferences" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."users" OWNER TO "postgres";


ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."barcode_history"
    ADD CONSTRAINT "barcode_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."branch_dye_types"
    ADD CONSTRAINT "branch_dye_types_branch_name_key" UNIQUE ("branch_name");



ALTER TABLE ONLY "public"."branch_dye_types"
    ADD CONSTRAINT "branch_dye_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bug_reports"
    ADD CONSTRAINT "bug_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dye_count_items"
    ADD CONSTRAINT "dye_count_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dye_counting_lists"
    ADD CONSTRAINT "dye_counting_lists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."egreso_items"
    ADD CONSTRAINT "egreso_items_egreso_id_product_code_key" UNIQUE ("egreso_id", "product_code");



ALTER TABLE ONLY "public"."egreso_items_history"
    ADD CONSTRAINT "egreso_items_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."egreso_items"
    ADD CONSTRAINT "egreso_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."egresos"
    ADD CONSTRAINT "egresos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."general_counts"
    ADD CONSTRAINT "general_counts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_scans_history"
    ADD CONSTRAINT "inventory_scans_history_pkey" PRIMARY KEY ("history_id");



ALTER TABLE ONLY "public"."inventory_scans"
    ADD CONSTRAINT "inventory_scans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."label_print_history"
    ADD CONSTRAINT "label_print_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."layout_missing"
    ADD CONSTRAINT "layout_missing_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pedidos_ventas"
    ADD CONSTRAINT "pedidos_ventas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pre_remitos"
    ADD CONSTRAINT "pre_remitos_order_number_key" UNIQUE ("order_number");



ALTER TABLE ONLY "public"."pre_remitos"
    ADD CONSTRAINT "pre_remitos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_measurements"
    ADD CONSTRAINT "product_measurements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."receipt_items_history"
    ADD CONSTRAINT "receipt_items_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."receipt_items"
    ADD CONSTRAINT "receipt_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."receipt_items"
    ADD CONSTRAINT "receipt_items_receipt_id_product_code_key" UNIQUE ("receipt_id", "product_code");



ALTER TABLE ONLY "public"."receipts"
    ADD CONSTRAINT "receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."remitos"
    ADD CONSTRAINT "remitos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."security_logs"
    ADD CONSTRAINT "security_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_sucursal"
    ADD CONSTRAINT "stock_sucursal_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_sucursal"
    ADD CONSTRAINT "stock_sucursal_product_code_sucursal_id_key" UNIQUE ("product_code", "sucursal_id");



ALTER TABLE ONLY "public"."sucursales"
    ADD CONSTRAINT "sucursales_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."sucursales"
    ADD CONSTRAINT "sucursales_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."sucursales"
    ADD CONSTRAINT "sucursales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_scans"
    ADD CONSTRAINT "unq_inventory_user_code" UNIQUE ("order_number", "user_id", "code");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_username_key" UNIQUE ("username");



CREATE INDEX "idx_branch_dye_types_branch_name" ON "public"."branch_dye_types" USING "btree" ("branch_name");



CREATE INDEX "idx_egreso_items_egreso_id" ON "public"."egreso_items" USING "btree" ("egreso_id");



CREATE INDEX "idx_egreso_items_history_egreso_id" ON "public"."egreso_items_history" USING "btree" ("egreso_id");



CREATE INDEX "idx_egresos_receipt_id" ON "public"."egresos" USING "btree" ("receipt_id");



CREATE INDEX "idx_general_counts_deleted_at" ON "public"."general_counts" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_general_counts_sucursal_id" ON "public"."general_counts" USING "btree" ("sucursal_id");



CREATE INDEX "idx_inventory_scans_code" ON "public"."inventory_scans" USING "btree" ("code");



CREATE INDEX "idx_inventory_scans_order_number" ON "public"."inventory_scans" USING "btree" ("order_number");



CREATE INDEX "idx_inventory_scans_order_user" ON "public"."inventory_scans" USING "btree" ("order_number", "user_id");



CREATE INDEX "idx_measurements_product_code" ON "public"."product_measurements" USING "btree" ("product_code");



CREATE INDEX "idx_measurements_timestamp" ON "public"."product_measurements" USING "btree" ("timestamp" DESC);



CREATE INDEX "idx_pre_remitos_deleted_at" ON "public"."pre_remitos" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_pre_remitos_status" ON "public"."pre_remitos" USING "btree" ("status");



CREATE INDEX "idx_products_barcode" ON "public"."products" USING "btree" ("barcode");



CREATE INDEX "idx_products_brand" ON "public"."products" USING "btree" ("brand");



CREATE INDEX "idx_products_brand_code" ON "public"."products" USING "btree" ("brand_code");



CREATE INDEX "idx_products_code" ON "public"."products" USING "btree" ("code");



CREATE INDEX "idx_products_excel_order" ON "public"."products" USING "btree" ("excel_order");



CREATE INDEX "idx_receipts_deleted_at" ON "public"."receipts" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_remitos_date" ON "public"."remitos" USING "btree" ("date" DESC);



CREATE INDEX "idx_remitos_deleted_at" ON "public"."remitos" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_security_logs_action" ON "public"."security_logs" USING "btree" ("action");



CREATE INDEX "idx_security_logs_actor_id" ON "public"."security_logs" USING "btree" ("actor_id");



CREATE INDEX "idx_security_logs_created_at" ON "public"."security_logs" USING "btree" ("created_at");



CREATE OR REPLACE TRIGGER "audit_inventory_scans" AFTER INSERT OR DELETE OR UPDATE ON "public"."inventory_scans" FOR EACH ROW EXECUTE FUNCTION "public"."log_inventory_changes"();



ALTER TABLE ONLY "public"."barcode_history"
    ADD CONSTRAINT "barcode_history_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."barcode_history"
    ADD CONSTRAINT "barcode_history_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bug_reports"
    ADD CONSTRAINT "bug_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."dye_count_items"
    ADD CONSTRAINT "dye_count_items_dye_count_id_fkey" FOREIGN KEY ("dye_count_id") REFERENCES "public"."dye_counting_lists"("id");



ALTER TABLE ONLY "public"."egreso_items"
    ADD CONSTRAINT "egreso_items_egreso_id_fkey" FOREIGN KEY ("egreso_id") REFERENCES "public"."egresos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."egreso_items_history"
    ADD CONSTRAINT "egreso_items_history_egreso_id_fkey" FOREIGN KEY ("egreso_id") REFERENCES "public"."egresos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."egreso_items_history"
    ADD CONSTRAINT "egreso_items_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."egreso_items"
    ADD CONSTRAINT "egreso_items_product_code_fkey" FOREIGN KEY ("product_code") REFERENCES "public"."products"("code") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."egresos"
    ADD CONSTRAINT "egresos_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."egresos"
    ADD CONSTRAINT "egresos_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id");



ALTER TABLE ONLY "public"."general_counts"
    ADD CONSTRAINT "general_counts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."general_counts"
    ADD CONSTRAINT "general_counts_parent_count_id_fkey" FOREIGN KEY ("parent_count_id") REFERENCES "public"."general_counts"("id");



ALTER TABLE ONLY "public"."general_counts"
    ADD CONSTRAINT "general_counts_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id");



ALTER TABLE ONLY "public"."inventory_scans"
    ADD CONSTRAINT "inventory_scans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."label_print_history"
    ADD CONSTRAINT "label_print_history_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."label_print_history"
    ADD CONSTRAINT "label_print_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pedidos_ventas"
    ADD CONSTRAINT "pedidos_ventas_order_number_fkey" FOREIGN KEY ("order_number") REFERENCES "public"."pre_remitos"("order_number") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_measurements"
    ADD CONSTRAINT "product_measurements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."receipt_items_history"
    ADD CONSTRAINT "receipt_items_history_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."receipt_items_history"
    ADD CONSTRAINT "receipt_items_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."receipt_items"
    ADD CONSTRAINT "receipt_items_product_code_fkey" FOREIGN KEY ("product_code") REFERENCES "public"."products"("code");



ALTER TABLE ONLY "public"."receipt_items"
    ADD CONSTRAINT "receipt_items_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."receipts"
    ADD CONSTRAINT "receipts_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id");



ALTER TABLE ONLY "public"."security_logs"
    ADD CONSTRAINT "security_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."security_logs"
    ADD CONSTRAINT "security_logs_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stock_sucursal"
    ADD CONSTRAINT "stock_sucursal_product_code_fkey" FOREIGN KEY ("product_code") REFERENCES "public"."products"("code") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_sucursal"
    ADD CONSTRAINT "stock_sucursal_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id");



CREATE POLICY "Acceso público total" ON "public"."receipt_items_history" USING (true) WITH CHECK (true);



CREATE POLICY "Admin Write" ON "public"."app_settings" USING (true);



CREATE POLICY "Admin Write Counts" ON "public"."general_counts" USING (true);



CREATE POLICY "Admins can insert/update general_counts" ON "public"."general_counts" USING (true);



CREATE POLICY "Admins can view all reports" ON "public"."bug_reports" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role" = 'admin'::"text") OR ("users"."role" = 'superadmin'::"text"))))));



CREATE POLICY "Admins can view history" ON "public"."inventory_scans_history" FOR SELECT USING (("auth"."uid"() IN ( SELECT "users"."id"
   FROM "public"."users"
  WHERE ("users"."role" = 'admin'::"text"))));



CREATE POLICY "Allow all access to layout_missing" ON "public"."layout_missing" USING (true);



CREATE POLICY "Allow all for authenticated" ON "public"."dye_count_items" USING (true);



CREATE POLICY "Allow all for authenticated" ON "public"."dye_counting_lists" USING (true);



CREATE POLICY "Allow read access for authenticated users" ON "public"."inventory_scans_history" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Anyone can read branch_dye_types" ON "public"."branch_dye_types" FOR SELECT USING (true);



CREATE POLICY "Everyone can read general_counts" ON "public"."general_counts" FOR SELECT USING (true);



CREATE POLICY "Everyone can read settings" ON "public"."app_settings" FOR SELECT USING (true);



CREATE POLICY "Only admins can manage branch_dye_types" ON "public"."branch_dye_types" USING ((("auth"."jwt"() ->> 'role'::"text") = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = ANY (ARRAY['admin'::"text", 'superadmin'::"text"])));



CREATE POLICY "Permitir todo a usuarios autenticados" ON "public"."product_measurements" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Public Read" ON "public"."app_settings" FOR SELECT USING (true);



CREATE POLICY "Public Read Counts" ON "public"."general_counts" FOR SELECT USING (true);



CREATE POLICY "Stored procedure update" ON "public"."app_settings" FOR UPDATE USING (true);



CREATE POLICY "Users can insert their own reports" ON "public"."bug_reports" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."branch_dye_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bug_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dye_count_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dye_counting_lists" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."general_counts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."layout_missing" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_measurements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."receipt_items_history" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."egreso_items";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."general_counts";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."inventory_scans";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."receipt_items";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."remitos";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_inventory_scan"("p_order_number" "text", "p_user_id" "uuid", "p_code" "text", "p_delta" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_inventory_scan"("p_order_number" "text", "p_user_id" "uuid", "p_code" "text", "p_delta" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_inventory_scan"("p_order_number" "text", "p_user_id" "uuid", "p_code" "text", "p_delta" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."log_inventory_changes"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_inventory_changes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_inventory_changes"() TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON FUNCTION "public"."search_products"("search_term" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."search_products"("search_term" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_products"("search_term" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";


















GRANT ALL ON TABLE "public"."app_settings" TO "anon";
GRANT ALL ON TABLE "public"."app_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."app_settings" TO "service_role";



GRANT ALL ON TABLE "public"."barcode_history" TO "anon";
GRANT ALL ON TABLE "public"."barcode_history" TO "authenticated";
GRANT ALL ON TABLE "public"."barcode_history" TO "service_role";



GRANT ALL ON TABLE "public"."branch_dye_types" TO "anon";
GRANT ALL ON TABLE "public"."branch_dye_types" TO "authenticated";
GRANT ALL ON TABLE "public"."branch_dye_types" TO "service_role";



GRANT ALL ON TABLE "public"."bug_reports" TO "anon";
GRANT ALL ON TABLE "public"."bug_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."bug_reports" TO "service_role";



GRANT ALL ON TABLE "public"."dye_count_items" TO "anon";
GRANT ALL ON TABLE "public"."dye_count_items" TO "authenticated";
GRANT ALL ON TABLE "public"."dye_count_items" TO "service_role";



GRANT ALL ON TABLE "public"."dye_counting_lists" TO "anon";
GRANT ALL ON TABLE "public"."dye_counting_lists" TO "authenticated";
GRANT ALL ON TABLE "public"."dye_counting_lists" TO "service_role";



GRANT ALL ON TABLE "public"."egreso_items" TO "anon";
GRANT ALL ON TABLE "public"."egreso_items" TO "authenticated";
GRANT ALL ON TABLE "public"."egreso_items" TO "service_role";



GRANT ALL ON TABLE "public"."egreso_items_history" TO "anon";
GRANT ALL ON TABLE "public"."egreso_items_history" TO "authenticated";
GRANT ALL ON TABLE "public"."egreso_items_history" TO "service_role";



GRANT ALL ON TABLE "public"."egresos" TO "anon";
GRANT ALL ON TABLE "public"."egresos" TO "authenticated";
GRANT ALL ON TABLE "public"."egresos" TO "service_role";



GRANT ALL ON TABLE "public"."general_counts" TO "anon";
GRANT ALL ON TABLE "public"."general_counts" TO "authenticated";
GRANT ALL ON TABLE "public"."general_counts" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_scans" TO "anon";
GRANT ALL ON TABLE "public"."inventory_scans" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_scans" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_scans_history" TO "anon";
GRANT ALL ON TABLE "public"."inventory_scans_history" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_scans_history" TO "service_role";



GRANT ALL ON TABLE "public"."label_print_history" TO "anon";
GRANT ALL ON TABLE "public"."label_print_history" TO "authenticated";
GRANT ALL ON TABLE "public"."label_print_history" TO "service_role";



GRANT ALL ON TABLE "public"."layout_missing" TO "anon";
GRANT ALL ON TABLE "public"."layout_missing" TO "authenticated";
GRANT ALL ON TABLE "public"."layout_missing" TO "service_role";



GRANT ALL ON TABLE "public"."pedidos_ventas" TO "anon";
GRANT ALL ON TABLE "public"."pedidos_ventas" TO "authenticated";
GRANT ALL ON TABLE "public"."pedidos_ventas" TO "service_role";



GRANT ALL ON TABLE "public"."pre_remitos" TO "anon";
GRANT ALL ON TABLE "public"."pre_remitos" TO "authenticated";
GRANT ALL ON TABLE "public"."pre_remitos" TO "service_role";



GRANT ALL ON TABLE "public"."product_measurements" TO "anon";
GRANT ALL ON TABLE "public"."product_measurements" TO "authenticated";
GRANT ALL ON TABLE "public"."product_measurements" TO "service_role";



GRANT ALL ON TABLE "public"."receipt_items" TO "anon";
GRANT ALL ON TABLE "public"."receipt_items" TO "authenticated";
GRANT ALL ON TABLE "public"."receipt_items" TO "service_role";



GRANT ALL ON TABLE "public"."receipt_items_history" TO "anon";
GRANT ALL ON TABLE "public"."receipt_items_history" TO "authenticated";
GRANT ALL ON TABLE "public"."receipt_items_history" TO "service_role";



GRANT ALL ON TABLE "public"."receipts" TO "anon";
GRANT ALL ON TABLE "public"."receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."receipts" TO "service_role";



GRANT ALL ON TABLE "public"."remitos" TO "anon";
GRANT ALL ON TABLE "public"."remitos" TO "authenticated";
GRANT ALL ON TABLE "public"."remitos" TO "service_role";



GRANT ALL ON TABLE "public"."security_logs" TO "anon";
GRANT ALL ON TABLE "public"."security_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."security_logs" TO "service_role";



GRANT ALL ON TABLE "public"."stock_sucursal" TO "anon";
GRANT ALL ON TABLE "public"."stock_sucursal" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_sucursal" TO "service_role";



GRANT ALL ON TABLE "public"."sucursales" TO "anon";
GRANT ALL ON TABLE "public"."sucursales" TO "authenticated";
GRANT ALL ON TABLE "public"."sucursales" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































