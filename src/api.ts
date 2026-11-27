// Panel web · llamadas a la API y conexión en tiempo real con el hub de cada servidor

export interface Me {
  ok: boolean; owner: boolean; brand: string; bot: boolean;
  user: { id: string; name: string; avatar: string | null };
  servers: ServerRow[];
}
export interface ServerRow { id: string; name: string; rank: string; online: boolean; lastSeen: number | null; gameName: string | null; logChannel?: string | null }
export interface Rank { name: string; label: string; level: number; perms: string[] }
export interface Info {
  name?: string; framework?: string; max?: number; version?: string; ranks?: Rank[];
  catalog?: { group: string; items: { key: string; label: string }[] }[];
  map?: { originX: number; originY: number; tileUnits: number };
  reasons?: string[]; durations?: { label: string; hours: number }[];
  screen?: boolean;
  punish?: { models: { model: string; label: string }[]; jailMax: number; modelMax: number; sweepMax: number };
}
export interface Res<T = any> { ok: boolean; msg?: string; data?: T }

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T & { ok: boolean; msg?: string }> {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: opts.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  let data: any;
  try { data = await res.json(); } catch { data = { ok: false, msg: `Error ${res.status}` }; }
  if (res.status === 401 && path !== '/api/me') location.reload();
  return data;
}

type Listener = (msg: any) => void;

/** Conexión con el hub de un servidor: reconecta sola y reparte los mensajes */
export class Hub {
  online = false;
  info: Info = {};
  perms = new Set<string>();
  rank = '';
  connected = false;
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private pending = new Map<string, (r: Res) => void>();
  private seq = 0;
  private retry = 0;
  private closed = false;
  private watch = { map: false, console: false };
  private ping: ReturnType<typeof setInterval> | undefined;

  constructor(public serverId: string) { this.open(); }

  private open() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/api/servers/${this.serverId}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.connected = true;
      this.sendRaw({ t: 'watch', ...this.watch });
      clearInterval(this.ping);
      this.ping = setInterval(() => { if (ws.readyState === 1) ws.send('ping'); }, 25000);
      this.emit({ t: 'conn', on: true });
    };
    ws.onmessage = (ev) => {
      if (ev.data === 'pong') return;
      let msg: any;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.t === 'hello' || msg.t === 'info') {
        if (msg.t === 'hello') { this.online = msg.online; this.rank = msg.rank; }
        this.info = msg.info || {};
        this.perms = new Set(msg.perms || []);
      }
      if (msg.t === 'status') this.online = msg.online;
      if (msg.t === 'res') {
        const p = this.pending.get(msg.id);
        if (p) { this.pending.delete(msg.id); p(msg); }
        return;
      }
      this.emit(msg);
    };
    ws.onclose = (ev) => {
      clearInterval(this.ping);
      this.connected = false;
      for (const [, p] of this.pending) p({ ok: false, msg: 'Se perdió la conexión con el panel.' });
      this.pending.clear();
      this.emit({ t: 'conn', on: false });
      if (this.closed) return;
      if (ev.code === 4003) { this.emit({ t: 'kicked' }); return; }
      setTimeout(() => this.open(), Math.min(15000, 1000 * 2 ** this.retry++));
    };
  }

  private sendRaw(msg: unknown) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg)); }
  private emit(msg: any) { for (const l of this.listeners) l(msg); }

  on(l: Listener) { this.listeners.add(l); return () => { this.listeners.delete(l); }; }

  can(perm: string) { return this.perms.has('*') || this.perms.has(perm); }

  setWatch(w: Partial<{ map: boolean; console: boolean }>) {
    this.watch = { ...this.watch, ...w };
    this.sendRaw({ t: 'watch', ...this.watch });
  }

  request<T = any>(kind: 'get' | 'act' | 'console', name: string, data: unknown = {}): Promise<Res<T>> {
    if (!this.ws || this.ws.readyState !== 1) return Promise.resolve({ ok: false, msg: 'Sin conexión con el panel.' });
    const id = String(++this.seq);
    return new Promise((resolve) => {
      const timer = setTimeout(() => { this.pending.delete(id); resolve({ ok: false, msg: 'El servidor no contestó a tiempo.' }); }, 12000);
      this.pending.set(id, (r) => { clearTimeout(timer); resolve(r); });
      this.sendRaw({ t: 'req', id, kind, name, data });
    });
  }
  get<T = any>(name: string, data?: unknown) { return this.request<T>('get', name, data); }
  act<T = any>(name: string, data?: unknown) { return this.request<T>('act', name, data); }

  close() { this.closed = true; clearInterval(this.ping); this.ws?.close(); }
}

export const fmtDate = (t?: number | null) => (t ? new Date(t * 1000).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtAgo = (t?: number | null) => {
  if (!t) return 'nunca';
  const s = Math.max(0, Math.floor(Date.now() / 1000) - t);
  if (s < 60) return 'ahora';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} d`;
};
export const fmtUptime = (s: number) => {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min`;
};
export const fmtHours = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
};
export const money = (n?: number) => (n ?? 0).toLocaleString('es-ES') + ' $';
