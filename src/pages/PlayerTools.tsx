// Panel web · herramientas de la ficha de un jugador: pantalla, castigos, troll, dinero, trabajo, inventario y vehículos

import { useCallback, useEffect, useRef, useState } from 'react';
import { IconRefresh, IconTrash, IconHome, IconTool } from '@tabler/icons-react';
import type { Hub } from '../api';
import { Btn, Dialog, Empty, Field, useResult } from '../ui';

type Target = { id: number; name: string };

// ─────────────────────────────────────────────────────────────── pantalla

export function ScreenDialog({ hub, p, onClose }: { hub: Hub; p: Target; onClose: () => void }) {
  const [img, setImg] = useState<string | null>(null);
  const [at, setAt] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const liveRef = useRef(false);
  liveRef.current = live;

  const grab = useCallback(async () => {
    setBusy(true);
    const r = await hub.act<{ image: string; at: number }>('players.screen', { target: p.id });
    setBusy(false);
    if (!alive.current) return;
    if (r.ok && r.data) { setImg(r.data.image); setAt(Date.now()); setErr(''); }
    else { setErr(r.msg || 'No llegó la imagen.'); setLive(false); }
    // en vivo: la siguiente se pide cuando llega la anterior
    if (liveRef.current && r.ok) setTimeout(() => { if (alive.current && liveRef.current) grab(); }, 600);
  }, [hub, p.id]);

  useEffect(() => { alive.current = true; grab(); return () => { alive.current = false; }; }, [grab]);
  useEffect(() => { if (live && !busy) grab(); }, [live]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog wide title={`Pantalla · ${p.name}`} onClose={onClose}
      footer={<>
        <Btn kind={live ? 'ok' : 'line'} onClick={() => setLive(!live)}>{live ? 'En vivo: activado' : 'En vivo'}</Btn>
        <Btn kind="solid" busy={busy && !live} onClick={grab}><IconRefresh size={16} /> Otra captura</Btn>
      </>}>
      <div className="screen">
        {img ? <img src={img} alt="Pantalla del jugador" /> : err ? <Empty>{err}</Empty> : <Empty><span className="spin" /> Pidiendo la pantalla…</Empty>}
        {img ? <span className="screen__tag">{live ? <><i className="dot dot--err" /> EN VIVO</> : at ? new Date(at).toLocaleTimeString('es-ES') : ''}</span> : null}
      </div>
      {img && err ? <p className="c-err small">{err}</p> : null}
      <p className="mut small">El jugador no ve ningún aviso. Cada vez que se mira la pantalla queda en los logs (una vez por minuto).</p>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────── castigos sin ban

export function PunishDialog({ hub, p, onClose, onDone }: { hub: Hub; p: Target; onClose: () => void; onDone: () => void }) {
  const cfg = hub.info.punish || { models: [{ model: 'a_c_chimp', label: 'Mono' }], jailMax: 240, modelMax: 120, sweepMax: 100 };
  const [kind, setKind] = useState<'jail' | 'model' | 'sweep'>('jail');
  const [minutes, setMinutes] = useState(15);
  const [spots, setSpots] = useState(20);
  const [model, setModel] = useState(cfg.models[0]?.model || '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const result = useResult();
  const max = kind === 'jail' ? cfg.jailMax : cfg.modelMax;

  const send = async () => {
    setBusy(true);
    const r = await hub.act('players.jail', { target: p.id, kind, minutes, spots, model, reason });
    setBusy(false);
    if (result(r)) { onDone(); onClose(); }
  };

  return (
    <Dialog title={`Castigar · ${p.name}`} onClose={onClose}
      footer={<Btn kind="danger" busy={busy} disabled={reason.trim().length < 3} onClick={send}>Castigar</Btn>}>
      <div className="seg seg--full">
        {([['jail', 'Cárcel'], ['model', 'Cambio de modelo'], ['sweep', 'Barrer']] as const).map(([k, l]) => (
          <button key={k} type="button" className={`g ${kind === k ? 'is-on' : ''}`} onClick={() => setKind(k)}>{l}</button>
        ))}
      </div>
      <p className="mut small punish-help">
        {kind === 'jail' && 'Lo lleva a la cárcel y no puede salir del patio hasta que pase el tiempo.'}
        {kind === 'model' && 'Le cambia el personaje y lo encierra en una zona. Al terminar recupera su ropa.'}
        {kind === 'sweep' && 'Lo lleva a Legion Square con una escoba: no sale hasta barrer los sitios que digas.'}
        {' '}Si se desconecta, al volver sigue castigado.
      </p>
      {kind === 'sweep' ? (
        <Field label={`Sitios que tiene que barrer (máx. ${cfg.sweepMax})`}>
          <input className="input" type="number" min={1} max={cfg.sweepMax} value={spots} onChange={(e) => setSpots(Number(e.target.value))} />
        </Field>
      ) : (
        <Field label={`Minutos (máx. ${max})`}>
          <div className="chips">{[5, 15, 30, 60].filter((m) => m <= max).map((m) => <button type="button" key={m} className={`chip g ${minutes === m ? 'is-on' : ''}`} onClick={() => setMinutes(m)}>{m} min</button>)}</div>
          <input className="input" type="number" min={1} max={max} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
        </Field>
      )}
      {kind === 'model' ? (
        <Field label="Modelo">
          <div className="chips">{cfg.models.map((m) => <button type="button" key={m.model} className={`chip g ${model === m.model ? 'is-on' : ''}`} onClick={() => setModel(m.model)}>{m.label}</button>)}</div>
        </Field>
      ) : null}
      <Field label="Motivo"><input className="input" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} /></Field>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────── troll

const TROLLS: [string, string, string][] = [
  ['fire', 'Prender fuego', '6 segundos ardiendo'],
  ['drunk', 'Borracho', 'Camina y ve como un borracho 30 s'],
  ['ragdoll', 'Ragdoll', 'Se cae al suelo'],
  ['lowgrav', 'Gravedad baja', '30 s flotando'],
  ['invert', 'Cámara invertida', 'Lo ve todo al revés 30 s'],
  ['launch', 'Lanzar', 'Sale volando hacia arriba'],
];

export function TrollDialog({ hub, p, onClose }: { hub: Hub; p: Target; onClose: () => void }) {
  const [busy, setBusy] = useState('');
  const result = useResult();
  return (
    <Dialog title={`Troll · ${p.name}`} onClose={onClose}>
      <div className="tiles">
        {TROLLS.map(([k, label, desc]) => (
          <button key={k} type="button" className="tile g" disabled={busy === k}
            onClick={async () => { setBusy(k); result(await hub.act('players.troll', { target: p.id, kind: k })); setBusy(''); }}>
            <b className="t">{label}</b><small className="mut">{desc}</small>
          </button>
        ))}
      </div>
      <p className="mut small">Cada uso queda en los logs.</p>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────── dinero

export function MoneyDialog({ hub, p, onClose, onDone }: { hub: Hub; p: Target; onClose: () => void; onDone: () => void }) {
  const [account, setAccount] = useState<'cash' | 'bank'>('cash');
  const [mode, setMode] = useState<'add' | 'remove'>('add');
  const [amount, setAmount] = useState(1000);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const result = useResult();
  const send = async () => {
    setBusy(true);
    const r = await hub.act('players.money', { target: p.id, account, amount: mode === 'add' ? amount : -amount, reason });
    setBusy(false);
    if (result(r)) { onDone(); onClose(); }
  };
  return (
    <Dialog title={`Dinero · ${p.name}`} onClose={onClose}
      footer={<Btn kind={mode === 'add' ? 'solid' : 'danger'} busy={busy} disabled={amount <= 0 || reason.trim().length < 3} onClick={send}>{mode === 'add' ? 'Dar' : 'Quitar'}</Btn>}>
      <div className="row">
        <div className="seg">
          <button type="button" className={`g ${mode === 'add' ? 'is-on' : ''}`} onClick={() => setMode('add')}>Dar</button>
          <button type="button" className={`g ${mode === 'remove' ? 'is-on' : ''}`} onClick={() => setMode('remove')}>Quitar</button>
        </div>
        <div className="seg">
          <button type="button" className={`g ${account === 'cash' ? 'is-on' : ''}`} onClick={() => setAccount('cash')}>Efectivo</button>
          <button type="button" className={`g ${account === 'bank' ? 'is-on' : ''}`} onClick={() => setAccount('bank')}>Banco</button>
        </div>
      </div>
      <Field label="Cantidad"><input className="input" type="number" min={1} value={amount} onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))} /></Field>
      <Field label="Motivo"><input className="input" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} /></Field>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────── trabajo y banda

interface Job { name: string; label: string; grades: { grade: number; label: string }[] }

export function JobDialog({ hub, p, onClose, onDone }: { hub: Hub; p: Target; onClose: () => void; onDone: () => void }) {
  const [data, setData] = useState<{ jobs: Job[]; gangs: Job[] } | null>(null);
  const [gang, setGang] = useState(false);
  const [job, setJob] = useState('');
  const [grade, setGrade] = useState(0);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const result = useResult();
  useEffect(() => { hub.get<{ jobs: Job[]; gangs: Job[] }>('jobs').then((r) => setData(r.ok && r.data ? r.data : { jobs: [], gangs: [] })); }, [hub]);
  const list = (gang ? data?.gangs : data?.jobs) || [];
  const shown = list.filter((j) => !q || `${j.name} ${j.label}`.toLowerCase().includes(q.toLowerCase()));
  const sel = list.find((j) => j.name === job);
  const send = async () => {
    setBusy(true);
    const r = await hub.act('players.setjob', { target: p.id, job, grade, gang });
    setBusy(false);
    if (result(r)) { onDone(); onClose(); }
  };
  return (
    <Dialog title={`Trabajo · ${p.name}`} onClose={onClose}
      footer={<Btn kind="solid" busy={busy} disabled={!job} onClick={send}>Guardar</Btn>}>
      {data?.gangs.length ? (
        <div className="seg seg--full">
          <button type="button" className={`g ${!gang ? 'is-on' : ''}`} onClick={() => { setGang(false); setJob(''); }}>Trabajo</button>
          <button type="button" className={`g ${gang ? 'is-on' : ''}`} onClick={() => { setGang(true); setJob(''); }}>Banda</button>
        </div>
      ) : null}
      {!data ? <Empty><span className="spin" /></Empty> : (
        <>
          <input className="input search search--full" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" />
          <div className="picklist">
            {shown.map((j) => (
              <button type="button" key={j.name} className={`g ${job === j.name ? 'is-on' : ''}`} onClick={() => { setJob(j.name); setGrade(j.grades[0]?.grade ?? 0); }}>
                <b>{j.label}</b><small>{j.name}</small>
              </button>
            ))}
            {!shown.length ? <p className="mut small">Nada coincide.</p> : null}
          </div>
          {sel ? (
            <Field label="Grado">
              <div className="chips">{sel.grades.map((g) => <button type="button" key={g.grade} className={`chip g ${grade === g.grade ? 'is-on' : ''}`} onClick={() => setGrade(g.grade)}>{g.label} <small>{g.grade}</small></button>)}</div>
            </Field>
          ) : null}
        </>
      )}
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────── inventario

interface Item { slot?: number; name: string; label: string; count: number; weapon?: boolean }

export function InventoryTab({ hub, p }: { hub: Hub; p: Target }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState('');
  const result = useResult();
  const load = useCallback(async () => {
    const r = await hub.get<Item[]>('inventory', { id: p.id });
    setItems(r.ok ? r.data || [] : []);
  }, [hub, p.id]);
  useEffect(() => { load(); }, [load]);
  const remove = async (it: Item) => {
    const raw = it.count > 1 ? prompt(`¿Cuántos ${it.label} le quitas? (tiene ${it.count})`, String(it.count)) : '1';
    const n = Math.floor(Number(raw));
    if (!raw || !n || n < 1) return;
    setBusy(it.name + it.slot);
    const r = await hub.act('players.removeitem', { target: p.id, item: it.name, count: Math.min(n, it.count), slot: it.slot });
    setBusy('');
    if (result(r)) load();
  };
  if (!items) return <Empty><span className="spin" /></Empty>;
  if (!items.length) return <Empty>No lleva nada.</Empty>;
  return (
    <div className="inv">
      {items.map((it) => (
        <div key={`${it.name}-${it.slot}`} className="inv__item g">
          {it.slot ? <span className="inv__slot">{it.slot}</span> : null}
          <b>{it.label}</b>
          <small className="mut mono">{it.name}</small>
          <span className="inv__count">x{it.count}</span>
          {hub.can('players.inventory') ? <Btn small kind="danger" busy={busy === it.name + it.slot} onClick={() => remove(it)} title="Quitar"><IconTrash size={14} /></Btn> : null}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────── vehículos

interface Veh { plate: string; model: string; garage?: string; state: 'garage' | 'out' | 'impound'; spawned?: boolean }
const STATE: Record<string, [string, string]> = { garage: ['En el garaje', 'pill--ok'], out: ['Fuera', 'pill--info'], impound: ['Incautado', 'pill--err'] };

export function VehiclesTab({ hub, query }: { hub: Hub; query: { id?: number; license?: string } }) {
  const [data, setData] = useState<{ list: Veh[]; supported: boolean } | null>(null);
  const [busy, setBusy] = useState('');
  const result = useResult();
  const load = useCallback(async () => {
    const r = await hub.get<{ list: Veh[]; supported: boolean }>('vehicles', query);
    setData(r.ok && r.data ? r.data : { list: [], supported: true });
  }, [hub, query.id, query.license]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  const op = async (v: Veh, o: 'repair' | 'delete' | 'store') => {
    setBusy(v.plate + o);
    const r = await hub.act('veh.manage', { plate: v.plate, op: o });
    setBusy('');
    if (result(r)) load();
  };
  if (!data) return <Empty><span className="spin" /></Empty>;
  if (!data.supported) return <Empty>No encuentro la tabla de vehículos (player_vehicles u owned_vehicles).</Empty>;
  if (!data.list.length) return <Empty>No tiene vehículos.</Empty>;
  return (
    <table className="tbl">
      <thead><tr><th>Matrícula</th><th>Modelo</th><th>Garaje</th><th>Estado</th><th /></tr></thead>
      <tbody>
        {data.list.map((v) => {
          const [label, cls] = STATE[v.state] || STATE.out;
          return (
            <tr key={v.plate}>
              <td className="mono"><b>{v.plate}</b></td>
              <td>{v.model}</td>
              <td>{v.garage || '—'}</td>
              <td><span className={`pill ${cls}`}>{label}</span>{v.spawned ? <span className="pill">En la calle</span> : null}</td>
              <td className="right nowrap">
                {hub.can('players.vehicles') ? (
                  <>
                    {v.spawned ? <Btn small busy={busy === v.plate + 'repair'} onClick={() => op(v, 'repair')} title="Reparar"><IconTool size={14} /></Btn> : null}
                    {v.spawned ? <Btn small kind="danger" busy={busy === v.plate + 'delete'} onClick={() => op(v, 'delete')} title="Borrar de la calle"><IconTrash size={14} /></Btn> : null}
                    {v.state !== 'garage' ? <Btn small kind="ok" busy={busy === v.plate + 'store'} onClick={() => op(v, 'store')} title="Guardar en el garaje"><IconHome size={14} /></Btn> : null}
                  </>
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
