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
  // X-Admin-Pin doit y figurer : un en-tête personnalisé non déclaré ici est
  // refusé par le navigateur AVANT l'envoi, et la page d'administration
  // signalait un espace indisponible sans que le worker soit jamais appelé.
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Admin-Pin',
}

const LODESTONE = 'https://eu.finalfantasyxiv.com/lodestone'
const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 4.0.4; Galaxy Nexus Build/IMM76B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/46.0.2490.76 Mobile Safari/537.36'
const CATALOG_BASE = 'https://olympia-guardian.github.io/data/'
const COLLECT_API = 'https://ffxivcollect.com/api'

// Une collection bouge une fois par semaine, pas toutes les heures : une heure
// de cache multipliait par six nos lectures chez Square Enix pour une fraicheur
// dont personne ne profite. Le bouton « synchroniser » du journal reste la pour
// qui vient de gagner une monture et veut la voir tout de suite.
const CHAR_TTL = 6 * 3_600_000 // 6 h — sert au recul apres un scrape rate
// Au-dela, on relit meme sans qu'on le demande : la fiche d'un perso dont le
// proprietaire ne revient jamais ne doit pas rester fausse pour l'eternite.
const PEREMPTION = 7 * 24 * 3_600_000 // 7 jours

// Plafond GLOBAL de lectures du Lodestone, toutes fiches et tous joueurs
// confondus. Nos autres limites protegent contre UN utilisateur gourmand ; rien
// ne protegeait contre mille utilisateurs raisonnables arrivant le meme soir.
// Square Enix n'a pas d'API et sanctionne par adresse IP : un blocage arreterait
// toutes les fiches d'un coup, sans recours cote serveur. Au-dela du plafond on
// sert la fiche en base, meme perimee — vieille d'un jour vaut infiniment mieux
// qu'absente.
const LODESTONE_PAR_HEURE = 600
let lodestoneFenetre = 0
let lodestoneCompte = 0

function budgetLodestone() {
  const heure = Math.floor(Date.now() / 3_600_000)
  if (heure !== lodestoneFenetre) {
    lodestoneFenetre = heure
    lodestoneCompte = 0
  }
  if (lodestoneCompte >= LODESTONE_PAR_HEURE) return false
  lodestoneCompte++
  return true
}
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

// D1 plafonne le nombre de paramètres liés par requête. Au-delà, la requête
// est rejetée et l'appelant reçoit une erreur opaque : « Tout accepter »
// cassait dès la 100e suggestion en attente, et la page Contacts au 100e ami.
// On découpe donc systématiquement les listes passées à un IN (...).
const D1_MAX_PARAMS = 90

function parLots(liste, taille = D1_MAX_PARAMS) {
  const lots = []
  for (let i = 0; i < liste.length; i += taille) lots.push(liste.slice(i, i + taille))
  return lots
}

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
  const [totals, boutique, mounts, minions, outfits] = await Promise.all([
    getJsonOrNull(`${CATALOG_BASE}totals.json`),
    getJsonOrNull(`${CATALOG_BASE}premium.json`),
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
  // Objets de la boutique en ligne : ils restent dans les listes mais sortent
  // des compteurs, des deux côtés. Les retirer du total sans les retirer du
  // nombre possédé aurait donné des 148/143.
  const horsTotal = {}
  for (const [kind, ids] of Object.entries(boutique ?? {})) horsTotal[kind] = new Set(ids)
  return { maps, totals: totals ?? {}, horsTotal }
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

// ------------------------------------------------------------------ mesures

// Trois signaux ne laissent aucune trace ailleurs : un scrape qui échoue, une
// erreur du worker, une requête refusée par la limite de débit. Sans ce
// comptage, une panne du Lodestone ou un changement de son HTML resteraient
// invisibles jusqu'à ce qu'un joueur s'en plaigne.
//
// L'écriture ne doit jamais faire échouer la requête qu'elle observe, ni la
// retarder : elle est volontairement silencieuse, et une ligne par jour et par
// clé garde le volume négligeable.
function jourCourant() {
  return new Date().toISOString().slice(0, 10)
}

function compter(env, cle, n = 1) {
  try {
    return env.DB.prepare(
      'INSERT INTO metrics (jour, cle, n) VALUES (?1, ?2, ?3) ' +
        'ON CONFLICT(jour, cle) DO UPDATE SET n = n + ?3',
    )
      .bind(jourCourant(), cle, n)
      .run()
      .catch(() => {})
  } catch {
    return Promise.resolve()
  }
}

// ----------------------------------------------------------------- lodestone

// Le Lodestone n'est pas une API : c'est le site de Square Enix, que nous
// lisons depuis les adresses partagées de Cloudflare. Une page de groupe de
// 50 membres dont le cache expire en même temps lançait 250 requêtes en
// rafale, de quoi faire bloquer l'ensemble des workers de la plateforme. Trois
// garde-fous : pas plus de 4 appels simultanés, une attente courte avant de
// renoncer, et un délai d'expiration pour qu'un Lodestone lent ne fasse pas
// pendre la requête indéfiniment. Renoncer n'est pas grave : l'appelant sert
// alors la fiche déjà en base et retente cinq minutes plus tard.
const LODESTONE_MAX_PARALLEL = 4
const LODESTONE_MAX_WAIT = 3000
const LODESTONE_TIMEOUT = 8000
let lodestoneActive = 0
const lodestoneQueue = []

function acquireLodestone() {
  if (lodestoneActive < LODESTONE_MAX_PARALLEL) {
    lodestoneActive++
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const attente = { resolve, timer: null }
    attente.timer = setTimeout(() => {
      const i = lodestoneQueue.indexOf(attente)
      if (i !== -1) lodestoneQueue.splice(i, 1)
      reject(new Error('Lodestone saturé'))
    }, LODESTONE_MAX_WAIT)
    lodestoneQueue.push(attente)
  })
}

function releaseLodestone() {
  const suivant = lodestoneQueue.shift()
  if (suivant) {
    clearTimeout(suivant.timer)
    suivant.resolve()
  } else lodestoneActive--
}

async function lodestoneGet(path, lang = 'en') {
  const base = lang === 'fr' ? 'https://fr.finalfantasyxiv.com/lodestone' : LODESTONE
  await acquireLodestone()
  try {
    const res = await fetch(`${base}${path}`, {
      headers: { 'User-Agent': MOBILE_UA, 'Accept-Language': lang },
      signal: AbortSignal.timeout(LODESTONE_TIMEOUT),
    })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Lodestone ${res.status}`)
    return await res.text()
  } finally {
    releaseLodestone()
  }
}

// Deux visiteurs qui ouvrent la même fiche au même moment ne doivent pas
// déclencher deux lectures du Lodestone : le second attend le résultat du
// premier.
const scrapesEnCours = new Map()

function scrapeOnce(id) {
  const encours = scrapesEnCours.get(id)
  if (encours) return encours
  const p = scrapeCharacter(id).finally(() => scrapesEnCours.delete(id))
  scrapesEnCours.set(id, p)
  return p
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
// La synchro etant devenue la voie PRINCIPALE de rafraichissement, un delai
// d'une journee aurait rendu les fiches moins fraiches qu'avant : quelqu'un qui
// gagne deux montures dans la soiree doit pouvoir le voir. Quinze minutes
// suffisent a empecher le martelage — un perso ne peut declencher que quatre
// lectures par heure, et seulement si on clique.
const FORCE_COOLDOWN = 15 * 60_000

// `connecte` : sans compte, on ne renvoie que ce qui est deja ouvert sur le
// Lodestone (montures et mascottes). Les onze autres collections sont saisies
// a la main par le joueur, elles ne sont visibles nulle part ailleurs, et les
// identifiants Lodestone etant sequentiels, une route ouverte laissait aspirer
// toute la base. Elles repartent marquees non publiques, etat que l'interface
// sait deja afficher pour les profils Lodestone fermes.
async function getCharacter(env, id, force, connecte = true) {
  const row = await env.DB.prepare('SELECT * FROM characters WHERE id = ?1').bind(id).first()
  const allowForce = force && (!row || Date.now() - (row.forced_at ?? 0) >= FORCE_COOLDOWN)

  // La synchro devient un GESTE, plus un effet de bord de la consultation.
  // Trois raisons seulement de sortir chez Square Enix :
  //  - fiche inconnue : sans elle on n'a rien a montrer ;
  //  - le joueur a clique « synchroniser » ;
  //  - fiche vieille de plus d'une semaine : la donnee ne doit pas pourrir
  //    indefiniment pour un perso dont le proprietaire ne revient jamais.
  // Consulter la fiche d'un camarade ne declenche donc plus rien. C'est ce qui
  // divise le volume un soir d'affluence, bien plus surement qu'un plafond.
  const rance = row && Date.now() - row.updated > PEREMPTION
  const besoin = !row || allowForce || rance
  if (besoin && !budgetLodestone()) {
    // Plafond global atteint : on ne sort pas. Sans fiche du tout on laisse
    // remonter l'absence, sinon on sert ce qu'on a, meme perime.
    void compter(env, 'lodestone_plafond')
    if (!row) return null
  } else if (besoin) {
    // Un scrape peut échouer (rate limit Lodestone quand plusieurs fiches se
    // rafraîchissent en même temps) : on sert alors la fiche en cache et on
    // retente dans 5 minutes plutôt que de marteler à chaque requête.
    let scraped = null
    try {
      scraped = await scrapeOnce(id)
      void compter(env, 'lodestone_ok')
    } catch {
      scraped = null
      void compter(env, 'lodestone_echec')
    }
    if (!scraped && !row) return null
    // Lecture ratee : on ne touche PLUS a `updated`. Cette ligne servait a
    // programmer une nouvelle tentative cinq minutes plus tard, du temps ou
    // l'anciennete declenchait le scrape ; depuis que la synchro est un geste,
    // elle ne fait plus que mentir sur la date de derniere lecture reussie,
    // desormais affichee au joueur.

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
      // Une page absente ou un balisage change chez Square Enix produit une
      // liste vide indistinguable d'un joueur sans montures. L'ecrire
      // effacait la collection du joueur ET la marquait publique, sans un mot
      // dans les journaux. On refuse donc de remplacer du plein par du vide :
      // au pire la donnee reste celle d'hier, ce qui est toujours mieux.
      const ancien = await env.DB.prepare(
        "SELECT kind, ids FROM collections WHERE char_id = ?1 AND kind IN ('mounts','minions')",
      )
        .bind(id)
        .all()
      const avant = new Map(ancien.results.map((r) => [r.kind, JSON.parse(r.ids).length]))
      const ecritures = []
      for (const kind of ['mounts', 'minions']) {
        const ids = scraped[kind].ids
        if (ids.length === 0 && (avant.get(kind) ?? 0) > 0) {
          console.warn(`scrape ${kind} vide pour ${id} alors que ${avant.get(kind)} etaient connus, ecriture refusee`)
          continue
        }
        ecritures.push(up.bind(id, kind, JSON.stringify(ids), now, 'lodestone'))
      }
      if (ecritures.length > 0) await env.DB.batch(ecritures)
      // Pas de seedPlaceholders ici : le contrôle des collections absentes,
      // plus bas, s'en charge quand il en manque vraiment. L'appeler à chaque
      // scrape coûtait 15 écritures D1 par consultation de fiche, toutes les
      // heures et par personnage, pour ne rien insérer la plupart du temps.
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
  const { maps, totals, horsTotal } = await catalogs()

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

  const OUVERTES = new Set(['mounts', 'minions'])
  const block = (kind, isPublic = true) => {
    if (!connecte && !OUVERTES.has(kind)) {
      return { count: 0, total: totals[kind] ?? 0, public: false, ids: [] }
    }
    const ids = byKind[kind] ?? []
    const exclus = horsTotal?.[kind]
    const brut = totals[kind] ?? 0
    return {
      // `ids` reste complet : l'objet de boutique demeure coché dans la liste.
      count: exclus ? ids.filter((id) => !exclus.has(id)).length : ids.length,
      total: brut,
      // Les mêmes chiffres boutique comprise : l'interface affiche les deux,
      // « 130 (146) / 287 (353) », pour que rien ne paraisse avoir disparu.
      count_all: ids.length,
      total_all: brut + (exclus ? exclus.size : 0),
      public: isPublic,
      ids,
    }
  }

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

// Fournisseurs de connexion. Discord garde son adresse de retour historique :
// elle est déclarée telle quelle chez eux et la changer casserait les comptes
// existants. Les autres suivent le même moule.
//
// Un compte par fournisseur : se connecter avec Google puis avec Discord donne
// deux comptes distincts. Les rapprocher demanderait de faire confiance à une
// adresse e-mail comme identité commune, ce qui est précisément la faille par
// laquelle on s'approprie le compte d'autrui. Le rapprochement se fera un jour
// depuis la page de compte, en étant déjà connecté aux deux.
const FOURNISSEURS = {
  discord: {
    auth: DISCORD_AUTH,
    token: DISCORD_TOKEN,
    scope: 'identify',
    retour: CALLBACK,
    id: (env) => env.DISCORD_CLIENT_ID,
    secret: (env) => env.DISCORD_CLIENT_SECRET,
    async profil(jeton) {
      const r = await fetch(DISCORD_ME, { headers: { Authorization: `Bearer ${jeton}` } })
      if (!r.ok) return null
      const me = await r.json()
      return {
        id: me.id,
        nom: me.global_name || me.username || 'Aventurier',
        avatar: me.avatar
          ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=64`
          : '',
      }
    },
  },
  google: {
    auth: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    scope: 'openid profile',
    retour: 'https://ogs-room.olympia-guardian.workers.dev/auth/google/callback',
    id: (env) => env.GOOGLE_CLIENT_ID,
    secret: (env) => env.GOOGLE_CLIENT_SECRET,
    async profil(jeton) {
      const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${jeton}` },
      })
      if (!r.ok) return null
      const me = await r.json()
      return { id: me.sub, nom: me.name || 'Aventurier', avatar: me.picture ?? '' }
    },
  },
  // XIVAuth authentifie ET atteste des personnages : son point `characters`
  // ne renvoie que des fiches déjà vérifiées chez eux. Se connecter par là
  // dispense donc de recopier un code sur son profil Lodestone.
  xivauth: {
    // Les deux adresses OAuth vivent a la racine, PAS sous /api/v1 : seules les
    // lectures de donnees (user, characters) sont sous ce prefixe. Leur
    // bibliotheque Ruby declare site='.../api/v1' et authorize_url='/oauth/...',
    // et la barre oblique initiale REMPLACE le chemin de base au lieu de s'y
    // ajouter. Concatener les deux, comme je l'avais fait, menait a un 404.
    auth: 'https://xivauth.net/oauth/authorize',
    token: 'https://xivauth.net/oauth/token',
    scope: 'user character:all',
    retour: 'https://ogs-room.olympia-guardian.workers.dev/auth/xivauth/callback',
    id: (env) => env.XIVAUTH_CLIENT_ID,
    secret: (env) => env.XIVAUTH_CLIENT_SECRET,
    async profil(jeton) {
      const r = await fetch('https://xivauth.net/api/v1/user', {
        headers: { Authorization: `Bearer ${jeton}`, Accept: 'application/json' },
      })
      if (!r.ok) {
        console.error('xivauth /user', r.status, (await r.text()).slice(0, 200))
        return null
      }
      const me = await r.json()
      return { id: String(me.id), nom: me.display_name || 'Aventurier', avatar: me.avatar_url ?? '' }
    },
    async personnages(jeton) {
      const r = await fetch('https://xivauth.net/api/v1/characters', {
        headers: { Authorization: `Bearer ${jeton}`, Accept: 'application/json' },
      })
      if (!r.ok) {
        console.error('xivauth /characters', r.status, (await r.text()).slice(0, 200))
        return []
      }
      const liste = await r.json()
      return (Array.isArray(liste) ? liste : (liste.characters ?? []))
        .map((c) => Number(c.lodestone_id))
        .filter((n) => Number.isInteger(n) && n > 0)
    },
  },
}

async function authStart(env, url, fournisseur) {
  // Avant tout le reste, y compris le raccourci de développement : un
  // fournisseur inconnu doit se voir refuser, sinon une faute de frappe ouvre
  // une session au lieu de signaler l'erreur.
  if (!FOURNISSEURS[fournisseur]) return response('{"error":"unknown provider"}', 404)
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
  // L'état est lié au navigateur par un nonce dépose en cookie : sans ça, un
  // attaquant pouvait démarrer la connexion, garder son état valide, puis
  // faire visiter le lien de retour à sa victime, qui se retrouvait connectée
  // sur le compte de l'attaquant et y liait son personnage sans rien voir.
  const nonce = randomToken()
  const state = await signState(env, { r: ret, x: Date.now() + 600_000, n: nonce, p: fournisseur })
  const f = FOURNISSEURS[fournisseur]
  if (!f || !f.id(env)) return response('{"error":"unknown provider"}', 404)
  const auth = new URL(f.auth)
  auth.searchParams.set('client_id', f.id(env))
  auth.searchParams.set('response_type', 'code')
  auth.searchParams.set('redirect_uri', f.retour)
  auth.searchParams.set('scope', f.scope)
  auth.searchParams.set('state', state)
  return new Response(null, {
    status: 302,
    headers: {
      Location: auth.toString(),
      'Set-Cookie': `ogs_state=${nonce}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
    },
  })
}

function lireCookie(req, nom) {
  const brut = req.headers.get('Cookie') ?? ''
  for (const part of brut.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === nom) return v.join('=')
  }
  return null
}

async function authCallback(env, url, req, fournisseur, ctx) {
  const payload = await verifyState(env, url.searchParams.get('state'))
  const code = url.searchParams.get('code')
  if (!payload || !code) return response('{"error":"invalid state"}', 400)
  // Le nonce doit venir du même navigateur que celui qui a démarré la
  // connexion : un état volé et rejoué ailleurs n'a pas le cookie.
  if (!payload.n || lireCookie(req, 'ogs_state') !== payload.n) {
    return response('{"error":"invalid state"}', 400)
  }

  // Le fournisseur est celui inscrit dans l'état signé, pas celui de l'URL :
  // l'état est la seule partie que l'appelant ne peut pas fabriquer.
  const nomDemande = payload.p ?? fournisseur
  const f = FOURNISSEURS[nomDemande]
  if (!f || !f.secret(env)) return response('{"error":"unknown provider"}', 404)

  // Deux facons normalisees de prouver son identite au serveur de jetons :
  // les identifiants dans le corps, ou en authentification HTTP Basic. Discord
  // et Google acceptent la premiere ; Doorkeeper, la bibliotheque OAuth de
  // XIVAuth, veut la seconde et repond sinon « invalid_client ». On garde donc
  // celle qui marche deja et on bascule sur Basic devant ce refus precis — un
  // refus d'authentification ne consomme pas le code, la seconde tentative est
  // donc legitime.
  const champs = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: f.retour,
  }
  let tokenRes = await fetch(f.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...champs, client_id: f.id(env), client_secret: f.secret(env) }),
  })
  if (tokenRes.status === 401) {
    tokenRes = await fetch(f.token, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa(`${f.id(env)}:${f.secret(env)}`)}`,
      },
      body: new URLSearchParams(champs),
    })
  }
  if (!tokenRes.ok) {
    // Le fournisseur explique toujours pourquoi il refuse (invalid_client,
    // invalid_grant, PKCE manquant...). Renvoyer un « token exchange failed »
    // nu obligeait a deviner ; sa reponse ne contient aucun secret, seulement
    // un code d'erreur normalise, donc on la trace et on la transmet.
    const detail = (await tokenRes.text()).slice(0, 300)
    // Longueurs seulement, jamais les valeurs : un secret colle avec un retour
    // a la ligne ou tronque se voit immediatement, sans rien exposer.
    const cle = f.secret(env) ?? ''
    console.error(
      'echange de jeton refuse',
      nomDemande,
      tokenRes.status,
      `id:${f.id(env)?.length ?? 0} secret:${cle.length}${cle !== cle.trim() ? ' AVEC ESPACES' : ''}`,
      detail,
    )
    return response(
      JSON.stringify({ error: 'token exchange failed', provider: nomDemande, status: tokenRes.status, detail }),
      502,
    )
  }
  const { access_token } = await tokenRes.json()

  const profil = await f.profil(access_token)
  if (!profil) {
    console.error('lecture du profil refusee', nomDemande)
    return response(JSON.stringify({ error: 'profile fetch failed', provider: nomDemande }), 502)
  }

  const nom = payload.p ?? fournisseur
  const userId = `${nom}:${profil.id}`
  await env.DB.prepare(
    'INSERT INTO users (id, provider, provider_id, name, avatar, created) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ' +
      'ON CONFLICT(id) DO UPDATE SET name = ?4, avatar = ?5',
  )
    .bind(userId, nom, profil.id, profil.nom, profil.avatar, Date.now())
    .run()

  // XIVAuth atteste déjà des personnages : on les lie et on les marque
  // vérifiés sans faire recopier un code sur le Lodestone. Un perso déjà
  // revendiqué par quelqu'un d'autre n'est jamais repris — c'est la seule
  // règle qui empêche une attestation d'ailleurs de voler une liaison ici.
  if (f.personnages) {
    try {
      const ids = await f.personnages(access_token)
      const lies = []
      for (const charId of ids.slice(0, 20)) {
        const pris = await env.DB.prepare(
          'SELECT user_id FROM bindings WHERE char_id = ?1 AND verified = 1',
        )
          .bind(charId)
          .first()
        if (pris && pris.user_id !== userId) continue
        await env.DB.prepare(
          'INSERT INTO bindings (user_id, char_id, verified, created) VALUES (?1, ?2, 1, ?3) ' +
            'ON CONFLICT(user_id, char_id) DO UPDATE SET verified = 1',
        )
          .bind(userId, charId, Date.now())
          .run()
        lies.push(charId)
      }
      // Un perso atteste ici n'a jamais ete lu chez nous : sa fiche n'existe
      // pas encore, et le journal n'afficherait qu'un numero pendant que le
      // navigateur attend une lecture du Lodestone qui prend plusieurs
      // secondes. On la prepare pendant la redirection, sans la faire attendre.
      if (ctx && lies.length > 0) {
        ctx.waitUntil(
          Promise.all(lies.slice(0, 5).map((id) => getCharacter(env, id, false).catch(() => null))),
        )
      }
    } catch (e) {
      // Une attestation ratée ne doit pas empêcher la connexion elle-même.
      console.error('xivauth characters', e?.stack ?? String(e))
    }
  }

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

/** Un retrait est « massif » s'il emporte au moins vingt entrées ET plus du
 *  quart de la collection. Les deux conditions ensemble : décocher quatre
 *  bardes sur dix reste un geste banal, perdre 150 pièces d'armoire sur 150
 *  n'en est jamais un. */
const PERTE_MIN = 20
const PERTE_PART = 0.25
const perteMassive = (perdus, avant) => perdus >= PERTE_MIN && perdus > avant * PERTE_PART

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
  // Deux formes acceptées par collection :
  //  - un tableau : remplacement complet (ancienne forme, toujours utilisée
  //    par l'import Collect et la validation en masse) ;
  //  - { add, remove } : delta appliqué à l'état COURANT du serveur. C'est la
  //    forme des coches à l'unité. Elle évite de renvoyer jusqu'à 30 Ko par
  //    clic, et surtout deux onglets ouverts ne s'écrasent plus l'un l'autre :
  //    chacun décrit ce qu'il change au lieu de réaffirmer toute la liste.
  //
  // Montures/mascottes acceptées aussi : validation temporaire, la prochaine
  // synchro Lodestone réécrit ces deux collections (source lodestone).
  // outfitpieces : pièces de tenues possédées (stockage auxiliaire, comme
  // relics — un ensemble dont toutes les pièces sont là devient possédé).
  const deltas = []
  for (const kind of [...ALL_KINDS, 'relics', 'outfitpieces']) {
    const v = doc?.[kind]
    if (v === undefined) continue
    if (Array.isArray(v)) {
      if (!validIds(v, 6000)) return response('{"error":"invalid ids"}', 422)
      rows.push([charId, kind, JSON.stringify([...new Set(v)]), now])
      continue
    }
    if (!v || typeof v !== 'object') return response('{"error":"invalid ids"}', 422)
    const add = v.add ?? []
    const remove = v.remove ?? []
    if (!validIds(add, 6000) || !validIds(remove, 6000)) {
      return response('{"error":"invalid ids"}', 422)
    }
    if (add.length === 0 && remove.length === 0) continue
    deltas.push([kind, add, remove])
  }

  if (rows.length === 0 && deltas.length === 0) {
    return response('{"error":"nothing to update"}', 422)
  }

  // État courant : les deux formes en ont besoin, car le frein et le journal
  // comparent toujours à ce qui existe déjà.
  const actuels = await env.DB.prepare('SELECT kind, ids FROM collections WHERE char_id = ?1')
    .bind(charId)
    .all()
  const parKind = new Map(actuels.results.map((r) => [r.kind, JSON.parse(r.ids)]))

  for (const [kind, add, remove] of deltas) {
    const s = new Set(parKind.get(kind) ?? [])
    for (const id of add) s.add(id)
    for (const id of remove) s.delete(id)
    rows.push([charId, kind, JSON.stringify([...s]), now])
  }

  // Frein et journal, sur le résultat final quelle que soit la forme envoyée.
  const retraits = []
  for (const r of rows) {
    const avant = new Set(parKind.get(r[1]) ?? [])
    if (avant.size === 0) continue
    const apres = new Set(JSON.parse(r[2]))
    const perdus = [...avant].filter((id) => !apres.has(id))
    if (perdus.length === 0) continue
    if (perteMassive(perdus.length, avant.size) && doc?.force !== true) {
      // Refus plutôt qu'exécution : une perte massive en une requête n'est
      // jamais un geste ordinaire. Si elle est voulue, elle se redemande avec
      // `force`. Cloudflare n'offrant aucun retour arrière sur cette base, ce
      // refus est la seule barrière entre un bogue et une collection effacée.
      return response(
        JSON.stringify({
          error: 'mass removal refused',
          kind: r[1],
          removing: perdus.length,
          of: avant.size,
        }),
        409,
      )
    }
    retraits.push([charId, r[1], JSON.stringify(perdus), apres.size, now])
  }

  const stmt = env.DB.prepare(
    'INSERT INTO collections (char_id, kind, ids, updated, source) VALUES (?1, ?2, ?3, ?4, ?5) ' +
      'ON CONFLICT(char_id, kind) DO UPDATE SET ids=?3, updated=?4, source=?5',
  )
  const ecritures = rows.map((r) => stmt.bind(...r, 'user'))
  if (retraits.length > 0) {
    // Le journal part dans le MÊME lot que la collection : ou les deux
    // s'écrivent, ou aucun. Un retrait sans sa trace serait exactement le
    // trou qu'on cherche à fermer.
    const jstmt = env.DB.prepare(
      'INSERT INTO removals (char_id, kind, ids, restants, at) VALUES (?1, ?2, ?3, ?4, ?5)',
    )
    for (const t of retraits) ecritures.push(jstmt.bind(...t))
  }
  await env.DB.batch(ecritures)
  await notify(env, await usersSharingChar(env, charId), { t: 'char', id: charId })
  return response('{"ok":true}')
}


// ---------------------------------------------------------------- signalements

// Protection en couches, sans captcha : l'obligation d'un compte connecté est
// déjà l'anti-robot le plus efficace ici (un robot n'a pas de compte Discord,
// et un compte abusif se bannit). S'y ajoutent un quota par compte, une borne
// de longueur, un champ piège que seul un robot remplit, et la limite de débit
// par IP posée à l'entrée du worker.
const MAX_REPORTS_PAR_JOUR = 5
const REPORT_MIN = 10
const REPORT_MAX = 2000

async function createReport(env, user, raw) {
  let doc
  try {
    doc = JSON.parse(raw)
  } catch {
    return response('{"error":"invalid body"}', 422)
  }
  // Champ piège : invisible à l'écran, donc rempli uniquement par un automate
  // qui remplit tout ce qu'il trouve. On répond « ok » pour ne pas lui
  // apprendre qu'il est repéré.
  if (typeof doc?.website === 'string' && doc.website.length > 0) {
    return response('{"ok":true}')
  }
  const message = String(doc?.message ?? '').trim()
  if (message.length < REPORT_MIN || message.length > REPORT_MAX) {
    return response('{"error":"message length"}', 422)
  }
  const depuis = Date.now() - 86_400_000
  const recents = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM reports WHERE user_id = ?1 AND created > ?2',
  )
    .bind(user.id, depuis)
    .first()
  if ((recents?.n ?? 0) >= MAX_REPORTS_PAR_JOUR) {
    return response('{"error":"quota"}', 429)
  }
  const charId = Number.isInteger(doc?.charId) ? doc.charId : null
  const tab = typeof doc?.tab === 'string' ? doc.tab.slice(0, 40) : null
  await env.DB.prepare(
    'INSERT INTO reports (id, user_id, user_name, char_id, tab, message, created, handled) ' +
      'VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0)',
  )
    .bind('rep-' + crypto.randomUUID(), user.id, user.name ?? null, charId, tab, message, Date.now())
    .run()
  return response('{"ok":true}')
}

/** Couts : ce que le worker peut reellement mesurer, c'est-a-dire la taille de
 *  la base et le nombre de lignes par table. La consommation exacte des quotas
 *  (lectures et ecritures du jour) n'est pas exposee aux workers : elle se lit
 *  sur le tableau de bord Cloudflare. Compter chaque requete ici couterait une
 *  ecriture D1 par requete, soit exactement le quota qu'on cherche a menager.
 *  On donne donc la volumetrie, qui dit ou la base grossit et pourquoi. */
async function adminCosts(env) {
  const tables = [
    'users',
    'tokens',
    'characters',
    'collections',
    'bindings',
    'groups',
    'group_members',
    'suggestions',
    'contacts',
    'reports',
    'metrics',
  ]
  // D1 n'expose pas les pragmas de pagination : on s'en tient au nombre de
  // lignes, qui dit de toute façon OÙ la base grossit, ce qu'un total en
  // mégaoctets ne dirait pas.
  //
  // On ne compte que les tables qui existent vraiment : une table absente
  // (schéma appliqué à moitié, environnement de développement en retard)
  // faisait tomber toute la page au lieu de manquer une ligne.
  const presentes = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table'",
  ).all()
  const connues = new Set(presentes.results.map((r) => r.name))
  const aCompter = tables.filter((t) => connues.has(t))
  const comptes = aCompter.length
    ? await env.DB.batch(aCompter.map((t) => env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t}`)))
    : []
  const lignes = {}
  aCompter.forEach((t, i) => {
    lignes[t] = comptes[i]?.results?.[0]?.n ?? 0
  })
  return response(
    JSON.stringify({ lignes, total: Object.values(lignes).reduce((n, v) => n + v, 0) }),
  )
}

/** Adoption : tout se calcule sur la base existante, aucune instrumentation
 *  supplementaire n'est necessaire. On compte les ACTIFS et non les inscrits :
 *  un total d'inscriptions ne fait que monter et ne fait jamais agir, alors
 *  que la retention dit si l'application sert vraiment. */
async function adminAdoption(env) {
  const j7 = Date.now() - 7 * 86_400_000
  const j30 = Date.now() - 30 * 86_400_000
  const [total, actifs7, actifs30, persos, verifies, groupes, vivants, anciens, revenus, coches] =
    await env.DB.batch([
      env.DB.prepare('SELECT COUNT(*) AS n FROM users'),
      env.DB.prepare('SELECT COUNT(DISTINCT user_id) AS n FROM tokens WHERE created > ?1').bind(j7),
      env.DB.prepare('SELECT COUNT(DISTINCT user_id) AS n FROM tokens WHERE created > ?1').bind(j30),
      env.DB.prepare('SELECT COUNT(*) AS n FROM bindings'),
      env.DB.prepare('SELECT COUNT(*) AS n FROM bindings WHERE verified = 1'),
      env.DB.prepare('SELECT COUNT(*) AS n FROM groups'),
      env.DB.prepare('SELECT COUNT(*) AS n FROM groups WHERE updated > ?1').bind(j30),
      // Retention : parmi ceux inscrits il y a plus d'une semaine, combien
      // sont revenus dans les 30 derniers jours.
      env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE created < ?1').bind(j7),
      env.DB
        .prepare(
          'SELECT COUNT(DISTINCT u.id) AS n FROM users u JOIN tokens t ON t.user_id = u.id ' +
            'WHERE u.created < ?1 AND t.created > ?2',
        )
        .bind(j7, j30),
      // Activite reelle : des collections cochees a la main recemment.
      env.DB
        .prepare("SELECT COUNT(DISTINCT char_id) AS n FROM collections WHERE source = 'user' AND updated > ?1")
        .bind(j30),
    ])
  const nb = (r) => r.results?.[0]?.n ?? 0
  const base = nb(anciens)
  return response(
    JSON.stringify({
      comptes: nb(total),
      actifs7: nb(actifs7),
      actifs30: nb(actifs30),
      persos: nb(persos),
      verifies: nb(verifies),
      groupes: nb(groupes),
      groupesVivants: nb(vivants),
      retention: base > 0 ? Math.round((nb(revenus) / base) * 100) : null,
      persosActifs: nb(coches),
    }),
  )
}

/** Compteurs des 14 derniers jours, pour les courbes de l'administration. */
async function listMetrics(env) {
  const depuis = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10)
  const rows = await env.DB.prepare(
    'SELECT jour, cle, n FROM metrics WHERE jour >= ?1 ORDER BY jour ASC',
  )
    .bind(depuis)
    .all()
  return response(JSON.stringify({ metrics: rows.results }))
}

async function listReports(env) {
  const rows = await env.DB.prepare(
    'SELECT id, user_id, user_name, char_id, tab, message, created, handled FROM reports ' +
      'ORDER BY handled ASC, created DESC LIMIT 200',
  ).all()
  return response(JSON.stringify({ reports: rows.results }))
}

async function setReportHandled(env, id, handled) {
  await env.DB.prepare('UPDATE reports SET handled = ?2 WHERE id = ?1')
    .bind(id, handled ? 1 : 0)
    .run()
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

  // Un paramètre est déjà pris par user.id, d'où le lot réduit d'une unité.
  const mine = []
  for (const lot of parLots(ids, D1_MAX_PARAMS - 1)) {
    const marks = lot.map(() => '?').join(',')
    const rows = await env.DB.prepare(
      `SELECT s.id, s.char_id, s.kind, s.item_id, s.from_user_id FROM suggestions s ` +
        `JOIN bindings b ON b.char_id = s.char_id AND b.verified = 1 AND b.user_id = ? ` +
        `WHERE s.id IN (${marks})`,
    )
      .bind(user.id, ...lot)
      .all()
    mine.push(...rows.results)
  }
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
  for (const lot of parLots(mine.map((s) => s.id))) {
    stmts.push(
      env.DB.prepare(
        `DELETE FROM suggestions WHERE id IN (${lot.map(() => '?').join(',')})`,
      ).bind(...lot),
    )
  }
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
    const lignes = []
    for (const lot of parLots(friends.map((f) => f.userId))) {
      const marks = lot.map(() => '?').join(',')
      const chars = await env.DB.prepare(
        `SELECT user_id, char_id FROM bindings WHERE verified = 1 AND user_id IN (${marks})`,
      )
        .bind(...lot)
        .all()
      lignes.push(...chars.results)
    }
    const byUser = new Map()
    for (const c of lignes) {
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
    // Au-dela de la peremption, sinon la fiche ne serait plus relue : depuis
    // que la synchro est un geste, l'anciennete seule ne declenche rien avant
    // une semaine.
    .bind(id, Date.now() - PEREMPTION - 1000)
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
  await env.DB.batch(await effacerCompte(env, targetId, false))
  return response('{"ok":true}')
}

/** DELETE /me : le titulaire efface son propre compte. Le RGPD en fait un
 *  droit, et jusqu'ici seul l'administrateur pouvait le faire — c'est-à-dire
 *  qu'il fallait écrire à quelqu'un pour disparaître.
 *
 *  Ses collections cochées à la main partent avec lui : ce sont ses données,
 *  pas celles du personnage. Les fiches de perso restent, elles ne contiennent
 *  que du public relu sur le Lodestone. L'écran propose l'export juste au-dessus
 *  du bouton, pour que personne n'efface sans avoir pu emporter une copie. */
async function deleteMe(env, user) {
  await env.DB.batch(await effacerCompte(env, user.id, true))
  return response('{"ok":true}')
}

/** Toutes les suppressions d'un compte, en une liste d'ordres à exécuter d'un
 *  bloc : un compte à moitié effacé serait pire que pas effacé du tout. */
async function effacerCompte(env, targetId, avecCollections) {
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
  if (avecCollections) {
    for (const c of verifiedChars.results) {
      stmts.push(
        env.DB.prepare("DELETE FROM collections WHERE char_id = ?1 AND source = 'user'").bind(
          c.char_id,
        ),
      )
    }
  }
  return stmts
}

/** GET /me/export : tout ce que nous détenons sur ce compte, en un fichier.
 *  Le pendant de la suppression : pouvoir partir suppose de pouvoir emporter.
 *  Les collections sortent au format de FFXIV Collect — mêmes noms, mêmes
 *  identifiants — pour que le fichier serve ailleurs et pas seulement ici. */
async function exportMe(env, user) {
  const [bindings, groupes, contacts] = await Promise.all([
    env.DB.prepare('SELECT char_id, verified, created FROM bindings WHERE user_id = ?1')
      .bind(user.id)
      .all(),
    env.DB.prepare('SELECT id, name, shared, created FROM groups WHERE owner_user_id = ?1')
      .bind(user.id)
      .all(),
    env.DB.prepare('SELECT friend_id, status, created FROM contacts WHERE user_id = ?1')
      .bind(user.id)
      .all(),
  ])
  const collections = {}
  for (const b of bindings.results.filter((b) => b.verified)) {
    const rows = await env.DB.prepare(
      "SELECT kind, ids FROM collections WHERE char_id = ?1 AND source = 'user'",
    )
      .bind(b.char_id)
      .all()
    collections[b.char_id] = Object.fromEntries(
      rows.results.map((r) => [r.kind, JSON.parse(r.ids)]),
    )
  }
  return response(
    JSON.stringify(
      {
        exporte_le: new Date().toISOString(),
        compte: { id: user.id, nom: user.name, avatar: user.avatar },
        personnages: bindings.results,
        collections,
        groupes: groupes.results,
        contacts: contacts.results,
      },
      null,
      2,
    ),
  )
}

/** POST /admin/purge-tokens : supprime les sessions expirées. */
async function adminPurgeTokens(env) {
  const r = await env.DB.prepare('DELETE FROM tokens WHERE expires < ?1').bind(Date.now()).run()
  return response(JSON.stringify({ ok: true, purged: r.meta.changes }))
}

/** Compteurs gardés trois mois : l'administration n'en lit que quatorze jours,
 *  la marge laisse la place à une fenêtre plus longue sans repartir de zéro. */
const RETENTION_METRIQUES = 90

/** Ménage nocturne (déclencheur cron). Les sessions expirées et les vieux
 *  compteurs s'accumulaient jusqu'à ce qu'un humain pense à cliquer « purger »
 *  dans l'administration : personne n'y pense, et les lignes D1 sont comptées.
 *  Deux suppressions bornées, rien d'autre — un ménage qui se tromperait de
 *  cible coûterait bien plus cher que les lignes qu'il économise. */
async function menageNocturne(env) {
  try {
    const sessions = await env.DB.prepare('DELETE FROM tokens WHERE expires < ?1')
      .bind(Date.now())
      .run()
    const limite = new Date(Date.now() - RETENTION_METRIQUES * 86_400_000)
      .toISOString()
      .slice(0, 10)
    const compteurs = await env.DB.prepare('DELETE FROM metrics WHERE jour < ?1').bind(limite).run()
    console.log(
      `ménage nocturne : ${sessions.meta.changes} session(s), ${compteurs.meta.changes} compteur(s)`,
    )
  } catch (e) {
    // Un ménage raté n'est pas grave en soi, mais il doit laisser une trace :
    // sans ça, la base regrossit sans que rien ne le signale.
    console.error('ménage nocturne', e?.stack ?? String(e))
    void compter(env, 'menage_echec')
  }
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
  // Même file d'attente que les lectures de fiche : la recherche part vers le
  // Lodestone, elle compte dans le même budget d'appels simultanés.
  let html
  try {
    await acquireLodestone()
  } catch {
    return response('{"error":"lodestone busy"}', 503)
  }
  try {
    const res = await fetch(target.toString(), {
      headers: { 'User-Agent': MOBILE_UA, 'Accept-Language': 'fr' },
      signal: AbortSignal.timeout(LODESTONE_TIMEOUT),
    })
    if (!res.ok) return response('{"error":"lodestone unavailable"}', 502)
    html = await res.text()
  } catch {
    return response('{"error":"lodestone unavailable"}', 502)
  } finally {
    releaseLodestone()
  }
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
// Le plan gratuit plafonne à 50 sous-requêtes par requête, et chaque
// destinataire en coûte une, même déconnecté. Un groupe de plus de 48 comptes
// faisait donc échouer la requête APRÈS l'écriture en base : la coche était
// bien enregistrée mais l'utilisateur voyait une erreur. On plafonne les
// envois directs ; les comptes au-delà verront le changement au sondage
// suivant, dans les 90 secondes, ce qui est le rôle de ce filet.
const MAX_NOTIFY = 25

async function notify(env, userIds, event) {
  const body = JSON.stringify(event)
  const cibles = [...new Set(userIds)].filter(Boolean)
  const directs = cibles.slice(0, MAX_NOTIFY)
  if (cibles.length > directs.length) {
    console.warn(`notify : ${cibles.length - directs.length} comptes laissés au sondage de 90 s`)
  }
  await Promise.all(
    directs.map((id) =>
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

// `ctx` sert à différer le travail qui n'a pas à retarder la réponse (l'envoi
// des notifications temps réel), et l'enveloppe plus bas transforme une
// exception en 500 JSON tracé plutôt qu'en erreur 1101 muette de Cloudflare.
const routes = {
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    const url = new URL(req.url)

    // --- comptes : OAuth Discord + session + liaison de perso
    // Quels fournisseurs sont réellement configurés. Sans ça, l'interface
    // afficherait des boutons qui échouent tant que les clés ne sont pas
    // posées — et, une fois posées, les boutons apparaissent tout seuls sans
    // qu'il faille recompiler le front.
    if (url.pathname === '/providers' && req.method === 'GET') {
      const dispo = Object.keys(FOURNISSEURS).filter((k) => FOURNISSEURS[k].id(env))
      return new Response(JSON.stringify(dispo), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=300', ...CORS },
      })
    }
    const authMatch = url.pathname.match(/^\/auth\/(\w+)(\/callback)?$/)
    if (authMatch && req.method === 'GET') {
      return authMatch[2]
        ? authCallback(env, url, req, authMatch[1], ctx)
        : authStart(env, url, authMatch[1])
    }
    if (url.pathname === '/report' && req.method === 'POST') {
      const user = await authenticate(env, req)
      if (!user) return response('{"error":"unauthorized"}', 401)
      const raw = await req.text()
      if (raw.length > 8192) return response('{"error":"too large"}', 413)
      return createReport(env, user, raw)
    }
    if (url.pathname === '/me' && req.method === 'GET') {
      const user = await authenticate(env, req)
      if (!user) return response('{"error":"unauthorized"}', 401)
      return response(JSON.stringify(await getMe(env, user)))
    }
    if (url.pathname === '/me' && req.method === 'DELETE') {
      const user = await authenticate(env, req)
      if (!user) return response('{"error":"unauthorized"}', 401)
      return deleteMe(env, user)
    }
    if (url.pathname === '/me/export' && req.method === 'GET') {
      const user = await authenticate(env, req)
      if (!user) return response('{"error":"unauthorized"}', 401)
      return exportMe(env, user)
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
          // Authentification facultative : elle ne conditionne pas l'accès à la
          // fiche, seulement le niveau de détail (voir getCharacter).
          const visiteur = await authenticate(env, req)
          const char = await getCharacter(env, id, url.searchParams.has('force'), !!visiteur)
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
      // L'identité d'abord : un inconnu doit recevoir 404, pour que rien ne
      // trahisse l'existence de ces routes. Le code ne se verifie qu'ensuite.
      const user = await authenticate(env, req)
      if (!isAdmin(env, user)) return response('{"error":"not found"}', 404)
      // Seconde serrure : le compte admin ne suffit pas, il faut aussi le code
      // connu de lui seul. Il est envoyé à chaque appel plutôt que stocké dans
      // une session, et n'existe côté navigateur que le temps de l'onglet.
      // Comparaison à longueur constante : une comparaison naïve laisse
      // deviner le code chiffre par chiffre en mesurant le temps de réponse.
      const attendu = env.ADMIN_PIN
      if (attendu) {
        const fourni = req.headers.get('X-Admin-Pin') ?? ''
        let diff = fourni.length === attendu.length ? 0 : 1
        for (let i = 0; i < attendu.length; i++) {
          diff |= (fourni.charCodeAt(i) || 0) ^ attendu.charCodeAt(i)
        }
        if (diff !== 0) return response('{"error":"locked"}', 403)
      }
      if (url.pathname === '/admin/overview' && req.method === 'GET') return adminOverview(env)
      if (url.pathname === '/admin/reports' && req.method === 'GET') return listReports(env)
      if (url.pathname === '/admin/metrics' && req.method === 'GET') return listMetrics(env)
      if (url.pathname === '/admin/adoption' && req.method === 'GET') return adminAdoption(env)
      if (url.pathname === '/admin/costs' && req.method === 'GET') return adminCosts(env)
      const repMatch = url.pathname.match(/^\/admin\/reports\/(rep-[\w-]{10,60})$/)
      if (repMatch && req.method === 'POST') {
        const raw = await req.text()
        let doc = {}
        try {
          doc = JSON.parse(raw)
        } catch {
          // corps absent : on considere le signalement comme traite
        }
        return setReportHandled(env, repMatch[1], doc?.handled !== false)
      }
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

// Routes qui déclenchent une lecture du site de Square Enix : budget serré.
// Une fiche non lue depuis une heure coûte jusqu'à 5 requêtes chez eux, et une
// recherche par nom une de plus.
const SORT_VERS_LODESTONE = /^\/(character\/\d+$|search-character$|bind$)/

/** Vrai si la requête doit être refusée faute de budget. Le WebSocket et les
 *  requêtes préparatoires CORS ne comptent pas : le premier reste ouvert des
 *  heures, les secondes ne touchent à rien. */
async function debitDepasse(req, env, url) {
  if (req.method === 'OPTIONS' || url.pathname === '/ws') return false
  const ip = req.headers.get('CF-Connecting-IP')
  // Pas d'en-tête (développement local) ou binding absent : pas de limite.
  if (!ip) return false
  const seau = SORT_VERS_LODESTONE.test(url.pathname) ? env.RL_LODESTONE : env.RL_GENERAL
  if (!seau) return false
  try {
    const { success } = await seau.limit({ key: ip })
    return !success
  } catch {
    // Le limiteur ne doit jamais faire tomber le service.
    return false
  }
}

export default {
  async fetch(req, env, ctx) {
    try {
      const url = new URL(req.url)
      if (await debitDepasse(req, env, url)) {
        void compter(env, 'debit_refuse')
        // Retry-After : le client sait quand réessayer au lieu d'insister.
        return new Response('{"error":"too many requests"}', {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '60', ...CORS },
        })
      }
      return await routes.fetch(req, env, ctx)
    } catch (e) {
      // Sans ce filet, une requête D1 qui dépasse une limite ou une réponse
      // Discord inattendue renvoyaient une erreur générique de la plateforme,
      // sans rien dans les journaux pour comprendre.
      const chemin = (() => {
        try {
          return new URL(req.url).pathname
        } catch {
          return '?'
        }
      })()
      console.error('erreur non rattrapée', req.method, chemin, e?.stack ?? String(e))
      void compter(env, 'erreur_worker')
      return response('{"error":"internal"}', 500)
    }
  },

  // Déclencheur planifié (voir [triggers] dans wrangler.toml).
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(menageNocturne(env))
  },
}
