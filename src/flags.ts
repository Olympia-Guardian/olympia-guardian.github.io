// Interrupteurs : de quoi éteindre une partie de l'application sans déployer.
//
// Le défaut est ALLUMÉ, et il le reste si le worker ne répond pas. Une panne de
// réseau ne doit pas éteindre le site : on préfère montrer un écran qui aurait
// dû être caché que cacher tout un site parce qu'un appel a échoué.
//
// Ce que l'écran cache, le worker le refuse aussi de son côté : masquer un
// bouton n'est pas une sécurité, seulement une politesse.

import { useEffect, useState } from 'react'
import { WORKER_API } from './api'

export interface Flags {
  /** Mon Marché. Purement client : le marché interroge Universalis en direct. */
  market: boolean
  /** Création de groupes de raid. Les groupes déjà créés continuent de vivre. */
  raid: boolean
  /** Suggestions entre joueurs. */
  suggestions: boolean
}

export const FLAGS_ALLUMES: Flags = { market: true, raid: true, suggestions: true }

export function useFlags(): Flags {
  const [flags, setFlags] = useState<Flags>(FLAGS_ALLUMES)
  useEffect(() => {
    let vivant = true
    fetch(`${WORKER_API}/flags`, { signal: AbortSignal.timeout(8000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivant || !d) return
        // Chaque clé se lit à part : un worker plus ancien qui n'en connaîtrait
        // qu'une partie laisse les autres allumées.
        setFlags({
          market: d.market !== false,
          raid: d.raid !== false,
          suggestions: d.suggestions !== false,
        })
      })
      .catch(() => undefined)
    return () => {
      vivant = false
    }
  }, [])
  return flags
}

// ---------------------------------------------------------------------------
// Signal d'écran
// ---------------------------------------------------------------------------

/** Les écrans déjà annoncés dans cet onglet. Une fois par écran et par session :
 *  ce qu'on veut savoir, c'est si une fonctionnalité SERT, pas combien de fois
 *  quelqu'un fait l'aller-retour entre deux onglets. */
const annonces = new Set<string>()

/** Refusé une fois, on n'insiste plus de la visite. Un bloqueur de publicité
 *  reconnaît ce genre d'appel et le coupe ; ré-essayer à chaque écran ne le
 *  ferait pas passer davantage, et remplissait la console d'erreurs rouges chez
 *  qui en a un. */
let refuse = false

/** Annonce l'écran ouvert. Anonyme : aucun identifiant ne part, le worker ne
 *  garde qu'un compteur par jour et par écran.
 *
 *  Le refus est un résultat acceptable, pas une panne à réparer : qui bloque ce
 *  genre d'appel a fait un choix, et une mesure ne doit jamais gêner ce qu'elle
 *  mesure. On n'a donc aucun repli — le `fetch` de secours ne servait qu'à
 *  échouer une seconde fois, plus bruyamment. */
export function noterEcran(ecran: string) {
  if (refuse || annonces.has(ecran)) return
  annonces.add(ecran)
  try {
    // sendBeacon ne bloque rien et survit à la fermeture de l'onglet. Son type
    // par défaut évite la requête préliminaire CORS, le worker lisant le corps
    // lui-même.
    if (navigator.sendBeacon?.(`${WORKER_API}/usage`, JSON.stringify({ ecran }))) return
  } catch {
    // navigateur sans sendBeacon, ou appel coupé
  }
  refuse = true
}
