import { useEffect, useState } from 'react'
import { useI18n } from './i18n'

// Barre de chargement globale, en haut de l'écran. Choix d'une barre plutôt que
// d'un voile : l'application reste utilisable pendant que les gros catalogues
// arrivent en seconde vague, et masquer l'écran entier ferait attendre pour
// rien. Elle dit « ça travaille », elle n'empêche pas de travailler.
//
// Le délai avant apparition évite le clignotement : un chargement de 150 ms ne
// doit rien afficher du tout, sinon l'interface papillote à chaque clic.
const DELAI_MS = 250
// Sortie retardée : une barre qui disparaît à l'instant précis où la donnée
// arrive donne l'impression d'un saut. On la laisse finir sa course.
const SORTIE_MS = 400

export function GlobalLoader({ active }: { active: boolean }) {
  const { t } = useI18n()
  const [visible, setVisible] = useState(false)
  const [sortant, setSortant] = useState(false)

  useEffect(() => {
    if (active) {
      setSortant(false)
      const id = setTimeout(() => setVisible(true), DELAI_MS)
      return () => clearTimeout(id)
    }
    if (!visible) return
    setSortant(true)
    const id = setTimeout(() => {
      setVisible(false)
      setSortant(false)
    }, SORTIE_MS)
    return () => clearTimeout(id)
  }, [active, visible])

  if (!visible) return null
  return (
    <div
      className={`app-loader ${sortant ? 'is-leaving' : ''}`}
      role="status"
      aria-live="polite"
      aria-label={t('loading')}
    >
      <span className="app-loader-bar" />
    </div>
  )
}
