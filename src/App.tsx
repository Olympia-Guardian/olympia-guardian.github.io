import { useEffect, useMemo, useState } from 'react'
import { GiCharacter } from 'react-icons/gi'
import { KINDS, KIND_FAMILIES, type Kind } from './api'
import { useAuth } from './auth'
import { useDigest } from './digest'
import { useGroups } from './groups'
import { MyPage } from './views/MyPage'
import { detectLang, kindLabel, persistLang, translate, useI18n, LangContext, type Lang } from './i18n'
import { ItemModal, type ShownItem } from './ItemModal'
import { RosterBar } from './RosterBar'
import { TabIcon } from './ui'
import { fetchCharacter } from './api'
import {
  readHashParam,
  setHashParam,
  useDb,
  useMembers,
  useOwnedSets,
  useReadyMembers,
  useRelicDb,
} from './store'
import { Matrix } from './views/Matrix'
import { Planning } from './views/Planning'
import { Relics } from './views/Relics'

type Tab = 'planning' | Kind | 'relics' | 'mypage'

/** Nom d'un perso à partir de son ID (fiche en cache la plupart du temps). */
function useCharName(charId: number): string | null {
  const [name, setName] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    fetchCharacter(charId)
      .then((c) => alive && setName(c.name))
      .catch(() => alive && setName(`#${charId}`))
    return () => {
      alive = false
    }
  }, [charId])
  return name
}

/** Bouton « Demander avec {perso} » du bandeau d'invitation. */
function JoinChip({ charId, onJoin }: { charId: number; onJoin: () => void }) {
  const name = useCharName(charId)
  const { t } = useI18n()
  return (
    <button className="btn btn-primary btn-mini" onClick={onJoin}>
      {t('joinWith', { name: name ?? '…' })}
    </button>
  )
}

/** Ligne d'une demande d'adhésion, côté créateur : perso + compte + actions. */
function RequestRow({
  charId,
  userName,
  onAction,
}: {
  charId: number
  userName: string
  onAction: (action: 'approve' | 'reject' | 'ban') => void
}) {
  const name = useCharName(charId)
  const { t } = useI18n()
  return (
    <div className="request-row">
      <span className="request-who">
        <b>{name ?? '…'}</b>
        <span className="request-user">{userName}</span>
      </span>
      <span className="request-actions">
        <button className="btn btn-primary btn-mini" onClick={() => onAction('approve')}>
          ✓ {t('requestApprove')}
        </button>
        <button className="btn btn-ghost btn-mini" onClick={() => onAction('reject')}>
          ✗ {t('requestReject')}
        </button>
        <button
          className="btn btn-ghost btn-mini request-ban"
          title={t('requestBanTitle')}
          onClick={() => {
            if (confirm(t('requestBanConfirm', { name: userName }))) onAction('ban')
          }}
        >
          🚫
        </button>
      </span>
    </div>
  )
}

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

  // Groupes : LE modèle de l'app — privés (navigateur ou compte) et
  // synchronisés (invitation par lien). Le groupe actif fournit les membres.
  const verifiedIds = useMemo(
    () => auth.bindings.filter((b) => b.verified).map((b) => b.charId),
    [auth.bindings],
  )
  const grp = useGroups(auth.token, verifiedIds)
  const { members, refresh } = useMembers(grp.active?.members ?? [])
  const ready = useReadyMembers(members)
  const ownedSets = useOwnedSets(ready)

  // Droits sur le groupe actif : le créateur édite, un membre gère son perso.
  const canEditGroup =
    grp.active !== null && (grp.active.mine === 'owner' || grp.active.id.startsWith('loc-'))
  const canRemoveMember = (id: number) =>
    canEditGroup || (grp.active?.mine === 'member' && verifiedIds.includes(id))

  async function handleAddMember(id: number) {
    try {
      if (!grp.active) await grp.create(t('groupDefaultName'), [id])
      else await grp.addMember(grp.active.id, id)
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    }
  }

  function handleRemoveMember(id: number) {
    if (!grp.active || !canRemoveMember(id)) return
    void grp.removeMember(grp.active.id, id)
  }

  // Nettoyage des anciens liens : le paramètre o= (coches manuelles) n'existe plus.
  useEffect(() => {
    setHashParam('o', null)
  }, [])

  // L'onglet vit dans le hash (#tab=…) : un rechargement — manuel ou par le
  // rafraîchissement auto — ramène exactement où on était.
  const [tab, setTab] = useState<Tab>(() => {
    const t = readHashParam('tab')
    if (t === 'relics' || t === 'mypage' || (KINDS as string[]).includes(t ?? '')) return t as Tab
    return 'planning'
  })
  useEffect(() => {
    setHashParam('tab', tab === 'planning' ? null : tab)
  }, [tab])
  // Dernière collection consultée : cliquer sur « Collections » y revient.
  const [collectionTab, setCollectionTab] = useState<Kind>(() => {
    const t = readHashParam('tab')
    return (KINDS as string[]).includes(t ?? '') ? (t as Kind) : 'mounts'
  })
  const [copied, setCopied] = useState(false)
  const [shownItem, setShownItem] = useState<ShownItem | null>(null)

  // Sélecteur de groupes : bascule instantanée, création, renommage, sortie.
  function onGroupAction(value: string) {
    if (value === '__create') {
      const name = prompt(t('groupNamePrompt'))?.trim()
      if (name) void grp.create(name)
    } else if (value === '__rename') {
      if (!grp.active) return
      const name = prompt(t('groupNamePrompt'), grp.active.name)?.trim()
      if (name) void grp.rename(grp.active.id, name)
    } else if (value === '__drop') {
      if (!grp.active) return
      const owner = grp.active.mine === 'owner' || grp.active.id.startsWith('loc-')
      const msg = owner
        ? t('groupDeleteConfirm', { name: grp.active.name })
        : t('groupLeaveConfirm', { name: grp.active.name })
      if (confirm(msg)) void grp.drop(grp.active.id)
    } else if (value === '__rotate') {
      if (!grp.active || !confirm(t('rotateConfirm'))) return
      void grp
        .rotateInvite(grp.active.id)
        .then(async (link) => {
          try {
            await navigator.clipboard.writeText(link)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          } catch {
            prompt(t('copyPrompt'), link)
          }
        })
        .catch((e) => alert(e instanceof Error ? e.message : String(e)))
    } else if (value) {
      grp.setActive(value)
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

  // « Inviter » : convertit le groupe en synchronisé si besoin et copie le
  // lien d'invitation. Sans compte, on explique puis on lance la connexion.
  async function inviteToGroup() {
    if (!grp.active) return
    if (!auth.token) {
      if (confirm(t('inviteNeedLogin'))) auth.login()
      return
    }
    try {
      // share() convertit si besoin et rend le lien bâti sur le code
      // d'invitation (révocable) — jamais sur l'id du groupe.
      const link = await grp.share(grp.active.id)
      try {
        await navigator.clipboard.writeText(link)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {
        prompt(t('copyPrompt'), link)
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    }
  }

  // Treize collections ne tiennent pas dans une pilule d'onglets : la barre du
  // haut ne garde que les grandes sections, la collection se choisit sur une
  // seconde ligne quand on est dans « Collections ».
  const isCollection = (KINDS as string[]).includes(tab)
  const TABS: { id: Tab; label: string }[] = [
    { id: 'planning', label: t('planning') },
    { id: collectionTab, label: t('collections') },
    { id: 'relics', label: t('groupProgressTab') },
  ]

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <span className="brand-name">Codex</span>
            <span className="brand-sub">Olympia</span>
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
                    <TabIcon k={k} /> {kindLabel(lang, k, 'short')}
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
                <select
                  value={grp.activeId ?? ''}
                  onChange={(e) => onGroupAction(e.target.value)}
                  title={t('groupsTitle')}
                >
                  {!grp.active && <option value="">{t('groupNone')}</option>}
                  {grp.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.shared ? '🔗' : '📁'} {g.name}
                      {g.requests?.length ? ` (${g.requests.length} ⏳)` : ''}
                    </option>
                  ))}
                  {grp.pending.map((p) => (
                    <option key={p.code} value="" disabled>
                      ⏳ {t('pendingEntry', { name: p.name })}
                    </option>
                  ))}
                  <option value="__create">{t('groupNew')}</option>
                  {grp.active && canEditGroup && <option value="__rename">{t('groupRename')}</option>}
                  {grp.active && canEditGroup && grp.active.shared && (
                    <option value="__rotate">{t('rotateLink')}</option>
                  )}
                  {grp.active && (
                    <option value="__drop">
                      {canEditGroup ? t('groupDelete') : t('groupLeave')}
                    </option>
                  )}
                </select>
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
                  {grp.active && canEditGroup && (
                    <button className="btn btn-ghost btn-mini" onClick={inviteToGroup} title={t('inviteTitle')}>
                      {copied ? t('copied') : '🔗 ' + t('invite')}
                    </button>
                  )}
                </div>
                {grp.active && canEditGroup && (grp.active.requests?.length ?? 0) > 0 && (
                  <div className="requests-box">
                    <p className="requests-title">
                      {t('requestsTitle', { n: grp.active.requests!.length })}
                    </p>
                    {grp.active.requests!.map((r) => (
                      <RequestRow
                        key={r.userId}
                        charId={r.charId}
                        userName={r.userName}
                        onAction={(action) => void grp.handleRequest(grp.active!.id, r.userId, action)}
                      />
                    ))}
                  </div>
                )}
              </div>
            }
            focusId={focusId}
            absent={absent}
            collapsed={rosterCollapsed}
            onToggleCollapsed={() => setRosterOpen(rosterCollapsed)}
            onTogglePresence={togglePresence}
            onResetPresence={() => setAbsent([])}
            onAdd={canEditGroup || !grp.active ? handleAddMember : undefined}
            canRemove={canRemoveMember}
            onRemove={handleRemoveMember}
            onRefresh={refresh}
          />
          )}

          <main className="main">
            {grp.error === 'invite' && (
              <div className="notice join-banner">
                <span>{t('inviteInvalid')}</span>
                <button className="icon-btn" onClick={grp.dismissError} title={t('dismiss')}>
                  ×
                </button>
              </div>
            )}
            {grp.invite && (
              <div className="notice join-banner">
                {grp.invite.status === 'pending' ? (
                  <span>⏳ {t('invitePending', { name: grp.invite.name })}</span>
                ) : grp.invite.status === 'member' ? (
                  <span>{t('inviteAlreadyMember', { name: grp.invite.name })}</span>
                ) : !auth.token ? (
                  <>
                    <span>{t('inviteGuest', { name: grp.invite.name })}</span>
                    <button className="btn btn-primary btn-mini" onClick={auth.login}>
                      {t('joinLogin')}
                    </button>
                  </>
                ) : verifiedIds.length === 0 ? (
                  <span>{t('inviteNeedChar', { name: grp.invite.name })}</span>
                ) : (
                  <>
                    <span>{t('inviteAsk', { name: grp.invite.name })}</span>
                    {verifiedIds.map((id) => (
                      <JoinChip
                        key={id}
                        charId={id}
                        onJoin={() => void grp.requestJoin(grp.invite!.code, id)}
                      />
                    ))}
                  </>
                )}
                <button className="icon-btn" onClick={grp.dismissInvite} title={t('dismiss')}>
                  ×
                </button>
              </div>
            )}
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
            {db && activeReady.length > 0 && tab === 'relics' &&
              (relicDb ? (
                <Relics db={relicDb} cdb={db} ready={activeReady} />
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
