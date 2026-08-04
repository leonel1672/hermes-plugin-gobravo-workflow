#!/usr/bin/env node
/**
 * Build script for Gobravo Workflow mega-plugin.
 * Concatena los módulos de lib/ en plugin.js final.
 * Uso: node build.js
 *
 * Validaciones post-build (falla con exit code != 0 si algo está mal):
 *   1. Sintaxis del bundle generado (node --check)
 *   2. Exactamente 1 `export default`
 *   3. Imports solo en constants.js (los demás módulos deben ser puros)
 *   4. FILES cubre todos los .js de lib/ (y no sobran)
 *   5. Tamaño mínimo de cordura (100 KB)
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const FILES = [
  'constants.js',
  'icons.js',
  'helpers.js',
  'format-helpers.js',
  'md-prompt.js',
  'prs-tab.js',
  'stats-tab.js',
  'tickets-tab.js',
  'teamStats.js',
  'TeamTab.js',
  'status-tab.js',
  'config-tab.js',
  'tab-shell.js',
]

const libDir = path.join(__dirname, 'lib')
const outputPath = path.join(__dirname, 'plugin.js')
const MIN_BYTES = 100 * 1024

let failures = 0
const fail = (msg) => { console.error('  ✗ ' + msg); failures++ }
const ok = (msg) => { console.log('  ✓ ' + msg) }

// ── 4. FILES vs lib/ ──────────────────────────────────────────────
const libFiles = fs.readdirSync(libDir).filter((f) => f.endsWith('.js')).sort()
const missing = libFiles.filter((f) => !FILES.includes(f))
const extra = FILES.filter((f) => !libFiles.includes(f))
if (missing.length) fail('lib/ tiene archivos no incluidos en FILES: ' + missing.join(', '))
else ok('lib/ cubierto: ' + libFiles.length + ' archivos en FILES')
if (extra.length) fail('FILES referencia archivos inexistentes: ' + extra.join(', '))

// ── 3. Imports/exports por módulo ─────────────────────────────────
for (const fname of FILES) {
  const src = fs.readFileSync(path.join(libDir, fname), 'utf8')
  const imports = (src.match(/^\s*import\s/gm) || []).length
  const exports = (src.match(/^\s*export\s/gm) || []).length
  if (fname === 'constants.js') {
    if (imports === 0) fail('constants.js debe tener los imports del SDK/react')
    else ok('constants.js imports: ' + imports)
    if (exports > 0) fail('constants.js no debe tener exports')
  } else {
    if (imports > 0) fail(fname + ' tiene imports (solo constants.js los lleva): ' + imports)
    if (exports > 1) fail(fname + ' tiene ' + exports + ' exports (máx 1 export default)')
  }
}

// ── 1. Concat ─────────────────────────────────────────────────────
let combined = ''
for (const fname of FILES) {
  const content = fs.readFileSync(path.join(libDir, fname), 'utf8').trimEnd()
  combined += content + '\n\n'
}
fs.writeFileSync(outputPath, combined)

// ── 5. Tamaño mínimo ──────────────────────────────────────────────
const bytes = Buffer.byteLength(combined, 'utf8')
if (bytes < MIN_BYTES) fail('bundle muy pequeño: ' + (bytes / 1024).toFixed(1) + ' KB (< ' + (MIN_BYTES / 1024) + ' KB)')
else ok('tamaño: ' + (bytes / 1024).toFixed(1) + ' KB')

// ── 1b. Sintaxis (node --check sobre copia .mjs) ─────────────────
// NOTA: node --check sobre .js con sintaxis ESM da falsos positivos
// (no detecta errores al final del archivo). La copia .mjs fuerza
// parseo ESM completo.
const checkTmp = path.join(os.tmpdir(), 'gw-bundle-check-' + process.pid + '.mjs')
try {
  fs.writeFileSync(checkTmp, combined)
  execFileSync(process.execPath, ['--check', checkTmp], { stdio: 'pipe' })
  ok('node --check: sintaxis OK (ESM, vía .mjs)')
} catch (e) {
  fail('node --check falló: ' + (e.stderr ? e.stderr.toString().split('\n')[0] : e.message))
} finally {
  fs.rmSync(checkTmp, { force: true })
}

// ── 2. Export default único ───────────────────────────────────────
const exportDefaults = (combined.match(/^export default/gm) || []).length
if (exportDefaults !== 1) fail('export default = ' + exportDefaults + ' (debe ser 1)')
else ok('export default: 1')

// ── Resumen ───────────────────────────────────────────────────────
const lineCount = combined.split('\n').length
console.log('plugin.js generado: ' + (bytes / 1024).toFixed(1) + ' KB, ' + lineCount + ' líneas')
if (failures > 0) {
  console.error('\nBUILD FALLIDO: ' + failures + ' validación(es) con error')
  process.exit(1)
}
console.log('BUILD OK: ' + libFiles.length + ' módulos, bundle válido')
