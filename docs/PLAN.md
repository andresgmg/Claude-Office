# Oficina virtual pixel art para agentes Claude — informe de investigación y plan

Fecha del informe: 7 de octubre de 2026. El estado de la hoja de ruta se actualiza en este
mismo archivo (✅ hecho, ⏳ pendiente).

## Resumen ejecutivo

- **Recomendación (adoptada):** hacer un fork de [pixel-agents-hq/pixel-agents](https://github.com/pixel-agents-hq/pixel-agents)
  (9.5k estrellas, MIT, TypeScript, pixel art top-down con personajes CC0), quitar la
  extensión de VS Code y todo lo que solo existía por ella, y quedarnos con su modo web,
  renombrado a `claude-office`.
- Es el único candidato que, a la vez, está pensado 100% para Claude Code, usa hooks de
  Claude Code como fuente principal de datos, modela subagentes y equipos, y tiene una
  estética muy cercana a Pokémon.
- La fase 1 corre en tu Windows (nativo o WSL). La fase 2 lleva el mismo servidor a un
  subdominio en Docker, donde también aparecerán tus sesiones de Claude Code en la web
  (cloud) y tus agentes con el Agent SDK, gracias a los hooks de tipo `http` de Claude Code.
- La terminal embebida de pixel-agents existe solo en VS Code; la terminal web se
  construye en la fase 2 (xterm.js + node-pty).

## Contexto

Quieres una "oficina virtual" web, minimalista, 2D y con estética pixel art tipo Pokémon
(vista top-down), donde cada agente Claude aparezca como un personaje que muestra en qué
está trabajando. Fase 1: correr en tu máquina local. Fase 2: desplegar en un subdominio
para verlo desde cualquier lugar, incluidas las sesiones de Claude Code en la web (cloud)
y tus agentes propios con el Agent SDK.

## Decisiones tomadas

| Tema                 | Decisión                                                                                                                                                                                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agentes a mostrar    | Claude Code local (terminal/IDE), Claude Code en la web (cloud) y agentes propios con Agent SDK. Sin otros CLIs: 100% Claude.                                                                                                                                                                      |
| Base                 | Fork de `pixel-agents-hq/pixel-agents`.                                                                                                                                                                                                                                                            |
| Dónde vive el código | Repositorio privado `andresgmg/Claude-Office`, con el historial completo de pixel-agents v1.4.1 para poder hacer `git merge upstream/main`.                                                                                                                                                        |
| v1 debe mostrar      | Actividad en vivo, subagentes y equipos, proyecto/rama/contexto, clic para ver detalle.                                                                                                                                                                                                            |
| Sesiones cloud       | Local primero. El servidor nace preparado para hooks remotos con token; las sesiones cloud aparecen en la fase 2.                                                                                                                                                                                  |
| Hosting fase 2       | Por decidir. El plan usa Docker genérico.                                                                                                                                                                                                                                                          |
| Sistema operativo    | Windows (nativo o WSL).                                                                                                                                                                                                                                                                            |
| Minimalismo          | Limpieza profunda: se elimina la extensión de VS Code y todo lo que solo existía por ella (adopción de terminales, mensajes del protocolo exclusivos del IDE, migración de estado, empaquetado VSIX, CI, plantillas de GitHub, Vercel). La terminal web se añade en la fase 2; la v1 solo observa. |
| Tests e2e de VS Code | Eliminados (81 tests). Quedan los 10 del servidor web.                                                                                                                                                                                                                                             |
| Nombre               | Renombrar todo: paquete y comando `claude-office`, directorio de estado `~/.claude-office/`, script `claude-office-hook.js`, variables `CLAUDE_OFFICE_*`. Sin compatibilidad con los nombres antiguos.                                                                                             |
| CI                   | Sin CI por ahora. Las comprobaciones (`npm run build`, `npm test`, `npm run e2e`) se ejecutan en local antes de subir.                                                                                                                                                                             |

## Cómo obtiene datos un proyecto así (verificado en la documentación oficial)

**Hooks de Claude Code.** Cada evento envía un JSON con `session_id`, `cwd`,
`transcript_path`, `permission_mode` y, dentro de subagentes, `agent_id` y `agent_type`.
Eventos útiles: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`,
`PermissionRequest`, `Notification`, `SubagentStart`, `SubagentStop`, `TaskCreated`,
`TaskCompleted`, `TeammateIdle`, `Stop`, `SessionEnd`.

**Hook tipo `http`.** Claude Code puede hacer POST del JSON directamente a una URL con
cabeceras (por ejemplo `Authorization: Bearer $OFFICE_TOKEN`, con `allowedEnvVars`). Una
respuesta no-2xx es un error no bloqueante, así que si la oficina está apagada tus agentes
siguen trabajando. Esto hace innecesario un proceso intermedio en la fase 2.

Ejemplo de configuración (fase 2) en `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "http",
            "url": "https://oficina.tu-dominio.com/api/hooks/claude",
            "headers": { "Authorization": "Bearer $CLAUDE_OFFICE_TOKEN" },
            "allowedEnvVars": ["CLAUDE_OFFICE_TOKEN"],
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

(Se repite el mismo bloque para el resto de eventos de la lista.) El snippet completo para
los 12 eventos que instala el servidor, la verificación con `curl` y las notas de seguridad
están en [docs/remote-hooks.md](remote-hooks.md); en local funciona igual con
`http://127.0.0.1:3100`.

**Agent SDK.** TypeScript y Python registran callbacks en `options.hooks` para
`PreToolUse`, `PostToolUse`, `PermissionRequest`, `Notification`, `SubagentStart`,
`SubagentStop` y `Stop`. `SessionStart`/`SessionEnd` solo existen como callback en
TypeScript; en Python llegan igualmente si el SDK carga los hooks de `settings.json`
(`setting_sources`), incluidos los de tipo `http`.

**Sesiones cloud.** Los hooks se ejecutan dentro del contenedor, por lo que solo pueden
alcanzar una URL pública. Además, la política de red del entorno cloud debe permitir ese
host (Network access → Allowed domains):
https://code.claude.com/docs/en/cloud-environments#network-access

**Fallback.** Leer los transcripts JSONL en `~/.claude/projects/` (solo en la misma
máquina y el mismo sistema de archivos que Claude Code).

## Candidatos evaluados en GitHub

| Repo                                                                                                 | ★    | Lic. | Stack                                                          | Datos de Claude                                              | Estilo                                                                                        | Web sin IDE                     | Deploy remoto                     | Veredicto                                         |
| ---------------------------------------------------------------------------------------------------- | ---- | ---- | -------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------- | ------------------------------------------------- |
| [pixel-agents-hq/pixel-agents](https://github.com/pixel-agents-hq/pixel-agents) (antes pablodelucca) | 9.5k | MIT  | TypeScript; React 19 + Vite + Canvas 2D; Fastify 5 + WebSocket | Hooks (POST `/api/hooks/:providerId`) + fallback transcripts | Top-down; personajes MetroCity (CC0); muebles/suelos incluidos en `webview-ui/public/assets/` | Sí: `npx pixel-agents` (v1.4.1) | No (bind 127.0.0.1, token en URL) | **Base recomendada**                              |
| [paulrobello/claude-office](https://github.com/paulrobello/claude-office)                            | 550  | MIT  | FastAPI (Python 3.13) + Next.js + PixiJS                       | Hooks Python + Event API                                     | Top-down                                                                                      | Sí                              | Sí (Docker)                       | Completo pero pesado: dos runtimes                |
| [KbWen/agent-virtual-office](https://github.com/KbWen/agent-virtual-office)                          | 36   | MIT  | React 19 + Vite + SVG                                          | Hooks + API HTTP                                             | Top-down en SVG dibujado a mano                                                               | Sí                              | Sí (Nginx/PM2/TLS, token)         | Ligero; menos "pixel art real"; comunidad pequeña |
| [rolandal/pixel-agents-standalone](https://github.com/rolandal/pixel-agents-standalone)              | 55   | MIT  | Express + WS + React/Canvas                                    | Solo transcripts                                             | Top-down                                                                                      | Sí                              | No                                | Superado: el upstream ya tiene modo web           |
| [W17ant/Claude-Office](https://github.com/W17ant/Claude-Office)                                      | 197  | MIT  | Express + WS + React, SQLite                                   | Hooks bash → curl                                            | Isométrico                                                                                    | Sí                              | No                                | Descartado: isométrico                            |
| [deadronos/claude-ville](https://github.com/deadronos/claude-ville)                                  | —    | MIT  | Node + React + Three.js                                        | Transcripts                                                  | Isométrico 3D                                                                                 | Sí                              | Sí                                | Descartado: no es 2D plano                        |
| [ivanwng97/pixtuoid](https://github.com/ivanwng97/pixtuoid)                                          | 486  | MIT  | Rust / Ratatui                                                 | Hooks + transcripts                                          | Pixel en terminal                                                                             | Parcial                         | No                                | Descartado: es TUI                                |
| [itsArnavPrasad/pixel-office](https://github.com/itsArnavPrasad/pixel-office)                        | 1    | —    | Mod de Claude Code + VS Code                                   | Mod interno                                                  | Pixel                                                                                         | No                              | No                                | Descartado: sin web                               |
| [ddx-510/opencode-pixel-office](https://github.com/ddx-510/opencode-pixel-office)                    | 10   | —    | Express + WS + React + PixiJS                                  | Hooks                                                        | Top-down (tileset DonArg)                                                                     | Sí                              | LAN/QR                            | Muy pequeño; licencia sin especificar             |
| [kevinshen56714/SkyOffice](https://github.com/kevinshen56714/SkyOffice)                              | 1.3k | MIT  | Phaser 3 + React + Colyseus                                    | Ninguno (oficina para humanos)                               | Top-down (assets LimeZu de pago)                                                              | Sí                              | Sí                                | Solo referencia                                   |
| [phaserjs/template-vite-ts](https://github.com/phaserjs/template-vite-ts)                            | 195  | MIT  | Phaser 4 + Vite + TS                                           | Ninguno                                                      | —                                                                                             | Sí                              | Estático                          | Base si algún día se rehace desde cero            |

Vistos y descartados: WorkAdventure (oficina para humanos, infraestructura enorme) y los
dashboards sin pixel art (claude-view, agents-observe,
claude-code-hooks-multi-agent-observability), útiles solo como referencia de la
arquitectura hooks → servidor → WebSocket.

## Por qué pixel-agents

- Es 100% Claude Code hoy; otros agentes están solo en su roadmap. Modela subagentes,
  teammates y equipos implícitos de Claude 5, permisos pendientes y uso de contexto.
- Capas limpias: `core/` (protocolo AsyncAPI), `server/` (Fastify, runtime, CLI),
  `webview-ui/` (React + Canvas), `adapters/vscode/` (solo VS Code). El CLI web nunca
  importa `adapters/vscode/`, así que se puede borrar VS Code sin romper nada.
- Estética top-down pixel art muy cercana a Pokémon; personajes CC0 y assets incluidos.
- MIT y comunidad grande: las mejoras del upstream se traen con `git merge`.
- Windows está en su matriz de pruebas e2e (Linux/macOS/Windows) y el changelog 1.4.x
  incluye arreglos específicos de Windows.

**Hallazgo importante sobre la terminal.** La terminal embebida de pixel-agents existe
solo en la extensión de VS Code. El modo web actual únicamente observa: el README dice
"Standalone does not launch Claude for you; start Claude Code in a terminal". No hay
`node-pty` ni `xterm` en ningún `package.json`. Por eso la terminal web se construye en la
fase 2 (xterm.js + node-pty).

**Lo que falta para la fase 2.** Aceptar hooks `http` remotos con Bearer token (el
endpoint ya existe para el script local), TLS/proxy inverso, un acceso para el visor y la
terminal web.

## Arquitectura objetivo

```
FASE 1 (local, Windows)
  Claude Code (terminal / IDE) ──hook script o hook http──┐
  Agentes Agent SDK (tu código) ──callback → POST ────────┤
  Fallback: ~/.claude/projects/*.jsonl ───────────────────┤
                                                          ▼
                          Servidor Fastify (127.0.0.1, token) ──WebSocket──▶ Oficina (navegador)

FASE 2 (subdominio)
  Tu PC (hooks http + Bearer) ─────┐
  Sesiones cloud (hooks http) ─────┤──HTTPS──▶ Proxy TLS ──▶ mismo servidor en Docker ──▶ visor con login
  Agentes SDK (callbacks) ─────────┘            Terminal web: solo en modo local
```

Nota Windows/WSL: los hooks y los transcripts viven donde corre Claude Code. Si Claude
Code corre en WSL, el servidor también debe correr en WSL (para leer `~/.claude` y evitar
el salto de red WSL→Windows). Lo mismo al revés.

## Hoja de ruta

### Fase 0 — Preparación

1. ✅ Clon con el historial completo de `pixel-agents-hq/pixel-agents` (v1.4.1) y remoto
   `upstream` configurado, para poder hacer `git merge upstream/main`.
2. ⏳ Crear en GitHub el repositorio privado y vacío `andresgmg/Claude-Office`, dar acceso a
   la app de Claude y subir el historial. Lo hace el dueño: la app no tiene permiso para
   crear repositorios.

### Fase 1 — v1 local (en el fork)

1. ✅ **Quitar VS Code.** Hecho con limpieza profunda: `adapters/vscode/`, el bundle
   `dist/extension.js`, el empaquetado `.vsix`, las dependencias de VS Code, los e2e de
   VS Code, la adopción de terminales, los mensajes del protocolo exclusivos del IDE, la
   migración de estado, la CI y el despliegue en Vercel. Se mantienen `core/`, `server/`,
   `webview-ui/`, `scripts/`, los hooks y el modo web. Todo renombrado a `claude-office`
   (paquete, comando, `~/.claude-office/`, `claude-office-hook.js`, `CLAUDE_OFFICE_*`).
   README, CLAUDE.md, CONTRIBUTING, CONTEXT y CHANGELOG actualizados.
2. ⏳ **Verificar en Windows** (en tu máquina). `npm install`, `npm run build`,
   `node dist/cli.js --port 3100` desde PowerShell y desde WSL. Instalar hooks desde la UI
   (Settings → Instant Detection (Hooks)) y comprobar que el instalador ("never overwrite
   user settings") convive con tu `~/.claude/settings.json`. Probar también el fallback de
   transcripts. gitleaks es opcional en el pre-commit.
3. ✅ **Ingesta remota preparada.** `/api/hooks/claude` acepta el JSON crudo de un hook
   `type: "http"` con `Authorization: Bearer <token>`. Token fijo con `--token` o
   `CLAUDE_OFFICE_TOKEN` (mínimo 16 caracteres, sin espacios); snippet completo de
   `~/.claude/settings.json` en [docs/remote-hooks.md](remote-hooks.md).
4. ⏳ **Agent SDK.** Un adaptador mínimo (TypeScript y Python) que registra los hooks del SDK
   y hace POST al servidor con el mismo payload; ejemplo en `examples/`.
5. ✅ **Funciones v1.** Actividad en vivo, subagentes/equipos y uso de contexto ya existían.
   Añadido: la etiqueta sobre el personaje muestra `carpeta · rama`; el servidor lee
   `.git/HEAD` del directorio de trabajo de la sesión (sin subprocesos, compatible con
   worktrees) y lo refresca cada 30 segundos; para sesiones remotas usa la rama que
   reporta el transcript. Panel de detalle lateral al hacer clic en un personaje:
   proyecto, rama, ruta, modelo, contexto, última herramienta con su entrada, último
   mensaje y último prompt (del transcript, solo local), sesión y transcript. Nuevo
   mensaje `agentDetails` del protocolo.
6. ✅ **Pruebas.** Tests Vitest de `server/` (28 archivos) y `webview-ui/` (10) adaptados;
   e2e de Playwright reducido a los 10 tests del servidor web; e2e de VS Code eliminado.
7. ✅ **Limpieza final.** Eliminada de extremo a extremo la función "headless as ghosts"
   (ajuste, mensaje `setGhostHeadlessAgents`, alfa del renderer y sus tests) y el resto de
   código que solo usaba la extensión (`wasReset`, `loadLayout`, constantes huérfanas).

### Fase 2 — Subdominio

1. `Dockerfile` multi-stage (Node 20) y `docker-compose.yml` con Caddy (TLS automático)
   delante del servidor. Volumen para `~/.claude-office/` (layout, estado, config).
2. Acceso del visor: login simple con contraseña o Cloudflare Access/Tailscale; eventos con
   Bearer token por origen (PC, cloud, SDK).
3. Hooks remotos: en tu PC, hooks `http` en `~/.claude/settings.json` apuntando al
   subdominio; en cada repo que uses en cloud, hooks `http` en `.claude/settings.json`
   con el token en un secreto del entorno y el subdominio en Allowed domains.
4. Terminal web: xterm.js en el navegador + node-pty en el servidor (ConPTY en Windows),
   activa solo cuando el servidor corre en la máquina donde corre Claude Code; apagada en
   el servidor hospedado.

## Riesgos y notas

- **Licencias.** Código MIT y personajes CC0. Confirmar en `docs/external-assets.md` los
  requisitos de atribución de muebles y suelos antes de publicar la versión hospedada. El
  fork de rolandal (versión antigua) exigía un tileset de 2 USD; el upstream actual los
  incluye.
- **Upstream rápido** (v1.4.1, cientos de commits). Mantener los cambios del fork pequeños
  y aislados para que `git merge upstream/main` siga siendo barato.
- **Cloud.** El panel de detalle de sesiones cloud se limita a lo que traen los hooks (no
  hay acceso a su transcript). Un hook que falla nunca bloquea al agente.
- **Seguridad.** El token es una capacidad al portador: no exponer `0.0.0.0` sin TLS ni
  token; no pegar la URL con `?token=` en canales compartidos.

## Verificación (cuando se implemente)

- **Local:** `npm test` y `npm run build` en verde; CLI arrancando en PowerShell y en WSL;
  dos sesiones de Claude Code en repos distintos, una lanzando subagentes: personajes,
  burbuja al pedir permiso, subagentes junto al padre, etiquetas de proyecto/rama/contexto
  y panel de detalle al hacer clic. Agente SDK de ejemplo visible. `curl` a
  `/api/hooks/claude` con token → 2xx, sin token → 401.
- **Fase 2:** `docker compose up` en el host; hook `http` desde tu PC por HTTPS; una
  sesión cloud con el hook configurado aparece en la oficina; el visor exige login.

## Fuentes

- https://github.com/pixel-agents-hq/pixel-agents (README, CLAUDE.md, CHANGELOG, package.json)
- https://github.com/rolandal/pixel-agents-standalone
- https://github.com/paulrobello/claude-office
- https://github.com/W17ant/Claude-Office
- https://github.com/KbWen/agent-virtual-office
- https://github.com/ivanwng97/pixtuoid
- https://github.com/deadronos/claude-ville
- https://github.com/itsArnavPrasad/pixel-office
- https://github.com/ddx-510/opencode-pixel-office
- https://github.com/kevinshen56714/SkyOffice
- https://github.com/phaserjs/template-vite-ts
- https://jik-a-4.itch.io/metrocity-free-topdown-character-pack (CC0)
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/agent-sdk/hooks
- https://code.claude.com/docs/en/cloud-environments#network-access
