// ── Tab names ──────────────────────────────────────────────────────


var TABS = [
  { key: 'stats', label: 'Overview', iconPath: ICON_SQUARES_2X2 },
  { key: 'prs', label: 'PRs', iconPath: ICON_GITHUB, iconViewBox: '0 0 24 24' },
  { key: 'status', label: 'Tracks', iconPath: ICON_VIEW_COLUMNS },
  { key: 'tickets', label: 'Tasks', iconPath: ICON_CHECK },
  { key: 'config', label: 'Config', iconPath: ICON_WRENCH },
]

// ── Bootstrap ──────────────────────────────────────────────────────

// ── Bootstrap ──────────────────────────────────────────────────────

export default {
  id: ID,
  name: 'Gobravo Workflow',
  register(ctx) {
    ctx.register({
      id: ID + '-pill',
      area: 'statusBar.right',
      order: 5,
      render: function () { return jsx(App, {}) },
    })
  },
}

// ── Pill ───────────────────────────────────────────────────────────

function Pill({ onClick }) {
  return jsx('button', {
    onClick: onClick,
    style: {
      backgroundColor: '#1a1a1a',
      color: '#58a6ff',
      border: 'none',
      borderRadius: 4,
      padding: '2px 8px',
      cursor: 'pointer',
      fontSize: 12,
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      lineHeight: '20px',
    },
    children: jsx('img', {
      src: BRAVO_LOGO,
      alt: '',
      draggable: false,
      style: { height: 16, width: 'auto', display: 'block' },
    }),
  })
}

// ── App (root) ────────────────────────────────────────────────────

function App() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('stats')
  const [hubToken, setHubToken] = useState(function () { return loadStr(STORAGE_HUB_TOKEN) })
  const [githubToken, setGithubToken] = useState(function () { return loadStr(STORAGE_GITHUB_TOKEN) })
  const [webhookUrl, setWebhookUrl] = useState(function () { return loadStr(STORAGE_WEBHOOK_URL) })
  // Datos del rol/equipos (para el tab 'Equipo' condicional y el sub_area del header)
  const [teamData, setTeamData] = useState(null) // { role, teams, dashboards, loading, error }

  // Al abrir (y si hay token), detecta rol + equipos a cargo.
  useEffect(function () {
    if (!open || !hubToken || teamData) return
    var cancelled = false
    setTeamData({ role: null, teams: [], dashboards: [], loading: true, error: null })
    Promise.all([
      fetchMyRole(hubToken),
      fetchMyTeams(hubToken),
      fetchMyAvatar(hubToken),
    ]).then(function (res) {
      if (cancelled) return
      var role = res[0]
      var teams = res[1] || []
      var avatar = res[2] || null
      // Dashboards solo para equipos con id (squads; los teams directos pueden no tener stats)
      return fetchDashboards(hubToken, teams, '7d').then(function (dashboards) {
        if (cancelled) return
        setTeamData({ role: role, teams: teams, dashboards: dashboards || [], loading: false, error: null, avatar: avatar })
      })
    }).catch(function (e) {
      if (cancelled) return
      setTeamData({ role: null, teams: [], dashboards: [], loading: false, error: String(e && e.message || e) })
    })
    return function () { cancelled = true }
  }, [open, hubToken])

  function saveAllConfig(hub, github, webhook) {
    saveStr(STORAGE_HUB_TOKEN, hub)
    saveStr(STORAGE_GITHUB_TOKEN, github)
    saveStr(STORAGE_WEBHOOK_URL, webhook)
    setHubToken(hub)
    setGithubToken(github)
    setWebhookUrl(webhook)
  }

  return jsxs('div', {
    children: [
      jsx(Pill, { onClick: function () { haptic('tap'); setOpen(!open) } }),
      open && jsx(Dropdown, {
        tab: tab,
        onTabChange: setTab,
        hubToken: hubToken,
        githubToken: githubToken,
        webhookUrl: webhookUrl,
        teamData: teamData,
        onSaveConfig: saveAllConfig,
        onClose: function () { setOpen(false) },
      }),
    ],
  })
}

// ── Dropdown ────────────────────────────────────────────────────────

const dropdownStyles = {
  position: 'fixed',
  top: 36,
  right: 8,
  width: 560,
  maxHeight: 'calc(100vh - 60px)',
  overflowY: 'auto',
  backgroundColor: '#161616',
  border: '1px solid #333',
  borderRadius: 8,
  boxShadow: '0 4px 24px rgba(0,0,0,.5)',
  zIndex: 9999,
  fontSize: 12,
  color: '#ccc',
  display: 'flex',
}

var contentStyle = {
  flex: 1,
  minWidth: 0,
  overflowY: 'auto',
  maxHeight: 'calc(100vh - 60px)',
  borderRadius: '0 8px 8px 0',
}

function Dropdown({ tab, onTabChange, hubToken, githubToken, webhookUrl, teamData, onSaveConfig, onClose }) {
  const ref = useRef(null)
  var _sc = useState(function () { return loadStr(STORAGE_SIDEBAR_COLLAPSED) === '1' })
  var collapsed = _sc[0]
  var setCollapsed = _sc[1]

  useEffect(function () {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return function () { document.removeEventListener('mousedown', handleClick) }
  }, [onClose])

  return jsxs('div', {
    ref: ref,
    style: dropdownStyles,
    children: [
      // ── Sidebar ──
      jsx('div', {
        style: {
          width: collapsed ? 38 : 150,
          flexShrink: 0,
          borderRight: '1px solid #333',
          display: 'flex',
          flexDirection: 'column',
          padding: '6px 0',
          backgroundColor: '#131313',
          borderRadius: '8px 0 0 8px',
          overflow: 'hidden',
          transition: 'width .12s',
        },
        children: [
          TABS.filter(function (t) { return t.key !== 'config' }).map(function (t) {
            var active = t.key === tab
            return jsx('button', {
              onClick: function () { onTabChange(t.key) },
              title: t.label,
              style: {
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                margin: '0 4px',
                borderRadius: 5,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: active ? '#222' : 'transparent',
                color: active ? '#fff' : '#888',
                fontSize: 16,
                lineHeight: '16px',
                fontWeight: active ? 600 : 400,
                transition: 'none',
                whiteSpace: 'nowrap',
              },
              children: [
                jsx(Icon, { path: t.iconPath, viewBox: t.iconViewBox, className: 'size-4 shrink-0' }),
                !collapsed && jsx('span', { style: { fontSize: 11, lineHeight: '14px' }, children: t.label }),
              ],
            }, t.key)
          }),
          // Tab 'Equipo' condicional: solo si el usuario tiene equipos a cargo
          teamData && teamData.teams && teamData.teams.length > 0 && (function () {
            var active = 'team' === tab
            return jsx('button', {
              onClick: function () { onTabChange('team') },
              title: 'Equipo',
              style: {
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                margin: '0 4px',
                borderRadius: 5,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: active ? '#222' : 'transparent',
                color: active ? '#fff' : '#888',
                fontSize: 16,
                lineHeight: '16px',
                fontWeight: active ? 600 : 400,
                transition: 'none',
                whiteSpace: 'nowrap',
              },
              children: [
                jsx(Icon, { path: ICON_CHART_BAR, className: 'size-4 shrink-0' }),
                !collapsed && jsx('span', { style: { fontSize: 11, lineHeight: '14px' }, children: 'Equipo' }),
              ],
            }, 'team')
          }()),
          // Spacer
          jsx('div', { style: { flex: 1 } }),
          // Toggle colapsar/expandir
          jsx('button', {
            onClick: function () {
              var next = !collapsed
              setCollapsed(next)
              saveStr(STORAGE_SIDEBAR_COLLAPSED, next ? '1' : '')
            },
            title: collapsed ? 'Expandir sidebar' : 'Colapsar sidebar',
            style: {
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              padding: '5px 10px',
              justifyContent: collapsed ? 'center' : 'flex-start',
              margin: '0 4px',
              border: 'none',
              borderTop: '1px solid #2a2a2a',
              cursor: 'pointer',
              background: 'none',
              color: '#666',
              whiteSpace: 'nowrap',
            },
            children: [
              jsx(Icon, { path: collapsed ? ICON_CHEVRON_RIGHT : ICON_CHEVRON_LEFT, className: 'size-3.5 shrink-0' }),
              !collapsed && jsx('span', { style: { fontSize: 10, lineHeight: '12px', color: '#666' }, children: 'Colapsar' }),
            ],
          }, 'toggle'),
          // Config tab at bottom
          function () {
            var active = 'config' === tab
            return jsx('button', {
              onClick: function () { onTabChange('config') },
              title: 'Config',
              style: {
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                margin: '4px 4px 0',
                borderRadius: 5,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: active ? '#222' : 'transparent',
                color: active ? '#fff' : '#888',
                fontSize: 16,
                lineHeight: '16px',
                fontWeight: active ? 600 : 400,
                transition: 'none',
                whiteSpace: 'nowrap',
              },
              children: [
                jsx(Icon, { path: ICON_WRENCH, className: 'size-4 shrink-0' }),
                !collapsed && jsx('span', { style: { fontSize: 11, lineHeight: '14px' }, children: 'Config' }),
              ],
            }, 'config')
          }(),
        ],
      }),
      // ── Content ──
      jsx('div', {
        style: contentStyle,
        children: [
          tab === 'stats' && jsx(StatsTab, { hubToken: hubToken, role: teamData && teamData.role ? teamData.role.sub_area : null, avatar: teamData ? teamData.avatar : null }),
          tab === 'team' && teamData && jsx(TeamTab, {
            hubToken: hubToken,
            teams: teamData.teams || [],
            dashboards: teamData.dashboards || [],
            loading: teamData.loading,
            error: teamData.error,
          }),
          tab === 'prs' && jsx(PRsTab, { githubToken: githubToken, webhookUrl: webhookUrl }),
          tab === 'tickets' && jsx(TicketsTab, { hubToken: hubToken }),
          tab === 'status' && jsx(StatusTab, { hubToken: hubToken }),
          tab === 'config' && jsx(ConfigTab, {
            hubToken: hubToken,
            githubToken: githubToken,
            webhookUrl: webhookUrl,
            onSave: onSaveConfig,
          }),
        ],
      }),
    ],
  })
}

// ── ConfigTab ──────────────────────────────────────────────────────

function loadModels() {
  try {
    var r = loadStr(STORAGE_HUB_TOKEN + '-models')
    if (r) return Object.assign({}, DEFAULT_STATUS_MODELS, JSON.parse(r))
  } catch {}
  return Object.assign({}, DEFAULT_STATUS_MODELS)
}

function saveModels(m) {
  try { saveStr(STORAGE_HUB_TOKEN + '-models', JSON.stringify(m)) } catch {}
}

async function fetchMyWork(token) {
  return mcpCall(token, 'my-work', 'my_profile', {
    include_workitems: true,
    limit: 100,
  })
}

async function getDetail(token, id) {
  return mcpCall(token, 'tracker', 'get_workitem', {
    id: id,
    include_content: true,
  })
}

async function fetchComments(token, id) {
  return mcpCall(token, 'tracker', 'list_comments', {
    work_item_id: id,
  })
}

async function fetchSquads(token) {
  return mcpCall(token, 'teams', 'squads_list', {})
}


// ── StatsTab ────────────────────────────────────────────────────────

function SetupView({ onClose, onDone }) {
  var inputRef = useRef(null)
  var handleSave = function () {
    var val = inputRef.current && inputRef.current.value && inputRef.current.value.trim()
    if (!val) return
    try {
      saveStr(STORAGE_HUB_TOKEN, val)
    } catch {}
    onDone(val)
    onClose()
  }
  return jsxs('div', {
    style: { padding: 14 },
    children: [
      jsx('div', {
        style: { padding: '0 0 10px 0', fontSize: 13, color: '#ddd', fontWeight: 600, borderBottom: '1px solid #333' },
        children: jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_KEY, className: 'size-3.5 shrink-0' }), ' Configurar Hub'] }),
      }),
      jsxs('div', {
        style: { padding: '10px 0', display: 'flex', flexDirection: 'column', gap: 10 },
        children: [
          jsx('div', {
            style: { fontSize: 11, color: '#888', lineHeight: 1.5 },
            children: 'Pega tu API Token de Gobravo Hub con scope de lectura.',
          }),
          jsx('input', {
            ref: inputRef,
            type: 'password',
            placeholder: 'hub_xxxxxxxxxxxx',
            style: {
              backgroundColor: '#111',
              color: '#ddd',
              border: '1px solid #333',
              borderRadius: 4,
              padding: '6px 10px',
              fontSize: 12,
              outline: 'none',
              width: '100%',
              boxSizing: 'border-box',
            },
            onKeyDown: function (e) { if (e.key === 'Enter') handleSave() },
          }),
          jsx('button', {
            onClick: handleSave,
            style: {
              backgroundColor: '#238636',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              alignSelf: 'flex-end',
            },
            children: 'Guardar',
          }),
        ],
      }),
    ],
  })
}

function StatusTab({ hubToken }) {
  var _a = useState(null)
  var data = _a[0]
  var setData = _a[1]

  var _b = useState(false)
  var loading = _b[0]
  var setLoading = _b[1]

  var lastFetch = useRef(0)

  var _c = useState(null)
  var actioningId = _c[0]
  var setActioningId = _c[1]

  var _d = useState(null)
  var selectedId = _d[0]
  var setSelectedId = _d[1]

  var _e = useState(null)
  var detail = _e[0]
  var setDetail = _e[1]

  var _f = useState(false)
  var detailLoading = _f[0]
  var setDetailLoading = _f[1]

  var _g = useState(null)
  var comments = _g[0]
  var setComments = _g[1]

  var _h = useState('')
  var commentText = _h[0]
  var setCommentText = _h[1]

  var _i = useState(false)
  var commenting = _i[0]
  var setCommenting = _i[1]

  var _j = useState(false)
  var editingDesc = _j[0]
  var setEditingDesc = _j[1]

  var _k = useState('')
  var editContent = _k[0]
  var setEditContent = _k[1]

  var _l = useState(false)
  var savingContent = _l[0]
  var setSavingContent = _l[1]

  var _m = useState(function () { return loadModels() })
  var statusModels = _m[0]
  var setStatusModels = _m[1]

  var _p = useState(false)
  var setupMode = _p[0]
  var setSetupMode = _p[1]

  var _r = useState({})
  var collapsed = _r[0]
  var setCollapsed = _r[1]

  function toggleCollapsed(status) {
    var next = {}
    next[status] = !collapsed[status]
    setCollapsed(Object.assign({}, collapsed, next))
  }

  var _q = useState(false)
  var creating = _q[0]
  var setCreating = _q[1]

  var handleTokenDone = function (newToken) {
    setData(null)
    lastFetch.current = 0
  }

  function loadData() {
    if (!hubToken) return
    var now = Date.now()
    if (now - lastFetch.current < CACHE_TTL && data) return

    setLoading(true)
    lastFetch.current = now

    fetchMyWork(hubToken)
      .then(function (profile) {
        var allItems = (profile.workitems && profile.workitems.tracks) ||
          profile.work_items ||
          profile.items ||
          []

        var items = []
        if (Array.isArray(allItems)) {
          items = allItems
        } else if (typeof allItems === 'object') {
          var keys = Object.keys(allItems)
          for (var ki = 0; ki < keys.length; ki++) {
            var key = keys[ki]
            if (Array.isArray(allItems[key])) {
              items = items.concat(allItems[key])
            }
          }
        }

        var seen = new Set()
        items = items.filter(function (i) {
          if (seen.has(i.id)) return false
          seen.add(i.id)
          return true
        })

        setData({
          items: items,
          name: profile.name || profile.display_name || profile.email || 'Usuario',
          error: null,
        })
      })
      .catch(function (err) {
        var msg = String(err.message || err)
        if (msg.includes('401') || msg.includes('Unauthorized') || msg.includes('Bad credentials')) {
          saveStr(STORAGE_HUB_TOKEN, '')
          setData(null)
          return
        }
        setData({ items: [], name: '', error: msg })
      })
      .finally(function () { setLoading(false) })
  }

  useEffect(function () {
    if (hubToken && !data && !loading) loadData()
  }, [hubToken])

  // Auto-refresh every 5 minutes
  useEffect(function () {
    if (!hubToken) return
    var interval = setInterval(function () {
      lastFetch.current = 0
      loadData()
    }, 300_000)
    return function () { clearInterval(interval) }
  }, [hubToken, data])

  var openDetail = useCallback(function (item) {
    setSelectedId(item.id)
    setDetailLoading(true)
    setDetail(null)
    setComments(null)
    getDetail(hubToken, item.id)
      .then(function (d) {
        d.name = d.name || item.name
        d.code = d.code || item.code
        d.type = d.type || item.type
        d.status = d.status || item.status
        setDetail(d)
        // Fetch comments in parallel
        fetchComments(hubToken, item.id).then(function (data) {
          var list = (data && data.comments) || (data && data.items) || []
          setComments(Array.isArray(list) ? list : [])
        }).catch(function () { setComments([]) })
      })
      .catch(function (err) {
        setDetail({ id: item.id, name: item.name, code: item.code, type: item.type, status: item.status, error: err.message })
      })
      .finally(function () { setDetailLoading(false) })
  }, [hubToken])

  var handleAddComment = useCallback(function () {
    var text = commentText.trim()
    if (!text || !(detail && detail.id)) return
    setCommenting(true)
    mcpCall(hubToken, 'tracker', 'add_comment', {
      work_item_id: detail.id,
      content: text,
    })
      .then(function () {
        host.notify('✅ Comentario agregado')
        setCommentText('')
        return fetchComments(hubToken, detail.id)
      })
      .then(function (data) {
        var list = (data && data.comments) || (data && data.items) || []
        setComments(Array.isArray(list) ? list : [])
      })
      .catch(function (err) {
        host.notifyError('Error: ' + err.message)
      })
      .finally(function () { setCommenting(false) })
  }, [hubToken, detail, commentText])

  var actionTrack = useCallback(function (item, buildPrompt) {
    var sid = host.state.activeSessionId.get()
    if (!sid) {
      host.notifyError('❌ No hay sesión activa. Abre o crea un chat primero.')
      return
    }

    setActioningId(item.id + '-' + item.status)
    try {
      // Reglas de análisis por transición de estado
      var rules = loadTrackRules()
      var transMap = {
        backlog: 'backlog_to_shaping',
        shaping: 'shaping_to_todo',
        todo: 'todo_to_in_progress',
        in_progress: 'in_progress_to_review',
      }
      var trans = transMap[item.status] || null
      var cfg = trans ? (rules[trans] || {}) : {}

      if (cfg.provider && cfg.model) {
        // Provider/modelo configurado en la card de transición → aplicarlo a la sesión
        var providerSlug = (cfg.provider === 'Token Gate') ? 'tokengate' : cfg.provider
        host.request('config.set', {
          session_id: sid,
          key: 'model',
          value: cfg.model + ' --provider ' + providerSlug + ' --session',
        })
      } else {
        // Fallback: switch model based on the item's status
        var modelSlug = statusModels[item.status]
        if (modelSlug && host.state.model) {
          try { host.state.model.set(modelSlug) } catch {}
        }
      }

      host.request('prompt.submit', {
        session_id: sid,
        text: buildPrompt(item, cfg.rules, cfg.refs),
      })
      host.notify('📤 Análisis enviado — el asistente procesará ' + item.code)
    } catch (err) {
      host.notifyError('Error: ' + err.message)
    } finally {
      setActioningId(null)
    }
  }, [statusModels])

  function saveDescription() {
    if (!detail) return
    setSavingContent(true)
    var plural = { track: 'tracks', task: 'tasks', project: 'projects', discovery: 'discoveries' }
    var path = plural[detail.type] || 'tracks'
    fetch(HUB_BASE + '/tracker/' + path + '/' + detail.id, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + hubToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: editContent }),
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status)
        return res
      })
      .then(function () {
        setDetail(Object.assign({}, detail, { content: editContent }))
        setEditingDesc(false)
        host.notify('✅ Descripción actualizada')
      })
      .catch(function (err) {
        host.notifyError('Error al guardar: ' + (err.message || ''))
      })
      .finally(function () { setSavingContent(false) })
  }

  function itemUrl(item) {
    var type = item.type || 'tracks'
    var plural = {
      track: 'tracks',
      task: 'tasks',
      project: 'projects',
      discovery: 'discoveries',
    }
    return 'https://hub.gobravo.io/tracker/' + (plural[type] || 'tracks') + '/' + item.id
  }

  function btnStyle(color, disabled) {
    return {
      background: 'none',
      border: '1px solid',
      borderColor: disabled ? '#444' : color,
      color: disabled ? '#555' : color,
      cursor: disabled ? 'default' : 'pointer',
      fontSize: 10,
      fontWeight: 600,
      padding: '2px 6px',
      marginRight: 4,
      borderRadius: 4,
      whiteSpace: 'nowrap',
      flexShrink: 0,
      lineHeight: '18px',
    }
  }

  function actionButton(item) {
    if (item.type !== 'track') return null

    var isActioning = actioningId === (item.id + '-' + item.status)
    var label, promptBuilder, color, actionIcon

    switch (item.status) {
      case 'backlog':
        label = 'Shape'
        promptBuilder = buildBacklogPrompt
        color = '#6e7681'
        actionIcon = ICON_CLIPBOARD_DOCUMENT_LIST
        break
      case 'shaping':
        label = 'Plan'
        promptBuilder = buildShapingPrompt
        color = '#58a6ff'
        actionIcon = ICON_PENCIL_SQUARE
        break
      case 'todo':
        label = 'Execute'
        promptBuilder = buildTodoPrompt
        color = '#3fb950'
        actionIcon = ICON_WRENCH
        break
      case 'in_progress':
        label = 'Continue'
        promptBuilder = buildTodoPrompt
        color = '#f59e0b'
        actionIcon = ICON_ARROW_PATH
        break
      default:
        return null
    }

    return jsx('button', {
      onClick: function (e) {
        e.preventDefault(); e.stopPropagation()
        if (!isActioning) actionTrack(item, promptBuilder)
      },
      disabled: isActioning,
      style: btnStyle(color, isActioning),
      title: isActioning ? 'Enviando...' : label + ': ' + item.code,
      children: isActioning ? '⏳' : jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'center' }, children: [jsx(Icon, { path: actionIcon, className: 'size-3.5 shrink-0' }), ' ' + label] }),
    }, 'action')
  }

  function renderItem(item) {
    var btn = actionButton(item)
    var isSelected = selectedId === item.id
    var statusColor = STATUS_COLORS[item.status] || '#8b949e'

    return jsxs('div', {
      children: [
        jsx('div', {
          onClick: function () { openDetail(item) },
          style: {
            display: 'flex',
            alignItems: 'center',
            borderBottom: '1px solid #1a1a1a',
            cursor: 'pointer',
            backgroundColor: isSelected ? '#1a1a2a' : 'transparent',
          },
          onMouseEnter: function (e) { e.currentTarget.style.backgroundColor = '#2a2a2a' },
          onMouseLeave: function (e) { e.currentTarget.style.backgroundColor = isSelected ? '#1a1a2a' : 'transparent' },
          children: [
            jsx('div', {
              style: {
                flex: 1,
                padding: '8px 12px 8px 28px',
                minWidth: 0,
              },
              children: jsxs('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 8 },
                children: [
                  jsxs('div', { style: { flex: 1, minWidth: 0 },
                    children: [
                      jsx('div', {
                        style: {
                          fontSize: 12,
                          fontWeight: 500,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        },
                        children: item.name,
                      }),
                      jsxs('div', {
                        style: {
                          fontSize: 11,
                          color: '#888',
                          marginTop: 2,
                          display: 'flex',
                          gap: 6,
                          alignItems: 'center',
                        },
                        children: [
                          jsx('span', { style: { color: '#58a6ff' }, children: item.code || '' }),
                          jsx('span', {
                            style: {
                              fontSize: 10,
                              padding: '1px 8px',
                              borderRadius: 999,
                              border: '1px solid ' + statusColor,
                              color: statusColor,
                              flexShrink: 0,
                              fontWeight: 500,
                              lineHeight: '14px',
                            },
                            children: statusText(item.status),
                          }, 'status-chip'),
                          item.due_date && jsx('span', {
                            style: { color: new Date(item.due_date) < new Date() ? '#ef4444' : '#888', display: 'inline-flex', alignItems: 'center', gap: 4 },
                            children: [jsx(Icon, { path: ICON_CALENDAR, className: 'size-3 shrink-0' }), ' ' + timeAgo(item.due_date)],
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            }),
            btn,
          ],
        }),
      ],
    }, item.id)
  }

  // ── Render ──────────────────────────────────────────────────────

  if (!hubToken) {
    return jsx(SetupView, {
      onClose: function () {},
      onDone: handleTokenDone,
    })
  }

  if (loading && !data) {
    return jsx('div', {
      style: { padding: 40, textAlign: 'center', fontSize: 12, color: '#888' },
      children: '⏳ Cargando...',
    })
  }

  if (data && data.error) {
    return jsxs('div', {
      style: { padding: 14 },
      children: [
        jsx('div', { style: { fontWeight: 600, color: '#f85149', marginBottom: 6 }, children: '❌ Error' }),
        jsx('div', { style: { fontSize: 11, color: '#888' }, children: data.error }),
        jsx('button', {
          onClick: function () { setSetupMode(true) },
          style: { background: 'none', border: 'none', color: '#58a6ff', cursor: 'pointer', fontSize: 11, marginTop: 8, padding: 0 },
          children: jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_ARROW_PATH, className: 'size-3 shrink-0' }), ' Cambiar token'] }),
        }),
      ],
    })
  }

  var items = data ? data.items : []

  // Group by status (solo flujo activo; terminados se consultan directo en Hub)
  var statusOrder = ['in_review', 'in_progress', 'todo', 'shaping', 'backlog', 'staging', 'problem_discovery', 'problem_validation']
  var grouped = {}
  for (var gi = 0; gi < items.length; gi++) {
    var item = items[gi]
    var st = item.status || 'unassigned'
    if (statusOrder.indexOf(st) < 0) continue
    if (!grouped[st]) grouped[st] = []
    grouped[st].push(item)
  }
  var allStatuses = statusOrder.filter(function (s) { return grouped[s] })
  var hasContent = allStatuses.length > 0

  return jsxs('div', {
    children: [
      setupMode ? jsx(SetupView, {
        onClose: function () { setSetupMode(false) },
        onDone: handleTokenDone,
      }) : creating ? jsx(CreateForm, {
        token: hubToken,
        onClose: function () { setCreating(false) },
        onCreated: function () {
          setCreating(false)
          setData(null)
          lastFetch.current = 0
        },
      }) : selectedId ? [
        // Detail view header
        jsx('div', {
          style: { padding: '6px 12px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: 6 },
          children: jsx('button', {
            onClick: function () { setSelectedId(null); setDetail(null) },
            style: { background: 'none', border: 'none', color: '#58a6ff', cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: 0 },
            children: jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_ARROW_LEFT, className: 'size-3 shrink-0' }), ' Volver'] }),
          }),
        }),

        detailLoading &&
          jsx('div', { style: { padding: 20, textAlign: 'center', fontSize: 12, color: '#888' }, children: '⏳ Cargando detalle...' }),

        detail && detail.error &&
          jsx('div', { style: { padding: 14, fontSize: 12, color: '#ef4444' }, children: '❌ ' + detail.error }),

        detail && !detail.error &&
          jsxs('div', { style: { padding: 12 },
            children: [
              // Header
              jsxs('div', {
                style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
                children: [
                  jsx('span', { style: { color: '#58a6ff', fontSize: 13, fontWeight: 600 }, children: detail.code || detail.id }),
                ],
              }),

              // Name
              jsx('div', { style: { fontSize: 14, fontWeight: 600, color: '#ddd', marginBottom: 8, lineHeight: 1.3 }, children: detail.name }),

              // Status
              jsx('div', { style: { marginBottom: 8 },
                children: jsx('span', { style: { fontSize: 10, padding: '2px 8px', borderRadius: 4, backgroundColor: '#333', color: '#aaa', display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: STATUS_ICONS[detail.status] || ICON_DOCUMENT_TEXT, className: 'size-3 shrink-0' }), ' ' + statusLabel(detail.status)] }),
              }),

              // Description (Markdown)
              jsxs('div', { style: { marginBottom: 8 },
                children: [
                  jsxs('div', { style: { fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 },
                    children: [
                      jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_DOCUMENT_TEXT, className: 'size-3 shrink-0' }), ' Descripción'] }),
                      !editingDesc && jsx('button', {
                        onClick: function (e) { e.preventDefault(); e.stopPropagation(); setEditContent(detail.content || ''); setEditingDesc(true) },
                        style: { background: 'none', border: '1px solid #888', borderRadius: 3, color: '#888', fontSize: 9, fontWeight: 600, padding: '1px 6px', cursor: 'pointer' },
                        children: 'Editar',
                      }),
                    ],
                  }),
                  editingDesc
                    ? jsxs('div', { children: [
                        jsx('textarea', {
                          value: editContent,
                          onChange: function (e) { setEditContent(e.target.value) },
                          style: { width: '100%', minHeight: 100, padding: 8, background: '#111', color: '#ccc', border: '1px solid #333', borderRadius: 4, fontSize: 12, outline: 'none', fontFamily: 'monospace', resize: 'vertical' },
                        }),
                        jsxs('div', { style: { display: 'flex', gap: 6, marginTop: 4 },
                          children: [
                            jsx('button', {
                              onClick: function (e) { e.preventDefault(); e.stopPropagation(); saveDescription() },
                              disabled: savingContent,
                              style: { padding: '4px 12px', background: '#3b82f6', border: 'none', borderRadius: 4, color: '#fff', fontSize: 11, fontWeight: 600, cursor: savingContent ? 'default' : 'pointer', opacity: savingContent ? 0.6 : 1 },
                              children: savingContent ? '⏳ Guardando...' : 'Guardar',
                            }),
                            jsx('button', {
                              onClick: function (e) { e.preventDefault(); e.stopPropagation(); setEditingDesc(false) },
                              style: { padding: '4px 12px', background: 'none', border: '1px solid #555', borderRadius: 4, color: '#888', fontSize: 11, cursor: 'pointer' },
                              children: 'Cancelar',
                            }),
                          ],
                        }),
                      ]})
                    : jsx('div', {
                        style: { fontSize: 12, color: '#ccc', lineHeight: 1.7, wordBreak: 'break-word', backgroundColor: '#141414', padding: '10px 12px', borderRadius: 4, border: '1px solid #222', maxHeight: 280, overflowY: 'auto' },
                        dangerouslySetInnerHTML: { __html: mdToHtml(detail.content || '') },
                      }),
                ],
              }),

              // Metadata
              jsxs('div', {
                style: { fontSize: 11, color: '#888', display: 'flex', gap: 10, flexWrap: 'wrap', borderTop: '1px solid #222', paddingTop: 8 },
                children: [
                  detail.owner && jsxs('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_USER, className: 'size-3 shrink-0' }), detail.owner.name || detail.owner.email || '?'] }),
                  detail.due_date && jsx('span', { style: { color: new Date(detail.due_date) < new Date() ? '#ef4444' : '#888', display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_CALENDAR, className: 'size-3 shrink-0' }), ' ' + timeAgo(detail.due_date)] }),
                  detail.updated_at && jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_ARROW_PATH, className: 'size-3 shrink-0' }), ' ' + timeAgo(detail.updated_at)] }),
                ],
              }),

              // ── Comments ──
              jsxs('div', {
                style: { marginTop: 10, borderTop: '1px solid #222', paddingTop: 8 },
                children: [
                  jsx('div', { style: { fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_CHAT_BUBBLE_LEFT, className: 'size-3 shrink-0' }), ' Comentarios (' + (comments ? comments.length : '...') + ')'] }),

                  !comments && !detailLoading &&
                    jsx('div', { style: { fontSize: 11, color: '#666' }, children: 'Cargando comentarios...' }),

                  comments && comments.length === 0 &&
                    jsx('div', { style: { fontSize: 11, color: '#666', marginBottom: 8 }, children: 'Sin comentarios' }),

                  comments && comments.length > 0 &&
                    jsx('div', { style: { marginBottom: 8 },
                      children: comments.map(function (c) {
                        var author = (c.author && (c.author.name || c.author.email)) || (c.user && (c.user.name || c.user.email)) || '?'
                        return jsxs('div', {
                          style: {
                            backgroundColor: '#141414',
                            border: '1px solid #222',
                            borderRadius: 4,
                            padding: '8px 10px',
                            marginBottom: 6,
                          },
                          children: [
                            jsxs('div', {
                              style: { fontSize: 10, color: '#888', marginBottom: 4, display: 'flex', justifyContent: 'space-between' },
                              children: [
                                jsx('span', { children: author }),
                                jsx('span', { children: c.created_at ? timeAgo(c.created_at) : '' }),
                              ],
                            }),
                            jsx('div', {
                              style: { fontSize: 12, color: '#ccc', lineHeight: 1.6, wordBreak: 'break-word' },
                              dangerouslySetInnerHTML: { __html: mdToHtml(c.content || c.text || '') },
                            }),
                          ],
                        }, c.id || c._id)
                      }),
                    }),

                  // Add comment
                  jsxs('div', {
                    style: { display: 'flex', gap: 6, alignItems: 'flex-start' },
                    children: [
                      jsx('textarea', {
                        value: commentText,
                        onChange: function (e) { setCommentText(e.target.value) },
                        placeholder: 'Escribe un comentario...',
                        rows: 2,
                        style: {
                          flex: 1,
                          backgroundColor: '#111',
                          color: '#ddd',
                          border: '1px solid #333',
                          borderRadius: 4,
                          padding: '6px 10px',
                          fontSize: 12,
                          outline: 'none',
                          fontFamily: 'inherit',
                          resize: 'vertical',
                          minHeight: 32,
                        },
                      }),
                      jsx('button', {
                        onClick: handleAddComment,
                        disabled: commenting || !commentText.trim(),
                        style: {
                          backgroundColor: commenting ? '#166' : '#238636',
                          color: 'white',
                          border: 'none',
                          borderRadius: 4,
                          padding: '6px 12px',
                          cursor: commenting ? 'default' : 'pointer',
                          fontSize: 11,
                          fontWeight: 600,
                          opacity: commenting || !commentText.trim() ? 0.5 : 1,
                          whiteSpace: 'nowrap',
                          alignSelf: 'flex-end',
                        },
                        children: commenting ? '⏳' : jsx(Icon, { path: ICON_CHAT_BUBBLE_LEFT, className: 'size-3.5 shrink-0' }),
                      }),
                    ],
                  }),
                ],
              }),

              // Link to Hub
              jsx('a', {
                href: itemUrl(detail),
                target: '_blank', rel: 'noopener noreferrer',
                style: { display: 'block', marginTop: 10, textAlign: 'center', fontSize: 11, color: '#58a6ff', textDecoration: 'none', padding: '6px', borderRadius: 4, backgroundColor: '#0d1117', border: '1px solid #30363d' },
                children: jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'center' }, children: [jsx(Icon, { path: ICON_ARROW_UP_RIGHT, className: 'size-3 shrink-0' }), ' Abrir en Hub — ' + (detail.code || detail.id)] }),
              }),
            ],
          }),
      ] : [
        // Header
        jsxs('div', {
          style: {
            padding: '8px 12px',
            borderBottom: '1px solid #333',
            fontSize: 11,
            color: '#888',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          },
          children: [
            jsx('span', { style: { fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_CHECK_BADGE, className: 'size-3.5 shrink-0' }), ' Hub — ' + (data ? data.name : '')] }),
            jsxs('span', {
              style: { display: 'flex', gap: 8 },
              children: [
                jsx('button', {
                  onClick: function () { setCreating(true) },
                  style: {
                    background: 'none',
                    border: '1px solid #555',
                    color: '#3fb950',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '0 8px',
                    borderRadius: 4,
                    lineHeight: '18px',
                  },
                  title: 'Crear track o tarea',
                  children: '+ Nueva',
                }),
                jsx('button', {
                  onClick: function () {
                    lastFetch.current = 0
                    loadData()
                  },
                  style: {
                    background: 'none',
                    border: 'none',
                    color: '#58a6ff',
                    cursor: 'pointer',
                    fontSize: 11,
                    padding: 0,
                    opacity: loading ? 0.5 : 1,
                  },
                  children: loading ? '↻ ...' : jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_ARROW_PATH, className: 'size-3 shrink-0' }), 'Actualizar'] }),
                }),
              ],
            }),
          ],
        }),

        allStatuses.map(function (status) {
          var isCollapsed = !!collapsed[status]
          return jsxs('div', {
            children: [
              jsx('div', {
                onClick: function () { toggleCollapsed(status) },
                style: {
                  padding: '6px 12px',
                  fontSize: 11,
                  color: '#ddd',
                  fontWeight: 600,
                  borderBottom: '1px solid #222',
                  backgroundColor: '#141414',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  userSelect: 'none',
                },
                children: [
                  jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: STATUS_ICONS[status] || ICON_DOCUMENT_TEXT, className: 'size-3.5 shrink-0' }), ' ' + statusLabel(status) + ' (' + grouped[status].length + ')'] }),
                  jsx('span', { style: { fontSize: 10, color: '#888' }, children: isCollapsed ? '▶' : '▼' }),
                ],
              }),
              !isCollapsed && jsx('div', { children: grouped[status].map(function (item) { return renderItem(item) }) }),
            ],
          }, status)
        }),

        !hasContent &&
          jsx('div', {
            style: { padding: 20, textAlign: 'center', fontSize: 12, color: '#888' },
            children: '✅ No hay work items activos',
          }),
      ],
    ],
  })
}
