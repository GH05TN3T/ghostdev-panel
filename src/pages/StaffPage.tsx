import { useCallback, useEffect, useState } from 'react';
import { IconPlus } from '@tabler/icons-react';
import { api, fmtAgo } from '../api';
import { Btn, Card, Dialog, Empty, Field, useResult } from '../ui';
import type { TabProps } from './Server';

interface Member { id: string; rank: string; note: string | null; added: number; name: string | null; avatar: string | null; last_login: number | null }

export function StaffPage({ hub, serverId }: TabProps) {
  const [staff, setStaff] = useState<Member[] | null>(null);
  const [edit, setEdit] = useState<{ id: string; rank: string; note: string; isNew: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const result = useResult();
  const ranks = (hub.info.ranks || []).filter((r) => r.name !== 'owner');

  const load = useCallback(async () => {
    const r = await api<{ staff: Member[] }>(`/api/servers/${serverId}/staff`);
    setStaff(r.ok ? r.staff : []);
  }, [serverId]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!edit) return;
    setBusy(true);
    const r = await api(`/api/servers/${serverId}/staff`, { method: 'PUT', body: { id: edit.id.trim(), rank: edit.rank, note: edit.note } });
    setBusy(false);
    if (result(r, 'Guardado.')) { setEdit(null); load(); }
  };
  const remove = async (m: Member) => {
    if (!confirm(`¿Quitar a ${m.name || m.note || m.id} del panel?`)) return;
    if (result(await api(`/api/servers/${serverId}/staff/${m.id}`, { method: 'DELETE' }), 'Quitado.')) load();
  };
  const rankLabel = (n: string) => hub.info.ranks?.find((r) => r.name === n)?.label || n;

  return (
    <>
      <div className="page__head">
        <div><span className="lbl">Acceso</span><h1 className="t">Staff web</h1></div>
        <Btn kind="solid" onClick={() => setEdit({ id: '', rank: ranks[0]?.name || '', note: '', isNew: true })}><IconPlus size={16} /> Añadir</Btn>
      </div>
      <Card title="Quién entra al panel de este servidor">
        <p className="mut small">Cada persona entra con su cuenta de Discord y tiene el rango de <b>ghostdev_admin</b> que elijas: los mismos permisos que ese rango tiene en el juego (los rangos se editan en el panel del juego). Los comandos del bot de Discord usan este mismo acceso.</p>
        {!staff ? <Empty><span className="spin" /></Empty> : !staff.length ? <Empty>Solo tú, de momento.</Empty> : (
          <table className="tbl">
            <thead><tr><th>Persona</th><th>ID de Discord</th><th>Rango</th><th>Último acceso</th><th /></tr></thead>
            <tbody>
              {staff.map((m) => (
                <tr key={m.id}>
                  <td className="who">{m.avatar ? <img src={m.avatar} alt="" /> : <span className="avatar">{(m.name || m.note || '?')[0]}</span>}<b>{m.name || m.note || 'Aún no ha entrado'}</b></td>
                  <td className="mono">{m.id}</td>
                  <td><span className="pill">{rankLabel(m.rank)}</span></td>
                  <td>{fmtAgo(m.last_login)}</td>
                  <td className="right nowrap">
                    <Btn small onClick={() => setEdit({ id: m.id, rank: m.rank, note: m.note || '', isNew: false })}>Editar</Btn>
                    <Btn small kind="danger" onClick={() => remove(m)}>Quitar</Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {edit ? (
        <Dialog title={edit.isNew ? 'Añadir al staff web' : 'Editar acceso'} onClose={() => setEdit(null)}
          footer={<Btn kind="solid" busy={busy} disabled={!/^\d{15,22}$/.test(edit.id.trim()) || !edit.rank} onClick={save}>Guardar</Btn>}>
          <Field label="ID de Discord" hint="En Discord: Ajustes → Avanzado → Modo desarrollador, y luego clic derecho en la persona → Copiar ID.">
            <input className="input mono" value={edit.id} disabled={!edit.isNew} onChange={(e) => setEdit({ ...edit, id: e.target.value.replace(/\D/g, '') })} />
          </Field>
          <Field label="Nota" hint="Para reconocerla antes de que entre por primera vez.">
            <input className="input" value={edit.note} maxLength={64} onChange={(e) => setEdit({ ...edit, note: e.target.value })} />
          </Field>
          <Field label="Rango">
            {ranks.length ? (
              <div className="chips">{ranks.map((r) => <button type="button" key={r.name} className={`chip g ${edit.rank === r.name ? 'is-on' : ''}`} onClick={() => setEdit({ ...edit, rank: r.name })}>{r.label} <small>nivel {r.level}</small></button>)}</div>
            ) : <p className="mut small">Conecta el servidor para ver sus rangos.</p>}
          </Field>
        </Dialog>
      ) : null}
    </>
  );
}
