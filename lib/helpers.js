// ── Persistence helpers ────────────────────────────────────────────

function loadStr(key) {
  try { return localStorage.getItem(key) || '' } catch { return '' }
}
function saveStr(key, val) {
  try { localStorage.setItem(key, val) } catch {}
}

function loadTrackRules() {
  var r = loadStr(STORAGE_TRACK_RULES)
  if (!r) return {}
  try { return JSON.parse(r) } catch (e) { return {} }
}
function saveTrackRules(rules) {
  try { saveStr(STORAGE_TRACK_RULES, JSON.stringify(rules)) } catch (e) {}
}

function loadTrackQA() {
  return {
    provider: loadStr(STORAGE_TRACK_QA_PROVIDER),
    model: loadStr(STORAGE_TRACK_QA_MODEL),
    prompt: loadStr(STORAGE_TRACK_QA_PROMPT),
    refs: (function () { try { return JSON.parse(loadStr(STORAGE_TRACK_QA_REFS)) || [] } catch { return [] } })(),
  }
}
function saveTrackQA(qa) {
  if (qa.provider != null) saveStr(STORAGE_TRACK_QA_PROVIDER, qa.provider)
  if (qa.model != null) saveStr(STORAGE_TRACK_QA_MODEL, qa.model)
  if (qa.prompt != null) saveStr(STORAGE_TRACK_QA_PROMPT, qa.prompt)
  if (qa.refs != null) saveStr(STORAGE_TRACK_QA_REFS, JSON.stringify(qa.refs))
}

// ── API helpers ────────────────────────────────────────────────────

async function mcpCall(token, server, tool, args) {
  args = args || {}
  const res = await fetch(HUB_BASE + '/' + server + '/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
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

async function ghFetch(token, path) {
  const res = await fetch('https://api.github.com' + path, {
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
    },
  })
  if (!res.ok) {
    const msg = (await res.json().catch(() => ({}))).message || 'HTTP ' + res.status
    throw new Error(msg)
  }
  return res.json()
}
