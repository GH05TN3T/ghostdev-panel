// Panel web · hub en tiempo real (un Durable Object por servidor de FiveM)
// Une la conexión del servidor (ghostdev_admin) con las pestañas abiertas del panel.
// Usa la hibernación de WebSockets: sin actividad no consume nada.

import { DurableObject } from 'cloudflare:workers';
import { addLog, type Env, now } from './lib';

interface ClientInfo { tag: string; user: { id: string; name: string; rank: string }; watch: { map: boolean; console: boolean } }
interface Info { name?: string; framework?: string; max?: number; version?: string; ranks?: { name: string; label: string; level: number; perms: string[] }[]; catalog?: unknown; map?: unknown; reasons?: string[]; durations?: unknown }
type Pending = { resolve: (v: any) => void; timer: ReturnType<typeof setTimeout> };

const RPC_TIMEOUT = 10000;

export class ServerHub extends DurableObject<Env> {
  private pending = new Map<string, Pending>();
  private lastWatch = '';
  private serverId = '';

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // las pestañas mandan «ping» para no cerrarse: se contesta sin despertar al objeto
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  private agent() { return this.ctx.getWebSockets('agent')[0] as WebSocket | undefined; }
  private clients() { return this.ctx.getWebSockets('client'); }
  private info(): Promise<Info> { return this.ctx.storage.get<Info>('info').then((i) => i || {}); }

  private perms(info: Info, rank: string) {
    if (rank === 'owner') return new Set(['*']);
    const r = info.ranks?.find((x) => x.name === rank);
    return new Set(r?.perms || []);
  }
  private allowed(info: Info, rank: string, perm: string) {
    const p = this.perms(info, rank);
    return p.has('*') || p.has(perm);
  }

  private send(ws: WebSocket | undefined, msg: unknown) {
    if (!ws) return;
    try { ws.send(JSON.stringify(msg)); } catch { /* pestaña cerrada */ }
  }

  private broadcast(msg: unknown, filter?: (c: ClientInfo) => boolean) {
    const text = JSON.stringify(msg);
    for (const ws of this.clients()) {
      const c = ws.deserializeAttachment() as ClientInfo | null;
      if (!c || (filter && !filter(c))) continue;
      try { ws.send(text); } catch { /* nada */ }
    }
  }

  /** El servidor solo manda el mapa o la consola mientras alguien los está mirando */
  private async syncWatch(force = false) {
    const info = await this.info();
    let map = false, consoleOn = false;
    for (const ws of this.clients()) {
      const c = ws.deserializeAttachment() as ClientInfo | null;
      if (!c) continue;
      if (c.watch.map && this.allowed(info, c.user.rank, 'players.map')) map = true;
      if (c.watch.console && this.allowed(info, c.user.rank, 'server.console')) consoleOn = true;
    }
    const key = `${map}|${consoleOn}`;
    if (!force && key === this.lastWatch) return;
    this.lastWatch = key;
    this.send(this.agent(), { t: 'watch', map, console: consoleOn });
  }

  private async sid() {
    if (!this.serverId) this.serverId = (await this.ctx.storage.get<string>('sid')) || '';
    return this.serverId;
  }

  // ─────────────────────────────────────────────────────────────── entradas HTTP (solo desde el Worker)

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const sid = req.headers.get('x-gd-server') || '';
    if (sid && sid !== (await this.sid())) { this.serverId = sid; await this.ctx.storage.put('sid', sid); }

    if (url.pathname === '/agent') {
      if (req.headers.get('upgrade') !== 'websocket') return new Response('websocket', { status: 426 });
      for (const old of this.ctx.getWebSockets('agent')) { try { old.close(4000, 'otra conexión'); } catch { /* nada */ } }
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1], ['agent']);
      this.lastWatch = '';
      // lo primero: cómo es el servidor (rangos, permisos, mapa)
      this.send(pair[1], { t: 'req', id: 'sys|info', kind: 'info' });
      await this.syncWatch(true);
      this.broadcast({ t: 'status', online: true });
      await this.env.DB.prepare('UPDATE servers SET last_seen = ? WHERE id = ?').bind(now(), await this.sid()).run();
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    if (url.pathname === '/client') {
      if (req.headers.get('upgrade') !== 'websocket') return new Response('websocket', { status: 426 });
      const user = JSON.parse(req.headers.get('x-gd-user') || 'null');
      if (!user?.id) return new Response('sin usuario', { status: 401 });
      const tag = 'c' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1], ['client', tag, 'u' + user.id]);
      pair[1].serializeAttachment({ tag, user, watch: { map: false, console: false } } satisfies ClientInfo);
      const info = await this.info();
      this.send(pair[1], { t: 'hello', online: !!this.agent(), info, rank: user.rank, perms: [...this.perms(info, user.rank)] });
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    if (url.pathname === '/rpc' && req.method === 'POST') {
      const body = await req.json<{ kind: string; name?: string; data?: unknown; by?: unknown }>();
      return Response.json(await this.request(body));
    }

    if (url.pathname === '/status') {
      return Response.json({ online: !!this.agent(), info: await this.info() });
    }

    if (url.pathname === '/kick-agent' && req.method === 'POST') {
      for (const ws of this.ctx.getWebSockets('agent')) { try { ws.close(4001, 'clave cambiada'); } catch { /* nada */ } }
      return Response.json({ ok: true });
    }

    if (url.pathname === '/kick-user' && req.method === 'POST') {
      // se le quitó el acceso: se cierran sus pestañas abiertas
      const { id } = await req.json<{ id: string }>();
      for (const ws of this.ctx.getWebSockets('u' + id)) { try { ws.close(4003, 'sin acceso'); } catch { /* nada */ } }
      return Response.json({ ok: true });
    }

    return new Response('no', { status: 404 });
  }

  /** Manda una petición al servidor de FiveM y espera la respuesta */
  private request(body: { kind: string; name?: string; data?: unknown; by?: unknown }): Promise<{ ok: boolean; msg?: string; data?: unknown }> {
    const agent = this.agent();
    if (!agent) return Promise.resolve({ ok: false, msg: 'El servidor no está conectado.' });
    const id = 'rpc|' + crypto.randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => { this.pending.delete(id); resolve({ ok: false, msg: 'El servidor no contestó a tiempo.' }); }, RPC_TIMEOUT);
      this.pending.set(id, { resolve, timer });
      this.send(agent, { t: 'req', id, kind: body.kind, name: body.name, data: body.data ?? {}, by: body.by });
    });
  }

  // ─────────────────────────────────────────────────────────────── mensajes

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string' || raw.length > 1_000_000) return;
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return; }
    const tags = this.ctx.getTags(ws);
    if (tags.includes('agent')) return this.fromAgent(msg);
    return this.fromClient(ws, msg);
  }

  private async fromAgent(msg: any) {
    switch (msg.t) {
      case 'res': {
        const id = String(msg.id || '');
        const out = { ok: !!msg.ok, msg: msg.msg, data: msg.data };
        if (id === 'sys|info') {
          if (out.ok && out.data) {
            await this.ctx.storage.put('info', out.data);
            // los permisos de cada pestaña dependen de los rangos del servidor
            for (const c of this.clients()) {
              const ci = c.deserializeAttachment() as ClientInfo | null;
              if (ci) this.send(c, { t: 'info', info: out.data, perms: [...this.perms(out.data, ci.user.rank)] });
            }
            await this.syncWatch(true);
          }
          return;
        }
        if (id.startsWith('rpc|')) {
          const p = this.pending.get(id);
          if (p) { clearTimeout(p.timer); this.pending.delete(id); p.resolve(out); }
          return;
        }
        // respuesta para una pestaña: «etiqueta|id»
        const cut = id.indexOf('|');
        const tag = id.slice(0, cut), cid = id.slice(cut + 1);
        const target = this.ctx.getWebSockets(tag)[0];
        this.send(target, { t: 'res', id: cid, ...out });
        // cambiar rangos en el juego cambia los permisos: se vuelven a pedir
        return;
      }
      case 'map':
        return this.broadcast({ t: 'map', players: msg.players || [] }, (c) => c.watch.map);
      case 'console': {
        const info = await this.info();
        return this.broadcast({ t: 'console', lines: msg.lines || [], full: !!msg.full },
          (c) => c.watch.console && this.allowed(info, c.user.rank, 'server.console'));
      }
      case 'report': {
        const info = await this.info();
        return this.broadcast({ t: 'report', id: msg.id, new: !!msg.new, title: msg.title, name: msg.name },
          (c) => this.allowed(info, c.user.rank, 'reports.view'));
      }
      case 'stat': {
        const t = Math.floor(now() / 300) * 300;
        await this.env.DB.prepare('INSERT OR REPLACE INTO stats (server_id, t, players, staff) VALUES (?, ?, ?, ?)')
          .bind(await this.sid(), t, Math.max(0, Number(msg.players) || 0), Math.max(0, Number(msg.staff) || 0)).run();
        await this.env.DB.prepare('DELETE FROM stats WHERE server_id = ? AND t < ?').bind(await this.sid(), t - 90 * 86400).run();
        return;
      }
      case 'player':
        return this.broadcast({ t: 'player', op: msg.op, id: msg.id, name: msg.name, count: msg.count, reason: msg.reason });
      case 'log': {
        const e = msg.entry || {};
        if (!e.action) return;
        const sid = await this.sid();
        const via = typeof e.staff === 'string' && e.staff.endsWith('(web)') ? 'web' : typeof e.staff === 'string' && e.staff.endsWith('(discord)') ? 'discord' : 'juego';
        await addLog(this.env, sid, String(e.staff || 'Sistema'), String(e.action), e.target ? String(e.target) : null, e.detail ? String(e.detail) : null, via);
        this.broadcast({ t: 'log', entry: { ...e, via, created: e.created || now() } });
        // al Discord en grupos (el alarm junta lo que llegue en unos segundos)
        const queue = (await this.ctx.storage.get<string[]>('dq')) || [];
        const who = String(e.staff || 'Sistema');
        queue.push(`**${who.replace(/[*_`~|]/g, '')}** · ${e.action}${e.target ? ` → ${e.target}` : ''}${e.detail ? ` · ${e.detail}` : ''}`.slice(0, 380));
        await this.ctx.storage.put('dq', queue.slice(-60));
        if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + 4000);
        if (/rango/i.test(String(e.action))) this.send(this.agent(), { t: 'req', id: 'sys|info', kind: 'info' });
        return;
      }
    }
  }

  private async fromClient(ws: WebSocket, msg: any) {
    const c = ws.deserializeAttachment() as ClientInfo | null;
    if (!c) return;
    if (msg.t === 'watch') {
      c.watch = { map: msg.map === true, console: msg.console === true };
      ws.serializeAttachment(c);
      return this.syncWatch();
    }
    if (msg.t === 'req') {
      const kind = String(msg.kind || '');
      if (!['get', 'act', 'console'].includes(kind)) return;
      const agent = this.agent();
      const cid = String(msg.id || '').slice(0, 40);
      if (!agent) return this.send(ws, { t: 'res', id: cid, ok: false, msg: 'El servidor no está conectado.' });
      // el rango lo pone el hub (viene de la sesión), nunca la pestaña
      this.send(agent, { t: 'req', id: `${c.tag}|${cid}`, kind, name: String(msg.name || ''), data: msg.data ?? {}, by: c.user });
    }
  }

  async webSocketClose(ws: WebSocket) {
    const tags = this.ctx.getTags(ws);
    if (tags.includes('agent')) {
      if (this.ctx.getWebSockets('agent').filter((x) => x !== ws).length === 0) {
        this.broadcast({ t: 'status', online: false });
        for (const [id, p] of this.pending) { clearTimeout(p.timer); p.resolve({ ok: false, msg: 'El servidor se desconectó.' }); this.pending.delete(id); }
      }
      return;
    }
    await this.syncWatch();
  }

  async webSocketError(ws: WebSocket) { await this.webSocketClose(ws); }

  // ─────────────────────────────────────────────────────────────── logs al Discord

  async alarm() {
    const queue = (await this.ctx.storage.get<string[]>('dq')) || [];
    await this.ctx.storage.delete('dq');
    if (!queue.length || !this.env.DISCORD_BOT_TOKEN) return;
    const row = await this.env.DB.prepare('SELECT name, log_channel FROM servers WHERE id = ?').bind(await this.sid()).first<{ name: string; log_channel: string | null }>();
    if (!row?.log_channel) return;
    for (let i = 0; i < queue.length; i += 15) {
      await fetch(`https://discord.com/api/v10/channels/${row.log_channel}/messages`, {
        method: 'POST',
        headers: { authorization: `Bot ${this.env.DISCORD_BOT_TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          embeds: [{ color: 0xffffff, author: { name: row.name }, description: queue.slice(i, i + 15).join('\n'), timestamp: new Date().toISOString() }],
          allowed_mentions: { parse: [] },
        }),
      }).catch(() => null);
    }
  }
}
