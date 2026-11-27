import { useCallback, useEffect, useState } from 'react';
import { IconSpeakerphone, IconHeartPlus } from '@tabler/icons-react';
import { api, fmtDate, fmtUptime } from '../api';
import { Btn, Card, Empty, Field, useResult } from '../ui';
import type { TabProps } from './Server';
import { LogRow, type LogEntry } from './Logs';

interface Summary { uptime: number; players: number; max: number; resources: number; resourcesTotal: number; staff: number; reports: number; bans: number; server: string }

export function Overview({ hub, serverId }: TabProps) {
  const [s, setS] = useState<Summary | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [feed, setFeed] = useState<{ id: number; text: string; at: number; ok: boolean }[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState('');
  const result = useResult();

  const load = useCallback(async () => {
    const r = await hub.get<Summary>('summary');
    if (r.ok && r.data) setS(r.data);
  }, [hub]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    api<{ logs: LogEntry[] }>(`/api/servers/${serverId}/logs`).then((r) => { if (r.ok) setLogs(r.logs.slice(0, 10)); });
    const off = hub.on((m) => {
      if (m.t === 'player') {
        setS((x) => (x ? { ...x, players: m.count } : x));
        setFeed((f) => [{ id: Date.now() + Math.random(), at: Date.now(), ok: m.op === 'join', text: m.op === 'join' ? `${m.name} entró al servidor` : `${m.name} salió${m.reason ? ` (${m.reason})` : ''}` }, ...f].slice(0, 12));
      }
      if (m.t === 'log') setLogs((l) => [{ ...m.entry, id: Date.now() }, ...l].slice(0, 10));
    });
    return () => { clearInterval(t); off(); };
  }, [hub, load, serverId]);

  const announce = async () => {
    setBusy('ann');
    const r = await hub.act('server.announce', { text, title: 'Anuncio' });
    setBusy('');
    if (result(r, 'Anuncio enviado.')) setText('');
  };

  if (!s) return <Empty><span className="spin" /> Leyendo el servidor…</Empty>;
  const pct = Math.min(100, Math.round((s.players / Math.max(1, s.max)) * 100));

  return (
    <>
      <div className="page__head">
        <div>
          <span className="lbl">Resumen</span>
          <h1 className="t">{s.server}</h1>
        </div>
      </div>

      <div className="grid grid--stats">
        <div className="stat g">
          <span className="lbl">Jugadores</span>
          <b className="t">{s.players}<small>/{s.max}</small></b>
          <div className="bar"><i style={{ width: `${pct}%` }} /></div>
        </div>
        <div className="stat g"><span className="lbl">Staff conectado</span><b className="t">{s.staff}</b></div>
        <div className="stat g"><span className="lbl">Reportes abiertos</span><b className={`t ${s.reports ? 'c-warn' : ''}`}>{s.reports}</b></div>
        <div className="stat g"><span className="lbl">Recursos</span><b className="t">{s.resources}<small>/{s.resourcesTotal}</small></b></div>
        <div className="stat g"><span className="lbl">Encendido</span><b className="t">{fmtUptime(s.uptime)}</b></div>
        <div className="stat g"><span className="lbl">Baneos activos</span><b className="t">{s.bans}</b></div>
      </div>

      <div className="grid grid--2">
        <Card title="Últimas acciones">
          {logs.length ? <div className="logs">{logs.map((l) => <LogRow key={l.id} l={l} />)}</div> : <Empty>Todavía no hay nada.</Empty>}
        </Card>
        <div className="stack">
          {hub.can('server.announce') ? (
            <Card title={<><IconSpeakerphone size={16} /> Anuncio</>}>
              <Field label="Texto" hint="Sale en pantalla a todos los jugadores.">
                <textarea className="input" rows={3} maxLength={200} value={text} onChange={(e) => setText(e.target.value)} />
              </Field>
              <div className="row row--end">
                {hub.can('players.reviveall') ? (
                  <Btn kind="line" busy={busy === 'rev'} onClick={async () => { setBusy('rev'); result(await hub.act('players.reviveall')); setBusy(''); }}>
                    <IconHeartPlus size={16} /> Revivir a todos
                  </Btn>
                ) : null}
                <Btn kind="solid" busy={busy === 'ann'} disabled={text.trim().length < 2} onClick={announce}>Enviar</Btn>
              </div>
            </Card>
          ) : null}
          <Card title="Entradas y salidas">
            {feed.length ? (
              <ul className="feed">
                {feed.map((f) => (
                  <li key={f.id}><i className={`dot ${f.ok ? 'dot--on' : 'dot--err'}`} />{f.text}<small className="mut">{fmtDate(Math.floor(f.at / 1000))}</small></li>
                ))}
              </ul>
            ) : <Empty>Aquí aparece quién entra y sale mientras tienes el panel abierto.</Empty>}
          </Card>
        </div>
      </div>
    </>
  );
}
