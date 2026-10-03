DO $$ BEGIN
  CREATE ROLE hedes_app WITH LOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
GRANT rds_iam TO hedes_app;

CREATE TABLE IF NOT EXISTS sync_records (
  user_id text NOT NULL,
  record_type text NOT NULL,
  record_id text NOT NULL,
  payload jsonb NOT NULL,
  revision bigint NOT NULL CHECK (revision > 0),
  client_updated_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted boolean NOT NULL DEFAULT false,
  mutation_id uuid NOT NULL,
  PRIMARY KEY (user_id, record_type, record_id)
);
CREATE INDEX IF NOT EXISTS sync_records_pull_idx
  ON sync_records (user_id, updated_at, record_type, record_id);

CREATE TABLE IF NOT EXISTS sync_mutations (
  user_id text NOT NULL,
  mutation_id uuid NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, mutation_id)
);

CREATE TABLE IF NOT EXISTS file_uploads (
  user_id text NOT NULL,
  file_id uuid NOT NULL,
  object_key text NOT NULL UNIQUE,
  project_id text NOT NULL,
  file_path text NOT NULL,
  declared_bytes bigint NOT NULL CHECK (declared_bytes > 0),
  content_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'complete', 'deleting', 'deleted')),
  object_version_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, file_id)
);
ALTER TABLE file_uploads ADD COLUMN IF NOT EXISTS object_version_id text;
CREATE INDEX IF NOT EXISTS file_uploads_project_idx
  ON file_uploads (user_id, project_id, status);

CREATE TABLE IF NOT EXISTS user_storage (
  user_id text PRIMARY KEY,
  used_bytes bigint NOT NULL DEFAULT 0 CHECK (used_bytes >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sync_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_records FORCE ROW LEVEL SECURITY;
ALTER TABLE sync_mutations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_mutations FORCE ROW LEVEL SECURITY;
ALTER TABLE file_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_uploads FORCE ROW LEVEL SECURITY;
ALTER TABLE user_storage ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_storage FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY sync_records_tenant ON sync_records
    USING (user_id = current_setting('hedes.user_id', true))
    WITH CHECK (user_id = current_setting('hedes.user_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY sync_mutations_tenant ON sync_mutations
    USING (user_id = current_setting('hedes.user_id', true))
    WITH CHECK (user_id = current_setting('hedes.user_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY file_uploads_tenant ON file_uploads
    USING (user_id = current_setting('hedes.user_id', true))
    WITH CHECK (user_id = current_setting('hedes.user_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY user_storage_tenant ON user_storage
    USING (user_id = current_setting('hedes.user_id', true))
    WITH CHECK (user_id = current_setting('hedes.user_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON sync_records, sync_mutations, file_uploads, user_storage TO hedes_app;
GRANT USAGE ON SCHEMA public TO hedes_app;
