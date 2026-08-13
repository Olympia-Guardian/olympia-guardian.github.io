// Worker Codex Olympia : salons de synchro + service de personnages.
//
// Personnages : lus directement sur le Lodestone (profil + montures +
// mascottes, user-agent mobile → les noms sont dans le HTML), mis en cache en
// D1 (1 h). Les onze autres collections (cartes, mode, tenues, armoire,
// bardes, émotes, portraits, orchestrion, magie bleue, reliques) sont
// invisibles du Lodestone : elles sont amorcées UNE FOIS depuis FFXIV Collect
// puis vivent chez nous, modifiables depuis « Ma Page ».

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
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

  // ------- profil étendu (blocs « character-block » de la fiche Lodestone)
  const blockVal = (label) => {
    const m = profile.match(
      new RegExp(
        `character-block__name">${label}</p>\\s*<p class="character-block__(?:profile|birth)[^"]*">(.*?)</p>`,
        's',
      ),
    )
    if (!m) return null
    return decodeEntities(
      m[1]
        .replace(/<br\s*\/?>/g, ' — ')
        .replace(/<[^>]+>/g, '')
        .trim(),
    )
  }
  const title = decodeEntities(extract(profile, /frame__chara__title[^>]*>([^<]+)</) ?? '')
  const activeLevel =
    extract(profile, /character__class__data[^>]*>\s*<p>\s*LEVEL\s*(\d+)/) ?? null
  const fcName = decodeEntities(
    extract(profile, /character__freecompany__name"[^>]*>[\s\S]*?<h4>([^<]+)<\/h4>/) ?? '',
  )
  // Icône de la grande compagnie (l'image du bloc) et blason de la compagnie
  // libre (superposition de calques transparents, à empiler côté front).
  const gcIcon =
    extract(
      profile,
      /<img src="([^"]+)"[^>]*>\s*<div class="character-block__box">\s*<p class="character-block__name">Grand Company/,
    ) ?? null
  const crestBlock = profile.match(/character__freecompany__crest__image">([\s\S]*?)<\/div>/)
  const fcCrest = crestBlock
    ? [...crestBlock[1].matchAll(/<img src="([^"]+)"/g)].map((m) => m[1])
    : []

  // ------- niveaux de classes/jobs (page dédiée, groupés par rôle)
  const jobsHtml = await lodestoneGet(`/character/${id}/class_job/`)
  const jobs = []
  if (jobsHtml) {
    const sections = jobsHtml.split(/character__job__icon__title">/).slice(1)
    for (const sec of sections) {
      const role = sec.match(/^([^<]+)</)?.[1]?.trim() ?? ''
      for (const m of sec.matchAll(
        /<li><i class="character__job__icon"><img src="([^"]+)"[^>]*><\/i><div class="character__job__level">([^<]*)<\/div><div class="character__job__name">([^<]*)<\/div>/g,
      )) {
        const level = parseInt(m[2], 10)
        jobs.push({
          role,
          icon: m[1],
          name: decodeEntities(m[3].trim()),
          level: Number.isFinite(level) ? level : 0,
        })
      }
    }
  }

  const extended = {
    race: blockVal('Race/Clan/Gender'),
    nameday: blockVal('Nameday'),
    guardian: blockVal('Guardian'),
    city: blockVal('City-state'),
    grandCompany: blockVal('Grand Company'),
    gcIcon,
    freeCompany: fcName || null,
    fcCrest,
    title: title || null,
    activeLevel: activeLevel ? Number(activeLevel) : null,
    jobs,
  }

  return { id, name, server, dc, avatar, portrait, mounts, minions, extended }
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

// Le bouton « Synchroniser » du journal force un re-scrape immédiat, mais au
// plus une fois par jour et par personnage (le TTL d'une heure fait le reste).
const FORCE_COOLDOWN = 86_400_000

async function getCharacter(env, id, force) {
  const row = await env.DB.prepare('SELECT * FROM characters WHERE id = ?1').bind(id).first()
  const fresh = row && Date.now() - row.updated < CHAR_TTL
  const allowForce = force && (!row || Date.now() - (row.forced_at ?? 0) >= FORCE_COOLDOWN)

  if (!fresh || allowForce) {
    const scraped = await scrapeCharacter(id)
    if (!scraped && !row) return null
    if (scraped) {
      await env.DB.prepare(
        'INSERT INTO characters (id, name, server, dc, avatar, portrait, public_mounts, public_minions, updated, profile, forced_at) ' +
          'VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11) ' +
          'ON CONFLICT(id) DO UPDATE SET name=?2, server=?3, dc=?4, avatar=?5, portrait=?6, public_mounts=?7, public_minions=?8, updated=?9, profile=?10, forced_at=?11',
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
          JSON.stringify(scraped.extended ?? null),
          allowForce ? Date.now() : (row?.forced_at ?? null),
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

  let extended = null
  try {
    extended = char.profile ? JSON.parse(char.profile) : null
  } catch {
    // profil illisible : tant pis
  }

  return {
    id: char.id,
    name: char.name,
    server: char.server,
    data_center: char.dc,
    avatar: char.avatar,
    portrait: char.portrait,
    last_parsed: new Date(char.updated).toISOString(),
    profile: extended,
    // Prochaine synchro forcée possible (le bouton du journal s'y cale).
    next_force_at: (char.forced_at ?? 0) + FORCE_COOLDOWN,
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

// ------------------------------------------------------------------- groupes
// Deux natures : privé (shared=0, visible du seul propriétaire) et synchronisé
// (shared=1, lisible par quiconque a le lien — l'id fait office de secret).
// Droits : le créateur fait tout ; un membre connecté peut rejoindre avec son
// perso vérifié et se retirer lui-même ; le reste du monde lit.
//
// Tables :
//   groups(id, name, owner_user_id, shared, created, updated)
//   group_members(group_id, char_id, added_by, added)
//   group_links(user_id, group_id, added)   ← « ce groupe est dans ma liste »

const MAX_GROUPS_PER_USER = 50
const MAX_NAME = 60

function validGroupName(name) {
  return typeof name === 'string' && name.trim().length >= 1 && name.trim().length <= MAX_NAME
}

function validCharId(id) {
  return Number.isInteger(id) && id > 0 && id < 1e12
}

async function groupRow(env, id) {
  return env.DB.prepare(
    'SELECT id, name, owner_user_id, shared, invite_code, updated FROM groups WHERE id = ?1',
  )
    .bind(id)
    .first()
}

/** Groupe visé par un code d'invitation (synchronisés seulement). */
async function groupByInvite(env, code) {
  return env.DB.prepare(
    'SELECT id, name, owner_user_id, shared, invite_code, updated FROM groups ' +
      'WHERE invite_code = ?1 AND shared = 1',
  )
    .bind(code)
    .first()
}

async function hasLink(env, userId, groupId) {
  const row = await env.DB.prepare(
    'SELECT 1 AS x FROM group_links WHERE user_id = ?1 AND group_id = ?2',
  )
    .bind(userId, groupId)
    .first()
  return !!row
}

/** Code d'invitation court et lisible (~72 bits d'aléa, imprononçable mais
 *  présentable dans un Discord — pas un UUID de morgue). */
function newInviteCode() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = crypto.getRandomValues(new Uint8Array(14))
  return [...bytes].map((b) => alphabet[b % 36]).join('')
}

async function groupMembers(env, id) {
  const rows = await env.DB.prepare(
    'SELECT char_id FROM group_members WHERE group_id = ?1 ORDER BY added',
  )
    .bind(id)
    .all()
  return rows.results.map((r) => r.char_id)
}

function groupJson(row, members, userId) {
  const owner = !!userId && row.owner_user_id === userId
  return {
    id: row.id,
    name: row.name,
    shared: !!row.shared,
    updated: row.updated,
    mine: userId ? (owner ? 'owner' : 'member') : 'guest',
    members,
    // Le code d'invitation ne sort que pour le propriétaire.
    ...(owner && row.invite_code ? { inviteCode: row.invite_code } : {}),
  }
}

/** GET /groups : tous les groupes de ma liste, avec leurs membres — et, pour
 *  mes groupes, les demandes d'adhésion en attente. */
async function listGroups(env, user) {
  const groups = await env.DB.prepare(
    'SELECT g.id, g.name, g.owner_user_id, g.shared, g.invite_code, g.updated FROM group_links l ' +
      'JOIN groups g ON g.id = l.group_id WHERE l.user_id = ?1 ORDER BY l.added',
  )
    .bind(user.id)
    .all()
  const members = await env.DB.prepare(
    'SELECT m.group_id, m.char_id FROM group_members m ' +
      'JOIN group_links l ON l.group_id = m.group_id WHERE l.user_id = ?1 ORDER BY m.added',
  )
    .bind(user.id)
    .all()
  const byGroup = new Map()
  for (const r of members.results) {
    const arr = byGroup.get(r.group_id) ?? []
    arr.push(r.char_id)
    byGroup.set(r.group_id, arr)
  }
  // Demandes en attente sur les groupes que je possède
  const requests = await env.DB.prepare(
    'SELECT r.group_id, r.user_id, u.name AS user_name, r.char_id, r.created FROM group_requests r ' +
      'JOIN groups g ON g.id = r.group_id LEFT JOIN users u ON u.id = r.user_id ' +
      'WHERE g.owner_user_id = ?1 ORDER BY r.created',
  )
    .bind(user.id)
    .all()
  const reqByGroup = new Map()
  for (const r of requests.results) {
    const arr = reqByGroup.get(r.group_id) ?? []
    arr.push({ userId: r.user_id, userName: r.user_name ?? '?', charId: r.char_id, created: r.created })
    reqByGroup.set(r.group_id, arr)
  }
  return response(
    JSON.stringify({
      groups: groups.results.map((g) => ({
        ...groupJson(g, byGroup.get(g.id) ?? [], user.id),
        ...(g.owner_user_id === user.id && reqByGroup.has(g.id)
          ? { requests: reqByGroup.get(g.id) }
          : {}),
      })),
    }),
  )
}

/** POST /groups {name, shared?, members?} : création (privé par défaut). */
async function createGroup(env, user, raw) {
  let body
  try {
    body = JSON.parse(raw)
  } catch {
    return response('{"error":"invalid body"}', 422)
  }
  if (!validGroupName(body?.name)) return response('{"error":"invalid name"}', 422)
  const members = Array.isArray(body?.members) ? [...new Set(body.members)] : []
  if (members.length > MAX_MEMBERS || !members.every(validCharId))
    return response('{"error":"invalid members"}', 422)
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM groups WHERE owner_user_id = ?1')
    .bind(user.id)
    .first()
  if (count.n >= MAX_GROUPS_PER_USER) return response('{"error":"too many groups"}', 429)

  const id = 'grp-' + crypto.randomUUID()
  const now = Date.now()
  const shared = body?.shared ? 1 : 0
  const inviteCode = shared ? newInviteCode() : null
  const stmts = [
    env.DB.prepare(
      'INSERT INTO groups (id, name, owner_user_id, shared, invite_code, created, updated) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)',
    ).bind(id, body.name.trim(), user.id, shared, inviteCode, now),
    env.DB.prepare('INSERT INTO group_links (user_id, group_id, added) VALUES (?1, ?2, ?3)').bind(
      user.id,
      id,
      now,
    ),
  ]
  const memberStmt = env.DB.prepare(
    'INSERT INTO group_members (group_id, char_id, added_by, added) VALUES (?1, ?2, ?3, ?4)',
  )
  for (const charId of members) stmts.push(memberStmt.bind(id, charId, user.id, now))
  await env.DB.batch(stmts)
  return response(
    JSON.stringify(
      groupJson(
        { id, name: body.name.trim(), owner_user_id: user.id, shared, invite_code: inviteCode, updated: now },
        members,
        user.id,
      ),
    ),
  )
}

/** GET /group/:id : lecture réservée au propriétaire et aux membres validés.
 *  (Le contenu d'un groupe n'est plus lisible par simple porteur du lien.) */
async function getGroup(env, user, id) {
  const row = await groupRow(env, id)
  if (!row) return response('{"error":"no such group"}', 404)
  const allowed =
    row.owner_user_id === user?.id || (user ? await hasLink(env, user.id, id) : false)
  if (!allowed) return response('{"error":"no such group"}', 404)
  return response(JSON.stringify(groupJson(row, await groupMembers(env, id), user?.id)))
}

/** PATCH /group/:id {name?, shared?} : renommage / conversion (propriétaire). */
async function patchGroup(env, user, id, raw) {
  const row = await groupRow(env, id)
  if (!row || row.owner_user_id !== user.id) return response('{"error":"no such group"}', 404)
  let body
  try {
    body = JSON.parse(raw)
  } catch {
    return response('{"error":"invalid body"}', 422)
  }
  const name = body?.name !== undefined ? body.name : null
  if (name !== null && !validGroupName(name)) return response('{"error":"invalid name"}', 422)
  // La conversion ne va que dans un sens : privé → synchronisé — et elle
  // frappe le code d'invitation du groupe s'il n'en a pas encore.
  const shared = body?.shared === true ? 1 : row.shared
  const inviteCode = row.invite_code ?? (shared ? newInviteCode() : null)
  await env.DB.prepare(
    'UPDATE groups SET name = ?2, shared = ?3, invite_code = ?4, updated = ?5 WHERE id = ?1',
  )
    .bind(id, name !== null ? name.trim() : row.name, shared, inviteCode, Date.now())
    .run()
  const fresh = await groupRow(env, id)
  return response(JSON.stringify(groupJson(fresh, await groupMembers(env, id), user.id)))
}

/** POST /group/:id/rotate : nouveau code d'invitation — l'ancien lien meurt. */
async function rotateInvite(env, user, id) {
  const row = await groupRow(env, id)
  if (!row || row.owner_user_id !== user.id) return response('{"error":"no such group"}', 404)
  if (!row.shared) return response('{"error":"not shared"}', 409)
  const code = newInviteCode()
  await env.DB.prepare('UPDATE groups SET invite_code = ?2, updated = ?3 WHERE id = ?1')
    .bind(id, code, Date.now())
    .run()
  return response(JSON.stringify({ inviteCode: code }))
}

/** DELETE /group/:id : suppression complète (propriétaire seul). */
async function deleteGroup(env, user, id) {
  const row = await groupRow(env, id)
  if (!row || row.owner_user_id !== user.id) return response('{"error":"no such group"}', 404)
  await env.DB.batch([
    env.DB.prepare('DELETE FROM group_members WHERE group_id = ?1').bind(id),
    env.DB.prepare('DELETE FROM group_links WHERE group_id = ?1').bind(id),
    env.DB.prepare('DELETE FROM groups WHERE id = ?1').bind(id),
  ])
  return response('{"ok":true}')
}

/** Le perso appartient-il (vérifié) à cet utilisateur ? */
async function verifiedBinding(env, userId, charId) {
  const row = await env.DB.prepare(
    'SELECT verified FROM bindings WHERE user_id = ?1 AND char_id = ?2 AND verified = 1',
  )
    .bind(userId, charId)
    .first()
  return !!row
}

/** Ajoute un perso au groupe (membres + horodatage), sans contrôle d'accès. */
async function insertMember(env, id, charId, byUserId, now) {
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?1')
    .bind(id)
    .first()
  if (count.n >= MAX_MEMBERS) return false
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO group_members (group_id, char_id, added_by, added) VALUES (?1, ?2, ?3, ?4) ' +
        'ON CONFLICT(group_id, char_id) DO NOTHING',
    ).bind(id, charId, byUserId, now),
    env.DB.prepare('UPDATE groups SET updated = ?2 WHERE id = ?1').bind(id, now),
  ])
  return true
}

/** POST /group/:id/join {charId} : un MEMBRE validé ajoute un autre de ses
 *  persos vérifiés. Les non-membres passent par la demande d'adhésion. */
async function joinGroup(env, user, id, raw) {
  const row = await groupRow(env, id)
  if (!row || !row.shared) return response('{"error":"no such group"}', 404)
  if (row.owner_user_id !== user.id && !(await hasLink(env, user.id, id)))
    return response('{"error":"not a member"}', 403)
  let charId
  try {
    charId = JSON.parse(raw || '{}')?.charId
  } catch {
    return response('{"error":"invalid body"}', 422)
  }
  if (!validCharId(charId)) return response('{"error":"invalid charId"}', 422)
  if (!(await verifiedBinding(env, user.id, charId)))
    return response('{"error":"not the verified owner"}', 403)
  if (!(await insertMember(env, id, charId, user.id, Date.now())))
    return response('{"error":"group full"}', 409)
  return response(JSON.stringify(groupJson(row, await groupMembers(env, id), user.id)))
}

/** GET /invite/:code : ce que voit un porteur du lien — le nom du groupe et
 *  SON propre statut, rien d'autre (ni membres, ni contenu). */
async function getInvite(env, user, code) {
  const row = await groupByInvite(env, code)
  if (!row) return response('{"error":"no such invite"}', 404)
  let status = 'none'
  if (user) {
    if (row.owner_user_id === user.id || (await hasLink(env, user.id, row.id))) status = 'member'
    else {
      const req = await env.DB.prepare(
        'SELECT 1 AS x FROM group_requests WHERE group_id = ?1 AND user_id = ?2',
      )
        .bind(row.id, user.id)
        .first()
      if (req) status = 'pending'
    }
  }
  return response(JSON.stringify({ name: row.name, status }))
}

/** POST /invite/:code/request {charId} : demande d'adhésion avec un perso
 *  vérifié. Les bannis reçoivent la même réponse — sans effet (aucune fuite). */
async function requestJoin(env, user, code, raw) {
  const row = await groupByInvite(env, code)
  if (!row) return response('{"error":"no such invite"}', 404)
  let charId
  try {
    charId = JSON.parse(raw || '{}')?.charId
  } catch {
    return response('{"error":"invalid body"}', 422)
  }
  if (!validCharId(charId)) return response('{"error":"invalid charId"}', 422)
  if (!(await verifiedBinding(env, user.id, charId)))
    return response('{"error":"not the verified owner"}', 403)
  // Déjà membre : le perso s'ajoute directement (il est déjà validé).
  if (row.owner_user_id === user.id || (await hasLink(env, user.id, row.id))) {
    if (!(await insertMember(env, row.id, charId, user.id, Date.now())))
      return response('{"error":"group full"}', 409)
    return response('{"status":"member"}')
  }
  const banned = await env.DB.prepare(
    'SELECT 1 AS x FROM group_bans WHERE group_id = ?1 AND user_id = ?2',
  )
    .bind(row.id, user.id)
    .first()
  if (!banned) {
    const count = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM group_requests WHERE group_id = ?1',
    )
      .bind(row.id)
      .first()
    if (count.n >= 50) return response('{"error":"too many requests"}', 429)
    await env.DB.prepare(
      'INSERT INTO group_requests (group_id, user_id, char_id, created) VALUES (?1, ?2, ?3, ?4) ' +
        'ON CONFLICT(group_id, user_id) DO UPDATE SET char_id = ?3, created = ?4',
    )
      .bind(row.id, user.id, charId, Date.now())
      .run()
  }
  return response('{"status":"pending"}')
}

/** POST /group/:id/requests/:userId {action: approve|reject|ban} — créateur. */
async function handleRequest(env, user, id, targetUserId, raw) {
  const row = await groupRow(env, id)
  if (!row || row.owner_user_id !== user.id) return response('{"error":"no such group"}', 404)
  let action
  try {
    action = JSON.parse(raw || '{}')?.action
  } catch {
    return response('{"error":"invalid body"}', 422)
  }
  const now = Date.now()
  const req = await env.DB.prepare(
    'SELECT char_id FROM group_requests WHERE group_id = ?1 AND user_id = ?2',
  )
    .bind(id, targetUserId)
    .first()

  if (action === 'approve') {
    if (!req) return response('{"error":"no such request"}', 404)
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?1')
      .bind(id)
      .first()
    if (count.n >= MAX_MEMBERS) return response('{"error":"group full"}', 409)
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO group_links (user_id, group_id, added) VALUES (?1, ?2, ?3) ' +
          'ON CONFLICT(user_id, group_id) DO NOTHING',
      ).bind(targetUserId, id, now),
      env.DB.prepare(
        'INSERT INTO group_members (group_id, char_id, added_by, added) VALUES (?1, ?2, ?3, ?4) ' +
          'ON CONFLICT(group_id, char_id) DO NOTHING',
      ).bind(id, req.char_id, targetUserId, now),
      env.DB.prepare('DELETE FROM group_requests WHERE group_id = ?1 AND user_id = ?2').bind(
        id,
        targetUserId,
      ),
      env.DB.prepare('UPDATE groups SET updated = ?2 WHERE id = ?1').bind(id, now),
    ])
    return response('{"ok":true}')
  }
  if (action === 'reject') {
    await env.DB.prepare('DELETE FROM group_requests WHERE group_id = ?1 AND user_id = ?2')
      .bind(id, targetUserId)
      .run()
    return response('{"ok":true}')
  }
  if (action === 'ban') {
    // Bannir vaut aussi pour un membre : on purge sa présence (lien + ses
    // persos vérifiés + ce qu'il a lui-même ajouté).
    await env.DB.batch([
      env.DB.prepare('DELETE FROM group_requests WHERE group_id = ?1 AND user_id = ?2').bind(
        id,
        targetUserId,
      ),
      env.DB.prepare(
        'INSERT INTO group_bans (group_id, user_id, created) VALUES (?1, ?2, ?3) ' +
          'ON CONFLICT(group_id, user_id) DO NOTHING',
      ).bind(id, targetUserId, now),
      env.DB.prepare('DELETE FROM group_links WHERE group_id = ?1 AND user_id = ?2').bind(
        id,
        targetUserId,
      ),
      env.DB.prepare(
        'DELETE FROM group_members WHERE group_id = ?1 AND (added_by = ?2 OR char_id IN ' +
          '(SELECT char_id FROM bindings WHERE user_id = ?2 AND verified = 1))',
      ).bind(id, targetUserId),
      env.DB.prepare('UPDATE groups SET updated = ?2 WHERE id = ?1').bind(id, now),
    ])
    return response('{"ok":true}')
  }
  return response('{"error":"invalid action"}', 422)
}

/** DELETE /group/:id/link : quitter ma liste (sans toucher aux membres). */
async function quitGroup(env, user, id) {
  await env.DB.prepare('DELETE FROM group_links WHERE user_id = ?1 AND group_id = ?2')
    .bind(user.id, id)
    .run()
  return response('{"ok":true}')
}

/** POST /group/:id/members {charId} : ajout d'un perso arbitraire par le
 *  propriétaire — groupes PRIVÉS seulement. Dans un groupe synchronisé, on
 *  n'entre que par invitation validée (ou son propre perso vérifié via join). */
async function addGroupMember(env, user, id, raw) {
  const row = await groupRow(env, id)
  if (!row || row.owner_user_id !== user.id) return response('{"error":"no such group"}', 404)
  if (row.shared) return response('{"error":"shared group: invite only"}', 403)
  let charId
  try {
    charId = JSON.parse(raw)?.charId
  } catch {
    return response('{"error":"invalid body"}', 422)
  }
  if (!validCharId(charId)) return response('{"error":"invalid charId"}', 422)
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?1')
    .bind(id)
    .first()
  if (count.n >= MAX_MEMBERS) return response('{"error":"group full"}', 409)
  const now = Date.now()
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO group_members (group_id, char_id, added_by, added) VALUES (?1, ?2, ?3, ?4) ' +
        'ON CONFLICT(group_id, char_id) DO NOTHING',
    ).bind(id, charId, user.id, now),
    env.DB.prepare('UPDATE groups SET updated = ?2 WHERE id = ?1').bind(id, now),
  ])
  return response(JSON.stringify(groupJson(row, await groupMembers(env, id), user.id)))
}

/** DELETE /group/:id/member/:charId : le propriétaire retire n'importe qui,
 *  un membre connecté retire son propre perso vérifié. Quand le dernier perso
 *  d'un membre disparaît, sa ligne « dans ma liste » saute aussi — il devra
 *  refaire une demande pour revenir. */
async function removeGroupMember(env, user, id, charId) {
  const row = await groupRow(env, id)
  if (!row) return response('{"error":"no such group"}', 404)
  if (row.owner_user_id !== user.id && !(await verifiedBinding(env, user.id, charId)))
    return response('{"error":"forbidden"}', 403)
  const now = Date.now()
  await env.DB.batch([
    env.DB.prepare('DELETE FROM group_members WHERE group_id = ?1 AND char_id = ?2').bind(id, charId),
    env.DB.prepare('UPDATE groups SET updated = ?2 WHERE id = ?1').bind(id, now),
  ])
  // Propriétaire (vérifié) du perso retiré : plus aucun perso dans le groupe
  // → on retire aussi le groupe de sa liste (sauf s'il en est le créateur).
  const owner = await env.DB.prepare(
    'SELECT user_id FROM bindings WHERE char_id = ?1 AND verified = 1',
  )
    .bind(charId)
    .first()
  if (owner && owner.user_id !== row.owner_user_id) {
    const left = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?1 AND char_id IN ' +
        '(SELECT char_id FROM bindings WHERE user_id = ?2 AND verified = 1)',
    )
      .bind(id, owner.user_id)
      .first()
    if (left.n === 0) {
      await env.DB.prepare('DELETE FROM group_links WHERE group_id = ?1 AND user_id = ?2')
        .bind(id, owner.user_id)
        .run()
    }
  }
  return response(JSON.stringify(groupJson(row, await groupMembers(env, id), user.id)))
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

    // --- groupes : voir la section « groupes » plus haut
    if (url.pathname === '/groups') {
      const user = await authenticate(env, req)
      if (!user) return response('{"error":"unauthorized"}', 401)
      if (req.method === 'GET') return listGroups(env, user)
      if (req.method === 'POST') return createGroup(env, user, await req.text())
      return response('{"error":"method not allowed"}', 405)
    }
    const groupMatch = url.pathname.match(
      /^\/group\/(grp-[\w-]{10,80})(?:\/(join|link|members|rotate)|\/member\/(\d{1,12})|\/requests\/([\w:.@%-]{1,240}))?$/,
    )
    if (groupMatch) {
      const [, id, action, memberId, requestUserId] = groupMatch
      const user = await authenticate(env, req)
      if (!user) return response('{"error":"unauthorized"}', 401)
      if (!action && !memberId && !requestUserId) {
        if (req.method === 'GET') return getGroup(env, user, id)
        if (req.method === 'PATCH') return patchGroup(env, user, id, await req.text())
        if (req.method === 'DELETE') return deleteGroup(env, user, id)
      }
      if (action === 'join' && req.method === 'POST') return joinGroup(env, user, id, await req.text())
      if (action === 'link' && req.method === 'DELETE') return quitGroup(env, user, id)
      if (action === 'members' && req.method === 'POST')
        return addGroupMember(env, user, id, await req.text())
      if (action === 'rotate' && req.method === 'POST') return rotateInvite(env, user, id)
      if (memberId && req.method === 'DELETE') return removeGroupMember(env, user, id, Number(memberId))
      if (requestUserId && req.method === 'POST')
        return handleRequest(env, user, id, decodeURIComponent(requestUserId), await req.text())
      return response('{"error":"method not allowed"}', 405)
    }

    // --- invitations : GET /invite/:code · POST /invite/:code/request
    const inviteMatch = url.pathname.match(/^\/invite\/([a-z0-9]{10,20}|inv-[\w-]{10,80})(\/request)?$/)
    if (inviteMatch) {
      const [, code, isRequest] = inviteMatch
      if (!isRequest && req.method === 'GET') {
        return getInvite(env, await authenticate(env, req), code)
      }
      if (isRequest && req.method === 'POST') {
        const user = await authenticate(env, req)
        if (!user) return response('{"error":"unauthorized"}', 401)
        return requestJoin(env, user, code, await req.text())
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
