# Gobravo Workflow — Plugin de Hermes Desktop

Vistazo rápido a tu flujo de trabajo en el [Hub de Gobravo](https://hub.gobravo.io) sin salir de Hermes Desktop: tus métricas, PRs pendientes, tasks, tracks y (si eres líder) el desempeño de tu equipo.

## ✨ Qué hace

Un pill en la barra de estado (con el logo de Bravo) abre un panel con pestañas:

| Pestaña | Qué muestra |
|---|---|
| **Overview** | Tu perfil (avatar real, nombre, área, **puesto**), conteo de tracks/tasks/projects, métricas de aprobación. Solo tus datos (`my_*`) |
| **Equipo** *(solo líderes)* | Dashboard del squad donde eres líder: completados, on-time, velocity, WIP, overdue, lead/cycle time, on-time por tipo y lista de miembros con avatares. Con sub-tabs si lideras varios equipos |
| **PRs** | PRs de la org que esperan tu review (`review-requested:@me`) y PRs propios, con botones compactos de aprobar/review y detalle inline |
| **Tasks** | Tasks activas de los squads seleccionados, con buscador, detalle inline y diagnóstico IA (`✳`) |
| **Tracks** | Tus tracks agrupados por estado (backlog → shaping → todo → in_progress → in_review), secciones colapsables y transiciones directas con botones de acción |
| **Config** | Tokens (Hub, GitHub), webhook, prompts de transiciones, reglas de revisión de PRs |

## 🎬 Transiciones de track (botones de acción)

Cada track tiene un **botón de acción** a la izquierda con un ícono Heroicons monocromático, del mismo color que el status pill:

| Estado | Acción | Ícono | Qué dispara |
|---|---|---|---|
| backlog | **Validar** | 📄 | Análisis de alto nivel para pasar a shaping |
| shaping | **Definir** | ✏️ | Análisis técnico profundo + creación de tasks |
| todo | **Ejecutar** | ➡️ | Puesta en marcha de la definición |
| in_progress | **Entregar** | ↗️ | Cierre y paso a revisión |

Las reglas, modelos y URLs de referencia de cada transición se configuran en **Config → Tracks**.

## 🔍 Revisión de PRs (desde el chat)

El botón **Review** del tab PRs envía un prompt al chat activo de Hermes con reglas configurables:

- Comentarios **inline** (archivo:línea), no resumen global
- El modelo muestra los hallazgos, **el usuario confirma uno por uno** antes de publicar
- Approve solo con autorización explícita
- URLs de referencia editables en **Config → PRs**

## 📐 Panel resize

El panel tiene **560px de ancho mínimo** y se puede agrandar arrastrando la esquina inferior derecha con el mouse.

## 🔗 URLs auto-link

Las URLs en las descripciones de tracks/tasks se convierten automáticamente en links clickeables con saltos de línea para destacarlas.

## 👥 Tab Equipo (condicional por rol)

El tab **Equipo solo aparece si tienes equipos a cargo** (eres `leader_id` de un team/squad en el Hub):

- **Ingeniero** (sin equipo) → no ves el tab ni te enteras de que existe
- **Líder de 1 equipo** → ves el dashboard de ese equipo
- **Líder multi-equipo** → sub-tabs, uno por cada squad, con su dashboard y miembros

Los datos vienen de los MCP de Hub (`teams_list`, `squads_list`, `squads_get`, `stats_dashboard`) — todo read-only y en tiempo real.

## 🧩 Arquitectura modular

El plugin se construye con `build.js`, que concatena los módulos de `lib/` en `plugin.js`:

```
lib/
├── constants.js       # imports + constantes globales
├── icons.js           # iconos SVG (Heroicons solid)
├── helpers.js         # mcpCall, loadStr/saveStr, etc.
├── format-helpers.js  # fmt, pct, timeAgo, mdToHtml, STATUS_COLORS
├── md-prompt.js       # templates de prompts
├── prs-tab.js         # pestaña PRs
├── stats-tab.js       # pestaña Overview (avatar + puesto)
├── teamStats.js       # datos MCP: rol, equipos, dashboards, avatar
├── TeamTab.js         # componente tab Equipo (líderes)
├── tickets-tab.js     # pestaña Tasks
├── status-tab.js      # pestaña Tracks + App/TABS/Dropdown (shell)
├── config-tab.js      # pestaña Config
└── tab-shell.js       # placeholder
```

Después de editar cualquier módulo, regenerar el bundle:

```bash
node build.js
```

## 📦 Requisitos

- [Hermes Desktop](https://hermes-agent.nousresearch.com) instalado
- Tokens con permisos para:

| Token | Para qué se usa |
|---|---|
| **Hub (Gobravo)** | Leer tracks/tasks/projects, tus métricas, equipos y stats del squad desde `hub.gobravo.io` |
| **GitHub** | Buscar PRs, comentarios de review y aprobar vía API de GitHub |
| **Webhook** *(opcional)* | Botón de ayuda que abre/notifica tu webhook de Google Chat |

> **Nota sobre modelos**: en el tab **Tasks**, las transiciones de estado pueden cambiar el modelo de la sesión de Hermes (via `config.set model ... --provider <provider>`). El provider se selecciona en Config (tokengate / deepseek) y es el **provider de Hermes ya configurado**, no una API key aparte del plugin.

## 🔧 Instalación

```bash
mkdir -p ~/.hermes/desktop-plugins/gobravo-workflow
cp -r . ~/.hermes/desktop-plugins/gobravo-workflow/
```

Luego en la app de escritorio: **⌘K → Reload desktop plugins**.

## ⚙️ Configuración de reglas

### Transiciones de tracks (Config → Tracks)

4 cards colapsables con: provider, modelo, reglas (prompt) y URLs de referencia. Incluyen defaults listos para usar:

| Transición | Default | Rol |
|---|---|---|
| backlog → shaping | `assistant` | PM técnico: analiza si el track está listo |
| shaping → todo | `coder` | Arquitecto Elixir: solución técnica + tasks |
| todo → in_progress | `coder` | Orquestador + subagentes: ejecución |
| in_progress → review | `auxiliar` | Cierre: PR draft, webhook |

### Revisión de PRs (Config → PRs)

Provider, modelo, prompt editable (con `{URL}`) y URLs de referencia. Default: `coder-sr`, comentarios inline, approve autorizado.
