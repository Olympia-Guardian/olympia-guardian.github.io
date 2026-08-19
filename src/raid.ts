// Le BiS importé, et ce qu'on en déduit.
//
// Un joueur a déjà écrit, ailleurs, ce qu'il vise pièce par pièce. Lui
// redemander emplacement par emplacement ce qu'il prendra en savage serait de
// la saisie pure : le lien suffit, la provenance se lit dans le catalogue du
// palier. Ne restent que les gestes qui ne se déduisent d'aucune donnée : « je
// l'ai obtenue », et pour le mémoquartz « je l'ai achetée », puis « je l'ai
// améliorée ».

import type { RaidEmplacement, RaidMateriau, RaidPalier, RaidPiece } from './api'

/** Pièces lâchées par un étage à chaque kill. C'est ce chiffre qui transforme
 *  des besoins en nombre de soirées : il est isolé ici pour se corriger d'une
 *  ligne si un palier change les règles. */
export const PIECES_PAR_KILL = 2

/** Les cases du personnage chez Etro, et le coffre qui les remplit.
 *
 *  Douze cases pour onze coffres : le bouclier vient du coffre d'arme, le
 *  paladin reçoit les deux d'un coup (« Paladin's <palier> Arms »). C'est un
 *  seul butin, donc un seul emplacement à suivre. */
const CASES: { etro: string; emplacement: string }[] = [
  { etro: 'weapon', emplacement: 'weapon' },
  { etro: 'offHand', emplacement: 'weapon' },
  { etro: 'head', emplacement: 'head' },
  { etro: 'body', emplacement: 'body' },
  { etro: 'hands', emplacement: 'hands' },
  { etro: 'legs', emplacement: 'legs' },
  { etro: 'feet', emplacement: 'feet' },
  { etro: 'ears', emplacement: 'earring' },
  { etro: 'neck', emplacement: 'necklace' },
  { etro: 'wrists', emplacement: 'bracelet' },
  { etro: 'fingerL', emplacement: 'ring1' },
  { etro: 'fingerR', emplacement: 'ring2' },
]

/** Quel composant améliore quel emplacement du jeu. Trois familles, pas une par
 *  case : c'est ainsi que le jeu les vend. */
const FAMILLE: Record<string, RaidMateriau['cle']> = {
  weapon: 'arme',
  head: 'armure',
  body: 'armure',
  hands: 'armure',
  legs: 'armure',
  feet: 'armure',
  earring: 'accessoire',
  necklace: 'accessoire',
  bracelet: 'accessoire',
  ring: 'accessoire',
}

/** Un BiS tel qu'on le garde : le job, le nom que le joueur a donné à son set,
 *  le lien d'origine pour le réimporter, et un identifiant d'objet par case. */
export interface Bis {
  job: string
  nom: string
  url: string
  /** { case Etro : identifiant d'objet }. Les cases vides sont absentes. */
  pieces: Record<string, number>
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/** Les deux planificateurs servent leur API sans authentification et l'ouvrent
 *  aux autres origines : l'import tient entièrement dans le navigateur, sans
 *  relais par le worker. */
const ETRO_API = 'https://etro.gg/api/gearsets/'
const XIVGEAR_LIEN = 'https://api.xivgear.app/shortlink/'
const XIVGEAR_BIS = 'https://staticbis.xivgear.app/'

/** Une erreur d'import qui se dit au joueur. Le message est une CLÉ de
 *  traduction : la vue sait l'afficher dans sa langue. */
export class ErreurBis extends Error {}

/** Ce qu'un lien contient vraiment.
 *
 *  Un lien Etro porte UN set. Une feuille XIVGear en porte souvent plusieurs
 *  (« 2.50 Savage Weapon », « 2.45 », « Relic »...), et rien ne dit lequel le
 *  joueur utilise : c'est à lui de trancher, pas à nous de prendre le premier. */
export interface Feuille {
  source: 'etro' | 'xivgear'
  job: string
  /** Nom de la feuille chez son auteur. */
  nom: string
  url: string
  sets: { nom: string; pieces: Record<string, number> }[]
}

function uuid(lien: string): string | null {
  const m = lien.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  return m ? m[0] : null
}

async function json(url: string): Promise<Record<string, unknown>> {
  let res: Response
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(15000) })
  } catch {
    throw new ErreurBis('bisInjoignable')
  }
  // Refus du site (404 introuvable, 400 identifiant mal formé) : le lien est en
  // cause, pas le réseau. Le dire évite de renvoyer le joueur réessayer plus
  // tard pour un lien qui ne marchera jamais.
  if (res.status >= 400 && res.status < 500) throw new ErreurBis('bisIntrouvable')
  if (!res.ok) throw new ErreurBis('bisInjoignable')
  try {
    return (await res.json()) as Record<string, unknown>
  } catch {
    throw new ErreurBis('bisInjoignable')
  }
}

// --------------------------------------------------------------------- Etro

async function feuilleEtro(lien: string, id: string): Promise<Feuille> {
  const brut = await json(`${ETRO_API}${id}/`)
  const pieces: Record<string, number> = {}
  for (const { etro } of CASES) {
    const v = brut[etro]
    if (typeof v === 'number' && v > 0) pieces[etro] = v
  }
  return {
    source: 'etro',
    job: typeof brut.jobAbbrev === 'string' ? brut.jobAbbrev : '',
    nom: typeof brut.name === 'string' ? brut.name : '',
    url: lien,
    sets: [{ nom: '', pieces }],
  }
}

// ------------------------------------------------------------------ XIVGear

/** Les cases de XIVGear ramenées aux nôtres. Il les nomme autrement (`Hand`,
 *  `Wrist`, `RingLeft`), pour les mêmes douze emplacements. */
const CASES_XIVGEAR: Record<string, string> = {
  Weapon: 'weapon',
  OffHand: 'offHand',
  Head: 'head',
  Body: 'body',
  Hand: 'hands',
  Legs: 'legs',
  Feet: 'feet',
  Ears: 'ears',
  Neck: 'neck',
  Wrist: 'wrists',
  RingLeft: 'fingerL',
  RingRight: 'fingerR',
}

/** Où pointe un lien XIVGear. Deux formes servent : le lien court d'un set
 *  qu'on a soi-même construit, et le catalogue public de BiS du site. */
function cibleXivgear(
  lien: string,
): { type: 'sl'; id: string; set?: number } | { type: 'bis'; chemin: string[] } | null {
  // Le séparateur de chemin est une barre verticale, souvent encodée au
  // copier-coller.
  const propre = lien.replaceAll('%7C', '|')
  const partage = propre.match(/share\.xivgear\.app\/share\/([0-9a-f-]{36})/i)
  if (partage) return { type: 'sl', id: partage[1] }

  let url: URL
  try {
    url = new URL(propre)
  } catch {
    return null
  }
  if (!/(^|\.)xivgear\.app$/i.test(url.hostname)) return null

  // L'ancienne forme mettait le chemin dans l'ancre, la nouvelle dans « page ».
  const chemin = url.searchParams.get('page') ?? url.hash.replace(/^#\/?/, '').replaceAll('/', '|')
  const parts = chemin.split('|').filter(Boolean)
  if (parts[0] === 'embed') parts.shift()

  const brutSet = url.searchParams.get('onlySetIndex')
  const set = brutSet !== null && /^\d+$/.test(brutSet) ? Number(brutSet) : undefined

  // Un lien court désigne un identifiant, pas un chemin : on vérifie sa forme
  // ici plutôt que d'aller déranger leur serveur pour qu'il nous le dise.
  if (parts[0] === 'sl' && uuid(parts[1] ?? '')) return { type: 'sl', id: parts[1], set }
  // Le catalogue est servi en fichiers : on n'y laisse passer que des noms de
  // dossier, jamais un chemin fabriqué.
  if (parts[0] === 'bis' && parts.length > 1) {
    const chemin = parts.slice(1)
    if (!chemin.every((p) => /^[a-z0-9_-]{1,40}$/i.test(p))) return null
    return { type: 'bis', chemin }
  }
  return null
}

async function feuilleXivgear(
  lien: string,
  cible: NonNullable<ReturnType<typeof cibleXivgear>>,
): Promise<Feuille> {
  const brut =
    cible.type === 'sl'
      ? await json(`${XIVGEAR_LIEN}${encodeURIComponent(cible.id)}`)
      : await json(`${XIVGEAR_BIS}${cible.chemin.join('/')}.json`)

  const tous = Array.isArray(brut.sets) ? (brut.sets as Record<string, unknown>[]) : []
  // Un lien peut désigner UN set de la feuille. L'index compte les séparateurs,
  // il s'applique donc avant qu'on les écarte.
  const gardes = cible.type === 'sl' && cible.set !== undefined && tous[cible.set]
    ? [tous[cible.set]]
    : tous

  const sets = []
  for (const jeu of gardes) {
    // Une feuille porte des intertitres (« Relic », « No Relic ») qui ne sont
    // pas des sets : ils n'ont pas de pièces, et le filtre suivant les écarte.
    const items = (jeu?.items ?? {}) as Record<string, { id?: unknown }>
    const pieces: Record<string, number> = {}
    for (const [leur, notre] of Object.entries(CASES_XIVGEAR)) {
      const id = items[leur]?.id
      if (typeof id === 'number' && id > 0) pieces[notre] = id
    }
    if (Object.keys(pieces).length > 0) {
      sets.push({ nom: typeof jeu.name === 'string' ? jeu.name : '', pieces })
    }
  }

  return {
    source: 'xivgear',
    job: typeof brut.job === 'string' ? brut.job : '',
    nom: typeof brut.name === 'string' ? brut.name : '',
    url: lien,
    sets,
  }
}

// --------------------------------------------------------------------------

/** Lit un lien, d'où qu'il vienne. Rend la feuille et ses sets ; le choix, s'il
 *  y en a un, revient au joueur. */
export async function lireFeuille(lien: string): Promise<Feuille> {
  const propre = lien.trim()
  const cible = cibleXivgear(propre)
  const feuille = cible
    ? await feuilleXivgear(propre, cible)
    : await feuilleEtro(propre, uuid(propre) ?? erreurLien(propre))
  // Une feuille sans une seule pièce n'apprend rien et casserait tous les
  // comptes : mieux vaut le dire que d'enregistrer un BiS vide.
  if (feuille.sets.length === 0) throw new ErreurBis('bisVide')
  return feuille
}

function erreurLien(lien: string): never {
  throw new ErreurBis(/xivgear/i.test(lien) ? 'bisXivgearForme' : 'bisLienInvalide')
}

/** Le set choisi, prêt à être enregistré. Le nom garde la trace des deux
 *  niveaux : la feuille, et le set qu'on y a pris. */
export function bisDeFeuille(feuille: Feuille, index: number): Bis {
  const set = feuille.sets[index] ?? feuille.sets[0]
  const nom = [feuille.nom, set.nom].filter(Boolean).join(' · ')
  return { job: feuille.job, nom, url: feuille.url, pieces: set.pieces }
}

// ---------------------------------------------------------------------------
// Ce qu'on en déduit
// ---------------------------------------------------------------------------

/** Où en est un emplacement.
 *
 *  Le savage n'a que deux marches : la pièce tombe finie. Le mémoquartz en a
 *  trois, parce qu'il s'achète d'abord et se termine ensuite avec un composant
 *  qui, lui, vient du raid. */
export type Etat =
  | 'attendu'
  | 'obtenu'
  | 'a-acheter'
  | 'a-ameliorer'
  | 'complet'
  | 'inconnu'
  | 'vide'

/** Un emplacement, une fois le BiS rangé : ce que le joueur y vise, d'où ça
 *  vient, et où il en est. */
export interface Vise {
  emplacement: RaidEmplacement
  /** Les pièces du BiS qui atterrissent ici — deux pour le paladin, dont le
   *  bouclier. Vide si la case n'est pas remplie. */
  pieces: RaidPiece[]
  /** Un objet du BiS que le catalogue du palier ne connaît pas : artisanat,
   *  extrême, ou pièce d'un autre palier. On ne prétend pas le nommer. */
  inconnus: number[]
  etat: Etat
}

/** Range un BiS contre le catalogue d'un palier.
 *
 *  La règle tient en une phrase : un emplacement est ATTENDU DU RAID si au
 *  moins une des pièces visées y tombe en savage. Le reste vient du mémoquartz
 *  ou d'ailleurs, ce qui ne veut pas dire gratuit : le mémoquartz se termine
 *  avec un composant qui tombe, lui aussi, en savage. */
export function rangerBis(
  palier: RaidPalier,
  bis: Bis | null,
  faits: number[],
  ameliores: number[] = [],
): Vise[] {
  const parId = new Map(palier.pieces.map((p) => [p.id, p]))
  const fait = new Set(faits)
  const ameliore = new Set(ameliores)
  return palier.emplacements.map((emplacement) => {
    const pieces: RaidPiece[] = []
    const inconnus: number[] = []
    for (const { etro, emplacement: cle } of CASES) {
      if (cle !== emplacement.cle) continue
      const id = bis?.pieces[etro]
      if (!id) continue
      const piece = parId.get(id)
      if (piece) pieces.push(piece)
      else inconnus.push(id)
    }
    const jai = fait.has(emplacement.id)
    let etat: Etat
    if (pieces.some((p) => p.provenance === 'savage')) etat = jai ? 'obtenu' : 'attendu'
    else if (pieces.length > 0) etat = ameliore.has(emplacement.id) ? 'complet' : jai ? 'a-ameliorer' : 'a-acheter'
    else etat = inconnus.length > 0 ? 'inconnu' : 'vide'
    return { emplacement, pieces, inconnus, etat }
  })
}

/** L'état suivant quand on clique. Le savage bascule, le mémoquartz monte ses
 *  marches et revient au début : on peut toujours défaire une erreur. */
export function etatSuivant(etat: Etat): Etat | null {
  if (etat === 'attendu') return 'obtenu'
  if (etat === 'obtenu') return 'attendu'
  if (etat === 'a-acheter') return 'a-ameliorer'
  if (etat === 'a-ameliorer') return 'complet'
  if (etat === 'complet') return 'a-acheter'
  return null
}

/** Ce qu'un état vaut dans le stockage : deux listes, deux booléens. */
export function marches(etat: Etat): { fait: boolean; ameliore: boolean } {
  return {
    fait: etat === 'obtenu' || etat === 'a-ameliorer' || etat === 'complet',
    ameliore: etat === 'complet',
  }
}

/** Combien de soirées il reste, étage par étage. C'est la seule question qu'un
 *  static se pose devant un palier : pas un inventaire, un nombre de soirs.
 *
 *  Les composants n'y figurent pas : ils tombent au hasard des étages, leur en
 *  attribuer un donnerait un compte faux avec l'air d'être précis. */
export interface Etage {
  etage: number
  /** Coffres encore attendus du raid, tous joueurs confondus. */
  pieces: number
  kills: number
  /** Qui attend quoi, pour que le nombre s'explique de lui-même. */
  parJoueur: { charId: number; emplacements: RaidEmplacement[] }[]
}

export function etages(vises: { charId: number; vises: Vise[] }[]): Etage[] {
  const parEtage = new Map<number, Etage>()
  for (const { charId, vises: liste } of vises) {
    for (const v of liste) {
      const n = v.emplacement.etage
      let e = parEtage.get(n)
      if (!e) {
        e = { etage: n, pieces: 0, kills: 0, parJoueur: [] }
        parEtage.set(n, e)
      }
      if (v.etat !== 'attendu') continue
      e.pieces++
      let j = e.parJoueur.find((x) => x.charId === charId)
      if (!j) {
        j = { charId, emplacements: [] }
        e.parJoueur.push(j)
      }
      j.emplacements.push(v.emplacement)
    }
  }
  const out = [...parEtage.values()].sort((a, b) => a.etage - b.etage)
  for (const e of out) e.kills = Math.ceil(e.pieces / PIECES_PAR_KILL)
  return out
}

/** Le composant que cet emplacement attend encore. Il sert de vignette : voir
 *  la fibre ou l'agent sur la pastille dit d'un coup d'œil ce qu'elle coûte,
 *  là où « mémoquartz » ne disait que d'où elle vient. */
export function materiauDe(palier: RaidPalier, vise: Vise): RaidMateriau | null {
  const piece = vise.pieces.find((p) => p.provenance === 'tome')
  if (!piece) return null
  const famille = FAMILLE[piece.emplacement]
  return palier.materiaux.find((m) => m.cle === famille) ?? null
}

/** Les composants qu'il manque encore au groupe.
 *
 *  Ils tombent en savage eux aussi, mais sans étage attitré : on les compte, on
 *  ne les convertit pas en soirées. Un chiffre honnête vaut mieux qu'une
 *  prévision inventée. */
export interface Besoin {
  materiau: RaidMateriau
  nombre: number
}

export function materiauxManquants(
  palier: RaidPalier,
  cartes: { vises: Vise[] }[],
): Besoin[] {
  const compte = new Map<string, number>()
  const ajoute = (cle: string) => compte.set(cle, (compte.get(cle) ?? 0) + 1)
  for (const { vises } of cartes) {
    for (const v of vises) {
      if (v.etat !== 'a-acheter' && v.etat !== 'a-ameliorer') continue
      // Une par PIÈCE et non par emplacement : le paladin qui vise l'arme et le
      // bouclier en mémoquartz en améliore bien deux.
      for (const piece of v.pieces) {
        const famille = FAMILLE[piece.emplacement]
        if (!famille) continue
        ajoute(famille)
        // L'arme de mémoquartz coûte deux fois : un mémoquartz générique pour
        // l'acheter, puis son agent renforçant pour la terminer.
        if (famille === 'arme' && v.etat === 'a-acheter') ajoute('achat')
      }
    }
  }
  return palier.materiaux
    .map((materiau) => ({ materiau, nombre: compte.get(materiau.cle) ?? 0 }))
    .filter((b) => b.nombre > 0)
}
