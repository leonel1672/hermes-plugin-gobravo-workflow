#!/usr/bin/env node
/**
 * Build script for Gobravo Workflow mega-plugin.
 * Concatena los módulos de lib/ en plugin.js final.
 * Uso: node build.js
 */

const fs = require('fs')
const path = require('path')

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

let combined = ''

for (const fname of FILES) {
  const filePath = path.join(libDir, fname)
  const content = fs.readFileSync(filePath, 'utf8').trimEnd()
  combined += content + '\n\n'
}

fs.writeFileSync(outputPath, combined)
console.log('plugin.js generado: ' + (combined.length / 1024).toFixed(1) + ' KB, ' + combined.split('\\n').length + ' líneas')
