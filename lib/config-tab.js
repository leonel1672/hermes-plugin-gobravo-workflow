function ConfigTab({ hubToken, githubToken, webhookUrl, onSave }) {
  var hubRef = useRef(null)
  var ghRef = useRef(null)
  var whRef = useRef(null)
  var prMsgRef = useRef(null)

  var _r = useState(function () { return loadTrackRules() })
  var initialRules = _r[0]

  var _p = useState(function () {
    var init = {}
    TRANSITIONS.forEach(function (t) {
      var c = initialRules[t.key]
      if (c && c.provider) init[t.key] = (c.provider === 'Token Gate') ? 'tokengate' : c.provider
    })
    return init
  })
  var providers = _p[0]
  var setProviders = _p[1]

  var _c = useState({ backlog_to_shaping: true })
  var openCards = _c[0]
  var setOpenCards = _c[1]

  // Referencias URL por transición
  var _rf = useState(function () {
    var init = {}
    TRANSITIONS.forEach(function (t) {
      var c = initialRules[t.key]
      init[t.key] = (c && Array.isArray(c.refs)) ? c.refs.slice() : []
    })
    return init
  })
  var refs = _rf[0]
  var setRefs = _rf[1]

  var _t = useState('tracks')
  var activeTab = _t[0]
  var setActiveTab = _t[1]

  // Catálogo real de proveedores/modelos (model.options del gateway)
  var _cat = useState(null)
  var catalog = _cat[0]
  var setCatalog = _cat[1]

  useEffect(function () {
    host.request('model.options', { explicit_only: true })
      .then(function (data) {
        if (data && Array.isArray(data.providers)) setCatalog(data)
      })
      .catch(function () {})
  }, [])

  var ruleRefs = {}
  var modelRefs = {}
  TRANSITIONS.forEach(function (t) {
    ruleRefs[t.key] = useRef(null)
    modelRefs[t.key] = useRef(null)
  })

  function handleSaveRules() {
    var rules = {}
    TRANSITIONS.forEach(function (t) {
      rules[t.key] = {
        rules: (ruleRefs[t.key].current && ruleRefs[t.key].current.value) || '',
        provider: providers[t.key] || '',
        model: (modelRefs[t.key].current && modelRefs[t.key].current.value) || '',
        refs: (refs[t.key] || []).map(function (r) { return (r || '').trim() }).filter(Boolean),
      }
    })
    saveTrackRules(rules)
    host.notify('✅ Reglas guardadas')
  }

  function handleSaveHubToken() {
    var hub = (hubRef.current && hubRef.current.value) || loadStr(STORAGE_HUB_TOKEN) || ''
    var gh = loadStr(STORAGE_GITHUB_TOKEN) || ''
    var wh = loadStr(STORAGE_WEBHOOK_URL) || ''
    onSave(hub, gh, wh)
    host.notify('✅ Token de Hub guardado')
  }

  function handleSavePRMessage() {
    var val = (prMsgRef.current && prMsgRef.current.value) || ''
    saveStr(STORAGE_PR_MESSAGE, val.trim())
    host.notify(val.trim() ? '✅ Mensaje de Google Chat guardado' : '✅ Mensaje restablecido al predeterminado')
  }

  function handleSavePRCreds() {
    var hub = loadStr(STORAGE_HUB_TOKEN) || ''
    var gh = (ghRef.current && ghRef.current.value) || loadStr(STORAGE_GITHUB_TOKEN) || ''
    var wh = (whRef.current && whRef.current.value) || loadStr(STORAGE_WEBHOOK_URL) || ''
    onSave(hub, gh, wh)
    host.notify('✅ Credenciales de PRs guardadas')
  }

  function toggleCard(key) {
    var next = Object.assign({}, openCards)
    next[key] = !openCards[key]
    setOpenCards(next)
  }

  function updateRef(t, i, val) {
    var next = Object.assign({}, refs)
    var arr = (next[t.key] || []).slice()
    arr[i] = val
    next[t.key] = arr
    setRefs(next)
  }

  function addRef(t) {
    var next = Object.assign({}, refs)
    var arr = (next[t.key] || []).slice()
    arr.push('')
    next[t.key] = arr
    setRefs(next)
  }

  function removeRef(t, i) {
    var next = Object.assign({}, refs)
    var arr = (next[t.key] || []).slice()
    arr.splice(i, 1)
    next[t.key] = arr
    setRefs(next)
  }

  function modelsForProvider(provider) {
    if (provider && catalog && Array.isArray(catalog.providers)) {
      for (var i = 0; i < catalog.providers.length; i++) {
        if (catalog.providers[i].slug === provider) {
          var ms = catalog.providers[i].models
          if (Array.isArray(ms) && ms.length) return ms
          break
        }
      }
    }
    return (MODEL_OPTIONS[provider] || []).slice()
  }

  function modelField(t) {
    var provider = providers[t.key] || ''
    var saved = (initialRules[t.key] || {}).model || ''
    var models = modelsForProvider(provider)
    if (models.length) {
      return jsx('select', {
        ref: modelRefs[t.key],
        defaultValue: saved,
        style: Object.assign({}, inputStyle, { fontSize: 11, cursor: 'pointer' }),
        children: [
          jsx('option', { value: '', children: 'Selecciona modelo…' }),
          models.map(function (m) { return jsx('option', { value: m, children: m }, m) }),
        ],
      }, provider || 'none')
    }
    return jsx('input', {
      ref: modelRefs[t.key],
      type: 'text',
      defaultValue: saved,
      placeholder: provider === 'openrouter' ? 'ej: anthropic/claude-sonnet-4' : 'Escribe el modelo manualmente…',
      style: Object.assign({}, inputStyle, { fontSize: 11 }),
    }, provider || 'none')
  }

  function trackCard(t) {
    var open = !!openCards[t.key]
    var saved = initialRules[t.key] || {}
    return jsxs('div', {
      style: { border: '1px solid #333', borderRadius: 6, marginBottom: 8, overflow: 'hidden' },
      children: [
        jsxs('div', {
          onClick: function () { toggleCard(t.key) },
          style: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', cursor: 'pointer', backgroundColor: '#161b22', userSelect: 'none' },
          children: [
            jsx('span', { style: { fontSize: 11, fontWeight: 600, color: '#ddd' }, children: t.from }),
            jsx('span', { style: { display: 'inline-flex', color: '#3fb950' }, children: jsx(Icon, { path: ICON_ARROW_RIGHT, className: 'size-3.5 shrink-0' }) }),
            jsx('span', { style: { fontSize: 11, fontWeight: 600, color: '#ddd' }, children: t.to }),
            jsx('span', { style: { fontSize: 10, color: '#666', whiteSpace: 'nowrap' }, children: t.subtitle }),
            jsx('span', { style: { marginLeft: 'auto', fontSize: 10, color: '#888' }, children: open ? '▾' : '▸' }),
          ],
        }),
        open && jsxs('div', {
          style: { padding: '8px 10px', borderTop: '1px solid #222' },
          children: [
            jsx('label', { style: { fontSize: 10, color: '#888', display: 'block', marginBottom: 3 }, children: 'Reglas' }),
            jsx('textarea', {
              ref: ruleRefs[t.key],
              defaultValue: saved.rules || '',
              placeholder: 'Instrucciones extra para el análisis en esta transición…',
              style: { width: '100%', boxSizing: 'border-box', backgroundColor: '#111', color: '#ddd', border: '1px solid #333', borderRadius: 4, padding: '6px 10px', fontSize: 11, minHeight: 52, outline: 'none', resize: 'vertical', fontFamily: 'inherit' },
            }),
            jsxs('div', { style: { display: 'flex', gap: 6, marginTop: 6 }, children: [
              jsxs('div', { style: { flex: 1 }, children: [
                jsx('label', { style: { fontSize: 10, color: '#888', display: 'block', marginBottom: 3 }, children: 'Proveedor' }),
                jsx('select', {
                  value: providers[t.key] || '',
                  onChange: function (e) {
                    var next = Object.assign({}, providers)
                    next[t.key] = e.target.value
                    setProviders(next)
                  },
                  style: Object.assign({}, inputStyle, { fontSize: 11, cursor: 'pointer' }),
                  children: [
                    jsx('option', { value: '', children: 'Selecciona…' }),
                    (catalog && Array.isArray(catalog.providers) && catalog.providers.length
                      ? catalog.providers
                      : [{ slug: 'tokengate' }, { slug: 'deepseek' }, { slug: 'openrouter' }]
                    ).map(function (p) {
                      return jsx('option', { value: p.slug, children: p.name || p.slug }, p.slug)
                    }),
                  ],
                }),
              ]}),
              jsxs('div', { style: { flex: 1 }, children: [
                jsx('label', { style: { fontSize: 10, color: '#888', display: 'block', marginBottom: 3 }, children: 'Modelo' }),
                modelField(t),
              ]}),
            ]}),
            // Referencias URL
            jsx('div', { style: { marginTop: 8 }, children: jsxs('div', { children: [
                jsx('label', { style: { fontSize: 10, color: '#888', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }, children: [jsx(Icon, { path: ICON_LINK, className: 'size-3 shrink-0' }), ' Referencias (URLs — opcional)'] }),
                (refs[t.key] || []).map(function (url, i) {
                  return jsxs('div', { style: { display: 'flex', gap: 4, marginBottom: 4 }, children: [
                    jsx('input', {
                      type: 'text',
                      value: url,
                      onChange: function (e) { updateRef(t, i, e.target.value) },
                      placeholder: 'https://guia-de-estilos.github.io/…',
                      style: Object.assign({}, inputStyle, { fontSize: 11, flex: 1 }),
                    }),
                    jsx('button', {
                      onClick: function () { removeRef(t, i) },
                      title: 'Quitar referencia',
                      style: { background: 'none', border: '1px solid #555', color: '#888', borderRadius: 4, padding: '2px 7px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' },
                      children: jsx(Icon, { path: ICON_X_MARK, className: 'size-3 shrink-0' }),
                    }),
                  ] }, t.key + '-ref-' + i)
                }),
                jsx('button', {
                  onClick: function () { addRef(t) },
                  style: { background: 'none', border: '1px solid #333', color: '#58a6ff', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 },
                  children: [jsx(Icon, { path: ICON_PLUS, className: 'size-3 shrink-0' }), ' Agregar URL'],
                }),
              ]})}),
          ],
        }),
      ],
    }, t.key)
  }

  return jsxs('div', {
    style: { padding: 14 },
    children: [
      jsx('div', { style: { fontSize: 12, fontWeight: 600, color: '#ddd', marginBottom: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_COG_8_TOOTH, className: 'size-3.5 shrink-0' }), ' Configuración'] }),
      // Pills: APIs / Tracks / PRs (próximamente)
      jsxs('div', { style: { display: 'flex', gap: 6, marginBottom: 14 }, children: [
          jsx('div', { onClick: function () { setActiveTab('tracks') }, style: { padding: '4px 14px', borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, backgroundColor: activeTab === 'tracks' ? '#238636' : '#1c1c1c', color: activeTab === 'tracks' ? '#fff' : '#8b949e' }, children: [jsx(Icon, { path: ICON_CHECK_BADGE, className: 'size-3 shrink-0' }), ' Tracks'] }),
        jsx('div', { onClick: function () { setActiveTab('prs') }, style: { padding: '4px 14px', borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, backgroundColor: activeTab === 'prs' ? '#238636' : '#1c1c1c', color: activeTab === 'prs' ? '#fff' : '#8b949e' }, children: [jsx(Icon, { path: ICON_MAGNIFYING_GLASS, className: 'size-3 shrink-0' }), ' PRs'] }),
        jsx('div', { onClick: function () { setActiveTab('task') }, style: { padding: '4px 14px', borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, backgroundColor: activeTab === 'task' ? '#238636' : '#1c1c1c', color: activeTab === 'task' ? '#fff' : '#8b949e' }, children: [jsx(Icon, { path: ICON_CLIPBOARD_DOCUMENT_LIST, className: 'size-3 shrink-0' }), ' Task'] }),
      ]}),
      activeTab === 'tracks' && jsxs('div', { children: [
      // Reglas de análisis por transición de estado
      jsxs('div', { style: { marginTop: 4, marginBottom: 12 }, children: [
        jsx('div', { style: { fontSize: 11, fontWeight: 600, color: '#ddd', marginBottom: 8 }, children: 'Reglas de análisis por transición' }),
        TRANSITIONS.map(function (t) { return trackCard(t) }),
      ]}),
      jsx('div', { style: { display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }, children: jsx('button', {
        onClick: handleSaveRules,
        style: { backgroundColor: '#238636', color: 'white', border: 'none', borderRadius: 3, padding: '1px 8px', cursor: 'pointer', fontSize: 9, fontWeight: 600, lineHeight: '14px' },
        children: 'Guardar reglas',
      })}),
      jsx('div', { style: { borderTop: '1px solid #2a2a2a', margin: '14px 0 12px' } }),
      jsx('div', { style: { fontSize: 11, fontWeight: 600, color: '#ddd', marginBottom: 8 }, children: 'Credenciales' }),
      // Hub API Token
      jsxs('div', { style: { marginBottom: 10 },
        children: [
          jsx('label', { style: { fontSize: 10, color: '#888', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }, children: [jsx(Icon, { path: ICON_KEY, className: 'size-3 shrink-0' }), ' Hub API Token'] }),
          jsx('input', {
            ref: hubRef,
            type: 'password',
            defaultValue: hubToken,
            placeholder: 'hub_xxxxxxxxxxxxxxxx',
            style: inputStyle,
            onKeyDown: function (e) { if (e.key === 'Enter') handleSaveHubToken() },
          }),
        ],
      }),
      jsx('div', { style: { display: 'flex', justifyContent: 'flex-end' }, children: jsx('button', {
        onClick: handleSaveHubToken,
        style: { backgroundColor: '#238636', color: 'white', border: 'none', borderRadius: 3, padding: '1px 8px', cursor: 'pointer', fontSize: 9, fontWeight: 600, lineHeight: '14px' },
        children: 'Guardar token',
      })}),
      ]}),
      activeTab === 'prs' && jsxs('div', { children: [
        jsx('div', { style: { fontSize: 11, fontWeight: 600, color: '#ddd', marginBottom: 8 }, children: 'Mensaje para Google Chat' }),
        jsx('textarea', {
          ref: prMsgRef,
          defaultValue: loadStr(STORAGE_PR_MESSAGE) || PR_MESSAGE_DEFAULT,
          placeholder: PR_MESSAGE_DEFAULT,
          style: { width: '100%', boxSizing: 'border-box', backgroundColor: '#111', color: '#ddd', border: '1px solid #333', borderRadius: 4, padding: '6px 10px', fontSize: 11, minHeight: 80, outline: 'none', resize: 'vertical', fontFamily: 'inherit', marginBottom: 6 },
        }),
        jsx('div', { style: { fontSize: 10, color: '#888', marginBottom: 10, lineHeight: 1.5 }, children: 'Variables: {title} · {url} · {number} · {repo} — se reemplazan al enviar el aviso. Si dejas el campo vacío se usa el mensaje predeterminado.' }),
        jsx('div', { style: { display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }, children: jsx('button', {
          onClick: handleSavePRMessage,
          style: { backgroundColor: '#238636', color: 'white', border: 'none', borderRadius: 3, padding: '1px 8px', cursor: 'pointer', fontSize: 9, fontWeight: 600, lineHeight: '14px' },
          children: 'Guardar mensaje',
        })}),
        jsx('div', { style: { borderTop: '1px solid #2a2a2a', margin: '14px 0 12px' } }),
        jsx('div', { style: { fontSize: 11, fontWeight: 600, color: '#ddd', marginBottom: 8 }, children: 'Credenciales' }),
        // GitHub Token
        jsxs('div', { style: { marginBottom: 10 },
          children: [
            jsx('label', { style: { fontSize: 10, color: '#888', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }, children: [jsx(Icon, { path: ICON_KEY, className: 'size-3 shrink-0' }), ' GitHub Token'] }),
            jsx('input', {
              ref: ghRef,
              type: 'password',
              defaultValue: githubToken,
              placeholder: '«redacted:ghp_…»',
              style: inputStyle,
              onKeyDown: function (e) { if (e.key === 'Enter') handleSavePRCreds() },
            }),
          ],
        }),
        // Webhook URL
        jsxs('div', { style: { marginBottom: 10 },
          children: [
            jsx('label', { style: { fontSize: 10, color: '#888', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }, children: [jsx(Icon, { path: ICON_LINK, className: 'size-3 shrink-0' }), ' Webhook URL (opcional — notificaciones de PR)'] }),
            jsx('input', {
              ref: whRef,
              type: 'text',
              defaultValue: webhookUrl,
              placeholder: 'https://hooks.example.com/...',
              style: inputStyle,
              onKeyDown: function (e) { if (e.key === 'Enter') handleSavePRCreds() },
            }),
          ],
        }),
        jsx('div', { style: { display: 'flex', justifyContent: 'flex-end' }, children: jsx('button', {
          onClick: handleSavePRCreds,
          style: { backgroundColor: '#238636', color: 'white', border: 'none', borderRadius: 3, padding: '1px 8px', cursor: 'pointer', fontSize: 9, fontWeight: 600, lineHeight: '14px' },
          children: 'Guardar credenciales',
        })}),
      ]}),
      activeTab === 'task' && jsxs('div', { children: [
        jsx(SquadPickerView, {
          token: hubToken,
          selected: loadSelectedSquads(),
          onSave: function () { host.notify('✅ Equipos guardados') },
          onClose: function () {},
          embedded: true,
        }),
        jsx('div', { style: { fontSize: 10, color: '#888', marginTop: 8, lineHeight: 1.5 }, children: 'Estos equipos se usan para filtrar la búsqueda en la pestaña de tickets.' }),
      ]}),
    ],
  })
}

var inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  backgroundColor: '#111',
  color: '#ddd',
  border: '1px solid #333',
  borderRadius: 4,
  padding: '6px 10px',
  fontSize: 12,
  outline: 'none',
}

// Transiciones de estado configurables (cards colapsables)
var TRANSITIONS = [
  { key: 'backlog_to_shaping', from: 'Backlog', to: 'Shaping', subtitle: 'Análisis de alto nivel' },
  { key: 'shaping_to_todo', from: 'Shaping', to: 'Todo', subtitle: 'Análisis profundo + crear tasks' },
  { key: 'todo_to_in_progress', from: 'Todo', to: 'In Progress', subtitle: 'Ejecución del track' },
  { key: 'in_progress_to_review', from: 'In Progress', to: 'Review', subtitle: 'Cierre y validación final' },
]

var MODEL_OPTIONS = {
  tokengate: ['coder', 'coder-sr', 'coder-jr', 'auxiliar'],
  deepseek: ['deepseek-v4-flash', 'deepseek-reasoner'],
}

// ── Placeholder tabs ───────────────────────────────────────────────
