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

-- Public preset templates (community + official)
CREATE TABLE IF NOT EXISTS public_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emoji      TEXT NOT NULL DEFAULT '📝',
  name       TEXT NOT NULL,
  options    JSONB NOT NULL DEFAULT '[]',
  author     TEXT NOT NULL DEFAULT 'GroupTier',
  official   BOOLEAN NOT NULL DEFAULT false,
  category   TEXT NOT NULL DEFAULT 'other',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT public_templates_name_key UNIQUE (name)
);

-- Event log for HOT metric: top-3 by uses in last 7 days
CREATE TABLE IF NOT EXISTS template_uses (
  template_id UUID NOT NULL REFERENCES public_templates(id) ON DELETE CASCADE,
  used_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS template_uses_template_id_idx ON template_uses(template_id);
CREATE INDEX IF NOT EXISTS template_uses_used_at_idx ON template_uses(used_at);

-- Seed official templates (idempotent)
INSERT INTO public_templates (emoji, name, options, author, official, category) VALUES
  ('🍕', 'Что будем есть?',      '["Пицца","Суши","Бургеры","Тако","Рамен","Паста","Тайская","Салат"]',                                            'GroupTier',  true,  'food'),
  ('🎮', 'Во что сыграем?',      '["Minecraft","Valorant","CS2","Among Us","Stardew Valley","Rocket League","Fortnite","League of Legends"]',        'GroupTier',  true,  'games'),
  ('🎬', 'Какой жанр сегодня?',  '["Боевик","Комедия","Ужасы","Романтика","Фантастика","Триллер","Анимация","Документалка"]',                       'GroupTier',  true,  'movies'),
  ('📺', 'Какой сериал смотрим?','["Breaking Bad","Game of Thrones","The Bear","Severance","Succession","The Wire","Chernobyl","Dark"]',              '@alex',      false, 'series'),
  ('🎵', 'Какую музыку ставим?', '["Хип-хоп","Поп","Рок","Электронная","Джаз","R&B","Классика","Инди"]',                                           'GroupTier',  true,  'music'),
  ('🏖️','Куда едем?',            '["Море","Горы","Город","Дача","Кемпинг","Экскурсии","Спа","Остаёмся дома"]',                                      '@marina',    false, 'other'),
  ('🎯', 'Чем займёмся?',        '["Боулинг","Кино","Бар","Парк","Квест","Настолки","Каток","Кафе"]',                                               '@dmitry',    false, 'other'),
  ('🍺', 'Что пьём?',            '["Пиво","Вино","Коктейли","Виски","Текила","Просекко","Безалкогольное","Чай"]',                                    '@sasha',     false, 'other'),
  ('⚽', 'Лучшие матчи сезона',  '["Финал ЛЧ","Класико","Дерби Мерсисайда","Манчестерское дерби","Дерби делла Мадонина"]',                         '@sport_fan', false, 'sport')
ON CONFLICT (name) DO NOTHING;
