// Prix de l'hôtel des ventes, via Universalis.
//
// L'appel part du NAVIGATEUR, pas du worker : leur API autorise les origines
// tierces, donc chaque joueur consomme son propre quota et ça ne coûte rien
// à notre hébergement. Faire transiter ça par Cloudflare aurait ajouté une
// sous-requête par objet et centralisé le risque de limitation.

/** Une offre en vente : prix unitaire, monde où elle se trouve, quantité. */
export interface Listing {
  price: number
  world: string
  qty: number
}

export type PriceMap = Map<number, Listing[]>

// Universalis accepte une centaine d'identifiants par requête.
const LOT = 100
// Les prix bougent, mais pas assez pour justifier de les redemander à chaque
// ouverture d'onglet. Un quart d'heure est un bon compromis.
const TTL = 15 * 60 * 1000

interface Cache {
  at: number
  dc: string
  offres: Record<number, Listing[]>
}

const memoire = new Map<string, Cache>()

/** Offres les moins chères de chaque objet sur un centre de données.
 *  `onProgress` permet d'afficher l'avancement : une recherche large peut
 *  demander une dizaine de requêtes. */
export async function fetchPrices(
  dc: string,
  itemIds: number[],
  onProgress?: (fait: number, total: number) => void,
): Promise<PriceMap> {
  const out: PriceMap = new Map()
  const aChercher: number[] = []

  for (const id of itemIds) {
    const c = memoire.get(`${dc}:${id}`)
    if (c && Date.now() - c.at < TTL) {
      const l = c.offres[id]
      if (l) out.set(id, l)
    } else aChercher.push(id)
  }

  const lots: number[][] = []
  for (let i = 0; i < aChercher.length; i += LOT) lots.push(aChercher.slice(i, i + LOT))

  let fait = 0
  for (const lot of lots) {
    try {
      const url =
        `https://universalis.app/api/v2/${encodeURIComponent(dc)}/${lot.join(',')}` +
        `?listings=8&entries=0&fields=items.listings.pricePerUnit%2Citems.listings.worldName%2Citems.listings.quantity%2CitemID%2Clistings.pricePerUnit%2Clistings.worldName%2Clistings.quantity`
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
      if (res.ok) {
        const j = await res.json()
        // Un seul identifiant demandé : la réponse n'est pas enveloppée.
        const items: Record<string, unknown> =
          j.items ?? (j.itemID ? { [j.itemID]: j } : {})
        for (const [k, v] of Object.entries(items)) {
          const brut = (v as { listings?: unknown[] }).listings ?? []
          const offres: Listing[] = brut
            .map((l) => {
              const o = l as { pricePerUnit?: number; worldName?: string; quantity?: number }
              return { price: o.pricePerUnit ?? 0, world: o.worldName ?? '?', qty: o.quantity ?? 1 }
            })
            .filter((o) => o.price > 0)
            .sort((a, b) => a.price - b.price)
          const id = Number(k)
          if (offres.length > 0) {
            out.set(id, offres)
            memoire.set(`${dc}:${id}`, { at: Date.now(), dc, offres: { [id]: offres } })
          }
        }
      }
    } catch {
      // Un lot en échec ne doit pas perdre les autres : l'objet reste
      // simplement sans prix et n'apparaîtra pas dans les propositions.
    }
    fait += lot.length
    onProgress?.(Math.min(fait, aChercher.length), aChercher.length)
  }
  return out
}

// ---------------------------------------------------------------------------
// Choix des achats
// ---------------------------------------------------------------------------

export interface Achat {
  itemId: number
  price: number
  world: string
}

/** Budget à 0 = pas de plafond de dépense ; prix maximum à 0 = pas de
 *  plafond par objet. Les deux se combinent : le prix maximum filtre les
 *  objets un par un, le budget arrête la liste. Sans le premier, un seul
 *  objet cher pouvait avaler toute l'enveloppe. */
const sansPlafond = (n: number) => (n > 0 ? n : Number.POSITIVE_INFINITY)

/** Le plus d'objets possible pour le budget. Trier par prix croissant et
 *  prendre tant que ça rentre est optimal pour ce critère : il n'y a pas
 *  besoin d'algorithme plus savant, chaque objet compte pour un. */
export function plusDObjets(prix: PriceMap, budget: number, prixMax = 0): Achat[] {
  const plafondObjet = sansPlafond(prixMax)
  const candidats: Achat[] = []
  for (const [itemId, offres] of prix) {
    const o = offres.find((x) => x.price <= plafondObjet)
    if (o) candidats.push({ itemId, price: o.price, world: o.world })
  }
  candidats.sort((a, b) => a.price - b.price)
  const pris: Achat[] = []
  let reste = sansPlafond(budget)
  for (const c of candidats) {
    if (c.price > reste) continue
    pris.push(c)
    reste -= c.price
  }
  return pris
}

/** Le moins de voyages possible : on cherche le monde qui, à lui seul, permet
 *  d'acheter le plus d'objets dans le budget, puis on complète avec le
 *  meilleur monde suivant. Un objet acheté sur place vaut mieux qu'un objet
 *  légèrement moins cher trois voyages plus loin. */
export function moinsDeVoyages(
  prix: PriceMap,
  budget: number,
  prixMax = 0,
  maxMondes = 2,
): Achat[] {
  const plafondObjet = sansPlafond(prixMax)
  const parMonde = new Map<string, Achat[]>()
  for (const [itemId, offres] of prix) {
    const vus = new Set<string>()
    for (const o of offres) {
      if (o.price > plafondObjet || vus.has(o.world)) continue
      vus.add(o.world)
      const liste = parMonde.get(o.world) ?? []
      liste.push({ itemId, price: o.price, world: o.world })
      parMonde.set(o.world, liste)
    }
  }

  const retenus: Achat[] = []
  const dejaPris = new Set<number>()
  let reste = sansPlafond(budget)

  for (let tour = 0; tour < maxMondes; tour++) {
    let meilleur: { monde: string; achats: Achat[] } | null = null
    for (const [monde, liste] of parMonde) {
      const dispo = liste
        .filter((a) => !dejaPris.has(a.itemId))
        .sort((a, b) => a.price - b.price)
      const achats: Achat[] = []
      let budgetMonde = reste
      for (const a of dispo) {
        if (a.price > budgetMonde) continue
        achats.push(a)
        budgetMonde -= a.price
      }
      if (!meilleur || achats.length > meilleur.achats.length) meilleur = { monde, achats }
    }
    if (!meilleur || meilleur.achats.length === 0) break
    for (const a of meilleur.achats) {
      retenus.push(a)
      dejaPris.add(a.itemId)
      reste -= a.price
    }
    parMonde.delete(meilleur.monde)
  }
  return retenus
}

/** Regroupe une sélection par monde, dans l'ordre décroissant d'intérêt. */
export function parMonde(achats: Achat[]): { world: string; achats: Achat[]; total: number }[] {
  const map = new Map<string, Achat[]>()
  for (const a of achats) {
    const l = map.get(a.world) ?? []
    l.push(a)
    map.set(a.world, l)
  }
  return [...map.entries()]
    .map(([world, liste]) => ({
      world,
      achats: liste.sort((a, b) => a.price - b.price),
      total: liste.reduce((s, a) => s + a.price, 0),
    }))
    .sort((a, b) => b.achats.length - a.achats.length)
}
