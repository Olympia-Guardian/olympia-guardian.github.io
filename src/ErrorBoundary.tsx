import { Component, type ErrorInfo, type ReactNode } from 'react'

// Filet de sécurité : sans lui, la moindre exception pendant un rendu vide la
// page entièrement, fond blanc, sans un mot. L'utilisateur ne sait ni ce qui
// s'est passé ni quoi faire. Ici il voit au moins un message, peut recharger,
// et peut vider les données locales quand c'est un cache abîmé qui bloque.

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/** Vide les caches de l'app sans toucher au reste du navigateur. */
function purgeLocal(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('ogs.')) localStorage.removeItem(key)
    }
  } catch {
    // stockage inaccessible : il n'y a rien à purger, on recharge quand même
  }
  location.reload()
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Erreur de rendu :', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="crash">
        <h1>Codex Olympia a rencontré un problème</h1>
        <p>
          L'affichage s'est interrompu. Recharger suffit presque toujours. Si le problème
          revient, vider les données enregistrées sur cet appareil remet l'application à
          neuf : tes collections sont sur le serveur, elles ne seront pas perdues.
        </p>
        <div className="crash-actions">
          <button className="btn" onClick={() => location.reload()}>
            Recharger la page
          </button>
          <button className="btn ghost" onClick={purgeLocal}>
            Vider les données locales et recharger
          </button>
        </div>
        <pre className="crash-detail">{error.message}</pre>
      </div>
    )
  }
}
