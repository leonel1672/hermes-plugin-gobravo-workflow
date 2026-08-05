// ── PR helpers ──────────────────────────────────────────────────────

function repoName(url) {
  if (!url) return ''
  const parts = url.split('/')
  return parts.slice(-2).join('/')
}

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return '< 1h'
  const hours = Math.floor(mins / 60)
  if (hours < 24) return hours + 'h'
  return Math.floor(hours / 24) + 'd'
}

async function prApiSearch(token, query) {
  var url = 'https://api.github.com/search/issues?q=' + encodeURIComponent(query) + '&sort=updated&per_page=10'
  var res = await fetch(url, {
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github.v3+json',
    },
  })
  var body = await res.json()
  if (!res.ok) throw new Error(body.message || 'HTTP ' + res.status)
  return body.items || []
}

function prFetchAll(token) {
  return Promise.all([
    prApiSearch(token, 'is:pr is:open review-requested:@me org:resuelve'),
    prApiSearch(token, 'is:pr is:open author:@me org:resuelve'),
  ])
}

// ── PR GraphQL: unresolved review comments ─────────────────────────

async function graphqlRequest(token, query) {
  var res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: query }),
  })
  var body = await res.json()
  if (body.errors && body.errors.length > 0) {
    throw new Error((body.errors[0] && body.errors[0].message) || 'GraphQL error')
  }
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return body.data
}

async function fetchUnresolvedCounts(token, myPRs) {
  if (!myPRs || myPRs.length === 0) return

  // Group by repo (owner/name)
  var repoMap = {}
  for (var pi = 0; pi < myPRs.length; pi++) {
    var pr = myPRs[pi]
    var key = repoName(pr.repository_url || pr.html_url)
    if (!key) continue
    if (!repoMap[key]) repoMap[key] = []
    repoMap[key].push(pr)
  }

  var repoKeys = Object.keys(repoMap)
  for (var ri = 0; ri < repoKeys.length; ri++) {
    var repo = repoKeys[ri]
    var prs = repoMap[repo]
    var parts = repo.split('/')
    if (parts.length !== 2) continue

    // Build a single GraphQL query for all PRs in this repo
    var prFields = ''
    for (var pi2 = 0; pi2 < prs.length; pi2++) {
      prFields += 'pr' + pi2 + ': pullRequest(number: ' + prs[pi2].number + ') {\n' +
        '          number\n' +
        '          # Review threads (threaded discussions on code)\n' +
        '          reviewThreads(first: 50) {\n' +
        '            nodes {\n' +
        '              isResolved\n' +
        '              comments(first: 20) {\n' +
        '                nodes {\n' +
        '                  author { login }\n' +
        '                }\n' +
        '              }\n' +
        '            }\n' +
        '          }\n' +
        '          # Review submissions (bot reviews, change requests, etc.)\n' +
        '          reviews(first: 10, states: [CHANGES_REQUESTED, COMMENTED]) {\n' +
        '            nodes {\n' +
        '              author { login }\n' +
        '              body\n' +
        '              comments(first: 20) {\n' +
        '                nodes {\n' +
        '                  author { login }\n' +
        '                  body\n' +
        '                  path\n' +
        '                }\n' +
        '              }\n' +
        '            }\n' +
        '          }\n' +
        '          # Issue-level comments\n' +
        '          comments(first: 20) {\n' +
        '            nodes {\n' +
        '              author { login }\n' +
        '              body\n' +
        '            }\n' +
        '          }\n' +
        '        }\n'
    }

    var query = '{\n  repository(owner: ' + JSON.stringify(parts[0]) + ', name: ' + JSON.stringify(parts[1]) + ') {\n' + prFields + '  }\n}'

    try {
      var data = await graphqlRequest(token, query)
      var repoData = data && data.repository
      if (!repoData) continue

      for (var pi3 = 0; pi3 < prs.length; pi3++) {
        var prData = repoData['pr' + pi3]
        if (!prData) continue

        var byUser = {}

        // ── Review threads (unresolved) ──
        var threads = (prData.reviewThreads && prData.reviewThreads.nodes) || []
        for (var ti = 0; ti < threads.length; ti++) {
          if (threads[ti].isResolved) continue
          var seen = {}
          var cmts = (threads[ti].comments && threads[ti].comments.nodes) || []
          for (var ci = 0; ci < cmts.length; ci++) {
            var author = cmts[ci] && cmts[ci].author && cmts[ci].author.login
            if (author && !seen[author]) { seen[author] = true; byUser[author] = (byUser[author] || 0) + 1 }
          }
        }

        // ── Review submissions (bots, change requests) ──
        var reviews = (prData.reviews && prData.reviews.nodes) || []
        for (var ri2 = 0; ri2 < reviews.length; ri2++) {
          var r = reviews[ri2]
          var rAuthor = r && r.author && r.author.login
          if (rAuthor && r.body) {
            byUser[rAuthor] = (byUser[rAuthor] || 0) + 1
          }
          var rCmts = (r && r.comments && r.comments.nodes) || []
          var rSeen = {}
          for (var ci2 = 0; ci2 < rCmts.length; ci2++) {
            var ca = rCmts[ci2] && rCmts[ci2].author && rCmts[ci2].author.login
            if (ca && !rSeen[ca]) { rSeen[ca] = true; byUser[ca] = (byUser[ca] || 0) + 1 }
          }
        }

        // ── Issue comments ──
        var issueCmts = (prData.comments && prData.comments.nodes) || []
        var iSeen = {}
        for (var ci3 = 0; ci3 < issueCmts.length; ci3++) {
          var ia = issueCmts[ci3] && issueCmts[ci3].author && issueCmts[ci3].author.login
          if (ia && !iSeen[ia]) { iSeen[ia] = true; byUser[ia] = (byUser[ia] || 0) + 1 }
        }

        var total = 0
        var userKeys = Object.keys(byUser)
        for (var uk = 0; uk < userKeys.length; uk++) total += byUser[userKeys[uk]]
        prs[pi3].unresolvedComments = total
        prs[pi3].unresolvedByUser = byUser
      }
    } catch (e) {
      // Skip repo on error
    }
  }
}

async function fetchUnresolvedThreads(token, pr) {
  var parts = repoName(pr.repository_url || pr.html_url).split('/')
  if (parts.length !== 2) return []

  var query = '{\n' +
    '  repository(owner: ' + JSON.stringify(parts[0]) + ', name: ' + JSON.stringify(parts[1]) + ') {\n' +
    '    pullRequest(number: ' + pr.number + ') {\n' +
    '      reviewThreads(first: 50) {\n' +
    '        nodes {\n' +
    '          isResolved\n' +
    '          comments(first: 20) {\n' +
    '            nodes {\n' +
    '              author { login }\n' +
    '              body\n' +
    '              path\n' +
    '            }\n' +
    '          }\n' +
    '        }\n' +
    '      }\n' +
    '      reviews(first: 10, states: [CHANGES_REQUESTED, COMMENTED]) {\n' +
    '        nodes {\n' +
    '          author { login }\n' +
    '          body\n' +
    '          comments(first: 20) {\n' +
    '            nodes {\n' +
    '              author { login }\n' +
    '              body\n' +
    '              path\n' +
    '            }\n' +
    '          }\n' +
    '        }\n' +
    '      }\n' +
    '      comments(first: 20) {\n' +
    '        nodes {\n' +
    '          author { login }\n' +
    '          body\n' +
    '        }\n' +
    '      }\n' +
    '    }\n' +
    '  }\n' +
    '}'

  try {
    var data = await graphqlRequest(token, query)
    var prData = data && data.repository && data.repository.pullRequest
    if (!prData) return []
    var result = []

    // ── Review threads (unresolved) ──
    var threads = (prData.reviewThreads && prData.reviewThreads.nodes) || []
    for (var ti = 0; ti < threads.length; ti++) {
      if (threads[ti].isResolved) continue
      var cmts = (threads[ti].comments && threads[ti].comments.nodes) || []
      for (var ci = 0; ci < cmts.length; ci++) {
        var c = cmts[ci]
        result.push({ body: c.body || '', path: c.path || '', author: (c.author && c.author.login) || '?' })
      }
    }

    // ── Review submissions ──
    var reviews = (prData.reviews && prData.reviews.nodes) || []
    for (var ri = 0; ri < reviews.length; ri++) {
      var r = reviews[ri]
      if (r.body) {
        result.push({ body: r.body, path: '', author: (r.author && r.author.login) || '?' })
      }
      var rComments = (r.comments && r.comments.nodes) || []
      for (var ci2 = 0; ci2 < rComments.length; ci2++) {
        var rc = rComments[ci2]
        result.push({ body: rc.body || '', path: rc.path || '', author: (rc.author && rc.author.login) || '?' })
      }
    }

    // ── Issue comments ──
    var issueCmts = (prData.comments && prData.comments.nodes) || []
    for (var ci3 = 0; ci3 < issueCmts.length; ci3++) {
      var ic = issueCmts[ci3]
      result.push({ body: ic.body || '', path: '', author: (ic.author && ic.author.login) || '?' })
    }

    return result
  } catch (e) {
    return []
  }
}

// ── StatusTab helpers ──────────────────────────────────────────────

function PRsTab({ githubToken, webhookUrl }) {
  var _a = useState(null)
  var data = _a[0]
  var setData = _a[1]

  var _b = useState(false)
  var loading = _b[0]
  var setLoading = _b[1]

  var _c = useState(null)
  var err = _c[0]
  var setErr = _c[1]

  var _d = useState(null)
  var sendingHelp = _d[0]
  var setSendingHelp = _d[1]

  var _e = useState(null)
  var commentsDetail = _e[0]
  var setCommentsDetail = _e[1]

  var _f = useState(null)
  var userComments = _f[0]
  var setUserComments = _f[1]

  var _g = useState(null)
  var selectedUser = _g[0]
  var setSelectedUser = _g[1]

  var _h = useState(null)
  var analyzing = _h[0]
  var setAnalyzing = _h[1]

  var _i = useState(null)
  var togglingDraft = _i[0]
  var setTogglingDraft = _i[1]

  var _j = useState(null)
  var approvingId = _j[0]
  var setApprovingId = _j[1]

  var _k = useState(null)
  var reviewingId = _k[0]
  var setReviewingId = _k[1]

  // Feedback visible de la lupa 🔍 (envío/éxito/error) — el toast se pierde fácil
  var _kf = useState(null)
  var reviewFeedback = _kf[0] // { prId, state: 'sending'|'sent'|'error', msg }
  var setReviewFeedback = _kf[1]

  // Feedback del botón Analizar en comentarios (✓ Enviado / ✗ Error)
  var _cf = useState(null)
  var commentFeedback = _cf[0] // { commentIdx, state: 'sent'|'error' }
  var setCommentFeedback = _cf[1]

  // Label del proveedor/modelo configurado para mostrar en el botón Analizar
  var providerLabel = (function () {
    var m = loadStr(STORAGE_PR_REVIEW_MODEL) || 'coder-sr'
    var p = loadStr(STORAGE_PR_REVIEW_PROVIDER) || 'tokengate'
    if (p === 'tokengate') return m
    return p + '/' + m
  })()

  var _l = useState(null)
  var writing = _l[0]
  var setWriting = _l[1]
  var writingRef = useRef(null)

  var _m = useState(false)
  var showWebhookInput = _m[0]
  var setShowWebhookInput = _m[1]
  var whInputRef = useRef(null)

  var _n = useState('')
  var searchQuery = _n[0]
  var setSearchQuery = _n[1]

  var _o = useState(webhookUrl || '')
  var whUrl = _o[0]
  var setWhUrl = _o[1]

  var lastFetch = useRef(0)
  var CACHE_TTL = 120_000

  function loadData() {
    if (!githubToken) return
    var now = Date.now()
    if (now - lastFetch.current < CACHE_TTL && data) return

    setLoading(true)
    setErr(null)
    lastFetch.current = now

    prFetchAll(githubToken)
      .then(function (results) {
        var toReview = results[0]
        var myPRs = results[1]
        var reviewIds = new Set(toReview.map(function (p) { return p.id }))
        var myFiltered = myPRs.filter(function (p) { return !reviewIds.has(p.id) })
        setData({ toReview: toReview, myPRs: myFiltered })
        // Cargar comentarios no resueltos en background (GraphQL)
        fetchUnresolvedCounts(githubToken, myFiltered)
          .then(function () {
            setData(function (prev) {
              if (!prev) return prev
              var next = Object.assign({}, prev)
              next.myPRs = myFiltered.slice()
              return next
            })
          })
          .catch(function () {})
      })
      .catch(function (e) {
        setErr(e.message || String(e))
      })
      .finally(function () { setLoading(false) })
  }

  useEffect(function () {
    if (githubToken && !data && !loading) loadData()
  }, [githubToken])

  // Refresh automático cada 5 min
  useEffect(function () {
    if (!githubToken) return
    var interval = setInterval(function () {
      lastFetch.current = 0
      loadData()
    }, 300000)
    return function () { clearInterval(interval) }
  }, [githubToken])

  function handleRefresh() {
    haptic('tap')
    lastFetch.current = 0
    loadData()
  }

  // ── Webhook Help (Google Chat) ──
  function buildHelpMessage(pr) {
    var tpl = loadStr(STORAGE_PR_MESSAGE) || PR_MESSAGE_DEFAULT
    return tpl
      .split('{title}').join(pr.title || '')
      .split('{url}').join(pr.html_url || '')
      .split('{number}').join(String(pr.number || ''))
      .split('{repo}').join(repoName(pr.repository_url) || '')
  }

  function handleHelp(pr) {
    haptic('tap')
    if (!whUrl) {
      setShowWebhookInput(true)
      return
    }

    setSendingHelp(pr.id)
    var msg = { text: buildHelpMessage(pr) }
    fetch(whUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg),
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status)
        host.notify('✅ Aviso enviado a Google Chat para #' + pr.number)
      })
      .catch(function (err) {
        host.notifyError('Error al enviar: ' + (err.message || String(err)))
      })
      .finally(function () { setSendingHelp(null) })
  }

  function saveWebhook(val) {
    if (!val) return
    try { localStorage.setItem(STORAGE_WEBHOOK_URL, val) } catch {}
    setWhUrl(val)
    setShowWebhookInput(false)
    host.notify('✅ Webhook de Google Chat configurado')
  }

  function clearWebhook() {
    try { localStorage.removeItem(STORAGE_WEBHOOK_URL) } catch {}
    setWhUrl('')
    setShowWebhookInput(false)
    host.notify('Webhook eliminado')
  }

  // ── Comentarios inline ──
  function handleShowComments(pr) {
    haptic('tap')
    if (commentsDetail && commentsDetail.pr && commentsDetail.pr.id === pr.id) {
      setCommentsDetail(null)
      return
    }
    setSelectedUser(null)
    setUserComments(null)
    var byUser = pr.unresolvedByUser || {}
    var keys = Object.keys(byUser)
    var total = 0
    for (var ki = 0; ki < keys.length; ki++) total += byUser[keys[ki]]
    setCommentsDetail({ pr: pr, byUser: byUser, total: total })
  }

  async function handleUserClick(user) {
    haptic('tap')
    if (selectedUser === user) {
      setSelectedUser(null)
      setUserComments(null)
      return
    }
    setSelectedUser(user)
    setUserComments(null)
    var pr = commentsDetail && commentsDetail.pr
    if (!pr || !githubToken) return
    try {
      var comments = await fetchUnresolvedThreads(githubToken, pr)
      setUserComments(comments || [])
    } catch (err) {
      setUserComments([])
      host.notifyError('Error al cargar comentarios: ' + (err.message || String(err)))
    }
  }

  function analyzeComment(comment, pr, idx) {
    haptic('tap')
    setAnalyzing(idx)
    setCommentFeedback(null)
    try {
      var sid = host.state.activeSessionId.get()
      if (!sid) {
        host.notifyError('❌ No hay sesión activa. Abre o crea un chat primero.')
        setCommentFeedback({ commentIdx: idx, state: 'error' })
        return
      }

      // Leer provider/model/prompt de Config > PRs
      var prov = loadStr(STORAGE_PR_REVIEW_PROVIDER) || 'tokengate'
      var model = loadStr(STORAGE_PR_REVIEW_MODEL) || 'coder-sr'
      var customPrompt = loadStr(STORAGE_PR_REVIEW_PROMPT)

      // Aplicar proveedor/modelo vía cli.exec (mismo patrón de config-tab)
      if (prov && model) {
        host.request('cli.exec', { argv: ['config', 'set', 'auxiliary.review_pr.provider', prov] })
          .catch(function () {})
        host.request('cli.exec', { argv: ['config', 'set', 'auxiliary.review_pr.model', model] })
          .catch(function () {})
      }

      // Construir prompt: si hay customPrompt se usa con variables, si no se usa un default inline
      var text
      if (customPrompt && customPrompt.trim()) {
        text = customPrompt
          .split('{number}').join(String(pr.number || ''))
          .split('{path}').join(comment.path || '')
          .split('{author}').join(comment.author || '?')
          .split('{body}').join(comment.body || '')
          .split('{URL}').join(pr.html_url || '')
      } else {
        text = 'Analiza este comentario de code review en el PR #' + (pr.number || '?') + ':\n\n' +
          'Archivo: ' + (comment.path || 'n/a') + '\n' +
          'Autor: @' + (comment.author || '?') + '\n' +
          'Comentario: ' + (comment.body || '') + '\n\n' +
          'PR: ' + (pr.html_url || '') + '\n\n' +
          '1. Entiende el problema señalado.\n' +
          '2. Revisa el código en el archivo mencionado (usa la URL del PR para ver el diff).\n' +
          '3. Sugiere una solución concreta con código.\n' +
          '4. Si el comentario tiene razón, explica cómo implementar el fix.\n' +
          '5. Si el comentario es incorrecto, explica por qué.'
      }

      host.request('prompt.submit', { session_id: sid, text: text })
      host.notify('🔍 Análisis enviado al chat activo')
      setCommentFeedback({ commentIdx: idx, state: 'sent' })
    } catch (err) {
      host.notifyError('Error: ' + (err.message || String(err)))
      setCommentFeedback({ commentIdx: idx, state: 'error' })
    } finally {
      setTimeout(function () { setAnalyzing(null) }, 1800)
      setTimeout(function () { setCommentFeedback(null) }, 6000)
    }
  }

  function renderCommentCard(comment, pr, idx) {
    var analyzingThis = analyzing === idx
    return jsxs('div', {
      style: { backgroundColor: '#141414', borderRadius: 4, marginBottom: 8, padding: 10, fontSize: 11 },
      children: [
        jsxs('div', {
          style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
          children: [
            comment.path && jsx('span', {
              style: { color: '#58a6ff', fontWeight: 500, fontSize: 10, fontFamily: 'monospace' },
              children: '📁 ' + comment.path,
            }),
            jsx('span', {
              style: { color: comment.author === 'hubbot-reviewer' ? '#f59e0b' : '#888', fontWeight: 500, fontSize: 10 },
              children: '@' + (comment.author || '?'),
            }),
          ],
        }),
        jsx('div', {
          style: { color: '#ccc', whiteSpace: 'pre-wrap', lineHeight: 1.5, marginTop: 4, marginBottom: 6 },
          children: comment.body,
        }),
        jsxs('div', {
          style: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, borderTop: '1px solid #222', paddingTop: 6 },
          children: [
            commentFeedback && commentFeedback.commentIdx === idx && commentFeedback.state === 'sent' &&
              jsx('span', { style: { fontSize: 9, fontWeight: 600, color: '#3fb950', display: 'inline-flex', alignItems: 'center', gap: 3 }, children: '✓ Enviado' }),
            commentFeedback && commentFeedback.commentIdx === idx && commentFeedback.state === 'error' &&
              jsx('span', { style: { fontSize: 9, fontWeight: 600, color: '#f85149', display: 'inline-flex', alignItems: 'center', gap: 3 }, children: '✗ Error' }),
            jsx('button', {
              onClick: function () { if (!analyzingThis) analyzeComment(comment, pr, idx) },
              disabled: analyzingThis,
              style: {
                background: '#1a1a2e', color: analyzingThis ? '#555' : '#58a6ff',
                border: '1px solid ' + (analyzingThis ? '#333' : '#2a3a5e'),
                borderRadius: 3, padding: '2px 10px', cursor: analyzingThis ? 'default' : 'pointer',
                fontSize: 9, fontWeight: 600, lineHeight: '14px',
                display: 'inline-flex', alignItems: 'center', gap: 4,
                opacity: analyzingThis ? 0.6 : 1,
              },
              children: analyzingThis
                ? '⏳ Analizando...'
                : jsxs('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [
                    jsx(Icon, { path: ICON_MAGNIFYING_GLASS, className: 'size-3 shrink-0' }),
                    ' Analizar',
                  ]}),
            }),
          ],
        }),
      ],
    }, 'cmt' + idx)
  }

  // ── Acciones de PR ──
  async function toggleDraft(pr) {
    haptic('tap')
    if (!pr.node_id || !githubToken) return
    var isDraft = pr.draft
    var label = isDraft ? 'listo para review' : 'draft'
    var mutation = isDraft
      ? 'mutation{markPullRequestReadyForReview(input:{pullRequestId:"' + pr.node_id + '"}){pullRequest{id isDraft}}}'
      : 'mutation{convertPullRequestToDraft(input:{pullRequestId:"' + pr.node_id + '"}){pullRequest{id isDraft}}}'

    setTogglingDraft(pr.id)
    try {
      await graphqlRequest(githubToken, mutation)
      host.notify('✅ #' + pr.number + ' → ' + label)
      handleRefresh()
    } catch (err) {
      host.notifyError('Error al cambiar estado: ' + err.message)
    } finally {
      setTogglingDraft(null)
    }
  }

  async function reviewPR(pr) {
    haptic('tap')
    var sid = host.state.activeSessionId.get()
    if (!sid) {
      host.notifyError('❌ No hay sesión activa. Abre o crea un chat primero.')
      setReviewFeedback({ prId: pr.id, state: 'error', msg: '❌ No hay chat activo — abre o crea uno primero' })
      return
    }

    setReviewingId(pr.id)
    setReviewFeedback({ prId: pr.id, state: 'sending', msg: '⏳ Enviando revisión al chat…' })
    try {
      // Prompt configurable desde Config (sub-tab PRs) + URLs de referencia
      var rawPrompt = loadStr(STORAGE_PR_REVIEW_PROMPT) || PR_REVIEW_DEFAULT
      var refs = loadStr(STORAGE_PR_REVIEW_REFS)
      var refList = []
      try { refList = refs ? JSON.parse(refs) : [] } catch (e) { refList = [] }

      var text = rawPrompt.split('{URL}').join(pr.html_url)
      if (refList.length) {
        text += '\n\nURLs de referencia del proyecto:\n' + refList.map(function (u) { return '- ' + u }).join('\n')
      }

      // await: si el RPC falla el catch lo atrapa y el feedback cambia a error
      var res = await host.request('prompt.submit', {
        session_id: sid,
        text: text,
      })
      // host.request puede devolver undefined si el RPC no tiene response body
      if (res && res.error) throw new Error(res.error.message || 'RPC error')
      host.notify('🔍 Revisión enviada — el asistente procesará el PR')
      setReviewFeedback({ prId: pr.id, state: 'sent', msg: '✅ Revisión enviada — revisa el chat activo' })
    } catch (err) {
      host.notifyError('Error al enviar revisión: ' + (err.message || String(err)))
      setReviewFeedback({ prId: pr.id, state: 'error', msg: '❌ Error al enviar: ' + (err.message || String(err)) })
    } finally {
      // Mantener el spinner ⏳ visible un momento (antes se limpiaba en el
      // mismo tick y el usuario no veía nada). El feedback se auto-limpia.
      setTimeout(function () { setReviewingId(null) }, 1800)
      setTimeout(function () { setReviewFeedback(null) }, 6000)
    }
  }

  async function approvePR(pr, comment) {
    haptic('tap')
    if (!githubToken) return
    setApprovingId(pr.id)
    try {
      var parts = repoName(pr.repository_url || pr.html_url).split('/')
      if (parts.length !== 2) throw new Error('No se pudo resolver el repositorio')
      var owner = parts[0]
      var repo = parts[1]
      var body = { event: 'APPROVE' }
      if (comment && comment.trim()) body.body = comment.trim()

      var res = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/pulls/' + pr.number + '/reviews', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + githubToken,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        var errBody = await res.json().catch(function () { return {} })
        throw new Error(errBody.message || 'HTTP ' + res.status)
      }
      host.notify('✅ PR #' + pr.number + ' aprobado')
      handleRefresh()
    } catch (err) {
      host.notifyError('Error al aprobar: ' + err.message)
    } finally {
      setApprovingId(null)
      setWriting(null)
    }
  }

  function renderPR(pr, showReview, onHelp) {
    var link = jsx('a', {
      href: pr.html_url,
      target: '_blank',
      rel: 'noopener noreferrer',
      style: {
        flex: 1,
        display: 'block',
        padding: '8px 12px 8px 28px',
        textDecoration: 'none',
        color: '#ddd',
        cursor: 'pointer',
        minWidth: 0,
      },
      children: jsxs('div', {
        style: { display: 'flex', alignItems: 'flex-start', gap: 8 },
        children: jsxs('div', {
            style: { flex: 1, minWidth: 0 },
            children: [
              jsx('div', {
                style: {
                  fontSize: 12,
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                },
                children: pr.title,
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
                  jsx('span', { style: { color: '#58a6ff' }, children: '#' + pr.number }),
                  jsx('span', { children: repoName(pr.repository_url) }),
                  jsx('span', { style: { color: '#aaa' }, children: 'by ' + (pr.user && pr.user.login ? pr.user.login : '?') }),
                  !showReview && pr.unresolvedComments > 0 &&
                    jsx('button', {
                      onClick: function (e) {
                        e.preventDefault()
                        e.stopPropagation()
                        handleShowComments(pr)
                      },
                      style: {
                        background: 'none',
                        border: 'none',
                        color: commentsDetail && commentsDetail.pr && commentsDetail.pr.id === pr.id ? '#f97316' : '#ef4444',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontSize: 11,
                        padding: 0,
                      },
                      children: jsx(Icon, { path: ICON_CHAT_BUBBLE_LEFT, className: 'size-3.5 shrink-0' }),
                    }),
                  jsx('span', { children: '· ' + timeAgo(pr.updated_at) }),
                ],
              }),
            ],
          }),
      }),
    }, pr.id)

    if (!showReview) {
      // Mis PRs: draft toggle + help
      var isDraft = pr.draft
      var draftToggling = togglingDraft === pr.id
      return jsxs('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid #222',
        },
        children: [
          link,
          jsx('button', {
            onClick: function (e) {
              e.preventDefault()
              e.stopPropagation()
              if (!draftToggling) toggleDraft(pr)
            },
            style: {
              background: 'none',
              border: 'none',
              color: isDraft ? '#3fb950' : '#d29922',
              cursor: draftToggling ? 'default' : 'pointer',
              fontSize: 9,
              padding: 0,
              marginRight: 2,
              width: 18,
              height: 18,
              lineHeight: '18px',
              textAlign: 'center',
              borderRadius: 3,
              opacity: draftToggling ? 0.5 : 1,
            },
            title: isDraft ? 'Marcar como listo para review' : 'Convertir a draft',
            children: draftToggling ? '⏳' : (isDraft ? jsx(Icon, { path: ICON_PAPER_AIRPLANE, className: 'size-3.5 shrink-0' }) : jsx(Icon, { path: ICON_PENCIL_SQUARE, className: 'size-3.5 shrink-0' })),
          }),
          onHelp && jsx('button', {
            onClick: function (e) {
              e.preventDefault()
              e.stopPropagation()
              if (sendingHelp !== pr.id) onHelp(pr)
            },
            style: {
              background: 'none',
              border: 'none',
              color: sendingHelp === pr.id ? '#555' : '#d29922',
              cursor: sendingHelp === pr.id ? 'default' : 'pointer',
              fontSize: 9,
              padding: 0,
              marginRight: 4,
              width: 18,
              height: 18,
              lineHeight: '18px',
              textAlign: 'center',
              borderRadius: 3,
              opacity: sendingHelp === pr.id ? 0.5 : 1,
            },
            title: whUrl ? 'Pedir ayuda en Google Chat' : 'Configurar webhook de Google Chat',
            children: sendingHelp === pr.id ? '⏳' : jsx(Icon, { path: ICON_HAND_RAISED, className: 'size-3.5 shrink-0' }),
          }),
        ],
      })
    }

    // PRs por revisar: approve + review
    var reviewing = reviewingId === pr.id
    var approving = approvingId === pr.id
    var isWriting = writing && writing.pr && writing.pr.id === pr.id
    return jsxs('div', {
      style: {
        borderBottom: '1px solid #222',
      },
      children: [
        jsxs('div', {
          style: { display: 'flex', alignItems: 'center' },
          children: [
            link,
            // Approve button
            jsx('button', {
              onClick: function (e) {
                e.preventDefault()
                e.stopPropagation()
                if (!approving && !isWriting) {
                  setWriting({ pr: pr, action: 'approve' })
                }
              },
              disabled: approving,
              style: {
                background: 'none',
                border: 'none',
                color: approving ? '#555' : '#3fb950',
                cursor: approving ? 'default' : 'pointer',
                fontSize: 9,
                padding: 0,
                marginRight: 2,
                width: 18,
                height: 18,
                lineHeight: '18px',
                textAlign: 'center',
                borderRadius: 3,
                opacity: approving ? 0.5 : 1,
              },
              title: approving ? 'Aprobando...' : 'Aprobar este PR',
              children: approving ? '⏳' : jsx(Icon, { path: ICON_HAND_THUMBS_UP, className: 'size-3.5 shrink-0' }),
            }),
            // Review button
            jsx('button', {
              onClick: function (e) {
                e.preventDefault()
                e.stopPropagation()
                if (!reviewing) reviewPR(pr)
              },
              disabled: reviewing,
              style: {
                background: 'none',
                border: 'none',
                color: reviewing ? '#555' : '#58a6ff',
                cursor: reviewing ? 'default' : 'pointer',
                fontSize: 9,
                padding: 0,
                marginRight: 4,
                width: 18,
                height: 18,
                lineHeight: '18px',
                textAlign: 'center',
                borderRadius: 3,
                opacity: reviewing ? 0.5 : 1,
              },
              title: reviewing ? 'Enviando...' : 'Analizar y comentar este PR',
              children: reviewing ? '⏳' : jsx(Icon, { path: ICON_MAGNIFYING_GLASS, className: 'size-3.5 shrink-0' }),
            }),
          ],
        }),
        // Feedback visible de la lupa 🔍 (sending/sent/error) — dura 6s
        reviewFeedback && reviewFeedback.prId === pr.id && jsx('div', {
          style: {
            padding: '2px 12px 6px 28px',
            fontSize: 10,
            fontWeight: 500,
            lineHeight: '14px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            color: reviewFeedback.state === 'error' ? '#f85149' : (reviewFeedback.state === 'sent' ? '#3fb950' : '#58a6ff'),
          },
          children: reviewFeedback.msg,
        }),
        // Aprobar con comentario
        isWriting && writing.action === 'approve' && jsxs('div', {
          style: {
            display: 'flex',
            gap: 6,
            padding: '6px 12px 8px',
            borderBottom: '1px solid #222',
            backgroundColor: '#141414',
          },
          children: [
            jsx('input', {
              ref: writingRef,
              type: 'text',
              placeholder: 'Comentario (opcional)...',
              style: {
                flex: 1,
                backgroundColor: '#111',
                color: '#ddd',
                border: '1px solid #333',
                borderRadius: 4,
                padding: '4px 8px',
                fontSize: 11,
                outline: 'none',
              },
              onKeyDown: function (e) {
                if (e.key === 'Enter') approvePR(pr, writingRef.current ? writingRef.current.value || '' : '')
                if (e.key === 'Escape') setWriting(null)
              },
              autoFocus: true,
            }),
            jsx('button', {
              onClick: function () { approvePR(pr, writingRef.current ? writingRef.current.value || '' : '') },
              disabled: approving,
              style: {
                background: '#238636',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                padding: '4px 10px',
                cursor: approving ? 'default' : 'pointer',
                fontSize: 11,
                fontWeight: 600,
                flexShrink: 0,
              },
              children: approving ? '⏳' : jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_CHECK, className: 'size-3.5 shrink-0' }), ' Aprobar'] }),
            }),
            jsx('button', {
              onClick: function () { setWriting(null) },
              style: {
                background: 'none',
                border: '1px solid #555',
                color: '#888',
                borderRadius: 4,
                padding: '4px 8px',
                cursor: 'pointer',
                fontSize: 11,
                flexShrink: 0,
              },
              children: jsx(Icon, { path: ICON_X_MARK, className: 'size-3.5 shrink-0' }),
            }),
          ],
        }),
      ],
    })
  }

  // ── Comments detail panel ─────────────────────────────────────────
  if (commentsDetail) {
    var cd = commentsDetail
    var prAuthor = cd.pr.user && cd.pr.user.login || ''

    // ── Drilldown: show actual comments per user ──
    if (selectedUser) {
      var filteredComments = userComments
        ? userComments.filter(function (c) { return c.author === selectedUser })
        : []

      return jsxs('div', {
        style: { padding: 0 },
        children: [
          jsx('div', {
            style: {
              padding: '6px 12px', borderBottom: '1px solid #333',
              display: 'flex', alignItems: 'center', gap: 6,
              position: 'sticky', top: 0, zIndex: 10,
              backgroundColor: '#161616',
            },
            children: [
              jsx('button', {
                onClick: function () { setSelectedUser(null); setUserComments(null) },
                style: { background: 'none', border: 'none', color: '#58a6ff', cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: 0 },
                children: '← Volver',
              }),
              jsx('span', { style: { fontSize: 11, color: '#888', marginLeft: 6 }, children: '👤 ' + selectedUser }),
            ],
          }),

          userComments === null &&
            jsx('div', { style: { padding: 20, textAlign: 'center', fontSize: 12, color: '#888' }, children: '⏳ Cargando comentarios...' }),

          userComments && filteredComments.length > 0 &&
            jsxs('div', { style: { padding: 10 }, children: [
              jsx('div', {
                style: { fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 8 },
                children: '💬 Comentarios (' + filteredComments.length + ')',
              }),
              jsx('div', {
                children: filteredComments.map(function (c, idx) {
                  return renderCommentCard(c, cd.pr, idx)
                }),
              }),
            ]}),

          userComments && filteredComments.length === 0 &&
            jsx('div', { style: { padding: 20, textAlign: 'center', fontSize: 12, color: '#666' }, children: '🎉 No hay comentarios de ' + selectedUser }),
        ],
      })
    }

    // ── User list (summary by user) ──
    return jsxs('div', {
      style: { padding: 0 },
      children: [
        jsx('div', {
          style: {
            padding: '6px 12px', borderBottom: '1px solid #333',
            display: 'flex', alignItems: 'center', gap: 6,
            position: 'sticky', top: 0, zIndex: 10,
            backgroundColor: '#161616',
          },
          children: [
            jsx('button', {
              onClick: function () { setCommentsDetail(null) },
              style: { background: 'none', border: 'none', color: '#58a6ff', cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: 0 },
              children: '← Volver',
            }),
            jsx('span', { style: { fontSize: 11, color: '#888', marginLeft: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, children: '#' + cd.pr.number + ' — ' + cd.pr.title }),
          ],
        }),

        jsxs('div', { style: { padding: 10 }, children: [
          jsx('div', {
            style: { fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 8 },
            children: '💬 Comentarios no resueltos (' + cd.total + ')',
          }),
          Object.keys(cd.byUser).length > 0 &&
            jsx('div', {
              // Excluir al autor del PR de la lista de revisores
              children: Object.keys(cd.byUser).filter(function (u) { return u !== prAuthor }).sort(function (a, b) { return cd.byUser[b] - cd.byUser[a] }).map(function (user) {
                return jsxs('button', {
                  onClick: function () { handleUserClick(user) },
                  style: {
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    width: '100%', padding: '6px 10px',
                    backgroundColor: selectedUser === user ? '#1e3a5f' : '#141414',
                    border: selectedUser === user ? '1px solid #58a6ff' : 'none',
                    borderRadius: 4, marginBottom: 4, cursor: 'pointer', color: '#ddd', fontSize: 12,
                  },
                  children: [
                    jsxs('div', {
                      style: { display: 'flex', alignItems: 'center', gap: 6 },
                      children: [
                        jsx('span', { style: { fontSize: 14 }, children: '👤' }),
                        jsx('span', { style: { fontSize: 12, color: '#ddd', fontWeight: 500 }, children: user }),
                        jsx(Icon, { path: ICON_CHEVRON_RIGHT, className: 'size-3 shrink-0', style: { color: '#58a6ff' } }),
                      ],
                    }),
                    jsx('span', {
                      style: { fontSize: 13, fontWeight: 700, color: '#ef4444' },
                      children: String(cd.byUser[user]),
                    }),
                  ],
                }, user)
              }),
            }),
          Object.keys(cd.byUser).length === 0 &&
            jsx('div', { style: { padding: 8, textAlign: 'center', fontSize: 12, color: '#666' }, children: '🎉 No hay comentarios no resueltos' }),
        ]}),
      ],
    })
  }

  if (!githubToken) {
    return jsxs('div', {
      style: { padding: 14, textAlign: 'center' },
      children: [
        jsx('div', { style: { fontWeight: 600, color: '#ddd', marginBottom: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_KEY, className: 'size-3.5 shrink-0' }), ' Token requerido'] }),
        jsx('div', { style: { fontSize: 11, color: '#888' }, children: 'Configura el GitHub Token en la pestaña Config.' }),
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

  var toReview = data ? data.toReview : []
  var myPRs = data ? data.myPRs : []
  var hasContent = toReview.length > 0 || myPRs.length > 0

  return jsxs('div', {
    style: { padding: 0 },
    children: [
      jsx('div', {
        style: {
          padding: '6px 12px',
          borderBottom: '1px solid #333',
          fontSize: 11,
          color: '#888',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 10,
          backgroundColor: '#161616',
        },
        children: [
          jsx('span', { style: { fontWeight: 600 }, children: 'GitHub PRs' }),
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

      toReview.length > 0 && jsxs('div', {
        children: [
          jsx('div', {
            style: {
              padding: '6px 12px',
              fontSize: 11,
              color: '#ef4444',
              fontWeight: 600,
              borderBottom: '1px solid #222',
            },
            children: jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_CLIPBOARD_DOCUMENT_LIST, className: 'size-3.5 shrink-0' }), ' Pendientes de revisar (' + toReview.length + ')'] }),
          }),
          jsx('div', { children: toReview.map(function (p) { return renderPR(p, true) }) }),
        ],
      }),

      myPRs.length > 0 && jsxs('div', {
        children: [
          jsx('div', {
            style: {
              padding: '6px 12px',
              fontSize: 11,
              color: '#58a6ff',
              fontWeight: 600,
              borderBottom: '1px solid #222',
            },
            children: jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_ARROW_UP_TRAY, className: 'size-3.5 shrink-0' }), ' Mis PRs abiertos (' + myPRs.length + ')'] }),
          }),
          jsx('div', { children: myPRs.map(function (p) { return renderPR(p, false, function (pr) { handleHelp(pr) }) }) }),
        ],
      }),

      !hasContent && jsx('div', {
        style: { padding: 20, textAlign: 'center', fontSize: 12, color: '#888' },
        children: '✅ No hay PRs abiertos o pendientes',
      }),
    ],
  })
}

// ── TicketsTab helpers ──────────────────────────────────────────────

function CommentsModal({ token, ticket, onClose }) {
  var _a = useState(true)
  var loading = _a[0]
  var setLoading = _a[1]

  var _b = useState(null)
  var error = _b[0]
  var setError = _b[1]

  var _c = useState([])
  var comments = _c[0]
  var setComments = _c[1]

  useEffect(function () {
    var cancelled = false
    setLoading(true)
    setError(null)
    fetchComments(token, ticket.id)
      .then(function (data) {
        if (cancelled) return
        setComments(data && data.comments || [])
      })
      .catch(function (err) {
        if (cancelled) return
        setError(err.message)
      })
      .finally(function () {
        if (!cancelled) setLoading(false)
      })
    return function () { cancelled = true }
  }, [token, ticket.id])

  return jsxs('div', {
    style: {
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)',
      zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    },
    onClick: onClose,
    children: [
      jsxs('div', {
        onClick: function (e) { e.stopPropagation() },
        style: {
          backgroundColor: '#161616', border: '1px solid #333', borderRadius: 8,
          width: 540, maxWidth: '100%', maxHeight: '80vh',
          display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.6)', overflow: 'hidden',
        },
        children: [
          // Header
          jsxs('div', {
            style: { padding: '10px 14px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
            children: [
              jsxs('div', { style: { minWidth: 0 }, children: [
                jsx('div', { style: { fontSize: 12, fontWeight: 600, color: '#ddd', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_CHAT_BUBBLE_LEFT, className: 'size-3.5 shrink-0' }), ticket.name || ''] }),
                jsx('div', { style: { fontSize: 10, color: '#58a6ff', marginTop: 2 }, children: ticket.code || ticket.id }),
              ]}),
              jsx('button', {
                onClick: onClose,
                style: { background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, padding: '2px 6px', flexShrink: 0 },
                children: jsx(Icon, { path: ICON_X_MARK, className: 'size-3.5 shrink-0' }),
              }),
            ],
          }),
          // Body
          jsx('div', { style: { padding: 12, overflowY: 'auto' }, children: [
            loading && jsx('div', { style: { padding: 20, textAlign: 'center', fontSize: 12, color: '#888' }, children: '⏳ Cargando comentarios...' }),

            error && jsx('div', { style: { padding: 14, fontSize: 12, color: '#ef4444' }, children: '❌ ' + error }),

            !loading && !error && comments.length === 0 &&
              jsx('div', { style: { padding: 20, textAlign: 'center', fontSize: 12, color: '#666', fontStyle: 'italic' }, children: '💬 Sin comentarios en este ticket' }),

            !loading && !error && comments.length > 0 &&
              jsxs('div', {
                children: [
                  jsx('div', { style: { fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 6 }, children: comments.length + ' comentario' + (comments.length === 1 ? '' : 's') }),
                  comments.map(function (c) {
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
                ],
              }),
          ]}),
        ],
      }),
    ],
  })
}

// ── TicketsTab ──────────────────────────────────────────────────────
