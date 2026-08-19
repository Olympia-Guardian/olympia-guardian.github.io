import { accesDe, useStory } from '../access'
import { useMemo, useState } from 'react'
import { PLANNING_KINDS, type Character, type Item, type Kind, type Source } from '../api'
import { kindLabel, localName, localSource, useI18n, type StrKey } from '../i18n'
import {
  PER_DUTY_TYPES,
  isExchangeText,
  maxNeed,
  minNeed,
  needLabel,
  sourceGroupNeed,
  sourceInScope,
  typeLabel,
  type GroupNeed,
  type Scope,
} from '../sources'
import type { Db, Member } from '../store'
import { AvatarStack, KindChip, StatTile, TypeChip, onItemImgError } from '../ui'

type Ready = Member & { data: Character }

interface RunEntry {
  item: Item
  kind: Kind
  missing: Ready[]
  need: GroupNeed
  /** Pour les cartes par catégorie : les sources détaillées (prix, coffre…). */
  detailSrcs?: Source[]
}

interface Run {
  key: string
  type: string
  perDuty: boolean
  /** Source de référence pour le titre des cartes par-contenu. */
  src?: Source
  need: GroupNeed
  entries: RunEntry[]
  impact: number
  players: Ready[]
}

type CompoFilter = 'all' | 'group' | 'solo'
type KindFilter = 'all' | Kind

const TILE_KEYS: Record<Kind, StrKey> = {
  mounts: 'tileMounts',
  minions: 'tileMinions',
  cards: 'tileCards',
  fashions: 'tileFashions',
  facewear: 'tileFacewear',
  hairstyles: 'tileHairstyles',
  outfits: 'tileOutfits',
  armoires: 'tileArmoires',
  bardings: 'tileBardings',
  emotes: 'tileEmotes',
  frames: 'tileFrames',
  orchestrions: 'tileOrchestrions',
  spells: 'tileSpells',
  achievements: 'tileAchievements',
}

function NeedChip({ need }: { need: GroupNeed }) {
  const { lang } = useI18n()
  return <span className={`chip chip-need chip-need-${need}`}>{needLabel(need, lang)}</span>
}

const COLLAPSED_ENTRIES = 8

function RunCard({
  run,
  readyCount,
  onShowItem,
}: {
  run: Run
  readyCount: number
  onShowItem: (item: Item, kind: Kind) => void
}) {
  const { lang, t } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? run.entries : run.entries.slice(0, COLLAPSED_ENTRIES)
  const hidden = run.entries.length - shown.length
  // Seul dans la vue : les mentions « manque à x/1 » et avatars n'apportent rien.
  const solo = readyCount === 1
  // Carte homogène → badge dans l'en-tête ; sinon badge par objet concerné.
  const uniform = run.entries.every((e) => e.need === run.entries[0].need)
  const title = run.perDuty && run.src ? localSource(run.src, lang) : typeLabel(run.type, lang)
  return (
    <article className="run-card">
      <header className="run-head">
        {run.perDuty && <TypeChip type={run.type} />}
        <h3 className="run-title">{title}</h3>
        {(run.perDuty || uniform) && <NeedChip need={run.need} />}
        <div className="run-meta">
          {!solo && <AvatarStack chars={run.players.map((p) => p.data)} />}
          <span className="run-impact" title={t('toLootTitle')}>
            {t('toLoot', { n: run.impact })}
          </span>
        </div>
      </header>
      <ul className="run-entries">
        {shown.map((e) => (
          <li key={`${e.kind}-${e.item.id}`} className="run-entry">
            <span
              className="item-clickable"
              role="button"
              tabIndex={0}
              title={t('itemDetails')}
              onClick={() => onShowItem(e.item, e.kind)}
              onKeyDown={(ev) => ev.key === 'Enter' && onShowItem(e.item, e.kind)}
            >
              <img className="item-icon" src={e.item.icon} alt="" loading="lazy" onError={onItemImgError} />
              <span className="item-name">{localName(e.item, lang)}</span>
            </span>
            <KindChip kind={e.kind} />
            {e.item.patch && <span className="chip chip-patch">{e.item.patch}</span>}
            {e.item.tradeable && (
              <span className="chip chip-hv" title={t('hvTitle')}>
                HV
              </span>
            )}
            {!(run.perDuty || uniform) && e.need !== 'solo' && <NeedChip need={e.need} />}
            {e.detailSrcs && (
              <span
                className="entry-detail"
                title={e.detailSrcs.map((s) => localSource(s, lang)).join('  ·  ')}
              >
                {e.detailSrcs.map((s) => localSource(s, lang)).join('  ·  ')}
              </span>
            )}
            {!solo && (
              <span className="entry-missing">
                <span className="entry-missing-label">
                  {t('missingFor', { a: e.missing.length, b: readyCount })}
                </span>
                <AvatarStack chars={e.missing.map((m) => m.data)} size={20} />
              </span>
            )}
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button className="run-expand" onClick={() => setExpanded(true)}>
          {t('showMoreItems', { n: hidden })}
        </button>
      )}
    </article>
  )
}

export function Planning({
  db,
  ready,
  ownedSets,
  onShowItem,
}: {
  db: Db
  ready: Ready[]
  ownedSets: Map<number, Record<Kind, Set<number>>>
  onShowItem: (item: Item, kind: Kind) => void
}) {
  const { lang, t } = useI18n()
  const [scope, setScope] = useState<Scope>('instances')
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [minMissing, setMinMissing] = useState(1)
  const [includeUnavailable, setIncludeUnavailable] = useState(false)
  const jalons = useStory()
  const acces = useMemo(
    () => new Map(ready.map((m) => [m.id, accesDe(m.data, jalons)])),
    [ready, jalons],
  )
  const [compo, setCompo] = useState<CompoFilter>('all')
  const [search, setSearch] = useState('')

  const runs = useMemo(() => {
    const map = new Map<string, Run>()
    const kinds: Kind[] = kindFilter === 'all' ? PLANNING_KINDS : [kindFilter]
    // En vue « juste pour moi », un seuil > 1 gardé d'avant viderait tout.
    const minM = Math.min(minMissing, ready.length)
    for (const kind of kinds) {
      for (const item of db[kind]) {
        // Plus obtenable du tout : rien à planifier, même si une source a
        // un type encore « actif » (ex. monture Goobbue, vendeur disparu).
        if (item.unobtainable && !includeUnavailable) continue
        const missing = ready.filter((m) => {
          if (!m.data[kind].isPublic) return false
          // Contenu qu'il ne peut pas encore débloquer : le lui proposer à
          // farmer n'est pas un spoiler, c'est un mauvais conseil. On prend la
          // borne LARGE de ce qu'il peut atteindre — amputer le planning
          // coûterait plus cher que de proposer un objet de trop.
          if (item.patch && parseFloat(item.patch) > (acces.get(m.id) ?? Infinity)) return false
          return !ownedSets.get(m.id)?.[kind].has(item.id)
        })
        if (missing.length < minM) continue

        const addEntry = (
          key: string,
          runInit: Pick<Run, 'type' | 'perDuty' | 'src'>,
          entry: RunEntry,
        ) => {
          let run = map.get(key)
          if (!run) {
            run = { key, ...runInit, need: 'solo', entries: [], impact: 0, players: [] }
            map.set(key, run)
          }
          run.entries.push(entry)
        }

        // Sources regroupées par type, dans le périmètre des filtres
        const byType = new Map<string, Source[]>()
        for (const s of item.sources) {
          if (!sourceInScope(s.type, scope, includeUnavailable)) continue
          const arr = byType.get(s.type) ?? []
          arr.push(s)
          byType.set(s.type, arr)
        }

        for (const [type, srcs] of byType) {
          if (!PER_DUTY_TYPES.has(type)) {
            // Carte par catégorie (monnaies, zones…) : voie la plus facile.
            const need = minNeed(srcs.map((s) => sourceGroupNeed(type, s.textEn, item.patch, kind)))
            if (compo === 'group' && need === 'solo') continue
            if (compo === 'solo' && need !== 'solo') continue
            addEntry(
              `type::${type}`,
              { type, perDuty: false },
              { item, kind, missing, need, detailSrcs: srcs },
            )
            continue
          }
          // Carte par contenu : les variantes « échange » (PNJ - Lieu - 99
          // monnaie) ne font pas leur propre carte, elles s'affichent en
          // détail sur celle du vrai contenu — sauf si l'objet n'a que ça.
          const duties = srcs.filter((s) => !isExchangeText(s.textEn))
          const exchanges = srcs.filter((s) => isExchangeText(s.textEn))
          const targets = duties.length > 0 ? duties : exchanges
          const detailSrcs =
            duties.length > 0 && exchanges.length > 0 ? exchanges : undefined
          for (const src of targets) {
            const need = sourceGroupNeed(type, src.textEn, item.patch, kind)
            if (compo === 'group' && need === 'solo') continue
            if (compo === 'solo' && need !== 'solo') continue
            addEntry(
              `${type}::${src.textEn}`,
              { type, perDuty: true, src },
              { item, kind, missing, need, detailSrcs },
            )
          }
        }
      }
    }
    const result = [...map.values()]
    for (const run of result) {
      run.impact = run.entries.reduce((sum, e) => sum + e.missing.length, 0)
      run.need = maxNeed(run.entries.map((e) => e.need))
      const byId = new Map<number, Ready>()
      for (const e of run.entries) for (const m of e.missing) byId.set(m.id, m)
      run.players = [...byId.values()]
      run.entries.sort((a, b) => b.missing.length - a.missing.length)
    }
    result.sort((a, b) => b.impact - a.impact)
    return result
  }, [db, ready, ownedSets, scope, kindFilter, minMissing, includeUnavailable, compo, acces])

  const filteredRuns = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return runs
    return runs.filter((r) => {
      const title = r.perDuty && r.src ? localSource(r.src, lang) : typeLabel(r.type, lang)
      return (
        title.toLowerCase().includes(q) ||
        typeLabel(r.type, lang).toLowerCase().includes(q) ||
        r.entries.some(
          (e) => e.item.name.toLowerCase().includes(q) || e.item.nameEn.toLowerCase().includes(q),
        )
      )
    })
  }, [runs, search, lang])

  const stats = useMemo(() => {
    const counts = Object.fromEntries(PLANNING_KINDS.map((k) => [k, new Set<number>()])) as Record<
      Kind,
      Set<number>
    >
    for (const run of runs) for (const e of run.entries) counts[e.kind].add(e.item.id)
    return { counts, runs: runs.length }
  }, [runs])

  const [visible, setVisible] = useState(30)

  if (ready.length === 0) return null

  return (
    <div className="view">
      <div className="stat-row">
        <StatTile value={stats.runs} label={t('tileRuns')} />
        {(kindFilter === 'all' ? PLANNING_KINDS : [kindFilter]).map((k) => (
          <StatTile key={k} value={stats.counts[k].size} label={t(TILE_KEYS[k])} />
        ))}
      </div>

      <div className="controls">
        <select value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
          <option value="instances">{t('scopeInstances')}</option>
          <option value="longterm">{t('scopeLongterm')}</option>
          <option value="all">{t('scopeAll')}</option>
        </select>
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value as KindFilter)}
        >
          <option value="all">{t('allCollections')}</option>
          {PLANNING_KINDS.map((k) => (
            <option key={k} value={k}>
              {kindLabel(lang, k)}
            </option>
          ))}
        </select>
        <select
          value={compo}
          onChange={(e) => setCompo(e.target.value as CompoFilter)}
          title={t('compoTitle')}
        >
          <option value="all">{t('compoAll')}</option>
          <option value="group">{t('compoGroup')}</option>
          <option value="solo">{t('compoSolo')}</option>
        </select>
        {ready.length > 1 && (
          <select
            value={Math.min(minMissing, ready.length)}
            onChange={(e) => setMinMissing(Number(e.target.value))}
          >
            {Array.from({ length: ready.length }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {t(n > 1 ? 'minMissingN' : 'minMissing1', { n })}
              </option>
            ))}
          </select>
        )}
        <label className="check">
          <input
            type="checkbox"
            checked={includeUnavailable}
            onChange={(e) => setIncludeUnavailable(e.target.checked)}
          />
          {t('includeUnavailable')}
        </label>
        <input
          className="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchPlanning')}
          spellCheck={false}
        />
      </div>

      {filteredRuns.length === 0 && <p className="empty">{t('planningEmpty')}</p>}

      <div className="run-list">
        {filteredRuns.slice(0, visible).map((run) => (
          <RunCard key={run.key} run={run} readyCount={ready.length} onShowItem={onShowItem} />
        ))}
      </div>

      {filteredRuns.length > visible && (
        <button className="btn btn-ghost more" onClick={() => setVisible((v) => v + 30)}>
          {t('showMore', { n: filteredRuns.length - visible })}
        </button>
      )}
    </div>
  )
}
