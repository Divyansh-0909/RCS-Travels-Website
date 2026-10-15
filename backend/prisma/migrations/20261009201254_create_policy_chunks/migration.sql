BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE public.policy_chunks (
    id BIGSERIAL PRIMARY KEY,
    document_name TEXT NOT NULL,
    section TEXT NOT NULL,
    content TEXT NOT NULL,
    source_path TEXT NOT NULL,
    chunk_key TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    version TEXT NOT NULL,
    effective_from DATE,
    metadata JSONB NOT NULL DEFAULT '{}',
    embedding_model TEXT NOT NULL,
    embedding extensions.vector(1536) NOT NULL
);

CREATE UNIQUE INDEX policy_chunks_source_path_chunk_key_key
    ON public.policy_chunks (source_path, chunk_key);

-- Match the existing trusted-backend access model; there are no public policies.
ALTER TABLE public.policy_chunks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.policy_chunks FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.policy_chunks_id_seq FROM PUBLIC;

-- These roles exist on Supabase but not necessarily on a local Postgres server.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE public.policy_chunks FROM anon;
        REVOKE ALL ON SEQUENCE public.policy_chunks_id_seq FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE public.policy_chunks FROM authenticated;
        REVOKE ALL ON SEQUENCE public.policy_chunks_id_seq FROM authenticated;
    END IF;
END
$$;

COMMIT;
