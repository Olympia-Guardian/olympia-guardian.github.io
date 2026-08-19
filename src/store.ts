import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  KINDS,
  fetchCharacter,
  fetchDb,
  fetchRelicDb,
  type Character,
  type Item,
  type Kind,
  type RelicDb,
} from './api'

// ---------------------------------------------------------------------------
// Base d'objets (montures, mascottes, cartes Triple Triad, accessoires,
// orchestrion, magie bleue)
// ---------------------------------------------------------------------------

export type Db = Record<Kind, Item[]>

/** Les trois gros catalogues pèsent 5,5 Mo des 8,6 : succès (3946 entrées),
 *  armoire (3521) et tenues (1086 avec leurs 6392 pièces). Rien à l'accueil,
 *  au planning ni à la matrice n'en dépend, alors qu'attendre leur arrivée
 *  retenait la page entière plus d'une minute en connexion lente. Ils partent
 *  donc en seconde vague, et chacun s'affiche dès qu'il est là. */
const HEAVY_KINDS: Kind[] = ['achievements', 'armoires', 'outfits']
const LIGHT_KINDS: Kind[] = KINDS.filter((k) => !HEAVY_KINDS.includes(k))

export function useDb() {
  const [db, setDb] = useState<Db | null>(null)
  const [pending, setPending] = useState<Set<Kind>>(() => new Set(HEAVY_KINDS))
  const [error, setError] = useState<string | null>(null)
  // Un gros catalogue peut arriver avant la première vague : on le met de côté
  // ici, sinon le `setDb` partirait sur un état encore nul et serait perdu.
  const early = useRef<Partial<Record<Kind, Item[]>>>({})

  useEffect(() => {
    let cancelled = false

    Promise.all(LIGHT_KINDS.map((k) => fetchDb(k)))
      .then((lists) => {
        if (cancelled) return
        const base = Object.fromEntries(KINDS.map((k) => [k, [] as Item[]])) as Db
        LIGHT_KINDS.forEach((k, i) => {
          base[k] = lists[i]
        })
        setDb({ ...base, ...early.current })
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })

    for (const kind of HEAVY_KINDS) {
      fetchDb(kind)
        .then((list) => {
          if (cancelled) return
          early.current[kind] = list
          setDb((prev) => (prev ? { ...prev, [kind]: list } : prev))
          setPending((prev) => {
            const next = new Set(prev)
            next.delete(kind)
            return next
          })
        })
        .catch(() => {
          // la collection reste marquée en chargement, un rechargement réessaie
        })
    }

    return () => {
      cancelled = true
    }
  }, [])

  return { db, pending, error }
}

/** Fraîcheur des catalogues. Le cron nocturne peut casser sans que personne
 *  ne le sache : l'application continue alors à servir sereinement les données
 *  de la veille jusqu'à ce qu'un joueur remarque qu'un patch entier manque.
 *  L'horodatage était déjà publié dans meta.json, simplement jamais lu. */
export function useDataAge(): number | null {
  const [jours, setJours] = useState<number | null>(null)
  useEffect(() => {
    let annule = false
    fetch(`${import.meta.env.BASE_URL}data/meta.json`, { signal: AbortSignal.timeout(10000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => {
        if (annule || !m?.updatedAt) return
        const ms = Date.now() - new Date(m.updatedAt).getTime()
        setJours(Math.floor(ms / 86_400_000))
      })
      .catch(() => {
        // pas d'horodatage : on n'affiche rien plutôt qu'une fausse alerte
      })
    return () => {
      annule = true
    }
  }, [])
  return jours
}

/** Base des reliques (chargée en parallèle, la vue Reliques attend son arrivée). */
export function useRelicDb() {
  const [relicDb, setRelicDb] = useState<RelicDb | null>(null)
  useEffect(() => {
    let cancelled = false
    fetchRelicDb()
      .then((db) => {
        if (!cancelled) setRelicDb(db)
      })
      .catch(() => {
        // la vue affichera l'état de chargement ; un rechargement réessaie
      })
    return () => {
      cancelled = true
    }
  }, [])
  return relicDb
}

// ---------------------------------------------------------------------------
// Hash de l'URL
// ---------------------------------------------------------------------------

/** Met à jour un paramètre du hash sans toucher aux autres (j, c, login).
 *  L'ancre — la partie sans `=`, qui porte l'onglet de la section — est
 *  conservée telle quelle : consommer une invitation ne doit pas faire sauter
 *  l'onglet sous les yeux du visiteur. Voir src/routes.ts. */
export function setHashParam(key: string, value: string | null): void {
  const map = new Map<string, string>()
  const ancres: string[] = []
  for (const part of location.hash.replace(/^#/, '').split('&')) {
    const i = part.indexOf('=')
    if (i > 0) map.set(part.slice(0, i), part.slice(i + 1))
    else if (part.length > 0) ancres.push(part)
  }
  if (value) map.set(key, value)
  else map.delete(key)
  const parts = [...ancres, ...[...map.entries()].map(([k, v]) => `${k}=${v}`)]
  history.replaceState(
    null,
    '',
    location.pathname + location.search + (parts.length > 0 ? '#' + parts.join('&') : ''),
  )
}

/** Valeur d'un paramètre du hash (#r=…&tab=…). */
export function readHashParam(key: string): string | null {
  const m = location.hash.match(new RegExp(`(?:^#|[#&])${key}=([^&]*)`))
  return m ? m[1] : null
}

// ---------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------

export interface Member {
  id: number
  status: 'loading' | 'ok' | 'error'
  error?: string
  data?: Character
  /** Surnom posé dans le groupe actif. Remplace le nom partout à l'écran ;
   *  le nom du Lodestone reste dans `data`, il n'est jamais réécrit. */
  alias?: string
}

/** Nom d'un membre tel qu'on doit l'afficher : son surnom s'il en a un. */
export function nomMembre(m: { alias?: string; data?: Character }): string {
  return m.alias ?? m.data?.name ?? ''
}

/** Version courte, pour les colonnes étroites et les jauges : le prénom, ou
 *  l'alias entier — on ne coupe pas un surnom, il est déjà court et il a été
 *  choisi tel quel. */
export function nomCourt(m: { alias?: string; data?: Character }): string {
  return m.alias ?? m.data?.name.split(' ')[0] ?? ''
}

/** Fiches des membres d'une liste d'ids (le groupe actif) : chargement,
 *  rafraîchissement — la composition de la liste vit dans useGroups. */
/** Fiches chargées de front. Au-delà, le worker enchaîne les lectures du
 *  Lodestone plus vite que Square Enix ne les tolère. */
const MAX_PARALLEL_CHARS = 4

export function useMembers(ids: number[]) {
  const [members, setMembers] = useState<Member[]>(() =>
    ids.map((id) => ({ id, status: 'loading' as const })),
  )
  const inFlight = useRef(new Set<number>())
  // Relance la file quand une fiche se libère, sans dépendre du rendu.
  const [tick, setTick] = useState(0)

  const load = useCallback(async (id: number, force: boolean) => {
    if (inFlight.current.has(id)) return
    inFlight.current.add(id)
    try {
      const data = await fetchCharacter(id, force)
      setMembers((prev) => prev.map((m) => (m.id === id ? { id, status: 'ok', data } : m)))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setMembers((prev) =>
        prev.map((m) => (m.id === id ? { id, status: 'error', error: msg } : m)),
      )
    } finally {
      inFlight.current.delete(id)
      setTick((n) => n + 1)
    }
  }, [])

  // La liste suit le groupe : on garde les fiches déjà chargées.
  const key = ids.join('.')
  useEffect(() => {
    setMembers((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]))
      return ids.map((id) => byId.get(id) ?? { id, status: 'loading' as const })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // Un groupe de 50 membres lançait 50 chargements d'un coup, soit jusqu'à
  // 250 lectures du Lodestone en rafale côté worker. On n'en laisse partir que
  // quelques-unes à la fois : le premier membre s'affiche aussi vite, les
  // suivants s'enchaînent, et le site de Square Enix ne nous bloque pas.
  useEffect(() => {
    let libres = MAX_PARALLEL_CHARS - inFlight.current.size
    for (const m of members) {
      if (libres <= 0) break
      if (m.status === 'loading' && !inFlight.current.has(m.id)) {
        libres--
        void load(m.id, false)
      }
    }
  }, [members, load, tick])

  const refresh = useCallback(
    (id: number) => {
      setMembers((prev) =>
        prev.map((m) => (m.id === id ? { ...m, status: 'loading' as const } : m)),
      )
      void load(id, true)
    },
    [load],
  )

  // Rechargement doux : ne force PAS de scrape Lodestone côté worker (sinon il
  // écraserait les validations temporaires montures/mascottes et grillerait la
  // synchro quotidienne). Invalider le cache front au préalable si besoin.
  const reload = useCallback(
    (id: number) => {
      setMembers((prev) =>
        prev.map((m) => (m.id === id ? { ...m, status: 'loading' as const } : m)),
      )
      void load(id, false)
    },
    [load],
  )

  return { members, refresh, reload }
}

// ---------------------------------------------------------------------------
// Sélecteurs
// ---------------------------------------------------------------------------

/** Membres chargés avec succès. */
export function useReadyMembers(members: Member[]): (Member & { data: Character })[] {
  return useMemo(
    () => members.filter((m): m is Member & { data: Character } => m.status === 'ok' && !!m.data),
    [members],
  )
}

/** Par membre et par type de collection : Set des IDs possédés (FFXIV Collect). */
export function useOwnedSets(ready: (Member & { data: Character })[]) {
  return useMemo(() => {
    const map = new Map<number, Record<Kind, Set<number>>>()
    for (const m of ready) {
      map.set(
        m.id,
        Object.fromEntries(KINDS.map((k) => [k, new Set(m.data[k].ids)])) as Record<
          Kind,
          Set<number>
        >,
      )
    }
    return map
  }, [ready])
}
