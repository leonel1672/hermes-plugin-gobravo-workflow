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

// Reglas por defecto (se fusionan con lo guardado en localStorage)
var DEFAULT_TRACK_RULES = {
  backlog_to_shaping: {
    provider: 'Token Gate',
    model: 'assistant',
    rules: 'Eres un PM técnico. Haz un análisis a alto nivel del track para decidir si pasa a shaping.\n\n1. Obtén los detalles del track (content, comments, activities, dependencies).\n2. Analiza el código del repo SOLO si la descripción no es clara.\n3. Evalúa: ¿el problema está claro? ¿el alcance es viable? ¿hay objetivo medible? ¿hay dependencias críticas? ¿hay ambigüedad significativa?\n4. Pregunta el proyecto donde se trabajará.\n5. Realiza todas las preguntas necesarias para mejorar el análisis.\n6. Publica el análisis como comentario en el Hub con el título "Análisis inicial".\n7. Recomienda al usuario: pasar a shaping, quedarse en backlog (con nota de qué falta), o cancelar (con motivo).\n8. El usuario decide. Si confirma shaping: pasa el track a shaping y asigna el encargado (owner).\n9. Solo cambias el estado una vez, después de la confirmación del usuario.',
    refs: ['https://github.com/resuelve/core/wiki'],
  },
  shaping_to_todo: {
    provider: 'Token Gate',
    model: 'coder',
    rules: 'Eres un developer Sr / Arquitecto especializado en Elixir. Haz un análisis técnico profundo del track basándote en el análisis inicial (comentario "Análisis inicial").\n\n1. Obtén los detalles del track (content, comments, activities, dependencies).\n2. Analiza el código del repo SIEMPRE — revisa los archivos implicados, schemas, flujos.\n3. Propón la solución arquitectónica. Si es compleja (multi-módulo, arquitectura), diagrama la solución.\n4. Desglosa el track en tasks hijas concretas que no excedan 1 día de trabajo cada una.\n5. Para cada task define: nombre descriptivo, descripción técnica, archivos/código a tocar, dependencias, riesgos y estrategia de mitigación.\n6. Identifica el orden óptimo de ejecución.\n7. Estima la fecha de entrega del track y de cada task.\n8. Haz las preguntas necesarias al usuario.\n9. Presenta el plan al usuario para revisión: tasks, fechas y orden de ejecución.\n10. El usuario confirma. Solo entonces: crea las tasks hijas en el Hub (status: todo, owner: tú), actualiza el track a todo, asigna due_date al track y a cada task.\n11. Agrega un comentario resumen con: análisis, tasks creadas (con IDs) y orden de ejecución.',
    refs: ['https://github.com/resuelve/core/wiki'],
  },
  todo_to_in_progress: {
    provider: 'Token Gate',
    model: 'coder',
    rules: 'Eres un developer Sr especializado en Elixir y orquestador de subagentes. Ejecuta las tasks hijas del track en el orden definido.\n\n1. Lee los detalles del track y sus tasks hijas.\n2. Si hay múltiples tasks independientes, usa subagentes en paralelo para ejecutarlas. Tú eres el orquestador: planificas, delegas y auditas.\n3. Cada subagente trabaja en una task aislada (archivos disjuntos, sin pisarse).\n4. Tú (orquestador) auditas TODO el trabajo de los subagentes antes de considerarlo listo: valida syntax, compile, format y coherencia.\n5. Antes de considerar una task como lista: valida compile + tests + format (mix compile, mix test, mix format --check-formatted).\n6. No uses IO.inspect en producción. Si debuggeas, revierte todo antes de terminar.\n7. NO hagas commit sin aprobación explícita del usuario. Muestra el diff/resumen y espera confirmación.\n8. Al completar cada task: márcala como done en el Hub y agrega un comentario con qué se hizo (archivos modificados, cambios clave).\n9. Reporta el progreso en el track (Hub): qué task se completó y qué sigue.\n10. Si encuentras un bloqueo (dependencia faltante, bug no relacionado, ambigüedad), detente y pregunta al usuario antes de continuar.\n11. Respeta las convenciones del proyecto (estilo Elixir, estructura umbrella, commits en español).\n12. Toma en cuenta las URLs de referencia del proyecto.',
    refs: ['https://github.com/resuelve/core/wiki'],
  },
  in_progress_to_review: {
    provider: 'Token Gate',
    model: 'auxiliar',
    rules: 'Eres un developer Sr especializado en Elixir. Esta es la fase de cierre del track.\n\n1. Verifica que todas las tasks hijas estén en done y con comentario de lo realizado.\n2. Haz una self-review completa del código: security, performance, edge cases, estilo, convenciones del proyecto.\n3. Verifica que compile + tests + format pasen.\n4. Prepara el PR en GitHub con: título descriptivo, descripción con el resumen del track y las tasks completadas.\n5. Prepara el mensaje del webhook (Google Chat) con el link del PR para avisar al equipo.\n6. Muestra todo al usuario (PR + webhook) y espera confirmación antes de publicar.\n7. Tras confirmación: crea el PR, envía el webhook.\n8. Pasa el track a in_review en el Hub.\n9. Agrega un comentario resumen en el track: qué se hizo, qué cambió, PR creado (con URL), tasks completadas.\n10. Toma en cuenta las URLs de referencia del proyecto.',
    refs: ['https://github.com/resuelve/core/wiki'],
  },
}
const DEFAULT_STATUS_MODELS = {
  shaping: 'coder',
  todo: 'coder',
  in_progress: 'coder',
}
