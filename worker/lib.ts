import SCHEMA_1 from '../migrations/0001_init.sql';
import SCHEMA_2 from '../migrations/0002_stats.sql';
const SCHEMA = SCHEMA_1 + ';' + SCHEMA_2;
// Panel web · utilidades: entorno, respuestas, cookies, sesiones y permisos

export interface Env {
  DB: D1Database;
  HUB: DurableObjectNamespace;
  ASSETS: Fetcher;
  BRAND: string;
  OWNER_IDS: string;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET?: string;
  DISCORD_PUBLIC_KEY: string;
  DISCORD_BOT_TOKEN?: string;
  DISCORD_GUILD_ID?: string;
}

export interface User { id: string; name: string; avatar: string | null }
export interface Principal { id: string; name: string; rank: string }

export const now = () => Math.floor(Date.now() / 1000);

export const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

export const fail = (msg: string, status = 400) => json({ ok: false, msg }, status);

export function randomHex(bytes = 32) {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export async function sha256(text: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Comparación sin atajos (mismo tiempo aunque falle al principio) */
export function sameText(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function readCookie(req: Request, name: string) {
  const raw = req.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export const cookie = (name: string, value: string, maxAge: number, path = '/') =>
  `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

export const ownerIds = (env: Env) => (env.OWNER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
export const isOwner = (env: Env, id: string) => ownerIds(env).includes(id);

// ─────────────────────────────────────────────────────────────── sesiones

export const SESSION = 'gdp_session';
const SESSION_DAYS = 14;

export async function createSession(env: Env, userId: string, req: Request) {
  const token = randomHex(32);
  const t = now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires, created, ip, ua) VALUES (?, ?, ?, ?, ?, ?)').bind(
      await sha256(token), userId, t + SESSION_DAYS * 86400, t,
      req.headers.get('cf-connecting-ip'), (req.headers.get('user-agent') || '').slice(0, 200),
    ),
    env.DB.prepare('DELETE FROM sessions WHERE expires <= ?').bind(t),
  ]);
  return cookie(SESSION, token, SESSION_DAYS * 86400);
}

export async function currentUser(env: Env, req: Request): Promise<User | null> {
  const token = readCookie(req, SESSION);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return env.DB.prepare(
    'SELECT u.id, u.name, u.avatar FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires > unixepoch()',
  ).bind(await sha256(token)).first<User>();
}

export async function destroySession(env: Env, req: Request) {
  const token = readCookie(req, SESSION);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  return cookie(SESSION, '', 0);
}

/** Rango que tiene alguien en un servidor (los dueños, owner en todos) o null si no tiene acceso */
export async function rankIn(env: Env, serverId: string, userId: string) {
  if (isOwner(env, userId)) return 'owner';
  const row = await env.DB.prepare('SELECT rank FROM server_staff WHERE server_id = ? AND user_id = ?').bind(serverId, userId).first<{ rank: string }>();
  return row?.rank || null;
}

/** Peticiones que cambian algo: tienen que venir de la propia web (evita que otra página las lance con tu sesión) */
export function sameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (!origin) return req.method === 'GET';
  return origin === new URL(req.url).origin;
}

export async function addLog(env: Env, serverId: string, staff: string, action: string, target: string | null, detail: string | null, via = 'web') {
  await env.DB.prepare('INSERT INTO logs (server_id, staff, action, target, detail, via, created) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(serverId, staff.slice(0, 64), action.slice(0, 48), target?.slice(0, 96) ?? null, detail?.slice(0, 255) ?? null, via, now()).run();
}

// Las tablas se crean solas la primera vez (no hace falta aplicar migraciones a mano)
let schemaReady = false;
export async function ensureSchema(env: Env) {
  if (schemaReady) return;
  const sql = SCHEMA.split(';').map((q) => q.replace(/--[^\n]*/g, '').trim()).filter(Boolean);
  await env.DB.batch(sql.map((q) => env.DB.prepare(q)));
  schemaReady = true;
}

export const hub = (env: Env, serverId: string) => env.HUB.get(env.HUB.idFromName(serverId));

/** Pide algo al servidor de FiveM a través del hub (para el bot y la API) */
export async function rpc(env: Env, serverId: string, body: { kind: string; name?: string; data?: unknown; by?: Principal }) {
  const res = await hub(env, serverId).fetch('https://hub/rpc', { method: 'POST', body: JSON.stringify(body) });
  return res.json<{ ok: boolean; msg?: string; data?: any }>();
}
