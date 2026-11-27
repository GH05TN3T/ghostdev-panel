import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconPlayerPlay, IconPlayerStop, IconRefresh } from '@tabler/icons-react';
import { Btn, Card, Empty, Search, useResult } from '../ui';
import type { TabProps } from './Server';

interface Res { name: string; state: string; version?: string; author?: string; description?: string; path?: string; protected?: boolean }

const STATE: Record<string, [string, string]> = {
  started: ['Arrancado', 'pill--ok'], stopped: ['Parado', 'pill--off'], starting: ['Arrancando', 'pill--info'],
  stopping: ['Parando', 'pill--info'], uninitialized: ['Sin cargar', 'pill--off'], unknown: ['?', 'pill--off'],
};

export function Resources({ hub }: TabProps) {
  const [list, setList] = useState<Res[] | null>(null);
  const [q, setQ] = useState('');
  const [only, setOnly] = useState<'all' | 'started' | 'stopped'>('all');
  const [busy, setBusy] = useState('');
  const result = useResult();

  const load = useCallback(async () => {
    const r = await hub.get<Res[]>('resources');
    if (r.ok) setList(r.data || []);
  }, [hub]);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => (list || []).filter((r) =>
    (only === 'all' || (only === 'started' ? r.state === 'started' : r.state !== 'started')) &&
    (!q || `${r.name} ${r.path || ''} ${r.author || ''}`.toLowerCase().includes(q.toLowerCase()))), [list, q, only]);

  const op = async (r: Res, o: 'start' | 'stop' | 'restart') => {
    setBusy(r.name + o);
    const res = await hub.act('server.resource', { resource: r.name, op: o });
    setBusy('');
    result(res);
    load();
  };
  const canOp = hub.can('server.restart');
  const started = (list || []).filter((r) => r.state === 'started').length;

  return (
    <>
      <div className="page__head">
        <div><span className="lbl">Servidor</span><h1 className="t">Recursos <small className="mut">{started}/{list?.length ?? 0}</small></h1></div>
        <div className="seg">
          {(['all', 'started', 'stopped'] as const).map((k) => (
            <button key={k} type="button" className={`g ${only === k ? 'is-on' : ''}`} onClick={() => setOnly(k)}>{{ all: 'Todos', started: 'Arrancados', stopped: 'Parados' }[k]}</button>
          ))}
        </div>
      </div>
      <Card title="Lista" right={<div className="row"><Search value={q} onChange={setQ} placeholder="Nombre, carpeta o autor…" /><Btn small kind="ghost" onClick={load}>Actualizar</Btn></div>}>
        {!list ? <Empty><span className="spin" /></Empty> : !shown.length ? <Empty>Ninguno coincide.</Empty> : (
          <table className="tbl">
            <thead><tr><th>Recurso</th><th>Estado</th><th>Versión</th><th>Carpeta</th><th /></tr></thead>
            <tbody>
              {shown.map((r) => {
                const [label, cls] = STATE[r.state] || STATE.unknown;
                return (
                  <tr key={r.name}>
                    <td><b>{r.name}</b>{r.description ? <small className="mut block">{r.description.slice(0, 90)}</small> : null}</td>
                    <td><span className={`pill ${cls}`}>{label}</span></td>
                    <td className="mono">{r.version || '—'}</td>
                    <td className="mono mut">{r.path || '—'}</td>
                    <td className="right nowrap">
                      {r.protected ? <span className="pill">Protegido</span> : canOp ? (
                        r.state === 'started' ? (
                          <>
                            <Btn small busy={busy === r.name + 'restart'} onClick={() => op(r, 'restart')} title="Reiniciar"><IconRefresh size={14} /></Btn>
                            <Btn small kind="danger" busy={busy === r.name + 'stop'} onClick={() => op(r, 'stop')} title="Parar"><IconPlayerStop size={14} /></Btn>
                          </>
                        ) : <Btn small kind="ok" busy={busy === r.name + 'start'} onClick={() => op(r, 'start')} title="Arrancar"><IconPlayerPlay size={14} /></Btn>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
