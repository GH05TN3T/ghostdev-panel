import { useState } from 'react';
import { api } from '../api';
import { Btn, Card, Dialog, Field, useResult } from '../ui';
import { go } from '../App';
import { KeyBox } from './Servers';
import type { TabProps } from './Server';

export function SettingsPage({ me, serverId, reload }: TabProps) {
  const server = me.servers.find((s) => s.id === serverId)!;
  const [name, setName] = useState(server.name);
  const [channel, setChannel] = useState(server.logChannel || '');
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const result = useResult();

  const save = async () => {
    setBusy('save');
    const r = await api(`/api/servers/${serverId}`, { method: 'PATCH', body: { name, logChannel: channel } });
    setBusy('');
    if (result(r, 'Guardado.')) reload();
  };
  const newKey = async () => {
    if (!confirm('La clave actual dejará de funcionar y el servidor se desconectará hasta que pongas la nueva. ¿Seguir?')) return;
    setBusy('key');
    const r = await api<{ key: string }>(`/api/servers/${serverId}/key`, { method: 'POST' });
    setBusy('');
    if (result(r)) setKey(r.key);
  };
  const register = async () => {
    setBusy('bot');
    const r = await api<{ count: number; scope: string }>('/api/discord/register', { method: 'POST' });
    setBusy('');
    result(r, `${r.count} comandos registrados (${r.scope}).`);
  };
  const remove = async () => {
    if (prompt(`Escribe el nombre del servidor (${server.name}) para borrarlo del panel. Se borran también sus logs y su staff web.`) !== server.name) return;
    if (result(await api(`/api/servers/${serverId}`, { method: 'DELETE' }), 'Servidor borrado.')) { reload(); go(''); }
  };

  return (
    <>
      <div className="page__head"><div><span className="lbl">Servidor</span><h1 className="t">Ajustes</h1></div></div>
      <div className="grid grid--2">
        <Card title="General">
          <Field label="Nombre en el panel"><input className="input" value={name} maxLength={48} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Canal de logs en Discord" hint={me.bot ? 'ID del canal donde el bot manda los logs (vacío = no se mandan). El bot tiene que poder escribir en él.' : 'Falta el token del bot (DISCORD_BOT_TOKEN) en Cloudflare para mandar logs.'}>
            <input className="input mono" value={channel} onChange={(e) => setChannel(e.target.value.replace(/\D/g, ''))} placeholder="123456789012345678" />
          </Field>
          <div className="row row--end"><Btn kind="solid" busy={busy === 'save'} onClick={save}>Guardar</Btn></div>
        </Card>
        <div className="stack">
          <Card title="Conexión del servidor">
            <p className="mut small">El servidor se conecta con la clave que pusiste en su server.cfg. Si crees que alguien la ha visto, genera otra.</p>
            <div className="row"><Btn busy={busy === 'key'} onClick={newKey}>Generar clave nueva</Btn></div>
          </Card>
          <Card title="Bot de Discord">
            <p className="mut small">Registra los comandos <code>/estado</code>, <code>/jugadores</code>, <code>/kick</code>, <code>/ban</code>, <code>/revivir</code> y <code>/anuncio</code>. Vuelve a hacerlo si añades otro servidor, para que salga en la opción «servidor».</p>
            <div className="row"><Btn busy={busy === 'bot'} disabled={!me.bot} onClick={register}>Registrar comandos</Btn></div>
          </Card>
          <Card title="Zona peligrosa">
            <div className="row"><Btn kind="danger" onClick={remove}>Borrar servidor del panel</Btn></div>
          </Card>
        </div>
      </div>
      {key ? <Dialog title="Clave nueva" onClose={() => setKey(null)}><KeyBox id={serverId} k={key} /></Dialog> : null}
    </>
  );
}
