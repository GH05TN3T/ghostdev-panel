import { useCallback, useEffect, useRef, useState } from 'react';
import { fmtAgo, fmtDate, type Hub } from '../api';
import { Btn, Card, Empty, useResult, useToast } from '../ui';
import type { TabProps } from './Server';
import { PlayerSheet } from './Players';

interface Report { id: number; name: string; title: string; category: string; status: 'open' | 'claimed' | 'closed'; claimed_by?: string; created: number; updated: number; src?: number }
interface Msg { id: number; author: string; staff: number; msg: string; created: number }
interface Full extends Report { messages: Msg[] }

const STATUS: Record<string, [string, string]> = { open: ['Abierto', 'pill--err'], claimed: ['Atendido', 'pill--info'], closed: ['Cerrado', 'pill--off'] };

function Chat({ hub, id, onChange }: { hub: Hub; id: number; onChange: () => void }) {
  const [r, setR] = useState<Full | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState('');
  const [sheet, setSheet] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const result = useResult();

  const load = useCallback(async () => {
    const res = await hub.get<Full>('report', { id });
    if (res.ok && res.data) setR(res.data);
  }, [hub, id]);
  useEffect(() => { setR(null); load(); }, [load]);
  useEffect(() => hub.on((m) => { if (m.t === 'report' && m.id === id) load(); }), [hub, id, load]);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [r?.messages.length]);

  const act = async (name: string, data: object, key: string) => {
    setBusy(key);
    const res = await hub.act(name, { id, ...data });
    setBusy('');
    if (res.ok) { load(); onChange(); } else result(res);
    return res.ok;
  };

  if (!r) return <Empty><span className="spin" /></Empty>;
  const answer = hub.can('reports.answer');
  return (
    <div className="chat">
      <header className="chat__head">
        <div>
          <b className="t">{r.title}</b>
          <small className="mut">{r.name}{r.src ? ` · ID ${r.src}` : ' · desconectado'} · {r.category} · {fmtDate(r.created)}</small>
        </div>
        <div className="row">
          <span className={`pill ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}{r.claimed_by ? ` · ${r.claimed_by}` : ''}</span>
          {r.src && hub.can('players.view') ? <Btn small onClick={() => setSheet(r.src!)}>Ficha</Btn> : null}
          {answer && r.status === 'open' ? <Btn small busy={busy === 'claim'} onClick={() => act('reports.claim', {}, 'claim')}>Atender</Btn> : null}
          {answer && r.status !== 'closed' ? <Btn small kind="danger" busy={busy === 'close'} onClick={() => act('reports.close', {}, 'close')}>Cerrar</Btn> : null}
        </div>
      </header>
      <div className="chat__msgs" ref={box}>
        {r.messages.map((m) => (
          <div key={m.id} className={`msg ${m.staff ? 'msg--staff' : ''} ${m.author === 'Sistema' ? 'msg--sys' : ''}`}>
            <small><b>{m.author}</b> · {fmtDate(m.created)}</small>
            <p>{m.msg}</p>
          </div>
        ))}
      </div>
      {answer && r.status !== 'closed' ? (
        <form className="chat__in" onSubmit={async (e) => { e.preventDefault(); if (text.trim() && await act('reports.reply', { text }, 'say')) setText(''); }}>
          <input className="input" value={text} maxLength={600} onChange={(e) => setText(e.target.value)} placeholder="Responder al jugador…" />
          <Btn type="submit" kind="solid" busy={busy === 'say'} disabled={!text.trim()}>Enviar</Btn>
        </form>
      ) : null}
      {sheet !== null ? <PlayerSheet hub={hub} id={sheet} onClose={() => setSheet(null)} refresh={() => {}} /> : null}
    </div>
  );
}

export function Reports({ hub }: TabProps) {
  const [list, setList] = useState<Report[] | null>(null);
  const [all, setAll] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    const r = await hub.get<Report[]>('reports', { all });
    if (r.ok) setList(r.data || []);
  }, [hub, all]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => hub.on((m) => {
    if (m.t !== 'report') return;
    if (m.new) toast(true, `Reporte nuevo de ${m.name}: ${m.title}`);
    load();
  }), [hub, load, toast]);

  return (
    <>
      <div className="page__head">
        <div><span className="lbl">Soporte</span><h1 className="t">Reportes</h1></div>
        <div className="seg">
          <button type="button" className={`g ${!all ? 'is-on' : ''}`} onClick={() => setAll(false)}>Abiertos</button>
          <button type="button" className={`g ${all ? 'is-on' : ''}`} onClick={() => setAll(true)}>Todos</button>
        </div>
      </div>
      <div className="reports">
        <Card title={`Cola (${list?.length ?? 0})`} className="reports__list">
          {!list ? <Empty><span className="spin" /></Empty> : !list.length ? <Empty>No hay reportes {all ? '' : 'abiertos'}.</Empty> : (
            <div className="rlist">
              {list.map((r) => (
                <button key={r.id} type="button" className={`rrow g ${sel === r.id ? 'is-on' : ''}`} onClick={() => setSel(r.id)}>
                  <span className={`dot ${r.status === 'open' ? 'dot--err' : r.status === 'claimed' ? 'dot--on' : 'dot--off'}`} />
                  <div><b>{r.title}</b><small className="mut">{r.name} · {r.category}{r.claimed_by ? ` · ${r.claimed_by}` : ''}</small></div>
                  <small className="mut">{fmtAgo(r.updated)}</small>
                </button>
              ))}
            </div>
          )}
        </Card>
        <Card className="reports__chat">
          {sel !== null ? <Chat key={sel} hub={hub} id={sel} onChange={load} /> : <Empty>Elige un reporte de la cola.</Empty>}
        </Card>
      </div>
    </>
  );
}
