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
const PR_MESSAGE_DEFAULT = '👋 Team, cuando puedan échenme la mano con el code review de este PR:\n\n📌 {title}\n🔗 {url}\n#{number} · {repo}'
const HUB_BASE = 'https://hub.gobravo.io/api/v1'

// ── StatusTab constants ────────────────────────────────────────────
const CACHE_TTL = 120_000
const DEFAULT_STATUS_MODELS = {
  shaping: 'coder',
  todo: 'coder',
  in_progress: 'coder',
}
