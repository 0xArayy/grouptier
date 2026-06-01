CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id     BIGINT,
  name        TEXT,
  message_id  BIGINT,
  status      TEXT NOT NULL DEFAULT 'collecting',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sessions_chat_id_idx ON sessions (chat_id);

-- One collecting session per chat at a time (DB-level enforcement for the 409 race guard)
CREATE UNIQUE INDEX IF NOT EXISTS sessions_one_collecting_per_chat
  ON sessions (chat_id) WHERE status = 'collecting';

-- message_sent tracks whether the bot vote message was successfully delivered.
-- If status='voting' AND message_sent=false the server crashed between the status
-- flip and sendMessage — treat this session as 'collecting' until the message lands.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS message_sent BOOLEAN NOT NULL DEFAULT false;

-- Chatless poll support: make chat_id nullable and track creator for ownership.
-- PostgreSQL excludes NULLs from unique indexes, so sessions_one_collecting_per_chat
-- remains valid — multiple chatless sessions can coexist without violating it.
ALTER TABLE sessions ALTER COLUMN chat_id DROP NOT NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS creator_user_id BIGINT;

CREATE TABLE IF NOT EXISTS options (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_results (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id      BIGINT NOT NULL,
  ranked_list  JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, user_id)
);

CREATE TABLE IF NOT EXISTS session_voters (
  session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id     BIGINT NOT NULL,
  PRIMARY KEY (session_id, user_id)
);

CREATE TABLE IF NOT EXISTS saved_polls (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     BIGINT NOT NULL,
  name        TEXT NOT NULL,
  options     JSONB NOT NULL DEFAULT '[]',
  emoji       TEXT NOT NULL DEFAULT '📝',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS saved_polls_user_id_idx ON saved_polls(user_id);

-- Publish-related columns for saved_polls (added post-launch)
ALTER TABLE saved_polls ADD COLUMN IF NOT EXISTS is_public    BOOLEAN  NOT NULL DEFAULT false;
ALTER TABLE saved_polls ADD COLUMN IF NOT EXISTS show_author  BOOLEAN  NOT NULL DEFAULT false;
ALTER TABLE saved_polls ADD COLUMN IF NOT EXISTS author_name  TEXT;
ALTER TABLE saved_polls ADD COLUMN IF NOT EXISTS uses_count   INTEGER  NOT NULL DEFAULT 0;
ALTER TABLE saved_polls ADD COLUMN IF NOT EXISTS categories   TEXT[]   NOT NULL DEFAULT '{}';

-- Curated public templates catalog
CREATE TABLE IF NOT EXISTS public_templates (
  id        UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  emoji     TEXT    NOT NULL DEFAULT '📋',
  name      TEXT    NOT NULL,
  options   JSONB   NOT NULL DEFAULT '[]',
  author    TEXT    NOT NULL DEFAULT 'GroupTier',
  official  BOOLEAN NOT NULL DEFAULT false,
  category  TEXT    NOT NULL DEFAULT 'other',
  tags      TEXT[]  NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Usage event log for HOT metric
CREATE TABLE IF NOT EXISTS template_uses (
  id          UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID      NOT NULL REFERENCES public_templates(id) ON DELETE CASCADE,
  used_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS template_uses_template_id_idx ON template_uses (template_id);
CREATE INDEX IF NOT EXISTS template_uses_used_at_idx     ON template_uses (used_at DESC, template_id);

-- Tags column for curated public_templates (full-text search enrichment, idempotent on existing DBs)
ALTER TABLE public_templates ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

-- Seed tags for curated templates by category (idempotent — only updates rows with empty tags)
UPDATE public_templates SET tags = ARRAY['games', 'gaming', 'pc', 'multiplayer', 'steam']::TEXT[] WHERE category = 'games'   AND tags = '{}';
UPDATE public_templates SET tags = ARRAY['food', 'restaurant', 'pizza', 'delivery', 'lunch']::TEXT[] WHERE category = 'food'    AND tags = '{}';
UPDATE public_templates SET tags = ARRAY['movies', 'cinema', 'film', 'watch', 'кино']::TEXT[]           WHERE category = 'movies'  AND tags = '{}';
UPDATE public_templates SET tags = ARRAY['series', 'tv', 'netflix', 'show', 'сериал']::TEXT[]           WHERE category = 'series'  AND tags = '{}';
UPDATE public_templates SET tags = ARRAY['music', 'song', 'album', 'playlist', 'artist']::TEXT[]         WHERE category = 'music'   AND tags = '{}';
UPDATE public_templates SET tags = ARRAY['sport', 'football', 'fitness', 'match', 'team']::TEXT[]        WHERE category = 'sport'   AND tags = '{}';
