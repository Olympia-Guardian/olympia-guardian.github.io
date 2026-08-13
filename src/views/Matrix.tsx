import { useMemo, useState } from 'react'
import { HIDDEN_KINDS, type Character, type Item, type Kind, type Source } from '../api'
import { kindLabel, localName, localSource, useI18n } from '../i18n'
import { itemStillObtainable, typeLabel } from '../sources'
import type { Member } from '../store'
import { TypeChip, onAvatarImgError, onItemImgError } from '../ui'

type Ready = Member & { data: Character }

type SortMode = 'missing' | 'recent' | 'game'

/** Pastille « +N » : au survol, panneau listant TOUTES les voies d'obtention.
 *  Position fixe pour échapper au rognage du conteneur défilant de la table. */
function SourcesTip({ sources }: { sources: Source[] }) {
  const { lang } = useI18n()
  const [pos, setPos] = useState<{ x: number; y: number; up: boolean } | null>(null)
  return (
    <span
      className="more-sources"
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        const up = r.bottom > window.innerHeight - 40 - sources.length * 26
        setPos({ x: Math.min(r.left, window.innerWidth - 400), y: up ? r.top - 6 : r.bottom + 6, up })
      }}
      onMouseLeave={() => setPos(null)}
    >
      +{sources.length - 1}
      {pos && (
        <span
          className="src-tooltip"
          style={{
            left: pos.x,
            top: pos.y,
            transform: pos.up ? 'translateY(-100%)' : undefined,
          }}
        >
          {sources.map((s, i) => (
            <span key={i} className="src-tooltip-line">
              <TypeChip type={s.type} />
              <span>{localSource(s, lang)}</span>
            </span>
          ))}
        </span>
      )}
    </span>
  )
}

export function Matrix({
  kind,
  items,
  ready,
  ownedSets,
  onShowItem,
  titleLabel,
  suggest,
  ownAdd,
}: {
  kind: Kind
  items: Item[]
  ready: Ready[]
  ownedSets: Map<number, Record<Kind, Set<number>>>
  onShowItem: (item: Item, kind: Kind) => void
  /** Vue fusionnée (« Mode ») : libellé de recherche personnalisé. */
  titleLabel?: string
  /** Groupe online : cliquer la croix d'un AUTRE joueur lui propose l'objet.
   *  Tant que la suggestion est en attente (sentKeys), l'objet apparaît coché
   *  de MON côté — un refus du destinataire ramène la croix. */
  suggest?: {
    /** Mes propres persos : eux passent par l'ajout direct. */
    exclude: number[]
    sentKeys: Set<string>
    send: (charId: number, kind: Kind, itemId: number) => Promise<void>
  }
  /** Connecté : cliquer la croix de MON perso coche l'objet dans mon journal. */
  ownAdd?: {
    chars: number[]
    add: (charId: number, kind: Kind, itemId: number) => Promise<void>
  }
}) {
  const { lang, t } = useI18n()
  // Vue fusionnée : chaque objet connaît sa collection d'origine.
  const kindFor = (item: Item): Kind => item.kindOf ?? kind
  // Ajouts directs sur mes persos pendant la session (clé perso:collection:objet).
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [onlyMissing, setOnlyMissing] = useState(true)
  const [includeUnavailable, setIncludeUnavailable] = useState(false)
  const [sort, setSort] = useState<SortMode>('missing')
  const [visible, setVisible] = useState(80)

  const activeMembers = useMemo(
    () => ready.filter((m) => m.data[kind].isPublic),
    [ready, kind],
  )
  // Seul dans la vue : la colonne « Manque à x/1 » est redondante.
  const solo = activeMembers.length === 1

  const presentTypes = useMemo(() => {
    const types = new Set<string>()
    for (const item of items) for (const s of item.sources) types.add(s.type)
    return [...types].sort((a, b) => typeLabel(a, lang).localeCompare(typeLabel(b, lang), lang))
  }, [items, lang])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = items
      .map((item) => {
        const k = kindFor(item)
        // Une suggestion en attente compte comme cochée de mon côté :
        // elle sort des « manquants » (et y revient si le membre refuse).
        const missing = activeMembers.filter(
          (m) =>
            !ownedSets.get(m.id)?.[k].has(item.id) &&
            !suggest?.sentKeys.has(`${m.id}:${k}:${item.id}`),
        )
        return { item, missing }
      })
      .filter(({ item, missing }) => {
        if (q && !item.name.toLowerCase().includes(q) &&
            !item.nameEn.toLowerCase().includes(q) &&
            !item.sources.some(
              (s) => s.text.toLowerCase().includes(q) || s.textEn.toLowerCase().includes(q),
            )) return false
        if (typeFilter !== 'all' && !item.sources.some((s) => s.type === typeFilter)) return false
        if (!includeUnavailable && !itemStillObtainable(item)) return false
        if (onlyMissing && missing.length === 0) return false
        return true
      })
    switch (sort) {
      case 'missing':
        list.sort((a, b) => b.missing.length - a.missing.length || a.item.order - b.item.order)
        break
      case 'recent':
        list.sort((a, b) => b.item.order - a.item.order)
        break
      case 'game':
        list.sort((a, b) => a.item.order - b.item.order)
        break
    }
    return list
  }, [items, activeMembers, ownedSets, kind, search, typeFilter, onlyMissing, includeUnavailable, sort, suggest?.sentKeys])

  return (
    <div className="view">
      <div className="controls">
        <input
          className="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchIn', { what: titleLabel ?? kindLabel(lang, kind) })}
          spellCheck={false}
        />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">{t('allSources')}</option>
          {presentTypes.map((ty) => (
            <option key={ty} value={ty}>
              {typeLabel(ty, lang)}
            </option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
          <option value="missing">{t('sortMissing')}</option>
          <option value="recent">{t('sortRecent')}</option>
          <option value="game">{t('sortGame')}</option>
        </select>
        <label className="check">
          <input
            type="checkbox"
            checked={onlyMissing}
            onChange={(e) => setOnlyMissing(e.target.checked)}
          />
          {t('onlyMissing')}
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={includeUnavailable}
            onChange={(e) => setIncludeUnavailable(e.target.checked)}
          />
          {t('includeUnavailable')}
        </label>
      </div>

      {HIDDEN_KINDS.includes(kind) && <p className="notice">{t('matrixNotice')}</p>}

      <div className="matrix-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th className="col-item">
                {t(rows.length > 1 ? 'itemsCountN' : 'itemsCount1', { n: rows.length })}
              </th>
              {activeMembers.map((m) => (
                <th key={m.id} className="col-player" title={m.data.name}>
                  <img src={m.data.avatar} alt={m.data.name} width={28} height={28} onError={onAvatarImgError} />
                  <span className="col-player-name">{m.data.name.split(' ')[0]}</span>
                </th>
              ))}
              {!solo && <th className="col-count">{t('missingCol')}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, visible).map(({ item, missing }) => {
              const primary = item.sources[0]
              const name = localName(item, lang)
              return (
                <tr key={`${kindFor(item)}-${item.id}`}>
                  <td className="col-item">
                    <div
                      className="item-cell item-clickable"
                      role="button"
                      tabIndex={0}
                      title={t('itemDetails')}
                      onClick={() => onShowItem(item, kindFor(item))}
                      onKeyDown={(ev) => ev.key === 'Enter' && onShowItem(item, kindFor(item))}
                    >
                      <img className="item-icon" src={item.icon} alt="" loading="lazy" onError={onItemImgError} />
                      <div className="item-text">
                        <span className="item-name">
                          {name}
                          {item.kindOf && (
                            <span className="chip chip-type">{kindLabel(lang, item.kindOf, 'short')}</span>
                          )}
                          {item.patch && <span className="chip chip-patch">{item.patch}</span>}
                          {item.unobtainable && (
                            <span className="chip chip-unavail" title={t('unobtainableTitle')}>
                              {t('unobtainableChip')}
                            </span>
                          )}
                          {item.tradeable && (
                            <span className="chip chip-hv" title={t('hvTitle')}>
                              HV
                            </span>
                          )}
                        </span>
                        {primary && (
                          <span className="item-source">
                            <TypeChip type={primary.type} /> {localSource(primary, lang)}
                            {item.sources.length > 1 && <SourcesTip sources={item.sources} />}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  {activeMembers.map((m) => {
                    const k = kindFor(item)
                    const cellKey = `${m.id}:${k}:${item.id}`
                    const has = ownedSets.get(m.id)?.[k].has(item.id) ?? false
                    const mine = ownAdd?.chars.includes(m.id) ?? false
                    // Mon perso : la croix coche directement l'objet au journal.
                    // Montures/mascottes : validation temporaire, la prochaine
                    // synchro Lodestone fait foi.
                    if (!has && mine && ownAdd) {
                      const done = added.has(cellKey)
                      const temp = k === 'mounts' || k === 'minions'
                      return (
                        <td
                          key={m.id}
                          className={`cell ${done ? 'cell-owned' : 'cell-missing cell-addable'}`}
                          title={
                            done
                              ? t('addedCell')
                              : t('addOwnCell', { what: name }) + (temp ? ` (${t('suggTemp')})` : '')
                          }
                          onClick={() => {
                            if (done) return
                            setAdded((prev) => new Set(prev).add(cellKey))
                            void ownAdd.add(m.id, k, item.id).catch(() =>
                              setAdded((prev) => {
                                const next = new Set(prev)
                                next.delete(cellKey)
                                return next
                              }),
                            )
                          }}
                        >
                          {done ? '✓' : '✗'}
                        </td>
                      )
                    }
                    // Perso d'un autre membre (groupe online) : suggestion en
                    // attente = coché de mon côté ; sinon la croix propose.
                    if (!has && !mine && suggest) {
                      const pending = suggest.sentKeys.has(cellKey)
                      if (pending) {
                        return (
                          <td
                            key={m.id}
                            className="cell cell-pending"
                            title={t('pendingCell', { who: m.data.name })}
                          >
                            ✓
                          </td>
                        )
                      }
                      return (
                        <td
                          key={m.id}
                          className="cell cell-missing cell-suggestable"
                          title={t('suggestCell', { what: name, who: m.data.name })}
                          onClick={() => {
                            void suggest.send(m.id, k, item.id).catch(() => undefined)
                          }}
                        >
                          ✗
                        </td>
                      )
                    }
                    return (
                      <td
                        key={m.id}
                        className={`cell ${has ? 'cell-owned' : 'cell-missing'}`}
                        title={t(has ? 'owns' : 'ownsNot', { who: m.data.name, what: name })}
                      >
                        {has ? '✓' : '✗'}
                      </td>
                    )
                  })}
                  {!solo && (
                    <td className="col-count">
                      {missing.length}/{activeMembers.length}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="empty">{t('matrixEmpty')}</p>}
      </div>

      {rows.length > visible && (
        <button className="btn btn-ghost more" onClick={() => setVisible((v) => v + 80)}>
          {t('showMore', { n: rows.length - visible })}
        </button>
      )}
    </div>
  )
}
