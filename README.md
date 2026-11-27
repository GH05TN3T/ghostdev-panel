# Panel web para ghostdev_admin

Panel privado en el navegador para administrar tus servidores de FiveM: jugadores en vivo, mapa, consola, recursos, logs y bot de Discord.
Funciona con **ESX, QBCore y Qbox** (a través de `ghostdev_admin`).

- **Web:** un Worker de Cloudflare con un hub en tiempo real por servidor (Durable Object) y una base de datos D1.
- **Servidor:** `ghostdev_admin` 1.1.0 o superior abre una conexión segura (`wss`) hacia el panel. No hay que abrir ningún puerto.
- **Acceso:** se entra con Discord. Solo entran los dueños (`OWNER_IDS`) y el staff que el dueño añade en cada servidor.
- **Permisos:** cada persona del staff web tiene un rango de `ghostdev_admin` y puede hacer lo mismo que ese rango en el juego. Todo lo comprueba el servidor de FiveM y queda en la auditoría.

## Qué tiene

| Sección | Qué hace |
|---|---|
| Resumen | Jugadores, staff conectado, reportes, recursos, tiempo encendido, baneos, últimas acciones, entradas y salidas en vivo, anuncios y revivir a todos |
| Jugadores | Lista en vivo con buscador y ficha (personaje, trabajo, banda, dinero, vida, license, Discord, advertencias). Revivir, curar, congelar, dar objeto, advertir, expulsar y banear |
| Ficha: herramientas | Ver la pantalla (captura o en vivo, con `screenshot-basic`), dinero (dar y quitar), trabajo y banda, castigos sin ban (cárcel, cambio de modelo y barrer) y acciones troll. Pestañas de inventario (quitar objetos) y vehículos (reparar, borrar de la calle y guardar en el garaje) |
| Jugadores: todos | Buscador de cualquiera que haya entrado alguna vez, aunque esté desconectado: tiempo jugado, sesiones, baneos, advertencias, castigo, lo que le hizo el staff, vehículos y baneo offline |
| Sanciones | Castigos activos (con «Quitar») y baneos (con «Quitar») |
| Reportes | Cola en vivo con aviso de reportes nuevos; atender, responder por chat y cerrar |
| Estadísticas | Jugadores conectados (24 h, 7 y 30 días), pico y media, sanciones por staff y actividad del staff |
| Mapa en vivo | Jugadores sobre el mapa de GTA (a pie, en vehículo, caídos y staff), seguir a uno y abrir su ficha |
| Logs | Todo lo que hace el staff desde el juego, la web y Discord, con buscador y filtro |
| Consola | La consola del servidor en directo y para escribir comandos (permiso «Usar la consola») |
| Recursos | Arrancar, parar y reiniciar (los protegidos no se tocan) |
| Staff web | Quién entra al panel y con qué rango (solo el dueño) |
| Ajustes | Nombre, canal de logs de Discord, clave nueva, comandos del bot y borrar el servidor (solo el dueño) |

Bot de Discord: `/estado`, `/jugadores`, `/kick`, `/ban`, `/revivir` y `/anuncio`, con el mismo acceso que en la web. Los logs se mandan en grupos al canal que elijas.

## Puesta en marcha

### 1. Aplicación de Discord
En <https://discord.com/developers/applications> crea una aplicación y apunta:
- **OAuth2:**
  - copia el *Client ID* y el *Client Secret*;
  - en *Redirects* añade `https://TU-PANEL/api/auth/callback`.
- **Bot:**
  - copia el *Token*;
  - invita el bot a tu Discord con permiso para leer y escribir en el canal de logs.
- **General Information:**
  - copia la *Public Key*;
  - en *Interactions Endpoint URL* pon `https://TU-PANEL/api/discord/interactions`. Hazlo después de publicar el panel: Discord lo comprueba al guardar.

### 2. Cloudflare
1. Sube esta carpeta a un repositorio de GitHub.
2. En Cloudflare, ve a **Workers & Pages → Create → Import a repository** y elige ese repositorio.
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
   - La base de datos D1 y las tablas se crean solas.
3. En **Settings → Variables and Secrets** del Worker pon:
   - **Variables:**
     - `OWNER_IDS`: tu ID de Discord;
     - `DISCORD_CLIENT_ID`;
     - `DISCORD_PUBLIC_KEY`;
     - `DISCORD_GUILD_ID` (tu servidor de Discord, para que los comandos salgan al momento);
     - `BRAND` (el nombre que sale en el panel).
   - **Secrets:**
     - `DISCORD_CLIENT_SECRET`;
     - `DISCORD_BOT_TOKEN`.
   - Los secretos van **solo** ahí: nunca en el repositorio.
4. Si quieres, en **Settings → Domains** ponle tu dominio.

### 3. Cada servidor de FiveM
1. Entra al panel, pulsa **Añadir servidor** y copia las dos líneas que salen en el `server.cfg`, antes de `ensure ghostdev_admin`:
   ```
   set gdadmin_web_url "wss://TU-PANEL/agent"
   set gdadmin_web_key "srv_xxxxxxxxxxxx.xxxxxxxx…"
   ```
   Usa `set`, no `sets` ni `setr`, para que la clave no se vea desde fuera.
2. Reinicia `ghostdev_admin`. Cuando conecta, la consola dice `Panel web: conectado`.
3. En el panel del juego (Staff y rangos), dale a cada rango los permisos que quieras que use en la web: **Usar la consola**, **Ver la pantalla**, **Cárcel, modelo y barrer**, **Acciones troll**, **Ver estadísticas**…
4. Para ver la pantalla de los jugadores, el servidor necesita el recurso `screenshot-basic`.
5. En **Staff web**, añade a tu staff por su ID de Discord y elige su rango.
6. En **Ajustes**:
   - pon el ID del canal de logs;
   - pulsa **Registrar comandos** para el bot.

## Seguridad

- **Claves:**
  - la clave de cada servidor y los tokens de sesión se guardan solo como SHA-256;
  - la clave se enseña una vez;
  - en Ajustes se puede generar otra, y la anterior se corta al momento.
- **Peticiones:**
  - las que cambian algo solo se aceptan desde la propia web (comprobación de `Origin`);
  - la sesión va en una cookie `HttpOnly`, `Secure` y `SameSite=Lax`.
- **Permisos:**
  - el rango de cada acción lo pone el panel según la sesión, nunca la pestaña;
  - el servidor de FiveM vuelve a comprobar el permiso y el nivel (nadie sanciona a alguien de su rango o más) y lo apunta en la auditoría.
- **Lo que no se hace desde la web:** las acciones que necesitan estar dentro del juego (noclip, ir a un jugador, espectar…).

## Desarrollo local
```
npm install
npx wrangler dev --var OWNER_IDS:TU_ID_DE_DISCORD
```
