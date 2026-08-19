import { useMemo } from 'react'
import type { Character, RaidPalier } from '../api'
import { useI18n } from '../i18n'
import { nomCourt, type Member } from '../store'
import { onAvatarImgError, onItemImgError } from '../ui'

type Ready = Member & { data: Character }

// ---------------------------------------------------------------------------
// Le butin d'un palier savage : qui a déjà pris quoi.
//
// L'unité suivie est le COFFRE, pas la pièce. Dix emplacements par joueur là où
// le palier compte quatre-vingt-huit objets : c'est le coffre qui se distribue
// le soir du raid, et sa variante par job ne se choisit qu'après.
//
// Les lignes sont groupées par ÉTAGE, parce que c'est ainsi qu'on farme — on
// ne fait pas « les bottes », on fait le deuxième étage et on regarde ce qu'il
// lâche.
// ---------------------------------------------------------------------------

export function Butin({
  palier,
  ready,
  obtenus,
  onToggle,
}: {
  palier: RaidPalier
  ready: Ready[]
  /** Emplacements déjà pris, par personnage. */
  obtenus: Map<number, Set<number>>
  /** Absent quand on n'est pas le propriétaire vérifié : la grille se lit
   *  quand même, elle ne se coche pas. */
  onToggle?: (charId: number, coffreId: number) => void
}) {
  const { lang, t } = useI18n()

  const etages = useMemo(() => {
    const map = new Map<number, typeof palier.emplacements>()
    for (const e of palier.emplacements) {
      const l = map.get(e.etage) ?? []
      l.push(e)
      map.set(e.etage, l)
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0])
  }, [palier])

  return (
    <div className="view">
      <p className="muted">
        {t('butinIntro', { palier: lang === 'fr' ? palier.fr : palier.en })}
      </p>

      {etages.map(([etage, emplacements]) => (
        <section key={etage} className="relic-series butin-etage">
          <header className="relic-series-head">
            <h4 className="relic-series-name">{t('butinFloor', { n: etage })}</h4>
          </header>
          <table className="butin-table">
            <thead>
              <tr>
                <th />
                {ready.map((m) => (
                  <th key={m.id} className="col-player" title={m.data.name}>
                    <img
                      src={m.data.avatar}
                      alt=""
                      width={28}
                      height={28}
                      onError={onAvatarImgError}
                    />
                    <span className="col-player-name">{nomCourt(m)}</span>
                  </th>
                ))}
                <th className="butin-reste" />
              </tr>
            </thead>
            <tbody>
              {emplacements.map((e) => {
                const manquants = ready.filter((m) => !obtenus.get(m.id)?.has(e.id)).length
                return (
                  <tr key={e.cle}>
                    <th scope="row" className="butin-slot">
                      <img
                        src={e.icon}
                        alt=""
                        width={28}
                        height={28}
                        loading="lazy"
                        onError={onItemImgError}
                      />
                      <span title={lang === 'fr' ? e.objetFr : e.objetEn}>
                        {lang === 'fr' ? e.fr : e.en}
                      </span>
                    </th>
                    {ready.map((m) => {
                      const pris = obtenus.get(m.id)?.has(e.id) ?? false
                      return (
                        <td key={m.id}>
                          <button
                            className={`checklist-box ${pris ? 'is-owned' : ''}`}
                            disabled={!onToggle}
                            onClick={() => onToggle?.(m.id, e.id)}
                          >
                            {pris ? '✓' : ''}
                          </button>
                        </td>
                      )
                    })}
                    <td className="butin-reste">
                      {manquants === 0 ? (
                        <span className="relic-done">{t('butinDone')}</span>
                      ) : (
                        <span className="muted">{t('butinNeeded', { n: manquants })}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}
