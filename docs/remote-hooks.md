# Hooks remotos de Claude Code (`type: "http"`) con token fijo

El servidor acepta en `POST /api/hooks/claude` el JSON crudo que Claude Code entrega a
sus hooks, autenticado con `Authorization: Bearer <token>`. Por defecto el token cambia en
cada arranque (se imprime en la URL y se guarda en `~/.pixel-agents/server.json`), lo que
obliga a usar el script local `claude-hook.js`, que lo descubre en cada evento.

Con un token fijo se puede configurar un hook `http` nativo de Claude Code una sola vez.
Es la base para recibir eventos desde otras máquinas y desde sesiones cloud en la fase 2,
y funciona igual en local.

## 1. Arrancar el servidor con un token fijo

El token debe tener al menos 16 caracteres y no contener espacios. La variable de entorno
`PIXEL_AGENTS_TOKEN` lo fija sin que aparezca en la lista de procesos; el flag `--token`
tiene prioridad sobre ella.

```powershell
# PowerShell (Windows)
$env:PIXEL_AGENTS_TOKEN = "cambia-esto-por-un-token-largo-y-aleatorio"
node dist/cli.js --port 3100
```

```bash
# bash / WSL / macOS / Linux
PIXEL_AGENTS_TOKEN="cambia-esto-por-un-token-largo-y-aleatorio" node dist/cli.js --port 3100
# equivalente:
node dist/cli.js --port 3100 --token "cambia-esto-por-un-token-largo-y-aleatorio"
```

Si ya hay un servidor web corriendo, el nuevo proceso lo reutiliza y conserva el token con
el que arrancó (se avisa en consola).

## 2. Configurar Claude Code

Añade esto a `~/.claude/settings.json` (o a `.claude/settings.json` de un proyecto). Son los
mismos 12 eventos que instala el script local. Claude Code sustituye `$PIXEL_AGENTS_TOKEN`
en la cabecera porque la variable está en `allowedEnvVars`; debe existir en el entorno donde
corre Claude Code, no solo en el del servidor.

```json
{
  "hooks": {
    "SessionStart":       [{ "matcher": "*", "hooks": [{ "type": "http", "url": "http://127.0.0.1:3100/api/hooks/claude", "headers": { "Authorization": "Bearer $PIXEL_AGENTS_TOKEN" }, "allowedEnvVars": ["PIXEL_AGENTS_TOKEN"], "timeout": 5 }] }],
    "SessionEnd":         [{ "matcher": "*", "hooks": [{ "type": "http", "url": "http://127.0.0.1:3100/api/hooks/claude", "headers": { "Authorization": "Bearer $PIXEL_AGENTS_TOKEN" }, "allowedEnvVars": ["PIXEL_AGENTS_TOKEN"], "timeout": 5 }] }],
    "Stop":               [{ "matcher": "*", "hooks": [{ "type": "http", "url": "http://127.0.0.1:3100/api/hooks/claude", "headers": { "Authorization": "Bearer $PIXEL_AGENTS_TOKEN" }, "allowedEnvVars": ["PIXEL_AGENTS_TOKEN"], "timeout": 5 }] }],
    "PermissionRequest":  [{ "matcher": "*", "hooks": [{ "type": "http", "url": "http://127.0.0.1:3100/api/hooks/claude", "headers": { "Authorization": "Bearer $PIXEL_AGENTS_TOKEN" }, "allowedEnvVars": ["PIXEL_AGENTS_TOKEN"], "timeout": 5 }] }],
    "Notification":       [{ "matcher": "*", "hooks": [{ "type": "http", "url": "http://127.0.0.1:3100/api/hooks/claude", "headers": { "Authorization": "Bearer $PIXEL_AGENTS_TOKEN" }, "allowedEnvVars": ["PIXEL_AGENTS_TOKEN"], "timeout": 5 }] }],
    "PreToolUse":         [{ "matcher": "*", "hooks": [{ "type": "http", "url": "http://127.0.0.1:3100/api/hooks/claude", "headers": { "Authorization": "Bearer $PIXEL_AGENTS_TOKEN" }, "allowedEnvVars": ["PIXEL_AGENTS_TOKEN"], "timeout": 5 }] }],
    "PostToolUse":        [{ "matcher": "*", "hooks": [{ "type": "http", "url": "http://127.0.0.1:3100/api/hooks/claude", "headers": { "Authorization": "Bearer $PIXEL_AGENTS_TOKEN" }, "allowedEnvVars": ["PIXEL_AGENTS_TOKEN"], "timeout": 5 }] }],
    "PostToolUseFailure": [{ "matcher": "*", "hooks": [{ "type": "http", "url": "http://127.0.0.1:3100/api/hooks/claude", "headers": { "Authorization": "Bearer $PIXEL_AGENTS_TOKEN" }, "allowedEnvVars": ["PIXEL_AGENTS_TOKEN"], "timeout": 5 }] }],
    "SubagentStart":      [{ "matcher": "*", "hooks": [{ "type": "http", "url": "http://127.0.0.1:3100/api/hooks/claude", "headers": { "Authorization": "Bearer $PIXEL_AGENTS_TOKEN" }, "allowedEnvVars": ["PIXEL_AGENTS_TOKEN"], "timeout": 5 }] }],
    "SubagentStop":       [{ "matcher": "*", "hooks": [{ "type": "http", "url": "http://127.0.0.1:3100/api/hooks/claude", "headers": { "Authorization": "Bearer $PIXEL_AGENTS_TOKEN" }, "allowedEnvVars": ["PIXEL_AGENTS_TOKEN"], "timeout": 5 }] }],
    "TeammateIdle":       [{ "matcher": "*", "hooks": [{ "type": "http", "url": "http://127.0.0.1:3100/api/hooks/claude", "headers": { "Authorization": "Bearer $PIXEL_AGENTS_TOKEN" }, "allowedEnvVars": ["PIXEL_AGENTS_TOKEN"], "timeout": 5 }] }],
    "TaskCompleted":      [{ "matcher": "*", "hooks": [{ "type": "http", "url": "http://127.0.0.1:3100/api/hooks/claude", "headers": { "Authorization": "Bearer $PIXEL_AGENTS_TOKEN" }, "allowedEnvVars": ["PIXEL_AGENTS_TOKEN"], "timeout": 5 }] }]
  }
}
```

Para una máquina remota o el futuro subdominio, cambia la URL por
`https://oficina.tu-dominio/api/hooks/claude`. Una respuesta no-2xx del servidor es un error
no bloqueante para Claude Code: si la oficina está apagada, el agente sigue trabajando.

No uses a la vez el script local (`Instant Detection (Hooks)` en la UI) y los hooks `http`
para la misma máquina: el servidor recibiría cada evento dos veces.

## 3. Verificar

```bash
# Sin token: 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "content-type: application/json" \
  -d '{"hook_event_name":"SessionStart","session_id":"prueba"}' http://127.0.0.1:3100/api/hooks/claude

# Con token: 200 y cuerpo "ok"
curl -s -w " %{http_code}\n" -X POST -H "content-type: application/json" \
  -H "Authorization: Bearer $PIXEL_AGENTS_TOKEN" \
  -d '{"hook_event_name":"SessionStart","session_id":"prueba"}' http://127.0.0.1:3100/api/hooks/claude
```

Después, abre una sesión de Claude Code en cualquier carpeta: el personaje aparece en la
oficina en cuanto llega el primer evento.

## Seguridad

- El token es una credencial al portador: quien lo tenga puede inyectar eventos y aprobar la
  instalación de hooks desde la UI. Genera uno aleatorio y largo.
- No expongas el servidor con `--host 0.0.0.0` sin TLS delante. En la fase 2 el proxy
  (Caddy, Cloudflare) termina HTTPS y el token viaja cifrado.
- Para sesiones cloud de Claude Code, además, el dominio debe estar permitido en la política
  de red del entorno (Network access → Allowed domains).
