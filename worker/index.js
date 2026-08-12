// Worker OGS Collect : salons de synchro + service de personnages.
//
// Personnages : lus directement sur le Lodestone (profil + montures +
// mascottes, user-agent mobile → les noms sont dans le HTML), mis en cache en
// D1 (1 h). Les onze autres collections (cartes, mode, tenues, armoire,
// bardes, émotes, portraits, orchestrion, magie bleue, reliques) sont
// invisibles du Lodestone : elles sont amorcées UNE FOIS depuis FFXIV Collect
// puis vivent chez nous, modifiables depuis « Ma Page ».

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
}

const LODESTONE = 'https://eu.finalfantasyxiv.com/lodestone'
const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 4.0.4; Galaxy Nexus Build/IMM76B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/46.0.2490.76 Mobile Safari/537.36'
const CATALOG_BASE = 'https://olympia-guardian.github.io/data/'
const COLLECT_API = 'https://ffxivcollect.com/api'

const CHAR_TTL = 3_600_000 // 1 h
// Seules les montures et les mascottes sont lisibles sur le Lodestone : tout le
// reste se coche dans « Ma Page ». Copie de KINDS/HIDDEN_KINDS (src/api.ts) —
// les deux listes doivent rester synchronisées.
const ALL_KINDS = [
  'mounts',
  'minions',
  'cards',
  'fashions',
  'facewear',
  'hairstyles',
  'outfits',
  'armoires',
  'bardings',
  'emotes',
  'frames',
  'orchestrions',
  'spells',
]
const HIDDEN_KINDS = ALL_KINDS.filter((k) => k !== 'mounts' && k !== 'minions')
const MAX_DOC_BYTES = 16_384
const MAX_MEMBERS = 100

// ---------------------------------------------------------------- catalogues

// Cache par isolate : nameEn (normalisé) → id, + totaux par collection.
let catalogCache = null
let catalogAt = 0

function norm(s) {
  return s.normalize('NFKD').replace(/’/g, "'").trim().toLowerCase()
}

async function catalogs() {
  if (catalogCache && Date.now() - catalogAt < 6 * 3_600_000) return catalogCache
  const maps = {}
  const totals = {}
  for (const kind of ALL_KINDS) {
    const res = await fetch(`${CATALOG_BASE}${kind}.json`)
    // Un catalogue absent (déploiement en cours) ne doit pas priver tout le
    // monde de sa fiche : on le compte à 0 et on continue.
    if (!res.ok) {
      totals[kind] = 0
      continue
    }
    const items = await res.json()
    totals[kind] = items.length
    if (kind === 'mounts' || kind === 'minions') {
      maps[kind] = new Map(items.map((it) => [norm(it.nameEn), it.id]))
    }
  }
  if (!maps.mounts || !maps.minions) throw new Error('catalogues montures/mascottes indisponibles')
  const relics = await fetch(`${CATALOG_BASE}relics.json`)
  totals.relics = relics.ok ? (await relics.json()).relics.length : 0
  catalogCache = { maps, totals }
  catalogAt = Date.now()
  return catalogCache
}

// ----------------------------------------------------------------- lodestone

async function lodestoneGet(path) {
  const res = await fetch(`${LODESTONE}${path}`, {
    headers: { 'User-Agent': MOBILE_UA, 'Accept-Language': 'en' },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Lodestone ${res.status}`)
  return res.text()
}

function extract(html, regex) {
  const m = html.match(regex)
  return m ? m[1].trim() : null
}

function extractAll(html, regex) {
  return [...html.matchAll(regex)].map((m) => m[1].trim())
}

function decodeEntities(s) {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

async function scrapeCharacter(id) {
  const profile = await lodestoneGet(`/character/${id}/`)
  if (profile === null) return null

  const name = decodeEntities(extract(profile, /class="frame__chara__name">([^<]+)</) ?? '')
  const world =
    extract(profile, /class="frame__chara__world">(?:<[^>]+><\/[^>]+>)?([^<]+)</) ?? ''
  const server = world.trim().match(/^\w+/)?.[0] ?? ''
  const dc = world.match(/\[(\w+)\]/)?.[1] ?? ''
  const avatar = extract(profile, /class="frame__chara__face"[^>]*>\s*<img src="([^"]+)"/) ?? ''
  const portrait =
    extract(profile, /class="character__detail__image"[^>]*>\s*<a[^>]*>\s*<img src="([^"]+)"/) ??
    extract(profile, /class="js__image_popup[^"]*"[^>]*>\s*<img src="([^"]+)"/) ??
    ''

  const [mountHtml, minionHtml] = await Promise.all([
    lodestoneGet(`/character/${id}/mount/`),
    lodestoneGet(`/character/${id}/minion/`),
  ])
  const { maps } = await catalogs()

  const mapNames = (html, cls, map) => {
    if (!html) return { ids: [], isPublic: true }
    const names = extractAll(html, new RegExp(`class="${cls}__name">([^<]+)<`, 'g'))
    if (names.length === 0) return { ids: [], isPublic: false }
    const ids = []
    for (const raw of names) {
      const found = map.get(norm(decodeEntities(raw)))
      if (found !== undefined) ids.push(found)
    }
    return { ids, isPublic: true }
  }

  const mounts = mapNames(mountHtml, 'mount', maps.mounts)
  const minions = mapNames(minionHtml, 'minion', maps.minions)

  return { id, name, server, dc, avatar, portrait, mounts, minions }
}

// ------------------------------------------------- amorçage FFXIV Collect

// Le WAF de FFXIV Collect bloque les requêtes venant des workers (403) : c'est
// donc le NAVIGATEUR qui fait l'amorçage (POST /character/:id/seed) — une
// seule fois par perso, puis les données vivent chez nous. Ici on ne pose que
// des placeholders « empty », remplaçables par un seed ; « seed »/« user » ne
// sont jamais écrasés.
async function seedPlaceholders(env, id) {
  const now = Date.now()
  const stmt = env.DB.prepare(
    'INSERT OR IGNORE INTO collections (char_id, kind, ids, updated, source) ' +
      "VALUES (?1, ?2, '[]', ?3, 'empty')",
  )
  await env.DB.batch([...HIDDEN_KINDS, 'relics'].map((k) => stmt.bind(id, k, now)))
}

function validIds(v, max) {
  return (
    Array.isArray(v) &&
    v.length <= max &&
    v.every((n) => Number.isInteger(n) && n > 0 && n < 1e9)
  )
}

async function applySeed(env, id, raw) {
  let doc
  try {
    doc = JSON.parse(raw)
  } catch {
    return false
  }
  if (!doc || typeof doc !== 'object') return false
  const rows = []
  const now = Date.now()
  for (const kind of [...HIDDEN_KINDS, 'relics']) {
    const ids = doc[kind]
    if (ids === undefined) continue
    if (!validIds(ids, 6000)) return false
    rows.push([id, kind, JSON.stringify([...new Set(ids)]), now])
  }
  if (rows.length === 0) return false
  const stmt = env.DB.prepare(
    'INSERT INTO collections (char_id, kind, ids, updated, source) VALUES (?1, ?2, ?3, ?4, ?5) ' +
      "ON CONFLICT(char_id, kind) DO UPDATE SET ids=?3, updated=?4, source=?5 WHERE collections.source = 'empty'",
  )
  await env.DB.batch(rows.map((r) => stmt.bind(...r, 'seed')))
  return true
}

// -------------------------------------------------------------- personnages

async function getCharacter(env, id, force) {
  const row = await env.DB.prepare('SELECT * FROM characters WHERE id = ?1').bind(id).first()
  const fresh = row && Date.now() - row.updated < CHAR_TTL

  if (!fresh || force) {
    const scraped = await scrapeCharacter(id)
    if (!scraped && !row) return null
    if (scraped) {
      await env.DB.prepare(
        'INSERT INTO characters (id, name, server, dc, avatar, portrait, public_mounts, public_minions, updated) ' +
          'VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) ' +
          'ON CONFLICT(id) DO UPDATE SET name=?2, server=?3, dc=?4, avatar=?5, portrait=?6, public_mounts=?7, public_minions=?8, updated=?9',
      )
        .bind(
          id,
          scraped.name,
          scraped.server,
          scraped.dc,
          scraped.avatar,
          scraped.portrait,
          scraped.mounts.isPublic ? 1 : 0,
          scraped.minions.isPublic ? 1 : 0,
          Date.now(),
        )
        .run()
      const now = Date.now()
      const up = env.DB.prepare(
        'INSERT INTO collections (char_id, kind, ids, updated, source) VALUES (?1, ?2, ?3, ?4, ?5) ' +
          'ON CONFLICT(char_id, kind) DO UPDATE SET ids=?3, updated=?4, source=?5',
      )
      await env.DB.batch([
        up.bind(id, 'mounts', JSON.stringify(scraped.mounts.ids), now, 'lodestone'),
        up.bind(id, 'minions', JSON.stringify(scraped.minions.ids), now, 'lodestone'),
      ])
      await seedPlaceholders(env, id)
    }
  }

  const char = await env.DB.prepare('SELECT * FROM characters WHERE id = ?1').bind(id).first()
  if (!char) return null
  const colRows = await env.DB.prepare(
    'SELECT kind, ids, source FROM collections WHERE char_id = ?1',
  )
    .bind(id)
    .all()
  const byKind = Object.fromEntries(colRows.results.map((r) => [r.kind, JSON.parse(r.ids)]))
  const needsSeed = colRows.results.some((r) => r.source === 'empty')
  const { totals } = await catalogs()

  const block = (kind, isPublic = true) => ({
    count: (byKind[kind] ?? []).length,
    total: totals[kind] ?? 0,
    public: isPublic,
    ids: byKind[kind] ?? [],
  })

  return {
    id: char.id,
    name: char.name,
    server: char.server,
    data_center: char.dc,
    avatar: char.avatar,
    portrait: char.portrait,
    last_parsed: new Date(char.updated).toISOString(),
    mounts: block('mounts', !!char.public_mounts),
    minions: block('minions', !!char.public_minions),
    ...Object.fromEntries(HIDDEN_KINDS.map((k) => [k, block(k)])),
    relicIds: byKind.relics ?? [],
    needsSeed,
  }
}

// ------------------------------------------------------------------- comptes

const DISCORD_AUTH = 'https://discord.com/oauth2/authorize'
const DISCORD_TOKEN = 'https://discord.com/api/oauth2/token'
const DISCORD_ME = 'https://discord.com/api/users/@me'
const TOKEN_TTL = 90 * 24 * 3_600_000 // 90 jours

function b64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

async function hmac(env, data) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.DISCORD_CLIENT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)))
}

async function signState(env, payload) {
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)))
  return `${body}.${await hmac(env, body)}`
}

async function verifyState(env, state) {
  const [body, sig] = String(state).split('.')
  if (!body || !sig || (await hmac(env, body)) !== sig) return null
  try {
    const payload = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')))
    if (payload.x < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return b64url(bytes)
}

const CALLBACK = 'https://ogs-room.olympia-guardian.workers.dev/auth/discord/callback'

async function authDiscordStart(env, url) {
  const ret = url.searchParams.get('return') ?? env.APP_URL
  if (!ret.startsWith(env.APP_URL) && !ret.startsWith('http://localhost')) {
    return response('{"error":"invalid return"}', 400)
  }
  const state = await signState(env, { r: ret, x: Date.now() + 600_000 })
  const auth = new URL(DISCORD_AUTH)
  auth.searchParams.set('client_id', env.DISCORD_CLIENT_ID)
  auth.searchParams.set('response_type', 'code')
  auth.searchParams.set('redirect_uri', CALLBACK)
  auth.searchParams.set('scope', 'identify')
  auth.searchParams.set('state', state)
  return Response.redirect(auth.toString(), 302)
}

async function authDiscordCallback(env, url) {
  const payload = await verifyState(env, url.searchParams.get('state'))
  const code = url.searchParams.get('code')
  if (!payload || !code) return response('{"error":"invalid state"}', 400)

  const tokenRes = await fetch(DISCORD_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: CALLBACK,
    }),
  })
  if (!tokenRes.ok) return response('{"error":"token exchange failed"}', 502)
  const { access_token } = await tokenRes.json()

  const meRes = await fetch(DISCORD_ME, { headers: { Authorization: `Bearer ${access_token}` } })
  if (!meRes.ok) return response('{"error":"profile fetch failed"}', 502)
  const me = await meRes.json()
  const avatar = me.avatar
    ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=64`
    : ''
  const displayName = me.global_name || me.username || 'Aventurier'

  const userId = `discord:${me.id}`
  await env.DB.prepare(
    'INSERT INTO users (id, provider, provider_id, name, avatar, created) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ' +
      'ON CONFLICT(id) DO UPDATE SET name = ?4, avatar = ?5',
  )
    .bind(userId, 'discord', me.id, displayName, avatar, Date.now())
    .run()

  const token = randomToken()
  await env.DB.prepare(
    'INSERT INTO tokens (token, user_id, created, expires) VALUES (?1, ?2, ?3, ?4)',
  )
    .bind(token, userId, Date.now(), Date.now() + TOKEN_TTL)
    .run()

  const dest = new URL(payload.r)
  dest.hash = `login=${token}`
  return Response.redirect(dest.toString(), 302)
}

async function authenticate(env, req) {
  const header = req.headers.get('Authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return null
  const row = await env.DB.prepare(
    'SELECT u.id, u.name, u.avatar FROM tokens t JOIN users u ON u.id = t.user_id ' +
      'WHERE t.token = ?1 AND t.expires > ?2',
  )
    .bind(token, Date.now())
    .first()
  return row ?? null
}

async function getMe(env, user) {
  const rows = await env.DB.prepare(
    'SELECT char_id, verified, code FROM bindings WHERE user_id = ?1',
  )
    .bind(user.id)
    .all()
  return {
    user: { id: user.id, name: user.name, avatar: user.avatar },
    bindings: rows.results.map((r) => ({
      charId: r.char_id,
      verified: !!r.verified,
      code: r.verified ? undefined : r.code,
    })),
  }
}

async function bindCharacter(env, user, raw) {
  let doc
  try {
    doc = JSON.parse(raw)
  } catch {
    return response('{"error":"invalid body"}', 422)
  }
  const charId = doc?.charId
  if (!Number.isInteger(charId) || charId <= 0 || charId >= 1e12) {
    return response('{"error":"invalid charId"}', 422)
  }
  const owner = await env.DB.prepare(
    'SELECT user_id FROM bindings WHERE char_id = ?1 AND verified = 1',
  )
    .bind(charId)
    .first()
  if (owner && owner.user_id !== user.id) {
    return response('{"error":"character already claimed"}', 409)
  }
  const code = 'OGS-' + b64url(crypto.getRandomValues(new Uint8Array(6))).slice(0, 8)
  await env.DB.prepare(
    'INSERT INTO bindings (user_id, char_id, verified, code, created) VALUES (?1, ?2, 0, ?3, ?4) ' +
      'ON CONFLICT(user_id, char_id) DO UPDATE SET code = CASE WHEN bindings.verified = 1 THEN bindings.code ELSE ?3 END',
  )
    .bind(user.id, charId, code, Date.now())
    .run()
  const row = await env.DB.prepare(
    'SELECT verified, code FROM bindings WHERE user_id = ?1 AND char_id = ?2',
  )
    .bind(user.id, charId)
    .first()
  return response(JSON.stringify({ charId, verified: !!row.verified, code: row.code }))
}

async function verifyBinding(env, user, raw) {
  let doc
  try {
    doc = JSON.parse(raw)
  } catch {
    return response('{"error":"invalid body"}', 422)
  }
  const charId = doc?.charId
  const row = await env.DB.prepare(
    'SELECT code, verified FROM bindings WHERE user_id = ?1 AND char_id = ?2',
  )
    .bind(user.id, charId)
    .first()
  if (!row) return response('{"error":"no binding"}', 404)
  if (row.verified) return response('{"charId":' + charId + ',"verified":true}')

  const profile = await lodestoneGet(`/character/${charId}/`)
  if (profile === null) return response('{"error":"character not found"}', 404)
  if (!profile.includes(row.code)) {
    return response('{"error":"code not found in profile"}', 422)
  }
  const claimed = await env.DB.prepare(
    'SELECT user_id FROM bindings WHERE char_id = ?1 AND verified = 1',
  )
    .bind(charId)
    .first()
  if (claimed && claimed.user_id !== user.id) {
    return response('{"error":"character already claimed"}', 409)
  }
  await env.DB.prepare(
    'UPDATE bindings SET verified = 1 WHERE user_id = ?1 AND char_id = ?2',
  )
    .bind(user.id, charId)
    .run()
  return response(JSON.stringify({ charId, verified: true }))
}

/** Délie un personnage. Ses collections restent en base : si le joueur le
 *  relie plus tard, il retrouve tout. */
async function unbindCharacter(env, user, charId) {
  await env.DB.prepare('DELETE FROM bindings WHERE user_id = ?1 AND char_id = ?2')
    .bind(user.id, charId)
    .run()
  return response(JSON.stringify({ charId, unbound: true }))
}

async function putCollections(env, user, charId, raw) {
  const binding = await env.DB.prepare(
    'SELECT verified FROM bindings WHERE user_id = ?1 AND char_id = ?2 AND verified = 1',
  )
    .bind(user.id, charId)
    .first()
  if (!binding) return response('{"error":"not the verified owner"}', 403)

  let doc
  try {
    doc = JSON.parse(raw)
  } catch {
    return response('{"error":"invalid body"}', 422)
  }
  const rows = []
  const now = Date.now()
  for (const kind of [...HIDDEN_KINDS, 'relics']) {
    const ids = doc?.[kind]
    if (ids === undefined) continue
    if (!validIds(ids, 6000)) return response('{"error":"invalid ids"}', 422)
    rows.push([charId, kind, JSON.stringify([...new Set(ids)]), now])
  }
  if (rows.length === 0) return response('{"error":"nothing to update"}', 422)
  const stmt = env.DB.prepare(
    'INSERT INTO collections (char_id, kind, ids, updated, source) VALUES (?1, ?2, ?3, ?4, ?5) ' +
      'ON CONFLICT(char_id, kind) DO UPDATE SET ids=?3, updated=?4, source=?5',
  )
  await env.DB.batch(rows.map((r) => stmt.bind(...r, 'user')))
  return response('{"ok":true}')
}

// --------------------------------------------------------------------- http

function response(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

function sanitizeRoom(raw) {
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

    // --- comptes : OAuth Discord + session + liaison de perso
    if (url.pathname === '/auth/discord' && req.method === 'GET') {
      return authDiscordStart(env, url)
    }
    if (url.pathname === '/auth/discord/callback' && req.method === 'GET') {
      return authDiscordCallback(env, url)
    }
    if (url.pathname === '/me' && req.method === 'GET') {
      const user = await authenticate(env, req)
      if (!user) return response('{"error":"unauthorized"}', 401)
      return response(JSON.stringify(await getMe(env, user)))
    }
    if (url.pathname === '/bind' && req.method === 'POST') {
      const user = await authenticate(env, req)
      if (!user) return response('{"error":"unauthorized"}', 401)
      return bindCharacter(env, user, await req.text())
    }
    if (url.pathname === '/bind/verify' && req.method === 'POST') {
      const user = await authenticate(env, req)
      if (!user) return response('{"error":"unauthorized"}', 401)
      return verifyBinding(env, user, await req.text())
    }
    if (url.pathname === '/bind' && req.method === 'DELETE') {
      const user = await authenticate(env, req)
      if (!user) return response('{"error":"unauthorized"}', 401)
      let charId
      try {
        charId = JSON.parse(await req.text())?.charId
      } catch {
        return response('{"error":"invalid body"}', 422)
      }
      if (!Number.isInteger(charId) || charId <= 0) return response('{"error":"invalid charId"}', 422)
      return unbindCharacter(env, user, charId)
    }

    // --- personnages : GET /character/:id[?force=1] · POST /character/:id/seed
    //                   PUT /character/:id/collections (propriétaire vérifié)
    const charMatch = url.pathname.match(/^\/character\/(\d{1,12})(\/seed|\/collections)?$/)
    if (charMatch) {
      const id = Number(charMatch[1])
      if (charMatch[2] === '/seed' && req.method === 'POST') {
        const raw = await req.text()
        if (raw.length > 262_144) return response('{"error":"too large"}', 413)
        const ok = await applySeed(env, id, raw)
        return ok ? response('{"ok":true}') : response('{"error":"invalid seed"}', 422)
      }
      if (charMatch[2] === '/collections' && req.method === 'PUT') {
        const user = await authenticate(env, req)
        if (!user) return response('{"error":"unauthorized"}', 401)
        const raw = await req.text()
        if (raw.length > 262_144) return response('{"error":"too large"}', 413)
        return putCollections(env, user, id, raw)
      }
      if (!charMatch[2] && req.method === 'GET') {
        try {
          const char = await getCharacter(env, id, url.searchParams.has('force'))
          if (!char) return response('{"error":"character not found"}', 404)
          return response(JSON.stringify(char))
        } catch (e) {
          return response(JSON.stringify({ error: String(e?.message ?? e) }), 502)
        }
      }
      return response('{"error":"method not allowed"}', 405)
    }

    // --- salons : GET/POST /room/:id
    const roomMatch = url.pathname.match(/^\/room\/(ogs-[\w-]{10,80})$/)
    if (roomMatch) {
      const id = roomMatch[1]
      if (req.method === 'GET') {
        const row = await env.DB.prepare('SELECT doc FROM rooms WHERE id = ?1').bind(id).first()
        if (!row) return response('{"error":"no such room"}', 404)
        return response(row.doc)
      }
      if (req.method === 'POST') {
        const raw = await req.text()
        if (raw.length > MAX_DOC_BYTES) return response('{"error":"too large"}', 413)
        const doc = sanitizeRoom(raw)
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
    }

    return response('{"error":"not found"}', 404)
  },
}
