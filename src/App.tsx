import { useEffect, useMemo, useRef, useState } from 'react'
import { GiCharacter } from 'react-icons/gi'
import { KINDS, KIND_FAMILIES, type Kind } from './api'
import { useAuth } from './auth'
import { useDigest } from './digest'
import { currentGroupHash, loadGroups, saveGroups, switchToGroup, type SavedGroup } from './groups'
import { MyPage } from './views/MyPage'
import { detectLang, kindLabel, persistLang, translate, LangContext, type Lang } from './i18n'
import { ItemModal, type ShownItem } from './ItemModal'
import { useRoom, type LocalState } from './room'
import { RosterBar } from './RosterBar'
import {
  readHashRoomId,
  setHashParam,
  useDb,
  useOwnedSets,
  useReadyMembers,
  useRelicDb,
  useRoster,
} from './store'
import { Matrix } from './views/Matrix'
import { Planning } from './views/Planning'
import { Relics } from './views/Relics'

type Tab = 'planning' | Kind | 'relics' | 'mypage'

export default function App() {
  // Langue (FR/EN) — détectée puis mémorisée par navigateur
  const [lang, setLangState] = useState<Lang>(detectLang)
  const setLang = (l: Lang) => {
    setLangState(l)
    persistLang(l)
  }
  const t = useMemo(
    () => (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
      translate(lang, key, vars),
    [lang],
  )
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const { db, error: dbError } = useDb()
  const relicDb = useRelicDb()

  // Session (capture #login=… et restaure le hash de groupe AVANT sa lecture)
  const auth = useAuth()

  // Salon de synchro (lu depuis le lien avant tout le reste : il pilote le hash)
  const [roomId, setRoomId] = useState<string | null>(() => readHashRoomId())
  const hasRoom = roomId !== null

  const { members, roster, add, remove, refresh, applyRemoteRoster } = useRoster(hasRoom)
  const ready = useReadyMembers(members)
  const ownedSets = useOwnedSets(ready)

  const stateRef = useRef<LocalState>({ roster })
  stateRef.current = { roster }
  const room = useRoom(roomId, setRoomId, stateRef, applyRemoteRoster)

  // Toute évolution locale du roster part vers le salon après un court délai.
  useEffect(() => room.schedulePush(), [roster.t, room.schedulePush]) // eslint-disable-line react-hooks/exhaustive-deps

  // Nettoyage des anciens liens : le paramètre o= (coches manuelles) n'existe plus.
  useEffect(() => {
    setHashParam('o', null)
  }, [])

  const [tab, setTab] = useState<Tab>('planning')
  // Dernière collection consultée : cliquer sur « Collections » y revient.
  const [collectionTab, setCollectionTab] = useState<Kind>('mounts')
  const [copied, setCopied] = useState(false)
  const [shownItem, setShownItem] = useState<ShownItem | null>(null)

  // Multi-groupes : registre local de groupes nommés, bascule par rechargement.
  const [groups, setGroups] = useState<SavedGroup[]>(loadGroups)
  const groupHash = currentGroupHash(roomId, roster.ids)
  const currentGroupIdx = groups.findIndex((g) => g.hash === groupHash)
  function onGroupAction(value: string) {
    if (value === '__save') {
      if (!groupHash) return
      const name = prompt(t('groupNamePrompt'))?.trim()
      if (!name) return
      const next = [...groups.filter((g) => g.hash !== groupHash), { name, hash: groupHash }]
      setGroups(next)
      saveGroups(next)
    } else if (value === '__forget') {
      const next = groups.filter((g) => g.hash !== groupHash)
      setGroups(next)
      saveGroups(next)
    } else {
      const idx = Number(value)
      if (Number.isInteger(idx) && groups[idx] && groups[idx].hash !== groupHash) {
        switchToGroup(groups[idx].hash)
      }
    }
  }

  // « Quoi de neuf depuis la dernière visite »
  const digest = useDigest(ready)

  // « Juste pour moi » : focalise toutes les vues sur un seul perso (choix local).
  const [focusId, setFocusId] = useState<number | null>(() => {
    try {
      const n = Number(localStorage.getItem('ogs.focus.v1'))
      return Number.isInteger(n) && n > 0 ? n : null
    } catch {
      return null
    }
  })
  useEffect(() => {
    try {
      if (focusId) localStorage.setItem('ogs.focus.v1', String(focusId))
      else localStorage.removeItem('ogs.focus.v1')
    } catch {
      // pas de persistance, pas grave
    }
  }, [focusId])
  useEffect(() => {
    if (focusId !== null && members.length > 0 && !members.some((m) => m.id === focusId)) {
      setFocusId(null)
    }
  }, [members, focusId])

  // Présence « ce soir » : les absents sont ignorés par les vues (choix local).
  const [absent, setAbsent] = useState<number[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('ogs.absent.v1') ?? '[]')
      return Array.isArray(parsed) ? parsed.filter((n) => Number.isInteger(n)) : []
    } catch {
      return []
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('ogs.absent.v1', JSON.stringify(absent))
    } catch {
      // pas de persistance, pas grave
    }
  }, [absent])
  const togglePresence = (id: number) =>
    setAbsent((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const activeReady = useMemo(
    () =>
      focusId
        ? ready.filter((m) => m.id === focusId)
        : ready.filter((m) => !absent.includes(m.id)),
    [ready, focusId, absent],
  )

  // Sidepanel replié ? (par défaut : rail pour les gros groupes)
  const [rosterOpen, setRosterOpen] = useState<boolean | null>(null)
  const rosterCollapsed = !(rosterOpen ?? members.length <= 8)

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      prompt(t('copyPrompt'), location.href)
    }
  }

  const syncTitle =
    room.status === 'error'
      ? t('syncErrTitle')
      : `${t('syncOkTitle')}${room.lastSync ? ' ' + t('lastSync', { time: new Date(room.lastSync).toLocaleTimeString() }) : ''}`

  // Treize collections ne tiennent pas dans une pilule d'onglets : la barre du
  // haut ne garde que les grandes sections, la collection se choisit sur une
  // seconde ligne quand on est dans « Collections ».
  const isCollection = (KINDS as string[]).includes(tab)
  const TABS: { id: Tab; label: string }[] = [
    { id: 'planning', label: t('planning') },
    { id: collectionTab, label: t('collections') },
    { id: 'relics', label: t('relicsTab') },
  ]

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <span className="brand-name">OGS</span>
            <span className="brand-sub">Collect</span>
          </div>
          <nav className="tabs">
            {TABS.map((tb) => (
              <button
                key={tb.id}
                className={`tab ${tab === tb.id || (tb.id === collectionTab && isCollection) ? 'is-active' : ''}`}
                onClick={() => setTab(tb.id)}
              >
                {tb.label}
              </button>
            ))}
          </nav>
          <div className="topbar-actions">
            {!auth.user ? (
              <button className="btn btn-ghost account-btn" onClick={auth.login} title={t('loginIntro')}>
                <GiCharacter /> {t('loginShort')}
              </button>
            ) : (
              <>
                <button
                  className={`btn btn-ghost account-btn ${tab === 'mypage' ? 'is-active' : ''}`}
                  onClick={() => setTab('mypage')}
                >
                  <GiCharacter /> {t('myPage')}
                </button>
                {/* Le compte n'est affiché qu'ici : plus de doublon dans Mon Journal. */}
                <span className="account-chip" title={auth.user.name}>
                  {auth.user.avatar && <img src={auth.user.avatar} alt="" width={20} height={20} />}
                  <span className="account-name">{auth.user.name}</span>
                  <button className="icon-btn" title={t('logout')} onClick={auth.logout}>
                    ⏻
                  </button>
                </span>
              </>
            )}
            <div className="lang-switch" role="group" aria-label="Language">
              {(['fr', 'en'] as Lang[]).map((l) => (
                <button
                  key={l}
                  className={`lang-btn ${lang === l ? 'is-active' : ''}`}
                  onClick={() => setLang(l)}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </header>

        {isCollection && (
          <nav className="kind-bar">
            {KIND_FAMILIES.map((fam) => (
              <span key={fam.key} className="kind-family">
                {fam.kinds.map((k) => (
                  <button
                    key={k}
                    className={`kind-btn ${tab === k ? 'is-active' : ''}`}
                    onClick={() => {
                      setTab(k)
                      setCollectionTab(k)
                    }}
                  >
                    {kindLabel(lang, k, 'short')}
                  </button>
                ))}
              </span>
            ))}
          </nav>
        )}

        {digest.lines && (
          <div className="digest">
            <span className="digest-label">{t('digestSince')}</span>
            {digest.lines.map((l, i) => (
              <span key={i} className="digest-line">
                <b>{l.name.split(' ')[0]}</b>{' '}
                {l.joined
                  ? t('digestJoined')
                  : l.deltas
                      .map(([k, n]) => `+${n} ${kindLabel(lang, k, n > 1 ? 'short' : 'one').toLowerCase()}`)
                      .join(', ')}
              </span>
            ))}
            <button className="icon-btn" title={t('dismiss')} onClick={digest.dismiss}>
              ×
            </button>
          </div>
        )}

        <div className="layout">
          {tab !== 'mypage' && (
          <RosterBar
            members={members}
            activeKind={isCollection ? (tab as Kind) : undefined}
            controls={
              <div className="sidebar-controls">
                {(groups.length > 0 || groupHash !== null) && (
                  <select
                    value={currentGroupIdx >= 0 ? String(currentGroupIdx) : ''}
                    onChange={(e) => onGroupAction(e.target.value)}
                    title={t('groupsTitle')}
                  >
                    {currentGroupIdx < 0 && <option value="">📁 {t('groupUnsaved')}</option>}
                    {groups.map((g, i) => (
                      <option key={g.hash} value={i}>
                        📁 {g.name}
                      </option>
                    ))}
                    {groupHash && currentGroupIdx < 0 && (
                      <option value="__save">{t('groupSave')}</option>
                    )}
                    {currentGroupIdx >= 0 && <option value="__forget">{t('groupForget')}</option>}
                  </select>
                )}
                {ready.length > 1 && (
                  <select
                    value={focusId ?? ''}
                    onChange={(e) => setFocusId(e.target.value ? Number(e.target.value) : null)}
                    title={t('focusTitle')}
                  >
                    <option value="">{t('wholeGroup')}</option>
                    {ready.map((m) => (
                      <option key={m.id} value={m.id}>
                        {t('justMe', { name: m.data.name.split(' ')[0] })}
                      </option>
                    ))}
                  </select>
                )}
                <div className="sidebar-controls-row">
                  {!hasRoom && members.length > 0 && (
                    <button className="btn btn-ghost btn-mini" onClick={room.enable} title={t('enableSyncTitle')}>
                      {t('enableSync')}
                    </button>
                  )}
                  {hasRoom && (
                    <span className={`sync-badge sync-${room.status}`} title={syncTitle}>
                      ● {room.status === 'error' ? t('syncKo') : t('syncOn')}
                      <button
                        className="icon-btn"
                        title={t('syncOffTitle')}
                        onClick={() => {
                          if (confirm(t('syncOffConfirm'))) room.disable()
                        }}
                      >
                        ×
                      </button>
                    </span>
                  )}
                  {members.length > 0 && (
                    <button className="btn btn-ghost btn-mini" onClick={copyLink} title={t('copyLink')}>
                      {copied ? t('copied') : '🔗 ' + t('copyLinkSolo')}
                    </button>
                  )}
                </div>
              </div>
            }
            focusId={focusId}
            absent={absent}
            collapsed={rosterCollapsed}
            onToggleCollapsed={() => setRosterOpen(rosterCollapsed)}
            onTogglePresence={togglePresence}
            onResetPresence={() => setAbsent([])}
            onAdd={add}
            onRemove={remove}
            onRefresh={refresh}
          />
          )}

          <main className="main">
            {dbError && <p className="empty">{t('dbError', { error: dbError })}</p>}
            {!dbError && !db && <p className="empty">{t('dbLoading')}</p>}

            {db && members.length === 0 && tab !== 'mypage' && (
              <div className="hero">
                <h1>{t('heroTitle')}</h1>
                <p>{t('heroBody')}</p>
                <p className="hero-hint">{t('heroHint')}</p>
              </div>
            )}

            {db && ready.length > 0 && activeReady.length === 0 && (
              <p className="empty">{t('allAbsent')}</p>
            )}

            {db && activeReady.length > 0 && tab === 'planning' && (
              <Planning
                db={db}
                ready={activeReady}
                ownedSets={ownedSets}
                onShowItem={(item, kind) => setShownItem({ item, kind })}
              />
            )}
            {db && activeReady.length > 0 && tab !== 'planning' && tab !== 'relics' && tab !== 'mypage' && (
              <Matrix
                kind={tab}
                items={db[tab]}
                ready={activeReady}
                ownedSets={ownedSets}
                onShowItem={(item, kind) => setShownItem({ item, kind })}
              />
            )}
            {activeReady.length > 0 && tab === 'relics' &&
              (relicDb ? (
                <Relics db={relicDb} ready={activeReady} />
              ) : (
                <p className="empty">{t('relicsLoading')}</p>
              ))}
            {db && tab === 'mypage' && (
              <MyPage
                db={db}
                relicDb={relicDb}
                auth={auth}
                members={members}
                onCharacterUpdated={(charId) => {
                  if (members.some((m) => m.id === charId)) refresh(charId)
                }}
              />
            )}
          </main>
        </div>

        {shownItem && (
          <ItemModal
            shown={shownItem}
            ready={ready}
            ownedSets={ownedSets}
            onClose={() => setShownItem(null)}
          />
        )}

        <footer className="footer">
          {t('dataBy')}{' '}
          <a href="https://ffxivcollect.com" target="_blank" rel="noreferrer">
            FFXIV Collect
          </a>{' '}
          · {t('footer')} ·{' '}
          <a
            href="https://github.com/Olympia-Guardian/olympia-guardian.github.io/issues"
            target="_blank"
            rel="noreferrer"
          >
            {t('feedback')}
          </a>{' '}
          · FINAL FANTASY XIV © SQUARE ENIX
        </footer>
      </div>
    </LangContext.Provider>
  )
}
