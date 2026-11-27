import { useEffect, useMemo, useReducer, useState, type ComponentType } from 'react';
import {
  IconLayoutDashboard, IconUsers, IconMap2, IconListDetails, IconTerminal2, IconPackages, IconShieldLock, IconSettings, IconArrowLeft, IconMessageReport, IconChartLine,
} from '@tabler/icons-react';
import { Hub, type Me } from '../api';
import { Dot, Empty } from '../ui';
import { go } from '../App';
import { Overview } from './Overview';
import { Players } from './Players';
import { MapPage } from './MapPage';
import { Logs } from './Logs';
import { ConsolePage } from './ConsolePage';
import { Resources } from './Resources';
import { StaffPage } from './StaffPage';
import { SettingsPage } from './SettingsPage';
import { Reports } from './Reports';
import { Stats } from './Stats';

export interface TabProps { hub: Hub; me: Me; serverId: string; reload: () => void }

const TABS: { key: string; label: string; icon: ComponentType<{ size?: number }>; perm?: string; owner?: boolean; offline?: boolean; C: ComponentType<TabProps> }[] = [
  { key: 'resumen', label: 'Resumen', icon: IconLayoutDashboard, perm: 'panel', C: Overview },
  { key: 'jugadores', label: 'Jugadores', icon: IconUsers, perm: 'players.view', C: Players },
  { key: 'reportes', label: 'Reportes', icon: IconMessageReport, perm: 'reports.view', C: Reports },
  { key: 'mapa', label: 'Mapa en vivo', icon: IconMap2, perm: 'players.map', C: MapPage },
  { key: 'logs', label: 'Logs', icon: IconListDetails, perm: 'logs.view', offline: true, C: Logs },
  { key: 'estadisticas', label: 'Estadísticas', icon: IconChartLine, perm: 'server.stats', offline: true, C: Stats },
  { key: 'consola', label: 'Consola', icon: IconTerminal2, perm: 'server.console', C: ConsolePage },
  { key: 'recursos', label: 'Recursos', icon: IconPackages, perm: 'server.resources', C: Resources },
  { key: 'staff', label: 'Staff web', icon: IconShieldLock, owner: true, offline: true, C: StaffPage },
  { key: 'ajustes', label: 'Ajustes', icon: IconSettings, owner: true, offline: true, C: SettingsPage },
];

/** Vuelve a pintar cuando cambia el estado del hub (conexión, permisos, servidor encendido) */
export function useHubState(hub: Hub) {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => hub.on((m) => { if (['hello', 'info', 'status', 'conn', 'kicked'].includes(m.t)) bump(); }), [hub]);
  return hub;
}

export function ServerView({ me, serverId, tab, reload }: { me: Me; serverId: string; tab: string; reload: () => void }) {
  const hub = useMemo(() => new Hub(serverId), [serverId]);
  useEffect(() => () => hub.close(), [hub]);
  useHubState(hub);
  const [kicked, setKicked] = useState(false);
  useEffect(() => hub.on((m) => { if (m.t === 'kicked') setKicked(true); }), [hub]);

  const server = me.servers.find((s) => s.id === serverId);
  if (!server) return <main className="page"><Empty>Ese servidor no existe o no tienes acceso.</Empty></main>;

  const visible = TABS.filter((t) => (t.owner ? me.owner : !t.perm || hub.can(t.perm) || (t.key === 'logs' && me.owner)));
  const current = visible.find((t) => t.key === tab) || visible[0];
  const Page = current?.C;
  const needsLive = current && !current.offline;

  return (
    <div className="srvview">
      <aside className="side">
        <button type="button" className="side__back g" onClick={() => go('')}><IconArrowLeft size={16} /> Servidores</button>
        <div className="side__srv">
          <b className="t">{server.name}</b>
          <span className={`pill ${hub.online ? 'pill--ok' : 'pill--off'}`}><Dot on={hub.online} />{hub.online ? 'Conectado' : hub.connected ? 'Servidor apagado' : 'Conectando…'}</span>
          {hub.info.name ? <small className="mut">{hub.info.name}</small> : null}
          {hub.rank ? <small className="mut">Tu rango: <b>{hub.info.ranks?.find((r) => r.name === hub.rank)?.label || hub.rank}</b></small> : null}
        </div>
        <nav>
          {visible.map((t) => (
            <button key={t.key} type="button" className={`g ${t.key === current?.key ? 'is-on' : ''}`} onClick={() => go(`s/${serverId}/${t.key}`)}>
              <t.icon size={18} /> {t.label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="page page--server">
        {kicked ? (
          <Empty>Te han cambiado el acceso a este servidor. Recarga la página.</Empty>
        ) : !hub.connected && hub.rank === '' ? (
          <Empty><span className="spin" /> Conectando con el panel…</Empty>
        ) : needsLive && !hub.online ? (
          <div className="offline g">
            <h2 className="t">El servidor no está conectado</h2>
            <p className="mut">Comprueba que el servidor está encendido, que <code>ghostdev_admin</code> está arrancado y que el <b>server.cfg</b> tiene <code>gdadmin_web_url</code> y <code>gdadmin_web_key</code>. En la consola del servidor sale «Panel web: conectado» cuando funciona.</p>
          </div>
        ) : Page ? (
          <Page hub={hub} me={me} serverId={serverId} reload={reload} />
        ) : (
          <Empty>Tu rango no tiene acceso a ninguna sección.</Empty>
        )}
      </main>
    </div>
  );
}
