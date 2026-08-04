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

// Iconos del sidebar (Heroicons solid 20 + logo GitHub de Simple Icons)
const ICON_USER = 'M10 8C11.6569 8 13 6.65685 13 5C13 3.34315 11.6569 2 10 2C8.34315 2 7 3.34315 7 5C7 6.65685 8.34315 8 10 8Z'

const ICON_GITHUB = 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12'

const ICON_TICKET = 'M15.75 3C16.9926 3 18 4.00736 18 5.25V6.46353C18 6.88735 17.7226 7.25186 17.3672 7.48284C16.5442 8.01776 16 8.94532 16 10C16 11.0547 16.5442 11.9822 17.3672 12.5172C17.7226 12.7481 18 13.1127 18 13.5365V14.75C18 15.9926 16.9926 17 15.75 17H4.25C3.00736 17 2 15.9926 2 14.75V13.5365C2 13.1127 2.27744 12.7481 2.63279 12.5172C3.45575 11.9822 4 11.0547 4 10C4 8.94532 3.45575 8.01776 2.63279 7.48284C2.27744 7.25186 2 6.88735 2 6.46353V5.25C2 4.00736 3.00736 3 4.25 3H15.75ZM13.5 7.39583C13.5 6.98162 13.1642 6.64583 12.75 6.64583C12.3358 6.64583 12 6.98162 12 7.39583V8.4375C12 8.85171 12.3358 9.1875 12.75 9.1875C13.1642 9.1875 13.5 8.85171 13.5 8.4375V7.39583ZM13.5 11.5625C13.5 11.1483 13.1642 10.8125 12.75 10.8125C12.3358 10.8125 12 11.1483 12 11.5625V12.6042C12 13.0184 12.3358 13.3542 12.75 13.3542C13.1642 13.3542 13.5 13.0184 13.5 12.6042V11.5625Z'

const ICON_CLIPBOARD_DOCUMENT_CHECK = 'M17.9999 5.25C17.9999 4.08761 17.1185 3.1311 15.9875 3.0124C15.8688 1.88145 14.9123 1 13.7499 1H12.2499C11.0875 1 10.131 1.88145 10.0123 3.0124C9.13721 3.10424 8.4115 3.69769 8.12793 4.5H10.9999C12.3806 4.5 13.4999 5.61929 13.4999 7V14H15.7499C16.9925 14 17.9999 12.9926 17.9999 11.75V5.25ZM12.2499 2.5C11.8357 2.5 11.4999 2.83579 11.4999 3.25V3.5H14.4999V3.25C14.4999 2.83579 14.1641 2.5 13.7499 2.5H12.2499Z'

const ICON_COG_8_TOOTH = 'M8.33922 1.80388C8.43271 1.33646 8.84312 1 9.3198 1H10.6802C11.1569 1 11.5673 1.33646 11.6608 1.80388L11.9553 3.27675C12.4522 3.42101 12.9263 3.61886 13.3709 3.86363L14.6212 3.03014C15.0178 2.76572 15.5459 2.81802 15.883 3.15508L16.8449 4.11702C17.182 4.45409 17.2343 4.98221 16.9699 5.37883L16.1364 6.62908C16.3811 7.07369 16.579 7.54778 16.7232 8.04465L18.1961 8.33922C18.6635 8.43271 19 8.84312 19 9.3198V10.6802C19 11.1569 18.6635 11.5673 18.1961 11.6608L16.7232 11.9553C16.579 12.4522 16.3812 12.9262 16.1364 13.3708L16.97 14.6212C17.2344 15.0178 17.1821 15.5459 16.845 15.883L15.8831 16.8449C15.546 17.182 15.0179 17.2343 14.6213 16.9699L13.371 16.1363C12.9264 16.3811 12.4522 16.579 11.9554 16.7232L11.6608 18.1961C11.5673 18.6635 11.1569 19 10.6802 19H9.3198C8.84312 19 8.43271 18.6635 8.33922 18.1961L8.04465 16.7232C7.54778 16.579 7.0737 16.3811 6.62908 16.1364L5.37882 16.9699C4.9822 17.2343 4.45408 17.182 4.11701 16.8449L3.15507 15.883C2.81801 15.5459 2.76571 15.0178 3.03013 14.6212L3.86363 13.3709C3.61886 12.9263 3.42101 12.4522 3.27675 11.9554L1.80388 11.6608C1.33646 11.5673 1 11.1569 1 10.6802L1 9.3198C1 8.84312 1.33646 8.43271 1.80388 8.33922L3.27675 8.04465C3.42102 7.54774 3.61889 7.07363 3.86368 6.62898L3.03024 5.37882C2.76582 4.9822 2.81812 4.45408 3.15518 4.11701L4.11712 3.15507C4.45419 2.81801 4.98231 2.76571 5.37893 3.03013L6.62913 3.86359C7.07373 3.61884 7.5478 3.42101 8.04465 3.27675L8.33922 1.80388ZM13 10C13 11.6569 11.6569 13 10 13C8.34315 13 7 11.6569 7 10C7 8.34315 8.34315 7 10 7C11.6569 7 13 8.34315 13 10Z'

// view-columns (tablero de 3 columnas — historias de sprint)
const ICON_VIEW_COLUMNS = [
  'M14 17H16.75C17.9926 17 19 15.9926 19 14.75V5.25C19 4.00736 17.9926 3 16.75 3H14V17Z',
  'M12.5 3H7.5V17H12.5V3Z',
  'M3.25 3H6V17H3.25C2.00736 17 1 15.9926 1 14.75V5.25C1 4.00736 2.00736 3 3.25 3Z',
]

// squares-2x2 (grid — vista general / dashboard)
const ICON_SQUARES_2X2 = 'M4.25 2C3.00736 2 2 3.00736 2 4.25V6.75C2 7.99264 3.00736 9 4.25 9H6.75C7.99264 9 9 7.99264 9 6.75V4.25C9 3.00736 7.99264 2 6.75 2H4.25ZM4.25 11C3.00736 11 2 12.0074 2 13.25V15.75C2 16.9926 3.00736 18 4.25 18H6.75C7.99264 18 9 16.9926 9 15.75V13.25C9 12.0074 7.99264 11 6.75 11H4.25ZM13.25 2C12.0074 2 11 3.00736 11 4.25V6.75C11 7.99264 12.0074 9 13.25 9H15.75C16.9926 9 18 7.99264 18 6.75V4.25C18 3.00736 16.9926 2 15.75 2H13.25ZM13.25 11C12.0074 11 11 12.0074 11 13.25V15.75C11 16.9926 12.0074 18 13.25 18H15.75C16.9926 18 18 16.9926 18 15.75V13.25C18 12.0074 16.9926 11 15.75 11H13.25Z'

// wrench (llave inglesa — configuración)
const ICON_WRENCH = 'M19 5.5C19 7.98528 16.9853 10 14.5 10C14.4022 10 14.3051 9.99688 14.2088 9.99073C13.3358 9.93497 12.4014 10.1183 11.8414 10.7903L5.81681 18.0198C5.29925 18.6409 4.53256 19 3.7241 19C2.21962 19 1 17.7804 1 16.2759C1 15.4674 1.3591 14.7008 1.98017 14.1832L9.20974 8.15855C9.88173 7.59855 10.065 6.66418 10.0093 5.79122C10.0031 5.69494 10 5.59783 10 5.5C10 3.01472 12.0147 1 14.5 1C14.9823 1 15.4469 1.07588 15.8825 1.21636C16.2067 1.32092 16.2735 1.72672 16.0327 1.9676L13.3398 4.66042C13.2094 4.79088 13.1582 4.98403 13.2292 5.15431C13.5334 5.88351 14.1172 6.46695 14.8466 6.77074C15.0168 6.84163 15.2098 6.79041 15.3402 6.66002L18.0325 3.96772C18.2734 3.72683 18.6792 3.79367 18.7838 4.11791C18.9242 4.55338 19 5.01783 19 5.5ZM4 17C4.55228 17 5 16.5523 5 16C5 15.4477 4.55228 15 4 15C3.44772 15 3 15.4477 3 16C3 16.5523 3.44772 17 4 17Z'

// check-circle (tarea en orden)
const ICON_CHECK_CIRCLE = 'M10 18C14.4183 18 18 14.4183 18 10C18 5.58172 14.4183 2 10 2C5.58172 2 2 5.58172 2 10C2 14.4183 5.58172 18 10 18ZM13.8566 8.19113C14.1002 7.85614 14.0261 7.38708 13.6911 7.14345C13.3561 6.89982 12.8871 6.97388 12.6434 7.30887L9.15969 12.099L7.28033 10.2197C6.98744 9.92678 6.51256 9.92678 6.21967 10.2197C5.92678 10.5126 5.92678 10.9874 6.21967 11.2803L8.71967 13.7803C8.87477 13.9354 9.08999 14.0149 9.30867 13.9977C9.52734 13.9805 9.72754 13.8685 9.85655 13.6911L13.8566 8.19113Z'

// check-badge (tarea en orden — check prominente)
const ICON_CHECK_BADGE = 'M16.4032 12.6523C17.353 12.1487 18 11.1499 18 10C18 8.85007 17.353 7.85126 16.4032 7.34771C16.7188 6.32002 16.47 5.15625 15.6569 4.34312C14.8437 3.53 13.68 3.28122 12.6523 3.59679C12.1487 2.64698 11.1499 2 10 2C8.85007 2 7.85125 2.64699 7.3477 3.59681C6.32002 3.28126 5.15627 3.53004 4.34315 4.34316C3.53003 5.15628 3.28125 6.32003 3.5968 7.34771C2.64699 7.85126 2 8.85007 2 10C2 11.1499 2.64699 12.1487 3.59681 12.6523C3.28124 13.68 3.53001 14.8437 4.34314 15.6569C5.15627 16.47 6.32003 16.7188 7.34771 16.4032C7.85126 17.353 8.85007 18 10 18C11.1499 18 12.1488 17.353 12.6523 16.4032C13.68 16.7187 14.8437 16.47 15.6569 15.6568C16.47 14.8437 16.7188 13.68 16.4032 12.6523ZM13.8566 8.19113C14.1002 7.85614 14.0261 7.38708 13.6911 7.14345C13.3561 6.89982 12.8871 6.97388 12.6434 7.30887L9.15969 12.099L7.28033 10.2197C6.98744 9.92678 6.51256 9.92678 6.21967 10.2197C5.92678 10.5126 5.92678 10.9874 6.21967 11.2803L8.71967 13.7803C8.87477 13.9354 9.08999 14.0149 9.30867 13.9977C9.52734 13.9805 9.72754 13.8685 9.85655 13.6911L13.8566 8.19113Z'

// check (palomita — tarea en orden)
const ICON_CHECK = 'M16.7045 4.15347C17.034 4.4045 17.0976 4.87509 16.8466 5.20457L8.84657 15.7046C8.71541 15.8767 8.51627 15.9838 8.30033 15.9983C8.08439 16.0129 7.87271 15.9334 7.71967 15.7804L3.21967 11.2804C2.92678 10.9875 2.92678 10.5126 3.21967 10.2197C3.51256 9.92682 3.98744 9.92682 4.28033 10.2197L8.17351 14.1129L15.6534 4.29551C15.9045 3.96603 16.3751 3.90243 16.7045 4.15347Z'

const ICON_ARROW_LEFT = 'M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z'
const ICON_ARROW_RIGHT = 'M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z'

const ICON_PLUS = 'M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z'
const ICON_CHEVRON_LEFT = 'M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z'
const ICON_CHEVRON_RIGHT = 'M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z'
const ICON_ARROW_UP_RIGHT = 'M5.22 14.78a.75.75 0 001.06 0l7.22-7.22v5.69a.75.75 0 001.5 0v-7.5a.75.75 0 00-.75-.75h-7.5a.75.75 0 000 1.5h5.69l-7.22 7.22a.75.75 0 000 1.06z'
const ICON_ARROW_PATH = 'M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z'
const ICON_ARROW_UP_TRAY = ['M9.25 13.25a.75.75 0 001.5 0V4.636l2.955 3.129a.75.75 0 001.09-1.03l-4.25-4.5a.75.75 0 00-1.09 0l-4.25 4.5a.75.75 0 101.09 1.03L9.25 4.636v8.614z', 'M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z']
const ICON_X_MARK = 'M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z'
const ICON_HAND_THUMBS_UP = 'M1 8.25a1.25 1.25 0 112.5 0v7.5a1.25 1.25 0 11-2.5 0v-7.5zM11 3V1.7c0-.268.14-.526.395-.607A2 2 0 0114 3c0 .995-.182 1.948-.514 2.826-.204.54.166 1.174.744 1.174h2.52c1.243 0 2.261 1.01 2.146 2.247a23.864 23.864 0 01-1.341 5.974C17.153 16.323 16.072 17 14.9 17h-3.192a3 3 0 01-1.341-.317l-2.734-1.366A3 3 0 006.292 15H5V8h.963c.685 0 1.258-.483 1.612-1.068a4.011 4.011 0 012.166-1.73c.432-.143.853-.386 1.011-.814.16-.432.248-.9.248-1.388z'
const ICON_HAND_RAISED = 'M11 2a1 1 0 10-2 0v6.5a.5.5 0 01-1 0V3a1 1 0 10-2 0v5.5a.5.5 0 01-1 0V5a1 1 0 10-2 0v7a7 7 0 1014 0V8a1 1 0 10-2 0v3.5a.5.5 0 01-1 0V3a1 1 0 10-2 0v5.5a.5.5 0 01-1 0V2z'
const ICON_PAPER_AIRPLANE = 'M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z'
const ICON_PENCIL_SQUARE = ['M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z', 'M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z']
const ICON_CHAT_BUBBLE_LEFT = 'M3.43 2.524A41.29 41.29 0 0110 2c2.236 0 4.43.18 6.57.524 1.437.231 2.43 1.49 2.43 2.902v5.148c0 1.413-.993 2.67-2.43 2.902a41.202 41.202 0 01-5.183.501.78.78 0 00-.528.224l-3.579 3.58A.75.75 0 016 17.25v-3.443a41.033 41.033 0 01-2.57-.33C1.993 13.244 1 11.986 1 10.573V5.426c0-1.413.993-2.67 2.43-2.902z'
const ICON_CLIPBOARD_DOCUMENT_LIST = ['M15.988 3.012A2.25 2.25 0 0118 5.25v6.5A2.25 2.25 0 0115.75 14H13.5V7A2.5 2.5 0 0011 4.5H8.128a2.252 2.252 0 011.884-1.488A2.25 2.25 0 0112.25 1h1.5a2.25 2.25 0 012.238 2.012zM11.5 3.25a.75.75 0 01.75-.75h1.5a.75.75 0 01.75.75v.25h-3v-.25z', 'M2 7a1 1 0 011-1h8a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V7zm2 3.25a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5a.75.75 0 01-.75-.75zm0 3.5a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5a.75.75 0 01-.75-.75z']
const ICON_MAGNIFYING_GLASS = 'M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z'
const ICON_KEY = 'M8 7a5 5 0 113.61 4.804l-1.903 1.903A1 1 0 019 14H8v1a1 1 0 01-1 1H6v1a1 1 0 01-1 1H3a1 1 0 01-1-1v-2a1 1 0 01.293-.707L8.196 8.39A5.002 5.002 0 018 7zm5-3a.75.75 0 000 1.5A1.5 1.5 0 0114.5 7 .75.75 0 0016 7a3 3 0 00-3-3z'
const ICON_DOCUMENT_TEXT = 'M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06l-4.12-4.122A1.5 1.5 0 0011.378 2H4.5zm2.25 8.5a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zm0 3a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5z'
const ICON_CUBE = 'M10.362 1.093a.75.75 0 00-.724 0L2.523 5.018 10 9.143l7.477-4.125-7.115-3.925zM18 6.443l-7.25 4v8.25l6.862-3.786A.75.75 0 0018 14.25V6.443zm-8.75 12.25v-8.25l-7.25-4v7.807a.75.75 0 00.388.657l6.862 3.786z'
const ICON_X_CIRCLE = 'M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z'
const ICON_EYE = ['M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z', 'M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z']
const ICON_CALENDAR = 'M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z'
const ICON_SPARKLES = 'M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192zM6.949 5.684a1 1 0 00-1.898 0l-.683 2.051a1 1 0 01-.633.633l-2.051.683a1 1 0 000 1.898l2.051.684a1 1 0 01.633.632l.683 2.051a1 1 0 001.898 0l.683-2.051a1 1 0 01.633-.633l2.051-.683a1 1 0 000-1.898l-2.051-.683a1 1 0 01-.633-.633L6.95 5.684zM13.949 13.684a1 1 0 00-1.898 0l-.184.551a1 1 0 01-.632.633l-.551.183a1 1 0 000 1.898l.551.183a1 1 0 01.633.633l.183.551a1 1 0 001.898 0l.184-.551a1 1 0 01.632-.633l.551-.183a1 1 0 000-1.898l-.551-.184a1 1 0 01-.633-.632l-.183-.551z'
const ICON_INBOX = 'M1 11.27c0-.246.033-.492.099-.73l1.523-5.521A2.75 2.75 0 015.273 3h9.454a2.75 2.75 0 012.651 2.019l1.523 5.52c.066.239.099.485.099.732V15a2 2 0 01-2 2H3a2 2 0 01-2-2v-3.73zm3.068-5.852A1.25 1.25 0 015.273 4.5h9.454a1.25 1.25 0 011.205.918l1.523 5.52c.006.02.01.041.015.062H14a1 1 0 00-.86.49l-.606 1.02a1 1 0 01-.86.49H8.236a1 1 0 01-.894-.553l-.448-.894A1 1 0 006 11H2.53l.015-.062 1.523-5.52z'
const ICON_CPU_CHIP = ['M14 6H6v8h8V6z', 'M9.25 3V1.75a.75.75 0 011.5 0V3h1.5V1.75a.75.75 0 011.5 0V3h.5A2.75 2.75 0 0117 5.75v.5h1.25a.75.75 0 010 1.5H17v1.5h1.25a.75.75 0 010 1.5H17v1.5h1.25a.75.75 0 010 1.5H17v.5A2.75 2.75 0 0114.25 17h-.5v1.25a.75.75 0 01-1.5 0V17h-1.5v1.25a.75.75 0 01-1.5 0V17h-1.5v1.25a.75.75 0 01-1.5 0V17h-.5A2.75 2.75 0 013 14.25v-.5H1.75a.75.75 0 010-1.5H3v-1.5H1.75a.75.75 0 010-1.5H3v-1.5H1.75a.75.75 0 010-1.5H3v-.5A2.75 2.75 0 015.75 3h.5V1.75a.75.75 0 011.5 0V3h1.5zM4.5 5.75c0-.69.56-1.25 1.25-1.25h8.5c.69 0 1.25.56 1.25 1.25v8.5c0 .69-.56 1.25-1.25 1.25h-8.5c-.69 0-1.25-.56-1.25-1.25v-8.5z']
const ICON_LINK = ['M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z', 'M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z']
const ICON_CHART_BAR = 'M15.5 2A1.5 1.5 0 0014 3.5v13a1.5 1.5 0 001.5 1.5h1a1.5 1.5 0 001.5-1.5v-13A1.5 1.5 0 0016.5 2h-1zM9.5 6A1.5 1.5 0 008 7.5v9A1.5 1.5 0 009.5 18h1a1.5 1.5 0 001.5-1.5v-9A1.5 1.5 0 0010.5 6h-1zM3.5 10A1.5 1.5 0 002 11.5v5A1.5 1.5 0 003.5 18h1A1.5 1.5 0 006 16.5v-5A1.5 1.5 0 004.5 10h-1z'

const ICON_BEAKER = 'M8.5 3.528v4.644c0 .729-.29 1.428-.805 1.944l-1.217 1.216a8.75 8.75 0 013.55.621l.502.201a7.25 7.25 0 004.178.365l-2.403-2.403a2.75 2.75 0 01-.805-1.944V3.528a40.205 40.205 0 00-3 0zm4.5.084l.19.015a.75.75 0 10.12-1.495 41.364 41.364 0 00-6.62 0 .75.75 0 00.12 1.495L7 3.612v4.56c0 .331-.132.649-.366.883L2.6 13.09c-1.496 1.496-.817 4.15 1.403 4.475C5.961 17.852 7.963 18 10 18s4.039-.148 5.997-.436c2.22-.325 2.9-2.979 1.403-4.475l-4.034-4.034A1.25 1.25 0 0113 8.172v-4.56z'
const ICON_ROCKET_LAUNCH = ['M4.606 12.97a.75.75 0 01-.134 1.051 2.494 2.494 0 00-.93 2.437 2.494 2.494 0 002.437-.93.75.75 0 111.186.918 3.995 3.995 0 01-4.482 1.332.75.75 0 01-.461-.461 3.994 3.994 0 011.332-4.482.75.75 0 011.052.134z', 'M5.752 12A13.07 13.07 0 008 14.248v4.002c0 .414.336.75.75.75a5 5 0 004.797-6.414 12.984 12.984 0 005.45-10.848.75.75 0 00-.735-.735 12.984 12.984 0 00-10.849 5.45A5 5 0 001 11.25c.001.414.337.75.751.75h4.002zM13 9a2 2 0 100-4 2 2 0 000 4z']
const ICON_LIGHT_BULB = 'M10 1a6 6 0 00-3.815 10.631C7.237 12.5 8 13.443 8 14.456v.644a.75.75 0 00.572.729 6.016 6.016 0 002.856 0A.75.75 0 0012 15.1v-.644c0-1.013.762-1.957 1.815-2.825A6 6 0 0010 1zM8.863 17.414a.75.75 0 00-.226 1.483 9.066 9.066 0 002.726 0 .75.75 0 00-.226-1.483 7.553 7.553 0 01-2.274 0z'
const ICON_TAG = 'M5.5 3A2.5 2.5 0 003 5.5v2.879a2.5 2.5 0 00.732 1.767l6.5 6.5a2.5 2.5 0 003.536 0l2.878-2.878a2.5 2.5 0 000-3.536l-6.5-6.5A2.5 2.5 0 008.38 3H5.5zM6 7a1 1 0 100-2 1 1 0 000 2z'

function Icon({ path, className, viewBox }) {
  const ds = Array.isArray(path) ? path : [path]
  return jsx('svg', {
    viewBox: viewBox || '0 0 20 20',
    fill: 'currentColor',
    className: className || 'size-3.5 shrink-0',
    'aria-hidden': true,
    children: ds.map(d => jsx('path', { d })),
  })
}

// Logo de Bravo (favicon Group-78) — data URL embebida
const BRAVO_LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHMAAABgCAYAAAAuAU3TAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAawSURBVHgB7Z3LThxHFIZP9Xjs7TwClhKk7EBKQN6RJwhZBCtSJFhHtkyeIOINiIKybrZOJPATeHYWeGG2cRbwCF7GHndVqgom7mnPVF+mqv5TDd/Cl5keGPF3NfWdU10jds/fvlREWwRAEI2PN1a/pZ7w/OnZJSlaIQCCxDgTWfYbgTAn0d7rf7aoB/z55PUWKkiDEnSc5V9/capzfUcglFK/Ug8QQu0SCkFXO79v5Jn9j5LY0fnmcoUS5mT/1YpUao9giAPzpw0zu3//EDk65YcPe5QwRTGAXl2KQTE2f9sw8/WHOkh1TCiEeKZH54gSRZLaIhRC5D8eProy/8ymj2VCnBKOkR6d+5Qgz5++2kNOfPSoPJj++/8w82++HBtVIBRC4CYQS5HBLrFGR6aj0r6TmSeFOCAcK6lpClpH9OV9ZuI6E+bN6LwiEKlpClpHHh9tzvxqzKrHSCnuiggN4KIjZT4Lc/DgXg7VFKW2KQGgOnJTJKg+/FmYVlOARQTNLndNOdl/M4LqiJ74zHs0m/ugLSLAYK8pk+LfbS46UmZumGZ0gjXlGbEmA15iPxUJqmSLXwPVlNFPZ3+z/N2J1hGhioWVuoVhoosIA6ajU/9MkO/r4oejR+NFT2auV+o3DqvXctQUqyMkcVcM4dZGZ5g0HGJ7nVKyGp0cdaSMM0y0pightrloClpHpFS1OWS1B+B7nSw0Ba0jaqhqu1q1Yd6MzheEgk2vk6eOlKkN0x6UZTnhGBXv3+8RkL+enLEsElRpFCZaU/TJ9B0BUYTTpGrP0kWjMO0XBRYRkJpidEQBJz5mCWXTYxuHaUbnbVySyV1HyjQO03LLlmTe9CyBZcV2V8NWYcI1ZTKJqimTwt62gZlJ61E5HAxbLbJrFSZ8SWb0XidQR/TE5/vD9VYDp91l9voFOeGI1utMRUfKtA4z31i9uA29TqSONC0SVGkd5vX3wvY6Q2sKWkdcPUsXncJEFxFCawpaR1w9SxedwjRIKWD12pBFBI5LKJvSOUz0kkw9OoMsQL7REQwtiwRVOocJ73USBep14nREKbmU9nUO0764Z0sy0Xd0yXvLad9SYdolmchbAT33OoUaAO8d6aYjZZYK074HIuTq91ExmXipnaJ1pEuRoMrSYcJ7nbrERx5A6kibnqWLpcM0pL79DFpH2vQsXXgJM/XtZ1LWkTJewrTge51LTISg3RFvpVFvYaa6JBOsI++m2774wFuYqW4/A9aRUx8Tnyn+LrOE336m7ZLMPuhIGa9hojVFz6pbjTJsd2T5IkEVr2EawL3OtaaagtaRrj1LF97DTGX7GbSOdO1ZuvAepkH/QLH3dZ6/Xas/sh86UiZImGhN0TjDhOqIxyJBlSBhInud5hKfb6zmzmOAOqIo3Iw/SJj2C+N6nWPXkyc/n68hdUQOimAnebAwUdvPiKHb3YoBJbeEsinBwjTE1hR98uT5+ldXi56HL9YqwvZ+g4YZu4igTx7nLPrjRMBuAjI9y50/Ni4oIEHDNMTafsZOfOxth4tRGW6Vuq+epYvgYcbafkaH6byk91VHygQPM4amcNeRUEWCKuFHJkUpIjjdDa0jPnuWLqKEGXr7Ga0jzpHfZx0pEyVM+40CbT/DXUd89yxdRAszlKbU6kgxwI1KpV7EGpWGaGEafBcR9MlxUasjhNtgQggVtaQZNUzf28/UraZH60iInqWLqGFaPGlKMx3JgFucxl9xET1MX5oipPukMNtvq5q+ZjAiFQmqRA/T25LMB+4tO6GfBrTgoypCE/8yS8tvP3OnI/OBhLns9jN1Ex+ojkQsElSBhGnoqinmJDAng+sYqI4EWELZFFiYtoggqHV/r66lhtQR07OMrSNlYGEaZCFancVNdAS6wYQg2Kg0QMNsu/1MXc8S+mlAIB0pAw2zda9z6G4lgXUEMoMtAw3TvoGGSzIT0JExgYGH2XRJZu0Syp7d0dUFeJiGOk2xOuIYlQbZo/ssu8IizLpeJ3cd4TAqDSzCNCzafoa7jugrAnJTqxnYhLlo+xnuOvL4aBN56/8MbMK0zNOUOx1pDKswq71O1jrS4aMqQsMqzGqvk7WOdPioitDwuszSp+1n7nSkPezCnGoKZx3hUiSoco8YooP8pa5nidQRZM/ShaAEuV6sJV8Shoudo811Ygi7y2wToDoiBJsiQZXkRqbRkcnH7JIQ2J7l5kNiSnIjE6kjUvIp3c0juTCROqKGilWRoEpSYd7piJvERiZORzgWCaokEyayO8KpZ+kimTD1tLvX27744D9QUl3OijZbPgAAAABJRU5ErkJggg=='

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

function fmt(n) {
  if (n === 0 || n) return String(n)
  return '-'
}

function fmt1(n) {
  if (n === 0 || n) return n.toFixed(1)
  return '-'
}

function pct(n) {
  if (n === 0 || n) return n.toFixed(1) + '%'
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

  // 2. Extract other code blocks
  var codeBlocks = []
  h = h.replace(/```(\w*)\n?([\s\S]*?)```/g, function (_, lang, code) {
    var idx = codeBlocks.length
    codeBlocks.push('<pre style="background:#111;padding:8px;border-radius:4px;font-size:11px;overflow-x:auto;margin:4px 0"><code>' + code.trim() + '</code></pre>')
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
  backlog: '#6e7681',
  shaping: '#d29922',
  todo: '#58a6ff',
  in_progress: '#3fb950',
  in_review: '#a371f7',
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

function appendRules(promptText, rules, refs) {
  var extra = ''
  if (typeof rules === 'string' && rules.trim()) {
    extra += '\n\n### Reglas del equipo\n' + rules.trim()
  }
  if (Array.isArray(refs)) {
    var valid = refs.map(function (r) { return typeof r === 'string' ? r.trim() : '' }).filter(Boolean)
    if (valid.length) {
      extra += '\n\n### Referencias\n' + valid.map(function (r) { return '· ' + r }).join('\n')
    }
  }
  return extra ? promptText + extra : promptText
}

function buildBacklogPrompt(item, rules, refs) {
  return appendRules([
    '## Análisis de alto nivel de track en backlog: ' + item.code,
    '',
    '**Track:** ' + item.name,
    '**Código:** ' + item.code,
    '**URL:** https://hub.gobravo.io/tracker/tracks/' + item.id,
    '',
    '### Instrucciones',
    '',
    'Eres un PM técnico. Haz un análisis a alto nivel para decidir si el track pasa a shaping.',
    '',
    '1. **Obtén los detalles** del track usando `get_workitem` con el ID `' + item.id + '` e incluyendo content, comments y dependencies.',
    '2. **Evalúa a alto nivel**: ¿El problema está claro? ¿El alcance es viable? ¿Tiene objetivo medible? ¿Hay dependencias críticas? ¿Hay ambigüedad significativa?',
    '3. **Publica el análisis como comentario** usando `add_comment`.',
    '4. **Decisión final según el análisis**:',
    '   - **Si está bien definido**: Pasa el track a `shaping` usando `update_status` y notifica al usuario.',
    '   - **Si falta definición**: Déjalo en `backlog`, agrega un comentario listando exactamente qué falta definir y qué necesitas del usuario para continuar.',
    '   - **Si está fuera del alcance o no es viable**: Cancélalo usando `update_status` con estado `cancelled` y un comentario explicando el motivo.',
    '',
    'Solo cambias el estado una vez. No hagas múltiples cambios.',
  ].join('\n'), rules, refs)
}

function buildShapingPrompt(item, rules, refs) {
  return appendRules([
    '## Análisis profundo (coder-sr) de track en shaping: ' + item.code,
    '',
    '**Track:** ' + item.name,
    '**Código:** ' + item.code,
    '**Estado actual:** shaping',
    '**URL:** https://hub.gobravo.io/tracker/tracks/' + item.id,
    '',
    '### Instrucciones',
    '',
    'Usa el modelo coder-sr para hacer un análisis técnico profundo. Este análisis define el plan completo de ejecución.',
    '',
    '1. **Obtén los detalles** del track usando `get_workitem` con el ID `' + item.id + '` incluyendo content, comments y activities.',
    '2. **Análisis técnico profundo**:',
    '   - Desglosa el track en tareas concretas (tasks hijas) que no excedan 2-3 días cada una.',
    '   - Para cada tarea define: nombre, descripción técnica, archivos/código a tocar, dependencias, riesgos y estrategia de mitigación.',
    '   - Identifica el orden óptimo de ejecución.',
    '   - Evalúa la complejidad total y estima esfuerzo.',
    '3. **Crea las tasks hijas** usando `create_workitem` con `type: \"task\"` y `parent_id: \"' + item.id + '\"`. Para cada una:',
    '   - Nombre descriptivo en español.',
    '   - `content` con el detalle técnico.',
    '   - `due_date` estimada (deadline del track + el offset proporcional).',
    '   - Owner asignado a ti (usa `my_profile` para obtener tu user_id).',
    '   - Status inicial `todo`.',
    '4. **Actualiza el track**:',
    '   - Pásalo a `todo` usando `update_status`.',
    '   - Asigna `due_date` al track (deadline del proyecto).',
    '   - Owner asignado a ti.',
    '5. **Agrega un comentario resumen** en el track con:',
    '   - Resumen del análisis y plan.',
    '   - Lista de tasks creadas con sus IDs.',
    '   - Orden propuesto de ejecución.',
    '',
    'Este análisis es la base del plan. Sin él no se puede ejecutar.',
  ].join('\n'), rules, refs)
}

function buildTodoPrompt(item, rules, refs) {
  return appendRules([
    '## 🚀 Ejecutar track: ' + item.code,
    '',
    '**Track:** ' + item.name,
    '**Código:** ' + item.code,
    '**Estado actual:** todo',
    '**URL:** https://hub.gobravo.io/tracker/tracks/' + item.id,
    '',
    '### Instrucciones',
    '',
    'Eres un orquestador de ejecución. El track ya tiene tasks hijas definidas. Tu trabajo es ejecutarlas.',
    '',
    '1. **Obtén los detalles** del track usando `get_workitem` con el ID `' + item.id + '` incluyendo children, content y comments.',
    '2. **Identifica las tasks hijas** y analiza dependencias entre ellas.',
    '3. **Antes de empezar, prepara el entorno**:',
    '   - Cambia a la rama `main` y haz `git pull` para tener la versión más actual.',
    '   - Crea la rama del track desde `main`: `feat/' + item.code.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '`.',
    '4. **Pasa todas las tasks hijas y el track padre** a `in_progress` usando `update_status`.',
    '5. **Orquesta la ejecución**:',
    '   - Tú decides el orden: si las tareas son independientes, ejecuta en paralelo con `delegate_task`.',
    '   - Si hay dependencias, ejecuta en orden secuencial.',
    '   - Decide cuántos subagentes lanzar según complejidad.',
    '6. **Cada subagente** recibe: código de la task, descripción, rama y repositorio. Debe hacer un commit por tarea con mensaje en español descriptivo (ej: "Se agregó validación de email al formulario de registro").',
    '7. **Al terminar y probar todo**:',
    '   - Haz push de la rama.',
    '   - Crea un Pull Request usando el template de `.github/PULL_REQUEST_TEMPLATE.md` del proyecto (checklist, contexto, changelog y criterios de aceptación).',
    '   - Pasa el track padre a `in_review`.',
    '   - Agrega un comentario con el resumen de lo ejecutado, los commits y la URL del PR.',
    '',
    'Usa `delegate_task` para los subagentes — cada uno trabaja en su tarea de forma aislada.',
  ].join('\n'), rules, refs)
}

// ── ModelConfigView ──────────────────────────────────────────────────

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
    var comments = await fetchUnresolvedThreads(githubToken, pr)
    setUserComments(comments || [])
  }

  function analyzeWith(modelSlug, commentsArr) {
    haptic('tap')
    setAnalyzing(modelSlug)
    try {
      if (host.state.model && host.state.model.set) {
        try { host.state.model.set(modelSlug) } catch {}
      }
      var sid = host.state.activeSessionId.get()
      if (!sid) {
        host.notifyError('❌ No hay sesión activa. Abre o crea un chat primero.')
        return
      }
      var prNum = commentsDetail && commentsDetail.pr ? commentsDetail.pr.number : '?'
      var h = 'Analiza estos comentarios de code review en el PR #' + prNum + ':\n\n'
      for (var i = 0; i < commentsArr.length; i++) {
        var c = commentsArr[i]
        h += '--- Comentario ' + (i + 1) + ' ---\n'
        if (c.path) h += 'Archivo: ' + c.path + '\n'
        h += 'Autor: ' + (c.author || '?') + '\n'
        h += 'Comentario: ' + c.body + '\n\n'
      }
      h += '\nResume los hallazgos principales y sugiere acciones concretas.'
      host.request('prompt.submit', { session_id: sid, text: h })
      host.notify('🔍 Análisis enviado al chat activo')
    } catch (err) {
      host.notifyError('Error: ' + err.message)
    } finally {
      setAnalyzing(null)
    }
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

  function reviewPR(pr) {
    haptic('tap')
    var sid = host.state.activeSessionId.get()
    if (!sid) {
      host.notifyError('❌ No hay sesión activa. Abre o crea un chat primero.')
      return
    }

    setReviewingId(pr.id)
    try {
      host.request('prompt.submit', {
        session_id: sid,
        text: 'Revisa este PR de código: ' + pr.html_url + '\n\nAnaliza los cambios, identifica problemas de código, y publica comentarios inline en el PR.',
      })
      host.notify('🔍 Revisión enviada — el asistente procesará el PR')
    } catch (err) {
      host.notifyError('Error al enviar revisión: ' + err.message)
    } finally {
      setReviewingId(null)
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
        style: { padding: '0 0 8px 0', borderBottom: '1px solid #21262d', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#161616' },
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

function CreateForm({ token, onClose, onCreated }) {
  var _a = useState('track')
  var type = _a[0]
  var setType = _a[1]

  var _b = useState('')
  var name = _b[0]
  var setName = _b[1]

  var _c = useState('')
  var squadId = _c[0]
  var setSquadId = _c[1]

  var _d = useState(null)
  var squads = _d[0]
  var setSquads = _d[1]

  var _e = useState('medium')
  var priority = _e[0]
  var setPriority = _e[1]

  var _f = useState('new_feature')
  var trackType = _f[0]
  var setTrackType = _f[1]

  var _g = useState('')
  var dueDate = _g[0]
  var setDueDate = _g[1]

  var _h = useState('')
  var description = _h[0]
  var setDescription = _h[1]

  var _i = useState(false)
  var submitting = _i[0]
  var setSubmitting = _i[1]

  useEffect(function () {
    if (!token) return
    fetchSquads(token).then(function (data) {
      var list = (data && data.squads) || []
      if (Array.isArray(list)) setSquads(list)
    }).catch(function () {})
  }, [token])

  var handleSubmit = function () {
    if (!name.trim()) {
      host.notifyError('❌ El nombre es obligatorio')
      return
    }
    setSubmitting(true)
    try {
      var args = {
        type: type,
        name: name.trim(),
      }
      if (squadId) args.squad_id = squadId
      args.metadata = { priority: priority }
      if (type === 'track') {
        args.metadata.track_type = trackType
      }
      if (dueDate.trim()) args.due_date = dueDate.trim()
      if (description.trim()) args.content = description.trim()

      mcpCall(token, 'tracker', 'create_workitem', args)
        .then(function () {
          host.notify('✅ ' + type + ' creado: ' + name.trim())
          onCreated()
        })
        .catch(function (err) {
          host.notifyError('Error al crear: ' + err.message)
        })
        .finally(function () { setSubmitting(false) })
    } catch (err) {
      host.notifyError('Error al crear: ' + err.message)
      setSubmitting(false)
    }
  }

  function inputStyle() {
    return {
      backgroundColor: '#111',
      color: '#ddd',
      border: '1px solid #333',
      borderRadius: 4,
      padding: '6px 10px',
      fontSize: 12,
      outline: 'none',
      width: '100%',
      boxSizing: 'border-box',
    }
  }

  function labelStyle() {
    return { fontSize: 11, color: '#888', fontWeight: 600 }
  }

  function selectStyle() {
    return Object.assign({}, inputStyle(), { cursor: 'pointer' })
  }

  return jsxs('div', {
    style: { padding: 14 },
    children: [
      jsx('div', {
        style: { fontSize: 13, color: '#ddd', fontWeight: 600, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
        children: [
          jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_SPARKLES, className: 'size-3.5 shrink-0' }), ' Nuevo work item'] }),
          jsx('button', {
            onClick: onClose,
            style: { background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, padding: 0 },
            children: jsx(Icon, { path: ICON_X_MARK, className: 'size-3.5 shrink-0' }),
          }),
        ],
      }),
      jsxs('div', {
        style: { display: 'flex', flexDirection: 'column', gap: 10 },
        children: [
          // Type selector
          jsxs('div', {
            children: [
              jsx('div', { style: labelStyle(), children: 'Tipo' }),
              jsxs('div', {
                style: { display: 'flex', gap: 8, marginTop: 4 },
                children: [
                  jsx('button', {
                    onClick: function () { setType('track') },
                    style: {
                      flex: 1,
                      padding: '4px 0',
                      borderRadius: 4,
                      border: '1px solid ' + (type === 'track' ? '#3fb950' : '#333'),
                      backgroundColor: type === 'track' ? '#1a3a1a' : 'transparent',
                      color: type === 'track' ? '#3fb950' : '#888',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 600,
                    },
                    children: '🎯 Track',
                  }),
                  jsx('button', {
                    onClick: function () { setType('task') },
                    style: {
                      flex: 1,
                      padding: '4px 0',
                      borderRadius: 4,
                      border: '1px solid ' + (type === 'task' ? '#58a6ff' : '#333'),
                      backgroundColor: type === 'task' ? '#1a2a3a' : 'transparent',
                      color: type === 'task' ? '#58a6ff' : '#888',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 600,
                    },
                    children: '📋 Task',
                  }),
                ],
              }),
            ],
          }),
          // Name
          jsxs('div', {
            children: [
              jsx('div', { style: labelStyle(), children: 'Nombre *' }),
              jsx('input', {
                value: name,
                onChange: function (e) { setName(e.target.value) },
                placeholder: 'feat: título descriptivo',
                style: Object.assign({}, inputStyle(), { marginTop: 4 }),
                onKeyDown: function (e) { if (e.key === 'Enter' && !submitting) handleSubmit() },
                disabled: submitting,
              }),
            ],
          }),
          // Squad
          jsxs('div', {
            children: [
              jsx('div', { style: labelStyle(), children: 'Squad' }),
              jsx('select', {
                value: squadId,
                onChange: function (e) { setSquadId(e.target.value) },
                style: Object.assign({}, selectStyle(), { marginTop: 4 }),
                disabled: submitting,
                children: [
                  jsx('option', { value: '', children: '— Sin squad —' }),
                  squads && squads.map(function (s) {
                    return jsx('option', { value: s.id, children: s.name + (s.member_count ? ' (' + s.member_count + ')' : '') }, s.id)
                  }),
                ],
              }),
            ],
          }),
          // Priority
          jsxs('div', {
            children: [
              jsx('div', { style: labelStyle(), children: 'Prioridad' }),
              jsx('select', {
                value: priority,
                onChange: function (e) { setPriority(e.target.value) },
                style: Object.assign({}, selectStyle(), { marginTop: 4 }),
                disabled: submitting,
                children: [
                  jsx('option', { value: 'low', children: '🟢 Baja' }),
                  jsx('option', { value: 'medium', children: '🟡 Media' }),
                  jsx('option', { value: 'high', children: '🔴 Alta' }),
                ],
              }),
            ],
          }),
          // Track type (only for tracks)
          type === 'track' && jsxs('div', {
            children: [
              jsx('div', { style: labelStyle(), children: 'Tipo de track' }),
              jsx('select', {
                value: trackType,
                onChange: function (e) { setTrackType(e.target.value) },
                style: Object.assign({}, selectStyle(), { marginTop: 4 }),
                disabled: submitting,
                children: [
                  jsx('option', { value: 'new_feature', children: '🚀 Nueva funcionalidad' }),
                  jsx('option', { value: 'enhancement', children: '✨ Mejora' }),
                  jsx('option', { value: 'bug', children: '🐛 Bug' }),
                  jsx('option', { value: 'chore', children: '🧹 Chore' }),
                  jsx('option', { value: 'hotfix', children: '🔥 Hotfix' }),
                ],
              }),
            ],
          }),
          // Due date
          jsxs('div', {
            children: [
              jsx('div', { style: labelStyle(), children: 'Fecha límite' }),
              jsx('input', {
                value: dueDate,
                onChange: function (e) { setDueDate(e.target.value) },
                placeholder: 'YYYY-MM-DD (opcional)',
                style: Object.assign({}, inputStyle(), { marginTop: 4 }),
                disabled: submitting,
              }),
            ],
          }),
          // Description
          jsxs('div', {
            children: [
              jsx('div', { style: labelStyle(), children: 'Descripción' }),
              jsx('textarea', {
                value: description,
                onChange: function (e) { setDescription(e.target.value) },
                placeholder: 'Descripción opcional...',
                rows: 3,
                style: Object.assign({}, inputStyle(), { marginTop: 4, resize: 'vertical', fontFamily: 'inherit' }),
                disabled: submitting,
              }),
            ],
          }),
          // Submit
          jsxs('div', {
            style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 },
            children: [
              jsx('button', {
                onClick: onClose,
                style: {
                  backgroundColor: 'transparent',
                  color: '#888',
                  border: '1px solid #333',
                  borderRadius: 4,
                  padding: '6px 14px',
                  cursor: 'pointer',
                  fontSize: 12,
                },
                children: 'Cancelar',
              }),
              jsx('button', {
                onClick: handleSubmit,
                disabled: submitting || !name.trim(),
                style: {
                  backgroundColor: submitting ? '#166' : '#238636',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  padding: '6px 14px',
                  cursor: submitting ? 'default' : 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  opacity: submitting ? 0.6 : 1,
                },
                children: submitting ? '⏳ Creando...' : jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_SPARKLES, className: 'size-3.5 shrink-0' }), ' Crear'] }),
              }),
            ],
          }),
        ],
      }),
    ],
  })
}

// ── Markdown to HTML ────────────────────────────────────────────────

function loadSelectedSquads() {
  try {
    var raw = loadStr(STORAGE_TICKETS_SQUADS)
    if (raw) {
      var parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {}
  return [
    'd2c8c81b-826f-44cf-adcc-fc56e2170893',
    'b261b0b3-d79e-447f-ab0f-9b40ad10c61e',
    '2f5a632d-b6bb-4dbb-ad30-f631c4e07a01',
    '8e41c8ce-6024-4a15-925f-a521245a2f39',
  ]
}

function saveSelectedSquads(ids) {
  saveStr(STORAGE_TICKETS_SQUADS, JSON.stringify(ids))
}

// ── SquadPickerView ─────────────────────────────────────────────────

function SquadPickerView({ token, selected, onSave, onClose, embedded }) {
  var _a = useState(null)
  var squads = _a[0]
  var setSquads = _a[1]
  var _b = useState(false)
  var loading = _b[0]
  var setLoading = _b[1]
  var _c = useState(null)
  var error = _c[0]
  var setError = _c[1]
  var _d = useState({})
  var checked = _d[0]
  var setChecked = _d[1]

  useEffect(function () {
    var init = {}
    for (var si = 0; si < selected.length; si++) {
      init[selected[si]] = true
    }
    setChecked(init)
  }, [])

  useEffect(function () {
    if (!token) return
    setLoading(true)
    mcpCall(token, 'teams', 'squads_list', {})
      .then(function (data) {
        var list = data && data.squads || []
        list.sort(function (a, b) { return a.name.localeCompare(b.name) })
        setSquads(list)
      })
      .catch(function (err) { setError(err.message) })
      .finally(function () { setLoading(false) })
  }, [token])

  function toggle(id) {
    setChecked(function (prev) {
      var next = Object.assign({}, prev)
      next[id] = !next[id]
      return next
    })
  }

  function selectAll() {
    if (!squads) return
    var all = {}
    for (var si = 0; si < squads.length; si++) {
      all[squads[si].id] = true
    }
    setChecked(all)
  }

  function deselectAll() {
    setChecked({})
  }

  function handleSave() {
    var ids = []
    var keys = Object.keys(checked)
    for (var ki = 0; ki < keys.length; ki++) {
      if (checked[keys[ki]]) ids.push(keys[ki])
    }
    saveSelectedSquads(ids)
    onSave(ids)
  }

  var selectedCount = 0
  var cKeys = Object.keys(checked)
  for (var cki = 0; cki < cKeys.length; cki++) {
    if (checked[cKeys[cki]]) selectedCount++
  }

  var squadPickerStyles = {
    backgroundColor: '#161616',
    border: '1px solid #333',
    borderRadius: '8px',
    overflowY: 'auto',
    maxHeight: 'calc(100vh - 60px)',
  }

  return jsxs('div', {
    style: squadPickerStyles,
    children: [
      // Header
      jsx('div', {
        style: { padding: '8px 12px', borderBottom: '1px solid #333', fontSize: 11, color: '#888', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
        children: [
          jsx('span', { style: { fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_COG_8_TOOTH, className: 'size-3.5 shrink-0' }), ' Equipos para búsqueda'] }),
          !embedded && jsx('button', {
            onClick: onClose,
            style: { background: 'none', border: 'none', color: '#58a6ff', cursor: 'pointer', fontSize: 11, padding: 0 },
            children: jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_ARROW_LEFT, className: 'size-3 shrink-0' }), ' Volver'] }),
          }),
        ],
      }),

      loading && jsx('div', { style: { padding: 20, textAlign: 'center', fontSize: 12, color: '#888' }, children: '⏳ Cargando equipos...' }),

      error && jsx('div', { style: { padding: 14, fontSize: 12, color: '#ef4444' }, children: '❌ Error: ' + error }),

      squads && jsxs('div', {
        children: [
          // Count + actions
          jsxs('div', {
            style: { padding: '6px 12px', fontSize: 11, color: '#888', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #222', backgroundColor: '#141414' },
            children: [
              jsx('span', { children: selectedCount + ' de ' + squads.length + ' equipos seleccionados' }),
              jsxs('div', { style: { display: 'flex', gap: 6 }, children: [
                jsx('button', {
                  onClick: selectAll,
                  style: { background: 'none', border: '1px solid #444', color: '#58a6ff', borderRadius: 3, padding: '2px 6px', cursor: 'pointer', fontSize: 10 },
                  children: 'Todo',
                }),
                jsx('button', {
                  onClick: deselectAll,
                  style: { background: 'none', border: '1px solid #444', color: '#888', borderRadius: 3, padding: '2px 6px', cursor: 'pointer', fontSize: 10 },
                  children: 'Ninguno',
                }),
              ]}),
            ],
          }),

          // Scrollable list
          jsx('div', {
            style: { maxHeight: 280, overflowY: 'auto' },
            children: squads.map(function (squad) {
              return jsx('div', {
                style: {
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
                  cursor: 'pointer', borderBottom: '1px solid #1a1a1a',
                },
                onClick: function () { toggle(squad.id) },
                onMouseEnter: function (e) { e.currentTarget.style.backgroundColor = '#2a2a2a' },
                onMouseLeave: function (e) { e.currentTarget.style.backgroundColor = 'transparent' },
                children: [
                  jsx('input', {
                    type: 'checkbox',
                    checked: !!checked[squad.id],
                    onChange: function () { toggle(squad.id) },
                    style: { accentColor: '#58a6ff', cursor: 'pointer' },
                  }),
                  jsxs('div', { style: { flex: 1, minWidth: 0 }, children: [
                    jsx('div', { style: { fontSize: 12, color: '#ccc' }, children: squad.name }),
                    jsx('div', { style: { fontSize: 10, color: '#888' }, children: (squad.member_count || 0) + ' miembros' }),
                  ]}),
                ],
              }, squad.id)
            }),
          }),

          // Save button
          jsx('div', {
            style: { padding: '8px 12px', borderTop: '1px solid #333' },
            children: jsx('button', {
              onClick: handleSave,
              style: { backgroundColor: '#238636', color: 'white', border: 'none', borderRadius: 4, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600, width: '100%' },
              children: jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'center' }, children: [jsx(Icon, { path: ICON_CHECK, className: 'size-3.5 shrink-0' }), ' Guardar (' + selectedCount + ' equipos)'] }),
            }),
          }),
        ],
      }),
    ],
  })
}

// ── CommentsModal ──────────────────────────────────────────────────

function TicketsTab({ hubToken }) {
  var _a = useState('search')
  var view = _a[0]
  var setView = _a[1]

  var _b = useState('')
  var query = _b[0]
  var setQuery = _b[1]

  var _c = useState(null)  // null = loading, [] = loaded empty
  var allTasks = _c[0]
  var setAllTasks = _c[1]

  var _d = useState(true)
  var loading = _d[0]
  var setLoading = _d[1]

  var _e = useState(null)
  var error = _e[0]
  var setError = _e[1]

  var _f = useState(null)
  var selectedId = _f[0]
  var setSelectedId = _f[1]

  var _g = useState(null)
  var detail = _g[0]
  var setDetail = _g[1]

  var _h = useState([])
  var comments = _h[0]
  var setComments = _h[1]

  var _i = useState(false)
  var detailLoading = _i[0]
  var setDetailLoading = _i[1]

  var inputRef = useRef(null)

  var _j = useState(function () { return loadSelectedSquads() })
  var squadIds = _j[0]
  var setSquadIds = _j[1]

  var _k = useState(null)  // ticket abierto en el modal de comentarios
  var commentsTicket = _k[0]
  var setCommentsTicket = _k[1]

  var _l = useState({})  // Set-like: { id: true } para items con comentarios
  var hasComments = _l[0]
  var setHasComments = _l[1]

  // Estado del diagnóstico IA
  var _m = useState('idle')  // idle | analyzing | done | error
  var aiState = _m[0]
  var setAiState = _m[1]
  var _n = useState(null)  // texto del diagnóstico (markdown)
  var dxResult = _n[0]
  var setDxResult = _n[1]

  function runDiagnosis() {
    var items = (lowerQuery ? filteredTasks : baseTasks)
    if (!items || items.length === 0) {
      host.notifyError('❌ No hay tickets para diagnosticar en la selección actual')
      return
    }
    setAiState('analyzing')
    setDxResult(null)
    // Arma el input con los tickets visibles (límite 60 para no inflar el contexto)
    var top = items.slice(0, 60)
    var lines = top.map(function (item) {
      var parts = [
        '- [' + (item.code || item.id) + '] ' + (item.name || '(sin nombre)'),
        'tipo=' + (item.type || '?'),
      ]
      if (item.metadata && item.metadata.track_type) parts.push('track_type=' + item.metadata.track_type)
      parts.push('estado=' + (item.status || '?'))
      if (item.metadata && item.metadata.priority) parts.push('prioridad=' + item.metadata.priority)
      if (item.owner_email || (item.owner && item.owner.name)) parts.push('owner=' + (item.owner && item.owner.name ? item.owner.name : item.owner_email))
      if (item.due_date) parts.push('due=' + item.due_date)
      if (item.squads && item.squads.length) parts.push('squad=' + item.squads.map(function (s) { return s.name }).join(','))
      return parts.join(' · ')
    }).join('\n')
    // Prompt editable desde Config (STORAGE_AI_PROMPT) con {N} sustituido
    var rawPrompt = loadStr(STORAGE_AI_PROMPT) || AI_PROMPT_DEFAULT
    var instructions = rawPrompt
      .split('{N}').join(String(top.length))
    var input = top.length + ' tickets:\n' + lines
    // Usa la task auxiliar 'analysis_tickets' (provider/modelo desde Config)
    host.request('llm.oneshot', {
      session_id: host.state.activeSessionId ? host.state.activeSessionId.get() : null,
      task: 'analysis_tickets',
      instructions: instructions,
      input: input,
      max_tokens: 1600,
      timeout: 180,
    })
      .then(function (res) {
        var err = res && res.error
        if (err) throw new Error(typeof err === 'string' ? err : JSON.stringify(err))
        var text = res && (res.result && res.result.text || res.text) || ''
        if (!text) {
          setAiState('error')
          host.logs('warn', 'gobravo-workflow', 'diagnosis', 'análisis IA devolvió vacío')
          host.notifyError('❌ El diagnóstico llegó vacío (revisa el modelo configurado)')
          return
        }
        setDxResult(text)
        setAiState('done')
        host.notify('✅ Diagnóstico generado (' + top.length + ' tickets)')
      })
      .catch(function (err) {
        setAiState('error')
        var msg = (err && (err.message || err)) || 'desconocido'
        host.logs('warn', 'gobravo-workflow', 'diagnosis', 'error: ' + String(msg).slice(0, 300))
        host.notifyError('❌ Análisis IA: ' + String(msg).slice(0, 200))
      })
  }

  function closeDiagnosis() {
    setDxResult(null)
    setAiState('idle')
  }

  function checkCommentsBatch(items) {
    if (!items || !items.length) return
    var chunk = items.slice(0, 50)
    Promise.allSettled(chunk.map(function (item) {
      return mcpCall(hubToken, 'tracker', 'list_comments', { work_item_id: item.id })
        .then(function (data) {
          var list = (data && data.comments) || []
          if (list.length > 0) return item.id
          return null
        })
        .catch(function () { return null })
    })).then(function (results) {
      var next = {}
      for (var ri = 0; ri < results.length; ri++) {
        var id = results[ri].value
        if (id) next[id] = true
      }
      setHasComments(next)
    })
  }

  // Load all tasks from selected squads
  useEffect(function () {
    if (!hubToken || !squadIds.length) {
      setAllTasks([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    setSelectedId(null)
    setDetail(null)
    ;(async function () {
      var allFound = []
      for (var si = 0; si < squadIds.length; si++) {
        try {
          var data = await mcpCall(hubToken, 'tracker', 'list_workitems', {
            type: 'task',
            limit: 200,
            squad_id: squadIds[si],
          })
          var items = data && data.items || []
          for (var ii = 0; ii < items.length; ii++) {
            if (!allFound.some(function (f) { return f.id === items[ii].id })) {
              allFound.push(items[ii])
            }
          }
        } catch {}
      }
      // Ordenar por fecha de creación ascendente (más vieja primero)
      allFound.sort(function (a, b) {
        var da = a.created_at ? new Date(a.created_at).getTime() : 0
        var db = b.created_at ? new Date(b.created_at).getTime() : 0
        return da - db
      })
      setAllTasks(allFound)
      setLoading(false)
      checkCommentsBatch(allFound)
    })()
  }, [hubToken, squadIds])

  // Filter locally as user types (solo flujo activo, sin terminados)
  var activeStatuses = ['backlog', 'shaping', 'todo', 'in_progress', 'in_review', 'staging', 'problem_discovery', 'problem_validation']
  var lowerQuery = query.trim().toLowerCase()
  var baseTasks = allTasks
    ? allTasks.filter(function (item) { return activeStatuses.indexOf(item.status) >= 0 })
    : []
  var filteredTasks = lowerQuery
    ? baseTasks.filter(function (item) {
        var name = (item.name || '').toLowerCase()
        var code = (item.code || '').toLowerCase()
        return name.indexOf(lowerQuery) >= 0 || code.indexOf(lowerQuery) >= 0
      })
    : baseTasks

  var openDetail = useCallback(function (id) {
    setSelectedId(id)
    setDetailLoading(true)
    setDetail(null)
    setComments([])
    Promise.all([
      getDetail(hubToken, id),
      fetchComments(hubToken, id).catch(function () { return { comments: [] } }),
    ])
      .then(function (results) {
        setDetail(results[0])
        setComments(results[1] && results[1].comments || [])
      })
      .catch(function (err) {
        setDetail({ error: err.message })
      })
      .finally(function () { setDetailLoading(false) })
  }, [hubToken])

  // ── View: Search ──
  return jsxs('div', {
    children: [
      // Header (sticky)
      jsx('div', {
        style: { padding: '8px 12px', borderBottom: '1px solid #333', fontSize: 11, color: '#888', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#161616' },
        children: [
          jsx('span', { style: { fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_TICKET, className: 'size-3.5 shrink-0' }), ' Tasks asignadas'] }),
          // Badge IA (botón de diagnóstico)
          jsx('button', {
            onClick: runDiagnosis,
            disabled: aiState === 'analyzing',
            title: 'Analizar los tickets visibles y publicar el diagnóstico en el chat',
            style: {
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: 'transparent', border: '1px solid #333', color: '#8b949e',
              borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 500,
              cursor: aiState === 'analyzing' ? 'default' : 'pointer',
              opacity: aiState === 'analyzing' ? 0.6 : 1,
              transition: 'all .15s',
            },
            onMouseEnter: function (e) {
              if (aiState !== 'analyzing') { e.currentTarget.style.color = '#c9d1d9'; e.currentTarget.style.borderColor = '#8b949e' }
            },
            onMouseLeave: function (e) {
              if (aiState !== 'analyzing') { e.currentTarget.style.color = '#8b949e'; e.currentTarget.style.borderColor = '#333' }
            },
            children: jsx('span', {
              style: { display: 'inline-flex', alignItems: 'center', gap: 4 },
              children: [
                jsx(Icon, { path: ICON_SPARKLES, className: 'size-3 shrink-0' }),
                aiState === 'analyzing' ? 'Analizando…' : (aiState === 'done' ? 'Listo' : (aiState === 'error' ? 'Error' : 'IA')),
              ],
            }),
          }),
        ],
      }),

      // Search bar
      jsx('div', {
        style: { padding: '8px 12px', borderBottom: '1px solid #222' },
        children: jsx('input', {
          ref: inputRef,
          type: 'text',
          placeholder: 'Filtrar por nombre o código...',
          value: query,
          onChange: function (e) {
            setQuery(e.target.value)
            setSelectedId(null)
            setDetail(null)
            // si hay diagnóstico abierto, al filtrar lo cerramos
            setDxResult(null); setAiState('idle')
          },
          style: {
            width: '100%', boxSizing: 'border-box', backgroundColor: '#111', color: '#ddd',
            border: '1px solid #333', borderRadius: 4, padding: '7px 10px', fontSize: 12, outline: 'none',
          },
        }),
      }),

      // Panel de diagnóstico IA (reemplaza los resultados mientras está activo)
      (aiState === 'analyzing' || aiState === 'done' || aiState === 'error') &&
        jsxs('div', {
          style: { borderBottom: '1px solid #222', backgroundColor: '#141414' },
          children: [
            // Barra de título del panel
            jsx('div', {
              style: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid #222' },
              children: [
                jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600, fontSize: 12, color: '#ddd' }, children: [jsx(Icon, { path: ICON_SPARKLES, className: 'size-3.5 shrink-0' }), ' Diagnóstico IA'] }),
                aiState === 'analyzing' && jsx('span', { style: { fontSize: 11, color: '#888' }, children: 'generando…' }),
                aiState === 'error' && jsx('span', { style: { fontSize: 11, color: '#ef4444' }, children: 'error' }),
                jsx('button', {
                  onClick: closeDiagnosis,
                  title: 'Cerrar diagnóstico',
                  style: { marginLeft: 'auto', background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 13, padding: 0 },
                  children: jsx(Icon, { path: ICON_X_MARK, className: 'size-3.5 shrink-0' }),
                }),
              ],
            }),
            // Cuerpo del panel
            aiState === 'analyzing' &&
              jsx('div', { style: { padding: 18, textAlign: 'center', fontSize: 12, color: '#888' }, children: '⏳ Analizando tickets…' }),
            aiState === 'error' &&
              jsx('div', { style: { padding: 14, fontSize: 12, color: '#ef4444' }, children: '❌ No se pudo generar el diagnóstico. Intenta de nuevo.' }),
            aiState === 'done' && dxResult &&
              jsx('div', {
                style: { padding: '10px 12px', fontSize: 12, color: '#ccc', lineHeight: 1.7, wordBreak: 'break-word', maxHeight: 320, overflowY: 'auto' },
                dangerouslySetInnerHTML: { __html: mdToHtml(dxResult) },
              }),
          ],
        }),

      // Loading
      loading &&
        jsx('div', { style: { padding: 20, textAlign: 'center', fontSize: 12, color: '#888' }, children: '⏳ Cargando tickets de los equipos seleccionados...' }),

      // Error
      error &&
        jsx('div', { style: { padding: 14, fontSize: 12, color: '#ef4444' }, children: '❌ Error: ' + error }),

      // Loaded but empty
      !loading && allTasks && allTasks.length === 0 &&
        jsx('div', {
          style: { padding: 14, fontSize: 12, color: '#888', textAlign: 'center', lineHeight: 1.5 },
          children: jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'center' }, children: [jsx(Icon, { path: ICON_INBOX, className: 'size-3.5 shrink-0' }), ' No hay tickets en los equipos seleccionados.'] }),
        }),

      // No filter match
      !loading && allTasks && allTasks.length > 0 && lowerQuery && filteredTasks.length === 0 &&
        jsx('div', {
          style: { padding: 14, fontSize: 12, color: '#888', textAlign: 'center', lineHeight: 1.5 },
          children: jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'center' }, children: [jsx(Icon, { path: ICON_MAGNIFYING_GLASS, className: 'size-3.5 shrink-0' }), ' No hay tickets con "' + query + '"'] }),
        }),

      // Results list
      !loading && allTasks && allTasks.length > 0 && !selectedId &&
        jsxs('div', {
          children: [
            jsx('div', {
              style: { padding: '6px 12px', fontSize: 11, color: '#888', fontWeight: 600, borderBottom: '1px solid #222', backgroundColor: '#141414' },
              children: jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_CLIPBOARD_DOCUMENT_LIST, className: 'size-3 shrink-0' }), ' ' + (lowerQuery ? filteredTasks.length + ' de ' + baseTasks.length : baseTasks.length) + ' tareas'] }),
            }),
            jsx('div', {
              style: { maxHeight: 300, overflowY: 'auto' },
              children: (lowerQuery ? filteredTasks : baseTasks).map(function (item) {
                return jsx('div', {
                  style: {
                    display: 'flex', alignItems: 'center', borderBottom: '1px solid #1a1a1a',
                    cursor: 'pointer',
                  },
                  onClick: function () { openDetail(item.id) },
                  onMouseEnter: function (e) { e.currentTarget.style.backgroundColor = '#2a2a2a' },
                  onMouseLeave: function (e) { e.currentTarget.style.backgroundColor = 'transparent' },
                  children: [
                    jsx('div', {
                      style: { flex: 1, padding: '8px 12px', minWidth: 0 },
                      children: jsxs('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 8 },
                        children: [
                          jsxs('div', { style: { flex: 1, minWidth: 0 },
                            children: [
                              jsx('div', { style: { fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, children: item.name }),
                              jsxs('div', { style: { fontSize: 11, color: '#888', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center' },
                                children: [
                                  jsx('span', { style: { color: '#58a6ff' }, children: item.code || '' }),
                                  item.created_at && jsx('span', { style: { color: '#6e7681', fontSize: 10 }, children: '· ⤴ ' + timeAgo(item.created_at) }),
                                  hasComments[item.id] && jsx('span', {
                                    onClick: function (e) { e.stopPropagation(); setCommentsTicket(item) },
                                    title: 'Ver comentarios',
                                    style: { color: '#888', cursor: 'pointer', fontSize: 13, lineHeight: '12px' },
                                    children: jsx(Icon, { path: ICON_CHAT_BUBBLE_LEFT, className: 'size-3.5 shrink-0' }),
                                  }),
                                ],
                              }),
                            ],
                          }),
                          statusPillEl(item.status),
                        ],
                      }),
                    }),
                  ],
                }, item.id)
              }),
            }),
          ],
        }),

      // Detail view
      selectedId &&
        jsxs('div', {
          children: [
            // Back button
            jsx('div', {
              style: { padding: '6px 12px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: 6 },
              children: jsx('button', {
                onClick: function () { setSelectedId(null); setDetail(null); setComments([]) },
                style: { background: 'none', border: 'none', color: '#58a6ff', cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: 0 },
                children: jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_ARROW_LEFT, className: 'size-3 shrink-0' }), ' Volver a resultados'] }),
              }),
            }),

            detailLoading &&
              jsx('div', { style: { padding: 20, textAlign: 'center', fontSize: 12, color: '#888' }, children: '⏳ Cargando detalle...' }),

            detail && detail.error &&
              jsx('div', { style: { padding: 14, fontSize: 12, color: '#ef4444' }, children: '❌ ' + detail.error }),

            detail && !detail.error &&
              jsxs('div', { style: { padding: 12 },
                children: [
                  // Header
                  jsxs('div', {
                    style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
                    children: [
                      jsx('span', { style: { display: 'inline-flex' }, children: jsx(Icon, { path: typeIcon(detail.type), className: 'size-5 shrink-0' }) }),
                      jsx('span', { style: { color: '#58a6ff', fontSize: 13, fontWeight: 600 }, children: detail.code || detail.id }),
                    ],
                  }),

                  // Name + copy button
                  jsxs('div', {
                    style: { fontSize: 14, fontWeight: 600, color: '#ddd', marginBottom: 8, lineHeight: 1.3, display: 'flex', gap: 8, alignItems: 'flex-start' },
                    children: [
                      jsx('span', { style: { flex: 1 }, children: detail.name }),
                      jsx('button', {
                        onClick: function () {
                          var text = [
                            (detail.code || detail.id) + ' — ' + detail.name,
                            'Estado: ' + statusLabel(detail.status),
                            detail.owner ? 'Owner: ' + (detail.owner.name || detail.owner.email) : null,
                            '',
                            detail.content || '',
                            '',
                            '↗ https://hub.gobravo.io/tracker/tasks/' + detail.id,
                          ].filter(Boolean).join('\n')
                          navigator.clipboard.writeText(text)
                            .then(function () { host.notify('✅ Copiado para compartir') })
                            .catch(function () { host.notifyError('❌ No se pudo copiar') })
                        },
                        style: { background: 'none', border: '1px solid #444', color: '#888', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 },
                        children: jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_CLIPBOARD_DOCUMENT_LIST, className: 'size-3 shrink-0' }), ' Copiar'] }),
                      }),
                    ],
                  }),

                  // Status
                  jsx('div', { style: { marginBottom: 8 },
                    children: statusBadgeEl(detail.status),
                  }),

                  // Description (Markdown)
                  detail.content &&
                    jsxs('div', { style: { marginBottom: 8 },
                      children: [
                        jsx('div', { style: { fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_DOCUMENT_TEXT, className: 'size-3 shrink-0' }), ' Descripción'] }),
                        jsx('div', {
                          style: { fontSize: 12, color: '#ccc', lineHeight: 1.7, wordBreak: 'break-word', backgroundColor: '#141414', padding: '10px 12px', borderRadius: 4, border: '1px solid #222', maxHeight: 280, overflowY: 'auto' },
                          dangerouslySetInnerHTML: { __html: mdToHtml(detail.content) },
                        }),
                      ],
                    }),

                  !detail.content &&
                    jsx('div', { style: { fontSize: 11, color: '#666', fontStyle: 'italic', marginBottom: 8 }, children: 'Sin descripción' }),

                  // Comments
                  comments.length > 0 &&
                    jsxs('div', { style: { marginBottom: 8 },
                      children: [
                        jsx('div', { style: { fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_CHAT_BUBBLE_LEFT, className: 'size-3 shrink-0' }), ' Comentarios (' + comments.length + ')'] }),
                        jsx('div', {
                          style: { maxHeight: 240, overflowY: 'auto' },
                          children: comments.map(function (c) {
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
                        }),
                      ],
                    }),

                  comments.length === 0 && !detailLoading &&
                    jsx('div', { style: { fontSize: 11, color: '#555', fontStyle: 'italic', marginBottom: 8 }, children: 'Sin comentarios' }),

                  // Metadata
                  jsxs('div', {
                    style: { fontSize: 11, color: '#888', display: 'flex', gap: 10, flexWrap: 'wrap', borderTop: '1px solid #222', paddingTop: 8 },
                    children: [
                      detail.owner && jsxs('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_USER, className: 'size-3 shrink-0' }), detail.owner.name || detail.owner.email || '?'] }),
                      detail.due_date && jsx('span', { style: { color: new Date(detail.due_date) < new Date() ? '#ef4444' : '#888', display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_CALENDAR, className: 'size-3 shrink-0' }), ' ' + timeAgo(detail.due_date)] }),
                      detail.updated_at && jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_ARROW_PATH, className: 'size-3 shrink-0' }), ' ' + timeAgo(detail.updated_at)] }),
                    ],
                  }),

                  // Link
                  jsx('a', {
                    href: 'https://hub.gobravo.io/tracker/tasks/' + detail.id,
                    target: '_blank', rel: 'noopener noreferrer',
                    style: { display: 'block', marginTop: 10, textAlign: 'center', fontSize: 11, color: '#58a6ff', textDecoration: 'none', padding: '6px', borderRadius: 4, backgroundColor: '#0d1117', border: '1px solid #30363d' },
                    children: jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'center' }, children: [jsx(Icon, { path: ICON_ARROW_UP_RIGHT, className: 'size-3 shrink-0' }), ' Abrir en Hub — ' + (detail.code || detail.id)] }),
                  }),
                ],
              }),
          ],
        }),

      // Modal de comentarios
      commentsTicket && jsx(CommentsModal, {
        token: hubToken,
        ticket: commentsTicket,
        onClose: function () { setCommentsTicket(null) },
      }),
    ],
  })
}

// ── SetupView ──────────────────────────────────────────────────────

/**
 * teamStats.js — Capa de datos MCP del plugin Gobravo Workflow (funciones puras).
 *
 * Funciones puras de datos (sin UI, sin React) para:
 *  - Saber quién soy (user.id del token).
 *  - Detectar mi puesto/rol (area, sub_area del team donde estoy).
 *  - Encontrar los equipos/squads que tengo a cargo.
 *  - Obtener dashboards de stats por equipo/squad.
 *
 * Patrón de llamada MCP idéntico al de plugin.js:
 *   POST {HUB_BASE}/{server}/mcp  (JSON-RPC tools/call)
 *
 * Todas las funciones son fail-open: ante cualquier error devuelven
 * null / [] sin lanzar, para no romper el plugin que las consume.
 */

// HUB_BASE viene de constants.js (global del bundle).

/**
 * Llama a un tool MCP del servidor indicado y devuelve el payload JSON.
 * Renombrada (tsMcpCall) para no colisionar con mcpCall global de helpers.js
 * en el bundle concatenado.
 * @param {string} token Token Bearer de Hub.
 * @param {string} server 'tracker' | 'my-work' | 'stats' | 'teams'
 * @param {string} tool Nombre del tool a invocar.
 * @param {object} [args] Argumentos del tool.
 * @returns {Promise<any>} El JSON parseado de content[0].text.
 */
async function tsMcpCall(token, server, tool, args) {
  args = args || {}
  const res = await fetch(HUB_BASE + '/' + server + '/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
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

/** Primera palabra de un nombre (para matchear squads tipo "Nombre - Área"). */
function firstNameFrom(fullName) {
  if (!fullName) return ''
  const name = String(fullName)
  const i = name.indexOf(', ')
  const first = i >= 0 ? name.slice(0, i) : name
  return first.trim().split(/\s+/)[0] || ''
}

/**
 * Devuelve el id del usuario autenticado (o null en error).
 * @param {string} token
 * @returns {Promise<string|null>}
 */
async function fetchMyId(token) {
  try {
    const profile = await tsMcpCall(token, 'my-work', 'my_profile', {})
    const id = profile && profile.user && profile.user.id
    return id || null
  } catch (e) {
    return null
  }
}

/**
 * Devuelve el puesto (rol) del usuario autenticado.
 * Busca en teams_list el team donde el usuario es miembro (members[] con user_id = mi id)
 * y extrae {area, sub_area, teamName, teamId, leaderId, leaderEmail}.
 * Si no se encuentra membership pero el usuario es líder (leader_id = mi id) lo detecta igual.
 * @param {string} token
 * @returns {Promise<object|null>} {area, sub_area, teamName, teamId, leaderId, leaderEmail}
 */
async function fetchMyRole(token) {
  try {
    const myId = await fetchMyId(token)
    const teams = await tsMcpCall(token, 'teams', 'teams_list', {})
    const list = Array.isArray(teams) ? teams : (teams && (teams.teams || teams.data)) || []
    for (const team of list) {
      if (!team) continue
      // 1) Soy miembro: busco mi user_id en members[].
      const members = Array.isArray(team.members) ? team.members : []
      const mine = members.find((m) => m && (m.user_id === myId || m.id === myId))
      if (mine || team.leader_id === myId) {
        return {
          area: team.area || null,
          sub_area: mine && mine.sub_area ? mine.sub_area : team.sub_area || null,
          teamName: team.name || null,
          teamId: team.id != null ? team.id : null,
          leaderId: team.leader_id != null ? team.leader_id : null,
          leaderEmail: team.leader_email || null,
        }
      }
    }
    return null
  } catch (e) {
    return null
  }
}

/**
 * Devuelve los equipos/squads que el usuario tiene A CARGO.
 * Combina:
 *  - teams_list → teams donde soy líder (leader_id === mi id).
 *  - squads_list → squads cuyo nombre empieza con "<Mi primer nombre> - "
 *      confirmando en squads_get que soy miembro.
 * @param {string} token
 * @returns {Promise<Array>} [{id, name, kind: 'team'|'squad', members:[{id,name,image,email,role}], memberCount}]
 */
async function fetchMyTeams(token) {
  try {
    const out = []
    const myId = await fetchMyId(token)
    const myName = await myProfileName(token)

    // 1) Teams directos donde soy líder.
    try {
      const teams = await tsMcpCall(token, 'teams', 'teams_list', {})
      const list = Array.isArray(teams) ? teams : (teams && (teams.teams || teams.data)) || []
      for (const team of list) {
        if (!team || team.leader_id !== myId) continue
        out.push({
          id: team.id != null ? team.id : null,
          name: team.name || '',
          kind: 'team',
          members: normalizeMembers(team.members),
          memberCount: Array.isArray(team.members) ? team.members.length : 0,
        })
      }
    } catch (e) { /* fail-open */ }

    // 2) Squads cuyo nombre empieza con "<Mi primer nombre> - ".
    const prefix = myName ? firstNameFrom(myName) + ' - ' : null
    try {
      const squads = await tsMcpCall(token, 'teams', 'squads_list', {})
      const list = squads && Array.isArray(squads.squads) ? squads.squads : []
      for (const sq of list) {
        if (!sq || !sq.id) continue
        if (prefix && !String(sq.name || '').startsWith(prefix)) continue
        // Confirmo membresía y rol vía squads_get.
        let detail = null
        try { detail = await tsMcpCall(token, 'teams', 'squads_get', { id: sq.id }) } catch (e) { /* ignore */ }
        const members = detail && Array.isArray(detail.members) ? detail.members : []
        const isMember = members.some((m) => m && m.user && m.user.id === myId)
        if (!isMember && !(detail && detail.id)) continue
        out.push({
          id: sq.id,
          name: sq.name || '',
          kind: 'squad',
          members: normalizeSquadMembers(members),
          memberCount: detail && detail.member_count != null ? detail.member_count : members.length,
        })
      }
    } catch (e) { /* fail-open */ }

    return out
  } catch (e) {
    return []
  }
}

/**
 * Devuelve la URL del avatar del usuario autenticado.
 * my_profile no incluye 'image', así que busca en squads_get
 * (donde members[].user.image sí está disponible).
 * @param {string} token
 * @returns {Promise<string|null>}
 */
async function fetchMyAvatar(token) {
  try {
    const myId = await fetchMyId(token)
    if (!myId) return null
    const squads = await tsMcpCall(token, 'teams', 'squads_list', {})
    const list = squads && Array.isArray(squads.squads) ? squads.squads : []
    for (const sq of list) {
      if (!sq || !sq.id) continue
      try {
        const detail = await tsMcpCall(token, 'teams', 'squads_get', { id: sq.id })
        const members = detail && Array.isArray(detail.members) ? detail.members : []
        const me = members.find((m) => m && m.user && m.user.id === myId)
        if (me && me.user && me.user.image) return me.user.image
      } catch (e) { /* seguir probando */ }
    }
    return null
  } catch (e) {
    return null
  }
}

/** Nombre del usuario autenticado (fallback: ''). */
async function myProfileName(token) {
  try {
    const profile = await tsMcpCall(token, 'my-work', 'my_profile', {})
    return (profile && profile.user && profile.user.name) || ''
  } catch (e) {
    return ''
  }
}

/** Normaliza members de teams_list ({user_id,user_name,user_email,role}). */
function normalizeMembers(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map((m) => ({
    id: m && (m.user_id || m.id) != null ? (m.user_id || m.id) : null,
    name: (m && (m.user_name || m.name)) || '',
    image: null,
    email: (m && m.user_email) || '',
    role: (m && m.role) || '',
  }))
}

/** Normaliza members de squads_get ({user:{id,name,image,email}, role}). */
function normalizeSquadMembers(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map((m) => {
    const u = m && m.user ? m.user : {}
    return {
      id: u.id != null ? u.id : null,
      name: u.name || '',
      image: u.image || null,
      email: u.email || '',
      role: (m && m.role) || '',
    }
  })
}

/**
 * Obtiene los dashboards de stats para cada equipo, usando stats_dashboard
 * con period y squad_id=id. Si un team no es un squad real y la llamada
 * falla, devuelve dashboard: null (fail-open, no rompe el resto).
 * @param {string} token
 * @param {Array} teams Equipos de fetchMyTeams().
 * @param {string} [period] '7d' | '30d' | '90d' (default '30d').
 * @returns {Promise<Array>} [{id, name, kind, dashboard}]
 */
async function fetchDashboards(token, teams, period) {
  const p = period || '30d'
  const list = Array.isArray(teams) ? teams : []
  const results = []
  for (const team of list) {
    const entry = {
      id: team ? team.id : null,
      name: team ? (team.name || '') : '',
      kind: team ? (team.kind || 'team') : 'team',
      dashboard: null,
    }
    if (team && team.id != null) {
      try {
        entry.dashboard = await tsMcpCall(token, 'stats', 'stats_dashboard', {
          period: p,
          squad_id: team.id,
        })
      } catch (e) {
        entry.dashboard = null
      }
    }
    results.push(entry)
  }
  return results
}

// Integrado por build.js como módulo global del bundle (sin export).
// Funciones globales disponibles: fetchMyId, fetchMyRole, fetchMyTeams,
// fetchDashboards, mcpCall (local).

/**
 * Gobravo Workflow — Tab 'Equipo' (para líderes).
 * Renderiza los equipos/squads donde el usuario es líder, con KPIs,
 * on-time por tipo, y la lista de miembros.
 *
 * Integrado por build.js como función global del bundle (sin export).
 * Usa los imports globales de constants.js (jsx, jsxs, useState, useEffect).
 *
 *   teams:     [{ id, name, kind:'team'|'squad', members:[{id,name,image,email,role}], memberCount }]
 *   dashboards:[{ id, name, kind, dashboard }]  // dashboard = resultado de stats_dashboard (puede ser null)
 *   loading:   bool
 *   error:     string|null
 *
 * Si teams está vacío, el componente NO renderiza nada visible (return null).
 */

// ── Iconos (Heroicons solid 20, monocromáticos) ────────────────────

// users (equipo)
const TT_ICON_USERS =
  'M7 8a3 3 0 100-6 3 3 0 000 6zM14.5 9a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM1.615 16.428a1.224 1.224 0 01-.569-1.175 6.002 6.002 0 0111.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 017 18a9.953 9.953 0 01-5.385-1.572zM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 00-1.588-3.755 4.502 4.502 0 015.874 2.636.818.818 0 01-.36.98A7.465 7.465 0 0114.5 16z'

// chart-bar (velocity)
const TT_ICON_CHART_BAR =
  'M15.5 2A1.5 1.5 0 0014 3.5v13a1.5 1.5 0 001.5 1.5h1a1.5 1.5 0 001.5-1.5v-13A1.5 1.5 0 0016.5 2h-1zM9.5 6A1.5 1.5 0 008 7.5v9A1.5 1.5 0 009.5 18h1a1.5 1.5 0 001.5-1.5v-9A1.5 1.5 0 0010.5 6h-1zM3.5 10A1.5 1.5 0 002 11.5v5A1.5 1.5 0 003.5 18h1A1.5 1.5 0 006 16.5v-5A1.5 1.5 0 004.5 10h-1z'

// check-circle (completados)
const TT_ICON_CHECK_CIRCLE =
  'M10 18C14.4183 18 18 14.4183 18 10C18 5.58172 14.4183 2 10 2C5.58172 2 2 5.58172 2 10C2 14.4183 5.58172 18 10 18ZM13.8566 8.19113C14.1002 7.85614 14.0261 7.38708 13.6911 7.14345C13.3561 6.89982 12.8871 6.97388 12.6434 7.30887L9.15969 12.099L7.28033 10.2197C6.98744 9.92678 6.51256 9.92678 6.21967 10.2197C5.92678 10.5126 5.92678 10.9874 6.21967 11.2803L8.71967 13.7803C8.87477 13.9354 9.08999 14.0149 9.30867 13.9977C9.52734 13.9805 9.72754 13.8685 9.85655 13.6911L13.8566 8.19113Z'

// bolt (velocidad / tiempo)
const TT_ICON_BOLT =
  'M11.983 1.907a.75.75 0 00-1.292-.657l-8.5 9.5A.75.75 0 002.75 12h5.572l-1.305 6.093a.75.75 0 001.292.657l8.5-9.5A.75.75 0 0017.25 8h-5.572l1.305-6.093z'

// clock (lead/cycle time)
const TT_ICON_CLOCK =
  'M10 18A8 8 0 1010 2a8 8 0 000 16zm1-12.5a.75.75 0 00-1.5 0v5.59L11.53 13.4a.75.75 0 101.06-1.06l-1.75-1.75V5.5z'

// arrow-trending-down (tendencia — decreciente)
const TT_ICON_TREND_DOWN =
  'M1.612 15.878A2.25 2.25 0 003.75 17.25h.75a.75.75 0 000-1.5h-.75a.75.75 0 01-.53-.22l-2.03-2.03a.75.75 0 10-1.06 1.06l2.49 2.49z'

// Inline Icon helper (Heroicons solid — color heredado currentColor)
function TT_Icon({ path, className }) {
  const ds = Array.isArray(path) ? path : [path]
  return jsx('svg', {
    viewBox: '0 0 20 20',
    fill: 'currentColor',
    className: className || 'size-3.5 shrink-0',
    'aria-hidden': true,
    children: ds.map(function (d) { return jsx('path', { d: d }) }),
  })
}

// ── Helpers de formato ─────────────────────────────────────────────

function TT_fmt(n) {
  if (n === 0 || n) return String(n)
  return '-'
}

function TT_fmtPct(n) {
  if (n === 0 || n) return Number(n).toFixed(1) + '%'
  return '-'
}

function TT_fmtTime(n) {
  if (n === 0 || n) return Number(n).toFixed(1) + 'd'
  return '-'
}

// Colores de rol de miembro
const ROLE_COLORS = {
  engineer: '#58a6ff',
  product_manager: '#bc8cff',
  engineering_manager: '#d29922',
  uxui_designer: '#39c5cf',
  leader: '#d29922',
  owner: '#d29922',
}

function roleColor(role) {
  return ROLE_COLORS[role] || '#8b949e'
}

function roleLabel(role) {
  if (!role) return 'Miembro'
  var map = {
    engineer: 'Ingeniero/a',
    product_manager: 'Product Manager',
    engineering_manager: 'Engineering Manager',
    uxui_designer: 'Diseñador/a UX/UI',
    leader: 'Líder',
    owner: 'Líder',
    designer: 'Diseñador/a',
    pm: 'Product Manager',
    em: 'Engineering Manager',
  }
  return map[role] || role
}

// ── Estilos compartidos ────────────────────────────────────────────

const PILL_BASE = {
  fontSize: 10,
  padding: '2px 8px',
  lineHeight: '16px',
  borderRadius: 0,
  border: '1px solid #30363d',
  background: 'transparent',
  color: '#8b949e',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  fontWeight: 500,
}

const PILL_ACTIVE = {
  backgroundColor: '#238636',
  borderColor: '#238636',
  color: '#ffffff',
  fontWeight: 600,
}

const KPI_CARD = {
  flex: 1,
  padding: '6px 8px',
  borderRadius: 0,
  background: 'transparent',
  border: '1px solid #30363d',
}

const CARD = {
  padding: '6px 8px',
  borderRadius: 4,
  background: '#161b22',
  border: '1px solid #21262d',
}

const PERIODS = [
  { key: 7, label: '7d' },
  { key: 30, label: '30d' },
  { key: 90, label: '90d' },
]

function TeamTab({ hubToken, teams, dashboards, loading, error }) {
  var _a = useState(0)
  var activeIdx = _a[0]
  var setActiveIdx = _a[1]

  var _b = useState(30)
  var period = _b[0]
  var setPeriod = _b[1]

  // Resetea el equipo activo si cambia la lista
  useEffect(function () {
    if (activeIdx > (teams || []).length - 1) setActiveIdx(0)
  }, [teams])

  // Si no hay equipos a cargo, este tab no aplica -> no renderizar nada
  if (!teams || teams.length === 0) return null

  // loading general (sin datos aun)
  if (loading && (!dashboards || dashboards.length === 0)) {
    return jsx('div', {
      style: { padding: 40, textAlign: 'center', fontSize: 12, color: '#888' },
      children: 'Cargando...',
    })
  }

  if (error && (!dashboards || dashboards.length === 0)) {
    return jsxs('div', {
      style: { padding: 14 },
      children: [
        jsx('div', { style: { fontWeight: 600, color: '#f85149', marginBottom: 6 }, children: 'Error' }),
        jsx('div', { style: { fontSize: 11, color: '#888' }, children: error }),
      ],
    })
  }

  var safeIdx = activeIdx < teams.length ? activeIdx : 0
  var team = teams[safeIdx]
  var teamDash = null
  if (dashboards) {
    var found = dashboards.find(function (d) {
      return String(d.id) === String(team ? team.id : '')
    })
    if (found) teamDash = found.dashboard
  }

  // Datos del dashboard seleccionado (con fallbacks defensivos)
  var dashboard = teamDash || {}
  var onTimePct = dashboard.on_time_pct
  var velocity = dashboard.velocity
  var completions = dashboard.completed !== undefined ? dashboard.completed : dashboard.completions
  var wip = dashboard.wip
  var overdue = dashboard.overdue
  var leadMedian = dashboard.lead_time_median
  var cycleMedian = dashboard.cycle_time_median
  var onTimeByType = dashboard.on_time_by_type || []

  // Tendencia lead/cycle (▲ verde si mejora / ▼ rojo si empeora)
  var leadDelta = dashboard.lead_time_delta
  var cycleDelta = dashboard.cycle_time_delta

  var members = (team && team.members) || []
  var memberCount = (team && team.memberCount != null) ? team.memberCount : members.length

  // Barras de on-time por tipo
  function progressRow(label, value) {
    var pct = value != null ? Number(value) : null
    var barColor = pct !== null && pct >= 80 ? '#3fb950' : (pct !== null && pct >= 60 ? '#d29922' : '#f85149')
    return jsxs('div', {
      children: [
        jsxs('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#8b949e', marginBottom: 2 }, children: [
          jsx('span', { children: label }),
          jsx('span', { style: { color: barColor, fontWeight: 600 }, children: pct !== null ? TT_fmtPct(pct) : '—' }),
        ]}),
        jsx('div', {
          style: { height: 6, borderRadius: 0, background: '#21262d', overflow: 'hidden' },
          children: pct !== null
            ? jsx('div', {
                style: { height: '100%', width: Math.min(Math.max(pct, 0), 100) + '%', background: barColor },
              })
            : null,
        }),
      ],
    })
  }

  // Tarjeta KPI con tendencia
  function trendCard(label, value, delta, iconPath) {
    var hasDelta = delta !== undefined && delta !== null && !isNaN(Number(delta))
    var up = hasDelta && Number(delta) <= 0 // mejora = menor tiempo
    var color = up ? '#3fb950' : '#f85149'
    var arrow = up ? '▲' : '▼'
    return jsxs('div', {
      style: KPI_CARD,
      children: [
        jsx('div', {
          style: { fontSize: 9, color: '#8b949e', display: 'inline-flex', alignItems: 'center', gap: 3, textTransform: 'uppercase', letterSpacing: '0.02em' },
          children: [jsx(Icon, { path: iconPath, className: 'size-3 shrink-0' }), ' ' + label],
        }),
        jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }, children: [
          jsx('div', { style: { fontSize: 16, fontWeight: 700, color: '#ddd' }, children: value }),
          hasDelta
            ? jsx('span', { style: { fontSize: 9, fontWeight: 600, color: color }, children: arrow + ' ' + TT_fmtTime(Math.abs(Number(delta))) })
            : null,
        ]}),
      ],
    })
  }

  return jsxs('div', {
    style: { padding: 12, fontSize: 12 },
    children: [
      // ── Header ─────────────────────────────────────────────
      jsxs('div', {
        style: { padding: '0 0 8px 0', borderBottom: '1px solid #21262d', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#161616' },
        children: [
          jsxs('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [
            jsx(TT_Icon, { path: TT_ICON_USERS, className: 'size-4 shrink-0' }),
            jsx('div', { style: { fontSize: 13, fontWeight: 700, color: '#ddd' }, children: 'Equipo a cargo' }),
          ]}),
          // Selector de periodo (7/30/90)
          jsxs('div', { style: { display: 'flex', gap: 2 }, children: PERIODS.map(function (p) {
            return jsx('button', {
              key: 'period-' + p.key,
              onClick: function () { setPeriod(p.key) },
              style: Object.assign({}, PILL_BASE, period === p.key ? PILL_ACTIVE : {}),
              children: p.label,
            })
          })}),
        ],
      }),

      // ── Sub-tabs por equipo (solo si hay más de uno) ───────
      teams.length > 1 && jsxs('div', {
        style: { display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' },
        children: teams.map(function (t, i) {
          var active = i === safeIdx
          return jsx('button', {
            key: t.id,
            onClick: function () { setActiveIdx(i) },
            style: Object.assign({}, PILL_BASE, active ? PILL_ACTIVE : {}),
            children: jsxs('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [
              t.name || ('Equipo ' + (i + 1)),
              jsx('span', { style: { color: active ? '#d0ffd8' : '#6e7681', fontSize: 9, fontWeight: 600 }, children: TT_fmt(t.memberCount != null ? t.memberCount : (t.members || []).length) }),
            ]}),
          })
        }),
      }),

      // Si el dashboard del equipo seleccionado falló
      teamDash === null ? jsx('div', {
        style: { padding: 14, color: '#d29922', fontSize: 11 },
        children: 'Sin datos de dashboard para este equipo.',
      }) : null,

      teamDash !== null ? jsxs('div', { children: [
        // ── KPIs: Completados / On-time / Velocity ─────────
        jsxs('div', { style: { display: 'flex', gap: 5, marginBottom: 5 }, children: [
          jsx('div', {
            style: KPI_CARD,
            children: [
              jsx('div', { style: { fontSize: 9, color: '#8b949e', display: 'inline-flex', alignItems: 'center', gap: 3, textTransform: 'uppercase', letterSpacing: '0.02em' }, children: [jsx(TT_Icon, { path: TT_ICON_CHECK_CIRCLE, className: 'size-3 shrink-0' }), ' Completados'] }),
              jsx('div', { style: { fontSize: 17, fontWeight: 700, color: '#f0f6fc', marginTop: 1 }, children: TT_fmt(completions) }),
            ],
          }),
          jsx('div', {
            style: KPI_CARD,
            children: [
              jsx('div', { style: { fontSize: 9, color: '#8b949e', display: 'inline-flex', alignItems: 'center', gap: 3, textTransform: 'uppercase', letterSpacing: '0.02em' }, children: [jsx(TT_Icon, { path: TT_ICON_CLOCK, className: 'size-3 shrink-0' }), ' On-time'] }),
              jsx('div', { style: { fontSize: 17, fontWeight: 700, color: '#3fb950', marginTop: 1 }, children: TT_fmtPct(onTimePct) }),
            ],
          }),
          jsx('div', {
            style: KPI_CARD,
            children: [
              jsx('div', { style: { fontSize: 9, color: '#8b949e', display: 'inline-flex', alignItems: 'center', gap: 3, textTransform: 'uppercase', letterSpacing: '0.02em' }, children: [jsx(TT_Icon, { path: TT_ICON_CHART_BAR, className: 'size-3 shrink-0' }), ' Velocity'] }),
              jsx('div', { style: { fontSize: 17, fontWeight: 700, color: '#58a6ff', marginTop: 1 }, children: TT_fmt(velocity) }),
            ],
          }),
        ]}),

        // ── KPIs: WIP / Overdue ────────────────────────────
        jsxs('div', { style: { display: 'flex', gap: 5, marginBottom: 5 }, children: [
          jsx('div', {
            style: KPI_CARD,
            children: [
              jsx('div', { style: { fontSize: 9, color: '#8b949e', display: 'inline-flex', alignItems: 'center', gap: 3, textTransform: 'uppercase', letterSpacing: '0.02em' }, children: [jsx(TT_Icon, { path: TT_ICON_BOLT, className: 'size-3 shrink-0' }), ' WIP'] }),
              jsx('div', { style: { fontSize: 15, fontWeight: 700, color: '#ddd', marginTop: 1 }, children: TT_fmt(wip) }),
            ],
          }),
          jsx('div', {
            style: KPI_CARD,
            children: [
              jsx('div', { style: { fontSize: 9, color: '#8b949e', display: 'inline-flex', alignItems: 'center', gap: 3, textTransform: 'uppercase', letterSpacing: '0.02em' }, children: [jsx(TT_Icon, { path: TT_ICON_TREND_DOWN, className: 'size-3 shrink-0' }), ' Overdue'] }),
              jsx('div', { style: { fontSize: 15, fontWeight: 700, color: overdue > 0 ? '#f85149' : '#ddd', marginTop: 1 }, children: TT_fmt(overdue) }),
            ],
          }),
          jsx('div', { style: { flex: 1, visibility: 'hidden' }, children: null }),
        ]}),

        // ── KPIs: Lead / Cycle time mediana (con tendencia) ─
        jsxs('div', { style: { display: 'flex', gap: 5, marginBottom: 8 }, children: [
          trendCard('Lead time med.', TT_fmtTime(leadMedian), leadDelta, TT_ICON_CLOCK),
          trendCard('Cycle time med.', TT_fmtTime(cycleMedian), cycleDelta, TT_ICON_BOLT),
          jsx('div', { style: { flex: 1, visibility: 'hidden' }, children: null }),
        ]}),

        // ── On-time por tipo ────────────────────────────────
        jsxs('div', { style: Object.assign({}, CARD, { marginBottom: 8 }), children: [
          jsx('div', { style: { fontSize: 10, fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', marginBottom: 6 }, children: 'On-time por tipo' }),
          jsxs('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 }, children:
            onTimeByType.length
              ? onTimeByType.map(function (row) {
                  return progressRow(row.type || row.name, row.pct)
                })
              : [jsx('div', { style: { fontSize: 11, color: '#6e7681' }, children: 'Sin datos por tipo' })],
          }),
        ]}),
      ]}) : null,

      // ── Miembros del equipo ───────────────────────────────
      jsxs('div', { children: [
        jsx('div', { style: { fontSize: 10, fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', marginBottom: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [
          jsx(TT_Icon, { path: TT_ICON_USERS, className: 'size-3 shrink-0' }),
          'Miembros del equipo (' + TT_fmt(memberCount) + ')',
        ]}),

        members.length === 0
          ? jsx('div', { style: { fontSize: 11, color: '#6e7681' }, children: 'Sin miembros listados.' })
          : members.map(function (m) {
              var rc = roleColor(m.role)
              return jsxs('div', {
                key: m.id || m.name || 'm',
                style: Object.assign({}, CARD, { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }),
                children: [
                  // Avatar (redondeado)
                  m.image
                    ? jsx('img', {
                        src: m.image,
                        alt: '',
                        draggable: false,
                        style: { width: 24, height: 24, borderRadius: '50%', background: '#21262d', objectFit: 'cover', flexShrink: 0 },
                      })
                    : jsx('div', {
                        style: { width: 24, height: 24, borderRadius: '50%', background: '#21262d', color: '#8b949e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0 },
                        children: (m.name || '?').charAt(0).toUpperCase(),
                      }),
                  jsxs('div', { style: { flex: 1, minWidth: 0 }, children: [
                    jsx('div', { style: { fontSize: 12, fontWeight: 600, color: '#ddd', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, children: m.name || 'Sin nombre' }),
                    jsx('div', {
                      style: { fontSize: 9, color: rc, fontWeight: 500, marginTop: 1 },
                      children: roleLabel(m.role),
                    }),
                  ]}),
                  // Contador de items (ilustrativo por ahora)
                  jsx('span', {
                    style: { fontSize: 9, color: '#6e7681', border: '1px solid #30363d', borderRadius: 0, padding: '0px 6px', lineHeight: '14px', background: 'transparent', flexShrink: 0 },
                    children: '—',
                  }),
                ],
              })
            }),
      ]}),
    ],
  })
}

// Integrado por build.js como función global del bundle (sin export).
// Global disponible: TeamTab.

// ── Tab names ──────────────────────────────────────────────────────


var TABS = [
  { key: 'stats', label: 'Overview', iconPath: ICON_SQUARES_2X2 },
  { key: 'prs', label: 'PRs', iconPath: ICON_GITHUB, iconViewBox: '0 0 24 24' },
  { key: 'status', label: 'Tracks', iconPath: ICON_VIEW_COLUMNS },
  { key: 'tickets', label: 'Tasks', iconPath: ICON_CHECK },
  { key: 'config', label: 'Config', iconPath: ICON_WRENCH },
]

// ── Bootstrap ──────────────────────────────────────────────────────

// ── Bootstrap ──────────────────────────────────────────────────────

export default {
  id: ID,
  name: 'Gobravo Workflow',
  register(ctx) {
    ctx.register({
      id: ID + '-pill',
      area: 'statusBar.right',
      order: 5,
      render: function () { return jsx(App, {}) },
    })
  },
}

// ── Pill ───────────────────────────────────────────────────────────

function Pill({ onClick }) {
  return jsx('button', {
    onClick: onClick,
    style: {
      backgroundColor: '#1a1a1a',
      color: '#58a6ff',
      border: 'none',
      borderRadius: 4,
      padding: '2px 8px',
      cursor: 'pointer',
      fontSize: 12,
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      lineHeight: '20px',
    },
    children: jsx('img', {
      src: BRAVO_LOGO,
      alt: '',
      draggable: false,
      style: { height: 16, width: 'auto', display: 'block' },
    }),
  })
}

// ── App (root) ────────────────────────────────────────────────────

function App() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('stats')
  const [hubToken, setHubToken] = useState(function () { return loadStr(STORAGE_HUB_TOKEN) })
  const [githubToken, setGithubToken] = useState(function () { return loadStr(STORAGE_GITHUB_TOKEN) })
  const [webhookUrl, setWebhookUrl] = useState(function () { return loadStr(STORAGE_WEBHOOK_URL) })
  // Datos del rol/equipos (para el tab 'Equipo' condicional y el sub_area del header)
  const [teamData, setTeamData] = useState(null) // { role, teams, dashboards, loading, error }

  // Al abrir (y si hay token), detecta rol + equipos a cargo.
  useEffect(function () {
    if (!open || !hubToken || teamData) return
    var cancelled = false
    setTeamData({ role: null, teams: [], dashboards: [], loading: true, error: null })
    Promise.all([
      fetchMyRole(hubToken),
      fetchMyTeams(hubToken),
      fetchMyAvatar(hubToken),
    ]).then(function (res) {
      if (cancelled) return
      var role = res[0]
      var teams = res[1] || []
      var avatar = res[2] || null
      // Dashboards solo para equipos con id (squads; los teams directos pueden no tener stats)
      return fetchDashboards(hubToken, teams, '7d').then(function (dashboards) {
        if (cancelled) return
        setTeamData({ role: role, teams: teams, dashboards: dashboards || [], loading: false, error: null, avatar: avatar })
      })
    }).catch(function (e) {
      if (cancelled) return
      setTeamData({ role: null, teams: [], dashboards: [], loading: false, error: String(e && e.message || e) })
    })
    return function () { cancelled = true }
  }, [open, hubToken])

  function saveAllConfig(hub, github, webhook) {
    saveStr(STORAGE_HUB_TOKEN, hub)
    saveStr(STORAGE_GITHUB_TOKEN, github)
    saveStr(STORAGE_WEBHOOK_URL, webhook)
    setHubToken(hub)
    setGithubToken(github)
    setWebhookUrl(webhook)
  }

  return jsxs('div', {
    children: [
      jsx(Pill, { onClick: function () { haptic('tap'); setOpen(!open) } }),
      open && jsx(Dropdown, {
        tab: tab,
        onTabChange: setTab,
        hubToken: hubToken,
        githubToken: githubToken,
        webhookUrl: webhookUrl,
        teamData: teamData,
        onSaveConfig: saveAllConfig,
        onClose: function () { setOpen(false) },
      }),
    ],
  })
}

// ── Dropdown ────────────────────────────────────────────────────────

const dropdownStyles = {
  position: 'fixed',
  top: 36,
  right: 8,
  width: 560,
  maxHeight: 'calc(100vh - 60px)',
  overflowY: 'auto',
  backgroundColor: '#161616',
  border: '1px solid #333',
  borderRadius: 8,
  boxShadow: '0 4px 24px rgba(0,0,0,.5)',
  zIndex: 9999,
  fontSize: 12,
  color: '#ccc',
  display: 'flex',
}

var contentStyle = {
  flex: 1,
  minWidth: 0,
  overflowY: 'auto',
  maxHeight: 'calc(100vh - 60px)',
  borderRadius: '0 8px 8px 0',
}

function Dropdown({ tab, onTabChange, hubToken, githubToken, webhookUrl, teamData, onSaveConfig, onClose }) {
  const ref = useRef(null)
  var _sc = useState(function () { return loadStr(STORAGE_SIDEBAR_COLLAPSED) === '1' })
  var collapsed = _sc[0]
  var setCollapsed = _sc[1]

  useEffect(function () {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return function () { document.removeEventListener('mousedown', handleClick) }
  }, [onClose])

  return jsxs('div', {
    ref: ref,
    style: dropdownStyles,
    children: [
      // ── Sidebar ──
      jsx('div', {
        style: {
          width: collapsed ? 38 : 150,
          flexShrink: 0,
          borderRight: '1px solid #333',
          display: 'flex',
          flexDirection: 'column',
          padding: '6px 0',
          backgroundColor: '#131313',
          borderRadius: '8px 0 0 8px',
          overflow: 'hidden',
          transition: 'width .12s',
        },
        children: [
          TABS.filter(function (t) { return t.key !== 'config' }).map(function (t) {
            var active = t.key === tab
            return jsx('button', {
              onClick: function () { onTabChange(t.key) },
              title: t.label,
              style: {
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                margin: '0 4px',
                borderRadius: 5,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: active ? '#222' : 'transparent',
                color: active ? '#fff' : '#888',
                fontSize: 16,
                lineHeight: '16px',
                fontWeight: active ? 600 : 400,
                transition: 'none',
                whiteSpace: 'nowrap',
              },
              children: [
                jsx(Icon, { path: t.iconPath, viewBox: t.iconViewBox, className: 'size-4 shrink-0' }),
                !collapsed && jsx('span', { style: { fontSize: 11, lineHeight: '14px' }, children: t.label }),
              ],
            }, t.key)
          }),
          // Tab 'Equipo' condicional: solo si el usuario tiene equipos a cargo
          teamData && teamData.teams && teamData.teams.length > 0 && (function () {
            var active = 'team' === tab
            return jsx('button', {
              onClick: function () { onTabChange('team') },
              title: 'Equipo',
              style: {
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                margin: '0 4px',
                borderRadius: 5,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: active ? '#222' : 'transparent',
                color: active ? '#fff' : '#888',
                fontSize: 16,
                lineHeight: '16px',
                fontWeight: active ? 600 : 400,
                transition: 'none',
                whiteSpace: 'nowrap',
              },
              children: [
                jsx(Icon, { path: ICON_CHART_BAR, className: 'size-4 shrink-0' }),
                !collapsed && jsx('span', { style: { fontSize: 11, lineHeight: '14px' }, children: 'Equipo' }),
              ],
            }, 'team')
          }()),
          // Spacer
          jsx('div', { style: { flex: 1 } }),
          // Toggle colapsar/expandir
          jsx('button', {
            onClick: function () {
              var next = !collapsed
              setCollapsed(next)
              saveStr(STORAGE_SIDEBAR_COLLAPSED, next ? '1' : '')
            },
            title: collapsed ? 'Expandir sidebar' : 'Colapsar sidebar',
            style: {
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              padding: '5px 10px',
              justifyContent: collapsed ? 'center' : 'flex-start',
              margin: '0 4px',
              border: 'none',
              borderTop: '1px solid #2a2a2a',
              cursor: 'pointer',
              background: 'none',
              color: '#666',
              whiteSpace: 'nowrap',
            },
            children: [
              jsx(Icon, { path: collapsed ? ICON_CHEVRON_RIGHT : ICON_CHEVRON_LEFT, className: 'size-3.5 shrink-0' }),
              !collapsed && jsx('span', { style: { fontSize: 10, lineHeight: '12px', color: '#666' }, children: 'Colapsar' }),
            ],
          }, 'toggle'),
          // Config tab at bottom
          function () {
            var active = 'config' === tab
            return jsx('button', {
              onClick: function () { onTabChange('config') },
              title: 'Config',
              style: {
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                margin: '4px 4px 0',
                borderRadius: 5,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: active ? '#222' : 'transparent',
                color: active ? '#fff' : '#888',
                fontSize: 16,
                lineHeight: '16px',
                fontWeight: active ? 600 : 400,
                transition: 'none',
                whiteSpace: 'nowrap',
              },
              children: [
                jsx(Icon, { path: ICON_WRENCH, className: 'size-4 shrink-0' }),
                !collapsed && jsx('span', { style: { fontSize: 11, lineHeight: '14px' }, children: 'Config' }),
              ],
            }, 'config')
          }(),
        ],
      }),
      // ── Content ──
      jsx('div', {
        style: contentStyle,
        children: [
          tab === 'stats' && jsx(StatsTab, { hubToken: hubToken, role: teamData && teamData.role ? teamData.role.sub_area : null, avatar: teamData ? teamData.avatar : null }),
          tab === 'team' && teamData && jsx(TeamTab, {
            hubToken: hubToken,
            teams: teamData.teams || [],
            dashboards: teamData.dashboards || [],
            loading: teamData.loading,
            error: teamData.error,
          }),
          tab === 'prs' && jsx(PRsTab, { githubToken: githubToken, webhookUrl: webhookUrl }),
          tab === 'tickets' && jsx(TicketsTab, { hubToken: hubToken }),
          tab === 'status' && jsx(StatusTab, { hubToken: hubToken }),
          tab === 'config' && jsx(ConfigTab, {
            hubToken: hubToken,
            githubToken: githubToken,
            webhookUrl: webhookUrl,
            onSave: onSaveConfig,
          }),
        ],
      }),
    ],
  })
}

// ── ConfigTab ──────────────────────────────────────────────────────

function loadModels() {
  try {
    var r = loadStr(STORAGE_HUB_TOKEN + '-models')
    if (r) return Object.assign({}, DEFAULT_STATUS_MODELS, JSON.parse(r))
  } catch {}
  return Object.assign({}, DEFAULT_STATUS_MODELS)
}

function saveModels(m) {
  try { saveStr(STORAGE_HUB_TOKEN + '-models', JSON.stringify(m)) } catch {}
}

async function fetchMyWork(token) {
  return mcpCall(token, 'my-work', 'my_profile', {
    include_workitems: true,
    limit: 100,
  })
}

async function getDetail(token, id) {
  return mcpCall(token, 'tracker', 'get_workitem', {
    id: id,
    include_content: true,
  })
}

async function fetchComments(token, id) {
  return mcpCall(token, 'tracker', 'list_comments', {
    work_item_id: id,
  })
}

async function fetchSquads(token) {
  return mcpCall(token, 'teams', 'squads_list', {})
}


// ── StatsTab ────────────────────────────────────────────────────────

function SetupView({ onClose, onDone }) {
  var inputRef = useRef(null)
  var handleSave = function () {
    var val = inputRef.current && inputRef.current.value && inputRef.current.value.trim()
    if (!val) return
    try {
      saveStr(STORAGE_HUB_TOKEN, val)
    } catch {}
    onDone(val)
    onClose()
  }
  return jsxs('div', {
    style: { padding: 14 },
    children: [
      jsx('div', {
        style: { padding: '0 0 10px 0', fontSize: 13, color: '#ddd', fontWeight: 600, borderBottom: '1px solid #333' },
        children: jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_KEY, className: 'size-3.5 shrink-0' }), ' Configurar Hub'] }),
      }),
      jsxs('div', {
        style: { padding: '10px 0', display: 'flex', flexDirection: 'column', gap: 10 },
        children: [
          jsx('div', {
            style: { fontSize: 11, color: '#888', lineHeight: 1.5 },
            children: 'Pega tu API Token de Gobravo Hub con scope de lectura.',
          }),
          jsx('input', {
            ref: inputRef,
            type: 'password',
            placeholder: 'hub_xxxxxxxxxxxx',
            style: {
              backgroundColor: '#111',
              color: '#ddd',
              border: '1px solid #333',
              borderRadius: 4,
              padding: '6px 10px',
              fontSize: 12,
              outline: 'none',
              width: '100%',
              boxSizing: 'border-box',
            },
            onKeyDown: function (e) { if (e.key === 'Enter') handleSave() },
          }),
          jsx('button', {
            onClick: handleSave,
            style: {
              backgroundColor: '#238636',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              alignSelf: 'flex-end',
            },
            children: 'Guardar',
          }),
        ],
      }),
    ],
  })
}

function StatusTab({ hubToken }) {
  var _a = useState(null)
  var data = _a[0]
  var setData = _a[1]

  var _b = useState(false)
  var loading = _b[0]
  var setLoading = _b[1]

  var lastFetch = useRef(0)

  var _c = useState(null)
  var actioningId = _c[0]
  var setActioningId = _c[1]

  var _d = useState(null)
  var selectedId = _d[0]
  var setSelectedId = _d[1]

  var _e = useState(null)
  var detail = _e[0]
  var setDetail = _e[1]

  var _f = useState(false)
  var detailLoading = _f[0]
  var setDetailLoading = _f[1]

  var _g = useState(null)
  var comments = _g[0]
  var setComments = _g[1]

  var _h = useState('')
  var commentText = _h[0]
  var setCommentText = _h[1]

  var _i = useState(false)
  var commenting = _i[0]
  var setCommenting = _i[1]

  var _j = useState(false)
  var editingDesc = _j[0]
  var setEditingDesc = _j[1]

  var _k = useState('')
  var editContent = _k[0]
  var setEditContent = _k[1]

  var _l = useState(false)
  var savingContent = _l[0]
  var setSavingContent = _l[1]

  var _m = useState(function () { return loadModels() })
  var statusModels = _m[0]
  var setStatusModels = _m[1]

  var _p = useState(false)
  var setupMode = _p[0]
  var setSetupMode = _p[1]

  var _r = useState({})
  var collapsed = _r[0]
  var setCollapsed = _r[1]

  function toggleCollapsed(status) {
    var next = {}
    next[status] = !collapsed[status]
    setCollapsed(Object.assign({}, collapsed, next))
  }

  var _q = useState(false)
  var creating = _q[0]
  var setCreating = _q[1]

  var handleTokenDone = function (newToken) {
    setData(null)
    lastFetch.current = 0
  }

  function loadData() {
    if (!hubToken) return
    var now = Date.now()
    if (now - lastFetch.current < CACHE_TTL && data) return

    setLoading(true)
    lastFetch.current = now

    fetchMyWork(hubToken)
      .then(function (profile) {
        var allItems = (profile.workitems && profile.workitems.tracks) ||
          profile.work_items ||
          profile.items ||
          []

        var items = []
        if (Array.isArray(allItems)) {
          items = allItems
        } else if (typeof allItems === 'object') {
          var keys = Object.keys(allItems)
          for (var ki = 0; ki < keys.length; ki++) {
            var key = keys[ki]
            if (Array.isArray(allItems[key])) {
              items = items.concat(allItems[key])
            }
          }
        }

        var seen = new Set()
        items = items.filter(function (i) {
          if (seen.has(i.id)) return false
          seen.add(i.id)
          return true
        })

        setData({
          items: items,
          name: profile.name || profile.display_name || profile.email || 'Usuario',
          error: null,
        })
      })
      .catch(function (err) {
        var msg = String(err.message || err)
        if (msg.includes('401') || msg.includes('Unauthorized') || msg.includes('Bad credentials')) {
          saveStr(STORAGE_HUB_TOKEN, '')
          setData(null)
          return
        }
        setData({ items: [], name: '', error: msg })
      })
      .finally(function () { setLoading(false) })
  }

  useEffect(function () {
    if (hubToken && !data && !loading) loadData()
  }, [hubToken])

  // Auto-refresh every 5 minutes
  useEffect(function () {
    if (!hubToken) return
    var interval = setInterval(function () {
      lastFetch.current = 0
      loadData()
    }, 300_000)
    return function () { clearInterval(interval) }
  }, [hubToken, data])

  var openDetail = useCallback(function (item) {
    setSelectedId(item.id)
    setDetailLoading(true)
    setDetail(null)
    setComments(null)
    getDetail(hubToken, item.id)
      .then(function (d) {
        d.name = d.name || item.name
        d.code = d.code || item.code
        d.type = d.type || item.type
        d.status = d.status || item.status
        setDetail(d)
        // Fetch comments in parallel
        fetchComments(hubToken, item.id).then(function (data) {
          var list = (data && data.comments) || (data && data.items) || []
          setComments(Array.isArray(list) ? list : [])
        }).catch(function () { setComments([]) })
      })
      .catch(function (err) {
        setDetail({ id: item.id, name: item.name, code: item.code, type: item.type, status: item.status, error: err.message })
      })
      .finally(function () { setDetailLoading(false) })
  }, [hubToken])

  var handleAddComment = useCallback(function () {
    var text = commentText.trim()
    if (!text || !(detail && detail.id)) return
    setCommenting(true)
    mcpCall(hubToken, 'tracker', 'add_comment', {
      work_item_id: detail.id,
      content: text,
    })
      .then(function () {
        host.notify('✅ Comentario agregado')
        setCommentText('')
        return fetchComments(hubToken, detail.id)
      })
      .then(function (data) {
        var list = (data && data.comments) || (data && data.items) || []
        setComments(Array.isArray(list) ? list : [])
      })
      .catch(function (err) {
        host.notifyError('Error: ' + err.message)
      })
      .finally(function () { setCommenting(false) })
  }, [hubToken, detail, commentText])

  var actionTrack = useCallback(function (item, buildPrompt) {
    var sid = host.state.activeSessionId.get()
    if (!sid) {
      host.notifyError('❌ No hay sesión activa. Abre o crea un chat primero.')
      return
    }

    setActioningId(item.id + '-' + item.status)
    try {
      // Reglas de análisis por transición de estado (fusiona defaults con guardadas)
      var saved = loadTrackRules()
      var rules = {}
      Object.keys(DEFAULT_TRACK_RULES).forEach(function (k) {
        var d = DEFAULT_TRACK_RULES[k] || {}
        var s = saved[k] || {}
        rules[k] = {
          provider: s.provider || d.provider || '',
          model: s.model || d.model || '',
          rules: s.rules || d.rules || '',
          refs: (s.refs && s.refs.length) ? s.refs : (d.refs || []),
        }
      })
      var transMap = {
        backlog: 'backlog_to_shaping',
        shaping: 'shaping_to_todo',
        todo: 'todo_to_in_progress',
        in_progress: 'in_progress_to_review',
      }
      var trans = transMap[item.status] || null
      var cfg = trans ? (rules[trans] || {}) : {}

      if (cfg.provider && cfg.model) {
        // Provider/modelo configurado en la card de transición → aplicarlo a la sesión
        var providerSlug = (cfg.provider === 'Token Gate') ? 'tokengate' : cfg.provider
        host.request('config.set', {
          session_id: sid,
          key: 'model',
          value: cfg.model + ' --provider ' + providerSlug + ' --session',
        })
      } else {
        // Fallback: switch model based on the item's status
        var modelSlug = statusModels[item.status]
        if (modelSlug && host.state.model) {
          try { host.state.model.set(modelSlug) } catch {}
        }
      }

      host.request('prompt.submit', {
        session_id: sid,
        text: buildPrompt(item, cfg.rules, cfg.refs),
      })
      host.notify('📤 Análisis enviado — el asistente procesará ' + item.code)
    } catch (err) {
      host.notifyError('Error: ' + err.message)
    } finally {
      setActioningId(null)
    }
  }, [statusModels])

  function saveDescription() {
    if (!detail) return
    setSavingContent(true)
    var plural = { track: 'tracks', task: 'tasks', project: 'projects', discovery: 'discoveries' }
    var path = plural[detail.type] || 'tracks'
    fetch(HUB_BASE + '/tracker/' + path + '/' + detail.id, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + hubToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: editContent }),
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status)
        return res
      })
      .then(function () {
        setDetail(Object.assign({}, detail, { content: editContent }))
        setEditingDesc(false)
        host.notify('✅ Descripción actualizada')
      })
      .catch(function (err) {
        host.notifyError('Error al guardar: ' + (err.message || ''))
      })
      .finally(function () { setSavingContent(false) })
  }

  function itemUrl(item) {
    var type = item.type || 'tracks'
    var plural = {
      track: 'tracks',
      task: 'tasks',
      project: 'projects',
      discovery: 'discoveries',
    }
    return 'https://hub.gobravo.io/tracker/' + (plural[type] || 'tracks') + '/' + item.id
  }

  function btnStyle(color, disabled) {
    return {
      background: 'none',
      border: '1px solid',
      borderColor: disabled ? '#444' : color,
      color: disabled ? '#555' : color,
      cursor: disabled ? 'default' : 'pointer',
      fontSize: 10,
      fontWeight: 600,
      padding: '2px 6px',
      marginRight: 4,
      borderRadius: 4,
      whiteSpace: 'nowrap',
      flexShrink: 0,
      lineHeight: '18px',
    }
  }

  function actionButton(item) {
    if (item.type !== 'track') return null

    var isActioning = actioningId === (item.id + '-' + item.status)
    var label, promptBuilder, color, actionIcon

    switch (item.status) {
      case 'backlog':
        label = 'Shape'
        promptBuilder = buildBacklogPrompt
        color = '#6e7681'
        actionIcon = ICON_CLIPBOARD_DOCUMENT_LIST
        break
      case 'shaping':
        label = 'Plan'
        promptBuilder = buildShapingPrompt
        color = '#58a6ff'
        actionIcon = ICON_PENCIL_SQUARE
        break
      case 'todo':
        label = 'Execute'
        promptBuilder = buildTodoPrompt
        color = '#3fb950'
        actionIcon = ICON_WRENCH
        break
      case 'in_progress':
        label = 'Continue'
        promptBuilder = buildTodoPrompt
        color = '#f59e0b'
        actionIcon = ICON_ARROW_PATH
        break
      default:
        return null
    }

    return jsx('button', {
      onClick: function (e) {
        e.preventDefault(); e.stopPropagation()
        if (!isActioning) actionTrack(item, promptBuilder)
      },
      disabled: isActioning,
      style: btnStyle(color, isActioning),
      title: isActioning ? 'Enviando...' : label + ': ' + item.code,
      children: isActioning ? '⏳' : jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'center' }, children: [jsx(Icon, { path: actionIcon, className: 'size-3.5 shrink-0' }), ' ' + label] }),
    }, 'action')
  }

  function renderItem(item) {
    var btn = actionButton(item)
    var isSelected = selectedId === item.id
    var statusColor = STATUS_COLORS[item.status] || '#8b949e'

    return jsxs('div', {
      children: [
        jsx('div', {
          onClick: function () { openDetail(item) },
          style: {
            display: 'flex',
            alignItems: 'center',
            borderBottom: '1px solid #1a1a1a',
            cursor: 'pointer',
            backgroundColor: isSelected ? '#1a1a2a' : 'transparent',
          },
          onMouseEnter: function (e) { e.currentTarget.style.backgroundColor = '#2a2a2a' },
          onMouseLeave: function (e) { e.currentTarget.style.backgroundColor = isSelected ? '#1a1a2a' : 'transparent' },
          children: [
            jsx('div', {
              style: {
                flex: 1,
                padding: '8px 12px 8px 28px',
                minWidth: 0,
              },
              children: jsxs('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 8 },
                children: [
                  jsxs('div', { style: { flex: 1, minWidth: 0 },
                    children: [
                      jsx('div', {
                        style: {
                          fontSize: 12,
                          fontWeight: 500,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        },
                        children: item.name,
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
                          jsx('span', { style: { color: '#58a6ff' }, children: item.code || '' }),
                          jsx('span', {
                            style: {
                              fontSize: 10,
                              padding: '1px 8px',
                              borderRadius: 999,
                              border: '1px solid ' + statusColor,
                              color: statusColor,
                              flexShrink: 0,
                              fontWeight: 500,
                              lineHeight: '14px',
                            },
                            children: statusText(item.status),
                          }, 'status-chip'),
                          item.due_date && jsx('span', {
                            style: { color: new Date(item.due_date) < new Date() ? '#ef4444' : '#888', display: 'inline-flex', alignItems: 'center', gap: 4 },
                            children: [jsx(Icon, { path: ICON_CALENDAR, className: 'size-3 shrink-0' }), ' ' + timeAgo(item.due_date)],
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            }),
            btn,
          ],
        }),
      ],
    }, item.id)
  }

  // ── Render ──────────────────────────────────────────────────────

  if (!hubToken) {
    return jsx(SetupView, {
      onClose: function () {},
      onDone: handleTokenDone,
    })
  }

  if (loading && !data) {
    return jsx('div', {
      style: { padding: 40, textAlign: 'center', fontSize: 12, color: '#888' },
      children: '⏳ Cargando...',
    })
  }

  if (data && data.error) {
    return jsxs('div', {
      style: { padding: 14 },
      children: [
        jsx('div', { style: { fontWeight: 600, color: '#f85149', marginBottom: 6 }, children: '❌ Error' }),
        jsx('div', { style: { fontSize: 11, color: '#888' }, children: data.error }),
        jsx('button', {
          onClick: function () { setSetupMode(true) },
          style: { background: 'none', border: 'none', color: '#58a6ff', cursor: 'pointer', fontSize: 11, marginTop: 8, padding: 0 },
          children: jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_ARROW_PATH, className: 'size-3 shrink-0' }), ' Cambiar token'] }),
        }),
      ],
    })
  }

  var items = data ? data.items : []

  // Group by status (solo flujo activo; terminados se consultan directo en Hub)
  var statusOrder = ['in_review', 'in_progress', 'todo', 'shaping', 'backlog', 'staging', 'problem_discovery', 'problem_validation']
  var grouped = {}
  for (var gi = 0; gi < items.length; gi++) {
    var item = items[gi]
    var st = item.status || 'unassigned'
    if (statusOrder.indexOf(st) < 0) continue
    if (!grouped[st]) grouped[st] = []
    grouped[st].push(item)
  }
  var allStatuses = statusOrder.filter(function (s) { return grouped[s] })
  var hasContent = allStatuses.length > 0

  return jsxs('div', {
    children: [
      setupMode ? jsx(SetupView, {
        onClose: function () { setSetupMode(false) },
        onDone: handleTokenDone,
      }) : creating ? jsx(CreateForm, {
        token: hubToken,
        onClose: function () { setCreating(false) },
        onCreated: function () {
          setCreating(false)
          setData(null)
          lastFetch.current = 0
        },
      }) : selectedId ? [
        // Detail view header
        jsx('div', {
          style: { padding: '6px 12px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: 6 },
          children: jsx('button', {
            onClick: function () { setSelectedId(null); setDetail(null) },
            style: { background: 'none', border: 'none', color: '#58a6ff', cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: 0 },
            children: jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_ARROW_LEFT, className: 'size-3 shrink-0' }), ' Volver'] }),
          }),
        }),

        detailLoading &&
          jsx('div', { style: { padding: 20, textAlign: 'center', fontSize: 12, color: '#888' }, children: '⏳ Cargando detalle...' }),

        detail && detail.error &&
          jsx('div', { style: { padding: 14, fontSize: 12, color: '#ef4444' }, children: '❌ ' + detail.error }),

        detail && !detail.error &&
          jsxs('div', { style: { padding: 12 },
            children: [
              // Header
              jsxs('div', {
                style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
                children: [
                  jsx('span', { style: { color: '#58a6ff', fontSize: 13, fontWeight: 600 }, children: detail.code || detail.id }),
                ],
              }),

              // Name
              jsx('div', { style: { fontSize: 14, fontWeight: 600, color: '#ddd', marginBottom: 8, lineHeight: 1.3 }, children: detail.name }),

              // Status
              jsx('div', { style: { marginBottom: 8 },
                children: jsx('span', { style: { fontSize: 10, padding: '2px 8px', borderRadius: 4, backgroundColor: '#333', color: '#aaa', display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: STATUS_ICONS[detail.status] || ICON_DOCUMENT_TEXT, className: 'size-3 shrink-0' }), ' ' + statusLabel(detail.status)] }),
              }),

              // Description (Markdown)
              jsxs('div', { style: { marginBottom: 8 },
                children: [
                  jsxs('div', { style: { fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 },
                    children: [
                      jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_DOCUMENT_TEXT, className: 'size-3 shrink-0' }), ' Descripción'] }),
                      !editingDesc && jsx('button', {
                        onClick: function (e) { e.preventDefault(); e.stopPropagation(); setEditContent(detail.content || ''); setEditingDesc(true) },
                        style: { background: 'none', border: '1px solid #888', borderRadius: 3, color: '#888', fontSize: 9, fontWeight: 600, padding: '1px 6px', cursor: 'pointer' },
                        children: 'Editar',
                      }),
                    ],
                  }),
                  editingDesc
                    ? jsxs('div', { children: [
                        jsx('textarea', {
                          value: editContent,
                          onChange: function (e) { setEditContent(e.target.value) },
                          style: { width: '100%', minHeight: 100, padding: 8, background: '#111', color: '#ccc', border: '1px solid #333', borderRadius: 4, fontSize: 12, outline: 'none', fontFamily: 'monospace', resize: 'vertical' },
                        }),
                        jsxs('div', { style: { display: 'flex', gap: 6, marginTop: 4 },
                          children: [
                            jsx('button', {
                              onClick: function (e) { e.preventDefault(); e.stopPropagation(); saveDescription() },
                              disabled: savingContent,
                              style: { padding: '4px 12px', background: '#3b82f6', border: 'none', borderRadius: 4, color: '#fff', fontSize: 11, fontWeight: 600, cursor: savingContent ? 'default' : 'pointer', opacity: savingContent ? 0.6 : 1 },
                              children: savingContent ? '⏳ Guardando...' : 'Guardar',
                            }),
                            jsx('button', {
                              onClick: function (e) { e.preventDefault(); e.stopPropagation(); setEditingDesc(false) },
                              style: { padding: '4px 12px', background: 'none', border: '1px solid #555', borderRadius: 4, color: '#888', fontSize: 11, cursor: 'pointer' },
                              children: 'Cancelar',
                            }),
                          ],
                        }),
                      ]})
                    : jsx('div', {
                        style: { fontSize: 12, color: '#ccc', lineHeight: 1.7, wordBreak: 'break-word', backgroundColor: '#141414', padding: '10px 12px', borderRadius: 4, border: '1px solid #222', maxHeight: 280, overflowY: 'auto' },
                        dangerouslySetInnerHTML: { __html: mdToHtml(detail.content || '') },
                      }),
                ],
              }),

              // Metadata
              jsxs('div', {
                style: { fontSize: 11, color: '#888', display: 'flex', gap: 10, flexWrap: 'wrap', borderTop: '1px solid #222', paddingTop: 8 },
                children: [
                  detail.owner && jsxs('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_USER, className: 'size-3 shrink-0' }), detail.owner.name || detail.owner.email || '?'] }),
                  detail.due_date && jsx('span', { style: { color: new Date(detail.due_date) < new Date() ? '#ef4444' : '#888', display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_CALENDAR, className: 'size-3 shrink-0' }), ' ' + timeAgo(detail.due_date)] }),
                  detail.updated_at && jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_ARROW_PATH, className: 'size-3 shrink-0' }), ' ' + timeAgo(detail.updated_at)] }),
                ],
              }),

              // ── Comments ──
              jsxs('div', {
                style: { marginTop: 10, borderTop: '1px solid #222', paddingTop: 8 },
                children: [
                  jsx('div', { style: { fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_CHAT_BUBBLE_LEFT, className: 'size-3 shrink-0' }), ' Comentarios (' + (comments ? comments.length : '...') + ')'] }),

                  !comments && !detailLoading &&
                    jsx('div', { style: { fontSize: 11, color: '#666' }, children: 'Cargando comentarios...' }),

                  comments && comments.length === 0 &&
                    jsx('div', { style: { fontSize: 11, color: '#666', marginBottom: 8 }, children: 'Sin comentarios' }),

                  comments && comments.length > 0 &&
                    jsx('div', { style: { marginBottom: 8 },
                      children: comments.map(function (c) {
                        var author = (c.author && (c.author.name || c.author.email)) || (c.user && (c.user.name || c.user.email)) || '?'
                        return jsxs('div', {
                          style: {
                            backgroundColor: '#141414',
                            border: '1px solid #222',
                            borderRadius: 4,
                            padding: '8px 10px',
                            marginBottom: 6,
                          },
                          children: [
                            jsxs('div', {
                              style: { fontSize: 10, color: '#888', marginBottom: 4, display: 'flex', justifyContent: 'space-between' },
                              children: [
                                jsx('span', { children: author }),
                                jsx('span', { children: c.created_at ? timeAgo(c.created_at) : '' }),
                              ],
                            }),
                            jsx('div', {
                              style: { fontSize: 12, color: '#ccc', lineHeight: 1.6, wordBreak: 'break-word' },
                              dangerouslySetInnerHTML: { __html: mdToHtml(c.content || c.text || '') },
                            }),
                          ],
                        }, c.id || c._id)
                      }),
                    }),

                  // Add comment
                  jsxs('div', {
                    style: { display: 'flex', gap: 6, alignItems: 'flex-start' },
                    children: [
                      jsx('textarea', {
                        value: commentText,
                        onChange: function (e) { setCommentText(e.target.value) },
                        placeholder: 'Escribe un comentario...',
                        rows: 2,
                        style: {
                          flex: 1,
                          backgroundColor: '#111',
                          color: '#ddd',
                          border: '1px solid #333',
                          borderRadius: 4,
                          padding: '6px 10px',
                          fontSize: 12,
                          outline: 'none',
                          fontFamily: 'inherit',
                          resize: 'vertical',
                          minHeight: 32,
                        },
                      }),
                      jsx('button', {
                        onClick: handleAddComment,
                        disabled: commenting || !commentText.trim(),
                        style: {
                          backgroundColor: commenting ? '#166' : '#238636',
                          color: 'white',
                          border: 'none',
                          borderRadius: 4,
                          padding: '6px 12px',
                          cursor: commenting ? 'default' : 'pointer',
                          fontSize: 11,
                          fontWeight: 600,
                          opacity: commenting || !commentText.trim() ? 0.5 : 1,
                          whiteSpace: 'nowrap',
                          alignSelf: 'flex-end',
                        },
                        children: commenting ? '⏳' : jsx(Icon, { path: ICON_CHAT_BUBBLE_LEFT, className: 'size-3.5 shrink-0' }),
                      }),
                    ],
                  }),
                ],
              }),

              // Link to Hub
              jsx('a', {
                href: itemUrl(detail),
                target: '_blank', rel: 'noopener noreferrer',
                style: { display: 'block', marginTop: 10, textAlign: 'center', fontSize: 11, color: '#58a6ff', textDecoration: 'none', padding: '6px', borderRadius: 4, backgroundColor: '#0d1117', border: '1px solid #30363d' },
                children: jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'center' }, children: [jsx(Icon, { path: ICON_ARROW_UP_RIGHT, className: 'size-3 shrink-0' }), ' Abrir en Hub — ' + (detail.code || detail.id)] }),
              }),
            ],
          }),
      ] : [
        // Header
        jsxs('div', {
          style: {
            padding: '8px 12px',
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
            jsx('span', { style: { fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_CHECK_BADGE, className: 'size-3.5 shrink-0' }), ' Tracks'] }),
            jsxs('span', {
              style: { display: 'flex', gap: 8 },
              children: [
                jsx('button', {
                  onClick: function () { setCreating(true) },
                  style: {
                    background: 'none',
                    border: '1px solid #555',
                    color: '#3fb950',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '0 8px',
                    borderRadius: 4,
                    lineHeight: '18px',
                  },
                  title: 'Crear track o tarea',
                  children: '+ Nueva',
                }),
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
          ],
        }),

        allStatuses.map(function (status) {
          var isCollapsed = !!collapsed[status]
          return jsxs('div', {
            children: [
              jsx('div', {
                onClick: function () { toggleCollapsed(status) },
                style: {
                  padding: '6px 12px',
                  fontSize: 11,
                  color: '#ddd',
                  fontWeight: 600,
                  borderBottom: '1px solid #222',
                  backgroundColor: '#141414',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  userSelect: 'none',
                },
                children: [
                  jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: STATUS_ICONS[status] || ICON_DOCUMENT_TEXT, className: 'size-3.5 shrink-0' }), ' ' + statusLabel(status) + ' (' + grouped[status].length + ')'] }),
                  jsx('span', { style: { fontSize: 10, color: '#888' }, children: isCollapsed ? '▶' : '▼' }),
                ],
              }),
              !isCollapsed && jsx('div', { children: grouped[status].map(function (item) { return renderItem(item) }) }),
            ],
          }, status)
        }),

        !hasContent &&
          jsx('div', {
            style: { padding: 20, textAlign: 'center', fontSize: 12, color: '#888' },
            children: '✅ No hay work items activos',
          }),
      ],
    ],
  })
}

function ConfigTab({ hubToken, githubToken, webhookUrl, onSave }) {
  var hubRef = useRef(null)
  var ghRef = useRef(null)
  var whRef = useRef(null)
  var prMsgRef = useRef(null)
  var aiProviderRef = useRef(null)
  var aiModelRef = useRef(null)
  var aiPromptRef = useRef(null)

  // Estado del análisis IA (sección Task)
  var _ai = useState(function () { return loadStr(STORAGE_AI_PROVIDER) || '' })
  var aiProvider = _ai[0]
  var setAiProvider = _ai[1]
  var _am = useState(function () { return loadStr(STORAGE_AI_MODEL) || '' })
  var aiModel = _am[0]
  var setAiModel = _am[1]

  function mergeDefaults(saved) {
    var merged = {}
    TRANSITIONS.forEach(function (t) {
      var d = DEFAULT_TRACK_RULES[t.key] || {}
      var s = saved[t.key] || {}
      merged[t.key] = {
        provider: s.provider || d.provider || '',
        model: s.model || d.model || '',
        rules: s.rules || d.rules || '',
        refs: (s.refs && s.refs.length) ? s.refs : (d.refs || []),
      }
    })
    return merged
  }

  var _r = useState(function () { return mergeDefaults(loadTrackRules()) })
  var initialRules = _r[0]

  var _p = useState(function () {
    var init = {}
    TRANSITIONS.forEach(function (t) {
      var c = initialRules[t.key]
      if (c && c.provider) init[t.key] = (c.provider === 'Token Gate') ? 'tokengate' : c.provider
    })
    return init
  })
  var providers = _p[0]
  var setProviders = _p[1]

  var _c = useState({ backlog_to_shaping: true })
  var openCards = _c[0]
  var setOpenCards = _c[1]

  // Referencias URL por transición
  var _rf = useState(function () {
    var init = {}
    TRANSITIONS.forEach(function (t) {
      var c = initialRules[t.key]
      init[t.key] = (c && Array.isArray(c.refs)) ? c.refs.slice() : []
    })
    return init
  })
  var refs = _rf[0]
  var setRefs = _rf[1]

  var _t = useState('tracks')
  var activeTab = _t[0]
  var setActiveTab = _t[1]

  // Catálogo real de proveedores/modelos (model.options del gateway)
  var _cat = useState(null)
  var catalog = _cat[0]
  var setCatalog = _cat[1]

  useEffect(function () {
    host.request('model.options', { explicit_only: true })
      .then(function (data) {
        if (data && Array.isArray(data.providers)) setCatalog(data)
      })
      .catch(function () {})
  }, [])

  var ruleRefs = {}
  var modelRefs = {}
  TRANSITIONS.forEach(function (t) {
    ruleRefs[t.key] = useRef(null)
    modelRefs[t.key] = useRef(null)
  })

  function handleSaveRules() {
    var rules = {}
    TRANSITIONS.forEach(function (t) {
      rules[t.key] = {
        rules: (ruleRefs[t.key].current && ruleRefs[t.key].current.value) || '',
        provider: providers[t.key] || '',
        model: (modelRefs[t.key].current && modelRefs[t.key].current.value) || '',
        refs: (refs[t.key] || []).map(function (r) { return (r || '').trim() }).filter(Boolean),
      }
    })
    saveTrackRules(rules)
    host.notify('✅ Reglas guardadas')
  }

  function handleSaveHubToken() {
    var hub = (hubRef.current && hubRef.current.value) || loadStr(STORAGE_HUB_TOKEN) || ''
    var gh = loadStr(STORAGE_GITHUB_TOKEN) || ''
    var wh = loadStr(STORAGE_WEBHOOK_URL) || ''
    onSave(hub, gh, wh)
    host.notify('✅ Token de Hub guardado')
  }

  function handleSavePRMessage() {
    var val = (prMsgRef.current && prMsgRef.current.value) || ''
    saveStr(STORAGE_PR_MESSAGE, val.trim())
    host.notify(val.trim() ? '✅ Mensaje de Google Chat guardado' : '✅ Mensaje restablecido al predeterminado')
  }

  function handleSaveAI() {
    var prov = aiProviderRef.current && aiProviderRef.current.value
    var model = aiModelRef.current && aiModelRef.current.value
    var prompt = aiPromptRef.current && aiPromptRef.current.value
    if (!prov || !model) {
      host.notifyError('❌ Selecciona proveedor y modelo del análisis')
      return
    }
    saveStr(STORAGE_AI_PROVIDER, prov)
    saveStr(STORAGE_AI_MODEL, model)
    saveStr(STORAGE_AI_PROMPT, (prompt || '').trim() ? prompt.trim() : AI_PROMPT_DEFAULT)
    // Escribe la task auxiliar analysis_tickets para que llm.oneshot use proveedor/modelo
    // (config.set del gateway NO acepta auxiliary.*; se usa cli.exec como provider-switch)
    var argv = [
      ['config', 'set', 'auxiliary.analysis_tickets.provider', prov],
      ['config', 'set', 'auxiliary.analysis_tickets.model', model],
    ]
    argv.reduce(function (p, a) {
      return p.then(function () {
        return host.request('cli.exec', { argv: a }).catch(function (err) {
          host.logs('warn', 'gobravo-workflow', 'setAIaux', String(err).slice(0, 100))
        })
      })
    }, Promise.resolve())
    host.notify('✅ Análisis IA guardado (' + prov + ' / ' + model + ')')
  }

  function restoreAIPrompt() {
    if (aiPromptRef.current) aiPromptRef.current.value = AI_PROMPT_DEFAULT
    host.notify('↺ Prompt de análisis restablecido al predeterminado')
  }

  function handleSavePRCreds() {
    var hub = loadStr(STORAGE_HUB_TOKEN) || ''
    var gh = (ghRef.current && ghRef.current.value) || loadStr(STORAGE_GITHUB_TOKEN) || ''
    var wh = (whRef.current && whRef.current.value) || loadStr(STORAGE_WEBHOOK_URL) || ''
    onSave(hub, gh, wh)
    host.notify('✅ Credenciales de PRs guardadas')
  }

  function toggleCard(key) {
    var next = Object.assign({}, openCards)
    next[key] = !openCards[key]
    setOpenCards(next)
  }

  function updateRef(t, i, val) {
    var next = Object.assign({}, refs)
    var arr = (next[t.key] || []).slice()
    arr[i] = val
    next[t.key] = arr
    setRefs(next)
  }

  function addRef(t) {
    var next = Object.assign({}, refs)
    var arr = (next[t.key] || []).slice()
    arr.push('')
    next[t.key] = arr
    setRefs(next)
  }

  function removeRef(t, i) {
    var next = Object.assign({}, refs)
    var arr = (next[t.key] || []).slice()
    arr.splice(i, 1)
    next[t.key] = arr
    setRefs(next)
  }

  function modelsForProvider(provider) {
    if (provider && catalog && Array.isArray(catalog.providers)) {
      for (var i = 0; i < catalog.providers.length; i++) {
        if (catalog.providers[i].slug === provider) {
          var ms = catalog.providers[i].models
          if (Array.isArray(ms) && ms.length) return ms
          break
        }
      }
    }
    return (MODEL_OPTIONS[provider] || []).slice()
  }

  // Campo de modelo del análisis IA (dropdown dinámico según proveedor)
  function aiModelField() {
    var models = modelsForProvider(aiProvider)
    if (models.length) {
      return jsx('select', {
        ref: aiModelRef,
        defaultValue: aiModel,
        style: Object.assign({}, inputStyle, { fontSize: 11, cursor: 'pointer' }),
        children: [
          jsx('option', { value: '', children: 'Selecciona modelo…' }),
          models.map(function (m) { return jsx('option', { value: m, children: m }, m) }),
        ],
      }, aiProvider || 'none')
    }
    return jsx('input', {
      ref: aiModelRef,
      type: 'text',
      defaultValue: aiModel,
      placeholder: aiProvider === 'openrouter' ? 'ej: anthropic/claude-sonnet-4' : 'Escribe el modelo manualmente…',
      style: Object.assign({}, inputStyle, { fontSize: 11 }),
    }, aiProvider || 'none')
  }

  function modelField(t) {
    var provider = providers[t.key] || ''
    var saved = (initialRules[t.key] || {}).model || ''
    var models = modelsForProvider(provider)
    if (models.length) {
      return jsx('select', {
        ref: modelRefs[t.key],
        defaultValue: saved,
        style: Object.assign({}, inputStyle, { fontSize: 11, cursor: 'pointer' }),
        children: [
          jsx('option', { value: '', children: 'Selecciona modelo…' }),
          models.map(function (m) { return jsx('option', { value: m, children: m }, m) }),
        ],
      }, provider || 'none')
    }
    return jsx('input', {
      ref: modelRefs[t.key],
      type: 'text',
      defaultValue: saved,
      placeholder: provider === 'openrouter' ? 'ej: anthropic/claude-sonnet-4' : 'Escribe el modelo manualmente…',
      style: Object.assign({}, inputStyle, { fontSize: 11 }),
    }, provider || 'none')
  }

  function trackCard(t) {
    var open = !!openCards[t.key]
    var saved = initialRules[t.key] || {}
    return jsxs('div', {
      style: { border: '1px solid #333', borderRadius: 6, marginBottom: 8, overflow: 'hidden' },
      children: [
        jsxs('div', {
          onClick: function () { toggleCard(t.key) },
          style: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', cursor: 'pointer', backgroundColor: '#161b22', userSelect: 'none' },
          children: [
            jsx('span', { style: { fontSize: 11, fontWeight: 600, color: '#ddd' }, children: t.from }),
            jsx('span', { style: { display: 'inline-flex', color: '#3fb950' }, children: jsx(Icon, { path: ICON_ARROW_RIGHT, className: 'size-3.5 shrink-0' }) }),
            jsx('span', { style: { fontSize: 11, fontWeight: 600, color: '#ddd' }, children: t.to }),
            jsx('span', { style: { fontSize: 10, color: '#666', whiteSpace: 'nowrap' }, children: t.subtitle }),
            jsx('span', { style: { marginLeft: 'auto', fontSize: 10, color: '#888' }, children: open ? '▾' : '▸' }),
          ],
        }),
        open && jsxs('div', {
          style: { padding: '8px 10px', borderTop: '1px solid #222' },
          children: [
            jsx('label', { style: { fontSize: 10, color: '#888', display: 'block', marginBottom: 3 }, children: 'Reglas' }),
            jsx('textarea', {
              ref: ruleRefs[t.key],
              defaultValue: saved.rules || '',
              placeholder: 'Instrucciones extra para el análisis en esta transición…',
              style: { width: '100%', boxSizing: 'border-box', backgroundColor: '#111', color: '#ddd', border: '1px solid #333', borderRadius: 4, padding: '6px 10px', fontSize: 11, minHeight: 52, outline: 'none', resize: 'vertical', fontFamily: 'inherit' },
            }),
            jsxs('div', { style: { display: 'flex', gap: 6, marginTop: 6 }, children: [
              jsxs('div', { style: { flex: 1 }, children: [
                jsx('label', { style: { fontSize: 10, color: '#888', display: 'block', marginBottom: 3 }, children: 'Proveedor' }),
                jsx('select', {
                  value: providers[t.key] || '',
                  onChange: function (e) {
                    var next = Object.assign({}, providers)
                    next[t.key] = e.target.value
                    setProviders(next)
                  },
                  style: Object.assign({}, inputStyle, { fontSize: 11, cursor: 'pointer' }),
                  children: [
                    jsx('option', { value: '', children: 'Selecciona…' }),
                    (catalog && Array.isArray(catalog.providers) && catalog.providers.length
                      ? catalog.providers
                      : [{ slug: 'tokengate' }, { slug: 'deepseek' }, { slug: 'openrouter' }]
                    ).map(function (p) {
                      return jsx('option', { value: p.slug, children: p.name || p.slug }, p.slug)
                    }),
                  ],
                }),
              ]}),
              jsxs('div', { style: { flex: 1 }, children: [
                jsx('label', { style: { fontSize: 10, color: '#888', display: 'block', marginBottom: 3 }, children: 'Modelo' }),
                modelField(t),
              ]}),
            ]}),
            // Referencias URL
            jsx('div', { style: { marginTop: 8 }, children: jsxs('div', { children: [
                jsx('label', { style: { fontSize: 10, color: '#888', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }, children: [jsx(Icon, { path: ICON_LINK, className: 'size-3 shrink-0' }), ' Referencias (URLs — opcional)'] }),
                (refs[t.key] || []).map(function (url, i) {
                  return jsxs('div', { style: { display: 'flex', gap: 4, marginBottom: 4 }, children: [
                    jsx('input', {
                      type: 'text',
                      value: url,
                      onChange: function (e) { updateRef(t, i, e.target.value) },
                      placeholder: 'https://guia-de-estilos.github.io/…',
                      style: Object.assign({}, inputStyle, { fontSize: 11, flex: 1 }),
                    }),
                    jsx('button', {
                      onClick: function () { removeRef(t, i) },
                      title: 'Quitar referencia',
                      style: { background: 'none', border: '1px solid #555', color: '#888', borderRadius: 4, padding: '2px 7px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' },
                      children: jsx(Icon, { path: ICON_X_MARK, className: 'size-3 shrink-0' }),
                    }),
                  ] }, t.key + '-ref-' + i)
                }),
                jsx('button', {
                  onClick: function () { addRef(t) },
                  style: { background: 'none', border: '1px solid #333', color: '#58a6ff', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 },
                  children: [jsx(Icon, { path: ICON_PLUS, className: 'size-3 shrink-0' }), ' Agregar URL'],
                }),
              ]})}),
          ],
        }),
      ],
    }, t.key)
  }

  return jsxs('div', {
    style: { padding: 14 },
    children: [
      jsx('div', { style: { fontSize: 12, fontWeight: 600, color: '#ddd', marginBottom: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [jsx(Icon, { path: ICON_COG_8_TOOTH, className: 'size-3.5 shrink-0' }), ' Configuración'] }),
      // Pills: APIs / Tracks / PRs (próximamente)
      jsxs('div', { style: { display: 'flex', gap: 6, marginBottom: 14 }, children: [
          jsx('div', { onClick: function () { setActiveTab('tracks') }, style: { padding: '4px 14px', borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, backgroundColor: activeTab === 'tracks' ? '#238636' : '#1c1c1c', color: activeTab === 'tracks' ? '#fff' : '#8b949e' }, children: [jsx(Icon, { path: ICON_CHECK_BADGE, className: 'size-3 shrink-0' }), ' Tracks'] }),
        jsx('div', { onClick: function () { setActiveTab('prs') }, style: { padding: '4px 14px', borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, backgroundColor: activeTab === 'prs' ? '#238636' : '#1c1c1c', color: activeTab === 'prs' ? '#fff' : '#8b949e' }, children: [jsx(Icon, { path: ICON_MAGNIFYING_GLASS, className: 'size-3 shrink-0' }), ' PRs'] }),
        jsx('div', { onClick: function () { setActiveTab('task') }, style: { padding: '4px 14px', borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, backgroundColor: activeTab === 'task' ? '#238636' : '#1c1c1c', color: activeTab === 'task' ? '#fff' : '#8b949e' }, children: [jsx(Icon, { path: ICON_CLIPBOARD_DOCUMENT_LIST, className: 'size-3 shrink-0' }), ' Task'] }),
      ]}),
      activeTab === 'tracks' && jsxs('div', { children: [
      // Reglas de análisis por transición de estado
      jsxs('div', { style: { marginTop: 4, marginBottom: 12 }, children: [
        jsx('div', { style: { fontSize: 11, fontWeight: 600, color: '#ddd', marginBottom: 8 }, children: 'Reglas de análisis por transición' }),
        TRANSITIONS.map(function (t) { return trackCard(t) }),
      ]}),
      jsx('div', { style: { display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }, children: jsx('button', {
        onClick: handleSaveRules,
        style: { backgroundColor: '#238636', color: 'white', border: 'none', borderRadius: 3, padding: '1px 8px', cursor: 'pointer', fontSize: 9, fontWeight: 600, lineHeight: '14px' },
        children: 'Guardar reglas',
      })}),
      jsx('div', { style: { borderTop: '1px solid #2a2a2a', margin: '14px 0 12px' } }),
      jsx('div', { style: { fontSize: 11, fontWeight: 600, color: '#ddd', marginBottom: 8 }, children: 'Credenciales' }),
      // Hub API Token
      jsxs('div', { style: { marginBottom: 10 },
        children: [
          jsx('label', { style: { fontSize: 10, color: '#888', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }, children: [jsx(Icon, { path: ICON_KEY, className: 'size-3 shrink-0' }), ' Hub API Token'] }),
          jsx('input', {
            ref: hubRef,
            type: 'password',
            defaultValue: hubToken,
            placeholder: 'hub_xxxxxxxxxxxxxxxx',
            style: inputStyle,
            onKeyDown: function (e) { if (e.key === 'Enter') handleSaveHubToken() },
          }),
        ],
      }),
      jsx('div', { style: { display: 'flex', justifyContent: 'flex-end' }, children: jsx('button', {
        onClick: handleSaveHubToken,
        style: { backgroundColor: '#238636', color: 'white', border: 'none', borderRadius: 3, padding: '1px 8px', cursor: 'pointer', fontSize: 9, fontWeight: 600, lineHeight: '14px' },
        children: 'Guardar token',
      })}),
      ]}),
      activeTab === 'prs' && jsxs('div', { children: [
        jsx('div', { style: { fontSize: 11, fontWeight: 600, color: '#ddd', marginBottom: 8 }, children: 'Mensaje para Google Chat' }),
        jsx('textarea', {
          ref: prMsgRef,
          defaultValue: loadStr(STORAGE_PR_MESSAGE) || PR_MESSAGE_DEFAULT,
          placeholder: PR_MESSAGE_DEFAULT,
          style: { width: '100%', boxSizing: 'border-box', backgroundColor: '#111', color: '#ddd', border: '1px solid #333', borderRadius: 4, padding: '6px 10px', fontSize: 11, minHeight: 80, outline: 'none', resize: 'vertical', fontFamily: 'inherit', marginBottom: 6 },
        }),
        jsx('div', { style: { fontSize: 10, color: '#888', marginBottom: 10, lineHeight: 1.5 }, children: 'Variables: {title} · {url} · {number} · {repo} — se reemplazan al enviar el aviso. Si dejas el campo vacío se usa el mensaje predeterminado.' }),
        jsx('div', { style: { display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }, children: jsx('button', {
          onClick: handleSavePRMessage,
          style: { backgroundColor: '#238636', color: 'white', border: 'none', borderRadius: 3, padding: '1px 8px', cursor: 'pointer', fontSize: 9, fontWeight: 600, lineHeight: '14px' },
          children: 'Guardar mensaje',
        })}),
        jsx('div', { style: { borderTop: '1px solid #2a2a2a', margin: '14px 0 12px' } }),
        jsx('div', { style: { fontSize: 11, fontWeight: 600, color: '#ddd', marginBottom: 8 }, children: 'Credenciales' }),
        // GitHub Token
        jsxs('div', { style: { marginBottom: 10 },
          children: [
            jsx('label', { style: { fontSize: 10, color: '#888', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }, children: [jsx(Icon, { path: ICON_KEY, className: 'size-3 shrink-0' }), ' GitHub Token'] }),
            jsx('input', {
              ref: ghRef,
              type: 'password',
              defaultValue: githubToken,
              placeholder: '«redacted:ghp_…»',
              style: inputStyle,
              onKeyDown: function (e) { if (e.key === 'Enter') handleSavePRCreds() },
            }),
          ],
        }),
        // Webhook URL
        jsxs('div', { style: { marginBottom: 10 },
          children: [
            jsx('label', { style: { fontSize: 10, color: '#888', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }, children: [jsx(Icon, { path: ICON_LINK, className: 'size-3 shrink-0' }), ' Webhook URL (opcional — notificaciones de PR)'] }),
            jsx('input', {
              ref: whRef,
              type: 'text',
              defaultValue: webhookUrl,
              placeholder: 'https://hooks.example.com/...',
              style: inputStyle,
              onKeyDown: function (e) { if (e.key === 'Enter') handleSavePRCreds() },
            }),
          ],
        }),
        jsx('div', { style: { display: 'flex', justifyContent: 'flex-end' }, children: jsx('button', {
          onClick: handleSavePRCreds,
          style: { backgroundColor: '#238636', color: 'white', border: 'none', borderRadius: 3, padding: '1px 8px', cursor: 'pointer', fontSize: 9, fontWeight: 600, lineHeight: '14px' },
          children: 'Guardar credenciales',
        })}),
      ]}),
      activeTab === 'task' && jsxs('div', { children: [
        jsx(SquadPickerView, {
          token: hubToken,
          selected: loadSelectedSquads(),
          onSave: function () { host.notify('✅ Equipos guardados') },
          onClose: function () {},
          embedded: true,
        }),
        jsx('div', { style: { fontSize: 10, color: '#888', marginTop: 8, marginBottom: 14, lineHeight: 1.5 }, children: 'Estos equipos se usan para filtrar la búsqueda en la pestaña de tickets.' }),
        // ── Análisis IA ─────────────────────────────────────────────
        jsx('div', { style: { borderTop: '1px solid #2a2a2a', margin: '10px 0 12px' } }),
        jsx('div', { style: { fontSize: 12, fontWeight: 600, color: '#ddd', marginBottom: 4, display: 'inline-flex', alignItems: 'center', gap: 6 }, children: [jsx(Icon, { path: ICON_SPARKLES, className: 'size-3.5 shrink-0' }), ' Análisis IA de tickets'] }),
        jsx('div', { style: { fontSize: 10, color: '#888', marginBottom: 10, lineHeight: 1.4 }, children: 'Modelo que genera el diagnóstico al pulsar el badge ✳ IA en la pestaña de tickets, y prompt personalizable.' }),
        // Proveedor
        jsxs('div', { style: { marginBottom: 10 },
          children: [
            jsx('label', { style: { fontSize: 10, color: '#888', display: 'block', marginBottom: 3 }, children: 'Proveedor' }),
            jsx('select', {
              ref: aiProviderRef,
              defaultValue: aiProvider,
              style: Object.assign({}, inputStyle, { fontSize: 11, cursor: 'pointer' }),
              onChange: function (e) { setAiProvider(e.target.value) },
              children: [
                jsx('option', { value: '', children: 'Selecciona proveedor…' }),
                (catalog && Array.isArray(catalog.providers) && catalog.providers.length
                  ? catalog.providers
                  : [{ slug: 'tokengate' }, { slug: 'deepseek' }]
                ).map(function (p) {
                  return jsx('option', { value: p.slug, children: p.name || p.slug }, p.slug)
                }),
              ],
            }),
          ],
        }),
        // Modelo (dinámico según proveedor)
        jsxs('div', { style: { marginBottom: 10 },
          children: [
            jsx('label', { style: { fontSize: 10, color: '#888', display: 'block', marginBottom: 3 }, children: 'Modelo' }),
            // key=aiProvider fuerza el re-montaje del campo al cambiar proveedor
            jsx('span', { key: aiProvider || 'none', className: 'ai-model-field', children: aiModelField() }),
          ],
        }),
        // Prompt (editable)
        jsxs('div', { style: { marginBottom: 10 },
          children: [
            jsx('label', { style: { fontSize: 10, color: '#888', display: 'block', marginBottom: 3 }, children: 'Prompt del análisis (editable)' }),
            jsx('textarea', {
              ref: aiPromptRef,
              defaultValue: loadStr(STORAGE_AI_PROMPT) || AI_PROMPT_DEFAULT,
              style: { width: '100%', boxSizing: 'border-box', backgroundColor: '#111', color: '#ddd', border: '1px solid #333', borderRadius: 4, padding: '6px 10px', fontSize: 11, minHeight: 160, outline: 'none', resize: 'vertical', fontFamily: 'inherit' },
            }),
            jsx('div', { style: { fontSize: 10, color: '#58a6ff', marginTop: 4 }, children: 'Variable {N} = cantidad de tickets. Se sustituye automáticamente al ejecutar.' }),
          ],
        }),
        jsxs('div', { style: { display: 'flex', gap: 6, justifyContent: 'flex-end' }, children: [
          jsx('button', {
            onClick: restoreAIPrompt,
            style: { background: 'none', border: '1px solid #333', color: '#8b949e', borderRadius: 3, padding: '1px 8px', cursor: 'pointer', fontSize: 9, lineHeight: '14px', fontWeight: 600 },
            children: '↺ Restaurar prompt',
          }),
          jsx('button', {
            onClick: handleSaveAI,
            style: { backgroundColor: '#238636', color: 'white', border: 'none', borderRadius: 3, padding: '1px 8px', cursor: 'pointer', fontSize: 9, fontWeight: 600, lineHeight: '14px' },
            children: 'Guardar análisis IA',
          }),
        ]}),
      ]}),
    ],
  })
}

var inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  backgroundColor: '#111',
  color: '#ddd',
  border: '1px solid #333',
  borderRadius: 4,
  padding: '6px 10px',
  fontSize: 12,
  outline: 'none',
}

// (DEFAULT_TRACK_RULES se define en constants.js — disponible globalmente)

// Transiciones de estado configurables (cards colapsables)
var TRANSITIONS = [
  { key: 'backlog_to_shaping', from: 'Backlog', to: 'Shaping', subtitle: 'Análisis de alto nivel' },
  { key: 'shaping_to_todo', from: 'Shaping', to: 'Todo', subtitle: 'Análisis profundo + crear tasks' },
  { key: 'todo_to_in_progress', from: 'Todo', to: 'In Progress', subtitle: 'Ejecución del track' },
  { key: 'in_progress_to_review', from: 'In Progress', to: 'Review', subtitle: 'Cierre y validación final' },
]

var MODEL_OPTIONS = {
  tokengate: ['coder', 'coder-sr', 'coder-jr', 'auxiliar'],
  deepseek: ['deepseek-v4-flash', 'deepseek-reasoner'],
}

// ── Placeholder tabs ───────────────────────────────────────────────

function PlaceholderTab({ name }) {
  return jsx('div', {
    style: { padding: 40, textAlign: 'center', color: '#555', fontSize: 13 },
    children: jsx('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'center' }, children: [jsx(Icon, { path: ICON_ARROW_PATH, className: 'size-3.5 shrink-0' }), ' ' + name + ' — próximamente'] }),
  })
}

// ── Format helpers ─────────────────────────────────────────────────

