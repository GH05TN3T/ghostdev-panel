import { useCallback, useEffect, useRef, useState } from 'react';
import { IconPlus, IconMinus, IconMaximize } from '@tabler/icons-react';
export interface MapPlayer { id: number; name: string; job?: string; x: number; y: number; h: number; car: boolean; dead: boolean; staff?: string }

// Mapa de GTA V hecho con 6 imágenes de 1536 px (2 columnas x 3 filas), como la cuadrícula del minimapa del juego.
// Config.Map dice qué coordenadas del juego cubre cada imagen.
const TILE = 1536;
const COLS = 2;
const ROWS = 3;
const W = TILE * COLS;
const H = TILE * ROWS;
const MAX_ZOOM = 2.2;

export interface MapCalib { originX: number; originY: number; tileUnits: number }
export const DEFAULT_CALIB: MapCalib = { originX: -4140, originY: 8400, tileUnits: 4500 };

type View = { s: number; x: number; y: number };

export function LiveMap({ players, selected, follow, calib, onSelect, onOpen }: {
  players: MapPlayer[];
  selected: number | null;
  follow: boolean;
  calib: MapCalib;
  onSelect: (id: number | null) => void;
  onOpen: (id: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ s: 0.15, x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; x: number; y: number; moved: boolean } | null>(null);

  const k = TILE / calib.tileUnits;
  const project = useCallback((x: number, y: number) => ({ mx: (x - calib.originX) * k, my: (calib.originY - y) * k }), [calib, k]);
  const fitScale = size.w && size.h ? Math.min(size.w / W, size.h / H) : 0.15;

  // nunca deja ver más allá del borde del mapa
  const clamp = useCallback((v: View): View => {
    const s = Math.max(fitScale, Math.min(MAX_ZOOM, v.s));
    const mw = W * s, mh = H * s;
    const x = mw <= size.w ? (size.w - mw) / 2 : Math.min(0, Math.max(size.w - mw, v.x));
    const y = mh <= size.h ? (size.h - mh) / 2 : Math.min(0, Math.max(size.h - mh, v.y));
    return { s, x, y };
  }, [fitScale, size]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // al abrir, se ve el mapa entero
  const ready = useRef(false);
  useEffect(() => {
    if (ready.current || !size.w) return;
    ready.current = true;
    setView(clamp({ s: fitScale, x: 0, y: 0 }));
  }, [size, fitScale, clamp]);

  const zoomAt = (f: number, cx: number, cy: number) => setView((v) => {
    const s = Math.max(fitScale, Math.min(MAX_ZOOM, v.s * f));
    const r = s / v.s;
    return clamp({ s, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r });
  });

  const centerOn = useCallback((x: number, y: number, minScale = 0.6) => {
    const { mx, my } = project(x, y);
    setView((v) => {
      const s = Math.max(v.s, minScale);
      return clamp({ s, x: size.w / 2 - mx * s, y: size.h / 2 - my * s });
    });
  }, [project, clamp, size]);

  // al elegir a alguien, el mapa va hacia él (y lo sigue si «Seguir» está activo)
  const sel = players.find((p) => p.id === selected);
  useEffect(() => { if (sel) centerOn(sel.x, sel.y); }, [selected]);
  useEffect(() => { if (sel && follow) centerOn(sel.x, sel.y, 0); }, [sel?.x, sel?.y, follow]);

  const pct = Math.round((view.s / fitScale) * 100);

  return (
    <div
      className="lmap"
      ref={box}
      onWheel={(e) => {
        const r = box.current!.getBoundingClientRect();
        zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - r.left, e.clientY - r.top);
      }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        drag.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y, moved: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        if (Math.abs(e.clientX - d.px) + Math.abs(e.clientY - d.py) > 4) d.moved = true;
        setView((v) => clamp({ s: v.s, x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py }));
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        if (d && !d.moved) onSelect(null);   // clic en el mapa vacío: quita la selección
      }}
    >
      <div className="lmap__world" style={{ width: W, height: H, transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}>
        {Array.from({ length: ROWS * COLS }, (_, i) => {
          const r = Math.floor(i / COLS), c = i % COLS;
          return <img key={i} src={`/map/${r}_${c}.webp`} alt="" draggable={false} style={{ left: c * TILE, top: r * TILE }} />;
        })}
      </div>

      <div className="lmap__pins">
        {players.map((p) => {
          const { mx, my } = project(p.x, p.y);
          const left = view.x + mx * view.s;
          const top = view.y + my * view.s;
          if (left < -30 || top < -30 || left > size.w + 30 || top > size.h + 30) return null;
          const on = p.id === selected;
          const cls = ['pin', on && 'is-on', p.dead && 'pin--dead', p.car && 'pin--car', p.staff && 'pin--staff'].filter(Boolean).join(' ');
          return (
            <button key={p.id} type="button" className={cls} style={{ left, top }} title={`${p.id} · ${p.name}`}
              onClick={(e) => { e.stopPropagation(); onSelect(p.id); }}
              onDoubleClick={(e) => { e.stopPropagation(); onOpen(p.id); }}>
              {!p.dead && <i className="pin__dir" style={{ transform: `rotate(${-p.h}deg)` }} />}
              <span className="pin__dot" />
              <span className="pin__tag">{p.id}<b>{p.name}</b></span>
            </button>
          );
        })}
      </div>

      <div className="lmap__zoom">
        <button type="button" onClick={() => zoomAt(1.4, size.w / 2, size.h / 2)} aria-label="Acercar"><IconPlus size="1em" /></button>
        <span>{pct}%</span>
        <button type="button" onClick={() => zoomAt(1 / 1.4, size.w / 2, size.h / 2)} aria-label="Alejar"><IconMinus size="1em" /></button>
        <button type="button" onClick={() => setView(clamp({ s: fitScale, x: 0, y: 0 }))} aria-label="Ver el mapa entero" title="Ver el mapa entero"><IconMaximize size="1em" /></button>
      </div>

      <div className="lmap__legend">
        <span><i className="pin__dot" />A pie</span>
        <span className="pin--car"><i className="pin__dot" />En vehículo</span>
        <span className="pin--dead"><i className="pin__dot" />Caído</span>
        <span className="pin--staff"><i className="pin__dot" />Staff</span>
      </div>
    </div>
  );
}
