import { useMemo, useState } from 'react'
import { HIDDEN_KINDS, type Character, type Item, type Kind, type Source } from '../api'
import { kindLabel, localName, localSource, useI18n } from '../i18n'
import { itemStillObtainable, typeLabel } from '../sources'
import type { Member } from '../store'
import { TabIcon, TypeChip, onAvatarImgError, onItemImgError } from '../ui'
import type { Wishes } from '../wishlist'
import { masqueDe, useMasqueur, type ModeSpoiler } from '../spoilers'

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
  wishes,
  msq,
  spoilMode,
  onRevealAll,
  only,
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
  /** Liste de souhaits : marque les objets voulus et permet de s'y limiter. */
  wishes?: Wishes
  /** Avancement dans l'histoire, pour masquer ce qui la revelerait. null =
   *  inconnu, et on ne masque alors rien. */
  msq?: number | null
  /** Niveau de masquage choisi par le joueur. */
  spoilMode?: ModeSpoiler
  /** Tout révéler d'un geste depuis la liste elle-même. */
  onRevealAll?: () => void
  /** Restriction venue d'ailleurs (la cloche, pour les nouveautés d'un patch) :
   *  la vue ne montre que ces objets, en le disant et en offrant d'en sortir.
   *  Les clés valent « collection:id » — dans la vue « Mode » deux collections
   *  peuvent porter le même identifiant. */
  only?: { keys: Set<string>; label: string; onClear: () => void }
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
  const masquer = useMasqueur()
  // Vue fusionnée : chaque objet connaît sa collection d'origine.
  const kindFor = (item: Item): Kind => item.kindOf ?? kind
  // Ajouts directs sur mes persos pendant la session (clé perso:collection:objet).
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [groupFilter, setGroupFilter] = useState('all')
  const [onlyMissing, setOnlyMissing] = useState(true)
  const [onlyWished, setOnlyWished] = useState(false)
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

  // Succès (pas de sources) : le filtre porte sur la catégorie du jeu.
  const presentGroups = useMemo(() => {
    if (presentTypes.length > 0) return []
    const seen = new Map<string, string>()
    for (const item of items) {
      const key = item.groupEn ?? item.group
      if (key) seen.set(key, (lang === 'fr' ? item.group : item.groupEn) ?? key)
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1], lang))
  }, [items, presentTypes, lang])

  let caches = 0
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
        if (only && !only.keys.has(`${kindFor(item)}:${item.id}`)) return false
        if (q && !item.name.toLowerCase().includes(q) &&
            !item.nameEn.toLowerCase().includes(q) &&
            !item.description.toLowerCase().includes(q) &&
            !item.descriptionEn.toLowerCase().includes(q) &&
            !item.sources.some(
              (s) => s.text.toLowerCase().includes(q) || s.textEn.toLowerCase().includes(q),
            )) return false
        if (typeFilter !== 'all' && !item.sources.some((s) => s.type === typeFilter)) return false
        if (groupFilter !== 'all' && (item.groupEn ?? item.group) !== groupFilter) return false
        if (!includeUnavailable && !itemStillObtainable(item)) return false
        if (onlyWished && !(wishes?.[kindFor(item)] ?? []).includes(item.id)) return false
        if (onlyMissing && missing.length === 0) return false
        return true
      })
    // Contenu que ce joueur n'a pas encore atteint : on le retire de la liste
    // plutot que d'aligner des cases muettes, et on le compte pour le dire.
    const avant = list.length
    const visibles = list.filter(({ item, missing }) => {
      // Possede par quelqu'un d'affiche : il l'a forcement vu, le cacher
      // serait absurde et ferait disparaitre sa propre collection.
      if (missing.length < activeMembers.length) return true
      return masquer(item, kindFor(item)) !== 'tout'
    })
    caches = avant - visibles.length
    list.length = 0
    list.push(...visibles)
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
  }, [items, activeMembers, ownedSets, kind, search, typeFilter, groupFilter, onlyMissing, includeUnavailable, sort, only, onlyWished, wishes, masquer, suggest?.sentKeys])

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
        {presentGroups.length > 1 ? (
          <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
            <option value="all">{t('allCategories')}</option>
            {presentGroups.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        ) : (
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">{t('allSources')}</option>
            {presentTypes.map((ty) => (
              <option key={ty} value={ty}>
                {typeLabel(ty, lang)}
              </option>
            ))}
          </select>
        )}
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
        {/* La case n'apparaît que s'il y a des souhaits ici : proposer un
            filtre qui ne peut rien donner n'aide personne. */}
        {items.some((it) => (wishes?.[kindFor(it)] ?? []).includes(it.id)) && (
          <label className="check">
            <input
              type="checkbox"
              checked={onlyWished}
              onChange={(e) => setOnlyWished(e.target.checked)}
            />
            {t('wishOnly')}
          </label>
        )}
      </div>

      {only && (
        <p className="notice notice-filter">
          <span>{only.label}</span>
          <button className="btn btn-ghost btn-mini" onClick={only.onClear}>
            {t('newsFilterClear')}
          </button>
        </p>
      )}

      {caches > 0 && (
        <p className="notice notice-filter">
          <span>{t('spoilerHiddenCount', { n: caches })}</span>
          <button className="btn btn-mini btn-ghost" onClick={onRevealAll}>
            {t('spoilerRevealAll')}
          </button>
        </p>
      )}

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
              // Recompense d'histoire que ce joueur n'a pas encore atteinte :
              // nom, image et source revelent chacun quelque chose. Un clic
              // ouvre la fiche, qui laisse le choix de regarder quand meme.
              const masque = masqueDe(item, kindFor(item), msq ?? null, spoilMode ?? 'histoire')
              const cache = masque === 'tout'
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
                      {cache ? (
                        <span className="item-icon spoiler-icon" title={t('spoilerWhy')}>
                          <TabIcon k="unknown" />
                        </span>
                      ) : (
                        <img
                          className="item-icon"
                          src={item.icon}
                          alt=""
                          loading="lazy"
                          onError={onItemImgError}
                        />
                      )}
                      <div className="item-text">
                        <span className="item-name">
                          {cache ? t('spoilerHidden', { patch: item.patch }) : name}
                          {(wishes?.[kindFor(item)] ?? []).includes(item.id) && (
                            <span className="wish-mark" title={t('wishMark')}>
                              <TabIcon k="wish" />
                            </span>
                          )}
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
                          {item.points !== undefined && (
                            <span className="chip chip-type" title={t('achPoints', { n: item.points })}>
                              {item.points} pts
                            </span>
                          )}
                          {item.reward && (
                            <span className="chip chip-hv" title={t('achReward')}>
                              🏆 {lang === 'fr' ? item.reward : item.rewardEn}
                            </span>
                          )}
                        </span>
                        {cache ? (
                          <span className="item-source">{t('spoilerWhy')}</span>
                        ) : masque === 'source' ? (
                          <span className="item-source">
                            {t('spoilerSource', { patch: item.patch })}
                          </span>
                        ) : primary ? (
                          <span className="item-source">
                            <TypeChip type={primary.type} /> {localSource(primary, lang)}
                            {item.sources.length > 1 && <SourcesTip sources={item.sources} />}
                          </span>
                        ) : item.description ? (
                          // Succès : le descriptif EST la voie d'obtention.
                          <span className="item-source">
                            {lang === 'fr' ? item.description : item.descriptionEn}
                          </span>
                        ) : null}
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
