// Le BiS importé, et ce qu'on en déduit.
//
// Un joueur a déjà écrit, ailleurs, ce qu'il vise pièce par pièce. Lui
// redemander emplacement par emplacement ce qu'il prendra en savage serait de
// la saisie pure : le lien suffit, la provenance se lit dans le catalogue du
// palier. Le seul geste qui reste est celui qui ne se déduit d'aucune donnée —
// « je l'ai obtenue ».

import type { RaidEmplacement, RaidPalier, RaidPiece } from './api'

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

export type Etat = 'attendu' | 'fait' | 'ailleurs'

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
 *  moins une des pièces visées y tombe en savage. Le reste — mémoquartz,
 *  artisanat, objet inconnu — se prend ailleurs et ne coûte aucune soirée. */
export function rangerBis(
  palier: RaidPalier,
  bis: Bis | null,
  faits: number[],
): Vise[] {
  const parId = new Map(palier.pieces.map((p) => [p.id, p]))
  const fait = new Set(faits)
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
    const duRaid = pieces.some((p) => p.provenance === 'savage')
    const etat: Etat = !duRaid ? 'ailleurs' : fait.has(emplacement.id) ? 'fait' : 'attendu'
    return { emplacement, pieces, inconnus, etat }
  })
}

/** Combien de soirées il reste, étage par étage. C'est la seule question qu'un
 *  static se pose devant un palier : pas un inventaire, un nombre de soirs. */
export interface Etage {
  etage: number
  /** Pièces encore attendues du raid, tous joueurs confondus. */
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
