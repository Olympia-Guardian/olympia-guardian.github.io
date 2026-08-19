import { useMemo } from 'react'
import type { Character, RaidPalier } from '../api'
import { useI18n } from '../i18n'
import { nomCourt, type Member } from '../store'
import { onAvatarImgError, onItemImgError } from '../ui'

type Ready = Member & { data: Character }

// ---------------------------------------------------------------------------
// « Combien de kills reste-t-il ? »
//
// C'est la seule question qu'un static se pose devant un palier. Pas un
// inventaire : un nombre de soirées.
//
// Chaque emplacement d'un joueur est dans un état parmi trois, et le DÉFAUT est
// « attendu du savage » — sur un palier neuf, personne n'a rien à déclarer et le
// compte est déjà juste. On ne saisit que les exceptions.
// ---------------------------------------------------------------------------

export type Etat = 'attendu' | 'fait' | 'ailleurs'

/** Pièces lâchées par un étage à chaque kill. C'est ce chiffre qui transforme
 *  des besoins en nombre de soirées : il est isolé ici pour se corriger d'une
 *  ligne si un palier change les règles. */
const PIECES_PAR_KILL = 2

export function etatDe(c: Character, id: number): Etat {
  if (c.raidFait.includes(id)) return 'fait'
  if (c.raidAilleurs.includes(id)) return 'ailleurs'
  return 'attendu'
}

/** L'ordre du cycle suit l'usage : on coche d'abord ce qu'on vient d'obtenir,
 *  et on déclare plus rarement qu'on prendra la pièce ailleurs. */
export function etatSuivant(e: Etat): Etat {
  return e === 'attendu' ? 'fait' : e === 'fait' ? 'ailleurs' : 'attendu'
}

export function Butin({
  palier,
  ready,
  peutModifier,
  onCycle,
}: {
  palier: RaidPalier
  ready: Ready[]
  /** Qui peut toucher à la ligne de ce personnage. */
  peutModifier: (charId: number) => boolean
  onCycle: (charId: number, id: number, suivant: Etat) => void
}) {
  const { lang, t } = useI18n()

  const etages = useMemo(() => {
    const map = new Map<number, RaidPalier['emplacements']>()
    for (const e of palier.emplacements) {
      const l = map.get(e.etage) ?? []
      l.push(e)
      map.set(e.etage, l)
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0])
  }, [palier])

  /** Par étage : ce qui reste attendu, et par qui. */
  const besoins = useMemo(
    () =>
      etages.map(([etage, emplacements]) => {
        const parJoueur = ready
          .map((m) => ({
            membre: m,
            manque: emplacements.filter((e) => etatDe(m.data, e.id) === 'attendu'),
          }))
          .filter((x) => x.manque.length > 0)
        const pieces = parJoueur.reduce((n, x) => n + x.manque.length, 0)
        return { etage, pieces, kills: Math.ceil(pieces / PIECES_PAR_KILL), parJoueur }
      }),
    [etages, ready],
  )

  return (
    <div className="view">
      <p className="muted">{t('butinIntro', { palier: lang === 'fr' ? palier.fr : palier.en })}</p>

      {/* La réponse, en haut, lisible sans défiler. */}
      <div className="kills-row">
        {besoins.map((b) => (
          <section key={b.etage} className={`kills-card ${b.kills === 0 ? 'is-done' : ''}`}>
            <header>
              <b>{t('butinFloor', { n: b.etage })}</b>
              <span className="kills-n">{b.kills}</span>
            </header>
            <p className="kills-label">
              {b.kills === 0 ? t('butinDone') : t('butinKills', { n: b.kills })}
            </p>
            {b.parJoueur.length > 0 && (
              <ul className="kills-detail">
                {b.parJoueur.map((x) => (
                  <li key={x.membre.id}>
                    <b>{nomCourt(x.membre)}</b>{' '}
                    {x.manque.map((e) => (lang === 'fr' ? e.fr : e.en)).join(', ')}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

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
              </tr>
            </thead>
            <tbody>
              {emplacements.map((e) => (
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
                    const etat = etatDe(m.data, e.id)
                    return (
                      <td key={m.id}>
                        <button
                          className={`etat-btn etat-${etat}`}
                          title={t(`butinEtat_${etat}` as 'butinEtat_attendu')}
                          disabled={!peutModifier(m.id)}
                          onClick={() => onCycle(m.id, e.id, etatSuivant(etat))}
                        >
                          {etat === 'fait' ? '✓' : etat === 'ailleurs' ? '—' : ''}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}
