import { useState } from 'react';
import { IconPlus, IconServer2 } from '@tabler/icons-react';
import { api, fmtAgo, type Me } from '../api';
import { Btn, Card, Dialog, Dot, Empty, Field, useResult } from '../ui';
import { go } from '../App';

/** Las líneas que hay que poner en el server.cfg */
export function KeyBox({ id, k }: { id: string; k: string }) {
  const wss = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/agent`;
  const text = `set gdadmin_web_url "${wss}"\nset gdadmin_web_key "${k}"`;
  const [copied, setCopied] = useState(false);
  return (
    <div className="keybox">
      <p>Pon estas dos líneas en el <b>server.cfg</b> (antes de <code>ensure ghostdev_admin</code>) y reinicia el recurso. <b>La clave solo se enseña ahora</b>: si la pierdes, genera otra en Ajustes.</p>
      <pre className="code">{text}</pre>
      <div className="row">
        <Btn small kind="solid" onClick={() => { navigator.clipboard.writeText(text); setCopied(true); }}>{copied ? 'Copiado' : 'Copiar'}</Btn>
        <small className="mut">Servidor {id}. Usa <code>set</code> (no <code>sets</code> ni <code>setr</code>) para que la clave no se vea desde fuera.</small>
      </div>
    </div>
  );
}

export function Servers({ me, reload }: { me: Me; reload: () => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [created, setCreated] = useState<{ id: string; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const result = useResult();

  const create = async () => {
    setBusy(true);
    const r = await api<{ id: string; key: string }>('/api/servers', { method: 'POST', body: { name } });
    setBusy(false);
    if (!result(r)) return;
    setCreated({ id: r.id, key: r.key });
    reload();
  };

  return (
    <main className="page">
      <div className="page__head">
        <div>
          <span className="lbl">Panel</span>
          <h1 className="t">Servidores</h1>
        </div>
        {me.owner ? <Btn kind="solid" onClick={() => { setAdding(true); setCreated(null); setName(''); }}><IconPlus size={16} /> Añadir servidor</Btn> : null}
      </div>

      {me.servers.length === 0 ? (
        <Card>
          <Empty>
            {me.owner ? 'Todavía no hay servidores. Añade el primero y pon su clave en el server.cfg.' : 'Aún no tienes ningún servidor asignado.'}
          </Empty>
        </Card>
      ) : (
        <div className="grid grid--servers">
          {me.servers.map((s) => (
            <button key={s.id} type="button" className="srv g" onClick={() => go(`s/${s.id}`)}>
              <div className="srv__icon"><IconServer2 size={22} /></div>
              <div className="srv__main">
                <b className="t">{s.name}</b>
                <small className="mut">{s.gameName || 'Sin datos del servidor todavía'}</small>
              </div>
              <div className="srv__side">
                <span className={`pill ${s.online ? 'pill--ok' : 'pill--off'}`}><Dot on={s.online} />{s.online ? 'Conectado' : 'Apagado'}</span>
                <small className="mut">{s.online ? `Rango: ${s.rank}` : `Visto ${fmtAgo(s.lastSeen)}`}</small>
              </div>
            </button>
          ))}
        </div>
      )}

      {adding ? (
        <Dialog
          title={created ? 'Servidor creado' : 'Añadir servidor'}
          onClose={() => setAdding(false)}
          footer={!created ? <Btn kind="solid" busy={busy} disabled={name.trim().length < 2} onClick={create}>Crear</Btn> : <Btn kind="solid" onClick={() => go(`s/${created.id}`)}>Abrir el panel</Btn>}
        >
          {created ? (
            <KeyBox id={created.id} k={created.key} />
          ) : (
            <Field label="Nombre" hint="Solo para el panel (por ejemplo, el nombre de tu servidor).">
              <input className="input" autoFocus value={name} maxLength={48} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && name.trim().length >= 2) create(); }} />
            </Field>
          )}
        </Dialog>
      ) : null}
    </main>
  );
}
