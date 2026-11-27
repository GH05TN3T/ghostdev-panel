import { IconBrandDiscord } from '@tabler/icons-react';

export function Login({ brand }: { brand: string }) {
  const error = new URLSearchParams(location.search).get('error');
  return (
    <div className="login">
      <div className="login__box g">
        <span className="logo logo--big" />
        <h1 className="t">{brand}</h1>
        <p className="mut">Panel de administración de tus servidores de FiveM: jugadores en vivo, mapa, consola, recursos y logs.</p>
        {error ? <div className="alert alert--err">{error}</div> : null}
        <a className="btn btn--solid g login__btn" href="/api/auth/login">
          <IconBrandDiscord size={20} /> Entrar con Discord
        </a>
        <small className="mut">Solo entran las cuentas que el dueño haya añadido al staff.</small>
      </div>
    </div>
  );
}
