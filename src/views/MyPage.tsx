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
import type { Db, Member } from '../store'
import { Meter, onItemImgError } from '../ui'

// Collections modifiables depuis « Ma Page » (le reste vient du Lodestone).
const EDITABLE: Kind[] = ['cards', 'fashions', 'orchestrions', 'spells']

type Auth = ReturnType<typeof useAuth>

/** Album de cartes façon jeu : pages de 30, illustrations, clic pour cocher. */
function CardAlbum({
  items,
  ids,
  toggle,
}: {
  items: Item[]
  ids: Set<number>
  toggle: (id: number) => void
}) {
  const { lang, t } = useI18n()
  const pages = useMemo(() => {
    const sorted = [...items].sort((a, b) => a.order - b.order)
    const out: Item[][] = []
    for (let i = 0; i < sorted.length; i += 30) out.push(sorted.slice(i, i + 30))
    return out
  }, [items])

  return (
    <div className="album">
      {pages.map((page, i) => {
        const owned = page.reduce((sum, it) => sum + (ids.has(it.id) ? 1 : 0), 0)
        if (page.length === 0) return null
        return (
          <section key={i} className="album-page">
            <header className="album-page-head">
              <b>{t('albumPage', { n: Math.floor((page[0].order - 1) / 30) + 1 })}</b>
              <span className={`mypage-count ${owned === page.length ? 'relic-done' : ''}`}>
                {owned}/{page.length}
              </span>
            </header>
            <div className="album-grid">
              {page.map((it) => {
                const has = ids.has(it.id)
                return (
                  <button
                    key={it.id}
                    className={`album-card ${has ? 'is-owned' : 'is-missing'}`}
                    title={`${localName(it, lang)} · n°${it.order}${has ? ' ✓' : ''}`}
                    onClick={() => toggle(it.id)}
                  >
                    <img src={it.image} alt="" loading="lazy" onError={onItemImgError} />
                    {has && <span className="relic-badge">✓</span>}
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

/** Liste groupée par catégorie (orchestrion) : nom + obtention + coche. */
function GroupedChecklist({
  items,
  ids,
  toggle,
}: {
  items: Item[]
  ids: Set<number>
  toggle: (id: number) => void
}) {
  const { lang } = useI18n()
  const groups = useMemo(() => {
    const map = new Map<string, Item[]>()
    for (const it of [...items].sort((a, b) => Number(a.num ?? a.order) - Number(b.num ?? b.order))) {
      const g = (lang === 'fr' ? it.group : it.groupEn) ?? '—'
      const arr = map.get(g)
      if (arr) arr.push(it)
      else map.set(g, [it])
    }
    return [...map.entries()]
  }, [items, lang])

  return (
    <div className="checklist">
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
                      onClick={() => toggle(it.id)}
                    >
                      <span className={`checklist-box ${has ? 'is-owned' : ''}`}>
                        {has ? '✓' : ''}
                      </span>
                      <span className="checklist-name">{localName(it, lang)}</span>
                      {it.patch && <span className="chip chip-patch">{it.patch}</span>}
                      <span className="checklist-src">
                        {it.sources[0] ? (lang === 'fr' ? it.sources[0].text : it.sources[0].textEn) : ''}
                      </span>
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
  onSave,
}: {
  db: Db
  kind: Kind
  charId: number
  owned: number[]
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
    setIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => onSave(kind, [...next]), 1200)
      return next
    })
  }

  const items = useMemo(() => {
    const q = search.trim().toLowerCase()
    return db[kind].filter(
      (it) =>
        (!q || it.name.toLowerCase().includes(q) || it.nameEn.toLowerCase().includes(q)) &&
        (!onlyMissing || !ids.has(it.id)),
    )
  }, [db, kind, search, onlyMissing, ids])

  return (
    <div className="mypage-editor">
      <div className="controls">
        <input
          className="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchIn', { what: kindLabel(lang, kind) })}
          spellCheck={false}
        />
        <label className="check">
          <input
            type="checkbox"
            checked={onlyMissing}
            onChange={(e) => setOnlyMissing(e.target.checked)}
          />
          {t('onlyMissing')}
        </label>
        <div className="mypage-progress">
          <Meter label={kindLabel(lang, kind, 'short')} count={ids.size} total={db[kind].length} />
        </div>
      </div>
      {kind === 'cards' ? (
        <CardAlbum items={items} ids={ids} toggle={toggle} />
      ) : kind === 'orchestrions' ? (
        <GroupedChecklist items={items} ids={ids} toggle={toggle} />
      ) : (
        <div className="relic-icons mypage-grid">
          {items.map((it: Item) => {
            const has = ids.has(it.id)
            return (
              <button
                key={it.id}
                className={`relic-icon mypage-tile ${has ? 'is-owned' : 'is-missing'}`}
                title={`${localName(it, lang)}${has ? ' ✓' : ''}`}
                onClick={() => toggle(it.id)}
              >
                <img src={it.icon} alt="" width={40} height={40} loading="lazy" onError={onItemImgError} />
                {has && <span className="relic-badge">✓</span>}
              </button>
            )
          })}
        </div>
      )}
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
  const [savedAt, setSavedAt] = useState<number | null>(null)

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
      setSavedAt(Date.now())
    } catch {
      setNotice(t('saveError'))
    }
  }

  return (
    <div className="view mypage">
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
            {EDITABLE.map((k) => (
              <button key={k} className={`tab ${kind === k ? 'is-active' : ''}`} onClick={() => setKind(k)}>
                {kindLabel(lang, k, 'short')}
              </button>
            ))}
          </div>
          {savedAt && <p className="mypage-saved">{t('saved')}</p>}
          {notice && <p className="notice">{notice}</p>}
          <CollectionEditor
            key={`${verified.charId}-${kind}`}
            db={db}
            kind={kind}
            charId={verified.charId}
            owned={char[kind].ids}
            onSave={save}
          />
        </>
      )}
    </div>
  )
}
