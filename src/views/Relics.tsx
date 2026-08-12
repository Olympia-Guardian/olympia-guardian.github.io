import { useMemo } from 'react'
import type { Character, Relic, RelicDb, RelicSeriesInfo } from '../api'
import { useI18n } from '../i18n'
import {
  RELIC_COSTS,
  effectiveSteps,
  mergeMaterial,
  remainingMaterials,
  type Material,
  type StepCost,
} from '../relicCosts'
import type { Member } from '../store'
import { Meter, onAvatarImgError, onItemImgError } from '../ui'

type Ready = Member & { data: Character }

// Classement par extension, la plus récente d'abord. Les séries sans extension
// (donjons sans fond, ultimates) ont leur propre section en bas.
const EXPANSIONS: { num: number; fr: string; en: string }[] = [
  { num: 7, fr: 'Dawntrail (7.x)', en: 'Dawntrail (7.x)' },
  { num: 6, fr: 'Endwalker (6.x)', en: 'Endwalker (6.x)' },
  { num: 5, fr: 'Shadowbringers (5.x)', en: 'Shadowbringers (5.x)' },
  { num: 4, fr: 'Stormblood (4.x)', en: 'Stormblood (4.x)' },
  { num: 3, fr: 'Heavensward (3.x)', en: 'Heavensward (3.x)' },
  { num: 2, fr: 'A Realm Reborn (2.x)', en: 'A Realm Reborn (2.x)' },
  { num: 0, fr: 'Donjons sans fond & Ultimate', en: 'Deep dungeons & Ultimates' },
]

function fmt(n: number, lang: string): string {
  return n.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US')
}

function matsText(mats: { qty: number; fr: string; en: string }[], lang: string): string {
  return mats.map((mat) => `${fmt(mat.qty, lang)} ${lang === 'fr' ? mat.fr : mat.en}`).join(' · ')
}

/** Matériaux d'une étape multipliés par le nombre d'armes manquantes. */
function stepTotal(
  step: StepCost,
  missing: number,
): { qty: number; fr: string; en: string }[] {
  return step.materials.map((mat) => ({ ...mat, qty: mat.qty * missing }))
}

function SeriesCard({
  info,
  relics,
  ready,
  ownedSets,
  onToggleRelic,
}: {
  info: RelicSeriesInfo
  relics: Relic[]
  ready: Ready[]
  ownedSets: Map<number, Set<number>>
  onToggleRelic?: (id: number) => void
}) {
  const { lang, t } = useI18n()
  const steps = Math.max(1, Math.round(info.total / info.jobs))
  const costs = RELIC_COSTS[info.key]
  const costSteps: StepCost[] | null = costs ? effectiveSteps(costs, steps) : null
  const name = lang === 'fr' ? info.name : info.key
  const catKey =
    info.category === 'weapons'
      ? 'relCatWeapons'
      : info.category === 'ultimate'
        ? 'relCatUltimate'
        : info.category === 'tools'
          ? 'relCatTools'
          : info.category === 'armor'
            ? 'relCatArmor'
            : 'relCatGaro'
  const perKey =
    info.category === 'weapons' || info.category === 'ultimate'
      ? 'relicPerWeapon'
      : info.category === 'tools'
        ? 'relicPerTool'
        : 'relicPerPiece'

  // relics de chaque étape (l'ordre API est trié étape par étape)
  const stepRelics = Array.from({ length: steps }, (_, i) =>
    relics.filter((r) => Math.ceil(r.order / info.jobs) === i + 1),
  )
  const ownedInStep = (memberId: number, i: number) => {
    const owned = ownedSets.get(memberId)!
    return stepRelics[i].reduce((sum, r) => sum + (owned.has(r.id) ? 1 : 0), 0)
  }

  const guideLink = (url?: string) =>
    url ? (
      <a className="relic-guide" href={url} target="_blank" rel="noreferrer">
        {t('relicGuide')}
      </a>
    ) : null

  return (
    <article className="relic-series">
      <header className="relic-series-head">
        <h4 className="relic-series-name">{name}</h4>
        <span className="chip chip-type">{t(catKey)}</span>
        <span className="relic-shape">
          {steps > 1 ? t('relicShapeN', { steps, jobs: info.jobs }) : t('relicShape1', { jobs: info.jobs })}
        </span>
      </header>

      {/* Totaux par joueur */}
      <div className="relic-players">
        {ready.map((member) => {
          const owned = ownedSets.get(member.id)!
          const count = relics.reduce((sum, r) => sum + (owned.has(r.id) ? 1 : 0), 0)
          return (
            <div key={member.id} className="relic-player">
              <img src={member.data.avatar} alt="" width={26} height={26} title={member.data.name} onError={onAvatarImgError} />
              <div className="relic-meter">
                <Meter label={member.data.name.split(' ')[0]} count={count} total={info.total} />
              </div>
              {count >= info.total && <span className="relic-done">{t('relicDone')}</span>}
            </div>
          )
        })}
      </div>

      {/* Solo : grille d'icônes par étape, à la FFXIV Collect */}
      {ready.length === 1 &&
        (() => {
          const owned = ownedSets.get(ready[0].id)!
          return (
            <div className="relic-icon-steps">
              {stepRelics.map((list, i) => {
                const stepCost = costSteps?.[i]
                const c = list.reduce((sum, r) => sum + (owned.has(r.id) ? 1 : 0), 0)
                return (
                  <div key={i} className="relic-icon-step">
                    <div className="relic-step-info">
                      {steps > 1 && (
                        <b>
                          {t('relicStep', { n: i + 1 })} ·{' '}
                          <span className={c >= list.length ? 'relic-done' : ''}>
                            {c}/{list.length}
                          </span>
                        </b>
                      )}
                      {stepCost && stepCost.materials.length > 0 && (
                        <span className="relic-step-mats">
                          <span className="relic-remaining-label">{t(perKey)}</span>{' '}
                          {matsText(stepCost.materials, lang)} {guideLink(stepCost.url)}
                        </span>
                      )}
                      {stepCost && stepCost.materials.length > 0 && list.length - c > 0 && (
                        <span className="relic-step-mats relic-step-total">
                          <span className="relic-remaining-label">
                            {t('relicStepTotal', { n: list.length - c })}
                          </span>{' '}
                          {matsText(stepTotal(stepCost, list.length - c), lang)}
                        </span>
                      )}
                      {stepCost?.once && (
                        <span className="relic-step-mats relic-once">
                          <span className="relic-remaining-label">{t('relicOnce')}</span>{' '}
                          {matsText(stepCost.once, lang)}
                        </span>
                      )}
                    </div>
                    <div className="relic-icons">
                      {list.map((r) => {
                        const has = owned.has(r.id)
                        const label = `${lang === 'fr' ? r.name : r.nameEn}${has ? ' ✓' : ''}`
                        const content = (
                          <>
                            <img src={r.icon} alt="" width={36} height={36} loading="lazy" onError={onItemImgError} />
                            {has && <span className="relic-badge">✓</span>}
                          </>
                        )
                        return onToggleRelic ? (
                          <button
                            key={r.id}
                            className={`relic-icon is-editable ${has ? 'is-owned' : 'is-missing'}`}
                            title={`${label} — ${t(has ? 'relicUncheck' : 'relicCheck')}`}
                            onClick={() => onToggleRelic(r.id)}
                          >
                            {content}
                          </button>
                        ) : (
                          <span
                            key={r.id}
                            className={`relic-icon ${has ? 'is-owned' : 'is-missing'}`}
                            title={label}
                          >
                            {content}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })()}

      {/* Groupe : progression étape par étape en tableau */}
      {ready.length > 1 && steps > 1 && (
        <div className="relic-steps-wrap">
          <table className="relic-steps">
            <thead>
              <tr>
                <th className="relic-step-info" />
                {ready.map((member) => (
                  <th key={member.id} title={member.data.name}>
                    <img src={member.data.avatar} alt={member.data.name} width={24} height={24} onError={onAvatarImgError} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stepRelics.map((_, i) => {
                const stepCost = costSteps?.[i]
                return (
                  <tr key={i}>
                    <td className="relic-step-info">
                      <b>{t('relicStep', { n: i + 1 })}</b>
                      {stepCost && stepCost.materials.length > 0 && (
                        <span className="relic-step-mats">
                          {' '}
                          <span className="relic-remaining-label">{t(perKey)}</span>{' '}
                          {matsText(stepCost.materials, lang)} {guideLink(stepCost.url)}
                        </span>
                      )}
                      {stepCost?.once && (
                        <span className="relic-step-mats relic-once">
                          <span className="relic-remaining-label">{t('relicOnce')}</span>{' '}
                          {matsText(stepCost.once, lang)}
                        </span>
                      )}
                    </td>
                    {ready.map((member) => {
                      const c = ownedInStep(member.id, i)
                      const cls = c >= info.jobs ? 'is-full' : c === 0 ? 'is-zero' : 'is-part'
                      const missing = info.jobs - c
                      const tip =
                        stepCost && stepCost.materials.length > 0 && missing > 0
                          ? `${member.data.name.split(' ')[0]} — ${t('relicStepTotal', { n: missing })} ${matsText(stepTotal(stepCost, missing), lang)}`
                          : member.data.name
                      return (
                        <td key={member.id} className={`relic-step-cell ${cls}`} title={tip}>
                          {c}/{info.jobs}
                          {c >= info.jobs && ' ✓'}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Groupe, série à palier unique : le coût par pièce en une ligne */}
      {ready.length > 1 && steps === 1 && costSteps?.[0] && costSteps[0].materials.length > 0 && (
        <p className="relic-step-mats relic-single-cost">
          <span className="relic-remaining-label">{t(perKey)}</span>{' '}
          {matsText(costSteps[0].materials, lang)} {guideLink(costSteps[0].url)}
        </p>
      )}

      {/* Grand total des objets restants, replié */}
      {costs && (
        <details className="relic-totals">
          <summary>{t('relicTotals')}</summary>
          {ready.map((member) => {
            const missingPerStep = stepRelics.map(
              (list, i) => list.length / info.jobs > 0 ? info.jobs - ownedInStep(member.id, i) : 0,
            )
            const rem = remainingMaterials(costs, missingPerStep, info.jobs)
            if (rem.perWeapon.length === 0 && rem.once.length === 0) {
              return (
                <p key={member.id} className="relic-total-line">
                  <b>{member.data.name.split(' ')[0]}</b> — <span className="relic-done">{t('relicDone')}</span>
                </p>
              )
            }
            return (
              <p key={member.id} className="relic-total-line">
                <b>{member.data.name.split(' ')[0]}</b> — {matsText(rem.perWeapon, lang)}
                {rem.once.length > 0 && (
                  <span className="relic-once">
                    <span className="relic-remaining-label">{t('relicOnce')}</span>{' '}
                    {matsText(rem.once, lang)}
                  </span>
                )}
              </p>
            )
          })}
        </details>
      )}
    </article>
  )
}

function pct(count: number, total: number, lang: string): string {
  const v = total > 0 ? (count / total) * 100 : 0
  return `${v.toFixed(v >= 10 ? 0 : 1).replace('.', lang === 'fr' ? ',' : '.')} %`
}

/** Vue de groupe : uniquement l'avancement. Le détail (paliers, matériaux,
 *  icônes) vit dans « Ma Page », où l'on ne regarde que son propre perso. */
function RelicSummary({
  db,
  ready,
  ownedSets,
  byExpansion,
  bySeries,
}: {
  db: RelicDb
  ready: Ready[]
  ownedSets: Map<number, Set<number>>
  byExpansion: Map<number, RelicSeriesInfo[]>
  bySeries: Map<string, Relic[]>
}) {
  const { lang, t } = useI18n()
  const totalAll = db.relics.length

  return (
    <div className="view">
      <section className="relic-series relic-global">
        <header className="relic-series-head">
          <h4 className="relic-series-name">{t('relicGlobal')}</h4>
          <span className="relic-shape">{fmt(totalAll, lang)}</span>
        </header>
        {ready.map((m) => {
          const owned = ownedSets.get(m.id)!
          const count = db.relics.reduce((sum, r) => sum + (owned.has(r.id) ? 1 : 0), 0)
          return (
            <details key={m.id} className="relic-player-fold" open={ready.length === 1}>
              <summary className="relic-player">
                <img
                  src={m.data.avatar}
                  alt=""
                  width={26}
                  height={26}
                  title={m.data.name}
                  onError={onAvatarImgError}
                />
                <div className="relic-meter">
                  <Meter label={m.data.name.split(' ')[0]} count={count} total={totalAll} />
                </div>
                <span className="relic-remaining">{pct(count, totalAll, lang)}</span>
              </summary>
              <div className="relic-breakdown">
                {EXPANSIONS.map(({ num, fr, en }) => {
                  const series = byExpansion.get(num)
                  if (!series || series.length === 0) return null
                  const expTotal = series.reduce((sum, s) => sum + s.total, 0)
                  const expCount = series.reduce(
                    (sum, s) =>
                      sum +
                      (bySeries.get(s.key) ?? []).reduce((n, r) => n + (owned.has(r.id) ? 1 : 0), 0),
                    0,
                  )
                  return (
                    <div key={num} className="relic-exp-block">
                      <header className="relic-exp-head">
                        <b>{lang === 'fr' ? fr : en}</b>
                        <span className={expCount >= expTotal ? 'relic-done' : 'relic-remaining'}>
                          {pct(expCount, expTotal, lang)}
                        </span>
                      </header>
                      <ul className="relic-exp-list">
                        {series.map((s) => {
                          const c = (bySeries.get(s.key) ?? []).reduce(
                            (n, r) => n + (owned.has(r.id) ? 1 : 0),
                            0,
                          )
                          const done = c >= s.total
                          return (
                            <li key={s.key} className="relic-exp-row">
                              <span className="relic-exp-name">{lang === 'fr' ? s.name : s.key}</span>
                              <span className="relic-exp-bar">
                                <i
                                  className={done ? 'is-done' : ''}
                                  style={{ width: `${s.total > 0 ? (c / s.total) * 100 : 0}%` }}
                                />
                              </span>
                              <span className="relic-exp-count">
                                {c}/{s.total}
                              </span>
                              <span className={`relic-exp-pct ${done ? 'relic-done' : ''}`}>
                                {pct(c, s.total, lang)}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )
                })}
              </div>
            </details>
          )
        })}
      </section>
      <p className="relic-note">{t('relicSummaryNote')}</p>
    </div>
  )
}

export function Relics({
  db,
  ready,
  detailed = false,
  onToggleRelic,
}: {
  db: RelicDb
  ready: Ready[]
  /** « Ma Page » : paliers, matériaux et icônes. Sinon : avancement seul. */
  detailed?: boolean
  /** Fourni dans « Ma Page » : chaque relique devient cochable. */
  onToggleRelic?: (id: number) => void
}) {
  const { lang, t } = useI18n()

  const ownedSets = useMemo(
    () => new Map(ready.map((m) => [m.id, new Set(m.data.relicIds)])),
    [ready],
  )

  const bySeries = useMemo(() => {
    const map = new Map<string, Relic[]>()
    for (const r of db.relics) {
      const arr = map.get(r.series)
      if (arr) arr.push(r)
      else map.set(r.series, [r])
    }
    return map
  }, [db])

  // Séries par extension ; dans chaque extension : armes d'abord, puis le reste.
  const CAT_ORDER = ['weapons', 'ultimate', 'tools', 'armor', 'garo']
  const byExpansion = useMemo(() => {
    const map = new Map<number, RelicSeriesInfo[]>()
    for (const s of db.series) {
      const arr = map.get(s.expansion)
      if (arr) arr.push(s)
      else map.set(s.expansion, [s])
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          CAT_ORDER.indexOf(a.category) - CAT_ORDER.indexOf(b.category) || a.order - b.order,
      )
    }
    return map
  }, [db])

  const totalAll = db.relics.length

  // LE GROS TOTAL : tous les objets restants, toutes séries confondues, par joueur.
  const grandTotals = useMemo(() => {
    const perPlayer = new Map<number, Material[]>()
    for (const member of ready) {
      const owned = ownedSets.get(member.id)!
      const acc = new Map<string, Material>()
      for (const info of db.series) {
        const costs = RELIC_COSTS[info.key]
        if (!costs) continue
        const steps = Math.max(1, Math.round(info.total / info.jobs))
        const relics = bySeries.get(info.key) ?? []
        const missingPerStep = Array.from({ length: steps }, (_, i) => {
          const inStep = relics.filter((r) => Math.ceil(r.order / info.jobs) === i + 1)
          return inStep.reduce((sum, r) => sum + (owned.has(r.id) ? 0 : 1), 0)
        })
        const rem = remainingMaterials(costs, missingPerStep, info.jobs)
        for (const mat of [...rem.perWeapon, ...rem.once]) mergeMaterial(acc, mat)
      }
      perPlayer.set(
        member.id,
        [...acc.values()].sort((a, b) => b.qty - a.qty),
      )
    }
    return perPlayer
  }, [ready, ownedSets, db, bySeries])

  if (!detailed) {
    return (
      <RelicSummary
        db={db}
        ready={ready}
        ownedSets={ownedSets}
        byExpansion={byExpansion}
        bySeries={bySeries}
      />
    )
  }

  return (
    <div className="view">
      <section className="relic-series relic-global">
        <header className="relic-series-head">
          <h4 className="relic-series-name">{t('relicGlobal')}</h4>
          <span className="relic-shape">{fmt(totalAll, lang)}</span>
        </header>
        <div className="relic-players">
          {ready.map((m) => {
            const owned = ownedSets.get(m.id)!
            const count = db.relics.reduce((sum, r) => sum + (owned.has(r.id) ? 1 : 0), 0)
            return (
              <div key={m.id} className="relic-player">
                <img src={m.data.avatar} alt="" width={26} height={26} title={m.data.name} onError={onAvatarImgError} />
                <div className="relic-meter">
                  <Meter label={m.data.name.split(' ')[0]} count={count} total={totalAll} />
                </div>
                <span className="relic-remaining">{pct(count, totalAll, lang)}</span>
              </div>
            )
          })}
        </div>
        <details className="relic-totals relic-grand" open={ready.length === 1}>
          <summary>{t('relicGrandTotal')}</summary>
          {ready.map((member) => {
            const mats = grandTotals.get(member.id) ?? []
            const currencies = mats.filter((mat) => mat.cat === 'currency')
            const items = mats.filter((mat) => !mat.cat || mat.cat === 'item')
            const drops = mats.filter((mat) => mat.cat === 'drop')
            return (
              <div key={member.id} className="relic-grand-player">
                <p className="relic-grand-name">{member.data.name.split(' ')[0]}</p>
                {mats.length === 0 && <p className="relic-total-line"><span className="relic-done">{t('relicDone')}</span></p>}
                {currencies.length > 0 && (
                  <p className="relic-total-line">
                    <span className="relic-grand-cat">{t('relicMatCurrency')}</span>{' '}
                    {matsText(currencies, lang)}
                  </p>
                )}
                {items.length > 0 && (
                  <p className="relic-total-line">
                    <span className="relic-grand-cat">{t('relicMatItems')}</span>{' '}
                    {matsText(items, lang)}
                  </p>
                )}
                {drops.length > 0 && (
                  <p className="relic-total-line">
                    <span className="relic-grand-cat">{t('relicMatDrops')}</span>{' '}
                    {matsText(drops, lang)}
                  </p>
                )}
              </div>
            )
          })}
        </details>
      </section>

      {EXPANSIONS.map(({ num, fr, en }) => {
        const series = byExpansion.get(num)
        if (!series || series.length === 0) return null
        return (
          <details key={num} className="relic-cat" open={num === 7}>
            <summary className="relic-cat-head">
              {lang === 'fr' ? fr : en} <span className="relic-cat-count">({series.length})</span>
            </summary>
            <div className="relic-cat-body">
              {series.map((info) => (
                <SeriesCard
                  key={info.key}
                  info={info}
                  relics={bySeries.get(info.key) ?? []}
                  ready={ready}
                  ownedSets={ownedSets}
                  onToggleRelic={onToggleRelic}
                />
              ))}
            </div>
          </details>
        )
      })}

      {onToggleRelic && <p className="relic-note">{t('relicEditNote')}</p>}
      <p className="relic-note">{t('relicCostNote')}</p>
    </div>
  )
}
