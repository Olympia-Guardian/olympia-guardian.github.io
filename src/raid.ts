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

/** Etro sert son API sans authentification et l'ouvre aux autres origines :
 *  l'import tient entièrement dans le navigateur, sans relais par le worker. */
const ETRO_API = 'https://etro.gg/api/gearsets/'

/** Une erreur d'import qui se dit au joueur. Le message est une CLÉ de
 *  traduction : la vue sait l'afficher dans sa langue. */
export class ErreurBis extends Error {}

function uuidEtro(lien: string): string | null {
  const m = lien.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  return m ? m[0] : null
}

export async function importerBis(lien: string): Promise<Bis> {
  const propre = lien.trim()
  const uuid = uuidEtro(propre)
  // Un lien XIVGear ne porte pas d'uuid : on le dit plutôt que d'échouer sur
  // « lien invalide », qui laisserait croire à une faute de frappe.
  if (!uuid) {
    throw new ErreurBis(/xivgear/i.test(propre) ? 'bisXivgear' : 'bisLienInvalide')
  }

  let brut: Record<string, unknown>
  try {
    const res = await fetch(`${ETRO_API}${uuid}/`, { signal: AbortSignal.timeout(15000) })
    if (res.status === 404) throw new ErreurBis('bisIntrouvable')
    if (!res.ok) throw new ErreurBis('bisInjoignable')
    brut = (await res.json()) as Record<string, unknown>
  } catch (e) {
    throw e instanceof ErreurBis ? e : new ErreurBis('bisInjoignable')
  }

  const pieces: Record<string, number> = {}
  for (const { etro } of CASES) {
    const v = brut[etro]
    if (typeof v === 'number' && v > 0) pieces[etro] = v
  }
  // Un set sans une seule pièce n'apprend rien et casserait tous les comptes.
  if (Object.keys(pieces).length === 0) throw new ErreurBis('bisVide')

  return {
    job: typeof brut.jobAbbrev === 'string' ? brut.jobAbbrev : '',
    nom: typeof brut.name === 'string' ? brut.name : '',
    url: propre,
    pieces,
  }
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
