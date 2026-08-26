-- 比赛阶段的轻量身份与能力权限。
-- 不在这里引入租户/RLS；所有凭据只存 SHA-256 或 scrypt 哈希，不预置明文账号。

CREATE TABLE IF NOT EXISTS cityos.auth_user (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS auth_user_email_lower_uidx
  ON cityos.auth_user (lower(email));

CREATE TABLE IF NOT EXISTS cityos.auth_session (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES cityos.auth_user(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_session_active_user_idx
  ON cityos.auth_session (user_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS cityos.auth_api_key (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  actor_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cityos.auth_role_grant (
  principal_type TEXT NOT NULL CHECK (principal_type IN ('user', 'api_key')),
  principal_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'operator', 'supervisor', 'system_adapter', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (principal_type, principal_id, role)
);

CREATE INDEX IF NOT EXISTS auth_role_grant_principal_idx
  ON cityos.auth_role_grant (principal_type, principal_id);
