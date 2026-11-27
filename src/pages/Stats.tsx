import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { Card, Empty } from '../ui';
import type { TabProps } from './Server';

interface Point { t: number; players: number; avg: number; staff: number }
interface StatsRes {
  ok: boolean; days: number; bucket: number; series: Point[];
  peak: { peak: number | null; avg: number | null } | null;
  staff: { staff: string; n: number }[];
  sanctions: { staff: string; bans: number; kicks: number; warns: number; punish: number }[];
  totals: { bans: number | null; kicks: number | null; warns: number | null; punish: number | null; actions: number | null } | null;
}

/** Gráfica de jugadores (SVG propio, sin librerías) */
function PlayersChart({ series, days }: { series: Point[]; days: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000, H = 260, PAD = { l: 40, r: 14, t: 14, b: 28 };
  const max = Math.max(4, ...series.map((p) => p.players));
  const step = max <= 8 ? 2 : max <= 20 ? 5 : max <= 60 ? 10 : 20;
  const top = Math.ceil(max / step) * step;
  const t0 = series[0]?.t ?? 0, t1 = series[series.length - 1]?.t ?? 1;
  const x = (t: number) => PAD.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / top) * (H - PAD.t - PAD.b);
  const line = series.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.players).toFixed(1)}`).join(' ');
  const area = series.length ? `${line} L${x(t1)},${y(0)} L${x(t0)},${y(0)} Z` : '';
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const labelAt = (t: number) => new Date(t * 1000).toLocaleString('es-ES', days <= 1 ? { hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit' });
  const xLabels = series.length > 1 ? [0, 0.25, 0.5, 0.75, 1].map((f) => t0 + f * (t1 - t0)) : [];
  const h = hover !== null ? series[hover] : null;

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const fx = ((e.clientX - r.left) / r.width) * W;
          let best = 0, d = Infinity;
          series.forEach((p, i) => { const dd = Math.abs(x(p.t) - fx); if (dd < d) { d = dd; best = i; } });
          setHover(series.length ? best : null);
        }}
        onMouseLeave={() => setHover(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="chart__grid" />
            <text x={PAD.l - 8} y={y(v) + 4} className="chart__lbl" textAnchor="end">{v}</text>
          </g>
        ))}
        {xLabels.map((t, i) => <text key={i} x={x(t)} y={H - 8} className="chart__lbl" textAnchor={i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}>{labelAt(t)}</text>)}
        <path d={area} className="chart__area" />
        <path d={line} className="chart__line" />
        {h ? (
          <g>
            <line x1={x(h.t)} x2={x(h.t)} y1={PAD.t} y2={H - PAD.b} className="chart__cursor" />
            <circle cx={x(h.t)} cy={y(h.players)} r={5} className="chart__dot" />
          </g>
        ) : null}
      </svg>
      {h ? <div className="chart__tip"><b>{h.players}</b> jugadores · {Math.round(h.avg)} de media · {h.staff} staff<small>{labelAt(h.t)}</small></div> : null}
    </div>
  );
}

export function Stats({ serverId }: TabProps) {
  const [days, setDays] = useState(1);
  const [s, setS] = useState<StatsRes | null>(null);
  useEffect(() => { setS(null); api<StatsRes>(`/api/servers/${serverId}/stats?days=${days}`).then(setS); }, [serverId, days]);
  const maxSan = useMemo(() => Math.max(1, ...(s?.sanctions || []).map((r) => r.bans + r.kicks + r.warns + r.punish)), [s]);
  const maxAct = useMemo(() => Math.max(1, ...(s?.staff || []).map((r) => r.n)), [s]);
  const t = s?.totals || null;

  return (
    <>
      <div className="page__head">
        <div><span className="lbl">Servidor</span><h1 className="t">Estadísticas</h1></div>
        <div className="seg">
          {[[1, '24 h'], [7, '7 días'], [30, '30 días']].map(([d, l]) => (
            <button key={d} type="button" className={`g ${days === d ? 'is-on' : ''}`} onClick={() => setDays(d as number)}>{l}</button>
          ))}
        </div>
      </div>
      {!s ? <Empty><span className="spin" /></Empty> : (
        <>
          <div className="grid grid--stats">
            <div className="stat g"><span className="lbl">Pico de jugadores</span><b className="t">{s.peak?.peak ?? 0}</b></div>
            <div className="stat g"><span className="lbl">Media</span><b className="t">{Math.round(s.peak?.avg ?? 0)}</b></div>
            <div className="stat g"><span className="lbl">Acciones del staff</span><b className="t">{t?.actions ?? 0}</b></div>
            <div className="stat g"><span className="lbl">Baneos</span><b className="t">{t?.bans ?? 0}</b></div>
            <div className="stat g"><span className="lbl">Expulsiones</span><b className="t">{t?.kicks ?? 0}</b></div>
            <div className="stat g"><span className="lbl">Advertencias y castigos</span><b className="t">{(t?.warns ?? 0) + (t?.punish ?? 0)}</b></div>
          </div>
          <Card title="Jugadores conectados">
            {s.series.length < 2 ? <Empty>Aún no hay suficientes datos: el servidor manda una muestra cada 5 minutos.</Empty> : <PlayersChart series={s.series} days={s.days} />}
          </Card>
          <div className="grid grid--2">
            <Card title="Sanciones por staff">
              {!s.sanctions.length ? <Empty>Ninguna en este periodo.</Empty> : (
                <div className="bars">
                  {s.sanctions.map((r) => {
                    const total = r.bans + r.kicks + r.warns + r.punish;
                    return (
                      <div key={r.staff} className="bars__row">
                        <span className="bars__name">{r.staff}</span>
                        <div className="bars__track" style={{ width: `${(total / maxSan) * 100}%` }}>
                          {r.bans ? <i className="b-ban" style={{ flex: r.bans }} title={`${r.bans} baneos`} /> : null}
                          {r.kicks ? <i className="b-kick" style={{ flex: r.kicks }} title={`${r.kicks} expulsiones`} /> : null}
                          {r.warns ? <i className="b-warn" style={{ flex: r.warns }} title={`${r.warns} advertencias`} /> : null}
                          {r.punish ? <i className="b-pun" style={{ flex: r.punish }} title={`${r.punish} castigos`} /> : null}
                        </div>
                        <b className="bars__n">{total}</b>
                      </div>
                    );
                  })}
                  <div className="legend"><span><i className="b-ban" />Baneos</span><span><i className="b-kick" />Expulsiones</span><span><i className="b-warn" />Advertencias</span><span><i className="b-pun" />Castigos</span></div>
                </div>
              )}
            </Card>
            <Card title="Actividad del staff">
              {!s.staff.length ? <Empty>Sin actividad en este periodo.</Empty> : (
                <div className="bars">
                  {s.staff.map((r) => (
                    <div key={r.staff} className="bars__row">
                      <span className="bars__name">{r.staff}</span>
                      <div className="bars__track" style={{ width: `${(r.n / maxAct) * 100}%` }}><i className="b-act" style={{ flex: 1 }} /></div>
                      <b className="bars__n">{r.n}</b>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
