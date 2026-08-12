import { useEffect, useMemo, useRef, useState } from 'react'
import {
  HIDDEN_KINDS,
  KINDS,
  KIND_FAMILIES,
  fetchCharacter,
  invalidateCharacter,
  type Character,
  type Item,
  type Kind,
  type RelicDb,
} from '../api'
import type { useAuth } from '../auth'
import { kindLabel, localName, useI18n } from '../i18n'
import { typeLabel } from '../sources'
import {
  GiCheckMark,
  GiMagnifyingGlass,
  GiPadlock,
  GiPowerLightning,
  GiRoundStar,
} from 'react-icons/gi'
import type { Db, Member } from '../store'
import { Meter, TypeChip, onAvatarImgError, onItemImgError } from '../ui'
import { localSource } from '../i18n'
import { Relics } from './Relics'

// Collections modifiables depuis « Mon Journal » (le reste vient du Lodestone).
const EDITABLE = HIDDEN_KINDS

// Collections où le nom et l'obtention comptent plus que la vignette : liste.
const LIST_KINDS: Kind[] = ['emotes', 'frames']

const ACTIVE_CHAR_KEY = 'ogs.activeChar.v1'

/** Portraits : nom complet du kit d'encadrement (« L'Art du portrait : … »). */
function localItemName(it: Item, lang: string): string {
  return (lang === 'fr' ? it.itemName : (it.itemNameEn ?? it.itemName)) ?? it.name
}

type Auth = ReturnType<typeof useAuth>

/** Panneau latéral : fiche de l'objet sélectionné + ajout/retrait. */
function ItemPanel({
  item,
  owned,
  readOnly,
  onToggle,
  onClose,
}: {
  item: Item
  owned: boolean
  readOnly?: boolean
  onToggle: () => void
  onClose: () => void
}) {
  const { lang, t } = useI18n()
  const description = lang === 'fr' ? item.description : item.descriptionEn
  return (
    <aside className="item-panel">
      <button className="icon-btn item-panel-close" title={t('close')} onClick={onClose}>
        ×
      </button>
      <img className="item-panel-image" src={item.image} alt="" loading="lazy" onError={onItemImgError} />
      <h3 className="item-panel-name">{localName(item, lang)}</h3>
      {item.itemName && <p className="modal-en">{localItemName(item, lang)}</p>}
      {item.nameEn !== localName(item, lang) && <p className="modal-en">{item.nameEn}</p>}
      <p className="modal-chips">
        {item.patch && <span className="chip chip-patch">{t('patch', { n: item.patch })}</span>}
        {item.tradeable && (
          <span className="chip chip-hv" title={t('hvTitle')}>
            HV
          </span>
        )}
        <span className={`chip ${owned ? 'chip-owned' : 'chip-type'}`}>
          {owned ? t('panelOwned') : t('panelMissing')}
        </span>
      </p>
      {description && <p className="modal-desc">{description}</p>}
      {item.pieces && item.pieces.length > 0 && (
        <ul className="panel-pieces">
          {item.pieces.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}
      {item.sources.length > 0 && (
        <ul className="modal-sources">
          {item.sources.map((s, i) => (
            <li key={i}>
              <TypeChip type={s.type} /> {localSource(s, lang)}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <button className={`btn ${owned ? 'btn-ghost' : 'btn-primary'} item-panel-action`} onClick={onToggle}>
          {owned ? t('panelRemove') : t('panelAdd')}
        </button>
      )}
    </aside>
  )
}

/** Rail de catégories : navigation verticale avec compte et mini-jauge par
 *  catégorie, façon Lodestone — remplace les nuages de pastilles. */
function CatRail({
  entries,
  all,
  active,
  onSelect,
}: {
  entries: { key: string; label: string; owned: number; total: number }[]
  /** Totaux réels pour « Tout » (un objet peut compter dans plusieurs catégories). */
  all: { owned: number; total: number }
  active: string | null
  onSelect: (key: string | null) => void
}) {
  const { lang, t } = useI18n()
  // Ordre alphabétique : on cherche une catégorie par son nom, pas par sa taille.
  const sorted = useMemo(
    () => [...entries].sort((a, b) => a.label.localeCompare(b.label, lang)),
    [entries, lang],
  )
  const row = (key: string | null, label: string, owned: number, total: number) => (
    <button
      key={key ?? '__all'}
      className={`cat-item ${active === key ? 'is-active' : ''} ${owned === total ? 'is-done' : ''}`}
      onClick={() => onSelect(key)}
    >
      <span className="cat-item-top">
        <span className="cat-item-label">{label}</span>
        <span className="cat-item-count">
          {owned}/{total}
        </span>
      </span>
      <span className="cat-item-bar">
        <i style={{ width: `${total > 0 ? (owned / total) * 100 : 0}%` }} />
      </span>
    </button>
  )
  return (
    <nav className="cat-rail">
      {row(null, t('scopeAll'), all.owned, all.total)}
      {sorted.map((e) => row(e.key, e.label, e.owned, e.total))}
    </nav>
  )
}

/** Grimoire de magie bleue : n°, aspect/dégâts, rang en étoiles et obtention,
 *  comme le carnet en jeu. */
// L'API FFXIV Collect renvoie « / » comme aspect FR des sorts physiques → on
// traduit nous-mêmes depuis l'anglais (y compris les combos « Blunt/Earth »).
const ASPECT_FR: Record<string, string> = {
  blunt: 'Contondant',
  piercing: 'Perforant',
  slashing: 'Tranchant',
  fire: 'Feu',
  water: 'Eau',
  wind: 'Vent',
  earth: 'Terre',
  lightning: 'Foudre',
  ice: 'Glace',
  none: 'Aucun',
}

function localAspect(it: Item, lang: string): string {
  const en = it.aspectEn ?? ''
  if (lang !== 'fr') return en
  if (it.aspect && it.aspect !== '/') return it.aspect
  return en
    .split('/')
    .map((part) => ASPECT_FR[part.trim().toLowerCase()] ?? part)
    .join('/')
}

function SpellBook({
  items,
  ids,
  onItemClick,
}: {
  items: Item[]
  ids: Set<number>
  onItemClick: (it: Item) => void
}) {
  const { lang, t } = useI18n()
  const sorted = useMemo(() => [...items].sort((a, b) => a.order - b.order), [items])
  return (
    <div className="spellbook">
      {sorted.map((it) => {
        const has = ids.has(it.id)
        const physical = it.spellTypeEn === 'Physical'
        const aspect = localAspect(it, lang)
        // Pour les combos (« Perforant/Feu »), la pastille prend la couleur de l'élément
        const dotKey = (it.aspectEn ?? 'none').split('/').pop()!.trim().toLowerCase()
        return (
          <button
            key={it.id}
            className={`spell-row ${has ? 'is-owned' : 'is-missing'}`}
            onClick={() => onItemClick(it)}
          >
            <img className="spell-icon" src={it.icon} alt="" loading="lazy" onError={onItemImgError} />
            <span className="spell-main">
              <span className="spell-top">
                <span className="spell-name">
                  {localName(it, lang)}
                  {has && <GiCheckMark className="spell-check" />}
                </span>
                <span className="spell-no">{t('spellNo', { n: it.order })}</span>
              </span>
              <span className="spell-mid">
                <span className="spell-aspect">
                  <i className={`spell-dot aspect-${dotKey}`} />
                  {physical ? t('spellDamage') : t('spellAspect')} : {aspect}
                </span>
                <span className="spell-stars" title={`${it.rank ?? 0}/5`}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <GiRoundStar key={i} className={i < (it.rank ?? 0) ? 'is-filled' : ''} />
                  ))}
                </span>
              </span>
              <span className="spell-src">
                {it.sources[0] && (
                  <>
                    {it.sources[0].type !== 'Other' && <TypeChip type={it.sources[0].type} />}
                    <span className="spell-src-text">{localSource(it.sources[0], lang)}</span>
                  </>
                )}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Album de cartes façon jeu : pages de 30, illustrations, clic pour cocher. */
function CardAlbum({
  allItems,
  visible,
  ids,
  onItemClick,
}: {
  /** Toutes les cartes : les pages d'album restent fixes… */
  allItems: Item[]
  /** …et le filtre ne fait que masquer (pages vides cachées, numéros conservés). */
  visible: Set<number>
  ids: Set<number>
  onItemClick: (it: Item) => void
}) {
  const { lang } = useI18n()
  const [srcType, setSrcType] = useState<string | null>(null)

  // Position d'album par NUMÉRO de carte : page = ⌈n/30⌉, case = (n-1) mod 30,
  // trous préservés. Les cartes « Ex. » (série crossover) ont leurs propres
  // pages à la fin, comme la section Ex de l'album en jeu.
  const cardNo = (it: Item) => {
    const m = String(it.num ?? '').match(/\d+/)
    return m ? Number(m[0]) : it.order
  }
  const pages = useMemo(() => {
    const normal = new Map<number, (Item | null)[]>()
    const ex = new Map<number, (Item | null)[]>()
    for (const it of allItems) {
      const isEx = /^ex/i.test(String(it.num ?? ''))
      const n = cardNo(it)
      const p = Math.floor((n - 1) / 30)
      const target = isEx ? ex : normal
      if (!target.has(p)) target.set(p, Array(30).fill(null))
      target.get(p)![(n - 1) % 30] = it
    }
    return [
      ...[...normal.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([p, cells]) => ({ label: String(p + 1), cells, isEx: false })),
      ...[...ex.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([p, cells]) => ({ label: ex.size > 1 ? `Ex ${p + 1}` : 'Ex', cells, isEx: true })),
    ]
  }, [allItems])

  // Filtres par type de source, façon Lala (Haut fait, Quête, Défi, PNJ…)
  const srcTypes = useMemo(() => {
    const map = new Map<string, { total: number; owned: number }>()
    for (const it of allItems) {
      for (const type of new Set(it.sources.map((s) => s.type))) {
        const entry = map.get(type) ?? { total: 0, owned: 0 }
        entry.total++
        if (ids.has(it.id)) entry.owned++
        map.set(type, entry)
      }
    }
    // CatRail trie sur le libellé traduit : ici l'ordre brut suffit.
    return [...map.entries()]
  }, [allItems, ids])

  const shows = (it: Item) =>
    visible.has(it.id) && (!srcType || it.sources.some((s) => s.type === srcType))

  return (
    <div className="cat-layout album-wrap">
      <CatRail
        entries={srcTypes.map(([type, { total, owned }]) => ({
          key: type,
          label: typeLabel(type, lang),
          owned,
          total,
        }))}
        all={{
          owned: allItems.reduce((sum, it) => sum + (ids.has(it.id) ? 1 : 0), 0),
          total: allItems.length,
        }}
        active={srcType}
        onSelect={setSrcType}
      />
      <div className="cat-content album">
        {pages.map(({ label, cells, isEx }) => {
          const real = cells.filter((it): it is Item => it !== null)
          const shown = real.filter((it) => shows(it))
          if (shown.length === 0) return null
          const owned = real.reduce((sum, it) => sum + (ids.has(it.id) ? 1 : 0), 0)
          return (
            <section key={label} className={`album-page ${isEx ? 'album-page-ex' : ''}`}>
              <header className="album-page-head">
                <b>{label}</b>
                <span className={`mypage-count ${owned === real.length ? 'relic-done' : ''}`}>
                  {owned}/{real.length}
                </span>
              </header>
              <div className="album-grid">
                {cells.map((it, slot) => {
                  if (!it || !shows(it)) return <span key={slot} className="album-slot" />
                  const has = ids.has(it.id)
                  return (
                    <button
                      key={it.id}
                      className={`album-card ${has ? 'is-owned' : 'is-missing'}`}
                      title={`${localName(it, lang)} · ${it.num ?? `n°${cardNo(it)}`}${has ? ' ✓' : ''}`}
                      onClick={() => onItemClick(it)}
                    >
                      <img src={it.image} alt="" loading="lazy" onError={onItemImgError} />
                      {has && <span className="album-check">✓</span>}
                    </button>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

/** Grille de vignettes. Si la collection a des catégories (armoire), le rail
 *  de gauche évite de dérouler des milliers d'icônes d'un bloc. */
function IconGrid({
  items,
  ids,
  onItemClick,
}: {
  items: Item[]
  ids: Set<number>
  onItemClick: (it: Item) => void
}) {
  const { lang } = useI18n()
  const [cat, setCat] = useState<string | null>(null)
  const cats = useMemo(() => {
    const map = new Map<string, Item[]>()
    for (const it of items) {
      const g = (lang === 'fr' ? it.group : it.groupEn) ?? ''
      if (!g) continue
      const arr = map.get(g)
      if (arr) arr.push(it)
      else map.set(g, [it])
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], lang))
  }, [items, lang])

  const shown = cat
    ? items.filter((it) => ((lang === 'fr' ? it.group : it.groupEn) ?? '') === cat)
    : items

  const grid = (
    <div className="relic-icons mypage-grid">
      {shown.map((it) => {
        const has = ids.has(it.id)
        return (
          <button
            key={it.id}
            className={`relic-icon mypage-tile ${has ? 'is-owned' : 'is-missing'}`}
            title={`${localName(it, lang)}${has ? ' ✓' : ''}`}
            onClick={() => onItemClick(it)}
          >
            <img src={it.icon} alt="" width={40} height={40} loading="lazy" onError={onItemImgError} />
            {has && <span className="relic-badge">✓</span>}
          </button>
        )
      })}
    </div>
  )

  if (cats.length === 0) return grid
  return (
    <div className="cat-layout">
      <CatRail
        entries={cats.map(([g, list]) => ({
          key: g,
          label: g,
          owned: list.reduce((sum, it) => sum + (ids.has(it.id) ? 1 : 0), 0),
          total: list.length,
        }))}
        all={{
          owned: items.reduce((sum, it) => sum + (ids.has(it.id) ? 1 : 0), 0),
          total: items.length,
        }}
        active={cat}
        onSelect={setCat}
      />
      <div className="cat-content">{grid}</div>
    </div>
  )
}

/** Liste groupée par catégorie (orchestrion) : filtres façon Lodestone,
 *  numéro + nom + obtention + rouleau. */
const ROLL_ICON = `${import.meta.env.BASE_URL}assets/orchestrion_roll.jpg`

function GroupedChecklist({
  items,
  ids,
  onItemClick,
  variant = 'orchestrion',
}: {
  items: Item[]
  ids: Set<number>
  onItemClick: (it: Item) => void
  /** L'orchestrion affiche le rouleau à droite ; les autres, leur propre icône à gauche. */
  variant?: 'orchestrion' | 'icon'
}) {
  const { lang } = useI18n()
  const [cat, setCat] = useState<string | null>(null)
  const allGroups = useMemo(() => {
    const map = new Map<string, Item[]>()
    for (const it of [...items].sort((a, b) => Number(a.num ?? a.order) - Number(b.num ?? b.order))) {
      const g = (lang === 'fr' ? it.group : it.groupEn) ?? ''
      const arr = map.get(g)
      if (arr) arr.push(it)
      else map.set(g, [it])
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], lang))
  }, [items, lang])

  const groups = cat ? allGroups.filter(([g]) => g === cat) : allGroups
  // Collections sans catégorie (portraits) : ni rail ni en-tête de section.
  const grouped = allGroups.length > 1 || allGroups[0]?.[0]

  return (
    <div className={`checklist ${grouped ? 'cat-layout' : ''}`}>
      {grouped && (
        <CatRail
          entries={allGroups.map(([g, list]) => ({
            key: g,
            label: g,
            owned: list.reduce((sum, it) => sum + (ids.has(it.id) ? 1 : 0), 0),
            total: list.length,
          }))}
          all={{
            owned: items.reduce((sum, it) => sum + (ids.has(it.id) ? 1 : 0), 0),
            total: items.length,
          }}
          active={cat}
          onSelect={setCat}
        />
      )}
      <div className="cat-content checklist-groups">
      {groups.map(([group, list]) => {
        const owned = list.reduce((sum, it) => sum + (ids.has(it.id) ? 1 : 0), 0)
        return (
          <section key={group} className="checklist-group">
            {grouped && (
              <header className="album-page-head">
                <b>{group}</b>
                <span className={`mypage-count ${owned === list.length ? 'relic-done' : ''}`}>
                  {owned}/{list.length}
                </span>
              </header>
            )}
            <ul className="checklist-rows">
              {list.map((it) => {
                const has = ids.has(it.id)
                return (
                  <li key={it.id}>
                    <button
                      className={`checklist-row ${has ? 'is-owned' : ''}`}
                      onClick={() => onItemClick(it)}
                    >
                      <span className={`checklist-box ${has ? 'is-owned' : ''}`}>
                        {has ? '✓' : ''}
                      </span>
                      {variant === 'icon' && (
                        <img
                          className={`checklist-icon ${has ? '' : 'is-missing'}`}
                          src={it.icon}
                          alt=""
                          width={28}
                          height={28}
                          loading="lazy"
                          onError={onItemImgError}
                        />
                      )}
                      {variant === 'orchestrion' && it.num !== undefined && (
                        <span className="checklist-num">{String(it.num).padStart(3, '0')}</span>
                      )}
                      <span
                        className="checklist-name"
                        title={it.itemName ? localItemName(it, lang) : undefined}
                      >
                        {localName(it, lang)}
                      </span>
                      {it.command && <span className="chip chip-cmd">{it.command}</span>}
                      {it.patch && <span className="chip chip-patch">{it.patch}</span>}
                      <span className="checklist-src">
                        {it.sources[0] ? (lang === 'fr' ? it.sources[0].text : it.sources[0].textEn) : ''}
                      </span>
                      {variant === 'orchestrion' && (
                        <img
                          className={`checklist-roll ${has ? '' : 'is-missing'}`}
                          src={ROLL_ICON}
                          alt=""
                          width={26}
                          height={26}
                          loading="lazy"
                        />
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
      </div>
    </div>
  )
}

function CollectionEditor({
  db,
  kind,
  charId,
  owned,
  readOnly,
  onSave,
}: {
  db: Db
  kind: Kind
  charId: number
  owned: number[]
  readOnly?: boolean
  onSave: (kind: Kind, ids: number[]) => void
}) {
  const { lang, t } = useI18n()
  const [ids, setIds] = useState<Set<number>>(() => new Set(owned))
  const [search, setSearch] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setIds(new Set(owned))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charId, kind])

  function toggle(id: number) {
    if (readOnly) return
    setIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => onSave(kind, [...next]), 1200)
      return next
    })
  }

  const [mode, setMode] = useState<'quick' | 'inspect'>('inspect')
  const [selected, setSelected] = useState<Item | null>(null)
  const inspect = readOnly || mode === 'inspect'

  function handleItem(it: Item) {
    if (inspect) setSelected(it)
    else toggle(it.id)
  }

  const items = useMemo(() => {
    const q = search.trim().toLowerCase()
    return db[kind].filter(
      (it) =>
        (!q || it.name.toLowerCase().includes(q) || it.nameEn.toLowerCase().includes(q)) &&
        (!onlyMissing || !ids.has(it.id)),
    )
  }, [db, kind, search, onlyMissing, ids])

  const visible = useMemo(() => new Set(items.map((it) => it.id)), [items])

  return (
    <div className="mypage-editor">
      <div className="controls editor-controls">
        <input
          className="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchIn', { what: kindLabel(lang, kind) })}
          spellCheck={false}
        />
        <button
          className={`cat-chip ${onlyMissing ? 'is-active' : ''}`}
          onClick={() => setOnlyMissing((v) => !v)}
        >
          {t('onlyMissing')}
        </button>
        {!readOnly && (
          <div className="mode-switch">
            <button
              className={`mode-btn ${mode === 'quick' ? 'is-active' : ''}`}
              title={t('modeQuickTitle')}
              onClick={() => setMode('quick')}
            >
              <GiPowerLightning /> {t('modeQuick')}
            </button>
            <button
              className={`mode-btn ${mode === 'inspect' ? 'is-active' : ''}`}
              title={t('modeInspectTitle')}
              onClick={() => setMode('inspect')}
            >
              <GiMagnifyingGlass /> {t('modeInspect')}
            </button>
          </div>
        )}
      </div>
      <div className="editor-layout">
        <div className="editor-body">
          {kind === 'cards' ? (
            <CardAlbum allItems={db[kind]} visible={visible} ids={ids} onItemClick={handleItem} />
          ) : kind === 'orchestrions' ? (
            <GroupedChecklist items={items} ids={ids} onItemClick={handleItem} />
          ) : kind === 'spells' ? (
            <SpellBook items={items} ids={ids} onItemClick={handleItem} />
          ) : LIST_KINDS.includes(kind) ? (
            <GroupedChecklist items={items} ids={ids} onItemClick={handleItem} variant="icon" />
          ) : (
            <IconGrid items={items} ids={ids} onItemClick={handleItem} />
          )}
        </div>
        {selected && (
          <ItemPanel
            item={selected}
            owned={ids.has(selected.id)}
            readOnly={readOnly}
            onToggle={() => toggle(selected.id)}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  )
}

export function MyPage({
  db,
  relicDb,
  auth,
  members,
  onCharacterUpdated,
}: {
  db: Db
  relicDb: RelicDb | null
  auth: Auth
  members: Member[]
  onCharacterUpdated: (charId: number) => void
}) {
  const { lang, t } = useI18n()
  const [bindInput, setBindInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [char, setChar] = useState<Character | null>(null)
  // Les reliques ne sont pas un « kind » (données à part), mais elles ont leur
  // onglet ici : c'est la page où l'on suit sa propre progression.
  const [kind, setKind] = useState<Kind | 'relics'>('cards')
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const relicSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const relicIdsRef = useRef<number[]>([])

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2000)
  }

  // Plusieurs persos par compte : celui qu'on regarde est mémorisé localement.
  const verifiedList = auth.bindings.filter((b) => b.verified)
  const [activeId, setActiveId] = useState<number | null>(() => {
    const n = Number(localStorage.getItem(ACTIVE_CHAR_KEY))
    return Number.isInteger(n) && n > 0 ? n : null
  })
  const verified = verifiedList.find((b) => b.charId === activeId) ?? verifiedList[0]
  const pending = auth.bindings.find((b) => !b.verified)
  const [adding, setAdding] = useState(false)
  // Fiches des persos vérifiés : sert au sélecteur (nom + portrait).
  const [chars, setChars] = useState<Record<number, Character>>({})

  useEffect(() => {
    if (verified) localStorage.setItem(ACTIVE_CHAR_KEY, String(verified.charId))
  }, [verified?.charId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (verified) {
      fetchCharacter(verified.charId)
        .then(setChar)
        .catch(() => setChar(null))
    } else {
      setChar(null)
    }
  }, [verified?.charId]) // eslint-disable-line react-hooks/exhaustive-deps

  const verifiedIds = verifiedList.map((b) => b.charId).join(',')
  useEffect(() => {
    if (!verifiedIds) return
    for (const id of verifiedIds.split(',').map(Number)) {
      fetchCharacter(id)
        .then((c) => setChars((prev) => ({ ...prev, [id]: c })))
        .catch(() => {
          // perso injoignable : le sélecteur se rabat sur son identifiant
        })
    }
  }, [verifiedIds])

  if (!auth.user) {
    return (
      <div className="view mypage">
        <div className="hero">
          <h1>{t('myPage')}</h1>
          <p>{t('loginIntro')}</p>
          <button className="btn btn-primary" onClick={auth.login}>
            {t('loginDiscord')}
          </button>
        </div>
      </div>
    )
  }

  async function doBind(charId: number) {
    setBusy(true)
    setNotice(null)
    try {
      await auth.bind(charId)
    } catch (e) {
      setNotice((e as Error).message === 'conflict' ? t('bindConflict') : t('bindError'))
    } finally {
      setBusy(false)
    }
  }

  async function doVerify(charId: number) {
    setBusy(true)
    setNotice(null)
    try {
      const ok = await auth.verifyBind(charId)
      setNotice(ok ? t('bindVerified') : t('bindCodeMissing'))
      if (ok) {
        // On bascule directement sur le perso qu'on vient de lier.
        setActiveId(charId)
        setAdding(false)
      }
    } catch (e) {
      setNotice((e as Error).message === 'conflict' ? t('bindConflict') : t('bindError'))
    } finally {
      setBusy(false)
    }
  }

  async function doUnbind(charId: number, name: string) {
    if (!confirm(t('unbindConfirm', { name }))) return
    setBusy(true)
    setNotice(null)
    try {
      await auth.unbind(charId)
      setActiveId(null)
      localStorage.removeItem(ACTIVE_CHAR_KEY)
    } catch {
      setNotice(t('saveError'))
    } finally {
      setBusy(false)
    }
  }

  // Bascule groupée (« Tout ajouter » sur un palier) : une seule mise à jour
  // d'état et une seule sauvegarde, même pour 35 pièces.
  function setRelics(ids: number[], add: boolean) {
    setChar((prev) => {
      if (!prev) return prev
      const set = new Set(prev.relicIds)
      for (const id of ids) {
        if (add) set.add(id)
        else set.delete(id)
      }
      const relicIds = [...set]
      relicIdsRef.current = relicIds
      return { ...prev, relicIds }
    })
    if (relicSaveTimer.current) clearTimeout(relicSaveTimer.current)
    relicSaveTimer.current = setTimeout(() => save('relics', relicIdsRef.current), 1200)
  }

  async function save(k: Kind | 'relics', ids: number[]) {
    if (!verified) return
    try {
      await auth.saveCollections(verified.charId, { [k]: ids })
      invalidateCharacter(verified.charId)
      onCharacterUpdated(verified.charId)
      showToast(t('saved'))
    } catch {
      setNotice(t('saveError'))
    }
  }

  // Les reliques se cochent une par une ; les totaux de matériaux se recalculent
  // à chaque clic, l'envoi au serveur est groupé après une courte pause.
  function toggleRelic(id: number) {
    setChar((prev) => {
      if (!prev) return prev
      const has = prev.relicIds.includes(id)
      const relicIds = has ? prev.relicIds.filter((x) => x !== id) : [...prev.relicIds, id]
      // Le ref garde la dernière liste : plusieurs clics rapides n'envoient
      // qu'une seule requête, avec l'état final.
      relicIdsRef.current = relicIds
      return { ...prev, relicIds }
    })
    if (relicSaveTimer.current) clearTimeout(relicSaveTimer.current)
    relicSaveTimer.current = setTimeout(() => save('relics', relicIdsRef.current), 1200)
  }

  return (
    <div className="view mypage">
      {toast && <div className="toast">{toast}</div>}

      {verifiedList.length > 0 && (
        <nav className="char-switch">
          {verifiedList.map((b) => {
            const c = chars[b.charId]
            return (
              <button
                key={b.charId}
                className={`char-tab ${b.charId === verified?.charId ? 'is-active' : ''}`}
                onClick={() => {
                  setActiveId(b.charId)
                  setAdding(false)
                }}
              >
                {c && <img src={c.avatar} alt="" width={26} height={26} onError={onAvatarImgError} />}
                <span className="char-tab-id">
                  <b>{c ? c.name : `#${b.charId}`}</b>
                  {c && <span className="player-server">{c.server}</span>}
                </span>
              </button>
            )
          })}
          <button
            className={`char-tab char-add ${adding ? 'is-active' : ''}`}
            title={t('bindAdd')}
            onClick={() => setAdding((v) => !v)}
          >
            + {t('bindAdd')}
          </button>
        </nav>
      )}

      {(!verified || adding) && (
        <section className="relic-series mypage-bind">
          <h3 className="relic-series-name">{verified ? t('bindAdd') : t('bindTitle')}</h3>
          {!pending && (
            <>
              <p className="modal-muted">{t('bindIntro')}</p>
              <div className="controls">
                <select value={bindInput} onChange={(e) => setBindInput(e.target.value)}>
                  <option value="">—</option>
                  {members
                    .filter((m) => m.status === 'ok' && m.data)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.data!.name} ({m.data!.server})
                      </option>
                    ))}
                </select>
                <input
                  className="search"
                  value={bindInput}
                  onChange={(e) => setBindInput(e.target.value)}
                  placeholder={t('addPlaceholder')}
                  spellCheck={false}
                />
                <button
                  className="btn btn-primary"
                  disabled={busy || !/^\d+$/.test(bindInput.trim())}
                  onClick={() => doBind(Number(bindInput.trim()))}
                >
                  {t('bindStart')}
                </button>
              </div>
            </>
          )}
          {pending && (
            <>
              <p>
                {t('bindStep1')} <code className="bind-code">{pending.code}</code>
              </p>
              <p className="modal-muted">{t('bindStep2')}</p>
              <p>
                <a
                  href={`https://eu.finalfantasyxiv.com/lodestone/my/setting/profile/`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('bindProfileLink')}
                </a>
              </p>
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={() => doVerify(pending.charId)}
              >
                {t('bindVerify')}
              </button>
            </>
          )}
          {notice && <p className="notice">{notice}</p>}
        </section>
      )}

      {verified && char && (
        <>
          <section className="relic-series mypage-char">
            <div className="player-head mypage-char-head">
              <img className="player-avatar mypage-char-avatar" src={char.avatar} alt="" width={48} height={48} />
              <div className="player-id">
                <span className="player-name mypage-char-name">
                  {char.name}
                  <span className="chip chip-owned">
                    <GiCheckMark /> {t('bindVerifiedChip')}
                  </span>
                </span>
                <span className="player-server">{char.server}</span>
              </div>
              <button
                className="btn btn-ghost btn-mini mypage-unbind"
                onClick={() => doUnbind(char.id, char.name)}
              >
                {t('unbindChar')}
              </button>
            </div>
            <div className="meter-grid mypage-meters">
              {KINDS.map((k) => (
                <Meter
                  key={k}
                  label={kindLabel(lang, k, 'short')}
                  count={char[k].count}
                  total={char[k].total}
                />
              ))}
              {relicDb && (
                <Meter
                  label={t('relicsTab')}
                  count={char.relicIds.length}
                  total={relicDb.relics.length}
                />
              )}
            </div>
            <p className="mypage-note">
              <GiPadlock /> {t('myPageAutoNote')}
            </p>
          </section>

          <nav className="kind-bar mypage-tabs">
            {KIND_FAMILIES.map((fam) => (
              <span key={fam.key} className="kind-family">
                {fam.kinds.map((k) => {
                  const locked = !EDITABLE.includes(k)
                  return (
                    <button
                      key={k}
                      className={`kind-btn ${kind === k ? 'is-active' : ''}`}
                      title={locked ? t('myPageReadOnly') : undefined}
                      onClick={() => setKind(k)}
                    >
                      {locked && <GiPadlock className="tab-lock" />} {kindLabel(lang, k, 'short')}
                    </button>
                  )
                })}
              </span>
            ))}
            <span className="kind-family">
              <button
                className={`kind-btn ${kind === 'relics' ? 'is-active' : ''}`}
                onClick={() => setKind('relics')}
              >
                {t('relicsTab')}
              </button>
            </span>
          </nav>
          {notice && <p className="notice">{notice}</p>}
          {kind === 'relics' ? (
            relicDb ? (
              <Relics
                db={relicDb}
                ready={[{ id: char.id, status: 'ok', data: char }]}
                detailed
                onToggleRelic={toggleRelic}
                onSetRelics={setRelics}
              />
            ) : (
              <p className="muted">{t('relicsLoading')}</p>
            )
          ) : (
            <CollectionEditor
              key={`${verified.charId}-${kind}`}
              db={db}
              kind={kind}
              charId={verified.charId}
              owned={char[kind].ids}
              readOnly={!EDITABLE.includes(kind)}
              onSave={save}
            />
          )}
        </>
      )}
    </div>
  )
}
