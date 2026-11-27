// Panel web · piezas de interfaz: botones, ventanas, avisos y el brillo que sigue al ratón

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

/** Brillo: un solo listener para toda la página (pone --mx/--my en lo que está bajo el ratón) */
export function useGlare() {
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.('.g') as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);
}

type BtnProps = {
  children: ReactNode; onClick?: () => void; kind?: 'solid' | 'line' | 'ghost' | 'danger' | 'ok';
  disabled?: boolean; small?: boolean; title?: string; type?: 'button' | 'submit'; busy?: boolean; className?: string;
};
export function Btn({ children, onClick, kind = 'line', disabled, small, title, type = 'button', busy, className }: BtnProps) {
  return (
    <button type={type} title={title} className={`btn btn--${kind} g ${small ? 'btn--sm' : ''} ${className || ''}`} disabled={disabled || busy} onClick={onClick}>
      {busy ? <span className="spin" /> : null}
      {children}
    </button>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="field">
      <span className="lbl">{label}</span>
      {children}
      {hint ? <small className="mut">{hint}</small> : null}
    </label>
  );
}

export function Card({ title, right, children, className }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card g ${className || ''}`}>
      {title || right ? (
        <header className="card__head">
          {title ? <h3 className="t">{title}</h3> : <span />}
          {right}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

// ventanas abiertas, de abajo arriba: Esc solo cierra la de arriba
const stack: symbol[] = [];

/** Ventana: se cierra con Esc o con el botón «Cerrar» */
export function Dialog({ title, children, onClose, footer, wide }: { title: ReactNode; children: ReactNode; onClose: () => void; footer?: ReactNode; wide?: boolean }) {
  const me = useRef(Symbol('dlg'));
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const id = me.current;
    stack.push(id);
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || stack[stack.length - 1] !== id) return;
      e.stopImmediatePropagation();
      close.current();
    };
    window.addEventListener('keydown', k);
    return () => { window.removeEventListener('keydown', k); stack.splice(stack.indexOf(id), 1); };
  }, []);
  return (
    <div className="dlg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`dlg__box g ${wide ? 'dlg__box--wide' : ''}`} role="dialog" aria-modal="true">
        <header className="dlg__head"><h3 className="t">{title}</h3></header>
        <div className="dlg__body">{children}</div>
        <footer className="dlg__foot">
          <Btn kind="ghost" onClick={onClose}>Cerrar</Btn>
          {footer}
        </footer>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────── avisos

type Toast = { id: number; ok: boolean; text: string };
const ToastCtx = createContext<(ok: boolean, text: string) => void>(() => {});

export function ToastHost({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const seq = useRef(0);
  const push = useCallback((ok: boolean, text: string) => {
    const id = ++seq.current;
    setList((l) => [...l.slice(-3), { id, ok, text }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">
        {list.map((t) => <div key={t.id} className={`toast ${t.ok ? 'toast--ok' : 'toast--err'}`}>{t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/** Enseña el resultado de una acción como aviso */
export function useResult() {
  const toast = useToast();
  return useCallback((r: { ok: boolean; msg?: string }, okText = 'Hecho.') => {
    toast(r.ok, r.msg || (r.ok ? okText : 'No se pudo.'));
    return r.ok;
  }, [toast]);
}

export function Dot({ on }: { on: boolean }) {
  return <i className={`dot ${on ? 'dot--on' : 'dot--off'}`} />;
}

export function Search({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input className="input search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || 'Buscar…'} />;
}
