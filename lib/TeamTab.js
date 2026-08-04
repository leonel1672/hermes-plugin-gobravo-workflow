/**
 * Gobravo Workflow — Tab 'Equipo' (para líderes).
 * Renderiza los equipos/squads donde el usuario es líder, con KPIs,
 * on-time por tipo, y la lista de miembros.
 *
 * Integrado por build.js como función global del bundle (sin export).
 * Usa los imports globales de constants.js (jsx, jsxs, useState, useEffect).
 *
 *   teams:     [{ id, name, kind:'team'|'squad', members:[{id,name,image,email,role}], memberCount }]
 *   dashboards:[{ id, name, kind, dashboard }]  // dashboard = resultado de stats_dashboard (puede ser null)
 *   loading:   bool
 *   error:     string|null
 *
 * Si teams está vacío, el componente NO renderiza nada visible (return null).
 */

// ── Iconos (Heroicons solid 20, monocromáticos) ────────────────────

// users (equipo)
const TT_ICON_USERS =
  'M7 8a3 3 0 100-6 3 3 0 000 6zM14.5 9a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM1.615 16.428a1.224 1.224 0 01-.569-1.175 6.002 6.002 0 0111.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 017 18a9.953 9.953 0 01-5.385-1.572zM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 00-1.588-3.755 4.502 4.502 0 015.874 2.636.818.818 0 01-.36.98A7.465 7.465 0 0114.5 16z'

// chart-bar (velocity)
const TT_ICON_CHART_BAR =
  'M15.5 2A1.5 1.5 0 0014 3.5v13a1.5 1.5 0 001.5 1.5h1a1.5 1.5 0 001.5-1.5v-13A1.5 1.5 0 0016.5 2h-1zM9.5 6A1.5 1.5 0 008 7.5v9A1.5 1.5 0 009.5 18h1a1.5 1.5 0 001.5-1.5v-9A1.5 1.5 0 0010.5 6h-1zM3.5 10A1.5 1.5 0 002 11.5v5A1.5 1.5 0 003.5 18h1A1.5 1.5 0 006 16.5v-5A1.5 1.5 0 004.5 10h-1z'

// check-circle (completados)
const TT_ICON_CHECK_CIRCLE =
  'M10 18C14.4183 18 18 14.4183 18 10C18 5.58172 14.4183 2 10 2C5.58172 2 2 5.58172 2 10C2 14.4183 5.58172 18 10 18ZM13.8566 8.19113C14.1002 7.85614 14.0261 7.38708 13.6911 7.14345C13.3561 6.89982 12.8871 6.97388 12.6434 7.30887L9.15969 12.099L7.28033 10.2197C6.98744 9.92678 6.51256 9.92678 6.21967 10.2197C5.92678 10.5126 5.92678 10.9874 6.21967 11.2803L8.71967 13.7803C8.87477 13.9354 9.08999 14.0149 9.30867 13.9977C9.52734 13.9805 9.72754 13.8685 9.85655 13.6911L13.8566 8.19113Z'

// bolt (velocidad / tiempo)
const TT_ICON_BOLT =
  'M11.983 1.907a.75.75 0 00-1.292-.657l-8.5 9.5A.75.75 0 002.75 12h5.572l-1.305 6.093a.75.75 0 001.292.657l8.5-9.5A.75.75 0 0017.25 8h-5.572l1.305-6.093z'

// clock (lead/cycle time)
const TT_ICON_CLOCK =
  'M10 18A8 8 0 1010 2a8 8 0 000 16zm1-12.5a.75.75 0 00-1.5 0v5.59L11.53 13.4a.75.75 0 101.06-1.06l-1.75-1.75V5.5z'

// arrow-trending-down (tendencia — decreciente)
const TT_ICON_TREND_DOWN =
  'M1.612 15.878A2.25 2.25 0 003.75 17.25h.75a.75.75 0 000-1.5h-.75a.75.75 0 01-.53-.22l-2.03-2.03a.75.75 0 10-1.06 1.06l2.49 2.49z'

// Inline Icon helper (Heroicons solid — color heredado currentColor)
function TT_Icon({ path, className }) {
  const ds = Array.isArray(path) ? path : [path]
  return jsx('svg', {
    viewBox: '0 0 20 20',
    fill: 'currentColor',
    className: className || 'size-3.5 shrink-0',
    'aria-hidden': true,
    children: ds.map(function (d) { return jsx('path', { d: d }) }),
  })
}

// ── Helpers de formato ─────────────────────────────────────────────

function TT_fmt(n) {
  if (n === 0 || n) return String(n)
  return '-'
}

function TT_fmtPct(n) {
  if (n === 0 || n) return Number(n).toFixed(1) + '%'
  return '-'
}

function TT_fmtTime(n) {
  if (n === 0 || n) return Number(n).toFixed(1) + 'd'
  return '-'
}

// Colores de rol de miembro
const ROLE_COLORS = {
  engineer: '#58a6ff',
  product_manager: '#bc8cff',
  engineering_manager: '#d29922',
  uxui_designer: '#39c5cf',
  leader: '#d29922',
  owner: '#d29922',
}

function roleColor(role) {
  return ROLE_COLORS[role] || '#8b949e'
}

function roleLabel(role) {
  if (!role) return 'Miembro'
  var map = {
    engineer: 'Ingeniero/a',
    product_manager: 'Product Manager',
    engineering_manager: 'Engineering Manager',
    uxui_designer: 'Diseñador/a UX/UI',
    leader: 'Líder',
    owner: 'Líder',
    designer: 'Diseñador/a',
    pm: 'Product Manager',
    em: 'Engineering Manager',
  }
  return map[role] || role
}

// ── Estilos compartidos ────────────────────────────────────────────

const PILL_BASE = {
  fontSize: 10,
  padding: '2px 8px',
  lineHeight: '16px',
  borderRadius: 0,
  border: '1px solid #30363d',
  background: 'transparent',
  color: '#8b949e',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  fontWeight: 500,
}

const PILL_ACTIVE = {
  backgroundColor: '#238636',
  borderColor: '#238636',
  color: '#ffffff',
  fontWeight: 600,
}

const KPI_CARD = {
  flex: 1,
  padding: '6px 8px',
  borderRadius: 0,
  background: 'transparent',
  border: '1px solid #30363d',
}

const CARD = {
  padding: '6px 8px',
  borderRadius: 4,
  background: '#161b22',
  border: '1px solid #21262d',
}

const PERIODS = [
  { key: 7, label: '7d' },
  { key: 30, label: '30d' },
  { key: 90, label: '90d' },
]

function TeamTab({ hubToken, teams, dashboards, loading, error }) {
  var _a = useState(0)
  var activeIdx = _a[0]
  var setActiveIdx = _a[1]

  var _b = useState(30)
  var period = _b[0]
  var setPeriod = _b[1]

  // Resetea el equipo activo si cambia la lista
  useEffect(function () {
    if (activeIdx > (teams || []).length - 1) setActiveIdx(0)
  }, [teams])

  // Si no hay equipos a cargo, este tab no aplica -> no renderizar nada
  if (!teams || teams.length === 0) return null

  // loading general (sin datos aun)
  if (loading && (!dashboards || dashboards.length === 0)) {
    return jsx('div', {
      style: { padding: 40, textAlign: 'center', fontSize: 12, color: '#888' },
      children: 'Cargando...',
    })
  }

  if (error && (!dashboards || dashboards.length === 0)) {
    return jsxs('div', {
      style: { padding: 14 },
      children: [
        jsx('div', { style: { fontWeight: 600, color: '#f85149', marginBottom: 6 }, children: 'Error' }),
        jsx('div', { style: { fontSize: 11, color: '#888' }, children: error }),
      ],
    })
  }

  var safeIdx = activeIdx < teams.length ? activeIdx : 0
  var team = teams[safeIdx]
  var teamDash = null
  if (dashboards) {
    var found = dashboards.find(function (d) {
      return String(d.id) === String(team ? team.id : '')
    })
    if (found) teamDash = found.dashboard
  }

  // Datos del dashboard seleccionado (con fallbacks defensivos)
  var dashboard = teamDash || {}
  var onTimePct = dashboard.on_time_pct
  var velocity = dashboard.velocity
  var completions = dashboard.completed !== undefined ? dashboard.completed : dashboard.completions
  var wip = dashboard.wip
  var overdue = dashboard.overdue
  var leadMedian = dashboard.lead_time_median
  var cycleMedian = dashboard.cycle_time_median
  var onTimeByType = dashboard.on_time_by_type || []

  // Tendencia lead/cycle (▲ verde si mejora / ▼ rojo si empeora)
  var leadDelta = dashboard.lead_time_delta
  var cycleDelta = dashboard.cycle_time_delta

  var members = (team && team.members) || []
  var memberCount = (team && team.memberCount != null) ? team.memberCount : members.length

  // Barras de on-time por tipo
  function progressRow(label, value) {
    var pct = value != null ? Number(value) : null
    var barColor = pct !== null && pct >= 80 ? '#3fb950' : (pct !== null && pct >= 60 ? '#d29922' : '#f85149')
    return jsxs('div', {
      children: [
        jsxs('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#8b949e', marginBottom: 2 }, children: [
          jsx('span', { children: label }),
          jsx('span', { style: { color: barColor, fontWeight: 600 }, children: pct !== null ? TT_fmtPct(pct) : '—' }),
        ]}),
        jsx('div', {
          style: { height: 6, borderRadius: 0, background: '#21262d', overflow: 'hidden' },
          children: pct !== null
            ? jsx('div', {
                style: { height: '100%', width: Math.min(Math.max(pct, 0), 100) + '%', background: barColor },
              })
            : null,
        }),
      ],
    })
  }

  // Tarjeta KPI con tendencia
  function trendCard(label, value, delta, iconPath) {
    var hasDelta = delta !== undefined && delta !== null && !isNaN(Number(delta))
    var up = hasDelta && Number(delta) <= 0 // mejora = menor tiempo
    var color = up ? '#3fb950' : '#f85149'
    var arrow = up ? '▲' : '▼'
    return jsxs('div', {
      style: KPI_CARD,
      children: [
        jsx('div', {
          style: { fontSize: 9, color: '#8b949e', display: 'inline-flex', alignItems: 'center', gap: 3, textTransform: 'uppercase', letterSpacing: '0.02em' },
          children: [jsx(Icon, { path: iconPath, className: 'size-3 shrink-0' }), ' ' + label],
        }),
        jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }, children: [
          jsx('div', { style: { fontSize: 16, fontWeight: 700, color: '#ddd' }, children: value }),
          hasDelta
            ? jsx('span', { style: { fontSize: 9, fontWeight: 600, color: color }, children: arrow + ' ' + TT_fmtTime(Math.abs(Number(delta))) })
            : null,
        ]}),
      ],
    })
  }

  return jsxs('div', {
    style: { padding: 12, fontSize: 12 },
    children: [
      // ── Header ─────────────────────────────────────────────
      jsxs('div', {
        style: { padding: '0 0 8px 0', borderBottom: '1px solid #21262d', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#161616' },
        children: [
          jsxs('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [
            jsx(TT_Icon, { path: TT_ICON_USERS, className: 'size-4 shrink-0' }),
            jsx('div', { style: { fontSize: 13, fontWeight: 700, color: '#ddd' }, children: 'Equipo a cargo' }),
          ]}),
          // Selector de periodo (7/30/90)
          jsxs('div', { style: { display: 'flex', gap: 2 }, children: PERIODS.map(function (p) {
            return jsx('button', {
              key: 'period-' + p.key,
              onClick: function () { setPeriod(p.key) },
              style: Object.assign({}, PILL_BASE, period === p.key ? PILL_ACTIVE : {}),
              children: p.label,
            })
          })}),
        ],
      }),

      // ── Sub-tabs por equipo (solo si hay más de uno) ───────
      teams.length > 1 && jsxs('div', {
        style: { display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' },
        children: teams.map(function (t, i) {
          var active = i === safeIdx
          return jsx('button', {
            key: t.id,
            onClick: function () { setActiveIdx(i) },
            style: Object.assign({}, PILL_BASE, active ? PILL_ACTIVE : {}),
            children: jsxs('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [
              t.name || ('Equipo ' + (i + 1)),
              jsx('span', { style: { color: active ? '#d0ffd8' : '#6e7681', fontSize: 9, fontWeight: 600 }, children: TT_fmt(t.memberCount != null ? t.memberCount : (t.members || []).length) }),
            ]}),
          })
        }),
      }),

      // Si el dashboard del equipo seleccionado falló
      teamDash === null ? jsx('div', {
        style: { padding: 14, color: '#d29922', fontSize: 11 },
        children: 'Sin datos de dashboard para este equipo.',
      }) : null,

      teamDash !== null ? jsxs('div', { children: [
        // ── KPIs: Completados / On-time / Velocity ─────────
        jsxs('div', { style: { display: 'flex', gap: 5, marginBottom: 5 }, children: [
          jsx('div', {
            style: KPI_CARD,
            children: [
              jsx('div', { style: { fontSize: 9, color: '#8b949e', display: 'inline-flex', alignItems: 'center', gap: 3, textTransform: 'uppercase', letterSpacing: '0.02em' }, children: [jsx(TT_Icon, { path: TT_ICON_CHECK_CIRCLE, className: 'size-3 shrink-0' }), ' Completados'] }),
              jsx('div', { style: { fontSize: 17, fontWeight: 700, color: '#f0f6fc', marginTop: 1 }, children: TT_fmt(completions) }),
            ],
          }),
          jsx('div', {
            style: KPI_CARD,
            children: [
              jsx('div', { style: { fontSize: 9, color: '#8b949e', display: 'inline-flex', alignItems: 'center', gap: 3, textTransform: 'uppercase', letterSpacing: '0.02em' }, children: [jsx(TT_Icon, { path: TT_ICON_CLOCK, className: 'size-3 shrink-0' }), ' On-time'] }),
              jsx('div', { style: { fontSize: 17, fontWeight: 700, color: '#3fb950', marginTop: 1 }, children: TT_fmtPct(onTimePct) }),
            ],
          }),
          jsx('div', {
            style: KPI_CARD,
            children: [
              jsx('div', { style: { fontSize: 9, color: '#8b949e', display: 'inline-flex', alignItems: 'center', gap: 3, textTransform: 'uppercase', letterSpacing: '0.02em' }, children: [jsx(TT_Icon, { path: TT_ICON_CHART_BAR, className: 'size-3 shrink-0' }), ' Velocity'] }),
              jsx('div', { style: { fontSize: 17, fontWeight: 700, color: '#58a6ff', marginTop: 1 }, children: TT_fmt(velocity) }),
            ],
          }),
        ]}),

        // ── KPIs: WIP / Overdue ────────────────────────────
        jsxs('div', { style: { display: 'flex', gap: 5, marginBottom: 5 }, children: [
          jsx('div', {
            style: KPI_CARD,
            children: [
              jsx('div', { style: { fontSize: 9, color: '#8b949e', display: 'inline-flex', alignItems: 'center', gap: 3, textTransform: 'uppercase', letterSpacing: '0.02em' }, children: [jsx(TT_Icon, { path: TT_ICON_BOLT, className: 'size-3 shrink-0' }), ' WIP'] }),
              jsx('div', { style: { fontSize: 15, fontWeight: 700, color: '#ddd', marginTop: 1 }, children: TT_fmt(wip) }),
            ],
          }),
          jsx('div', {
            style: KPI_CARD,
            children: [
              jsx('div', { style: { fontSize: 9, color: '#8b949e', display: 'inline-flex', alignItems: 'center', gap: 3, textTransform: 'uppercase', letterSpacing: '0.02em' }, children: [jsx(TT_Icon, { path: TT_ICON_TREND_DOWN, className: 'size-3 shrink-0' }), ' Overdue'] }),
              jsx('div', { style: { fontSize: 15, fontWeight: 700, color: overdue > 0 ? '#f85149' : '#ddd', marginTop: 1 }, children: TT_fmt(overdue) }),
            ],
          }),
          jsx('div', { style: { flex: 1, visibility: 'hidden' }, children: null }),
        ]}),

        // ── KPIs: Lead / Cycle time mediana (con tendencia) ─
        jsxs('div', { style: { display: 'flex', gap: 5, marginBottom: 8 }, children: [
          trendCard('Lead time med.', TT_fmtTime(leadMedian), leadDelta, TT_ICON_CLOCK),
          trendCard('Cycle time med.', TT_fmtTime(cycleMedian), cycleDelta, TT_ICON_BOLT),
          jsx('div', { style: { flex: 1, visibility: 'hidden' }, children: null }),
        ]}),

        // ── On-time por tipo ────────────────────────────────
        jsxs('div', { style: Object.assign({}, CARD, { marginBottom: 8 }), children: [
          jsx('div', { style: { fontSize: 10, fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', marginBottom: 6 }, children: 'On-time por tipo' }),
          jsxs('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 }, children:
            onTimeByType.length
              ? onTimeByType.map(function (row) {
                  return progressRow(row.type || row.name, row.pct)
                })
              : [jsx('div', { style: { fontSize: 11, color: '#6e7681' }, children: 'Sin datos por tipo' })],
          }),
        ]}),
      ]}) : null,

      // ── Miembros del equipo ───────────────────────────────
      jsxs('div', { children: [
        jsx('div', { style: { fontSize: 10, fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', marginBottom: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [
          jsx(TT_Icon, { path: TT_ICON_USERS, className: 'size-3 shrink-0' }),
          'Miembros del equipo (' + TT_fmt(memberCount) + ')',
        ]}),

        members.length === 0
          ? jsx('div', { style: { fontSize: 11, color: '#6e7681' }, children: 'Sin miembros listados.' })
          : members.map(function (m) {
              var rc = roleColor(m.role)
              return jsxs('div', {
                key: m.id || m.name || 'm',
                style: Object.assign({}, CARD, { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }),
                children: [
                  // Avatar (redondeado)
                  m.image
                    ? jsx('img', {
                        src: m.image,
                        alt: '',
                        draggable: false,
                        style: { width: 24, height: 24, borderRadius: '50%', background: '#21262d', objectFit: 'cover', flexShrink: 0 },
                      })
                    : jsx('div', {
                        style: { width: 24, height: 24, borderRadius: '50%', background: '#21262d', color: '#8b949e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0 },
                        children: (m.name || '?').charAt(0).toUpperCase(),
                      }),
                  jsxs('div', { style: { flex: 1, minWidth: 0 }, children: [
                    jsx('div', { style: { fontSize: 12, fontWeight: 600, color: '#ddd', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, children: m.name || 'Sin nombre' }),
                    jsx('div', {
                      style: { fontSize: 9, color: rc, fontWeight: 500, marginTop: 1 },
                      children: roleLabel(m.role),
                    }),
                  ]}),
                  // Contador de items (ilustrativo por ahora)
                  jsx('span', {
                    style: { fontSize: 9, color: '#6e7681', border: '1px solid #30363d', borderRadius: 0, padding: '0px 6px', lineHeight: '14px', background: 'transparent', flexShrink: 0 },
                    children: '—',
                  }),
                ],
              })
            }),
      ]}),
    ],
  })
}

// Integrado por build.js como función global del bundle (sin export).
// Global disponible: TeamTab.
