function StatsTab({ hubToken, role, avatar }) {
  var _a = useState(null)
  var data = _a[0]
  var setData = _a[1]

  var _b = useState(false)
  var loading = _b[0]
  var setLoading = _b[1]

  var _c = useState(null)
  var err = _c[0]
  var setErr = _c[1]

  function loadData() {
    if (!hubToken) return
    setLoading(true)
    setErr(null)

    mcpCall(hubToken, 'my-work', 'my_profile', {})
      .then(function (profile) {
        return mcpCall(hubToken, 'my-work', 'my_metrics', {}).then(function (metrics) {
          setData({ profile: profile, metrics: metrics })
        })
      })
      .catch(function (e) { setErr(e.message || String(e)) })
      .finally(function () { setLoading(false) })
  }

  useEffect(function () {
    if (hubToken && !data && !loading) loadData()
  }, [hubToken])

  function cardRow(label, value) {
    return jsxs('div', {
      style: { flex: 1, padding: '6px 8px', borderRadius: 4, background: '#0d1117', border: '1px solid #21262d' },
      children: [
        jsx('div', { style: { fontSize: 10, color: '#8b949e', marginBottom: 2, display: 'inline-flex', alignItems: 'center', gap: 3 }, children: label }),
        jsx('div', { style: { fontSize: 15, fontWeight: 700, color: '#d29922' }, children: value }),
      ],
    })
  }

  if (!hubToken) {
    return jsxs('div', {
      style: { padding: 14, textAlign: 'center' },
      children: [
        jsx('div', { style: { fontWeight: 600, color: '#ddd', marginBottom: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_KEY, className: 'size-3.5 shrink-0' }), ' Token requerido'] }),
        jsx('div', { style: { fontSize: 11, color: '#888' }, children: 'Configúralo en la pestaña Config.' }),
      ],
    })
  }

  if (loading && !data) {
    return jsx('div', {
      style: { padding: 40, textAlign: 'center', fontSize: 12, color: '#888' },
      children: '⏳ Cargando...',
    })
  }

  if (err && !data) {
    return jsxs('div', {
      style: { padding: 14 },
      children: [
        jsx('div', { style: { fontWeight: 600, color: '#f85149', marginBottom: 6 }, children: '❌ Error' }),
        jsx('div', { style: { fontSize: 11, color: '#888' }, children: err }),
      ],
    })
  }

  if (!data) {
    return jsx('div', {
      style: { padding: 40, textAlign: 'center', fontSize: 12, color: '#888' },
      children: '⌛ Sin datos',
    })
  }

  // ── Render dashboard ──────────────────────────────────────────

  var profile = data.profile || {}
  var user = profile.user || {}
  var metrics = data.metrics || {}

  var workitems = profile.workitems || {}
  var tracks = (workitems.tracks || []).length
  var tasks = (workitems.tasks || []).length
  var projects = (workitems.projects || []).length

  return jsxs('div', {
    style: { padding: 12, fontSize: 12 },
    children: [
      // Header
      jsxs('div', {
        style: { padding: '0 0 8px 0', borderBottom: '1px solid #21262d', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 },
        children: [
          // Avatar (foto real o iniciales)
          avatar
            ? jsx('img', { src: avatar, alt: '', draggable: false, style: { width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 } })
            : jsx('div', {
                style: { width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg,#238636,#161b22)', color: '#ddd', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 },
                children: (user.name || '?').charAt(0).toUpperCase(),
              }),
          jsxs('div', { children: [
            jsx('div', { style: { fontSize: 13, fontWeight: 700, color: '#ddd' }, children: user.name || 'Usuario' }),
            jsx('div', { style: { fontSize: 10, color: '#888' }, children: (user.area || '') + (role ? ' · ' + role : '') + (user.country ? ' · ' + user.country : '') }),
          ]}),
        ],
      }),

      // Work items count
      jsxs('div', { style: { display: 'flex', gap: 5, marginBottom: 8 }, children: [
        card('#1c2128', [jsx(Icon, { path: ICON_CHECK_BADGE, className: 'size-3 shrink-0' }), ' Tracks'], fmt(tracks), '#58a6ff', '17px'),
        card('#0d1117', [jsx(Icon, { path: ICON_CLIPBOARD_DOCUMENT_LIST, className: 'size-3 shrink-0' }), ' Tasks'], fmt(tasks), '#3fb950', '17px'),
        card('#0d1117', [jsx(Icon, { path: ICON_CUBE, className: 'size-3 shrink-0' }), ' Projects'], fmt(projects), '#d29922', '17px'),
      ]}),

      // Approval metrics
      jsxs('div', { style: { display: 'flex', gap: 5, marginBottom: 8 }, children: [
        cardRow([jsx(Icon, { path: ICON_CHECK_CIRCLE, className: 'size-3 shrink-0' }), ' Aprobados'], fmt(metrics.approved_count || 0)),
        cardRow([jsx(Icon, { path: ICON_X_CIRCLE, className: 'size-3 shrink-0' }), ' Rechazados'], fmt(metrics.rejected_count || 0)),
        cardRow('⏱ Respuesta prom.', metrics.avg_response_time ? fmt1(metrics.avg_response_time) + 'h' : '-'),
      ]}),
    ],
  })
}
