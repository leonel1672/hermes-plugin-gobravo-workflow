# Gobravo Workflow — Plugin de Hermes Desktop

Vistazo rápido a tu flujo de trabajo en el [Hub de Gobravo](https://hub.gobravo.io) sin salir de Hermes Desktop: tus métricas, PRs pendientes, tasks, tracks y (si eres líder) el desempeño de tu equipo.

## ✨ Qué hace

Un pill en la barra de estado (con el logo de Bravo) abre un panel con pestañas:

| Pestaña | Qué muestra |
|---|---|
| **Overview** | Tu perfil (avatar real, nombre, área, **puesto**), conteo de tracks/tasks/projects, métricas de aprobación. Solo tus datos (`my_*`) |
| **Equipo** *(solo líderes)* | Dashboard del squad donde eres líder: completados, on-time, velocity, WIP, overdue, lead/cycle time, on-time por tipo y lista de miembros con avatares. Con sub-tabs si lideras varios equipos |
| **PRs** | PRs de la org que esperan tu review (`review-requested:@me`) y PRs propios, con botones compactos de aprobar/review y detalle inline |
| **Tasks** | Tasks activas de los squads seleccionados, con buscador, detalle inline y configuración del modelo de IA por estado |
| **Tracks** | Tus tracks agrupados por estado (backlog → shaping → todo → in_progress → in_review), secciones colapsables y transiciones directas |
| **Config** | Tokens (Hub, GitHub, Token Gate) y webhook de ayuda |

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
├── format-helpers.js  # fmt, pct, timeAgo...
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
| **Token Gate** *(opcional)* | Usar el modelo por estado en el tab de Tasks |
| **Webhook** *(opcional)* | Botón de ayuda que abre/notifica tu webhook de Google Chat |

## 🔧 Instalación

```bash
mkdir -p ~/.hermes/desktop-plugins/gobravo-workflow
cp -r . ~/.hermes/desktop-plugins/gobravo-workflow/
```

Luego en la app de escritorio: **⌘K → Reload desktop plugins**.
