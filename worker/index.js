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
  'achievements',
]
const HIDDEN_KINDS = ALL_KINDS.filter((k) => k !== 'mounts' && k !== 'minions')
const MAX_DOC_BYTES = 16_384
const MAX_MEMBERS = 100

// ---------------------------------------------------------------- catalogues

// Cache par isolate : nameEn (normalisé) → id, + totaux par collection.
let catalogCache = null
let catalogAt = 0
let catalogLoading = null

function norm(s) {
  return s.normalize('NFKD').replace(/’/g, "'").trim().toLowerCase()
}

async function getJsonOrNull(url, ms = 8000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ms) })
    if (!res.ok) return null
    return await res.json()
  } catch (e) {
    console.warn(`catalogue injoignable : ${url} (${e.message})`)
    return null
  }
}

/** Charge ce dont le worker a réellement besoin. Sur les 16 catalogues, 13 ne
 *  servaient qu'à lire un nombre d'entrées : ce total vient maintenant de
 *  totals.json, et seuls montures, mascottes et tenues sont téléchargés en
 *  entier (1,9 Mo au lieu de 8,2, et 4 sous-requêtes au lieu de 16). */
async function loadCatalogs() {
  const [totals, mounts, minions, outfits] = await Promise.all([
    getJsonOrNull(`${CATALOG_BASE}totals.json`),
    getJsonOrNull(`${CATALOG_BASE}mounts.json`),
    getJsonOrNull(`${CATALOG_BASE}minions.json`),
    getJsonOrNull(`${CATALOG_BASE}outfits.json`),
  ])
  if (!mounts || !minions) throw new Error('catalogues montures/mascottes indisponibles')
  // totals.json est publié par le même déploiement que les catalogues : s'il
  // manque, c'est que le worker est parti avant les données (déployer les
  // données EN PREMIER), et les compteurs tomberaient tous à zéro.
  if (!totals) console.warn('totals.json absent : compteurs de collections à 0')
  const maps = {
    mounts: new Map(mounts.map((it) => [norm(it.nameEn), it.id])),
    minions: new Map(minions.map((it) => [norm(it.nameEn), it.id])),
  }
  if (outfits) {
    // tenue -> ids de ses pièces (dérivation « ensemble complet »)
    maps.outfitPieces = new Map(
      outfits.map((it) => [it.id, (it.pieces ?? []).map((p) => p.id).filter(Boolean)]),
    )
  }
  return { maps, totals: totals ?? {} }
}

async function catalogs() {
  if (catalogCache && Date.now() - catalogAt < 6 * 3_600_000) return catalogCache
  // On mémorise la PROMESSE : sur un isolate froid, vingt requêtes simultanées
  // lançaient vingt fois le chargement complet.
  if (!catalogLoading) {
    catalogLoading = loadCatalogs()
      .then((c) => {
        catalogCache = c
        catalogAt = Date.now()
        return c
      })
      .finally(() => {
        catalogLoading = null
      })
  }
  return catalogLoading
}

// ----------------------------------------------------------------- lodestone

async function lodestoneGet(path, lang = 'en') {
  const base = lang === 'fr' ? 'https://fr.finalfantasyxiv.com/lodestone' : LODESTONE
  const res = await fetch(`${base}${path}`, {
    headers: { 'User-Agent': MOBILE_UA, 'Accept-Language': lang },
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

  // ------- version française de la fiche : grande compagnie et titre
  // localisés (le reste des libellés affichés est identique ou traduit côté
  // front). Un échec ici n'est pas bloquant.
  let grandCompanyFr = null
  let titleFr = null
  try {
    const profileFr = await lodestoneGet(`/character/${id}/`, 'fr')
    if (profileFr) {
      const gcFr = profileFr.match(
        /character-block__name">Grande compagnie<\/p>\s*<p class="character-block__profile[^"]*">(.*?)<\/p>/s,
      )
      grandCompanyFr = gcFr
        ? decodeEntities(gcFr[1].replace(/<[^>]+>/g, '').trim())
        : null
      titleFr = decodeEntities(extract(profileFr, /frame__chara__title[^>]*>([^<]+)</) ?? '') || null
    }
  } catch {
    // tant pis, l'anglais servira de repli
  }

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
    grandCompanyFr,
    gcIcon,
    freeCompany: fcName || null,
    fcCrest,
    title: title || null,
    titleFr,
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
    // Un scrape peut échouer (rate limit Lodestone quand plusieurs fiches se
    // rafraîchissent en même temps) : on sert alors la fiche en cache et on
    // retente dans 5 minutes plutôt que de marteler à chaque requête.
    let scraped = null
    try {
      scraped = await scrapeCharacter(id)
    } catch {
      scraped = null
    }
    if (!scraped && !row) return null
    if (!scraped && row) {
      await env.DB.prepare('UPDATE characters SET updated = ?2 WHERE id = ?1')
        .bind(id, Date.now() - CHAR_TTL + 300_000)
        .run()
    }
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
  // Collection apparue APRÈS l'amorçage de ce perso (ex. succès) : sa ligne
  // n'existe pas du tout — on pose le placeholder manquant et on redemande
  // un seed au navigateur, sinon les anciens persos n'en auraient jamais.
  const present = new Set(colRows.results.map((r) => r.kind))
  const missingKinds = [...HIDDEN_KINDS, 'relics'].filter((k) => !present.has(k))
  if (missingKinds.length > 0) await seedPlaceholders(env, id)
  const needsSeed =
    missingKinds.length > 0 || colRows.results.some((r) => r.source === 'empty')
  const { maps, totals } = await catalogs()

  // Tenues : un ensemble dont TOUTES les pièces sont possédées est possédé,
  // même s'il n'a jamais été coché en entier (règle « coché OU complet »).
  const pieceIds = byKind.outfitpieces ?? []
  if (pieceIds.length > 0 && maps.outfitPieces) {
    const ownedPieces = new Set(pieceIds)
    const stored = new Set(byKind.outfits ?? [])
    for (const [outfitId, pieces] of maps.outfitPieces) {
      if (pieces.length > 0 && !stored.has(outfitId) && pieces.every((p) => ownedPieces.has(p))) {
        stored.add(outfitId)
      }
    }
    byKind.outfits = [...stored]
  }

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
    outfit_piece_ids: byKind.outfitpieces ?? [],
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
  // L'origine du retour doit correspondre EXACTEMENT à celle de l'app : le
  // callback pose le jeton de session dans le fragment de cette URL, et un
  // simple startsWith laissait passer « https://<app>.exemple.fr », donc la
  // session partait chez qui voulait. Le retour local n'est toléré qu'en
  // développement, là où le secret Discord est absent.
  let retUrl
  try {
    retUrl = new URL(ret)
  } catch {
    return response('{"error":"invalid return"}', 400)
  }
  const local = retUrl.hostname === 'localhost' || retUrl.hostname === '127.0.0.1'
  if (
    retUrl.origin !== new URL(env.APP_URL).origin &&
    !(local && !env.DISCORD_CLIENT_SECRET)
  ) {
    return response('{"error":"invalid return"}', 400)
  }
  // Connexion de dev (npm run dev:worker) : pas d'OAuth possible en local
  // (secret et redirect URI absents) — on ouvre directement une session pour
  // le compte admin (ou ?as=<userId>), comme le ferait le callback. Double
  // verrou : le secret Discord est TOUJOURS présent en prod (sinon l'OAuth
  // entier est mort) et jamais en local, et la route ne s'active que sur
  // 127.0.0.1/localhost.
  if (
    !env.DISCORD_CLIENT_SECRET &&
    (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
  ) {
    const userId = url.searchParams.get('as') ?? env.ADMIN_USER_ID
    const known = await env.DB.prepare('SELECT id FROM users WHERE id = ?1').bind(userId).first()
    if (!known)
      return response('{"error":"utilisateur inconnu en base locale — npm run dev:pull ?"}', 404)
    const token = randomToken()
    await env.DB.prepare(
      'INSERT INTO tokens (token, user_id, created, expires) VALUES (?1, ?2, ?3, ?4)',
    )
      .bind(token, userId, Date.now(), Date.now() + TOKEN_TTL)
      .run()
    const dest = new URL(ret)
    dest.hash = `login=${token}`
    return Response.redirect(dest.toString(), 302)
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
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO tokens (token, user_id, created, expires) VALUES (?1, ?2, ?3, ?4)',
    ).bind(token, userId, Date.now(), Date.now() + TOKEN_TTL),
    // La table des sessions ne grossit pas : les jetons expirés partent, et
    // chaque compte garde au plus ses 5 sessions les plus récentes.
    env.DB.prepare('DELETE FROM tokens WHERE expires < ?1').bind(Date.now()),
    env.DB.prepare(
      'DELETE FROM tokens WHERE user_id = ?1 AND token NOT IN ' +
        '(SELECT token FROM tokens WHERE user_id = ?1 ORDER BY created DESC LIMIT 5)',
    ).bind(userId),
  ])

  const dest = new URL(payload.r)
  dest.hash = `login=${token}`
  return Response.redirect(dest.toString(), 302)
}

async function authenticateToken(env, token) {
  if (!token) return null
  const row = await env.DB.prepare(
    'SELECT u.id, u.name, u.avatar FROM tokens t JOIN users u ON u.id = t.user_id ' +
      'WHERE t.token = ?1 AND t.expires > ?2',
  )
    .bind(token, Date.now())
    .first()
  return row ?? null
}

async function authenticate(env, req) {
  const header = req.headers.get('Authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  return authenticateToken(env, token)
}

async function getMe(env, user) {
  const rows = await env.DB.prepare(
    'SELECT char_id, verified, code FROM bindings WHERE user_id = ?1',
  )
    .bind(user.id)
    .all()
  return {
    user: {
      id: user.id,
      name: user.name,
      avatar: user.avatar,
      // Présent seulement pour le super-admin (le front ouvre son espace).
      ...(isAdmin(env, user) ? { isAdmin: true } : {}),
    },
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
  // Montures/mascottes acceptées aussi : validation temporaire — la prochaine
  // synchro Lodestone réécrit ces deux collections (source lodestone).
  // outfitpieces : pièces de tenues possédées (stockage auxiliaire, comme
  // relics — un ensemble dont toutes les pièces sont là devient possédé).
  for (const kind of [...ALL_KINDS, 'relics', 'outfitpieces']) {
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
  await notify(env, await usersSharingChar(env, charId), { t: 'char', id: charId })
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
  // Comptes des co-membres des groupes online : sert au bouton « ajouter en
  // contact » (visibilité limitée au cercle du groupe, pas d'annuaire).
  const memberUsers = await env.DB.prepare(
    'SELECT l2.group_id, l2.user_id, u.name FROM group_links l1 ' +
      'JOIN groups g ON g.id = l1.group_id AND g.shared = 1 ' +
      'JOIN group_links l2 ON l2.group_id = l1.group_id ' +
      'LEFT JOIN users u ON u.id = l2.user_id WHERE l1.user_id = ?1',
  )
    .bind(user.id)
    .all()
  const usersByGroup = new Map()
  for (const r of memberUsers.results) {
    const arr = usersByGroup.get(r.group_id) ?? []
    arr.push({ userId: r.user_id, name: r.name ?? '?' })
    usersByGroup.set(r.group_id, arr)
  }
  return response(
    JSON.stringify({
      groups: groups.results.map((g) => ({
        ...groupJson(g, byGroup.get(g.id) ?? [], user.id),
        ...(g.owner_user_id === user.id && reqByGroup.has(g.id)
          ? { requests: reqByGroup.get(g.id) }
          : {}),
        ...(usersByGroup.has(g.id) ? { memberUsers: usersByGroup.get(g.id) } : {}),
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
  // Le type (online/offline) se choisit à la création et ne change plus :
  // toute demande de conversion est refusée, seul le renommage passe.
  if (body?.shared !== undefined && !!body.shared !== !!row.shared)
    return response('{"error":"group type is fixed at creation"}', 409)
  const inviteCode = row.invite_code ?? (row.shared ? newInviteCode() : null)
  await env.DB.prepare(
    'UPDATE groups SET name = ?2, shared = ?3, invite_code = ?4, updated = ?5 WHERE id = ?1',
  )
    .bind(id, name !== null ? name.trim() : row.name, row.shared, inviteCode, Date.now())
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
  // Blacklist du propriétaire : même silence que le ban de groupe.
  const blocked = await env.DB.prepare(
    'SELECT 1 AS x FROM blocks WHERE user_id = ?1 AND blocked_id = ?2',
  )
    .bind(row.owner_user_id, user.id)
    .first()
  if (!banned && !blocked) {
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
    await notify(env, [row.owner_user_id], { t: 'groups' })
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
    const linked = await env.DB.prepare('SELECT user_id FROM group_links WHERE group_id = ?1')
      .bind(id)
      .all()
    await notify(env, linked.results.map((r) => r.user_id), { t: 'groups' })
    return response('{"ok":true}')
  }
  if (action === 'reject') {
    await env.DB.prepare('DELETE FROM group_requests WHERE group_id = ?1 AND user_id = ?2')
      .bind(id, targetUserId)
      .run()
    await notify(env, [targetUserId], { t: 'groups' })
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

/** POST /character/:id/collect-sync — fusion (union) des collections avec les
 *  données FFXIV Collect, à la vérification du perso. Appelée par le
 *  NAVIGATEUR (le WAF de Collect bloque le worker) et réservée au propriétaire
 *  vérifié. N'enlève jamais rien : ajoute ce qui existe là-bas. */
async function collectSync(env, user, charId, raw) {
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
  const rows = await env.DB.prepare(
    'SELECT kind, ids, source FROM collections WHERE char_id = ?1',
  )
    .bind(charId)
    .all()
  const current = new Map(rows.results.map((r) => [r.kind, r]))
  const now = Date.now()
  const upsert = env.DB.prepare(
    'INSERT INTO collections (char_id, kind, ids, updated, source) VALUES (?1, ?2, ?3, ?4, ?5) ' +
      'ON CONFLICT(char_id, kind) DO UPDATE SET ids=?3, updated=?4, source=?5',
  )
  const stmts = []
  let added = 0
  for (const kind of [...HIDDEN_KINDS, 'relics']) {
    const incoming = doc?.[kind]
    if (incoming === undefined) continue
    if (!validIds(incoming, 6000)) return response('{"error":"invalid ids"}', 422)
    const cur = current.get(kind)
    const curIds = cur ? JSON.parse(cur.ids) : []
    const merged = [...new Set([...curIds, ...incoming])]
    if (cur && merged.length === curIds.length) continue // rien de neuf ici
    added += merged.length - curIds.length
    // Les coches faites dans l'app restent « user » ; le reste devient « seed ».
    const source = cur?.source === 'user' ? 'user' : 'seed'
    stmts.push(upsert.bind(charId, kind, JSON.stringify(merged), now, source))
  }
  if (stmts.length > 0) {
    await env.DB.batch(stmts)
    await notify(env, await usersSharingChar(env, charId), { t: 'char', id: charId })
  }
  return response(JSON.stringify({ ok: true, added }))
}

// ---------------------------------------------------------------- suggestions
// Un membre d'un groupe ONLINE propose un objet pour le perso d'un autre
// membre ; la cible accepte (l'objet est coché) ou refuse. Pour les montures
// et mascottes, l'acceptation vaut « validation temporaire » : le scrape
// Lodestone réécrit ces collections à chaque synchro et confirme (ou retire)
// l'objet tout seul.

const SUGGESTABLE_KINDS = [...ALL_KINDS, 'relics']
const MAX_SUGGESTIONS_PER_CHAR = 500

/** Le proposeur partage-t-il un groupe online avec le perso cible ? */
async function sharesOnlineGroup(env, userId, charId) {
  const row = await env.DB.prepare(
    'SELECT 1 AS x FROM group_members m JOIN groups g ON g.id = m.group_id ' +
      'JOIN group_links l ON l.group_id = g.id ' +
      'WHERE m.char_id = ?1 AND g.shared = 1 AND l.user_id = ?2 LIMIT 1',
  )
    .bind(charId, userId)
    .first()
  return !!row
}

/** POST /suggest {charId, items: [{kind, itemId}]} : crée des suggestions. */
async function createSuggestions(env, user, raw) {
  let body
  try {
    body = JSON.parse(raw)
  } catch {
    return response('{"error":"invalid body"}', 422)
  }
  const charId = body?.charId
  const items = Array.isArray(body?.items) ? body.items : []
  if (!validCharId(charId) || items.length === 0 || items.length > 50)
    return response('{"error":"invalid body"}', 422)
  for (const it of items) {
    if (!SUGGESTABLE_KINDS.includes(it?.kind) || !Number.isInteger(it?.itemId) || it.itemId <= 0)
      return response('{"error":"invalid item"}', 422)
  }
  if (!(await sharesOnlineGroup(env, user.id, charId)))
    return response('{"error":"not in a shared group with this character"}', 403)

  // Le propriétaire du perso m'a bloqué : on répond comme si tout allait
  // bien, mais rien n'est créé (blocage silencieux).
  const blockedByOwner = await env.DB.prepare(
    'SELECT 1 AS x FROM bindings b JOIN blocks k ON k.user_id = b.user_id AND k.blocked_id = ?2 ' +
      'WHERE b.char_id = ?1 AND b.verified = 1',
  )
    .bind(charId, user.id)
    .first()
  if (blockedByOwner) return response(JSON.stringify({ ok: true, created: items.length, skipped: 0 }))

  // Pas de suggestion pour un objet déjà possédé par la cible.
  const owned = new Map()
  for (const kind of [...new Set(items.map((i) => i.kind))]) {
    const row = await env.DB.prepare(
      'SELECT ids FROM collections WHERE char_id = ?1 AND kind = ?2',
    )
      .bind(charId, kind)
      .first()
    owned.set(kind, new Set(row ? JSON.parse(row.ids) : []))
  }
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM suggestions WHERE char_id = ?1')
    .bind(charId)
    .first()
  if (count.n >= MAX_SUGGESTIONS_PER_CHAR) return response('{"error":"too many suggestions"}', 429)

  const now = Date.now()
  const stmt = env.DB.prepare(
    'INSERT INTO suggestions (char_id, kind, item_id, from_user_id, created) VALUES (?1, ?2, ?3, ?4, ?5) ' +
      'ON CONFLICT(char_id, kind, item_id) DO NOTHING',
  )
  const stmts = []
  let skipped = 0
  for (const it of items) {
    if (owned.get(it.kind)?.has(it.itemId)) {
      skipped++
      continue
    }
    stmts.push(stmt.bind(charId, it.kind, it.itemId, user.id, now))
  }
  if (stmts.length > 0) {
    await env.DB.batch(stmts)
    await notify(env, await ownersOfChar(env, charId), { t: 'inbox' })
  }
  return response(JSON.stringify({ ok: true, created: stmts.length, skipped }))
}

/** GET /suggestions : suggestions en attente pour MES persos vérifiés. */
async function listSuggestions(env, user) {
  const rows = await env.DB.prepare(
    'SELECT s.id, s.char_id, s.kind, s.item_id, s.created, u.name AS from_name ' +
      'FROM suggestions s JOIN bindings b ON b.char_id = s.char_id AND b.verified = 1 AND b.user_id = ?1 ' +
      'LEFT JOIN users u ON u.id = s.from_user_id ORDER BY s.created DESC LIMIT 500',
  )
    .bind(user.id)
    .all()
  return response(
    JSON.stringify({
      suggestions: rows.results.map((r) => ({
        id: r.id,
        charId: r.char_id,
        kind: r.kind,
        itemId: r.item_id,
        from: r.from_name ?? '?',
        created: r.created,
      })),
    }),
  )
}

/** GET /suggestions/sent : suggestions en attente que J'AI envoyées — le
 *  front les affiche « cochées » chez le destinataire tant qu'il n'a pas
 *  tranché (un refus les supprime, la croix revient). */
async function listSentSuggestions(env, user) {
  const rows = await env.DB.prepare(
    'SELECT id, char_id, kind, item_id, created FROM suggestions ' +
      'WHERE from_user_id = ?1 ORDER BY created DESC LIMIT 500',
  )
    .bind(user.id)
    .all()
  return response(
    JSON.stringify({
      sent: rows.results.map((r) => ({
        id: r.id,
        charId: r.char_id,
        kind: r.kind,
        itemId: r.item_id,
        created: r.created,
      })),
    }),
  )
}

/** POST /suggestions/resolve {ids, accept} : accepte (coche l'objet) ou
 *  refuse — uniquement les suggestions visant mes persos vérifiés. */
async function resolveSuggestions(env, user, raw) {
  let body
  try {
    body = JSON.parse(raw)
  } catch {
    return response('{"error":"invalid body"}', 422)
  }
  const ids = Array.isArray(body?.ids) ? body.ids.filter((n) => Number.isInteger(n)) : []
  const accept = body?.accept === true
  if (ids.length === 0 || ids.length > 500) return response('{"error":"invalid ids"}', 422)

  const marks = ids.map(() => '?').join(',')
  const rows = await env.DB.prepare(
    `SELECT s.id, s.char_id, s.kind, s.item_id, s.from_user_id FROM suggestions s ` +
      `JOIN bindings b ON b.char_id = s.char_id AND b.verified = 1 AND b.user_id = ? ` +
      `WHERE s.id IN (${marks})`,
  )
    .bind(user.id, ...ids)
    .all()
  const mine = rows.results
  if (mine.length === 0) return response('{"ok":true,"accepted":0,"dismissed":0}')

  const now = Date.now()
  const stmts = []
  if (accept) {
    // Regroupe par (perso, collection) puis fusionne dans les coches.
    const byKey = new Map()
    for (const s of mine) {
      const key = `${s.char_id}|${s.kind}`
      const arr = byKey.get(key) ?? []
      arr.push(s.item_id)
      byKey.set(key, arr)
    }
    const upsert = env.DB.prepare(
      'INSERT INTO collections (char_id, kind, ids, updated, source) VALUES (?1, ?2, ?3, ?4, ?5) ' +
        'ON CONFLICT(char_id, kind) DO UPDATE SET ids=?3, updated=?4, source=?5',
    )
    for (const [key, itemIds] of byKey) {
      const [charId, kind] = key.split('|')
      const cur = await env.DB.prepare(
        'SELECT ids FROM collections WHERE char_id = ?1 AND kind = ?2',
      )
        .bind(Number(charId), kind)
        .first()
      const merged = [...new Set([...(cur ? JSON.parse(cur.ids) : []), ...itemIds])]
      stmts.push(upsert.bind(Number(charId), kind, JSON.stringify(merged), now, 'user'))
    }
  }
  const del = env.DB.prepare(`DELETE FROM suggestions WHERE id IN (${mine.map(() => '?').join(',')})`)
  stmts.push(del.bind(...mine.map((s) => s.id)))
  await env.DB.batch(stmts)
  // Temps réel : les expéditeurs voient leur ✓ dorée se résoudre ; si accepté,
  // les co-membres voient la fiche du perso changer.
  await notify(env, mine.map((s) => s.from_user_id), { t: 'inbox' })
  if (accept) {
    const chars = [...new Set(mine.map((s) => s.char_id))]
    for (const charId of chars) {
      await notify(env, await usersSharingChar(env, charId), { t: 'char', id: charId })
    }
  }
  return response(
    JSON.stringify({ ok: true, accepted: accept ? mine.length : 0, dismissed: accept ? 0 : mine.length }),
  )
}

// ----------------------------------------------------------------- contacts
// Amis (consentement mutuel) + blacklist globale silencieuse + invitations
// directes de groupe. Tables : contacts (demandeur → destinataire, pending
// puis accepted), contact_codes (lien #c=…, révocable), blocks,
// group_invites (acceptées depuis la cloche).

const MAX_PENDING_CONTACTS = 100

/** L'un des deux bloque l'autre ? (toute interaction meurt en silence) */
async function blockedEither(env, a, b) {
  const row = await env.DB.prepare(
    'SELECT 1 AS x FROM blocks WHERE (user_id = ?1 AND blocked_id = ?2) OR (user_id = ?2 AND blocked_id = ?1)',
  )
    .bind(a, b)
    .first()
  return !!row
}

async function areFriends(env, a, b) {
  const row = await env.DB.prepare(
    "SELECT 1 AS x FROM contacts WHERE status = 'accepted' AND " +
      '((user_id = ?1 AND friend_id = ?2) OR (user_id = ?2 AND friend_id = ?1))',
  )
    .bind(a, b)
    .first()
  return !!row
}

/** Code de contact de l'utilisateur — créé paresseusement au premier accès. */
async function myContactCode(env, userId) {
  const row = await env.DB.prepare('SELECT code FROM contact_codes WHERE user_id = ?1')
    .bind(userId)
    .first()
  if (row) return row.code
  const code = newInviteCode()
  await env.DB.prepare(
    'INSERT INTO contact_codes (user_id, code, created) VALUES (?1, ?2, ?3) ' +
      'ON CONFLICT(user_id) DO NOTHING',
  )
    .bind(userId, code, Date.now())
    .run()
  const fresh = await env.DB.prepare('SELECT code FROM contact_codes WHERE user_id = ?1')
    .bind(userId)
    .first()
  return fresh.code
}

/** GET /contacts : amis (avec persos vérifiés), demandes, bloqués, mon code. */
async function listContacts(env, user) {
  const [friendRows, blockRows, code] = await Promise.all([
    env.DB.prepare(
      'SELECT c.user_id, c.friend_id, c.status, c.created, ' +
        'u1.name AS from_name, u1.avatar AS from_avatar, ' +
        'u2.name AS to_name, u2.avatar AS to_avatar ' +
        'FROM contacts c ' +
        'LEFT JOIN users u1 ON u1.id = c.user_id ' +
        'LEFT JOIN users u2 ON u2.id = c.friend_id ' +
        'WHERE c.user_id = ?1 OR c.friend_id = ?1',
    )
      .bind(user.id)
      .all(),
    env.DB.prepare(
      'SELECT b.blocked_id, u.name FROM blocks b LEFT JOIN users u ON u.id = b.blocked_id ' +
        'WHERE b.user_id = ?1',
    )
      .bind(user.id)
      .all(),
    myContactCode(env, user.id),
  ])
  const friends = []
  const pendingIn = []
  const pendingOut = []
  for (const r of friendRows.results) {
    const mine = r.user_id === user.id
    const other = mine
      ? { userId: r.friend_id, name: r.to_name ?? '?', avatar: r.to_avatar ?? '' }
      : { userId: r.user_id, name: r.from_name ?? '?', avatar: r.from_avatar ?? '' }
    if (r.status === 'accepted') friends.push(other)
    else if (mine) pendingOut.push({ ...other, created: r.created })
    else pendingIn.push({ ...other, created: r.created })
  }
  // Persos vérifiés des amis : la fiche contact montre leur progression.
  if (friends.length > 0) {
    const marks = friends.map(() => '?').join(',')
    const chars = await env.DB.prepare(
      `SELECT user_id, char_id FROM bindings WHERE verified = 1 AND user_id IN (${marks})`,
    )
      .bind(...friends.map((f) => f.userId))
      .all()
    const byUser = new Map()
    for (const c of chars.results) {
      if (!byUser.has(c.user_id)) byUser.set(c.user_id, [])
      byUser.get(c.user_id).push(c.char_id)
    }
    for (const f of friends) f.chars = byUser.get(f.userId) ?? []
  }
  return response(
    JSON.stringify({
      friends,
      pendingIn,
      pendingOut,
      blocked: blockRows.results.map((r) => ({ userId: r.blocked_id, name: r.name ?? '?' })),
      code,
    }),
  )
}

/** POST /contacts/rotate : nouveau code — l'ancien lien de contact meurt. */
async function rotateContactCode(env, user) {
  const code = newInviteCode()
  await env.DB.prepare(
    'INSERT INTO contact_codes (user_id, code, created) VALUES (?1, ?2, ?3) ' +
      'ON CONFLICT(user_id) DO UPDATE SET code = ?2, created = ?3',
  )
    .bind(user.id, code, Date.now())
    .run()
  return response(JSON.stringify({ code }))
}

/** GET /contact/:code : aperçu du bandeau (nom + état vis-à-vis de moi). */
async function contactPreview(env, code, caller) {
  const row = await env.DB.prepare(
    'SELECT c.user_id, u.name, u.avatar FROM contact_codes c ' +
      'LEFT JOIN users u ON u.id = c.user_id WHERE c.code = ?1',
  )
    .bind(code)
    .first()
  if (!row) return response('{"error":"no such contact"}', 404)
  let status = 'none'
  if (caller) {
    if (caller.id === row.user_id) status = 'self'
    else if (await blockedEither(env, caller.id, row.user_id)) status = 'none' // silence
    else if (await areFriends(env, caller.id, row.user_id)) status = 'friend'
    else {
      const pending = await env.DB.prepare(
        "SELECT user_id FROM contacts WHERE status = 'pending' AND " +
          '((user_id = ?1 AND friend_id = ?2) OR (user_id = ?2 AND friend_id = ?1))',
      )
        .bind(caller.id, row.user_id)
        .first()
      if (pending) status = pending.user_id === caller.id ? 'pending' : 'pendingIn'
    }
  }
  return response(JSON.stringify({ name: row.name ?? '?', avatar: row.avatar ?? '', status }))
}

/** Cœur d'une demande d'ami (par code ou par membre de groupe commun). */
async function contactRequestCore(env, me, targetId) {
  if (me === targetId) return response('{"status":"self"}')
  // Bloqué (dans un sens ou l'autre) : on répond « envoyé » sans rien créer.
  if (await blockedEither(env, me, targetId)) return response('{"status":"pending"}')
  if (await areFriends(env, me, targetId)) return response('{"status":"friend"}')
  const now = Date.now()
  // Il m'avait déjà demandé : accord mutuel immédiat.
  const reverse = await env.DB.prepare(
    "SELECT 1 AS x FROM contacts WHERE user_id = ?1 AND friend_id = ?2 AND status = 'pending'",
  )
    .bind(targetId, me)
    .first()
  if (reverse) {
    await env.DB.prepare(
      "UPDATE contacts SET status = 'accepted', created = ?3 WHERE user_id = ?1 AND friend_id = ?2",
    )
      .bind(targetId, me, now)
      .run()
    await notify(env, [me, targetId], { t: 'inbox' })
    return response('{"status":"friend"}')
  }
  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM contacts WHERE user_id = ?1 AND status = 'pending'",
  )
    .bind(me)
    .first()
  if (count.n >= MAX_PENDING_CONTACTS) return response('{"error":"too many requests"}', 429)
  await env.DB.prepare(
    "INSERT INTO contacts (user_id, friend_id, status, created) VALUES (?1, ?2, 'pending', ?3) " +
      'ON CONFLICT(user_id, friend_id) DO NOTHING',
  )
    .bind(me, targetId, now)
    .run()
  await notify(env, [targetId], { t: 'inbox' })
  return response('{"status":"pending"}')
}

/** POST /contacts/request {code} OU {userId} (membre d'un groupe online commun). */
async function requestContact(env, user, raw) {
  let body
  try {
    body = JSON.parse(raw || '{}')
  } catch {
    return response('{"error":"invalid body"}', 422)
  }
  if (typeof body.code === 'string') {
    const row = await env.DB.prepare('SELECT user_id FROM contact_codes WHERE code = ?1')
      .bind(body.code)
      .first()
    if (!row) return response('{"error":"no such contact"}', 404)
    return contactRequestCore(env, user.id, row.user_id)
  }
  if (typeof body.userId === 'string') {
    // Réservé aux co-membres d'un groupe online : pas d'annuaire public.
    const shared = await env.DB.prepare(
      'SELECT 1 AS x FROM group_links l1 JOIN group_links l2 ON l2.group_id = l1.group_id ' +
        'JOIN groups g ON g.id = l1.group_id AND g.shared = 1 ' +
        'WHERE l1.user_id = ?1 AND l2.user_id = ?2',
    )
      .bind(user.id, body.userId)
      .first()
    if (!shared) return response('{"error":"not in a common group"}', 403)
    return contactRequestCore(env, user.id, body.userId)
  }
  return response('{"error":"invalid body"}', 422)
}

/** POST /contacts/respond {userId, accept} : accepter/refuser une demande reçue. */
async function respondContact(env, user, raw) {
  let body
  try {
    body = JSON.parse(raw || '{}')
  } catch {
    return response('{"error":"invalid body"}', 422)
  }
  if (typeof body.userId !== 'string') return response('{"error":"invalid body"}', 422)
  if (body.accept) {
    await env.DB.prepare(
      "UPDATE contacts SET status = 'accepted' WHERE user_id = ?1 AND friend_id = ?2 AND status = 'pending'",
    )
      .bind(body.userId, user.id)
      .run()
  } else {
    await env.DB.prepare(
      "DELETE FROM contacts WHERE user_id = ?1 AND friend_id = ?2 AND status = 'pending'",
    )
      .bind(body.userId, user.id)
      .run()
  }
  await notify(env, [body.userId], { t: 'inbox' })
  return response('{"ok":true}')
}

/** DELETE /contacts/:userId : retirer un ami (ou annuler ma demande). */
async function removeContact(env, user, targetId) {
  await env.DB.prepare(
    'DELETE FROM contacts WHERE (user_id = ?1 AND friend_id = ?2) OR (user_id = ?2 AND friend_id = ?1)',
  )
    .bind(user.id, targetId)
    .run()
  return response('{"ok":true}')
}

/** POST /blocks {userId} : blocage global — purge amitié, demandes en cours,
 *  invitations, demandes d'entrée sur MES groupes et suggestions vers MES
 *  persos. Le bloqué ne reçoit aucun signal. */
async function setBlock(env, user, raw) {
  let targetId
  try {
    targetId = JSON.parse(raw || '{}')?.userId
  } catch {
    return response('{"error":"invalid body"}', 422)
  }
  if (typeof targetId !== 'string' || targetId === user.id)
    return response('{"error":"invalid body"}', 422)
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO blocks (user_id, blocked_id, created) VALUES (?1, ?2, ?3) ' +
        'ON CONFLICT(user_id, blocked_id) DO NOTHING',
    ).bind(user.id, targetId, Date.now()),
    env.DB.prepare(
      'DELETE FROM contacts WHERE (user_id = ?1 AND friend_id = ?2) OR (user_id = ?2 AND friend_id = ?1)',
    ).bind(user.id, targetId),
    env.DB.prepare(
      'DELETE FROM group_invites WHERE (from_user_id = ?1 AND to_user_id = ?2) OR (from_user_id = ?2 AND to_user_id = ?1)',
    ).bind(user.id, targetId),
    env.DB.prepare(
      'DELETE FROM group_requests WHERE user_id = ?2 AND group_id IN (SELECT id FROM groups WHERE owner_user_id = ?1)',
    ).bind(user.id, targetId),
    env.DB.prepare(
      'DELETE FROM suggestions WHERE from_user_id = ?2 AND char_id IN ' +
        '(SELECT char_id FROM bindings WHERE user_id = ?1 AND verified = 1)',
    ).bind(user.id, targetId),
  ])
  return response('{"ok":true}')
}

/** DELETE /blocks/:userId : débloquer. */
async function removeBlock(env, user, targetId) {
  await env.DB.prepare('DELETE FROM blocks WHERE user_id = ?1 AND blocked_id = ?2')
    .bind(user.id, targetId)
    .run()
  return response('{"ok":true}')
}

/** POST /group/:id/invite {userId} : le propriétaire invite un AMI dans son
 *  groupe online — il acceptera depuis sa cloche (pas de validation en plus :
 *  les deux consentements sont déjà là). */
async function inviteToGroup(env, user, groupId, raw) {
  const row = await groupRow(env, groupId)
  if (!row || row.owner_user_id !== user.id) return response('{"error":"no such group"}', 404)
  if (!row.shared) return response('{"error":"not a shared group"}', 403)
  let targetId
  try {
    targetId = JSON.parse(raw || '{}')?.userId
  } catch {
    return response('{"error":"invalid body"}', 422)
  }
  if (typeof targetId !== 'string') return response('{"error":"invalid body"}', 422)
  if (!(await areFriends(env, user.id, targetId))) return response('{"error":"not friends"}', 403)
  if (await hasLink(env, targetId, groupId)) return response('{"status":"member"}')
  await env.DB.prepare(
    'INSERT INTO group_invites (group_id, from_user_id, to_user_id, created) VALUES (?1, ?2, ?3, ?4) ' +
      'ON CONFLICT(group_id, to_user_id) DO UPDATE SET from_user_id = ?2, created = ?4',
  )
    .bind(groupId, user.id, targetId, Date.now())
    .run()
  await notify(env, [targetId], { t: 'inbox' })
  return response('{"status":"invited"}')
}

/** POST /group-invites/respond {groupId, accept, charId} : accepter (avec le
 *  perso vérifié choisi) ou décliner une invitation directe. */
async function respondGroupInvite(env, user, raw) {
  let body
  try {
    body = JSON.parse(raw || '{}')
  } catch {
    return response('{"error":"invalid body"}', 422)
  }
  const invite = await env.DB.prepare(
    'SELECT from_user_id FROM group_invites WHERE group_id = ?1 AND to_user_id = ?2',
  )
    .bind(body.groupId, user.id)
    .first()
  if (!invite) return response('{"error":"no such invite"}', 404)
  if (!body.accept) {
    await env.DB.prepare('DELETE FROM group_invites WHERE group_id = ?1 AND to_user_id = ?2')
      .bind(body.groupId, user.id)
      .run()
    return response('{"ok":true}')
  }
  if (!validCharId(body.charId)) return response('{"error":"invalid charId"}', 422)
  if (!(await verifiedBinding(env, user.id, body.charId)))
    return response('{"error":"not the verified owner"}', 403)
  const now = Date.now()
  if (!(await insertMember(env, body.groupId, body.charId, user.id, now)))
    return response('{"error":"group full"}', 409)
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO group_links (user_id, group_id, added) VALUES (?1, ?2, ?3) ' +
        'ON CONFLICT DO NOTHING',
    ).bind(user.id, body.groupId, now),
    env.DB.prepare('DELETE FROM group_invites WHERE group_id = ?1 AND to_user_id = ?2').bind(
      body.groupId,
      user.id,
    ),
  ])
  const linked = await env.DB.prepare('SELECT user_id FROM group_links WHERE group_id = ?1')
    .bind(body.groupId)
    .all()
  await notify(env, linked.results.map((r) => r.user_id), { t: 'groups' })
  return response('{"ok":true}')
}

/** GET /inbox : tout ce que porte la cloche en UN appel — suggestions reçues,
 *  clés de mes suggestions envoyées, demandes d'ami, invitations de groupe. */
async function inbox(env, user) {
  const [sugg, sent, friendReqs, invites] = await Promise.all([
    env.DB.prepare(
      'SELECT s.id, s.char_id, s.kind, s.item_id, s.created, u.name AS from_name ' +
        'FROM suggestions s JOIN bindings b ON b.char_id = s.char_id AND b.verified = 1 AND b.user_id = ?1 ' +
        'LEFT JOIN users u ON u.id = s.from_user_id ORDER BY s.created DESC LIMIT 500',
    )
      .bind(user.id)
      .all(),
    env.DB.prepare(
      'SELECT id, char_id, kind, item_id, created FROM suggestions ' +
        'WHERE from_user_id = ?1 ORDER BY created DESC LIMIT 500',
    )
      .bind(user.id)
      .all(),
    env.DB.prepare(
      "SELECT c.user_id, c.created, u.name, u.avatar FROM contacts c " +
        'LEFT JOIN users u ON u.id = c.user_id ' +
        "WHERE c.friend_id = ?1 AND c.status = 'pending' ORDER BY c.created DESC LIMIT 100",
    )
      .bind(user.id)
      .all(),
    env.DB.prepare(
      'SELECT i.group_id, i.created, g.name AS group_name, u.name AS from_name ' +
        'FROM group_invites i JOIN groups g ON g.id = i.group_id ' +
        'LEFT JOIN users u ON u.id = i.from_user_id ' +
        'WHERE i.to_user_id = ?1 ORDER BY i.created DESC LIMIT 100',
    )
      .bind(user.id)
      .all(),
  ])
  return response(
    JSON.stringify({
      suggestions: sugg.results.map((r) => ({
        id: r.id,
        charId: r.char_id,
        kind: r.kind,
        itemId: r.item_id,
        from: r.from_name ?? '?',
        created: r.created,
      })),
      sent: sent.results.map((r) => ({
        id: r.id,
        charId: r.char_id,
        kind: r.kind,
        itemId: r.item_id,
        created: r.created,
      })),
      friendRequests: friendReqs.results.map((r) => ({
        userId: r.user_id,
        name: r.name ?? '?',
        avatar: r.avatar ?? '',
        created: r.created,
      })),
      groupInvites: invites.results.map((r) => ({
        groupId: r.group_id,
        groupName: r.group_name,
        from: r.from_name ?? '?',
        created: r.created,
      })),
    }),
  )
}

// -------------------------------------------------------------------- admin
// Espace super-admin : réservé au compte ADMIN_USER_ID (wrangler.toml). Vue
// d'ensemble (comptes, persos, groupes, activité) et actions ciblées. Les
// routes /admin/* répondent 404 aux autres — l'espace n'existe pas pour eux.

function isAdmin(env, user) {
  return !!user && !!env.ADMIN_USER_ID && user.id === env.ADMIN_USER_ID
}

/** GET /admin/overview : tuiles + listes pour le tableau de bord. */
async function adminOverview(env) {
  const now = Date.now()
  const [
    users,
    bindings,
    chars,
    groups,
    sessions,
    suggPending,
    contactsAgg,
    blocksN,
    reqN,
    colSources,
    friendsBy,
    suggSentBy,
    checkedBy,
    suggList,
    reqList,
    activityA,
    activityB,
    volumes,
  ] = await Promise.all([
      env.DB.prepare('SELECT id, name, avatar, created FROM users ORDER BY created').all(),
      env.DB.prepare('SELECT user_id, char_id, verified FROM bindings').all(),
      env.DB.prepare(
        'SELECT id, name, server, dc, updated, forced_at FROM characters ORDER BY updated DESC',
      ).all(),
      env.DB.prepare(
        'SELECT g.id, g.name, g.shared, g.created, g.owner_user_id, u.name AS owner_name, ' +
          '(SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) AS members ' +
          'FROM groups g LEFT JOIN users u ON u.id = g.owner_user_id ORDER BY g.created',
      ).all(),
      env.DB.prepare(
        'SELECT user_id, COUNT(*) AS n, MAX(created) AS last FROM tokens WHERE expires > ?1 GROUP BY user_id',
      )
        .bind(now)
        .all(),
      env.DB.prepare('SELECT COUNT(*) AS n FROM suggestions').first(),
      env.DB.prepare(
        "SELECT SUM(status = 'accepted') AS friends, SUM(status = 'pending') AS pending FROM contacts",
      ).first(),
      env.DB.prepare('SELECT COUNT(*) AS n FROM blocks').first(),
      env.DB.prepare('SELECT COUNT(*) AS n FROM group_requests').first(),
      env.DB.prepare('SELECT source, COUNT(*) AS n FROM collections GROUP BY source').all(),
      // Amis par compte (l'amitié se lit dans les deux sens)
      env.DB.prepare(
        "SELECT uid, COUNT(*) AS n FROM (SELECT user_id AS uid FROM contacts WHERE status = 'accepted' " +
          "UNION ALL SELECT friend_id AS uid FROM contacts WHERE status = 'accepted') GROUP BY uid",
      ).all(),
      env.DB.prepare(
        'SELECT from_user_id AS uid, COUNT(*) AS n FROM suggestions GROUP BY from_user_id',
      ).all(),
      // Objets cochés par perso, toutes collections confondues
      env.DB.prepare(
        'SELECT char_id, SUM(json_array_length(ids)) AS n FROM collections GROUP BY char_id',
      ).all(),
      env.DB.prepare(
        'SELECT s.kind, s.item_id, s.created, u.name AS from_name, c.name AS char_name ' +
          'FROM suggestions s LEFT JOIN users u ON u.id = s.from_user_id ' +
          'LEFT JOIN characters c ON c.id = s.char_id ORDER BY s.created DESC LIMIT 50',
      ).all(),
      env.DB.prepare(
        'SELECT r.created, r.char_id, u.name AS user_name, g.name AS group_name ' +
          'FROM group_requests r LEFT JOIN users u ON u.id = r.user_id ' +
          'LEFT JOIN groups g ON g.id = r.group_id ORDER BY r.created DESC LIMIT 50',
      ).all(),
      // Journal d'activité : tout ce qui porte un timestamp — en DEUX requêtes
      // (D1 plafonne les termes d'un UNION composé), fusionnées côté JS.
      env.DB.prepare(
        "SELECT 'signup' AS type, COALESCE(name, '?') AS a, '' AS b, created AS created FROM users " +
          "UNION ALL SELECT 'group', COALESCE(u.name, '?'), g.name, g.created FROM groups g LEFT JOIN users u ON u.id = g.owner_user_id " +
          "UNION ALL SELECT 'ginvite', COALESCE(u1.name, '?'), g.name, i.created FROM group_invites i " +
          'LEFT JOIN users u1 ON u1.id = i.from_user_id LEFT JOIN groups g ON g.id = i.group_id ' +
          'ORDER BY created DESC LIMIT 40',
      ).all(),
      env.DB.prepare(
        "SELECT 'suggestion' AS type, COALESCE(u.name, '?') AS a, COALESCE(c.name, CAST(s.char_id AS TEXT)) AS b, s.created AS created " +
          'FROM suggestions s LEFT JOIN users u ON u.id = s.from_user_id LEFT JOIN characters c ON c.id = s.char_id ' +
          "UNION ALL SELECT CASE ct.status WHEN 'accepted' THEN 'friend' ELSE 'contactReq' END, " +
          "COALESCE(u1.name, '?'), COALESCE(u2.name, '?'), ct.created FROM contacts ct " +
          'LEFT JOIN users u1 ON u1.id = ct.user_id LEFT JOIN users u2 ON u2.id = ct.friend_id ' +
          "UNION ALL SELECT 'grequest', COALESCE(u.name, '?'), COALESCE(g.name, '?'), r.created FROM group_requests r " +
          'LEFT JOIN users u ON u.id = r.user_id LEFT JOIN groups g ON g.id = r.group_id ' +
          'ORDER BY created DESC LIMIT 40',
      ).all(),
      env.DB.prepare(
        'SELECT (SELECT COUNT(*) FROM collections) AS collections, (SELECT COUNT(*) FROM rooms) AS rooms, ' +
          '(SELECT COUNT(*) FROM tokens) AS tokens',
      ).first(),
    ])

  const verifiedBy = new Map() // user → persos vérifiés
  const ownerOf = new Map() // char → {userId, verified}
  for (const b of bindings.results) {
    if (b.verified) {
      verifiedBy.set(b.user_id, (verifiedBy.get(b.user_id) ?? 0) + 1)
      ownerOf.set(b.char_id, b.user_id)
    }
  }
  const ownedBy = new Map()
  for (const g of groups.results) {
    ownedBy.set(g.owner_user_id, (ownedBy.get(g.owner_user_id) ?? 0) + 1)
  }
  const sessionsBy = new Map(sessions.results.map((s) => [s.user_id, s]))
  const nameOf = new Map(users.results.map((u) => [u.id, u.name]))
  const friendsOf = new Map(friendsBy.results.map((r) => [r.uid, r.n]))
  const suggSentOf = new Map(suggSentBy.results.map((r) => [r.uid, r.n]))
  const checkedOf = new Map(checkedBy.results.map((r) => [r.char_id, r.n ?? 0]))

  return response(
    JSON.stringify({
      tiles: {
        users: users.results.length,
        characters: chars.results.length,
        verifiedChars: ownerOf.size,
        groups: groups.results.length,
        onlineGroups: groups.results.filter((g) => g.shared).length,
        suggestions: suggPending?.n ?? 0,
        friendships: contactsAgg?.friends ?? 0,
        pendingContacts: contactsAgg?.pending ?? 0,
        blocks: blocksN?.n ?? 0,
        joinRequests: reqN?.n ?? 0,
        sessions: sessions.results.reduce((s, r) => s + r.n, 0),
      },
      collectionSources: Object.fromEntries(colSources.results.map((r) => [r.source, r.n])),
      users: users.results.map((u) => ({
        id: u.id,
        name: u.name ?? '?',
        avatar: u.avatar ?? '',
        created: u.created,
        verifiedChars: verifiedBy.get(u.id) ?? 0,
        ownedGroups: ownedBy.get(u.id) ?? 0,
        friends: friendsOf.get(u.id) ?? 0,
        suggSent: suggSentOf.get(u.id) ?? 0,
        sessions: sessionsBy.get(u.id)?.n ?? 0,
        lastSeen: sessionsBy.get(u.id)?.last ?? null,
      })),
      characters: chars.results.map((c) => ({
        id: c.id,
        name: c.name,
        server: c.server,
        dc: c.dc,
        updated: c.updated,
        forcedAt: c.forced_at ?? null,
        owner: ownerOf.has(c.id) ? (nameOf.get(ownerOf.get(c.id)) ?? '?') : null,
        checked: checkedOf.get(c.id) ?? 0,
      })),
      groups: groups.results.map((g) => ({
        id: g.id,
        name: g.name,
        shared: !!g.shared,
        created: g.created,
        owner: g.owner_name ?? g.owner_user_id,
        members: g.members,
      })),
      pendingSuggestions: suggList.results.map((s) => ({
        from: s.from_name ?? '?',
        charName: s.char_name ?? '?',
        kind: s.kind,
        itemId: s.item_id,
        created: s.created,
      })),
      pendingRequests: reqList.results.map((r) => ({
        user: r.user_name ?? '?',
        charId: r.char_id,
        group: r.group_name ?? '?',
        created: r.created,
      })),
      activity: [...activityA.results, ...activityB.results]
        .sort((x, y) => y.created - x.created)
        .slice(0, 40),
      volumes,
    }),
  )
}

/** POST /admin/character/:id/refresh : marque la fiche périmée (re-scrape au
 *  prochain affichage — un seul perso, pas de rafale) et rend la synchro
 *  forcée au joueur. */
async function adminRefreshChar(env, id) {
  const r = await env.DB.prepare(
    'UPDATE characters SET updated = ?2, forced_at = NULL WHERE id = ?1',
  )
    .bind(id, Date.now() - CHAR_TTL - 1000)
    .run()
  return response(JSON.stringify({ ok: true, found: r.meta.changes > 0 }))
}

/** DELETE /admin/group/:id : suppression complète, quel qu'en soit le proprio. */
async function adminDeleteGroup(env, id) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM group_members WHERE group_id = ?1').bind(id),
    env.DB.prepare('DELETE FROM group_links WHERE group_id = ?1').bind(id),
    env.DB.prepare('DELETE FROM group_requests WHERE group_id = ?1').bind(id),
    env.DB.prepare('DELETE FROM group_bans WHERE group_id = ?1').bind(id),
    env.DB.prepare('DELETE FROM group_invites WHERE group_id = ?1').bind(id),
    env.DB.prepare('DELETE FROM groups WHERE id = ?1').bind(id),
  ])
  return response('{"ok":true}')
}

/** DELETE /admin/user/:id : purge complète d'un compte — ses groupes, ses
 *  liaisons, ses contacts, ses sessions. Les fiches de persos restent (elles
 *  sont publiques et resservent). L'admin ne peut pas se supprimer lui-même. */
async function adminDeleteUser(env, admin, targetId) {
  if (targetId === admin.id) return response('{"error":"cannot delete yourself"}', 422)
  const target = await env.DB.prepare('SELECT id FROM users WHERE id = ?1').bind(targetId).first()
  if (!target) return response('{"error":"no such user"}', 404)
  const owned = await env.DB.prepare('SELECT id FROM groups WHERE owner_user_id = ?1')
    .bind(targetId)
    .all()
  const verifiedChars = await env.DB.prepare(
    'SELECT char_id FROM bindings WHERE user_id = ?1 AND verified = 1',
  )
    .bind(targetId)
    .all()
  const stmts = []
  for (const g of owned.results) {
    for (const table of [
      'group_members',
      'group_links',
      'group_requests',
      'group_bans',
      'group_invites',
    ]) {
      stmts.push(env.DB.prepare(`DELETE FROM ${table} WHERE group_id = ?1`).bind(g.id))
    }
    stmts.push(env.DB.prepare('DELETE FROM groups WHERE id = ?1').bind(g.id))
  }
  // Ses persos vérifiés sortent des groupes online restants (les groupes
  // privés d'autrui les gardent : ce ne sont que des persos suivis).
  for (const c of verifiedChars.results) {
    stmts.push(
      env.DB.prepare(
        'DELETE FROM group_members WHERE char_id = ?1 AND group_id IN (SELECT id FROM groups WHERE shared = 1)',
      ).bind(c.char_id),
    )
    stmts.push(env.DB.prepare('DELETE FROM suggestions WHERE char_id = ?1').bind(c.char_id))
  }
  stmts.push(
    env.DB.prepare('DELETE FROM group_links WHERE user_id = ?1').bind(targetId),
    env.DB.prepare('DELETE FROM group_requests WHERE user_id = ?1').bind(targetId),
    env.DB.prepare('DELETE FROM group_bans WHERE user_id = ?1').bind(targetId),
    env.DB.prepare(
      'DELETE FROM group_invites WHERE from_user_id = ?1 OR to_user_id = ?1',
    ).bind(targetId),
    env.DB.prepare('DELETE FROM contacts WHERE user_id = ?1 OR friend_id = ?1').bind(targetId),
    env.DB.prepare('DELETE FROM contact_codes WHERE user_id = ?1').bind(targetId),
    env.DB.prepare('DELETE FROM blocks WHERE user_id = ?1 OR blocked_id = ?1').bind(targetId),
    env.DB.prepare('DELETE FROM suggestions WHERE from_user_id = ?1').bind(targetId),
    env.DB.prepare('DELETE FROM bindings WHERE user_id = ?1').bind(targetId),
    env.DB.prepare('DELETE FROM tokens WHERE user_id = ?1').bind(targetId),
    env.DB.prepare('DELETE FROM users WHERE id = ?1').bind(targetId),
  )
  await env.DB.batch(stmts)
  return response('{"ok":true}')
}

/** POST /admin/purge-tokens : supprime les sessions expirées. */
async function adminPurgeTokens(env) {
  const r = await env.DB.prepare('DELETE FROM tokens WHERE expires < ?1').bind(Date.now()).run()
  return response(JSON.stringify({ ok: true, purged: r.meta.changes }))
}

// ------------------------------------------------------------ recherche perso
// GET /search-character?name=…&server=… (auth) : recherche Lodestone par nom
// — fini la chasse à l'ID, on clique sur son perso dans les résultats.

async function searchCharacter(env, url) {
  const name = (url.searchParams.get('name') ?? '').trim()
  const server = (url.searchParams.get('server') ?? '').trim()
  if (name.length < 2) return response('{"error":"name too short"}', 422)
  const target = new URL('https://eu.finalfantasyxiv.com/lodestone/character/')
  target.searchParams.set('q', name)
  if (server) target.searchParams.set('worldname', server)
  const res = await fetch(target.toString(), {
    headers: { 'User-Agent': MOBILE_UA, 'Accept-Language': 'fr' },
  })
  if (!res.ok) return response('{"error":"lodestone unavailable"}', 502)
  const html = await res.text()
  const unescape = (s) =>
    s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  const results = []
  const re =
    /href="\/lodestone\/character\/(\d+)\/" class="entry__chara__link"[\s\S]*?<img src="([^"]+)"[\s\S]*?entry__name">([^<]+)<[\s\S]*?entry__world">(?:<i[^>]*><\/i>)?([^<]+)</g
  let m
  while ((m = re.exec(html)) !== null && results.length < 12) {
    const world = m[4].trim()
    const wm = world.match(/^(.+?)\s*\[(.+)\]$/)
    results.push({
      id: Number(m[1]),
      avatar: m[2],
      name: unescape(m[3].trim()),
      server: wm ? wm[1] : world,
      dc: wm ? wm[2] : '',
    })
  }
  return response(JSON.stringify({ results }))
}

// --------------------------------------------------------------- temps réel
// Un salon WebSocket par utilisateur (Durable Object en hibernation : les
// connexions inactives ne coûtent rien). Le worker notifie les salons après
// chaque mutation ; le front rafraîchit à la réception. Le poll de 90 s du
// front reste en filet de secours si le socket tombe.

export class LiveHub {
  constructor(state) {
    this.state = state
    // ping/pong répondu par la plateforme sans réveiller l'objet
    this.state.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong'),
    )
  }

  async fetch(req) {
    const url = new URL(req.url)
    if (req.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair()
      this.state.acceptWebSocket(pair[1])
      return new Response(null, { status: 101, webSocket: pair[0] })
    }
    if (url.pathname === '/send' && req.method === 'POST') {
      const msg = await req.text()
      for (const ws of this.state.getWebSockets()) {
        try {
          ws.send(msg)
        } catch {
          // socket mourant : le close fera le ménage
        }
      }
      return new Response('{"ok":true}')
    }
    return new Response('{"error":"not found"}', { status: 404 })
  }

  webSocketClose(ws) {
    try {
      ws.close()
    } catch {
      // déjà fermé
    }
  }
}

/** Envoie un événement aux salons des utilisateurs visés (au mieux : un salon
 *  sans connexion avale le message sans bruit). */
async function notify(env, userIds, event) {
  const body = JSON.stringify(event)
  await Promise.all(
    [...new Set(userIds)].filter(Boolean).map((id) =>
      env.LIVE.get(env.LIVE.idFromName(`user:${id}`))
        .fetch('https://live/send', { method: 'POST', body })
        .catch(() => {}),
    ),
  )
}

/** Comptes qui voient le perso dans un groupe online (co-membres). */
async function usersSharingChar(env, charId) {
  const rows = await env.DB.prepare(
    'SELECT DISTINCT l.user_id FROM group_links l ' +
      'JOIN groups g ON g.id = l.group_id AND g.shared = 1 ' +
      'JOIN group_members m ON m.group_id = g.id WHERE m.char_id = ?1',
  )
    .bind(charId)
    .all()
  return rows.results.map((r) => r.user_id)
}

/** Comptes propriétaires (vérifiés) d'un perso. */
async function ownersOfChar(env, charId) {
  const rows = await env.DB.prepare(
    'SELECT user_id FROM bindings WHERE char_id = ?1 AND verified = 1',
  )
    .bind(charId)
    .all()
  return rows.results.map((r) => r.user_id)
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
    const charMatch = url.pathname.match(
      /^\/character\/(\d{1,12})(\/seed|\/collections|\/collect-sync)?$/,
    )
    if (charMatch) {
      const id = Number(charMatch[1])
      if (charMatch[2] === '/collect-sync' && req.method === 'POST') {
        const user = await authenticate(env, req)
        if (!user) return response('{"error":"unauthorized"}', 401)
        const raw = await req.text()
        if (raw.length > 262_144) return response('{"error":"too large"}', 413)
        return collectSync(env, user, id, raw)
      }
      if (charMatch[2] === '/seed' && req.method === 'POST') {
        const raw = await req.text()
        if (raw.length > 262_144) return response('{"error":"too large"}', 413)
        // L'amorçage reste ouvert (il part dès la première visite d'une fiche,
        // avant toute connexion), mais seulement pour un personnage déjà lu
        // sur le Lodestone : sinon n'importe qui remplissait la base avec des
        // identifiants inventés, 13 lignes par appel et sans plafond.
        const known = await env.DB.prepare('SELECT 1 AS ok FROM characters WHERE id = ?1')
          .bind(id)
          .first()
        if (!known) return response('{"error":"unknown character"}', 404)
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

    // --- suggestions : POST /suggest · GET /suggestions · POST /suggestions/resolve
    if (url.pathname === '/suggest' && req.method === 'POST') {
      const user = await authenticate(env, req)
      if (!user) return response('{"error":"unauthorized"}', 401)
      return createSuggestions(env, user, await req.text())
    }
    if (url.pathname === '/suggestions' && req.method === 'GET') {
      const user = await authenticate(env, req)
      if (!user) return response('{"error":"unauthorized"}', 401)
      return listSuggestions(env, user)
    }
    if (url.pathname === '/suggestions/sent' && req.method === 'GET') {
      const user = await authenticate(env, req)
      if (!user) return response('{"error":"unauthorized"}', 401)
      return listSentSuggestions(env, user)
    }
    if (url.pathname === '/suggestions/resolve' && req.method === 'POST') {
      const user = await authenticate(env, req)
      if (!user) return response('{"error":"unauthorized"}', 401)
      return resolveSuggestions(env, user, await req.text())
    }

    // --- recherche de perso par nom (assistant de liaison)
    if (url.pathname === '/search-character' && req.method === 'GET') {
      const user = await authenticate(env, req)
      if (!user) return response('{"error":"unauthorized"}', 401)
      return searchCharacter(env, url)
    }

    // --- temps réel : WebSocket vers le salon de l'utilisateur
    if (url.pathname === '/ws' && req.headers.get('Upgrade') === 'websocket') {
      // Un WebSocket ne porte pas d'en-tête Authorization : jeton en query.
      const user = await authenticateToken(env, url.searchParams.get('token'))
      if (!user) return response('{"error":"unauthorized"}', 401)
      return env.LIVE.get(env.LIVE.idFromName(`user:${user.id}`)).fetch(req)
    }

    // --- admin : réservé à ADMIN_USER_ID — 404 pour tout le monde ailleurs
    if (url.pathname.startsWith('/admin/')) {
      const user = await authenticate(env, req)
      if (!isAdmin(env, user)) return response('{"error":"not found"}', 404)
      if (url.pathname === '/admin/overview' && req.method === 'GET') return adminOverview(env)
      if (url.pathname === '/admin/purge-tokens' && req.method === 'POST')
        return adminPurgeTokens(env)
      const chr = url.pathname.match(/^\/admin\/character\/(\d{1,12})\/refresh$/)
      if (chr && req.method === 'POST') return adminRefreshChar(env, Number(chr[1]))
      const grpDel = url.pathname.match(/^\/admin\/group\/([\w-]{1,80})$/)
      if (grpDel && req.method === 'DELETE') return adminDeleteGroup(env, grpDel[1])
      const usrDel = url.pathname.match(/^\/admin\/user\/([\w:.@%-]{1,240})$/)
      if (usrDel && req.method === 'DELETE')
        return adminDeleteUser(env, user, decodeURIComponent(usrDel[1]))
      return response('{"error":"not found"}', 404)
    }

    // --- contacts : amis, blacklist, invitations directes, boîte de réception
    if (url.pathname === '/inbox' && req.method === 'GET') {
      const user = await authenticate(env, req)
      if (!user) return response('{"error":"unauthorized"}', 401)
      return inbox(env, user)
    }
    if (url.pathname === '/contacts' && req.method === 'GET') {
      const user = await authenticate(env, req)
      if (!user) return response('{"error":"unauthorized"}', 401)
      return listContacts(env, user)
    }
    if (url.pathname === '/contacts/rotate' && req.method === 'POST') {
      const user = await authenticate(env, req)
      if (!user) return response('{"error":"unauthorized"}', 401)
      return rotateContactCode(env, user)
    }
    if (url.pathname === '/contacts/request' && req.method === 'POST') {
      const user = await authenticate(env, req)
      if (!user) return response('{"error":"unauthorized"}', 401)
      return requestContact(env, user, await req.text())
    }
    if (url.pathname === '/contacts/respond' && req.method === 'POST') {
      const user = await authenticate(env, req)
      if (!user) return response('{"error":"unauthorized"}', 401)
      return respondContact(env, user, await req.text())
    }
    const contactDel = url.pathname.match(/^\/contacts\/([\w:.@%-]{1,240})$/)
    if (contactDel && req.method === 'DELETE') {
      const user = await authenticate(env, req)
      if (!user) return response('{"error":"unauthorized"}', 401)
      return removeContact(env, user, decodeURIComponent(contactDel[1]))
    }
    if (url.pathname === '/blocks' && req.method === 'POST') {
      const user = await authenticate(env, req)
      if (!user) return response('{"error":"unauthorized"}', 401)
      return setBlock(env, user, await req.text())
    }
    const blockDel = url.pathname.match(/^\/blocks\/([\w:.@%-]{1,240})$/)
    if (blockDel && req.method === 'DELETE') {
      const user = await authenticate(env, req)
      if (!user) return response('{"error":"unauthorized"}', 401)
      return removeBlock(env, user, decodeURIComponent(blockDel[1]))
    }
    const contactView = url.pathname.match(/^\/contact\/([a-z0-9]{6,40})$/)
    if (contactView && req.method === 'GET') {
      const user = await authenticate(env, req)
      return contactPreview(env, contactView[1], user)
    }
    const groupInvite = url.pathname.match(/^\/group\/([\w-]+)\/invite$/)
    if (groupInvite && req.method === 'POST') {
      const user = await authenticate(env, req)
      if (!user) return response('{"error":"unauthorized"}', 401)
      return inviteToGroup(env, user, groupInvite[1], await req.text())
    }
    if (url.pathname === '/group-invites/respond' && req.method === 'POST') {
      const user = await authenticate(env, req)
      if (!user) return response('{"error":"unauthorized"}', 401)
      return respondGroupInvite(env, user, await req.text())
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
