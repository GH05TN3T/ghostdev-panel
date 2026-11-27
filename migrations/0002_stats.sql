-- Muestras para las estadísticas (una cada 5 minutos por servidor)
CREATE TABLE IF NOT EXISTS stats (
  server_id TEXT NOT NULL,
  t INTEGER NOT NULL,
  players INTEGER NOT NULL,
  staff INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (server_id, t)
);
