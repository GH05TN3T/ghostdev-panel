// Panel web · Worker: login con Discord, API, conexión de los servidores y bot

import { discordInteractions, registerCommands } from './discord';
import {
  ensureSchema, addLog, createSession, currentUser, destroySession, type Env, fail, hub, isOwner, json, now, randomHex,
  rankIn, readCookie, cookie, sameOrigin, sameText, sha256, type User,
} from './lib';

export { ServerHub } from './hub';

const SERVER_ID = /^srv_[a-z0-9]{12}$/;
const DISCORD_ID = /^\d{15,22}$/;
const RANK = /^[\w-]{1,32}$/;

const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'content-security-policy':
    "default-src 'self'; img-src 'self' data: https://cdn.discordapp.com; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' wss:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

function withSecurity(res: Response) {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) r.headers.set(k, v);
  if (r.headers.get('content-type')?.includes('text/html')) r.headers.set('cache-control', 'no-store');
  return r;
}

// ─────────────────────────────────────────────────────────────── conexión de los servidores (ghostdev_admin)

async function agent(req: Request, env: Env) {
  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer (srv_[a-z0-9]{12})\.([a-f0-9]{64})$/);
  if (!m) return new Response('clave no válida', { status: 401 });
  const row = await env.DB.prepare('SELECT key_hash FROM servers WHERE id = ?').bind(m[1]).first<{ key_hash: string }>();
  if (!row || !sameText(row.key_hash, await sha256(m[2]))) return new Response('clave no válida', { status: 401 });
  const fwd = new Request('https://hub/agent', req);
  fwd.headers.set('x-gd-server', m[1]);
  return hub(env, m[1]).fetch(fwd);
}

// ─────────────────────────────────────────────────────────────── login con Discord

async function login(req: Request, env: Env) {
  if (!env.DISCORD_CLIENT_ID) return new Response('Falta DISCORD_CLIENT_ID en las variables del Worker.', { status: 500 });
  const state = randomHex(16);
  const u = new URL('https://discord.com/oauth2/authorize');
  u.searchParams.set('client_id', env.DISCORD_CLIENT_ID);
  u.searchParams.set('redirect_uri', new URL('/api/auth/callback', req.url).toString());
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', 'identify');
  u.searchParams.set('state', state);
  u.searchParams.set('prompt', 'none');
  return new Response(null, { status: 302, headers: { location: u.toString(), 'set-cookie': cookie('gdp_state', state, 600, '/api/auth') } });
}

async function callback(req: Request, env: Env) {
  const url = new URL(req.url);
  const back = (err?: string) => new Response(null, { status: 302, headers: { location: err ? `/?error=${encodeURIComponent(err)}` : '/' } });
  const state = url.searchParams.get('state');
  const saved = readCookie(req, 'gdp_state');
  if (!state || !saved || !sameText(state, saved)) return back('La sesión de inicio caducó. Vuelve a intentarlo.');
  const code = url.searchParams.get('code');
  if (!code || !env.DISCORD_CLIENT_SECRET) return back('No se pudo iniciar sesión con Discord.');

  const tok = await fetch('https://discord.com/api/v10/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET, grant_type: 'authorization_code',
      code, redirect_uri: new URL('/api/auth/callback', req.url).toString(),
    }),
  }).then((r) => r.json<{ access_token?: string }>()).catch(() => ({} as { access_token?: string }));
  if (!tok.access_token) return back('Discord no aceptó el inicio de sesión.');

  const me = await fetch('https://discord.com/api/v10/users/@me', { headers: { authorization: `Bearer ${tok.access_token}` } })
    .then((r) => r.json<{ id: string; username: string; global_name?: string | null; avatar?: string | null }>()).catch(() => null);
  if (!me?.id) return back('No se pudo leer tu cuenta de Discord.');

  // solo entra quien es dueño o está en el staff de algún servidor
  const has = isOwner(env, me.id) || (await env.DB.prepare('SELECT 1 FROM server_staff WHERE user_id = ? LIMIT 1').bind(me.id).first());
  if (!has) return back('Tu cuenta de Discord no tiene acceso a este panel.');

  const name = (me.global_name || me.username).slice(0, 64);
  const avatar = me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=96` : null;
  await env.DB.prepare(
    'INSERT INTO users (id, name, avatar, last_login) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET name = excluded.name, avatar = excluded.avatar, last_login = excluded.last_login',
  ).bind(me.id, name, avatar, now()).run();

  const headers = new Headers({ location: '/' });
  headers.append('set-cookie', await createSession(env, me.id, req));
  headers.append('set-cookie', cookie('gdp_state', '', 0, '/api/auth'));
  return new Response(null, { status: 302, headers });
}

// ─────────────────────────────────────────────────────────────── API

async function serverList(env: Env, user: User) {
  const owner = isOwner(env, user.id);
  const rows = owner
    ? (await env.DB.prepare("SELECT id, name, last_seen, log_channel, 'owner' AS rank FROM servers ORDER BY created").all()).results
    : (await env.DB.prepare('SELECT s.id, s.name, s.last_seen, s.log_channel, st.rank FROM servers s JOIN server_staff st ON st.server_id = s.id WHERE st.user_id = ? ORDER BY s.created').bind(user.id).all()).results;
  const out = [];
  for (const r of rows as { id: string; name: string; last_seen: number | null; log_channel: string | null; rank: string }[]) {
    const st = await hub(env, r.id).fetch('https://hub/status').then((x) => x.json<{ online: boolean; info: { name?: string } }>()).catch(() => ({ online: false, info: {} as { name?: string } }));
    out.push({ id: r.id, name: r.name, rank: r.rank, online: st.online, lastSeen: r.last_seen, gameName: st.info?.name || null, logChannel: owner ? r.log_channel : undefined });
  }
  return out;
}

async function api(req: Request, env: Env, path: string, ctx: ExecutionContext): Promise<Response> {
  if (path === '/api/auth/login') return login(req, env);
  if (path === '/api/auth/callback') return callback(req, env);
  if (path === '/api/discord/interactions' && req.method === 'POST') return discordInteractions(req, env, ctx);

  if (path === '/api/brand') return json({ ok: true, brand: env.BRAND || 'Panel' });
  if (req.method !== 'GET' && !sameOrigin(req)) return fail('Origen no permitido.', 403);

  if (path === '/api/auth/logout' && req.method === 'POST') {
    return json({ ok: true }, 200, { 'set-cookie': await destroySession(env, req) });
  }

  const user = await currentUser(env, req);
  if (!user) return fail('Inicia sesión.', 401);
  const owner = isOwner(env, user.id);

  if (path === '/api/me') {
    return json({ ok: true, user, owner, brand: env.BRAND, servers: await serverList(env, user), bot: !!env.DISCORD_BOT_TOKEN });
  }

  // crear servidor (solo dueños): la clave se enseña una vez
  if (path === '/api/servers' && req.method === 'POST') {
    if (!owner) return fail('Solo el dueño.', 403);
    const body = await req.json<{ name?: string }>().catch(() => ({} as { name?: string }));
    const name = String(body.name || '').trim().slice(0, 48);
    if (name.length < 2) return fail('Ponle un nombre.');
    const id = 'srv_' + randomHex(6);
    const secret = randomHex(32);
    await env.DB.prepare('INSERT INTO servers (id, name, key_hash, created) VALUES (?, ?, ?, ?)').bind(id, name, await sha256(secret), now()).run();
    await addLog(env, id, user.name, 'Crear servidor', name, null);
    return json({ ok: true, id, key: `${id}.${secret}` });
  }

  const m = path.match(/^\/api\/servers\/(srv_[a-z0-9]{12})(\/.*)?$/);
  if (m) {
    const sid = m[1], sub = m[2] || '';
    if (!SERVER_ID.test(sid)) return fail('Servidor no válido.');
    const server = await env.DB.prepare('SELECT id, name, log_channel FROM servers WHERE id = ?').bind(sid).first<{ id: string; name: string; log_channel: string | null }>();
    if (!server) return fail('Ese servidor no existe.', 404);
    const rank = await rankIn(env, sid, user.id);
    if (!rank) return fail('No tienes acceso a ese servidor.', 403);

    // tiempo real: se pasa la conexión al hub con el rango de la sesión
    if (sub === '/ws') {
      if (req.headers.get('upgrade') !== 'websocket') return fail('Hace falta WebSocket.', 426);
      const origin = req.headers.get('origin');
      if (origin && origin !== new URL(req.url).origin) return fail('Origen no permitido.', 403);
      const fwd = new Request('https://hub/client', req);
      fwd.headers.set('x-gd-server', sid);
      fwd.headers.set('x-gd-user', JSON.stringify({ id: user.id, name: user.name, rank }));
      return hub(env, sid).fetch(fwd);
    }

    if (sub === '/logs' && req.method === 'GET') {
      const u = new URL(req.url);
      const q = (u.searchParams.get('q') || '').slice(0, 40).replace(/[%_]/g, '');
      const via = u.searchParams.get('via') || '';
      const page = Math.max(0, Math.min(500, parseInt(u.searchParams.get('page') || '0') || 0));
      const where = ['server_id = ?'];
      const args: (string | number)[] = [sid];
      if (q) { where.push('(staff LIKE ? OR action LIKE ? OR target LIKE ? OR detail LIKE ?)'); args.push(...Array(4).fill(`%${q}%`)); }
      if (['juego', 'web', 'discord'].includes(via)) { where.push('via = ?'); args.push(via); }
      const rows = await env.DB.prepare(`SELECT id, staff, action, target, detail, via, created FROM logs WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT 50 OFFSET ?`)
        .bind(...args, page * 50).all();
      return json({ ok: true, logs: rows.results });
    }

    if (sub === '/stats' && req.method === 'GET') {
      const days = Math.min(30, Math.max(1, parseInt(new URL(req.url).searchParams.get('days') || '1') || 1));
      const since = now() - days * 86400;
      const bucket = days <= 1 ? 1800 : days <= 7 ? 3 * 3600 : 12 * 3600;
      const [series, peak, staffActs, sanctions, totals] = await Promise.all([
        env.DB.prepare('SELECT (t / CAST(? AS INTEGER)) * CAST(? AS INTEGER) AS b, MAX(players) AS players, AVG(players) AS avg, MAX(staff) AS staff FROM stats WHERE server_id = ? AND t >= ? GROUP BY b ORDER BY b')
          .bind(bucket, bucket, sid, since).all(),
        env.DB.prepare('SELECT MAX(players) AS peak, AVG(players) AS avg FROM stats WHERE server_id = ? AND t >= ?').bind(sid, since).first(),
        env.DB.prepare("SELECT REPLACE(REPLACE(staff, ' (web)', ''), ' (discord)', '') AS who, COUNT(*) AS n FROM logs WHERE server_id = ? AND created >= ? AND staff <> 'Sistema' GROUP BY who ORDER BY n DESC LIMIT 12").bind(sid, since).all(),
        env.DB.prepare("SELECT REPLACE(REPLACE(staff, ' (web)', ''), ' (discord)', '') AS who, SUM(action LIKE 'Banear%') AS bans, SUM(action = 'Expulsar') AS kicks, SUM(action = 'Advertir') AS warns, SUM(action IN ('Cárcel', 'Barrer', 'Cambio de modelo')) AS punish FROM logs WHERE server_id = ? AND created >= ? GROUP BY who HAVING bans + kicks + warns + punish > 0 ORDER BY bans + kicks + warns + punish DESC LIMIT 12").bind(sid, since).all(),
        env.DB.prepare("SELECT SUM(action LIKE 'Banear%') AS bans, SUM(action = 'Expulsar') AS kicks, SUM(action = 'Advertir') AS warns, SUM(action IN ('Cárcel', 'Barrer', 'Cambio de modelo')) AS punish, COUNT(*) AS actions FROM logs WHERE server_id = ? AND created >= ?").bind(sid, since).first(),
      ]);
      const points = (series.results as { b: number; players: number; avg: number; staff: number }[]).map((r) => ({ t: r.b, players: r.players, avg: r.avg, staff: r.staff }));
      const rename = <T extends { who: string }>(rows: T[]) => rows.map(({ who, ...r }) => ({ staff: who, ...r }));
      return json({ ok: true, days, bucket, series: points, peak, staff: rename(staffActs.results as { who: string; n: number }[]), sanctions: rename(sanctions.results as { who: string }[]), totals });
    }

    // a partir de aquí, solo dueños
    if (!owner) return fail('Solo el dueño.', 403);

    if (sub === '' && req.method === 'PATCH') {
      const body = await req.json<{ name?: string; logChannel?: string }>().catch(() => ({} as { name?: string; logChannel?: string }));
      const name = body.name !== undefined ? String(body.name).trim().slice(0, 48) : server.name;
      if (name.length < 2) return fail('Ponle un nombre.');
      let channel = server.log_channel;
      if (body.logChannel !== undefined) {
        channel = String(body.logChannel).trim() || null;
        if (channel && !DISCORD_ID.test(channel)) return fail('El canal tiene que ser el ID numérico del canal de Discord.');
      }
      await env.DB.prepare('UPDATE servers SET name = ?, log_channel = ? WHERE id = ?').bind(name, channel, sid).run();
      return json({ ok: true });
    }

    if (sub === '/key' && req.method === 'POST') {
      const secret = randomHex(32);
      await env.DB.prepare('UPDATE servers SET key_hash = ? WHERE id = ?').bind(await sha256(secret), sid).run();
      await hub(env, sid).fetch('https://hub/kick-agent', { method: 'POST' });
      await addLog(env, sid, user.name, 'Nueva clave del servidor', server.name, 'la anterior deja de funcionar');
      return json({ ok: true, key: `${sid}.${secret}` });
    }

    if (sub === '' && req.method === 'DELETE') {
      await hub(env, sid).fetch('https://hub/kick-agent', { method: 'POST' });
      await env.DB.batch([
        env.DB.prepare('DELETE FROM server_staff WHERE server_id = ?').bind(sid),
        env.DB.prepare('DELETE FROM logs WHERE server_id = ?').bind(sid),
        env.DB.prepare('DELETE FROM servers WHERE id = ?').bind(sid),
      ]);
      return json({ ok: true });
    }

    if (sub === '/staff' && req.method === 'GET') {
      const rows = await env.DB.prepare(
        'SELECT st.user_id AS id, st.rank, st.note, st.added, u.name, u.avatar, u.last_login FROM server_staff st LEFT JOIN users u ON u.id = st.user_id WHERE st.server_id = ? ORDER BY st.added',
      ).bind(sid).all();
      return json({ ok: true, staff: rows.results });
    }

    if (sub === '/staff' && req.method === 'PUT') {
      const body = await req.json<{ id?: string; rank?: string; note?: string }>().catch(() => ({} as { id?: string; rank?: string; note?: string }));
      const id = String(body.id || '').trim(), rank = String(body.rank || '').trim();
      if (!DISCORD_ID.test(id)) return fail('Pon el ID de Discord (solo números).');
      if (!RANK.test(rank)) return fail('Elige un rango.');
      if (isOwner(env, id)) return fail('Esa cuenta ya es dueña del panel.');
      const note = String(body.note || '').trim().slice(0, 64) || null;
      await env.DB.prepare(
        'INSERT INTO server_staff (server_id, user_id, rank, note, added_by, added) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (server_id, user_id) DO UPDATE SET rank = excluded.rank, note = excluded.note',
      ).bind(sid, id, rank, note, user.id, now()).run();
      await hub(env, sid).fetch('https://hub/kick-user', { method: 'POST', body: JSON.stringify({ id }) }); // vuelve a entrar con el rango nuevo
      await addLog(env, sid, user.name, 'Staff web', note || id, `rango ${rank}`);
      return json({ ok: true });
    }

    const del = sub.match(/^\/staff\/(\d{15,22})$/);
    if (del && req.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM server_staff WHERE server_id = ? AND user_id = ?').bind(sid, del[1]).run();
      await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND NOT EXISTS (SELECT 1 FROM server_staff WHERE user_id = ?)').bind(del[1], del[1]).run();
      await hub(env, sid).fetch('https://hub/kick-user', { method: 'POST', body: JSON.stringify({ id: del[1] }) });
      await addLog(env, sid, user.name, 'Quitar staff web', del[1], null);
      return json({ ok: true });
    }
  }

  if (path === '/api/discord/register' && req.method === 'POST') {
    if (!owner) return fail('Solo el dueño.', 403);
    return registerCommands(env);
  }

  return fail('No existe.', 404);
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/agent' || url.pathname.startsWith('/api/')) await ensureSchema(env);
    if (url.pathname === '/agent') return agent(req, env);
    if (url.pathname.startsWith('/api/')) {
      try {
        const res = await api(req, env, url.pathname, ctx);
        return res.status === 101 ? res : withSecurity(res);
      } catch (e) {
        console.error(e);
        return withSecurity(fail('Algo falló en el panel.', 500));
      }
    }
    return withSecurity(await env.ASSETS.fetch(req));
  },
} satisfies ExportedHandler<Env>;
