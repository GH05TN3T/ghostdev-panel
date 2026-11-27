import { useCallback, useEffect, useState } from 'react';
import { api, fmtDate } from '../api';
import { Btn, Card, Empty, Search } from '../ui';
import type { TabProps } from './Server';

export interface LogEntry { id: number; staff: string; action: string; target?: string | null; detail?: string | null; via?: string; created: number }

const VIA: Record<string, string> = { juego: 'Juego', web: 'Web', discord: 'Discord' };

export function LogRow({ l }: { l: LogEntry }) {
  return (
    <div className="log">
      <span className={`via via--${l.via || 'juego'}`}>{VIA[l.via || 'juego'] || l.via}</span>
      <div className="log__main">
        <b>{l.staff}</b> <span className="log__act">{l.action}</span>
        {l.target ? <> → <b>{l.target}</b></> : null}
        {l.detail ? <small className="mut"> · {l.detail}</small> : null}
      </div>
      <small className="mut log__time">{fmtDate(l.created)}</small>
    </div>
  );
}

export function Logs({ hub, serverId }: TabProps) {
  const [logs, setLogs] = useState<LogEntry[] | null>(null);
  const [q, setQ] = useState('');
  const [via, setVia] = useState('');
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(true);

  const load = useCallback(async (p = 0) => {
    const r = await api<{ logs: LogEntry[] }>(`/api/servers/${serverId}/logs?page=${p}&q=${encodeURIComponent(q)}&via=${via}`);
    if (!r.ok) return setLogs([]);
    setMore(r.logs.length === 50);
    setLogs((old) => (p === 0 ? r.logs : [...(old || []), ...r.logs]));
    setPage(p);
  }, [serverId, q, via]);

  useEffect(() => {
    const t = setTimeout(() => load(0), 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => hub.on((m) => {
    if (m.t === 'log' && !q && (!via || m.entry.via === via)) setLogs((l) => [{ ...m.entry, id: Date.now() }, ...(l || [])]);
  }), [hub, q, via]);

  return (
    <>
      <div className="page__head">
        <div><span className="lbl">Auditoría</span><h1 className="t">Logs</h1></div>
        <div className="seg">
          {['', 'juego', 'web', 'discord'].map((v) => (
            <button key={v} type="button" className={`g ${via === v ? 'is-on' : ''}`} onClick={() => setVia(v)}>{v ? VIA[v] : 'Todo'}</button>
          ))}
        </div>
      </div>
      <Card title="Lo que hace el staff" right={<Search value={q} onChange={setQ} placeholder="Staff, acción, jugador…" />}>
        {!logs ? <Empty><span className="spin" /></Empty> : !logs.length ? <Empty>No hay nada con ese filtro.</Empty> : (
          <>
            <div className="logs">{logs.map((l) => <LogRow key={l.id} l={l} />)}</div>
            {more ? <div className="row row--center"><Btn small onClick={() => load(page + 1)}>Cargar más</Btn></div> : null}
          </>
        )}
      </Card>
    </>
  );
}
