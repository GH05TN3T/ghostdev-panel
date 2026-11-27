// Panel web · aplicación: inicio de sesión, lista de servidores y panel de cada servidor

import { useCallback, useEffect, useState } from 'react';
import { api, type Me } from './api';
import { Btn, ToastHost, useGlare } from './ui';
import { Login } from './pages/Login';
import { Servers } from './pages/Servers';
import { ServerView } from './pages/Server';

function useRoute() {
  const read = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [route, setRoute] = useState<string[]>(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export const go = (path: string) => { location.hash = '#/' + path; };

export function App() {
  useGlare();
  const [me, setMe] = useState<Me | null | false>(null);
  const [brand, setBrand] = useState('Panel');
  const route = useRoute();

  const load = useCallback(async () => {
    const r = await api<Me>('/api/me');
    setMe(r.ok ? r : false);
    if (r.ok) setBrand(r.brand);
  }, []);

  useEffect(() => {
    api<{ brand: string }>('/api/brand').then((r) => { if (r.ok) setBrand(r.brand); });
    load();
  }, [load]);

  useEffect(() => { document.title = brand; }, [brand]);

  if (me === null) return <div className="boot"><span className="spin" /></div>;

  return (
    <ToastHost>
      {me === false ? (
        <Login brand={brand} />
      ) : (
        <div className="app">
          <header className="top">
            <a className="top__brand" href="#/">
              <span className="logo" />
              <b className="t">{brand}</b>
            </a>
            <div className="top__user">
              {me.user.avatar ? <img src={me.user.avatar} alt="" /> : <span className="avatar">{me.user.name[0]}</span>}
              <div>
                <b>{me.user.name}</b>
                <small className="mut">{me.owner ? 'Dueño' : 'Staff'}</small>
              </div>
              <Btn small kind="ghost" onClick={async () => { await api('/api/auth/logout', { method: 'POST' }); location.href = '/'; }}>Salir</Btn>
            </div>
          </header>
          {route[0] === 's' && route[1] ? (
            <ServerView key={route[1]} me={me} serverId={route[1]} tab={route[2] || 'resumen'} reload={load} />
          ) : (
            <Servers me={me} reload={load} />
          )}
        </div>
      )}
    </ToastHost>
  );
}
