# Agentes propios con el Claude Agent SDK

Los agentes que escribes con el [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview)
aparecen en la oficina igual que una sesión de Claude Code: cada sesión del SDK es un personaje
con su actividad, sus subagentes y su panel de detalle. Hay dos formas de conectarlos, según dónde
corra tu programa.

## 1. En la misma máquina que la oficina: no hay nada que hacer

El SDK carga `~/.claude/settings.json` por defecto (`settingSources` en TypeScript,
`setting_sources` en Python, sin especificar). Si instalaste los hooks desde la interfaz de la
oficina, esas entradas ya ejecutan `claude-office-hook.js` en cada evento de tus sesiones del
SDK, y el script descubre todos los servidores activos.

Comprueba solo dos cosas:

- No pases `settingSources: []` ni `setting_sources=[]`: eso desactiva todos los hooks del archivo.
- No registres además el reenviador de abajo en esa misma máquina: cada evento llegaría dos veces.

Las sesiones del SDK escriben su transcript en `~/.claude/projects/` como la CLI, así que el
panel de detalle muestra también su último mensaje. Si desactivas la persistencia
(`persistSession: false` en TypeScript, `CLAUDE_CODE_SKIP_PROMPT_HISTORY` en Python), el
personaje sigue apareciendo, pero sin mensajes ni medidor de contexto.

## 2. En otra máquina, o en la nube: el reenviador

Cuando el programa corre donde no está la oficina, registra los hooks del SDK con un pequeño
reenviador que hace `POST` de cada evento a `/api/hooks/claude` con el token fijo del servidor.
Es el mismo JSON que Claude Code entrega a sus hooks, así que el servidor no necesita nada nuevo.

Arranca la oficina con un token fijo (ver [docs/remote-hooks.md](../../docs/remote-hooks.md)) y
expórtalo en la máquina del agente:

```bash
export CLAUDE_OFFICE_URL="http://127.0.0.1:3100"      # o https://oficina.tu-dominio en la fase 2
export CLAUDE_OFFICE_TOKEN="el-mismo-token-del-servidor"
```

### TypeScript

Copia [`typescript/claude-office-hooks.ts`](typescript/claude-office-hooks.ts) a tu proyecto y
pásalo como `hooks`:

```ts
import { query } from '@anthropic-ai/claude-agent-sdk';
import { claudeOfficeHooks } from './claude-office-hooks.js';

for await (const message of query({
  prompt: 'Run the tests and fix what fails',
  options: { hooks: claudeOfficeHooks() },
})) {
  // ...
}
```

`claudeOfficeHooks()` registra los doce eventos que instala la oficina. Si ya tienes hooks
propios, combina los dos objetos. Para avisar a la oficina cuando el programa muere sin un
`SessionEnd` natural, usa `createClaudeOfficeForwarder()` y llama a `close()` al salir; el
ejemplo completo está en [`typescript/example.ts`](typescript/example.ts).

### Python

Copia [`python/claude_office_hooks.py`](python/claude_office_hooks.py) junto a tu programa:

```python
from claude_agent_sdk import ClaudeAgentOptions, query
from claude_office_hooks import ClaudeOfficeForwarder

async with ClaudeOfficeForwarder() as office:
    async for message in query(
        prompt="Run the tests and fix what fails",
        options=ClaudeAgentOptions(hooks=office.hooks()),
    ):
        ...
```

El SDK de Python no ofrece `SessionStart` ni `SessionEnd` como callbacks. El reenviador los
sintetiza: envía un `SessionStart` antes del primer evento de cada sesión y un `SessionEnd` por
cada sesión abierta al salir del `async with`. Tampoco existen `TeammateIdle` ni `TaskCompleted`;
los compañeros de equipo se siguen viendo por sus propios eventos. Ejemplo completo en
[`python/example.py`](python/example.py).

### Qué envía el reenviador

Solo los campos que lee el servidor: nombre del evento, sesión, `cwd`, `transcript_path`,
herramienta y su entrada, tipo de notificación, identidad del subagente o compañero. Las
respuestas de las herramientas y los mensajes se descartan, y las cadenas largas de la entrada se
recortan a 2000 caracteres, porque el servidor limita cada evento a 64 KB. Una oficina apagada o
lenta nunca bloquea al agente: cada envío tiene un tiempo máximo de 1,5 segundos y los fallos
solo se registran en la consola.

## Sesiones de Claude Code en la nube

Las sesiones cloud no usan el SDK: se conectan con hooks `http` nativos en el
`.claude/settings.json` del repositorio, apuntando al subdominio de la fase 2. Está descrito en
[docs/remote-hooks.md](../../docs/remote-hooks.md) y en [docs/PLAN.md](../../docs/PLAN.md).
