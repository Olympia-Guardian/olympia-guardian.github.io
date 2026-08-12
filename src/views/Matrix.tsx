import { useMemo, useState } from 'react'
import { type Character, type Item, type Kind, type Source } from '../api'
import { kindLabel, localName, localSource, useI18n } from '../i18n'
import { UNAVAILABLE_TYPES, typeLabel } from '../sources'
import { MANUAL_KINDS, type Member, type Overrides } from '../store'
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
  overrides,
  onToggle,
  onShowItem,
}: {
  kind: Kind
  items: Item[]
  ready: Ready[]
  ownedSets: Map<number, Record<Kind, Set<number>>>
  overrides: Overrides
  onToggle: (charId: number, kind: Kind, itemId: number) => void
  onShowItem: (item: Item, kind: Kind) => void
}) {
  const { lang, t } = useI18n()
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

  const editable = MANUAL_KINDS.includes(kind)
  const manualSets = useMemo(() => {
    const map = new Map<number, Set<number>>()
    for (const m of ready) map.set(m.id, new Set(overrides[m.id]?.[kind]?.ids ?? []))
    return map
  }, [ready, overrides, kind])

  const presentTypes = useMemo(() => {
    const types = new Set<string>()
    for (const item of items) for (const s of item.sources) types.add(s.type)
    return [...types].sort((a, b) => typeLabel(a, lang).localeCompare(typeLabel(b, lang), lang))
  }, [items, lang])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = items
      .map((item) => {
        const missing = activeMembers.filter((m) => !ownedSets.get(m.id)?.[kind].has(item.id))
        return { item, missing }
      })
      .filter(({ item, missing }) => {
        if (q && !item.name.toLowerCase().includes(q) &&
            !item.nameEn.toLowerCase().includes(q) &&
            !item.sources.some(
              (s) => s.text.toLowerCase().includes(q) || s.textEn.toLowerCase().includes(q),
            )) return false
        if (typeFilter !== 'all' && !item.sources.some((s) => s.type === typeFilter)) return false
        if (!includeUnavailable && item.sources.length > 0 &&
            item.sources.every((s) => UNAVAILABLE_TYPES.has(s.type))) return false
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
  }, [items, activeMembers, ownedSets, kind, search, typeFilter, onlyMissing, includeUnavailable, sort])

  return (
    <div className="view">
      <div className="controls">
        <input
          className="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchIn', { what: kindLabel(lang, kind) })}
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

      {editable && (
        <p className="notice">
          {t('matrixNotice')}{' '}
          <a href="https://ffxivcollect.com" target="_blank" rel="noreferrer">
            ffxivcollect.com
          </a>
        </p>
      )}

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
              const missingIds = new Set(missing.map((m) => m.id))
              const primary = item.sources[0]
              const name = localName(item, lang)
              return (
                <tr key={item.id}>
                  <td className="col-item">
                    <div
                      className="item-cell item-clickable"
                      role="button"
                      tabIndex={0}
                      title={t('itemDetails')}
                      onClick={() => onShowItem(item, kind)}
                      onKeyDown={(ev) => ev.key === 'Enter' && onShowItem(item, kind)}
                    >
                      <img className="item-icon" src={item.icon} alt="" loading="lazy" onError={onItemImgError} />
                      <div className="item-text">
                        <span className="item-name">
                          {name}
                          {item.patch && <span className="chip chip-patch">{item.patch}</span>}
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
                    const has = !missingIds.has(m.id)
                    const manual = editable && manualSets.get(m.id)?.has(item.id)
                    if (editable && (manual || !has)) {
                      return (
                        <td key={m.id} className={`cell ${has ? 'cell-owned cell-manual' : 'cell-missing'}`}>
                          <button
                            className="cell-btn"
                            onClick={() => onToggle(m.id, kind, item.id)}
                            title={
                              manual
                                ? t('manualCheckTitle', { what: name, who: m.data.name })
                                : t('markOwned', { what: name, who: m.data.name })
                            }
                          >
                            {has ? '✓' : '✗'}
                          </button>
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
