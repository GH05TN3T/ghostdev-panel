// Panel web · bot de Discord: comandos de barra que actúan sobre el servidor
// Interactions Endpoint URL (Discord Developer Portal): https://TU-PANEL/api/discord/interactions

import { type Env, fail, json, rankIn, rpc } from './lib';

const EPHEMERAL = 64;
const hex = (s: string) => new Uint8Array((s.match(/.{1,2}/g) || []).map((b) => parseInt(b, 16)));

async function verify(req: Request, body: string, publicKey: string) {
  const sig = req.headers.get('x-signature-ed25519');
  const ts = req.headers.get('x-signature-timestamp');
  if (!sig || !ts || !publicKey) return false;
  try {
    const key = await crypto.subtle.importKey('raw', hex(publicKey), { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', key, hex(sig), new TextEncoder().encode(ts + body));
  } catch {
    return false;
  }
}

interface Opt { name: string; value: string | number }
interface Interaction {
  type: number; token: string; application_id: string;
  data?: { name: string; options?: Opt[] };
  member?: { user: { id: string; username: string; global_name?: string | null } };
  user?: { id: string; username: string; global_name?: string | null };
}

const SERVER_OPT = (choices: { name: string; value: string }[]) => ({
  type: 3, name: 'servidor', description: 'Servidor (si tienes más de uno)', required: false, ...(choices.length ? { choices } : {}),
});

/** Registra (o actualiza) los comandos del bot */
export async function registerCommands(env: Env) {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_CLIENT_ID) return fail('Faltan DISCORD_BOT_TOKEN o DISCORD_CLIENT_ID.');
  const servers = (await env.DB.prepare('SELECT id, name FROM servers ORDER BY created LIMIT 25').all<{ id: string; name: string }>()).results;
  const choices = servers.map((s) => ({ name: s.name.slice(0, 100), value: s.id }));
  const srv = SERVER_OPT(choices);
  const id = { type: 4, name: 'id', description: 'ID del jugador en el servidor', required: true, min_value: 1 };
  const reason = { type: 3, name: 'motivo', description: 'Motivo', required: true, min_length: 3, max_length: 200 };
  const commands = [
    { name: 'estado', description: 'Estado del servidor: jugadores, staff, reportes y recursos', options: [srv] },
    { name: 'jugadores', description: 'Lista de jugadores conectados', options: [srv] },
    { name: 'kick', description: 'Expulsar a un jugador', options: [id, reason, srv] },
    { name: 'ban', description: 'Banear a un jugador', options: [id, { type: 4, name: 'horas', description: 'Horas (0 = permanente)', required: true, min_value: 0, max_value: 87600 }, reason, srv] },
    { name: 'revivir', description: 'Revivir a un jugador', options: [id, srv] },
    { name: 'anuncio', description: 'Mandar un anuncio a todo el servidor', options: [{ type: 3, name: 'texto', description: 'Texto del anuncio', required: true, max_length: 200 }, srv] },
  ];
  const base = `https://discord.com/api/v10/applications/${env.DISCORD_CLIENT_ID}`;
  const url = env.DISCORD_GUILD_ID ? `${base}/guilds/${env.DISCORD_GUILD_ID}/commands` : `${base}/commands`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) return fail(`Discord respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return json({ ok: true, count: commands.length, scope: env.DISCORD_GUILD_ID ? 'servidor de Discord' : 'global' });
}

const opt = (i: Interaction, name: string) => i.data?.options?.find((o) => o.name === name)?.value;

async function edit(i: Interaction, content: string, embeds?: unknown[]) {
  await fetch(`https://discord.com/api/v10/webhooks/${i.application_id}/${i.token}/messages/@original`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content, embeds, allowed_mentions: { parse: [] } }),
  }).catch(() => null);
}

const fmtUptime = (s: number) => {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min`;
};

async function run(i: Interaction, env: Env) {
  const u = i.member?.user || i.user!;
  const name = (u.global_name || u.username).slice(0, 40);

  // servidor: el que diga el comando o, si solo tiene uno, ese
  let sid = String(opt(i, 'servidor') || '');
  if (!sid) {
    const own = (env.OWNER_IDS || '').split(',').map((x) => x.trim()).includes(u.id);
    const rows = own
      ? (await env.DB.prepare('SELECT id FROM servers ORDER BY created LIMIT 2').all<{ id: string }>()).results
      : (await env.DB.prepare('SELECT server_id AS id FROM server_staff WHERE user_id = ? LIMIT 2').bind(u.id).all<{ id: string }>()).results;
    if (rows.length !== 1) return edit(i, rows.length ? 'Tienes varios servidores: elige uno en la opción **servidor**.' : 'No tienes acceso a ningún servidor del panel.');
    sid = rows[0].id;
  }
  const rank = await rankIn(env, sid, u.id);
  if (!rank) return edit(i, 'No tienes acceso a ese servidor en el panel.');
  const by = { id: u.id, name, rank, via: 'discord' };

  const cmd = i.data?.name;
  if (cmd === 'estado') {
    const r = await rpc(env, sid, { kind: 'get', name: 'summary', by });
    if (!r.ok) return edit(i, `⚠️ ${r.msg || 'No se pudo leer el estado.'}`);
    const d = r.data;
    return edit(i, '', [{
      color: 0xffffff, title: d.server,
      fields: [
        { name: 'Jugadores', value: `${d.players}/${d.max}`, inline: true },
        { name: 'Staff conectado', value: String(d.staff), inline: true },
        { name: 'Reportes abiertos', value: String(d.reports), inline: true },
        { name: 'Recursos', value: `${d.resources}/${d.resourcesTotal}`, inline: true },
        { name: 'Encendido', value: fmtUptime(d.uptime), inline: true },
        { name: 'Baneos activos', value: String(d.bans), inline: true },
      ],
    }]);
  }
  if (cmd === 'jugadores') {
    const r = await rpc(env, sid, { kind: 'get', name: 'players', by });
    if (!r.ok) return edit(i, `⚠️ ${r.msg || 'No se pudo leer la lista.'}`);
    const list = (r.data || []) as { id: number; name: string; char?: string; job?: string; ping: number }[];
    if (!list.length) return edit(i, 'No hay nadie conectado.');
    const lines = list.slice(0, 40).map((p) => `\`${String(p.id).padStart(3)}\` ${p.name.replace(/[*_`~|]/g, '')}${p.char ? ` · ${p.char}` : ''}${p.job ? ` · ${p.job}` : ''} · ${p.ping} ms`);
    return edit(i, '', [{ color: 0xffffff, title: `Jugadores (${list.length})`, description: lines.join('\n') + (list.length > 40 ? `\n… y ${list.length - 40} más` : '') }]);
  }
  const target = Number(opt(i, 'id'));
  const actions: Record<string, () => Promise<{ ok: boolean; msg?: string }>> = {
    kick: () => rpc(env, sid, { kind: 'act', name: 'players.kick', data: { target, reason: opt(i, 'motivo') }, by }),
    ban: () => rpc(env, sid, { kind: 'act', name: 'players.ban', data: { target, hours: Number(opt(i, 'horas')), reason: opt(i, 'motivo') }, by }),
    revivir: () => rpc(env, sid, { kind: 'act', name: 'players.revive', data: { target }, by }),
    anuncio: () => rpc(env, sid, { kind: 'act', name: 'server.announce', data: { text: opt(i, 'texto') }, by }),
  };
  const fn = cmd && actions[cmd];
  if (!fn) return edit(i, 'Comando desconocido.');
  const r = await fn();
  return edit(i, r.ok ? `✅ ${r.msg || 'Hecho.'}` : `⚠️ ${r.msg || 'No se pudo.'}`);
}

export async function discordInteractions(req: Request, env: Env, ctx: ExecutionContext) {
  const body = await req.text();
  if (!(await verify(req, body, (env.DISCORD_PUBLIC_KEY || '').trim()))) return new Response('firma no válida', { status: 401 });
  const i = JSON.parse(body) as Interaction;
  if (i.type === 1) return json({ type: 1 });
  if (i.type !== 2) return json({ type: 4, data: { content: 'No soportado.', flags: EPHEMERAL } });
  // se contesta enseguida («pensando…») y el resultado llega cuando responde el servidor
  ctx.waitUntil(run(i, env).catch(() => edit(i, '⚠️ Algo falló en el panel.')));
  return json({ type: 5, data: { flags: EPHEMERAL } });
}
