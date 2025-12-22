-- Enable pgvector extension for AssistOS
-- Sprint 1: Vector Migration
-- This must be run BEFORE npm run db:push

CREATE EXTENSION IF NOT EXISTS vector;

-- Verify installation
SELECT * FROM pg_extension WHERE extname = 'vector';
