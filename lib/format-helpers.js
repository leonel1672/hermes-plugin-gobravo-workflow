function fmt(n) {
  if (n === 0 || n) return String(n)
  return '-'
}

function fmt1(n) {
  if (n === 0 || n) return Number(n).toFixed(1)
  return '-'
}

function pct(n) {
  if (n === 0 || n) return Number(n).toFixed(1) + '%'
  return '-'
}

function card(bg, label, value, color, size) {
  return jsxs('div', {
    style: { flex: 1, padding: '6px 6px', borderRadius: 4, background: bg },
    children: [
      jsx('div', { style: { fontSize: 9, color: color, display: 'inline-flex', alignItems: 'center', gap: 3 }, children: label }),
      jsx('div', { style: { fontSize: size, fontWeight: 700, color: color, marginTop: 1 }, children: value }),
    ],
  })
}

function mdToHtml(text) {
  if (!text) return ''

  // 1. Extract mermaid blocks FIRST
  var mermaidBlocks = []
  var h = text.replace(/```mermaid\s*\n?([\s\S]*?)```/g, function (_, code) {
    var idx = mermaidBlocks.length
    mermaidBlocks.push(code.trim())
    return '%%MERMAID' + idx + '%%'
  })

  // 2. Extract other code blocks (escapa HTML — el escape global del paso 3
  //    ya no alcanza al content porque quedó en placeholder)
  var codeBlocks = []
  h = h.replace(/```(\w*)\n?([\s\S]*?)```/g, function (_, lang, code) {
    var idx = codeBlocks.length
    var escaped = code.trim()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    codeBlocks.push('<pre style="background:#111;padding:8px;border-radius:4px;font-size:11px;overflow-x:auto;margin:4px 0"><code>' + escaped + '</code></pre>')
    return '%%CB' + idx + '%%'
  })

  // 3. Escape HTML
  h = h
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // 4. Headings
  h = h
    .replace(/^#### (.+)$/gm, '<h5 style="color:#e2b714;margin:4px 0 2px">$1</h5>')
    .replace(/^### (.+)$/gm, '<h4 style="color:#e2b714;margin:6px 0 3px">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="color:#e2b714;margin:8px 0 4px">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 style="color:#e2b714;margin:10px 0 6px">$1</h2>')

  // 5. Horizontal rules
  h = h.replace(/^---+$/gm, '<hr style="border-color:#333;margin:8px 0">')

  // 6. Tables
  h = h.replace(/((?:^[^\n]*\|[^\n]*\n?)+)/gm, function (tableBlock) {
    var rows = tableBlock.trim().split('\n')
    var html = '<table style="border-collapse:collapse;font-size:11px;margin:6px 0;width:100%">\n'
    var sepIdx = rows.findIndex(function (r) { return /^[\s|:-]+$/.test(r) })
    var headerRows = sepIdx >= 0 ? rows.slice(0, sepIdx) : [rows[0]]
    var bodyRows = sepIdx >= 0 ? rows.slice(sepIdx + 1) : rows.slice(1)
    if (headerRows.length) {
      html += '  <thead><tr>\n'
      headerRows[0].split('|').filter(function (c) { return c.trim() }).forEach(function (cell) {
        html += '    <th style="border:1px solid #333;padding:4px 6px;color:#e2b714;text-align:left">' + cell.trim() + '</th>\n'
      })
      html += '  </tr></thead>\n'
    }
    if (bodyRows.length) {
      html += '  <tbody>\n'
      bodyRows.forEach(function (row) {
        html += '    <tr>\n'
        row.split('|').filter(function (c) { return c.trim() }).forEach(function (cell) {
          html += '      <td style="border:1px solid #333;padding:4px 6px;color:#ccc">' + cell.trim() + '</td>\n'
        })
        html += '    </tr>\n'
      })
      html += '  </tbody>\n'
    }
    html += '</table>'
    return html
  })

  // 7. Inline formatting
  h = h
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code style="background:#222;padding:1px 4px;border-radius:3px;font-size:11px">$1</code>')

  // 8. Unordered lists
  h = h.replace(/((?:^[*-] .+(?:\n|$))+)/gm, function (listBlock) {
    var items = listBlock.trim().split('\n').filter(function (l) { return l.trim() })
    return '<ul style="margin:4px 0;padding-left:16px">\n' +
      items.map(function (i) { return '  <li style="color:#ccc;font-size:12px">' + i.replace(/^[*-] /, '') + '</li>' }).join('\n') + '\n</ul>'
  })

  // 9. Ordered lists
  h = h.replace(/((?:^\d+\. .+(?:\n|$))+)/gm, function (listBlock) {
    var items = listBlock.trim().split('\n').filter(function (l) { return l.trim() })
    return '<ol style="margin:4px 0;padding-left:16px">\n' +
      items.map(function (i) { return '  <li style="color:#ccc;font-size:12px">' + i.replace(/^\d+\. /, '') + '</li>' }).join('\n') + '\n</ol>'
  })

  // 10. Paragraphs
  h = h.split(/\n{2,}/).map(function (para) {
    para = para.trim()
    if (!para) return ''
    if (/^<(h[2-5]|hr|ul|ol|table|pre|div)/.test(para)) return para
    var withBreaks = para.replace(/\n/g, '<br>')
    return '<p style="margin:4px 0;color:#ccc;font-size:12px;line-height:1.6">' + withBreaks + '</p>'
  }).join('\n')

  // 11. Restore mermaid blocks
  h = h.replace(/%%MERMAID(\d+)%%/g, function (_, idx) {
    var code = mermaidBlocks[parseInt(idx)]
    var encoded = btoa(unescape(encodeURIComponent(code)))
    var escapedCode = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return (
      '<div class="hub-mermaid-block" data-code="' + escapedCode.replace(/"/g, '&quot;') + '" style="margin:8px 0;background:#141414;border:1px solid #2a2a2a;border-radius:6px;padding:10px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">' +
          '<span style="font-size:10px;color:#888;font-weight:600">📊 Mermaid</span>' +
          '<div style="display:flex;gap:4px">' +
            '<button class="hub-copy-btn" ' +
              'style="background:none;border:1px solid #888;color:#ccc;font-size:9px;font-weight:600;padding:1px 6px;border-radius:3px;cursor:pointer">' +
              'Copiar' +
            '</button>' +
            '<a href="https://mermaid.live/edit#base64:' + encoded + '" target="_blank" rel="noopener" ' +
              'style="background:none;border:1px solid #58a6ff;color:#58a6ff;font-size:9px;font-weight:600;padding:1px 6px;border-radius:3px;text-decoration:none;cursor:pointer">' +
              '🔗 Abrir en mermaid.live' +
            '</a>' +
          '</div>' +
        '</div>' +
        '<pre style="margin:0;font-size:11px;color:#aaa;white-space:pre-wrap;background:#0d1117;padding:8px;border-radius:4px;overflow-x:auto"><code>' +
          escapedCode +
        '</code></pre>' +
      '</div>'
    )
  })

  // 12. Restore code blocks
  h = h.replace(/%%CB(\d+)%%/g, function (_, idx) { return codeBlocks[parseInt(idx)] })

  return h
}

var STATUS_LABELS = {
  backlog: 'Backlog',
  shaping: 'Shaping',
  todo: 'Todo',
  in_progress: 'In Progress',
  in_review: 'In Review',
  staging: 'Staging',
  production: 'Production',
  done: 'Done',
  cancelled: 'Cancelled',
  problem_discovery: 'Problem Discovery',
  problem_validation: 'Problem Validation',
  discovery_completed: 'Completed',
  unassigned: 'Sin asignar',
}

var STATUS_ICONS = {
  backlog: ICON_CLIPBOARD_DOCUMENT_LIST,
  shaping: ICON_WRENCH,
  todo: ICON_PENCIL_SQUARE,
  in_progress: ICON_ARROW_PATH,
  in_review: ICON_MAGNIFYING_GLASS,
  staging: ICON_BEAKER,
  production: ICON_ROCKET_LAUNCH,
  done: ICON_CHECK_CIRCLE,
  cancelled: ICON_X_CIRCLE,
  problem_discovery: ICON_MAGNIFYING_GLASS,
  problem_validation: ICON_CHECK_CIRCLE,
  discovery_completed: ICON_CHECK_BADGE,
  unassigned: null,
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status
}

function statusText(status) {
  return STATUS_LABELS[status] || status
}

// Alias con el nombre del plugin original hub-ticket-search
function statusBadge(status) {
  return statusLabel(status)
}

var STATUS_COLORS = {
  backlog: '#8b949e',
  shaping: '#a371f7',
  todo: '#3fb950',
  in_progress: '#f59e0b',
  in_review: '#58a6ff',
  staging: '#f0883e',
  production: '#1f6feb',
  done: '#2ea043',
  cancelled: '#f85149',
  problem_discovery: '#a371f7',
  problem_validation: '#3fb950',
  discovery_completed: '#2ea043',
  unassigned: '#6e7681',
}

function statusPillEl(status) {
  var color = STATUS_COLORS[status] || '#8b949e'
  var icon = STATUS_ICONS[status]
  return jsx('span', {
    style: {
      fontSize: 10,
      padding: '1px 8px',
      borderRadius: 999,
      border: '1px solid ' + color,
      color: color,
      flexShrink: 0,
      fontWeight: 500,
      lineHeight: '14px',
      marginTop: 2,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
    },
    children: [icon ? jsx(Icon, { path: icon, className: 'size-3 shrink-0' }) : null, statusText(status)],
  }, 'pill-' + status)
}

function statusBadgeEl(status) {
  var color = STATUS_COLORS[status] || '#8b949e'
  var icon = STATUS_ICONS[status]
  return jsx('span', {
    style: {
      fontSize: 10,
      padding: '2px 8px',
      borderRadius: 4,
      backgroundColor: color,
      color: '#0d1117',
      fontWeight: 600,
      whiteSpace: 'nowrap',
      flexShrink: 0,
      marginTop: 2,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
    },
    children: [icon ? jsx(Icon, { path: icon, className: 'size-3 shrink-0' }) : null, statusLabel(status)],
  })
}

var TYPE_ICONS = {
  track: ICON_CHECK_BADGE,
  task: ICON_CLIPBOARD_DOCUMENT_LIST,
  project: ICON_CUBE,
  discovery: ICON_LIGHT_BULB,
}

function typeIcon(type) {
  return TYPE_ICONS[type] || ICON_DOCUMENT_TEXT
}

// ── Prompt builders ────────────────────────────────────────────────
