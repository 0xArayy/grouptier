CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id     BIGINT NOT NULL,
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

-- Public poll catalog
ALTER TABLE saved_polls ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE saved_polls ADD COLUMN IF NOT EXISTS show_author BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE saved_polls ADD COLUMN IF NOT EXISTS author_name TEXT;
ALTER TABLE saved_polls ADD COLUMN IF NOT EXISTS uses_count INTEGER NOT NULL DEFAULT 0;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS saved_polls_public_idx ON saved_polls (is_public, updated_at DESC)
  WHERE is_public = true;

CREATE INDEX IF NOT EXISTS saved_polls_name_trgm_idx ON saved_polls USING GIN (name gin_trgm_ops)
  WHERE is_public = true;

CREATE INDEX IF NOT EXISTS options_session_id_idx ON options(session_id);
CREATE INDEX IF NOT EXISTS user_results_session_id_idx ON user_results(session_id);
