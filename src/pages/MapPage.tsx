import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_CALIB, LiveMap, type MapPlayer } from '../LiveMap';
import { Search } from '../ui';
import type { TabProps } from './Server';
import { PlayerSheet } from './Players';

export function MapPage({ hub }: TabProps) {
  const [players, setPlayers] = useState<MapPlayer[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [follow, setFollow] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    // el servidor solo manda posiciones mientras esta página está abierta
    hub.setWatch({ map: true });
    hub.get<MapPlayer[]>('map').then((r) => { if (r.ok) setPlayers(r.data || []); });
    const off = hub.on((m) => { if (m.t === 'map') setPlayers(m.players || []); });
    return () => { off(); hub.setWatch({ map: false }); };
  }, [hub]);

  const list = useMemo(() => players.filter((p) => !q || `${p.id} ${p.name} ${p.job || ''}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.id - b.id), [players, q]);

  return (
    <div className="mappage">
      <div className="mappage__map g">
        <LiveMap players={players} selected={selected} follow={follow} calib={hub.info.map || DEFAULT_CALIB}
          onSelect={setSelected} onOpen={(id) => setOpen(id)} />
      </div>
      <aside className="mappage__list card">
        <header className="card__head"><h3 className="t">En el mapa ({players.length})</h3></header>
        <Search value={q} onChange={setQ} placeholder="Buscar…" />
        <label className="check"><input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Seguir al seleccionado</label>
        <div className="mappage__rows">
          {list.map((p) => (
            <button key={p.id} type="button" className={`mrow g ${selected === p.id ? 'is-on' : ''}`} onClick={() => setSelected(p.id)} onDoubleClick={() => setOpen(p.id)}>
              <span className="mono">{p.id}</span>
              <b>{p.name}</b>
              <small className="mut">{p.dead ? 'Caído' : p.car ? 'En vehículo' : p.job || 'A pie'}</small>
            </button>
          ))}
        </div>
        <small className="mut">Doble clic en un jugador para abrir su ficha.</small>
      </aside>
      {open !== null ? <PlayerSheet hub={hub} id={open} onClose={() => setOpen(null)} refresh={() => {}} /> : null}
    </div>
  );
}
