import { useEffect, useMemo, useRef, useState } from 'react'
import {
  KINDS,
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
  GiMagnifyingGlass,
  GiPadlock,
  GiPowerLightning,
} from 'react-icons/gi'
import type { Db, Member } from '../store'
import { Meter, TypeChip, onItemImgError } from '../ui'
import { localSource } from '../i18n'

// Collections modifiables depuis « Ma Page » (le reste vient du Lodestone).
const EDITABLE: Kind[] = ['cards', 'fashions', 'orchestrions', 'spells']

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
  const { lang, t } = useI18n()
  const [srcType, setSrcType] = useState<string | null>(null)
  const pages = useMemo(() => {
    const sorted = [...allItems].sort((a, b) => a.order - b.order)
    const out: Item[][] = []
    for (let i = 0; i < sorted.length; i += 30) out.push(sorted.slice(i, i + 30))
    return out
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
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total)
  }, [allItems, ids])

  const shows = (it: Item) =>
    visible.has(it.id) && (!srcType || it.sources.some((s) => s.type === srcType))

  return (
    <div className="album-wrap">
      <div className="cat-filter">
        <button className={`cat-chip ${srcType === null ? 'is-active' : ''}`} onClick={() => setSrcType(null)}>
          {t('scopeAll')}
        </button>
        {srcTypes.map(([type, { total, owned }]) => (
          <button
            key={type}
            className={`cat-chip ${srcType === type ? 'is-active' : ''} ${owned === total ? 'is-done' : ''}`}
            onClick={() => setSrcType(srcType === type ? null : type)}
          >
            {typeLabel(type, lang)}
            <span className="cat-chip-count">
              {owned}/{total}
            </span>
          </button>
        ))}
      </div>
      <div className="album">
      {pages.map((page, i) => {
        const shown = page.filter((it) => shows(it))
        if (shown.length === 0) return null
        const owned = page.reduce((sum, it) => sum + (ids.has(it.id) ? 1 : 0), 0)
        return (
          <section key={i} className="album-page">
            <header className="album-page-head">
              <b>{i + 1}</b>
              <span className={`mypage-count ${owned === page.length ? 'relic-done' : ''}`}>
                {owned}/{page.length}
              </span>
            </header>
            <div className="album-grid">
              {page.map((it) => {
                if (!shows(it)) return <span key={it.id} className="album-slot" />
                const has = ids.has(it.id)
                return (
                  <button
                    key={it.id}
                    className={`album-card ${has ? 'is-owned' : 'is-missing'}`}
                    title={`${localName(it, lang)} · n°${it.order}${has ? ' ✓' : ''}`}
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

/** Liste groupée par catégorie (orchestrion) : filtres façon Lodestone,
 *  numéro + nom + obtention + rouleau. */
const ROLL_ICON = `${import.meta.env.BASE_URL}assets/roll.webp`

function GroupedChecklist({
  items,
  ids,
  onItemClick,
}: {
  items: Item[]
  ids: Set<number>
  onItemClick: (it: Item) => void
}) {
  const { lang, t } = useI18n()
  const [cat, setCat] = useState<string | null>(null)
  const allGroups = useMemo(() => {
    const map = new Map<string, Item[]>()
    for (const it of [...items].sort((a, b) => Number(a.num ?? a.order) - Number(b.num ?? b.order))) {
      const g = (lang === 'fr' ? it.group : it.groupEn) ?? '—'
      const arr = map.get(g)
      if (arr) arr.push(it)
      else map.set(g, [it])
    }
    return [...map.entries()]
  }, [items, lang])

  const groups = cat ? allGroups.filter(([g]) => g === cat) : allGroups

  return (
    <div className="checklist">
      <div className="cat-filter">
        <button
          className={`cat-chip ${cat === null ? 'is-active' : ''}`}
          onClick={() => setCat(null)}
        >
          {t('scopeAll')}
        </button>
        {allGroups.map(([g, list]) => {
          const owned = list.reduce((sum, it) => sum + (ids.has(it.id) ? 1 : 0), 0)
          return (
            <button
              key={g}
              className={`cat-chip ${cat === g ? 'is-active' : ''} ${owned === list.length ? 'is-done' : ''}`}
              onClick={() => setCat(cat === g ? null : g)}
            >
              {g}
              <span className="cat-chip-count">
                {owned}/{list.length}
              </span>
            </button>
          )
        })}
      </div>
      {groups.map(([group, list]) => {
        const owned = list.reduce((sum, it) => sum + (ids.has(it.id) ? 1 : 0), 0)
        return (
          <section key={group} className="checklist-group">
            <header className="album-page-head">
              <b>{group}</b>
              <span className={`mypage-count ${owned === list.length ? 'relic-done' : ''}`}>
                {owned}/{list.length}
              </span>
            </header>
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
                      {it.num !== undefined && (
                        <span className="checklist-num">{String(it.num).padStart(3, '0')}</span>
                      )}
                      <span className="checklist-name">{localName(it, lang)}</span>
                      {it.patch && <span className="chip chip-patch">{it.patch}</span>}
                      <span className="checklist-src">
                        {it.sources[0] ? (lang === 'fr' ? it.sources[0].text : it.sources[0].textEn) : ''}
                      </span>
                      <img
                        className={`checklist-roll ${has ? '' : 'is-missing'}`}
                        src={ROLL_ICON}
                        alt=""
                        width={26}
                        height={26}
                        loading="lazy"
                      />
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
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
        <div className="mypage-progress">
          <Meter label={kindLabel(lang, kind, 'short')} count={ids.size} total={db[kind].length} />
        </div>
      </div>
      <div className="editor-layout">
        <div className="editor-body">
          {kind === 'cards' ? (
            <CardAlbum allItems={db[kind]} visible={visible} ids={ids} onItemClick={handleItem} />
          ) : kind === 'orchestrions' ? (
            <GroupedChecklist items={items} ids={ids} onItemClick={handleItem} />
          ) : (
            <div className="relic-icons mypage-grid">
              {items.map((it: Item) => {
                const has = ids.has(it.id)
                return (
                  <button
                    key={it.id}
                    className={`relic-icon mypage-tile ${has ? 'is-owned' : 'is-missing'}`}
                    title={`${localName(it, lang)}${has ? ' ✓' : ''}`}
                    onClick={() => handleItem(it)}
                  >
                    <img src={it.icon} alt="" width={40} height={40} loading="lazy" onError={onItemImgError} />
                    {has && <span className="relic-badge">✓</span>}
                  </button>
                )
              })}
            </div>
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
  const [kind, setKind] = useState<Kind>('cards')
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2000)
  }

  const verified = auth.bindings.find((b) => b.verified)
  const pending = auth.bindings.find((b) => !b.verified)

  useEffect(() => {
    if (verified) {
      fetchCharacter(verified.charId)
        .then(setChar)
        .catch(() => setChar(null))
    } else {
      setChar(null)
    }
  }, [verified?.charId]) // eslint-disable-line react-hooks/exhaustive-deps

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
    } catch (e) {
      setNotice((e as Error).message === 'conflict' ? t('bindConflict') : t('bindError'))
    } finally {
      setBusy(false)
    }
  }

  async function save(k: Kind, ids: number[]) {
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

  return (
    <div className="view mypage">
      {toast && <div className="toast">{toast}</div>}
      <div className="mypage-head">
        {auth.user.avatar && <img className="mypage-avatar" src={auth.user.avatar} alt="" width={36} height={36} />}
        <b>{auth.user.name}</b>
        <button className="btn btn-ghost btn-mini" onClick={auth.logout}>
          {t('logout')}
        </button>
      </div>

      {!verified && (
        <section className="relic-series mypage-bind">
          <h3 className="relic-series-name">{t('bindTitle')}</h3>
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
            <div className="player-head">
              <img className="player-avatar" src={char.avatar} alt="" width={38} height={38} />
              <div className="player-id">
                <span className="player-name">{char.name}</span>
                <span className="player-server">{char.server} ✓</span>
              </div>
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
            <p className="modal-muted">{t('myPageAutoNote')}</p>
          </section>

          <div className="tabs mypage-tabs">
            {KINDS.map((k) => {
              const locked = !EDITABLE.includes(k)
              return (
                <button
                  key={k}
                  className={`tab ${kind === k ? 'is-active' : ''}`}
                  title={locked ? t('myPageReadOnly') : undefined}
                  onClick={() => setKind(k)}
                >
                  {locked && <GiPadlock className="tab-lock" />} {kindLabel(lang, k, 'short')}
                </button>
              )
            })}
          </div>
          {notice && <p className="notice">{notice}</p>}
          <CollectionEditor
            key={`${verified.charId}-${kind}`}
            db={db}
            kind={kind}
            charId={verified.charId}
            owned={char[kind].ids}
            readOnly={!EDITABLE.includes(kind)}
            onSave={save}
          />
        </>
      )}
    </div>
  )
}
