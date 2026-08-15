import { lsGet, lsRemove, lsSet } from '../storage'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  HIDDEN_KINDS,
  KINDS,
  KIND_FAMILIES,
  fetchCharacter,
  fetchCollectDoc,
  invalidateCharacter,
  pushCollectSync,
  type Character,
  type CharProfile,
  type Item,
  type Kind,
  type RelicDb,
} from '../api'
import type { useAuth } from '../auth'
import { apiSearchCharacter, type CharSearchResult } from '../groupsApi'
import { kindLabel, localName, useI18n } from '../i18n'
import { sourceIcon, typeLabel } from '../sources'
import { GiCheckMark, GiPadlock, GiRoundStar } from 'react-icons/gi'
import { readHashParam, setHashParam, type Db, type Member } from '../store'
import { Meter, TabIcon, TypeChip, onAvatarImgError, onItemImgError, xivIconUrl } from '../ui'
import { localSource } from '../i18n'
import { Relics } from './Relics'

// Collections modifiables depuis « Mon Journal » (le reste vient du Lodestone).
const EDITABLE = HIDDEN_KINDS

// Collections où le nom et l'obtention comptent plus que la vignette : liste.
const LIST_KINDS: Kind[] = ['emotes', 'frames', 'bardings', 'mounts', 'minions', 'achievements', 'outfits']

/** L'armoire mélange quatre familles. L'emplacement d'équipement (résolu via
 *  XIVAPI, attaché par fetch-data) sépare armures et accessoires ; pour les
 *  mains, la planche d'icônes distingue les outils d'artisan et de récolteur
 *  (035/038/039) des armes. Emplacement inconnu ou combiné : armure. */
function armoireSectionKey(it: Item): 'armoireArmor' | 'armoireAcc' | 'armoireWeapons' | 'armoireTools' {
  const slot = it.slot ?? 0
  if (slot >= 9 && slot <= 12) return 'armoireAcc'
  if (slot === 1 || slot === 2 || slot === 13 || slot === 0) {
    const m = String(it.icon).match(/0(\d{5})_hr1/)
    const sheet = m ? Math.floor(Number(m[1]) / 1000) : 0
    if (sheet === 35 || sheet === 38 || sheet === 39) return 'armoireTools'
    if (sheet >= 30 && sheet < 40) return 'armoireWeapons'
  }
  return 'armoireArmor'
}

const ACTIVE_CHAR_KEY = 'ogs.activeChar.v1'

/** Portraits : nom complet du kit d'encadrement (« L'Art du portrait : … »). */
function localItemName(it: Item, lang: string): string {
  return (lang === 'fr' ? it.itemName : (it.itemNameEn ?? it.itemName)) ?? it.name
}

type Auth = ReturnType<typeof useAuth>

/** Panneau latéral : fiche de l'objet sélectionné + ajout/retrait. */
/** Noms français des jobs (le Lodestone est scrappé en anglais). */
const JOB_NAMES_FR: Record<string, string> = {
  Paladin: 'Paladin',
  Warrior: 'Guerrier',
  'Dark Knight': 'Chevalier noir',
  Gunbreaker: 'Pistosabreur',
  'White Mage': 'Mage blanc',
  Scholar: 'Érudit',
  Astrologian: 'Astromancien',
  Sage: 'Sage',
  Monk: 'Moine',
  Dragoon: 'Chevalier dragon',
  Ninja: 'Ninja',
  Samurai: 'Samouraï',
  Reaper: 'Faucheur',
  Viper: 'Rôdeur vipère',
  Bard: 'Barde',
  Machinist: 'Machiniste',
  Dancer: 'Danseur',
  'Black Mage': 'Mage noir',
  Summoner: 'Invocateur',
  'Red Mage': 'Mage rouge',
  Pictomancer: 'Pictomancien',
  'Blue Mage': 'Mage bleu',
  Carpenter: 'Menuisier',
  Blacksmith: 'Forgeron',
  Armorer: 'Armurier',
  Goldsmith: 'Orfèvre',
  Leatherworker: 'Tanneur',
  Weaver: 'Couturier',
  Alchemist: 'Alchimiste',
  Culinarian: 'Cuisinier',
  Miner: 'Mineur',
  Botanist: 'Botaniste',
  Fisher: 'Pêcheur',
}

/** Niveaux de toutes les classes, groupés visuellement par rôle — les icônes
 *  du Lodestone parlent d'elles-mêmes, pas de libellés. */
function CharStats({ profile }: { profile: CharProfile }) {
  const { lang, t } = useI18n()
  const roles: { role: string; jobs: CharProfile['jobs'] }[] = []
  for (const job of profile.jobs) {
    const entry = roles.find((r) => r.role === job.role)
    if (entry) entry.jobs.push(job)
    else roles.push({ role: job.role, jobs: [job] })
  }
  if (profile.jobs.length === 0) return null
  return (
    <div className="char-jobs">
      {roles.map(({ role, jobs }) => (
        <span key={role} className="char-jobs-row">
          {jobs.map((j) => (
            <span
              key={j.name}
              className={`job-tile ${j.level >= 100 ? 'is-max' : ''} ${j.level === 0 ? 'is-none' : ''}`}
              title={`${lang === 'fr' ? (JOB_NAMES_FR[j.name] ?? j.name) : j.name} — ${
                j.level > 0 ? t('jobLevel', { n: j.level }) : t('jobLocked')
              }`}
            >
              <img src={j.icon} alt="" width={26} height={26} loading="lazy" onError={onItemImgError} />
              <i>{j.level > 0 ? j.level : '—'}</i>
            </span>
          ))}
        </span>
      ))}
    </div>
  )
}

/** Icône du prérequis d'une source (monnaie ou type de contenu), si connue. */
function SourceIcon({ s }: { s: { type: string; text: string; textEn: string } }) {
  const icon = sourceIcon(s)
  if (!icon) return null
  return (
    <img
      className="src-icon"
      src={icon}
      alt=""
      width={18}
      height={18}
      loading="lazy"
      onError={onItemImgError}
    />
  )
}

function ItemPanel({
  item,
  owned,
  readOnly,
  onToggle,
  onClose,
  pieceOwned,
  onTogglePiece,
}: {
  item: Item
  owned: boolean
  readOnly?: boolean
  onToggle: () => void
  onClose: () => void
  /** Tenues : pièces possédées + coche pièce par pièce. */
  pieceOwned?: Set<number>
  onTogglePiece?: (id: number) => void
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
        <ul className={`panel-pieces ${pieceOwned ? 'panel-pieces-check' : ''}`}>
          {item.pieces.map((p) => {
            // L'ensemble coché en bloc vaut possession de chaque pièce.
            const hasPiece = owned || (pieceOwned?.has(p.id) ?? false)
            if (!pieceOwned) return <li key={p.id}>{lang === 'fr' ? p.name : p.nameEn}</li>
            return (
              <li key={p.id}>
                <button
                  className={`piece-row ${hasPiece ? 'is-owned' : ''}`}
                  disabled={!onTogglePiece}
                  onClick={() => onTogglePiece?.(p.id)}
                >
                  <span className={`checklist-box ${hasPiece ? 'is-owned' : ''}`}>
                    {hasPiece ? '\u2713' : ''}
                  </span>
                  {lang === 'fr' ? p.name : p.nameEn}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {item.sources.length > 0 && (
        <ul className="modal-sources">
          {item.sources.map((s, i) => (
            <li key={i}>
              <TypeChip type={s.type} /> <SourceIcon s={s} /> {localSource(s, lang)}
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
  keepOrder,
}: {
  entries: { key: string; label: string; owned: number; total: number }[]
  /** Totaux réels pour « Tout » (un objet peut compter dans plusieurs catégories). */
  all: { owned: number; total: number }
  active: string | null
  onSelect: (key: string | null) => void
  /** Conserver l'ordre fourni (familles fusionnées) au lieu de l'alphabétique. */
  keepOrder?: boolean
}) {
  const { lang, t } = useI18n()
  // Ordre alphabétique : on cherche une catégorie par son nom, pas par sa taille.
  const sorted = useMemo(
    () => (keepOrder ? entries : [...entries].sort((a, b) => a.label.localeCompare(b.label, lang))),
    [entries, lang, keepOrder],
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
                    <SourceIcon s={it.sources[0]} />
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
  sectionOf,
  sectionOrder,
}: {
  items: Item[]
  ids: Set<number>
  onItemClick: (it: Item) => void
  /** Découpe visuelle de la grille en sections titrées (armoire : armes/armures). */
  sectionOf?: (it: Item) => string
  /** Ordre imposé des sections (défaut : ordre d'apparition). */
  sectionOrder?: string[]
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

  const tiles = (list: Item[]) => (
    <div className="relic-icons mypage-grid">
      {list.map((it) => {
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

  // Sections visuelles (mêmes données) : en-tête + compte par section.
  const grid = sectionOf
    ? (() => {
        const secs = new Map<string, Item[]>()
        for (const it of shown) {
          const s = sectionOf(it)
          const arr = secs.get(s)
          if (arr) arr.push(it)
          else secs.set(s, [it])
        }
        const rank = (l: string) => {
          const i = sectionOrder?.indexOf(l) ?? -1
          return i === -1 ? Number.MAX_SAFE_INTEGER : i
        }
        return (
          <div className="icon-sections">
            {[...secs.entries()]
              .sort((a, b) => rank(a[0]) - rank(b[0]))
              .map(([label, list]) => {
              const owned = list.reduce((sum, it) => sum + (ids.has(it.id) ? 1 : 0), 0)
              return (
                <section key={label}>
                  <header className="album-page-head">
                    <b>{label}</b>
                    <span className={`mypage-count ${owned === list.length ? 'relic-done' : ''}`}>
                      {owned}/{list.length}
                    </span>
                  </header>
                  {tiles(list)}
                </section>
              )
            })}
          </div>
        )
      })()
    : tiles(shown)

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

/** Ordre des colonnes de la bande de pièces : tête, torse, mains, jambes,
 *  pieds — même lecture verticale sur toutes les lignes. Une pièce d'un autre
 *  emplacement (arme, accessoire…) s'ajoute à droite ; un emplacement absent
 *  laisse une case vide pour préserver l'alignement. */
const PIECE_SLOTS = [3, 4, 5, 7, 8]
type Piece = NonNullable<Item['pieces']>[number]
function pieceCellsOf(it: Item): (Piece | null)[] | null {
  const pieces = it.pieces
  if (!pieces?.length) return null
  const used = new Set<number>()
  const cells: (Piece | null)[] = PIECE_SLOTS.map((s) => {
    const p = pieces.find((pc) => pc.slot === s && !used.has(pc.id))
    if (p) used.add(p.id)
    return p ?? null
  })
  for (const p of pieces) if (!used.has(p.id)) cells.push(p)
  return cells
}

function GroupedChecklist({
  items,
  ids,
  onItemClick,
  variant = 'orchestrion',
  groupOrder,
  pieceOwned,
  onPieceToggle,
}: {
  items: Item[]
  ids: Set<number>
  onItemClick: (it: Item) => void
  /** L'orchestrion affiche le rouleau à droite ; les autres, leur propre icône à gauche. */
  variant?: 'orchestrion' | 'icon'
  /** Ordre imposé des groupes (défaut : alphabétique). */
  groupOrder?: string[]
  /** Tenues : pièces possédées — active la bande d'icônes par emplacement et le chip « 3/6 ». */
  pieceOwned?: Set<number>
  onPieceToggle?: (it: Item, id: number) => void
}) {
  const { lang } = useI18n()
  const [cat, setCat] = useState<string | null>(null)
  // Les numéros sont des chaînes (« 087 »), et les rouleaux sans numéro
  // portent « — » : Number() donnerait NaN et casserait le tri. Ordre
  // croissant, les sans-numéro à la fin.
  const numOf = (it: Item) => {
    const n = parseInt(String(it.num ?? ''), 10)
    return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER
  }
  const allGroups = useMemo(() => {
    const map = new Map<string, Item[]>()
    for (const it of [...items].sort((a, b) => numOf(a) - numOf(b) || a.order - b.order)) {
      const g = (lang === 'fr' ? it.group : it.groupEn) ?? ''
      const arr = map.get(g)
      if (arr) arr.push(it)
      else map.set(g, [it])
    }
    const rank = (g: string) => {
      const i = groupOrder?.indexOf(g) ?? -1
      return i === -1 ? Number.MAX_SAFE_INTEGER : i
    }
    return [...map.entries()].sort(
      (a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0], lang),
    )
  }, [items, lang, groupOrder])

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
          keepOrder={!!groupOrder}
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
                const cells = pieceOwned ? pieceCellsOf(it) : null
                return (
                  <li key={it.id}>
                    <button
                      className={`checklist-row ${has ? 'is-owned' : ''} ${cells ? 'has-pieces' : ''}`}
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
                        <span className="checklist-num">
                          {/^\d+$/.test(String(it.num)) ? String(it.num).padStart(3, '0') : '—'}
                        </span>
                      )}
                      <span
                        className="checklist-name"
                        title={it.itemName ? localItemName(it, lang) : undefined}
                      >
                        {localName(it, lang)}
                      </span>
                      {cells && (
                        <span className="piece-strip">
                          {cells.map((pc, i) => {
                            if (!pc || !pc.icon) return <span key={`e${i}`} className="piece-cell is-empty" />
                            // La tenue cochée en bloc vaut possession de tout :
                            // pièces en couleur, plus rien à cocher une par une.
                            const hasPiece = has || pieceOwned!.has(pc.id)
                            return (
                              <span
                                key={pc.id}
                                className={`piece-cell ${hasPiece ? 'is-owned' : 'is-missing'} ${onPieceToggle ? 'is-clickable' : ''}`}
                                title={lang === 'fr' ? pc.name : pc.nameEn}
                                onClick={
                                  onPieceToggle
                                    ? (e) => {
                                        e.stopPropagation()
                                        onPieceToggle(it, pc.id)
                                      }
                                    : undefined
                                }
                              >
                                <img
                                  src={xivIconUrl(pc.icon)}
                                  alt=""
                                  width={26}
                                  height={26}
                                  loading="lazy"
                                  onError={onItemImgError}
                                />
                              </span>
                            )
                          })}
                        </span>
                      )}
                      {it.command && <span className="chip chip-cmd">{it.command}</span>}
                      {it.patch && <span className="chip chip-patch">{it.patch}</span>}
                      {(() => {
                        if (!pieceOwned || !it.pieces?.length || has) return null
                        const owned = it.pieces.filter((pc) => pieceOwned.has(pc.id)).length
                        return (
                          <span
                            className={`chip chip-pieces ${owned > 0 ? 'is-partial' : ''}`}
                            title={`${owned}/${it.pieces.length}`}
                          >
                            {owned}/{it.pieces.length}
                          </span>
                        )
                      })()}
                      <span className="checklist-src">
                        {it.sources[0] && <SourceIcon s={it.sources[0]} />}
                        <span className="checklist-src-text">
                          {it.sources[0]
                            ? lang === 'fr'
                              ? it.sources[0].text
                              : it.sources[0].textEn
                            : // Succès : le descriptif EST la méthode d'obtention.
                              lang === 'fr'
                              ? it.description
                              : it.descriptionEn}
                        </span>
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

/** Onglet « Mode » : accessoires de mode, lunettes et coiffures fusionnés en
 *  une seule liste façon émotes, groupée par sous-collection. Les ids des
 *  trois collections se recoupent : chacune reçoit une plage d'affichage
 *  (rang × 1 000 000) — la sauvegarde repasse aux vrais ids, par collection. */
const FASHION_KINDS: Kind[] = ['fashions', 'facewear', 'hairstyles']
const FASHION_NS = 1_000_000

function FashionEditor({
  db,
  char,
  onSave,
}: {
  db: Db
  char: Character
  onSave: (kind: Kind, ids: number[]) => void
}) {
  const { lang, t } = useI18n()
  const [idsByKind, setIdsByKind] = useState<Partial<Record<Kind, Set<number>>>>(() =>
    Object.fromEntries(FASHION_KINDS.map((k) => [k, new Set(char[k].ids)])),
  )
  const [search, setSearch] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [mode, setMode] = useState<'quick' | 'inspect'>('inspect')
  const [selected, setSelected] = useState<Item | null>(null)
  const saveTimers = useRef<Partial<Record<Kind, ReturnType<typeof setTimeout>>>>({})

  const ids = useMemo(
    () =>
      new Set(
        FASHION_KINDS.flatMap((k, ki) => [...(idsByKind[k] ?? [])].map((id) => ki * FASHION_NS + id)),
      ),
    [idsByKind],
  )

  const all = useMemo(
    () =>
      FASHION_KINDS.flatMap((k, ki) =>
        db[k].map((it) => ({
          ...it,
          id: ki * FASHION_NS + it.id,
          group: kindLabel('fr', k),
          groupEn: kindLabel('en', k),
        })),
      ),
    [db],
  )

  const items = useMemo(() => {
    const q = search.trim().toLowerCase()
    return all.filter(
      (it) =>
        (!q || it.name.toLowerCase().includes(q) || it.nameEn.toLowerCase().includes(q)) &&
        (!onlyMissing || !ids.has(it.id)),
    )
  }, [all, search, onlyMissing, ids])

  function toggle(displayId: number) {
    const ki = Math.floor(displayId / FASHION_NS)
    const k = FASHION_KINDS[ki]
    const real = displayId % FASHION_NS
    setIdsByKind((prev) => {
      const next = new Set(prev[k])
      if (next.has(real)) next.delete(real)
      else next.add(real)
      const timers = saveTimers.current
      if (timers[k]) clearTimeout(timers[k])
      timers[k] = setTimeout(() => onSave(k, [...next]), 1200)
      return { ...prev, [k]: next }
    })
  }

  function handleItem(it: Item) {
    if (mode === 'inspect') setSelected(it)
    else toggle(it.id)
  }

  return (
    <div className="mypage-editor">
      <div className="controls editor-controls">
        <input
          className="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchIn', { what: t('fashionFamily') })}
          spellCheck={false}
        />
        <button
          className={`cat-chip ${onlyMissing ? 'is-active' : ''}`}
          onClick={() => setOnlyMissing((v) => !v)}
        >
          {t('onlyMissing')}
        </button>
        <div className="mode-switch">
          <button
            className={`mode-btn ${mode === 'quick' ? 'is-active' : ''}`}
            title={t('modeQuickTitle')}
            onClick={() => setMode('quick')}
          >
            <TabIcon k="quick" /> {t('modeQuick')}
          </button>
          <button
            className={`mode-btn ${mode === 'inspect' ? 'is-active' : ''}`}
            title={t('modeInspectTitle')}
            onClick={() => setMode('inspect')}
          >
            <TabIcon k="inspect" /> {t('modeInspect')}
          </button>
        </div>
      </div>
      <div className="editor-layout">
        <div className="editor-body">
          <GroupedChecklist
            items={items}
            ids={ids}
            onItemClick={handleItem}
            variant="icon"
            groupOrder={FASHION_KINDS.map((k) => kindLabel(lang, k))}
          />
        </div>
        {selected && (
          <ItemPanel
            item={selected}
            owned={ids.has(selected.id)}
            onToggle={() => toggle(selected.id)}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  )
}

function CollectionEditor({
  db,
  kind,
  charId,
  owned,
  pieceOwned,
  readOnly,
  onSave,
  onSavePieces,
}: {
  db: Db
  kind: Kind
  charId: number
  owned: number[]
  /** Tenues : pièces possédées (suivi individuel). */
  pieceOwned?: number[]
  readOnly?: boolean
  onSave: (kind: Kind, ids: number[]) => void
  onSavePieces?: (ids: number[]) => void
}) {
  const { lang, t } = useI18n()
  const [ids, setIds] = useState<Set<number>>(() => new Set(owned))
  const [pieceIds, setPieceIds] = useState<Set<number>>(() => new Set(pieceOwned ?? []))
  const pieceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [search, setSearch] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setIds(new Set(owned))
    setPieceIds(new Set(pieceOwned ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charId, kind])

  function togglePiece(id: number) {
    if (readOnly) return
    setPieceIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      if (pieceTimer.current) clearTimeout(pieceTimer.current)
      pieceTimer.current = setTimeout(() => onSavePieces?.([...next]), 1200)
      return next
    })
  }

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

  /** Bascule vue depuis la fiche : le bouton suit ce qui est AFFICHÉ. Une tenue
   *  possédée seulement parce que toutes ses pièces sont cochées n'est pas dans
   *  `ids` ; sans ce détour, « Retirer » l'ajoutait en base sans rien changer à
   *  l'écran, et le bouton paraissait mort. */
  function toggleShown(it: Item) {
    if (readOnly) return
    if (kind === 'outfits' && !ids.has(it.id) && shownIds.has(it.id)) {
      setPieceIds((prev) => {
        const next = new Set(prev)
        for (const pc of it.pieces ?? []) next.delete(pc.id)
        if (pieceTimer.current) clearTimeout(pieceTimer.current)
        pieceTimer.current = setTimeout(() => onSavePieces?.([...next]), 1200)
        return next
      })
      return
    }
    toggle(it.id)
  }

  /** Tenues : coche/décoche une pièce. Retirer une pièce d'un ensemble coché
   *  en bloc le convertit en pièces individuelles (toutes sauf celle retirée)
   *  au lieu de tout décocher. */
  function togglePieceOf(it: Item, pieceId: number) {
    if (readOnly) return
    if (!ids.has(it.id)) {
      togglePiece(pieceId)
      return
    }
    setIds((prev) => {
      const next = new Set(prev)
      next.delete(it.id)
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => onSave(kind, [...next]), 1200)
      return next
    })
    setPieceIds((prev) => {
      const next = new Set(prev)
      for (const pc of it.pieces ?? []) if (pc.id !== pieceId) next.add(pc.id)
      next.delete(pieceId)
      if (pieceTimer.current) clearTimeout(pieceTimer.current)
      pieceTimer.current = setTimeout(() => onSavePieces?.([...next]), 1200)
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

  // Tenues : un ensemble dont toutes les pièces locales sont cochées
  // s'affiche possédé sans attendre le serveur (même règle que le worker).
  const shownIds = useMemo(() => {
    if (kind !== 'outfits') return ids
    const s = new Set(ids)
    for (const it of db.outfits) {
      if ((it.pieces?.length ?? 0) > 0 && it.pieces!.every((pc) => pieceIds.has(pc.id))) s.add(it.id)
    }
    return s
  }, [ids, pieceIds, db, kind])

  const items = useMemo(() => {
    const q = search.trim().toLowerCase()
    const base = db[kind].filter(
      (it) =>
        (!q ||
          it.name.toLowerCase().includes(q) ||
          it.nameEn.toLowerCase().includes(q) ||
          it.description.toLowerCase().includes(q) ||
          it.descriptionEn.toLowerCase().includes(q)) &&
        (!onlyMissing || !shownIds.has(it.id)),
    )
    // Tenues, bardes, montures, mascottes : classées par méthode d'obtention —
    // le rail de gauche sert de tri/filtre.
    if (
      kind === 'outfits' ||
      kind === 'bardings' ||
      kind === 'mounts' ||
      kind === 'minions' ||
      kind === 'frames'
    )
      return base.map((it) => ({
        ...it,
        group: typeLabel(it.sources[0]?.type ?? 'Other', 'fr'),
        groupEn: typeLabel(it.sources[0]?.type ?? 'Other', 'en'),
      }))
    // Succès : le rail regroupe par type (Bataille, Quêtes…), la catégorie
    // fine (74 entrées) resterait illisible.
    if (kind === 'achievements')
      return base.map((it) => ({
        ...it,
        group: it.achType ?? 'Autre',
        groupEn: it.achTypeEn ?? 'Other',
      }))
    return base
  }, [db, kind, search, onlyMissing, shownIds])

  // Points de succès : possédés / total, calculés depuis le catalogue.
  const achPts = useMemo(() => {
    if (kind !== 'achievements') return null
    let own = 0
    let tot = 0
    for (const it of db.achievements) {
      tot += it.points ?? 0
      if (ids.has(it.id)) own += it.points ?? 0
    }
    return { own, tot }
  }, [db, kind, ids])

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
        {achPts && (
          <span className="chip chip-type ach-points" title={t('achPoints', { n: achPts.own })}>
            🏆 {t('achPointsChip', { a: achPts.own.toLocaleString(lang), b: achPts.tot.toLocaleString(lang) })}
          </span>
        )}
        {!readOnly && (
          <div className="mode-switch">
            <button
              className={`mode-btn ${mode === 'quick' ? 'is-active' : ''}`}
              title={t('modeQuickTitle')}
              onClick={() => setMode('quick')}
            >
              <TabIcon k="quick" /> {t('modeQuick')}
            </button>
            <button
              className={`mode-btn ${mode === 'inspect' ? 'is-active' : ''}`}
              title={t('modeInspectTitle')}
              onClick={() => setMode('inspect')}
            >
              <TabIcon k="inspect" /> {t('modeInspect')}
            </button>
          </div>
        )}
      </div>
      <div className="editor-layout">
        <div className="editor-body">
          {kind === 'cards' ? (
            <CardAlbum allItems={db[kind]} visible={visible} ids={shownIds} onItemClick={handleItem} />
          ) : kind === 'orchestrions' ? (
            <GroupedChecklist items={items} ids={shownIds} onItemClick={handleItem} />
          ) : kind === 'spells' ? (
            <SpellBook items={items} ids={shownIds} onItemClick={handleItem} />
          ) : LIST_KINDS.includes(kind) ? (
            <GroupedChecklist
              items={items}
              ids={shownIds}
              onItemClick={handleItem}
              variant="icon"
              pieceOwned={kind === 'outfits' ? pieceIds : undefined}
              onPieceToggle={kind === 'outfits' && !readOnly ? togglePieceOf : undefined}
            />
          ) : (
            <IconGrid
              items={items}
              ids={shownIds}
              onItemClick={handleItem}
              sectionOf={kind === 'armoires' ? (it) => t(armoireSectionKey(it)) : undefined}
              sectionOrder={
                kind === 'armoires'
                  ? [t('armoireArmor'), t('armoireAcc'), t('armoireWeapons'), t('armoireTools')]
                  : undefined
              }
            />
          )}
        </div>
        {selected && (
          <ItemPanel
            item={selected}
            owned={shownIds.has(selected.id)}
            readOnly={readOnly}
            onToggle={() => toggleShown(selected)}
            onClose={() => setSelected(null)}
            pieceOwned={kind === 'outfits' ? pieceIds : undefined}
            onTogglePiece={
              kind === 'outfits' && !readOnly ? (pid: number) => togglePieceOf(selected, pid) : undefined
            }
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
  // Assistant de liaison : recherche du perso par nom + serveur.
  const [searchName, setSearchName] = useState('')
  const [searchServer, setSearchServer] = useState('')
  const [searchResults, setSearchResults] = useState<CharSearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState(false)
  // Synchro Lodestone forcée (déclaré ici : MyPage a des retours anticipés).
  const [syncing, setSyncing] = useState(false)
  // Import FFXIV Collect à la demande (même contrainte de déclaration).
  const [importing, setImporting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [char, setChar] = useState<Character | null>(null)
  // Les reliques ne sont pas un « kind » (données à part), mais elles ont leur
  // onglet ici : c'est la page où l'on suit sa propre progression.
  // L'onglet vit dans le hash (#jtab=…) pour survivre aux rechargements.
  const [kind, setKind] = useState<Kind | 'relics' | 'fashion'>(() => {
    const k = readHashParam('jtab')
    // Anciens liens vers les trois collections désormais fusionnées sous « Mode ».
    if ((FASHION_KINDS as string[]).includes(k ?? '')) return 'fashion'
    if (k === 'relics' || k === 'fashion' || (KINDS as string[]).includes(k ?? ''))
      return k as Kind | 'relics' | 'fashion'
    return 'cards'
  })
  useEffect(() => {
    setHashParam('jtab', kind === 'cards' ? null : kind)
  }, [kind])
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
    const n = Number(lsGet(ACTIVE_CHAR_KEY))
    return Number.isInteger(n) && n > 0 ? n : null
  })
  const verified = verifiedList.find((b) => b.charId === activeId) ?? verifiedList[0]
  const pending = auth.bindings.find((b) => !b.verified)
  const [adding, setAdding] = useState(false)
  // Fiches des persos vérifiés : sert au sélecteur (nom + portrait).
  const [chars, setChars] = useState<Record<number, Character>>({})

  useEffect(() => {
    if (verified) lsSet(ACTIVE_CHAR_KEY, String(verified.charId))
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

  async function doSearch() {
    if (!auth.token || searchName.trim().length < 2) return
    setSearching(true)
    setSearchResults(null)
    setNotice(null)
    try {
      const r = await apiSearchCharacter(auth.token, searchName.trim(), searchServer.trim() || undefined)
      setSearchResults(r.results)
    } catch {
      setNotice(t('searchCharError'))
    }
    setSearching(false)
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
        // « Ah, je vois que tu as une fiche FFXIV Collect — je récupère ? »
        try {
          const found = await fetchCollectDoc(charId)
          if (found && found.total > 0 && auth.token && confirm(t('collectOffer', { n: found.total }))) {
            const added = await pushCollectSync(charId, found.doc, auth.token)
            setNotice(added > 0 ? t('collectSynced', { n: added }) : t('collectNothingNew'))
            setChar(await fetchCharacter(charId))
          }
        } catch {
          // Collect indisponible : l'amorçage standard a déjà fait le minimum.
        }
      }
    } catch (e) {
      setNotice((e as Error).message === 'conflict' ? t('bindConflict') : t('bindError'))
    } finally {
      setBusy(false)
    }
  }

  // Synchro forcée depuis le Lodestone : au plus une fois par jour (le worker
  // fait respecter la limite — le bouton se grise selon nextForceAt).
  async function forceSync() {
    if (!verified) return
    setSyncing(true)
    try {
      const before = char?.nextForceAt ?? 0
      const fresh = await fetchCharacter(verified.charId, true)
      setChar(fresh)
      showToast(t(fresh.nextForceAt > before ? 'syncForceDone' : 'syncForceAlready'))
    } catch {
      setNotice(t('saveError'))
    }
    setSyncing(false)
  }

  // Import FFXIV Collect à la demande : rapatrie ce qui est coché là-bas
  // (union côté worker, ne retire jamais rien). Utile après coup — p. ex.
  // récupérer ses succès sur un perso vérifié avant leur arrivée ici.
  async function collectImport() {
    if (!verified || !auth.token) return
    setImporting(true)
    try {
      const found = await fetchCollectDoc(verified.charId)
      if (!found || found.total === 0) {
        showToast(t('collectNone'))
      } else {
        const added = await pushCollectSync(verified.charId, found.doc, auth.token)
        showToast(added > 0 ? t('collectSynced', { n: added }) : t('collectNothingNew'))
        if (added > 0) setChar(await fetchCharacter(verified.charId))
      }
    } catch {
      setNotice(t('saveError'))
    }
    setImporting(false)
  }

  async function doUnbind(charId: number, name: string) {
    if (!confirm(t('unbindConfirm', { name }))) return
    setBusy(true)
    setNotice(null)
    try {
      await auth.unbind(charId)
      setActiveId(null)
      lsRemove(ACTIVE_CHAR_KEY)
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

  async function save(k: Kind | 'relics' | 'outfitpieces', ids: number[]) {
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
          {/* Étapier : 1 connexion (faite) · 2 trouver son perso · 3 vérifier */}
          <ol className="onboard-steps">
            <li className="is-done">
              <span className="onboard-num">✓</span> {t('onboardStep1')}
            </li>
            <li className={pending ? 'is-done' : 'is-active'}>
              <span className="onboard-num">{pending ? '✓' : '2'}</span> {t('onboardStep2')}
            </li>
            <li className={pending ? 'is-active' : ''}>
              <span className="onboard-num">3</span> {t('onboardStep3')}
            </li>
          </ol>
          {!pending && (
            <>
              <p className="modal-muted">{t('searchCharIntro')}</p>
              <div className="controls">
                <input
                  className="search"
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && doSearch()}
                  placeholder={t('searchCharName')}
                  spellCheck={false}
                />
                <input
                  className="search onboard-server"
                  value={searchServer}
                  onChange={(e) => setSearchServer(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && doSearch()}
                  placeholder={t('searchCharServer')}
                  spellCheck={false}
                />
                <button
                  className="btn btn-primary"
                  disabled={searching || searchName.trim().length < 2}
                  onClick={() => void doSearch()}
                >
                  <TabIcon k="inspect" /> {t('searchCharGo')}
                </button>
              </div>
              {searching && <p className="modal-muted">…</p>}
              {searchResults !== null && searchResults.length === 0 && (
                <p className="modal-muted">{t('searchCharNone')}</p>
              )}
              {searchResults !== null && searchResults.length > 0 && (
                <div className="char-results">
                  {searchResults.map((r) => (
                    <button
                      key={r.id}
                      className="char-result"
                      disabled={busy}
                      onClick={() => doBind(r.id)}
                    >
                      <img src={r.avatar} alt="" width={44} height={44} onError={onAvatarImgError} />
                      <span className="char-result-id">
                        <b>{r.name}</b>
                        <small>
                          {r.server}
                          {r.dc ? ` [${r.dc}]` : ''}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <details className="onboard-fallback">
                <summary>{t('searchCharFallback')}</summary>
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
              </details>
            </>
          )}
          {pending && (
            <>
              <ol className="onboard-verify">
                <li>
                  {t('verifyStepCopy')} <code className="bind-code">{pending.code}</code>{' '}
                  <button
                    className="btn btn-ghost btn-mini"
                    onClick={() => {
                      void navigator.clipboard?.writeText(pending.code ?? '')
                      showToast(t('copied'))
                    }}
                  >
                    <TabIcon k="share" /> {t('contactCopy')}
                  </button>
                </li>
                <li>
                  {t('verifyStepOpen')}{' '}
                  <a
                    href="https://eu.finalfantasyxiv.com/lodestone/my/setting/profile/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t('bindProfileLink')}
                  </a>
                </li>
                <li>{t('verifyStepPaste')}</li>
              </ol>
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
            <div className="mypage-char-layout">
              <img
                className="mypage-portrait"
                src={char.portrait || char.avatar}
                alt=""
                onError={onAvatarImgError}
              />
              <div className="mypage-char-main">
                <div className="player-head mypage-char-head">
                  <div className="player-id">
                    <span className="player-name mypage-char-name">
                      {char.name}
                      {char.profile?.title && (
                        <span className="char-title">
                          « {(lang === 'fr' && char.profile.titleFr) || char.profile.title} »
                        </span>
                      )}
                      <span className="chip chip-owned">
                        <GiCheckMark /> {t('bindVerifiedChip')}
                      </span>
                      {char.profile?.grandCompany && (
                        <span className="char-org" title={t('factGC')}>
                          {char.profile.gcIcon && (
                            <img src={char.profile.gcIcon} alt="" width={20} height={20} />
                          )}
                          {(lang === 'fr' && char.profile.grandCompanyFr) ||
                            char.profile.grandCompany}
                        </span>
                      )}
                      {char.profile?.freeCompany && (
                        <span className="char-org" title={t('factFC')}>
                          {(char.profile.fcCrest?.length ?? 0) > 0 && (
                            <span className="fc-crest">
                              {char.profile.fcCrest!.map((u) => (
                                <img key={u} src={u} alt="" />
                              ))}
                            </span>
                          )}
                          {char.profile.freeCompany}
                        </span>
                      )}
                    </span>
                    <span className="player-server">
                      {char.server}
                      {char.dataCenter ? ` [${char.dataCenter}]` : ''}
                    </span>
                  </div>
                  <span className="mypage-char-actions">
                    <a
                      className="btn btn-ghost btn-mini btn-icon-only"
                      href={`https://eu.finalfantasyxiv.com/lodestone/character/${char.id}/`}
                      target="_blank"
                      rel="noreferrer"
                      title={t('viewOnLodestone')}
                    >
                      <TabIcon k="lodestone" />
                    </a>
                    <button
                      className="btn btn-ghost btn-mini"
                      disabled={syncing || Date.now() < char.nextForceAt}
                      title={
                        Date.now() < char.nextForceAt
                          ? t('syncForceCooldown', {
                              h: Math.max(1, Math.ceil((char.nextForceAt - Date.now()) / 3_600_000)),
                            })
                          : t('syncForceTitle')
                      }
                      onClick={() => void forceSync()}
                    >
                      {syncing ? '…' : <><TabIcon k="sync" /> {t('syncForce')}</>}
                    </button>
                    <button
                      className="btn btn-ghost btn-mini"
                      disabled={importing}
                      title={t('collectImportTitle')}
                      onClick={() => void collectImport()}
                    >
                      {importing ? '…' : <><TabIcon k="collect" /> Collect</>}
                    </button>
                    <button
                      className="btn btn-ghost btn-mini mypage-unbind"
                      onClick={() => doUnbind(char.id, char.name)}
                    >
                      <TabIcon k="unlink" /> {t('unbindChar')}
                    </button>
                  </span>
                </div>
                {char.profile && <CharStats profile={char.profile} />}
                <div className="meter-grid mypage-meters">
                  {KINDS.filter((k) => k !== 'facewear' && k !== 'hairstyles').map((k) => {
                    // « Mode » : accessoires + lunettes + coiffures fusionnés.
                    const merged = k === 'fashions'
                    const count = merged
                      ? char.fashions.count + char.facewear.count + char.hairstyles.count
                      : char[k].count
                    const total = merged
                      ? char.fashions.total + char.facewear.total + char.hairstyles.total
                      : char[k].total
                    return (
                      <Meter
                        key={k}
                        label={merged ? t('fashionFamily') : kindLabel(lang, k, 'short')}
                        count={count}
                        total={total}
                        colored
                      />
                    )
                  })}
                  {relicDb && (
                    <Meter
                      label={t('relicsTab')}
                      count={char.relicIds.length}
                      total={relicDb.relics.length}
                      colored
                    />
                  )}
                </div>
                <p className="mypage-note">
                  <GiPadlock /> {t('myPageAutoNote')}
                </p>
              </div>
            </div>
          </section>

          <nav className="kind-bar mypage-tabs">
            {KIND_FAMILIES.map((fam) =>
              fam.merged ? (
                <span key={fam.key} className="kind-family">
                  <button
                    className={`kind-btn ${kind === 'fashion' ? 'is-active' : ''}`}
                    onClick={() => setKind('fashion')}
                  >
                    <TabIcon k="fashion" /> {t('fashionFamily')}
                  </button>
                </span>
              ) : (
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
                        <TabIcon k={k} />
                        {locked && <GiPadlock className="tab-lock" />} {kindLabel(lang, k, 'short')}
                      </button>
                    )
                  })}
                </span>
              ),
            )}
            <span className="kind-family">
              <button
                className={`kind-btn ${kind === 'relics' ? 'is-active' : ''}`}
                onClick={() => setKind('relics')}
              >
                <TabIcon k="relics" /> {t('relicsTab')}
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
          ) : kind === 'fashion' ? (
            <FashionEditor key={`${verified.charId}-fashion`} db={db} char={char} onSave={save} />
          ) : (
            <CollectionEditor
              key={`${verified.charId}-${kind}`}
              db={db}
              kind={kind}
              charId={verified.charId}
              owned={char[kind].ids}
              pieceOwned={kind === 'outfits' ? char.outfitPieceIds : undefined}
              readOnly={!EDITABLE.includes(kind)}
              onSave={save}
              onSavePieces={kind === 'outfits' ? (ids) => save('outfitpieces', ids) : undefined}
            />
          )}
        </>
      )}
    </div>
  )
}
