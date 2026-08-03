/**
 * Gobravo Workflow — mega-plugin consolidado.
 * Tabs: Stats, PRs, Tickets, Status, Config.
 *
 * Requiere: API Token de Hub (Tracks), GitHub Token + Webhook URL (PRs).
 * Tokens se guardan en localStorage.
 */

import { haptic, host } from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import { useState, useRef, useEffect, useCallback } from 'react'

const ID = 'gobravo-workflow'
const STORAGE_HUB_TOKEN = `hermes-plugin-${ID}-hub-token`
const STORAGE_GITHUB_TOKEN = `hermes-plugin-${ID}-github-token`
const STORAGE_WEBHOOK_URL = `hermes-plugin-${ID}-webhook-url`
const STORAGE_TICKETS_SQUADS = `hermes-plugin-${ID}-tickets-squads`
const STORAGE_PR_MESSAGE = `hermes-plugin-${ID}-pr-message`
const STORAGE_SIDEBAR_COLLAPSED = `hermes-plugin-${ID}-sidebar-collapsed`
const STORAGE_TRACK_RULES = `hermes-plugin-${ID}-track-rules`
const STORAGE_AI_PROVIDER = `hermes-plugin-${ID}-ai-provider`
const STORAGE_AI_MODEL = `hermes-plugin-${ID}-ai-model`
const STORAGE_AI_PROMPT = `hermes-plugin-${ID}-ai-prompt`
const PR_MESSAGE_DEFAULT = '👋 Team, cuando puedan échenme la mano con el code review de este PR:\n\n📌 {title}\n🔗 {url}\n#{number} · {repo}'
const AI_PROMPT_DEFAULT = 'Analiza los {N} tickets del tracker (tasks y tracks) que se te dan y produce un DIAGNÓSTICO OPERATIVO de este squad. NO hagas un resumen genérico: identifica causas raíz y da acciones concretas.\n\nUsa exactamente este formato:\n\n## 1. Dolencias por dominio\nAgrupa los tickets por causa raíz / dominio real (pagos, asignación de clientes, mensajería, auth, UI, deuda técnica, datos, etc.). Para cada grupo:\n- **Nombre del dominio** — X de {N} tickets (YY%)\n- El patrón que los une (qué falla y por qué)\n- 2-3 códigos de ticket como evidencia\n\n## 2. Cuellos de botella\n- Tickets atascados en shaping/todo SIN due_date (indica cuánto llevan sin moverse)\n- Items de prioridad high que llevan mucho tiempo en backlog\n- Concentración de trabajo en un solo owner\n\n## 3. Riesgos de revenue / operación\n- Bugs en flujos críticos (cobro, pago, suspensión, asignación, mensajería)\n- Tickets de clientes que se repiten o se escalan\n- Items con due_date vencido o muy próximo\n\n## 4. Plan de acción (máximo 3 acciones)\nPara cada una: qué hacer, a quién asignar (según ownership detectado), y por qué va primero.\n\nReglas:\n- Cita códigos de ticket reales (TRACKER-...)\n- Distingue tracks (proyectos/épicas) de tasks (bugs/tickets puntuales)\n- Sé concreto y breve; no rellenes secciones vacías con "nada que reportar".'
const HUB_BASE = 'https://hub.gobravo.io/api/v1'

// ── StatusTab constants ────────────────────────────────────────────
const CACHE_TTL = 120_000
const DEFAULT_STATUS_MODELS = {
  shaping: 'coder',
  todo: 'coder',
  in_progress: 'coder',
}
