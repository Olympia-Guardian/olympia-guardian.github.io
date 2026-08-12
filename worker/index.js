// Salons de synchro OGS Collect — GET/POST /room/:id sur D1.
// Le document ne contient que le roster du groupe ({ v: 1, roster: { ids, t } }).
// L'ID du salon (UUID choisi par l'app) fait office de secret du groupe.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const MAX_DOC_BYTES = 16_384
const MAX_MEMBERS = 100

function response(body, status = 200, extra = {}) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS, ...extra },
  })
}

/** Valide strictement le document de salon (infra publique → zéro confiance). */
function sanitize(raw) {
  let doc
  try {
    doc = JSON.parse(raw)
  } catch {
    return null
  }
  if (!doc || doc.v !== 1 || typeof doc.roster !== 'object' || doc.roster === null) return null
  const ids = Array.isArray(doc.roster.ids) ? doc.roster.ids : null
  const t = doc.roster.t
  if (!ids || ids.length > MAX_MEMBERS || typeof t !== 'number' || !Number.isFinite(t)) return null
  if (!ids.every((n) => Number.isInteger(n) && n > 0 && n < 1e12)) return null
  return JSON.stringify({ v: 1, roster: { ids, t } })
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

    const url = new URL(req.url)
    const match = url.pathname.match(/^\/room\/(ogs-[\w-]{10,80})$/)
    if (!match) return response('{"error":"not found"}', 404)
    const id = match[1]

    if (req.method === 'GET') {
      const row = await env.DB.prepare('SELECT doc FROM rooms WHERE id = ?1').bind(id).first()
      if (!row) return response('{"error":"no such room"}', 404)
      return response(row.doc)
    }

    if (req.method === 'POST') {
      const raw = await req.text()
      if (raw.length > MAX_DOC_BYTES) return response('{"error":"too large"}', 413)
      const doc = sanitize(raw)
      if (!doc) return response('{"error":"invalid document"}', 422)
      await env.DB.prepare(
        'INSERT INTO rooms (id, doc, updated) VALUES (?1, ?2, ?3) ' +
          'ON CONFLICT(id) DO UPDATE SET doc = ?2, updated = ?3',
      )
        .bind(id, doc, Date.now())
        .run()
      return response(doc)
    }

    return response('{"error":"method not allowed"}', 405)
  },
}
