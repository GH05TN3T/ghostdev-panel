import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconHeartPlus, IconFirstAidKit, IconSnowflake, IconAlertTriangle, IconDoorExit, IconBan, IconGift, IconScreenShare, IconLock, IconMoodTongueWink, IconCash, IconBriefcase } from '@tabler/icons-react';
import { fmtAgo, fmtDate, fmtHours, money, type Hub } from '../api';
import { InventoryTab, JobDialog, MoneyDialog, PunishDialog, ScreenDialog, TrollDialog, VehiclesTab } from './PlayerTools';
import { Btn, Card, Dialog, Empty, Field, Search, useResult } from '../ui';
import type { TabProps } from './Server';

interface Row { id: number; name: string; char?: string; job?: string; grade?: string; ping: number; staff?: string; frozen?: boolean }
interface Detail extends Row {
  money?: { cash: number; bank: number }; gang?: string; license?: string; discord?: string; bucket?: number;
  health?: number; armour?: number; warns: { id: number; reason: string; by_name: string; created: number }[];
}
interface Ban { id: number; name: string; reason: string; by_name: string; created: number; expires: number; on: boolean }

type Sanction = 'warn' | 'kick' | 'ban' | 'give';

function SanctionDialog({ hub, p, kind, onClose, onDone }: { hub: Hub; p: Row; kind: Sanction; onClose: () => void; onDone: () => void }) {
  const reasons = hub.info.reasons || [];
  const durations = hub.info.durations || [{ label: '1 día', hours: 24 }, { label: 'Permanente', hours: 0 }];
  const [reason, setReason] = useState('');
  const [hours, setHours] = useState(durations[0]?.hours ?? 24);
  const [item, setItem] = useState('');
  const [count, setCount] = useState(1);
  const [items, setItems] = useState<{ name: string; label: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const result = useResult();

  useEffect(() => {
    if (kind === 'give') hub.get<{ name: string; label: string }[]>('items').then((r) => { if (r.ok) setItems(r.data || []); });
  }, [hub, kind]);

  const title = { warn: 'Advertir', kick: 'Expulsar', ban: 'Banear', give: 'Dar objeto' }[kind];
  const send = async () => {
    setBusy(true);
    const name = { warn: 'players.warn', kick: 'players.kick', ban: 'players.ban', give: 'players.give' }[kind];
    const r = await hub.act(name, { target: p.id, reason, hours, item, count });
    setBusy(false);
    if (result(r)) { onDone(); onClose(); }
  };
  const match = item.length > 1 ? items.filter((i) => i.name.includes(item.toLowerCase()) || i.label.toLowerCase().includes(item.toLowerCase())).slice(0, 8) : [];

  return (
    <Dialog title={`${title} · ${p.name}`} onClose={onClose}
      footer={<Btn kind={kind === 'give' ? 'solid' : 'danger'} busy={busy} disabled={kind === 'give' ? !item : reason.trim().length < 3} onClick={send}>{title}</Btn>}>
      {kind === 'give' ? (
        <>
          <Field label="Objeto">
            <input className="input" value={item} onChange={(e) => setItem(e.target.value)} placeholder="Nombre del objeto (bread, weapon_pistol…)" />
          </Field>
          {match.length ? <div className="chips">{match.map((m) => <button type="button" key={m.name} className="chip g" onClick={() => setItem(m.name)}>{m.label} <small>{m.name}</small></button>)}</div> : null}
          <Field label="Cantidad"><input className="input" type="number" min={1} max={1000} value={count} onChange={(e) => setCount(Number(e.target.value))} /></Field>
          <Field label="Motivo (opcional)"><input className="input" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} /></Field>
        </>
      ) : (
        <>
          <Field label="Motivo"><input className="input" autoFocus value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} /></Field>
          {reasons.length ? <div className="chips">{reasons.map((r) => <button type="button" key={r} className={`chip g ${reason === r ? 'is-on' : ''}`} onClick={() => setReason(r)}>{r}</button>)}</div> : null}
          {kind === 'ban' ? (
            <Field label="Duración">
              <div className="chips">{durations.map((d) => <button type="button" key={d.label} className={`chip g ${hours === d.hours ? 'is-on' : ''}`} onClick={() => setHours(d.hours)}>{d.label}</button>)}</div>
            </Field>
          ) : null}
        </>
      )}
    </Dialog>
  );
}

export function PlayerSheet({ hub, id, onClose, refresh }: { hub: Hub; id: number; onClose: () => void; refresh: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [gone, setGone] = useState(false);
  const [sanction, setSanction] = useState<Sanction | null>(null);
  const [tool, setTool] = useState<'' | 'screen' | 'punish' | 'troll' | 'money' | 'job'>('');
  const [tab, setTab] = useState<'ficha' | 'inv' | 'veh'>('ficha');
  const [busy, setBusy] = useState('');
  const result = useResult();

  const load = useCallback(async () => {
    const r = await hub.get<Detail>('player', { id });
    if (r.ok && r.data) setD(r.data); else setGone(true);
  }, [hub, id]);
  useEffect(() => { load(); }, [load]);

  const quick = async (name: string, key: string) => {
    setBusy(key);
    const r = await hub.act(name, { target: id });
    setBusy('');
    if (result(r)) { load(); refresh(); }
  };

  return (
    <Dialog wide title={d ? `${d.id} · ${d.name}` : `Jugador ${id}`} onClose={onClose}>
      {gone ? <Empty>Ya no está conectado.</Empty> : !d ? <Empty><span className="spin" /></Empty> : (
        <div className="sheet">
          <div className="seg">
            <button type="button" className={`g ${tab === 'ficha' ? 'is-on' : ''}`} onClick={() => setTab('ficha')}>Ficha</button>
            {hub.can('players.inventory') ? <button type="button" className={`g ${tab === 'inv' ? 'is-on' : ''}`} onClick={() => setTab('inv')}>Inventario</button> : null}
            {hub.can('players.vehicles') ? <button type="button" className={`g ${tab === 'veh' ? 'is-on' : ''}`} onClick={() => setTab('veh')}>Vehículos</button> : null}
          </div>
          {tab === 'inv' ? <InventoryTab hub={hub} p={d} /> : tab === 'veh' ? <VehiclesTab hub={hub} query={{ id: d.id }} /> : <>
          <div className="sheet__grid">
            <div className="kv"><span className="lbl">Personaje</span><b>{d.char || '—'}</b></div>
            <div className="kv"><span className="lbl">Trabajo</span><b>{d.job || '—'}{d.grade ? ` · ${d.grade}` : ''}</b></div>
            <div className="kv"><span className="lbl">Banda</span><b>{d.gang || '—'}</b></div>
            <div className="kv"><span className="lbl">Efectivo</span><b>{d.money ? money(d.money.cash) : '—'}</b></div>
            <div className="kv"><span className="lbl">Banco</span><b>{d.money ? money(d.money.bank) : '—'}</b></div>
            <div className="kv"><span className="lbl">Vida / chaleco</span><b>{d.health ?? '—'} / {d.armour ?? '—'}</b></div>
            <div className="kv"><span className="lbl">Ping</span><b>{d.ping} ms</b></div>
            <div className="kv"><span className="lbl">Dimensión</span><b>{d.bucket ?? 0}</b></div>
            <div className="kv"><span className="lbl">Staff</span><b>{d.staff || 'No'}</b></div>
            <div className="kv kv--wide"><span className="lbl">License</span><code>{d.license || '—'}</code></div>
            <div className="kv kv--wide"><span className="lbl">Discord</span><code>{d.discord || '—'}</code></div>
          </div>

          <div className="sheet__actions">
            {hub.can('players.revive') ? <Btn busy={busy === 'rev'} onClick={() => quick('players.revive', 'rev')}><IconHeartPlus size={16} /> Revivir</Btn> : null}
            {hub.can('players.heal') ? <Btn busy={busy === 'heal'} onClick={() => quick('players.heal', 'heal')}><IconFirstAidKit size={16} /> Curar</Btn> : null}
            {hub.can('players.freeze') ? <Btn busy={busy === 'fr'} onClick={() => quick('players.freeze', 'fr')}><IconSnowflake size={16} /> {d.frozen ? 'Descongelar' : 'Congelar'}</Btn> : null}
            {hub.can('players.give') ? <Btn onClick={() => setSanction('give')}><IconGift size={16} /> Dar objeto</Btn> : null}
            {hub.can('players.warn') ? <Btn onClick={() => setSanction('warn')}><IconAlertTriangle size={16} /> Advertir</Btn> : null}
            {hub.can('players.kick') ? <Btn kind="danger" onClick={() => setSanction('kick')}><IconDoorExit size={16} /> Expulsar</Btn> : null}
            {hub.can('players.ban') ? <Btn kind="danger" onClick={() => setSanction('ban')}><IconBan size={16} /> Banear</Btn> : null}
          </div>
          <div className="sheet__actions">
            {hub.can('players.screen') ? <Btn onClick={() => setTool('screen')}><IconScreenShare size={16} /> Ver pantalla</Btn> : null}
            {hub.can('players.money') ? <Btn onClick={() => setTool('money')}><IconCash size={16} /> Dinero</Btn> : null}
            {hub.can('players.job') ? <Btn onClick={() => setTool('job')}><IconBriefcase size={16} /> Trabajo</Btn> : null}
            {hub.can('players.jail') ? <Btn kind="danger" onClick={() => setTool('punish')}><IconLock size={16} /> Castigar</Btn> : null}
            {hub.can('players.troll') ? <Btn onClick={() => setTool('troll')}><IconMoodTongueWink size={16} /> Troll</Btn> : null}
          </div>

          <div>
            <span className="lbl">Advertencias ({d.warns.length})</span>
            {d.warns.length ? (
              <ul className="list">
                {d.warns.map((w) => <li key={w.id}><b>{w.reason}</b><small className="mut">{w.by_name} · {fmtDate(w.created)}</small></li>)}
              </ul>
            ) : <p className="mut small">Ninguna.</p>}
          </div>
          </>}
        </div>
      )}
      {sanction && d ? <SanctionDialog hub={hub} p={d} kind={sanction} onClose={() => setSanction(null)} onDone={() => { load(); refresh(); }} /> : null}
      {d && tool === 'screen' ? <ScreenDialog hub={hub} p={d} onClose={() => setTool('')} /> : null}
      {d && tool === 'punish' ? <PunishDialog hub={hub} p={d} onClose={() => setTool('')} onDone={refresh} /> : null}
      {d && tool === 'troll' ? <TrollDialog hub={hub} p={d} onClose={() => setTool('')} /> : null}
      {d && tool === 'money' ? <MoneyDialog hub={hub} p={d} onClose={() => setTool('')} onDone={load} /> : null}
      {d && tool === 'job' ? <JobDialog hub={hub} p={d} onClose={() => setTool('')} onDone={() => { load(); refresh(); }} /> : null}
    </Dialog>
  );
}

interface Punishment { license: string; kind: string; remaining: number; total: number; reason: string; by_name: string; created: number; name?: string; online?: number }
const PKIND: Record<string, string> = { jail: 'Cárcel', model: 'Modelo', sweep: 'Barrer' };

function Punishments({ hub }: { hub: Hub }) {
  const [rows, setRows] = useState<Punishment[] | null>(null);
  const result = useResult();
  const load = useCallback(async () => {
    const r = await hub.get<Punishment[]>('punishments');
    setRows(r.ok ? r.data || [] : []);
  }, [hub]);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
  return (
    <Card title="Castigos activos">
      {!rows ? <Empty><span className="spin" /></Empty> : !rows.length ? <Empty>Nadie está castigado.</Empty> : (
        <table className="tbl">
          <thead><tr><th>Jugador</th><th>Castigo</th><th>Queda</th><th>Motivo</th><th>Por</th><th /></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.license}>
                <td><b>{p.name || p.license}</b>{p.online ? <small className="mut"> · ID {p.online}</small> : <small className="mut"> · desconectado</small>}</td>
                <td><span className="pill pill--err">{PKIND[p.kind] || p.kind}</span></td>
                <td>{p.kind === 'sweep' ? `${p.remaining} sitios` : fmtHours(p.remaining)}</td>
                <td>{p.reason}</td>
                <td>{p.by_name}</td>
                <td className="right">{hub.can('players.jail') ? <Btn small onClick={async () => { if (result(await hub.act('players.release', { license: p.license }))) load(); }}>Quitar</Btn> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────── jugadores desconectados

interface OffRow { license: string; name: string; char_name?: string; discord?: string; last_seen: number; playtime: number; sessions: number }
interface Profile extends OffRow {
  char_id?: string; first_seen: number; online?: number;
  bans: { id: number; reason: string; by_name: string; created: number; expires: number; on: boolean }[];
  warns: { id: number; reason: string; by_name: string; created: number }[];
  punish?: { kind: string; remaining: number; reason: string; by_name: string } | null;
  logs: { staff_name: string; action: string; detail?: string; created: number }[];
}

function ProfileDialog({ hub, license, onClose }: { hub: Hub; license: string; onClose: () => void }) {
  const [p, setP] = useState<Profile | null | false>(null);
  const [tab, setTab] = useState<'hist' | 'veh'>('hist');
  const [ban, setBan] = useState(false);
  const [reason, setReason] = useState('');
  const durations = hub.info.durations || [{ label: 'Permanente', hours: 0 }];
  const [hours, setHours] = useState(durations[durations.length - 1]?.hours ?? 0);
  const [busy, setBusy] = useState(false);
  const result = useResult();
  const load = useCallback(async () => {
    const r = await hub.get<Profile>('profile', { license });
    setP(r.ok && r.data ? r.data : false);
  }, [hub, license]);
  useEffect(() => { load(); }, [load]);

  return (
    <Dialog wide title={p ? p.name || license : 'Jugador'} onClose={onClose}
      footer={p && hub.can('players.ban') ? <Btn kind="danger" onClick={() => setBan(true)}><IconBan size={16} /> Banear</Btn> : undefined}>
      {p === null ? <Empty><span className="spin" /></Empty> : p === false ? <Empty>No hay datos de ese jugador.</Empty> : (
        <div className="sheet">
          <div className="sheet__grid">
            <div className="kv"><span className="lbl">Personaje</span><b>{p.char_name || '—'}</b></div>
            <div className="kv"><span className="lbl">Estado</span><b className={p.online ? 'c-ok' : ''}>{p.online ? `Conectado (ID ${p.online})` : `Visto ${fmtAgo(p.last_seen)}`}</b></div>
            <div className="kv"><span className="lbl">Tiempo jugado</span><b>{fmtHours(p.playtime)}</b></div>
            <div className="kv"><span className="lbl">Sesiones</span><b>{p.sessions}</b></div>
            <div className="kv"><span className="lbl">Primera vez</span><b>{fmtDate(p.first_seen)}</b></div>
            <div className="kv"><span className="lbl">Discord</span><code>{p.discord || '—'}</code></div>
            <div className="kv kv--wide"><span className="lbl">License</span><code>{p.license}</code></div>
          </div>
          {p.punish ? (
            <div className="alert alert--err row">
              <span><b>Castigado:</b> {PKIND[p.punish.kind] || p.punish.kind} · {p.punish.kind === 'sweep' ? `${p.punish.remaining} sitios` : fmtHours(p.punish.remaining)} · {p.punish.reason} ({p.punish.by_name})</span>
              {hub.can('players.jail') ? <Btn small onClick={async () => { if (result(await hub.act('players.release', { license: p.license }))) load(); }}>Quitar</Btn> : null}
            </div>
          ) : null}
          <div className="seg">
            <button type="button" className={`g ${tab === 'hist' ? 'is-on' : ''}`} onClick={() => setTab('hist')}>Historial</button>
            {hub.can('players.vehicles') ? <button type="button" className={`g ${tab === 'veh' ? 'is-on' : ''}`} onClick={() => setTab('veh')}>Vehículos</button> : null}
          </div>
          {tab === 'veh' ? <VehiclesTab hub={hub} query={{ license: p.license }} /> : (
            <div className="cols">
              <div>
                <span className="lbl">Baneos ({p.bans.length})</span>
                {p.bans.length ? <ul className="list">{p.bans.map((b) => <li key={b.id}><b>{b.reason}</b><small className="mut">{b.by_name} · {fmtDate(b.created)} · {b.on ? (b.expires ? `hasta ${fmtDate(b.expires)}` : 'permanente') : 'terminado'}</small></li>)}</ul> : <p className="mut small">Ninguno.</p>}
                <span className="lbl gap-top">Advertencias ({p.warns.length})</span>
                {p.warns.length ? <ul className="list">{p.warns.map((w) => <li key={w.id}><b>{w.reason}</b><small className="mut">{w.by_name} · {fmtDate(w.created)}</small></li>)}</ul> : <p className="mut small">Ninguna.</p>}
              </div>
              <div>
                <span className="lbl">Lo que le ha hecho el staff</span>
                {p.logs.length ? <ul className="list">{p.logs.map((l, i) => <li key={i}><span><b>{l.action}</b>{l.detail ? <small className="mut"> · {l.detail}</small> : null}</span><small className="mut">{l.staff_name} · {fmtDate(l.created)}</small></li>)}</ul> : <p className="mut small">Nada.</p>}
              </div>
            </div>
          )}
        </div>
      )}
      {ban && p ? (
        <Dialog title={`Banear · ${p.name}`} onClose={() => setBan(false)}
          footer={<Btn kind="danger" busy={busy} disabled={reason.trim().length < 3} onClick={async () => {
            setBusy(true);
            const r = await hub.act('players.banoffline', { license: p.license, reason, hours });
            setBusy(false);
            if (result(r)) { setBan(false); load(); }
          }}>Banear</Btn>}>
          <p className="mut small">Se banea con los identificadores que tenía la última vez que entró. Si está conectado, lo saca.</p>
          <Field label="Motivo"><input className="input" autoFocus value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} /></Field>
          <Field label="Duración"><div className="chips">{durations.map((d) => <button type="button" key={d.label} className={`chip g ${hours === d.hours ? 'is-on' : ''}`} onClick={() => setHours(d.hours)}>{d.label}</button>)}</div></Field>
        </Dialog>
      ) : null}
    </Dialog>
  );
}

function Offline({ hub }: { hub: Hub }) {
  const [rows, setRows] = useState<OffRow[] | null>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await hub.get<OffRow[]>('offline', { q });
      setRows(r.ok ? r.data || [] : []);
    }, 300);
    return () => clearTimeout(t);
  }, [hub, q]);
  return (
    <>
      <Card title="Todos los jugadores" right={<Search value={q} onChange={setQ} placeholder="Nombre, personaje, license o Discord…" />}>
        {!rows ? <Empty><span className="spin" /></Empty> : !rows.length ? <Empty>{q ? 'Nadie coincide.' : 'Todavía no hay historial: se va guardando al entrar la gente.'}</Empty> : (
          <table className="tbl tbl--click">
            <thead><tr><th>Nombre</th><th>Personaje</th><th>Última vez</th><th>Tiempo jugado</th><th>Sesiones</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.license} onClick={() => setOpen(r.license)}>
                  <td><b>{r.name}</b></td><td>{r.char_name || '—'}</td><td>{fmtAgo(r.last_seen)}</td><td>{fmtHours(r.playtime)}</td><td>{r.sessions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {open ? <ProfileDialog hub={hub} license={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function Bans({ hub }: { hub: Hub }) {
  const [bans, setBans] = useState<Ban[] | null>(null);
  const [q, setQ] = useState('');
  const result = useResult();
  const load = useCallback(async () => {
    const r = await hub.get<{ bans: Ban[] }>('bans');
    setBans(r.ok ? r.data?.bans || [] : []);
  }, [hub]);
  useEffect(() => { load(); }, [load]);
  const list = (bans || []).filter((b) => !q || `${b.name} ${b.reason} ${b.by_name} ${b.id}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Card title="Baneos" right={<Search value={q} onChange={setQ} placeholder="Buscar baneo…" />}>
      {!bans ? <Empty><span className="spin" /></Empty> : !list.length ? <Empty>No hay baneos.</Empty> : (
        <table className="tbl">
          <thead><tr><th>N.º</th><th>Jugador</th><th>Motivo</th><th>Por</th><th>Fecha</th><th>Hasta</th><th /></tr></thead>
          <tbody>
            {list.map((b) => (
              <tr key={b.id} className={b.on ? '' : 'is-dim'}>
                <td className="mono">{b.id}</td><td>{b.name || '—'}</td><td>{b.reason}</td><td>{b.by_name}</td><td>{fmtDate(b.created)}</td>
                <td>{!b.on ? <span className="pill pill--off">Terminado</span> : b.expires ? fmtDate(b.expires) : <span className="pill pill--err">Permanente</span>}</td>
                <td className="right">{b.on && hub.can('players.unban') ? <Btn small onClick={async () => { if (result(await hub.act('players.unban', { id: b.id }))) load(); }}>Quitar</Btn> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export function Players({ hub }: TabProps) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const [view, setView] = useState<'on' | 'all' | 'bans'>('on');

  const load = useCallback(async () => {
    const r = await hub.get<Row[]>('players');
    if (r.ok) setRows(r.data || []);
  }, [hub]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    const off = hub.on((m) => { if (m.t === 'player') setTimeout(load, 800); });
    return () => { clearInterval(t); off(); };
  }, [hub, load]);

  const list = useMemo(() => (rows || []).filter((p) => !q || `${p.id} ${p.name} ${p.char || ''} ${p.job || ''}`.toLowerCase().includes(q.toLowerCase())), [rows, q]);

  return (
    <>
      <div className="page__head">
        <div><span className="lbl">Jugadores</span><h1 className="t">{view === 'on' ? `Conectados (${rows?.length ?? 0})` : view === 'all' ? 'Todos' : 'Sanciones'}</h1></div>
        <div className="seg">
          <button type="button" className={`g ${view === 'on' ? 'is-on' : ''}`} onClick={() => setView('on')}>Conectados</button>
          {hub.can('players.offline') ? <button type="button" className={`g ${view === 'all' ? 'is-on' : ''}`} onClick={() => setView('all')}>Todos</button> : null}
          <button type="button" className={`g ${view === 'bans' ? 'is-on' : ''}`} onClick={() => setView('bans')}>Sanciones</button>
        </div>
      </div>
      {view === 'all' ? <Offline hub={hub} /> : view === 'bans' ? <><Punishments hub={hub} /><Bans hub={hub} /></> : (
        <Card right={<Search value={q} onChange={setQ} placeholder="ID, nombre, personaje o trabajo…" />} title="Lista">
          {!rows ? <Empty><span className="spin" /></Empty> : !list.length ? <Empty>{rows.length ? 'Nadie coincide con la búsqueda.' : 'No hay nadie conectado.'}</Empty> : (
            <table className="tbl tbl--click">
              <thead><tr><th>ID</th><th>Nombre</th><th>Personaje</th><th>Trabajo</th><th>Ping</th><th /></tr></thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id} onClick={() => setOpen(p.id)}>
                    <td className="mono">{p.id}</td>
                    <td><b>{p.name}</b></td>
                    <td>{p.char || '—'}</td>
                    <td>{p.job || '—'}{p.grade ? <small className="mut"> · {p.grade}</small> : null}</td>
                    <td className={p.ping > 150 ? 'c-warn' : ''}>{p.ping} ms</td>
                    <td className="right">
                      {p.staff ? <span className="pill">{p.staff}</span> : null}
                      {p.frozen ? <span className="pill pill--info">Congelado</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
      {open !== null ? <PlayerSheet hub={hub} id={open} onClose={() => setOpen(null)} refresh={load} /> : null}
    </>
  );
}
