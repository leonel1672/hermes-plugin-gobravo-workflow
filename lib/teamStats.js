/**
 * teamStats.js — Capa de datos MCP del plugin Gobravo Workflow (funciones puras).
 *
 * Funciones puras de datos (sin UI, sin React) para:
 *  - Saber quién soy (user.id del token).
 *  - Detectar mi puesto/rol (area, sub_area del team donde estoy).
 *  - Encontrar los equipos/squads que tengo a cargo.
 *  - Obtener dashboards de stats por equipo/squad.
 *
 * Patrón de llamada MCP idéntico al de plugin.js:
 *   POST {HUB_BASE}/{server}/mcp  (JSON-RPC tools/call)
 *
 * Todas las funciones son fail-open: ante cualquier error devuelven
 * null / [] sin lanzar, para no romper el plugin que las consume.
 */

// HUB_BASE viene de constants.js (global del bundle).

/**
 * Llama a un tool MCP del servidor indicado y devuelve el payload JSON.
 * Renombrada (tsMcpCall) para no colisionar con mcpCall global de helpers.js
 * en el bundle concatenado.
 * @param {string} token Token Bearer de Hub.
 * @param {string} server 'tracker' | 'my-work' | 'stats' | 'teams'
 * @param {string} tool Nombre del tool a invocar.
 * @param {object} [args] Argumentos del tool.
 * @returns {Promise<any>} El JSON parseado de content[0].text.
 */
async function tsMcpCall(token, server, tool, args) {
  args = args || {}
  const res = await fetch(HUB_BASE + '/' + server + '/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: tool, arguments: args },
    }),
  })
  const body = await res.json()
  if (!res.ok) {
    const msg = body && (body.message || (body.error && body.error.message) || ('HTTP ' + res.status))
    throw new Error(msg)
  }
  if (body.error) throw new Error(body.error.message || 'RPC error')
  const text = body && body.result && body.result.content && body.result.content[0] && body.result.content[0].text
  if (!text) throw new Error('Respuesta vacía del servidor')
  return JSON.parse(text)
}

/** Primera palabra de un nombre (para matchear squads tipo "Nombre - Área"). */
function firstNameFrom(fullName) {
  if (!fullName) return ''
  const name = String(fullName)
  const i = name.indexOf(', ')
  const first = i >= 0 ? name.slice(0, i) : name
  return first.trim().split(/\s+/)[0] || ''
}

/**
 * Devuelve el id del usuario autenticado (o null en error).
 * @param {string} token
 * @returns {Promise<string|null>}
 */
async function fetchMyId(token) {
  try {
    const profile = await tsMcpCall(token, 'my-work', 'my_profile', {})
    const id = profile && profile.user && profile.user.id
    return id || null
  } catch (e) {
    return null
  }
}

/**
 * Devuelve el puesto (rol) del usuario autenticado.
 * Busca en teams_list el team donde el usuario es miembro (members[] con user_id = mi id)
 * y extrae {area, sub_area, teamName, teamId, leaderId, leaderEmail}.
 * Si no se encuentra membership pero el usuario es líder (leader_id = mi id) lo detecta igual.
 * @param {string} token
 * @returns {Promise<object|null>} {area, sub_area, teamName, teamId, leaderId, leaderEmail}
 */
async function fetchMyRole(token) {
  try {
    const myId = await fetchMyId(token)
    const teams = await tsMcpCall(token, 'teams', 'teams_list', {})
    const list = Array.isArray(teams) ? teams : (teams && (teams.teams || teams.data)) || []
    for (const team of list) {
      if (!team) continue
      // 1) Soy miembro: busco mi user_id en members[].
      const members = Array.isArray(team.members) ? team.members : []
      const mine = members.find((m) => m && (m.user_id === myId || m.id === myId))
      if (mine || team.leader_id === myId) {
        return {
          area: team.area || null,
          sub_area: mine && mine.sub_area ? mine.sub_area : team.sub_area || null,
          teamName: team.name || null,
          teamId: team.id != null ? team.id : null,
          leaderId: team.leader_id != null ? team.leader_id : null,
          leaderEmail: team.leader_email || null,
        }
      }
    }
    return null
  } catch (e) {
    return null
  }
}

/**
 * Devuelve los equipos/squads que el usuario tiene A CARGO.
 * Combina:
 *  - teams_list → teams donde soy líder (leader_id === mi id).
 *  - squads_list → squads cuyo nombre empieza con "<Mi primer nombre> - "
 *      confirmando en squads_get que soy miembro.
 * @param {string} token
 * @returns {Promise<Array>} [{id, name, kind: 'team'|'squad', members:[{id,name,image,email,role}], memberCount}]
 */
async function fetchMyTeams(token) {
  try {
    const out = []
    const myId = await fetchMyId(token)
    const myName = await myProfileName(token)

    // 1) Teams directos donde soy líder.
    try {
      const teams = await tsMcpCall(token, 'teams', 'teams_list', {})
      const list = Array.isArray(teams) ? teams : (teams && (teams.teams || teams.data)) || []
      for (const team of list) {
        if (!team || team.leader_id !== myId) continue
        out.push({
          id: team.id != null ? team.id : null,
          name: team.name || '',
          kind: 'team',
          members: normalizeMembers(team.members),
          memberCount: Array.isArray(team.members) ? team.members.length : 0,
        })
      }
    } catch (e) { /* fail-open */ }

    // 2) Squads cuyo nombre empieza con "<Mi primer nombre> - ".
    const prefix = myName ? firstNameFrom(myName) + ' - ' : null
    try {
      const squads = await tsMcpCall(token, 'teams', 'squads_list', {})
      const list = squads && Array.isArray(squads.squads) ? squads.squads : []
      for (const sq of list) {
        if (!sq || !sq.id) continue
        if (prefix && !String(sq.name || '').startsWith(prefix)) continue
        // Confirmo membresía y rol vía squads_get.
        let detail = null
        try { detail = await tsMcpCall(token, 'teams', 'squads_get', { id: sq.id }) } catch (e) { /* ignore */ }
        const members = detail && Array.isArray(detail.members) ? detail.members : []
        const isMember = members.some((m) => m && m.user && m.user.id === myId)
        if (!isMember && !(detail && detail.id)) continue
        out.push({
          id: sq.id,
          name: sq.name || '',
          kind: 'squad',
          members: normalizeSquadMembers(members),
          memberCount: detail && detail.member_count != null ? detail.member_count : members.length,
        })
      }
    } catch (e) { /* fail-open */ }

    return out
  } catch (e) {
    return []
  }
}

/**
 * Devuelve la URL del avatar del usuario autenticado.
 * my_profile no incluye 'image', así que busca en squads_get
 * (donde members[].user.image sí está disponible).
 * @param {string} token
 * @returns {Promise<string|null>}
 */
async function fetchMyAvatar(token) {
  try {
    const myId = await fetchMyId(token)
    if (!myId) return null
    const squads = await tsMcpCall(token, 'teams', 'squads_list', {})
    const list = squads && Array.isArray(squads.squads) ? squads.squads : []
    for (const sq of list) {
      if (!sq || !sq.id) continue
      try {
        const detail = await tsMcpCall(token, 'teams', 'squads_get', { id: sq.id })
        const members = detail && Array.isArray(detail.members) ? detail.members : []
        const me = members.find((m) => m && m.user && m.user.id === myId)
        if (me && me.user && me.user.image) return me.user.image
      } catch (e) { /* seguir probando */ }
    }
    return null
  } catch (e) {
    return null
  }
}

/** Nombre del usuario autenticado (fallback: ''). */
async function myProfileName(token) {
  try {
    const profile = await tsMcpCall(token, 'my-work', 'my_profile', {})
    return (profile && profile.user && profile.user.name) || ''
  } catch (e) {
    return ''
  }
}

/** Normaliza members de teams_list ({user_id,user_name,user_email,role}). */
function normalizeMembers(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map((m) => ({
    id: m && (m.user_id || m.id) != null ? (m.user_id || m.id) : null,
    name: (m && (m.user_name || m.name)) || '',
    image: null,
    email: (m && m.user_email) || '',
    role: (m && m.role) || '',
  }))
}

/** Normaliza members de squads_get ({user:{id,name,image,email}, role}). */
function normalizeSquadMembers(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map((m) => {
    const u = m && m.user ? m.user : {}
    return {
      id: u.id != null ? u.id : null,
      name: u.name || '',
      image: u.image || null,
      email: u.email || '',
      role: (m && m.role) || '',
    }
  })
}

/**
 * Obtiene los dashboards de stats para cada equipo, usando stats_dashboard
 * con period y squad_id=id. Si un team no es un squad real y la llamada
 * falla, devuelve dashboard: null (fail-open, no rompe el resto).
 * @param {string} token
 * @param {Array} teams Equipos de fetchMyTeams().
 * @param {string} [period] '7d' | '30d' | '90d' (default '30d').
 * @returns {Promise<Array>} [{id, name, kind, dashboard}]
 */
async function fetchDashboards(token, teams, period) {
  const p = period || '30d'
  const list = Array.isArray(teams) ? teams : []
  const results = []
  for (const team of list) {
    const entry = {
      id: team ? team.id : null,
      name: team ? (team.name || '') : '',
      kind: team ? (team.kind || 'team') : 'team',
      dashboard: null,
    }
    if (team && team.id != null) {
      try {
        entry.dashboard = await tsMcpCall(token, 'stats', 'stats_dashboard', {
          period: p,
          squad_id: team.id,
        })
      } catch (e) {
        entry.dashboard = null
      }
    }
    results.push(entry)
  }
  return results
}

// Integrado por build.js como módulo global del bundle (sin export).
// Funciones globales disponibles: fetchMyId, fetchMyRole, fetchMyTeams,
// fetchDashboards, mcpCall (local).
