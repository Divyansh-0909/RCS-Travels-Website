-- Run once per database using a role permitted to install extensions.
-- Safe to rerun; this enables pgvector without creating RAG tables.
-- https://supabase.com/docs/guides/database/extensions/pgvector
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
