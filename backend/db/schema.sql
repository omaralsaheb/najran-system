-- ============================================================
-- Najran Agency Internal System — Database Schema (PostgreSQL)
-- IMPORTANT: All analytics/content records are PERMANENT.
-- There is NO auto-delete or auto-expiry job on any table here.
-- ============================================================

-- ---------- ROLES & PERMISSIONS ----------
-- Each role owns an array of "module keys" it's allowed to access.
-- Add a new role anytime by inserting a row here — no code change needed.
CREATE TABLE roles (
  id           SERIAL PRIMARY KEY,
  key          VARCHAR(50) UNIQUE NOT NULL,        -- e.g. 'ceo', 'designer'
  label        VARCHAR(100) NOT NULL,               -- e.g. 'المدير العام والتنفيذي'
  permissions  JSONB NOT NULL DEFAULT '[]'::jsonb   -- e.g. ["overview","tasks","calendar","team","settings"]
);

INSERT INTO roles (key, label, permissions) VALUES
  ('ceo',                 'المدير العام والتنفيذي', '["overview","tasks","calendar","team","finance","reports","settings"]'),
  ('operational_manager', 'مديرة العمليات',          '["overview","tasks","calendar","team"]'),
  ('account_manager',     'مديرة حسابات',            '["my-dashboard","overview","tasks","calendar"]'),
  ('coordinator',         'منسقة إدارية',            '["my-dashboard","overview","tasks","calendar","team"]'),
  ('designer',            'مصممة جرافيك',             '["my-dashboard","tasks","calendar"]'),
  ('writer',              'كاتب محتوى',               '["my-dashboard","tasks","calendar"]'),
  ('photographer',        'مصورة مونتاج',             '["my-dashboard","tasks","calendar"]'),
  ('editor',              'مونتير فيديو',             '["my-dashboard","tasks","calendar"]');

-- ---------- EMPLOYEES / USER ACCOUNTS ----------
CREATE TABLE employees (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(150) NOT NULL,
  email           VARCHAR(150) UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,                    -- bcrypt hash, never plain text
  role_id         INTEGER NOT NULL REFERENCES roles(id),
  active          BOOLEAN NOT NULL DEFAULT true,     -- deactivate instead of deleting accounts
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- CLIENTS ----------
CREATE TABLE clients (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(150) NOT NULL,
  industry     VARCHAR(100),
  instagram    VARCHAR(100),
  brief        JSONB DEFAULT '{}'::jsonb,   -- {business, audience, voice, notes}
  account_manager_id INTEGER REFERENCES employees(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- TASKS (with Drive-link workflow) ----------
CREATE TABLE tasks (
  id           SERIAL PRIMARY KEY,
  title        VARCHAR(255) NOT NULL,
  client_id    INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  assignee_id  INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  priority     VARCHAR(10) NOT NULL DEFAULT 'mid',   -- high | mid | low
  status       VARCHAR(20) NOT NULL DEFAULT 'today', -- today | progress | review | revision | done
  deadline     TIMESTAMPTZ,
  drive_link   TEXT,                -- Photographer/Designer attaches Google Drive URL here
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every status change is logged permanently — full activity history, never purged.
CREATE TABLE task_activity (
  id          SERIAL PRIMARY KEY,
  task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  employee_id INTEGER REFERENCES employees(id),
  action      VARCHAR(100) NOT NULL,      -- e.g. 'status_changed', 'drive_link_added', 'comment'
  detail      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- CONTENT + META ANALYTICS (permanent retention) ----------
CREATE TABLE content (
  id              SERIAL PRIMARY KEY,
  client_id       INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type            VARCHAR(20) NOT NULL,          -- reel | post | story
  title           VARCHAR(255),
  page_name       VARCHAR(150),                  -- Meta Page Name, as typed by the team
  media_link      TEXT,                          -- the Reel/Story/Post URL
  media_id        VARCHAR(100),                  -- Meta Graph API media id, once resolved
  published_at    TIMESTAMPTZ,
  views           BIGINT DEFAULT 0,
  likes           BIGINT DEFAULT 0,
  comments        BIGINT DEFAULT 0,
  shares          BIGINT DEFAULT 0,
  last_synced_at  TIMESTAMPTZ,                   -- last time we pulled fresh numbers from Meta
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Time-series snapshot on every sync — this is what powers "growth over time" and
-- the monthly report. NEVER deleted, NEVER expires after 24h. This table is the
-- entire reason the monthly report / best-worst comparisons stay possible.
CREATE TABLE analytics_history (
  id          SERIAL PRIMARY KEY,
  content_id  INTEGER NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  views       BIGINT,
  likes       BIGINT,
  comments    BIGINT,
  shares      BIGINT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_analytics_history_content ON analytics_history(content_id, recorded_at);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_tasks_client ON tasks(client_id);
CREATE INDEX idx_content_client ON content(client_id);

-- ---------- FINANCE (per-client budget tracking) ----------
CREATE TABLE client_finance (
  id            SERIAL PRIMARY KEY,
  client_id     INTEGER UNIQUE NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  advance_paid  NUMERIC(12,2) NOT NULL DEFAULT 0,   -- مدفوع مقدماً
  extra_expenses NUMERIC(12,2) NOT NULL DEFAULT 0,  -- مصاريف زائدة
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- total = advance_paid + extra_expenses, computed on read (see routes/finance.js)

-- Every save is logged permanently here too — same pattern as task_activity.
CREATE TABLE finance_activity (
  id             SERIAL PRIMARY KEY,
  client_id      INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  employee_id    INTEGER REFERENCES employees(id),
  advance_paid   NUMERIC(12,2),
  extra_expenses NUMERIC(12,2),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_finance_client ON client_finance(client_id);
CREATE INDEX idx_finance_activity_client ON finance_activity(client_id, created_at);
