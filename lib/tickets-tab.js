function CreateForm({ token, onClose, onCreated }) {
  var _a = useState('track')
  var type = _a[0]
  var setType = _a[1]

  var _b = useState('')
  var name = _b[0]
  var setName = _b[1]

  var _c = useState('')
  var squadId = _c[0]
  var setSquadId = _c[1]

  var _d = useState(null)
  var squads = _d[0]
  var setSquads = _d[1]

  var _e = useState('medium')
  var priority = _e[0]
  var setPriority = _e[1]

  var _f = useState('new_feature')
  var trackType = _f[0]
  var setTrackType = _f[1]

  var _g = useState('')
  var dueDate = _g[0]
  var setDueDate = _g[1]

  var _h = useState('')
  var description = _h[0]
  var setDescription = _h[1]

  var _i = useState(false)
  var submitting = _i[0]
  var setSubmitting = _i[1]

  useEffect(function () {
    if (!token) return
    fetchSquads(token).then(function (data) {
      var list = (data && data.squads) || []
      if (Array.isArray(list)) setSquads(list)
    }).catch(function () {})
  }, [token])

  var handleSubmit = function () {
    if (!name.trim()) {
      host.notifyError('❌ El nombre es obligatorio')
      return
    }
    setSubmitting(true)
    try {
      var args = {
        type: type,
        name: name.trim(),
      }
      if (squadId) args.squad_id = squadId
      args.metadata = { priority: priority }
      if (type === 'track') {
        args.metadata.track_type = trackType
      }
      if (dueDate.trim()) args.due_date = dueDate.trim()
      if (description.trim()) args.content = description.trim()

      mcpCall(token, 'tracker', 'create_workitem', args)
        .then(function () {
          host.notify('✅ ' + type + ' creado: ' + name.trim())
          onCreated()
        })
        .catch(function (err) {
          host.notifyError('Error al crear: ' + err.message)
        })
        .finally(function () { setSubmitting(false) })
    } catch (err) {
      host.notifyError('Error al crear: ' + err.message)
      setSubmitting(false)
    }
  }

  function inputStyle() {
    return {
      backgroundColor: '#111',
      color: '#ddd',
      border: '1px solid #333',
      borderRadius: 4,
      padding: '6px 10px',
      fontSize: 12,
      outline: 'none',
      width: '100%',
      boxSizing: 'border-box',
    }
  }

  function labelStyle() {
    return { fontSize: 11, color: '#888', fontWeight: 600 }
  }

  function selectStyle() {
    return Object.assign({}, inputStyle(), { cursor: 'pointer' })
  }

  return jsxs('div', {
    style: { padding: 14 },
    children: [
      jsx('div', {
        style: { fontSize: 13, color: '#ddd', fontWeight: 600, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
        children: [
          jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_SPARKLES, className: 'size-3.5 shrink-0' }), ' Nuevo work item'] }),
          jsx('button', {
            onClick: onClose,
            style: { background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, padding: 0 },
            children: jsx(Icon, { path: ICON_X_MARK, className: 'size-3.5 shrink-0' }),
          }),
        ],
      }),
      jsxs('div', {
        style: { display: 'flex', flexDirection: 'column', gap: 10 },
        children: [
          // Type selector
          jsxs('div', {
            children: [
              jsx('div', { style: labelStyle(), children: 'Tipo' }),
              jsxs('div', {
                style: { display: 'flex', gap: 8, marginTop: 4 },
                children: [
                  jsx('button', {
                    onClick: function () { setType('track') },
                    style: {
                      flex: 1,
                      padding: '4px 0',
                      borderRadius: 4,
                      border: '1px solid ' + (type === 'track' ? '#3fb950' : '#333'),
                      backgroundColor: type === 'track' ? '#1a3a1a' : 'transparent',
                      color: type === 'track' ? '#3fb950' : '#888',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 600,
                    },
                    children: '🎯 Track',
                  }),
                  jsx('button', {
                    onClick: function () { setType('task') },
                    style: {
                      flex: 1,
                      padding: '4px 0',
                      borderRadius: 4,
                      border: '1px solid ' + (type === 'task' ? '#58a6ff' : '#333'),
                      backgroundColor: type === 'task' ? '#1a2a3a' : 'transparent',
                      color: type === 'task' ? '#58a6ff' : '#888',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 600,
                    },
                    children: '📋 Task',
                  }),
                ],
              }),
            ],
          }),
          // Name
          jsxs('div', {
            children: [
              jsx('div', { style: labelStyle(), children: 'Nombre *' }),
              jsx('input', {
                value: name,
                onChange: function (e) { setName(e.target.value) },
                placeholder: 'feat: título descriptivo',
                style: Object.assign({}, inputStyle(), { marginTop: 4 }),
                onKeyDown: function (e) { if (e.key === 'Enter' && !submitting) handleSubmit() },
                disabled: submitting,
              }),
            ],
          }),
          // Squad
          jsxs('div', {
            children: [
              jsx('div', { style: labelStyle(), children: 'Squad' }),
              jsx('select', {
                value: squadId,
                onChange: function (e) { setSquadId(e.target.value) },
                style: Object.assign({}, selectStyle(), { marginTop: 4 }),
                disabled: submitting,
                children: [
                  jsx('option', { value: '', children: '— Sin squad —' }),
                  squads && squads.map(function (s) {
                    return jsx('option', { value: s.id, children: s.name + (s.member_count ? ' (' + s.member_count + ')' : '') }, s.id)
                  }),
                ],
              }),
            ],
          }),
          // Priority
          jsxs('div', {
            children: [
              jsx('div', { style: labelStyle(), children: 'Prioridad' }),
              jsx('select', {
                value: priority,
                onChange: function (e) { setPriority(e.target.value) },
                style: Object.assign({}, selectStyle(), { marginTop: 4 }),
                disabled: submitting,
                children: [
                  jsx('option', { value: 'low', children: '🟢 Baja' }),
                  jsx('option', { value: 'medium', children: '🟡 Media' }),
                  jsx('option', { value: 'high', children: '🔴 Alta' }),
                ],
              }),
            ],
          }),
          // Track type (only for tracks)
          type === 'track' && jsxs('div', {
            children: [
              jsx('div', { style: labelStyle(), children: 'Tipo de track' }),
              jsx('select', {
                value: trackType,
                onChange: function (e) { setTrackType(e.target.value) },
                style: Object.assign({}, selectStyle(), { marginTop: 4 }),
                disabled: submitting,
                children: [
                  jsx('option', { value: 'new_feature', children: '🚀 Nueva funcionalidad' }),
                  jsx('option', { value: 'enhancement', children: '✨ Mejora' }),
                  jsx('option', { value: 'bug', children: '🐛 Bug' }),
                  jsx('option', { value: 'chore', children: '🧹 Chore' }),
                  jsx('option', { value: 'hotfix', children: '🔥 Hotfix' }),
                ],
              }),
            ],
          }),
          // Due date
          jsxs('div', {
            children: [
              jsx('div', { style: labelStyle(), children: 'Fecha límite' }),
              jsx('input', {
                value: dueDate,
                onChange: function (e) { setDueDate(e.target.value) },
                placeholder: 'YYYY-MM-DD (opcional)',
                style: Object.assign({}, inputStyle(), { marginTop: 4 }),
                disabled: submitting,
              }),
            ],
          }),
          // Description
          jsxs('div', {
            children: [
              jsx('div', { style: labelStyle(), children: 'Descripción' }),
              jsx('textarea', {
                value: description,
                onChange: function (e) { setDescription(e.target.value) },
                placeholder: 'Descripción opcional...',
                rows: 3,
                style: Object.assign({}, inputStyle(), { marginTop: 4, resize: 'vertical', fontFamily: 'inherit' }),
                disabled: submitting,
              }),
            ],
          }),
          // Submit
          jsxs('div', {
            style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 },
            children: [
              jsx('button', {
                onClick: onClose,
                style: {
                  backgroundColor: 'transparent',
                  color: '#888',
                  border: '1px solid #333',
                  borderRadius: 4,
                  padding: '6px 14px',
                  cursor: 'pointer',
                  fontSize: 12,
                },
                children: 'Cancelar',
              }),
              jsx('button', {
                onClick: handleSubmit,
                disabled: submitting || !name.trim(),
                style: {
                  backgroundColor: submitting ? '#166' : '#238636',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  padding: '6px 14px',
                  cursor: submitting ? 'default' : 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  opacity: submitting ? 0.6 : 1,
                },
                children: submitting ? '⏳ Creando...' : jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_SPARKLES, className: 'size-3.5 shrink-0' }), ' Crear'] }),
              }),
            ],
          }),
        ],
      }),
    ],
  })
}

// ── Markdown to HTML ────────────────────────────────────────────────

function loadSelectedSquads() {
  try {
    var raw = loadStr(STORAGE_TICKETS_SQUADS)
    if (raw) {
      var parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {}
  return [
    'd2c8c81b-826f-44cf-adcc-fc56e2170893',
    'b261b0b3-d79e-447f-ab0f-9b40ad10c61e',
    '2f5a632d-b6bb-4dbb-ad30-f631c4e07a01',
    '8e41c8ce-6024-4a15-925f-a521245a2f39',
  ]
}

function saveSelectedSquads(ids) {
  saveStr(STORAGE_TICKETS_SQUADS, JSON.stringify(ids))
}

// ── SquadPickerView ─────────────────────────────────────────────────

function SquadPickerView({ token, selected, onSave, onClose, embedded }) {
  var _a = useState(null)
  var squads = _a[0]
  var setSquads = _a[1]
  var _b = useState(false)
  var loading = _b[0]
  var setLoading = _b[1]
  var _c = useState(null)
  var error = _c[0]
  var setError = _c[1]
  var _d = useState({})
  var checked = _d[0]
  var setChecked = _d[1]

  useEffect(function () {
    var init = {}
    for (var si = 0; si < selected.length; si++) {
      init[selected[si]] = true
    }
    setChecked(init)
  }, [])

  useEffect(function () {
    if (!token) return
    setLoading(true)
    mcpCall(token, 'teams', 'squads_list', {})
      .then(function (data) {
        var list = data && data.squads || []
        list.sort(function (a, b) { return a.name.localeCompare(b.name) })
        setSquads(list)
      })
      .catch(function (err) { setError(err.message) })
      .finally(function () { setLoading(false) })
  }, [token])

  function toggle(id) {
    setChecked(function (prev) {
      var next = Object.assign({}, prev)
      next[id] = !next[id]
      return next
    })
  }

  function selectAll() {
    if (!squads) return
    var all = {}
    for (var si = 0; si < squads.length; si++) {
      all[squads[si].id] = true
    }
    setChecked(all)
  }

  function deselectAll() {
    setChecked({})
  }

  function handleSave() {
    var ids = []
    var keys = Object.keys(checked)
    for (var ki = 0; ki < keys.length; ki++) {
      if (checked[keys[ki]]) ids.push(keys[ki])
    }
    saveSelectedSquads(ids)
    onSave(ids)
  }

  var selectedCount = 0
  var cKeys = Object.keys(checked)
  for (var cki = 0; cki < cKeys.length; cki++) {
    if (checked[cKeys[cki]]) selectedCount++
  }

  var squadPickerStyles = {
    backgroundColor: '#161616',
    border: '1px solid #333',
    borderRadius: '8px',
    overflowY: 'auto',
    maxHeight: 'calc(100vh - 60px)',
  }

  return jsxs('div', {
    style: squadPickerStyles,
    children: [
      // Header
      jsx('div', {
        style: { padding: '8px 12px', borderBottom: '1px solid #333', fontSize: 11, color: '#888', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
        children: [
          jsx('span', { style: { fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_COG_8_TOOTH, className: 'size-3.5 shrink-0' }), ' Equipos para búsqueda'] }),
          !embedded && jsx('button', {
            onClick: onClose,
            style: { background: 'none', border: 'none', color: '#58a6ff', cursor: 'pointer', fontSize: 11, padding: 0 },
            children: jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_ARROW_LEFT, className: 'size-3 shrink-0' }), ' Volver'] }),
          }),
        ],
      }),

      loading && jsx('div', { style: { padding: 20, textAlign: 'center', fontSize: 12, color: '#888' }, children: '⏳ Cargando equipos...' }),

      error && jsx('div', { style: { padding: 14, fontSize: 12, color: '#ef4444' }, children: '❌ Error: ' + error }),

      squads && jsxs('div', {
        children: [
          // Count + actions
          jsxs('div', {
            style: { padding: '6px 12px', fontSize: 11, color: '#888', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #222', backgroundColor: '#141414' },
            children: [
              jsx('span', { children: selectedCount + ' de ' + squads.length + ' equipos seleccionados' }),
              jsxs('div', { style: { display: 'flex', gap: 6 }, children: [
                jsx('button', {
                  onClick: selectAll,
                  style: { background: 'none', border: '1px solid #444', color: '#58a6ff', borderRadius: 3, padding: '2px 6px', cursor: 'pointer', fontSize: 10 },
                  children: 'Todo',
                }),
                jsx('button', {
                  onClick: deselectAll,
                  style: { background: 'none', border: '1px solid #444', color: '#888', borderRadius: 3, padding: '2px 6px', cursor: 'pointer', fontSize: 10 },
                  children: 'Ninguno',
                }),
              ]}),
            ],
          }),

          // Scrollable list
          jsx('div', {
            style: { maxHeight: 280, overflowY: 'auto' },
            children: squads.map(function (squad) {
              return jsx('div', {
                style: {
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
                  cursor: 'pointer', borderBottom: '1px solid #1a1a1a',
                },
                onClick: function () { toggle(squad.id) },
                onMouseEnter: function (e) { e.currentTarget.style.backgroundColor = '#2a2a2a' },
                onMouseLeave: function (e) { e.currentTarget.style.backgroundColor = 'transparent' },
                children: [
                  jsx('input', {
                    type: 'checkbox',
                    checked: !!checked[squad.id],
                    onChange: function () { toggle(squad.id) },
                    style: { accentColor: '#58a6ff', cursor: 'pointer' },
                  }),
                  jsxs('div', { style: { flex: 1, minWidth: 0 }, children: [
                    jsx('div', { style: { fontSize: 12, color: '#ccc' }, children: squad.name }),
                    jsx('div', { style: { fontSize: 10, color: '#888' }, children: (squad.member_count || 0) + ' miembros' }),
                  ]}),
                ],
              }, squad.id)
            }),
          }),

          // Save button
          jsx('div', {
            style: { padding: '8px 12px', borderTop: '1px solid #333' },
            children: jsx('button', {
              onClick: handleSave,
              style: { backgroundColor: '#238636', color: 'white', border: 'none', borderRadius: 4, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600, width: '100%' },
              children: jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'center' }, children: [jsx(Icon, { path: ICON_CHECK, className: 'size-3.5 shrink-0' }), ' Guardar (' + selectedCount + ' equipos)'] }),
            }),
          }),
        ],
      }),
    ],
  })
}

// ── CommentsModal ──────────────────────────────────────────────────

function TicketsTab({ hubToken }) {
  var _a = useState('search')
  var view = _a[0]
  var setView = _a[1]

  var _b = useState('')
  var query = _b[0]
  var setQuery = _b[1]

  var _c = useState(null)  // null = loading, [] = loaded empty
  var allTasks = _c[0]
  var setAllTasks = _c[1]

  var _d = useState(true)
  var loading = _d[0]
  var setLoading = _d[1]

  var _e = useState(null)
  var error = _e[0]
  var setError = _e[1]

  var _f = useState(null)
  var selectedId = _f[0]
  var setSelectedId = _f[1]

  var _g = useState(null)
  var detail = _g[0]
  var setDetail = _g[1]

  var _h = useState([])
  var comments = _h[0]
  var setComments = _h[1]

  var _i = useState(false)
  var detailLoading = _i[0]
  var setDetailLoading = _i[1]

  var inputRef = useRef(null)

  var _j = useState(function () { return loadSelectedSquads() })
  var squadIds = _j[0]
  var setSquadIds = _j[1]

  var _k = useState(null)  // ticket abierto en el modal de comentarios
  var commentsTicket = _k[0]
  var setCommentsTicket = _k[1]

  var _l = useState({})  // Set-like: { id: true } para items con comentarios
  var hasComments = _l[0]
  var setHasComments = _l[1]

  function checkCommentsBatch(items) {
    if (!items || !items.length) return
    var chunk = items.slice(0, 50)
    Promise.allSettled(chunk.map(function (item) {
      return mcpCall(hubToken, 'tracker', 'list_comments', { work_item_id: item.id })
        .then(function (data) {
          var list = (data && data.comments) || []
          if (list.length > 0) return item.id
          return null
        })
        .catch(function () { return null })
    })).then(function (results) {
      var next = {}
      for (var ri = 0; ri < results.length; ri++) {
        var id = results[ri].value
        if (id) next[id] = true
      }
      setHasComments(next)
    })
  }

  // Load all tasks from selected squads
  useEffect(function () {
    if (!hubToken || !squadIds.length) {
      setAllTasks([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    setSelectedId(null)
    setDetail(null)
    ;(async function () {
      var allFound = []
      for (var si = 0; si < squadIds.length; si++) {
        try {
          var data = await mcpCall(hubToken, 'tracker', 'list_workitems', {
            type: 'task',
            limit: 200,
            squad_id: squadIds[si],
          })
          var items = data && data.items || []
          for (var ii = 0; ii < items.length; ii++) {
            if (!allFound.some(function (f) { return f.id === items[ii].id })) {
              allFound.push(items[ii])
            }
          }
        } catch {}
      }
      setAllTasks(allFound)
      setLoading(false)
      checkCommentsBatch(allFound)
    })()
  }, [hubToken, squadIds])

  // Filter locally as user types (solo flujo activo, sin terminados)
  var activeStatuses = ['backlog', 'shaping', 'todo', 'in_progress', 'in_review', 'staging', 'problem_discovery', 'problem_validation']
  var lowerQuery = query.trim().toLowerCase()
  var baseTasks = allTasks
    ? allTasks.filter(function (item) { return activeStatuses.indexOf(item.status) >= 0 })
    : []
  var filteredTasks = lowerQuery
    ? baseTasks.filter(function (item) {
        var name = (item.name || '').toLowerCase()
        var code = (item.code || '').toLowerCase()
        return name.indexOf(lowerQuery) >= 0 || code.indexOf(lowerQuery) >= 0
      })
    : baseTasks

  var openDetail = useCallback(function (id) {
    setSelectedId(id)
    setDetailLoading(true)
    setDetail(null)
    setComments([])
    Promise.all([
      getDetail(hubToken, id),
      fetchComments(hubToken, id).catch(function () { return { comments: [] } }),
    ])
      .then(function (results) {
        setDetail(results[0])
        setComments(results[1] && results[1].comments || [])
      })
      .catch(function (err) {
        setDetail({ error: err.message })
      })
      .finally(function () { setDetailLoading(false) })
  }, [hubToken])

  // ── View: Search ──
  return jsxs('div', {
    children: [
      // Header
      jsx('div', {
        style: { padding: '8px 12px', borderBottom: '1px solid #333', fontSize: 11, color: '#888', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
        children: jsx('span', { style: { fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_TICKET, className: 'size-3.5 shrink-0' }), ' Buscar tickets'] }),
      }),

      // Search bar
      jsx('div', {
        style: { padding: '8px 12px', borderBottom: '1px solid #222' },
        children: jsx('input', {
          ref: inputRef,
          type: 'text',
          placeholder: 'Filtrar por nombre o código...',
          value: query,
          onChange: function (e) {
            setQuery(e.target.value)
            setSelectedId(null)
            setDetail(null)
          },
          style: {
            width: '100%', boxSizing: 'border-box', backgroundColor: '#111', color: '#ddd',
            border: '1px solid #333', borderRadius: 4, padding: '7px 10px', fontSize: 12, outline: 'none',
          },
        }),
      }),

      // Loading
      loading &&
        jsx('div', { style: { padding: 20, textAlign: 'center', fontSize: 12, color: '#888' }, children: '⏳ Cargando tickets de los equipos seleccionados...' }),

      // Error
      error &&
        jsx('div', { style: { padding: 14, fontSize: 12, color: '#ef4444' }, children: '❌ Error: ' + error }),

      // Loaded but empty
      !loading && allTasks && allTasks.length === 0 &&
        jsx('div', {
          style: { padding: 14, fontSize: 12, color: '#888', textAlign: 'center', lineHeight: 1.5 },
          children: jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'center' }, children: [jsx(Icon, { path: ICON_INBOX, className: 'size-3.5 shrink-0' }), ' No hay tickets en los equipos seleccionados.'] }),
        }),

      // No filter match
      !loading && allTasks && allTasks.length > 0 && lowerQuery && filteredTasks.length === 0 &&
        jsx('div', {
          style: { padding: 14, fontSize: 12, color: '#888', textAlign: 'center', lineHeight: 1.5 },
          children: jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'center' }, children: [jsx(Icon, { path: ICON_MAGNIFYING_GLASS, className: 'size-3.5 shrink-0' }), ' No hay tickets con "' + query + '"'] }),
        }),

      // Results list
      !loading && allTasks && allTasks.length > 0 && !selectedId &&
        jsxs('div', {
          children: [
            jsx('div', {
              style: { padding: '6px 12px', fontSize: 11, color: '#888', fontWeight: 600, borderBottom: '1px solid #222', backgroundColor: '#141414' },
              children: jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_CLIPBOARD_DOCUMENT_LIST, className: 'size-3 shrink-0' }), ' ' + (lowerQuery ? filteredTasks.length + ' de ' + baseTasks.length : baseTasks.length) + ' tareas'] }),
            }),
            jsx('div', {
              style: { maxHeight: 300, overflowY: 'auto' },
              children: (lowerQuery ? filteredTasks : baseTasks).map(function (item) {
                return jsx('div', {
                  style: {
                    display: 'flex', alignItems: 'center', borderBottom: '1px solid #1a1a1a',
                    cursor: 'pointer',
                  },
                  onClick: function () { openDetail(item.id) },
                  onMouseEnter: function (e) { e.currentTarget.style.backgroundColor = '#2a2a2a' },
                  onMouseLeave: function (e) { e.currentTarget.style.backgroundColor = 'transparent' },
                  children: [
                    jsx('div', {
                      style: { flex: 1, padding: '8px 12px', minWidth: 0 },
                      children: jsxs('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 8 },
                        children: [
                          jsxs('div', { style: { flex: 1, minWidth: 0 },
                            children: [
                              jsx('div', { style: { fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, children: item.name }),
                              jsxs('div', { style: { fontSize: 11, color: '#888', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center' },
                                children: [
                                  jsx('span', { style: { color: '#58a6ff' }, children: item.code || '' }),
                                  item.updated_at && jsx('span', { children: '· ' + timeAgo(item.updated_at) }),
                                  hasComments[item.id] && jsx('span', {
                                    onClick: function (e) { e.stopPropagation(); setCommentsTicket(item) },
                                    title: 'Ver comentarios',
                                    style: { color: '#888', cursor: 'pointer', fontSize: 13, lineHeight: '12px' },
                                    children: jsx(Icon, { path: ICON_CHAT_BUBBLE_LEFT, className: 'size-3.5 shrink-0' }),
                                  }),
                                ],
                              }),
                            ],
                          }),
                          statusPillEl(item.status),
                        ],
                      }),
                    }),
                  ],
                }, item.id)
              }),
            }),
          ],
        }),

      // Detail view
      selectedId &&
        jsxs('div', {
          children: [
            // Back button
            jsx('div', {
              style: { padding: '6px 12px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: 6 },
              children: jsx('button', {
                onClick: function () { setSelectedId(null); setDetail(null); setComments([]) },
                style: { background: 'none', border: 'none', color: '#58a6ff', cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: 0 },
                children: jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_ARROW_LEFT, className: 'size-3 shrink-0' }), ' Volver a resultados'] }),
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
                      jsx('span', { style: { display: 'inline-flex' }, children: jsx(Icon, { path: typeIcon(detail.type), className: 'size-5 shrink-0' }) }),
                      jsx('span', { style: { color: '#58a6ff', fontSize: 13, fontWeight: 600 }, children: detail.code || detail.id }),
                    ],
                  }),

                  // Name + copy button
                  jsxs('div', {
                    style: { fontSize: 14, fontWeight: 600, color: '#ddd', marginBottom: 8, lineHeight: 1.3, display: 'flex', gap: 8, alignItems: 'flex-start' },
                    children: [
                      jsx('span', { style: { flex: 1 }, children: detail.name }),
                      jsx('button', {
                        onClick: function () {
                          var text = [
                            (detail.code || detail.id) + ' — ' + detail.name,
                            'Estado: ' + statusLabel(detail.status),
                            detail.owner ? 'Owner: ' + (detail.owner.name || detail.owner.email) : null,
                            '',
                            detail.content || '',
                            '',
                            '↗ https://hub.gobravo.io/tracker/tasks/' + detail.id,
                          ].filter(Boolean).join('\n')
                          navigator.clipboard.writeText(text)
                            .then(function () { host.notify('✅ Copiado para compartir') })
                            .catch(function () { host.notifyError('❌ No se pudo copiar') })
                        },
                        style: { background: 'none', border: '1px solid #444', color: '#888', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 },
                        children: jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_CLIPBOARD_DOCUMENT_LIST, className: 'size-3 shrink-0' }), ' Copiar'] }),
                      }),
                    ],
                  }),

                  // Status
                  jsx('div', { style: { marginBottom: 8 },
                    children: statusBadgeEl(detail.status),
                  }),

                  // Description (Markdown)
                  detail.content &&
                    jsxs('div', { style: { marginBottom: 8 },
                      children: [
                        jsx('div', { style: { fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_DOCUMENT_TEXT, className: 'size-3 shrink-0' }), ' Descripción'] }),
                        jsx('div', {
                          style: { fontSize: 12, color: '#ccc', lineHeight: 1.7, wordBreak: 'break-word', backgroundColor: '#141414', padding: '10px 12px', borderRadius: 4, border: '1px solid #222', maxHeight: 280, overflowY: 'auto' },
                          dangerouslySetInnerHTML: { __html: mdToHtml(detail.content) },
                        }),
                      ],
                    }),

                  !detail.content &&
                    jsx('div', { style: { fontSize: 11, color: '#666', fontStyle: 'italic', marginBottom: 8 }, children: 'Sin descripción' }),

                  // Comments
                  comments.length > 0 &&
                    jsxs('div', { style: { marginBottom: 8 },
                      children: [
                        jsx('div', { style: { fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_CHAT_BUBBLE_LEFT, className: 'size-3 shrink-0' }), ' Comentarios (' + comments.length + ')'] }),
                        jsx('div', {
                          style: { maxHeight: 240, overflowY: 'auto' },
                          children: comments.map(function (c) {
                            return jsxs('div', {
                              style: { backgroundColor: '#141414', padding: '8px 12px', borderRadius: 4, border: '1px solid #222', marginBottom: 6 },
                              children: [
                                jsxs('div', {
                                  style: { fontSize: 10, color: '#888', marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
                                  children: [
                                    jsx('span', { children: c.user_name || c.user_email || 'Anónimo' }),
                                    jsx('span', { children: timeAgo(c.created_at) }),
                                  ],
                                }),
                                jsx('div', {
                                  style: { fontSize: 12, color: '#ccc', lineHeight: 1.7, wordBreak: 'break-word' },
                                  dangerouslySetInnerHTML: { __html: mdToHtml(c.content) },
                                }),
                              ],
                            }, c.id)
                          }),
                        }),
                      ],
                    }),

                  comments.length === 0 && !detailLoading &&
                    jsx('div', { style: { fontSize: 11, color: '#555', fontStyle: 'italic', marginBottom: 8 }, children: 'Sin comentarios' }),

                  // Metadata
                  jsxs('div', {
                    style: { fontSize: 11, color: '#888', display: 'flex', gap: 10, flexWrap: 'wrap', borderTop: '1px solid #222', paddingTop: 8 },
                    children: [
                      detail.owner && jsxs('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_USER, className: 'size-3 shrink-0' }), detail.owner.name || detail.owner.email || '?'] }),
                      detail.due_date && jsx('span', { style: { color: new Date(detail.due_date) < new Date() ? '#ef4444' : '#888', display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_CALENDAR, className: 'size-3 shrink-0' }), ' ' + timeAgo(detail.due_date)] }),
                      detail.updated_at && jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_ARROW_PATH, className: 'size-3 shrink-0' }), ' ' + timeAgo(detail.updated_at)] }),
                    ],
                  }),

                  // Link
                  jsx('a', {
                    href: 'https://hub.gobravo.io/tracker/tasks/' + detail.id,
                    target: '_blank', rel: 'noopener noreferrer',
                    style: { display: 'block', marginTop: 10, textAlign: 'center', fontSize: 11, color: '#58a6ff', textDecoration: 'none', padding: '6px', borderRadius: 4, backgroundColor: '#0d1117', border: '1px solid #30363d' },
                    children: jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'center' }, children: [jsx(Icon, { path: ICON_ARROW_UP_RIGHT, className: 'size-3 shrink-0' }), ' Abrir en Hub — ' + (detail.code || detail.id)] }),
                  }),
                ],
              }),
          ],
        }),

      // Modal de comentarios
      commentsTicket && jsx(CommentsModal, {
        token: hubToken,
        ticket: commentsTicket,
        onClose: function () { setCommentsTicket(null) },
      }),
    ],
  })
}

// ── SetupView ──────────────────────────────────────────────────────
