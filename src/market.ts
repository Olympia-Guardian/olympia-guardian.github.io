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

/** Ce que le marche a fait recemment sur un objet. C'est le repere qui manque
 *  devant l'hotel des ventes : une offre a 6,5 M ne dit rien tant qu'on ignore
 *  si l'objet se vend d'habitude 2 M ou 12 M — ni sur combien de ventes repose
 *  cette habitude. */
export interface Repere {
  /** Prix moyen des ventes recentes. */
  moyenne: number
  /** Derniere vente conclue. Comparee a la moyenne, elle donne le sens : sous
   *  la moyenne, le prix redescend ; au-dessus, il monte. */
  derniere?: { prix: number; quand: number }
  /** Ventes par jour. Dit la solidite du reste : une moyenne batie sur une
   *  vente tous les quatre jours n'a pas le poids d'une moyenne sur trente. */
  parJour?: number
}

export type MoyenneMap = Map<number, Repere>

export interface Prix {
  offres: PriceMap
  moyennes: MoyenneMap
}

// Universalis accepte une centaine d'identifiants par requête.
const LOT = 100
// Les prix bougent, mais pas assez pour justifier de les redemander à chaque
// ouverture d'onglet. Un quart d'heure est un bon compromis.
const TTL = 15 * 60 * 1000

interface Cache {
  at: number
  dc: string
  offres: Record<number, Listing[]>
  repere?: Repere
}

const memoire = new Map<string, Cache>()

// Région du centre de données : le voyage entre centres n'est possible qu'à
// l'intérieur d'une même région physique (Chaos et Light sont tous deux en
// Europe). La liste vient d'Universalis plutôt que d'être écrite en dur, pour
// suivre l'ajout de nouveaux centres.
let regions: Map<string, string> | null = null
/** Monde -> centre de données : en portée régionale, savoir qu'un monde est
 *  sur l'autre centre change le coût du voyage, donc l'information doit être
 *  visible et pas devinée. */
let centreDuMonde: Map<string, string> | null = null

async function chargerCentres(): Promise<void> {
  if (regions) return
  try {
    const [rdc, rw] = await Promise.all([
      fetch('https://universalis.app/api/v2/data-centers', { signal: AbortSignal.timeout(10000) }),
      fetch('https://universalis.app/api/v2/worlds', { signal: AbortSignal.timeout(10000) }),
    ])
    if (!rdc.ok || !rw.ok) return
    const dcs = (await rdc.json()) as { name: string; region: string; worlds: number[] }[]
    const mondes = (await rw.json()) as { id: number; name: string }[]
    const nomParId = new Map(mondes.map((w) => [w.id, w.name]))
    regions = new Map(dcs.map((d) => [d.name, d.region]))
    centreDuMonde = new Map()
    for (const d of dcs) {
      for (const id of d.worlds) {
        const nom = nomParId.get(id)
        if (nom) centreDuMonde.set(nom, d.name)
      }
    }
  } catch {
    // sans cette correspondance, on affichera le monde seul
  }
}

export async function fetchRegion(dc: string): Promise<string | null> {
  await chargerCentres()
  return regions?.get(dc) ?? null
}

/** Centre d'un monde, ou null si la correspondance n'a pas pu être chargée. */
export function centreDe(monde: string): string | null {
  return centreDuMonde?.get(monde) ?? null
}

/** Offres les moins chères de chaque objet sur un centre de données.
 *  `onProgress` permet d'afficher l'avancement : une recherche large peut
 *  demander une dizaine de requêtes. */
/** Prix moyen de vente, lu sur le point d'entree AGREGE d'Universalis. Il le
 *  precalcule : cent objets reviennent en une seconde, la ou le meme calcul
 *  demande au vol expirait des vingt objets.
 *
 *  En portee « centre », la valeur est dans `dc` ; en portee « region », dans
 *  `region`. Un echec ne fait rien perdre : la liste des offres reste juste,
 *  seule la comparaison manque. */
async function moyennesAgregees(dc: string, ids: number[]): Promise<MoyenneMap> {
  const out: MoyenneMap = new Map()
  try {
    const res = await fetch(
      `https://universalis.app/api/v2/aggregated/${encodeURIComponent(dc)}/${ids.join(',')}`,
      { signal: AbortSignal.timeout(20000) },
    )
    if (!res.ok) return out
    type Portee = { price?: number; timestamp?: number; quantity?: number }
    type Deux = { dc?: Portee; region?: Portee }
    const j = (await res.json()) as {
      results?: {
        itemId?: number
        nq?: {
          averageSalePrice?: Deux
          recentPurchase?: Deux
          dailySaleVelocity?: Deux
        }
      }[]
    }
    // En portee « centre » la valeur est dans `dc`, en portee « region » dans
    // `region` : on prend celle qui est renseignee.
    const lire = (d: Deux | undefined): Portee | undefined => d?.dc ?? d?.region
    for (const r of j.results ?? []) {
      const moyenne = lire(r.nq?.averageSalePrice)?.price ?? 0
      if (!r.itemId || moyenne <= 0) continue
      const derniere = lire(r.nq?.recentPurchase)
      const vitesse = lire(r.nq?.dailySaleVelocity)?.quantity
      out.set(r.itemId, {
        moyenne,
        derniere:
          derniere?.price && derniere.timestamp
            ? { prix: derniere.price, quand: derniere.timestamp }
            : undefined,
        parJour: vitesse && vitesse > 0 ? vitesse : undefined,
      })
    }
  } catch {
    // sans moyenne, on affiche simplement le prix sans commentaire
  }
  return out
}

export async function fetchPrices(
  dc: string,
  itemIds: number[],
  onProgress?: (fait: number, total: number) => void,
): Promise<Prix> {
  const out: PriceMap = new Map()
  const moyennes: MoyenneMap = new Map()
  const aChercher: number[] = []

  for (const id of itemIds) {
    const c = memoire.get(`${dc}:${id}`)
    if (c && Date.now() - c.at < TTL) {
      const l = c.offres[id]
      if (l) out.set(id, l)
      if (c.repere) moyennes.set(id, c.repere)
    } else aChercher.push(id)
  }

  const lots: number[][] = []
  for (let i = 0; i < aChercher.length; i += LOT) lots.push(aChercher.slice(i, i + LOT))

  let fait = 0
  for (const lot of lots) {
    // `entries=0` : surtout ne pas demander l'historique ici. Universalis le
    // recalcule objet par objet et sa passerelle coupe a dix secondes — vingt
    // objets suffisaient a la faire expirer. Et comme une erreur de leur cote
    // ne porte pas d'en-tetes CORS, le navigateur annoncait un probleme de
    // CORS la ou il n'y avait qu'un delai depasse.
    const url =
      `https://universalis.app/api/v2/${encodeURIComponent(dc)}/${lot.join(',')}` +
      `?listings=8&entries=0&fields=items.listings.pricePerUnit%2Citems.listings.worldName%2Citems.listings.quantity%2CitemID%2Clistings.pricePerUnit%2Clistings.worldName%2Clistings.quantity`
    // Les deux partent ensemble : la moyenne n'allonge pas l'attente.
    const [reponse, moyennesDuLot] = await Promise.all([
      fetch(url, { signal: AbortSignal.timeout(20000) }).catch(() => null),
      moyennesAgregees(dc, lot),
    ])
    for (const [id, m] of moyennesDuLot) moyennes.set(id, m)
    try {
      if (reponse?.ok) {
        const j = await reponse.json()
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
            memoire.set(`${dc}:${id}`, {
              at: Date.now(),
              dc,
              offres: { [id]: offres },
              repere: moyennesDuLot.get(id),
            })
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
  return { offres: out, moyennes }
}

/** Ecart d'un prix a la moyenne des ventes, en pourcentage. Null uniquement
 *  quand Universalis n'a pas de vente a comparer — un ecart faible reste une
 *  reponse : « au prix habituel » se lit tout autant que « +56 % ». */
export function ecartMoyenne(prix: number, repere: Repere | undefined): number | null {
  const moyenne = repere?.moyenne ?? 0
  if (moyenne <= 0 || prix <= 0) return null
  return Math.round(((prix - moyenne) / moyenne) * 100)
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
