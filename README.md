# Claude Office

Oficina virtual en pixel art (vista cenital, estilo Pokémon) donde tus agentes Claude aparecen
como personajes animados. Cada sesión de Claude Code es un personaje: camina hasta su
escritorio, teclea cuando edita archivos, lee cuando busca y te avisa con una burbuja cuando
espera tu respuesta o un permiso.

Es un fork **solo web** de [pixel-agents](https://github.com/pixel-agents-hq/pixel-agents)
(MIT), pensado al 100% para el entorno de Anthropic: Claude Code en tu terminal o IDE hoy y,
en la fase 2, también las sesiones de Claude Code en la nube y tus propios agentes con el
Agent SDK.

![Claude Office](webview-ui/public/office.png)

## Qué muestra

- **Un agente, un personaje.** Cada sesión de Claude Code tiene su propio personaje.
- **Actividad en vivo.** La animación y la etiqueta sobre el personaje siguen lo que hace el
  agente: escribir, leer, ejecutar comandos.
- **Subagentes y equipos.** Los subagentes aparecen junto a su padre; los compañeros de equipo
  (Agent Teams) tienen asiento propio, nombre y la insignia de líder.
- **Burbujas.** Puntos ámbar cuando pide permiso; marca verde cuando termina su turno.
- **Medidor de contexto.** Una barra bajo la etiqueta indica cuán llena está la ventana de
  contexto de cada agente.
- **Sonido.** Aviso opcional cuando un agente termina o pide permiso.
- **Editor de oficina.** Suelos, paredes, alfombras, muebles, áreas y mascotas; el diseño se
  guarda y se puede exportar.
- **Personajes diversos.** Seis personajes basados en el pack CC0
  [MetroCity de JIK-A-4](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack).

<p align="center">
  <img src="webview-ui/public/characters.png" alt="Personajes de Claude Office" width="320" height="72" style="image-rendering: pixelated;">
</p>

## Estado del proyecto

- **Fase 1 (actual): local.** El servidor corre en tu máquina, Windows nativo o WSL, y observa
  las sesiones de Claude Code de esa máquina. La v1 solo observa: no lanza Claude ni abre
  terminales.
- **Fase 2: subdominio.** El mismo servidor detrás de un proxy TLS, con acceso para el visor,
  hooks remotos desde sesiones cloud y agentes del Agent SDK, y una terminal web.

El plan completo, las decisiones tomadas y el estado de cada punto están en
[docs/PLAN.md](docs/PLAN.md).

## Requisitos

- [Node.js](https://nodejs.org/) 20 o superior (recomendado 22, ver `.nvmrc`).
- [Claude Code](https://code.claude.com/docs/en/overview) instalado y configurado.
- Windows 10/11, WSL, macOS o Linux. Un navegador moderno (Chromium, Firefox o Safari).

## Instalación y arranque

En PowerShell (Windows):

```powershell
git clone https://github.com/andresgmg/claude-office.git
cd claude-office
npm install
npm run build
node dist/cli.js --port 3100
```

En bash (WSL, macOS o Linux) los comandos son los mismos. `npm start -- --port 3100` es
equivalente al último.

El servidor imprime una URL con un token:

```
Claude Office server running at http://127.0.0.1:3100/?token=XXXXXXXX
```

Abre esa URL en el navegador. El token no hace falta para mirar la oficina, pero sí para
instalar los hooks desde la interfaz (ver abajo). Para parar el servidor, **Ctrl+C**.

### Windows o WSL: dónde arrancar el servidor

Los hooks y los transcripts de Claude Code viven en la máquina donde corre Claude Code. Si
usas Claude Code dentro de WSL, arranca el servidor también en WSL y abre la URL desde el
navegador de Windows (WSL2 reenvía `localhost`). Si usas Claude Code en PowerShell, arranca el
servidor en PowerShell. Mezclar los dos lados hace que el servidor no encuentre `~/.claude`.

### Qué sesiones se ven

Por defecto la oficina muestra las sesiones de Claude Code cuyo directorio de trabajo es la
carpeta desde la que arrancaste el servidor. Para ver todas las sesiones de la máquina,
activa **Settings → Watch All Sessions**. Es lo recomendable para una oficina global.

## Conectar Claude Code

Hay tres caminos. En local usa el primero; el segundo es la base de la fase 2.

### 1. Hooks instalados desde la interfaz (recomendado en local)

La primera vez que abres la URL con token, un personaje te presenta la oficina y pide permiso
para instalar los hooks. **Install Hooks** añade entradas a `~/.claude/settings.json` que
ejecutan `~/.claude-office/hooks/claude-office-hook.js` en cada evento. Antes de la primera
escritura se guarda una copia única del archivo (`settings.json.claude-office.backup`) y
nunca se reescribe nada que no haya escrito Claude Office.

El script descubre todos los servidores activos registrados en `~/.claude-office/servers/` y
les envía cada evento autenticado. Puedes activar o desactivar los hooks en cualquier momento
en **Settings → Instant Detection (Hooks)**; la casilla refleja el estado real del archivo.

### 2. Hooks `http` nativos con token fijo

Claude Code puede enviar el JSON de cada hook directamente a
`POST /api/hooks/claude` con `Authorization: Bearer <token>`. Para ello el servidor debe
arrancar con un token fijo (`--token` o la variable `CLAUDE_OFFICE_TOKEN`). El snippet
completo de `settings.json`, la verificación con `curl` y las notas de seguridad están en
[docs/remote-hooks.md](docs/remote-hooks.md).

No combines el script local y los hooks `http` en la misma máquina: cada evento llegaría dos
veces.

### 3. Sin hooks (modo heurístico)

Si los hooks están desactivados, el servidor infiere el estado leyendo los transcripts de
`~/.claude/projects/`. Funciona, pero es más lento y menos preciso que los hooks.

## Opciones del CLI

| Opción                | Descripción                                                                                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port, -p <número>` | Puerto de escucha. Sin él, el sistema asigna uno libre.                                                                                                                                              |
| `--host <dirección>`  | Dirección de enlace. Por defecto `127.0.0.1`.                                                                                                                                                        |
| `--token <cadena>`    | Token fijo para los hooks y las acciones privilegiadas de la UI (mínimo 16 caracteres, sin espacios). Por defecto se genera uno aleatorio en cada arranque; también se lee de `CLAUDE_OFFICE_TOKEN`. |
| `--help`              | Muestra la ayuda.                                                                                                                                                                                    |

Si ya hay un servidor web corriendo, un segundo arranque lo reutiliza en lugar de abrir otro
puerto.

## Seguridad

- El token es una credencial al portador: quien lo tenga puede inyectar eventos y aprobar la
  instalación de hooks. No pegues la URL con `?token=` en canales compartidos; también queda
  en el historial del navegador.
- El servidor escucha solo en `127.0.0.1`. `--host 0.0.0.0` lo expone a la red local y solo
  tiene sentido en una red de confianza; en la fase 2 irá detrás de un proxy con TLS.
- Claude Office no modifica Claude Code. Solo añade sus entradas de hooks a
  `~/.claude/settings.json` con tu consentimiento, y las quita al desactivarlas.

## Archivos que crea

```
~/.claude-office/
  config.json                 ajustes, consentimiento de hooks, directorios de assets externos
  standalone-state.json       agentes conocidos y sus asientos
  layout.json                 diseño de la oficina
  server.json                 servidor activo: puerto, PID y token
  servers/                    registro de servidores activos (uno por proceso)
  hooks/claude-office-hook.js script de hooks instalado
~/.claude/settings.json       entradas de hooks (solo si las instalas)
```

En Windows nativo `~` es `%USERPROFILE%`; en WSL es `/home/<usuario>`.

## Personalizar la oficina

Pulsa **Layout** para editar: pintar suelos y paredes con controles de color, colocar, rotar
y recolorear muebles, pintar alfombras, crear **áreas** con nombre y asignarles carpetas de
proyecto, añadir mascotas, deshacer y rehacer, y exportar o importar el diseño completo como
JSON. La cuadrícula crece hasta 64×64 pulsando el borde fantasma exterior.

Los assets incluidos viven en `webview-ui/public/assets/`. Para cargar muebles, personajes o
mascotas propios usa **Settings → Add Asset Directory** y lee
[docs/external-assets.md](docs/external-assets.md). El editor visual
`scripts/asset-manager.html` ayuda a crear los manifiestos.

## Desarrollo

```bash
npm run watch              # esbuild + tsc en modo watch (el webview se compila con npm run build)
npm run dev -w webview-ui  # oficina simulada con Vite, sin servidor
npm run check-types
npm run lint
npm test                   # tests del webview, del servidor y del contrato del paquete
npm run e2e                # Playwright contra el servidor real (requiere npm run build)
```

Documentación técnica, en inglés para seguir alineada con el código y con el upstream:

- [CLAUDE.md](CLAUDE.md): referencia de arquitectura, protocolo, runtime y decisiones.
- [CONTEXT.md](CONTEXT.md): glosario canónico (Agent, Sub-agent, Teammate, Lead, Adopt...).
- [CONTRIBUTING.md](CONTRIBUTING.md): flujo de trabajo, comprobaciones y convenciones.
- [e2e/README.md](e2e/README.md): inventario y reglas de la suite end-to-end.
- [docs/](docs/): plan, hooks remotos, assets externos y registros de decisiones.

## Solución de problemas

- **PowerShell no ejecuta `npm`** («running scripts is disabled on this system»): ejecuta
  `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` una vez, o usa `npm.cmd`.
- **El puerto está ocupado:** omite `--port` para que el sistema elija uno libre, o cambia el
  número.
- **No aparece un agente:** comprueba que **Instant Detection (Hooks)** está activo y que la
  sesión pertenece a la carpeta desde la que arrancaste, o activa **Watch All Sessions**. Si
  Claude Code corre en WSL y el servidor en Windows (o al revés), no se verán.
- **Los eventos llegan dos veces:** tienes a la vez el script local y hooks `http` para la
  misma máquina. Deja solo uno.
- **La interfaz parece desconectada:** abre **Settings → Debug View** para ver la conexión, la
  ruta del transcript y los últimos datos del agente.
- **Al hacer `git commit` aparece un aviso de gitleaks:** el escaneo de secretos es opcional;
  el aviso indica que no está instalado y el commit continúa.

## Créditos y licencia

Claude Office es un fork de [pixel-agents](https://github.com/pixel-agents-hq/pixel-agents),
creado por [Pablo De Lucca](https://github.com/pablodelucca) y sus colaboradores. El
historial de commits del upstream se conserva íntegro para poder seguir incorporando sus
mejoras. Los personajes proceden del pack CC0 MetroCity de JIK-A-4; el resto de assets
incluidos son de código abierto y provienen del upstream.

Código bajo [licencia MIT](LICENSE).
