import { useEffect, useRef } from 'react'

// Les coches sont enregistrées avec 1200 ms de retard, pour ne pas envoyer une
// requête par clic. Problème : fermer l'onglet, changer d'onglet du journal ou
// subir un rechargement automatique dans cette seconde-là faisait disparaître
// la coche sans le moindre message. On force donc l'envoi dès que la page
// passe en arrière-plan, et au démontage du composant.
//
// `visibilitychange` est le seul signal fiable sur mobile : `beforeunload`
// n'est pas déclenché quand le système ferme l'onglet en tâche de fond.

export function useFlushOnHide(flush: () => void): void {
  const ref = useRef(flush)
  ref.current = flush

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') ref.current()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onHide)
      ref.current()
    }
  }, [])
}
