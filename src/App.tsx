import { useEffect, useMemo, useRef, useState } from 'react'
import { KINDS, type Kind } from './api'
import { MANUAL_KINDS } from './store'
import { useDigest } from './digest'
import { detectLang, kindLabel, persistLang, translate, LangContext, type Lang } from './i18n'
import { ItemModal, type ShownItem } from './ItemModal'
import { useRoom, type LocalState } from './room'
import { RosterBar } from './RosterBar'
import {
  readHashRoomId,
  useDb,
  useOverrides,
  useOwnedSets,
  useReadyMembers,
  useRelicDb,
  useRoster,
} from './store'
import { Matrix } from './views/Matrix'
import { Planning } from './views/Planning'
import { Relics } from './views/Relics'

type Tab = 'planning' | Kind | 'relics'

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

  // Salon de synchro (lu depuis le lien avant tout le reste : il pilote le hash)
  const [roomId, setRoomId] = useState<string | null>(() => readHashRoomId())
  const hasRoom = roomId !== null

  const { members, roster, add, remove, refresh, applyRemoteRoster } = useRoster(hasRoom)
  const ready = useReadyMembers(members)
  const rosterIds = useMemo(() => members.map((m) => m.id), [members])
  const { overrides, toggle, prune, applyRemoteOverrides } = useOverrides(rosterIds, hasRoom)
  const ownedSets = useOwnedSets(ready, overrides)

  const stateRef = useRef<LocalState>({ roster, overrides })
  stateRef.current = { roster, overrides }
  const room = useRoom(roomId, setRoomId, stateRef, applyRemoteRoster, applyRemoteOverrides)

  // Toute évolution locale (roster ou coches) part vers le salon après un court délai.
  const changeStamp = useMemo(
    () =>
      JSON.stringify({
        t: roster.t,
        o: Object.entries(overrides).map(([id, kinds]) => [
          id,
          ...MANUAL_KINDS.map((k) => kinds[k]?.t ?? 0),
        ]),
      }),
    [roster, overrides],
  )
  useEffect(() => room.schedulePush(), [changeStamp, room.schedulePush]) // eslint-disable-line react-hooks/exhaustive-deps

  const [tab, setTab] = useState<Tab>('planning')
  const [copied, setCopied] = useState(false)
  const [shownItem, setShownItem] = useState<ShownItem | null>(null)

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

  // Une coche manuelle devient inutile dès que FFXIV Collect synchronise l'objet.
  useEffect(() => {
    if (ready.length > 0) prune(ready)
  }, [ready, prune])

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

  const TABS: { id: Tab; label: string }[] = [
    { id: 'planning', label: t('planning') },
    ...KINDS.map((k) => ({ id: k as Tab, label: kindLabel(lang, k, 'short') })),
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
                className={`tab ${tab === tb.id ? 'is-active' : ''}`}
                onClick={() => setTab(tb.id)}
              >
                {tb.label}
              </button>
            ))}
          </nav>
          <div className="topbar-actions">
            {ready.length > 1 && (
              <select
                className="focus-select"
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
            {!hasRoom && members.length > 0 && (
              <button className="btn btn-ghost" onClick={room.enable} title={t('enableSyncTitle')}>
                {t('enableSync')}
              </button>
            )}
            {hasRoom && (
              <span className={`sync-badge sync-${room.status}`} title={syncTitle}>
                ● {room.status === 'error' ? t('syncKo') : t('syncOn')}
                <button className="icon-btn" title={t('syncOffTitle')} onClick={room.disable}>
                  ×
                </button>
              </span>
            )}
            {members.length > 0 && (
              <button className="btn btn-ghost" onClick={copyLink}>
                {copied ? t('copied') : t(members.length > 1 ? 'copyLink' : 'copyLinkSolo')}
              </button>
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
          <RosterBar
            members={members}
            ownedSets={ownedSets}
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

          <main className="main">
            {dbError && <p className="empty">{t('dbError', { error: dbError })}</p>}
            {!dbError && !db && <p className="empty">{t('dbLoading')}</p>}

            {db && members.length === 0 && (
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
            {db && activeReady.length > 0 && tab !== 'planning' && tab !== 'relics' && (
              <Matrix
                kind={tab}
                items={db[tab]}
                ready={activeReady}
                ownedSets={ownedSets}
                overrides={overrides}
                onToggle={toggle}
                onShowItem={(item, kind) => setShownItem({ item, kind })}
              />
            )}
            {activeReady.length > 0 && tab === 'relics' &&
              (relicDb ? (
                <Relics db={relicDb} ready={activeReady} />
              ) : (
                <p className="empty">{t('relicsLoading')}</p>
              ))}
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
          · {t('footer')} · FINAL FANTASY XIV © SQUARE ENIX
        </footer>
      </div>
    </LangContext.Provider>
  )
}
