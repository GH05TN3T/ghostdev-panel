import { useEffect, useRef, useState } from 'react';
import { Btn } from '../ui';
import { useResult } from '../ui';
import type { TabProps } from './Server';

interface Line { c: string; m: string; t: number }

const MAX = 1500;

export function ConsolePage({ hub }: TabProps) {
  const [lines, setLines] = useState<Line[]>([]);
  const [cmd, setCmd] = useState('');
  const [stick, setStick] = useState(true);
  const [filter, setFilter] = useState('');
  const history = useRef<string[]>([]);
  const hpos = useRef(-1);
  const box = useRef<HTMLDivElement>(null);
  const result = useResult();

  useEffect(() => {
    hub.setWatch({ console: true });
    const off = hub.on((m) => {
      if (m.t !== 'console') return;
      setLines((old) => (m.full ? m.lines : [...old, ...m.lines]).slice(-MAX));
    });
    return () => { off(); hub.setWatch({ console: false }); };
  }, [hub]);

  useEffect(() => {
    if (stick && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [lines, stick]);

  const run = async () => {
    const c = cmd.trim();
    if (!c) return;
    history.current = [c, ...history.current.filter((h) => h !== c)].slice(0, 30);
    hpos.current = -1;
    setCmd('');
    const r = await hub.request('console', 'exec', { cmd: c });
    if (!r.ok) result(r);
  };

  const shown = filter ? lines.filter((l) => l.m.toLowerCase().includes(filter.toLowerCase())) : lines;
  const tone = (m: string) => (/error|failed|fall[oó]|script error/i.test(m) ? 'is-err' : /warn|aviso/i.test(m) ? 'is-warn' : '');

  return (
    <>
      <div className="page__head">
        <div><span className="lbl">Servidor</span><h1 className="t">Consola</h1></div>
        <div className="row">
          <input className="input search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar líneas…" />
          <Btn small kind="ghost" onClick={() => setLines([])}>Limpiar</Btn>
        </div>
      </div>
      <div className="console g">
        <div className="console__out" ref={box} onScroll={(e) => {
          const el = e.currentTarget;
          setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
        }}>
          {shown.length ? shown.map((l, i) => (
            <div key={i} className={`cline ${tone(l.m)}`}>
              <span className="cline__ch">{l.c}</span>
              <span className="cline__m">{l.m}</span>
            </div>
          )) : <div className="mut">Esperando líneas de la consola…</div>}
        </div>
        <form className="console__in" onSubmit={(e) => { e.preventDefault(); run(); }}>
          <span className="t">&gt;</span>
          <input value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder="Comando (ensure, restart, say…)" spellCheck={false} autoComplete="off"
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp') { e.preventDefault(); hpos.current = Math.min(history.current.length - 1, hpos.current + 1); setCmd(history.current[hpos.current] || cmd); }
              if (e.key === 'ArrowDown') { e.preventDefault(); hpos.current = Math.max(-1, hpos.current - 1); setCmd(hpos.current < 0 ? '' : history.current[hpos.current]); }
            }} />
          <Btn type="submit" kind="solid" small disabled={!cmd.trim()}>Ejecutar</Btn>
        </form>
      </div>
      <small className="mut">Cada comando queda apuntado en los logs con tu nombre.</small>
    </>
  );
}
