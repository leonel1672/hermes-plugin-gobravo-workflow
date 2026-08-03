function PlaceholderTab({ name }) {
  return jsx('div', {
    style: { padding: 40, textAlign: 'center', color: '#555', fontSize: 13 },
    children: jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'center' }, children: [jsx(Icon, { path: ICON_ARROW_PATH, className: 'size-3.5 shrink-0' }), ' ' + name + ' — próximamente'] }),
  })
}

// ── Format helpers ─────────────────────────────────────────────────
