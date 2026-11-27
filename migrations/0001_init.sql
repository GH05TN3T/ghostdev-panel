-- Panel web · base de datos D1

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,               -- ID de Discord
  name TEXT NOT NULL,
  avatar TEXT,
  created INTEGER NOT NULL DEFAULT (unixepoch()),
  last_login INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,       -- SHA-256 del token de la cookie (el token no se guarda)
  user_id TEXT NOT NULL,
  expires INTEGER NOT NULL,
  created INTEGER NOT NULL,
  ip TEXT,
  ua TEXT
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);

CREATE TABLE IF NOT EXISTS servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,            -- SHA-256 de la clave del server.cfg (la clave no se guarda)
  created INTEGER NOT NULL,
  last_seen INTEGER,
  log_channel TEXT                   -- canal de Discord donde el bot manda los logs
);

CREATE TABLE IF NOT EXISTS server_staff (
  server_id TEXT NOT NULL,
  user_id TEXT NOT NULL,             -- ID de Discord
  rank TEXT NOT NULL,                -- rango de ghostdev_admin que tiene en ese servidor
  note TEXT,
  added_by TEXT,
  added INTEGER NOT NULL,
  PRIMARY KEY (server_id, user_id)
);

CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id TEXT NOT NULL,
  staff TEXT,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  via TEXT NOT NULL DEFAULT 'juego', -- juego · web · discord
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS logs_server ON logs (server_id, id DESC);
