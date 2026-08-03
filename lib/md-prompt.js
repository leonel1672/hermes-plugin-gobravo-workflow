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
