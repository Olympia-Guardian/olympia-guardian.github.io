import { useEffect, useMemo, useRef, useState } from 'react'
import { KINDS, KIND_FAMILIES, type Kind } from './api'
import { useAuth } from './auth'
import { useDigest } from './digest'
import { useGroups } from './groups'
import { MyPage } from './views/MyPage'
import { detectLang, kindLabel, persistLang, translate, useI18n, LangContext, type Lang } from './i18n'
import { ItemModal, type ShownItem } from './ItemModal'
import { RosterBar } from './RosterBar'
import { TabIcon } from './ui'
import { fetchCharacter, invalidateCharacter } from './api'
import {
  readHashParam,
  setHashParam,
  useDb,
  useMembers,
  useOwnedSets,
  useReadyMembers,
  useRelicDb,
} from './store'
import { apiSuggest } from './groupsApi'
import { useContactInvite, useContacts } from './contacts'
import { NotificationsPanel } from './Notifications'
import { useSuggestions } from './suggestions'
import { AdminPage } from './views/Admin'
import { GroupCreateDialog, GroupsPage } from './views/Groups'
import { Matrix } from './views/Matrix'
import { Planning } from './views/Planning'
import { Relics } from './views/Relics'

type Tab = 'planning' | Kind | 'fashion' | 'relics' | 'mypage' | 'groups' | 'admin'

/** Collections fusionnées de l'onglet « Mode » (accessoires, lunettes, coiffures). */
const FASHION_KINDS: Kind[] = ['fashions', 'facewear', 'hairstyles']

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
  // La cloche : suggestions reçues, demandes d'ami, invitations de groupe.
  const sugg = useSuggestions(auth.token)
  const [bellOpen, setBellOpen] = useState(false)
  // Contacts (amis / blacklist) + bandeau d'un lien de contact ouvert (#c=…).
  const contacts = useContacts(auth.token)
  const cinv = useContactInvite(auth.token)
  const { members, refresh, reload } = useMembers(grp.active?.members ?? [])
  const ready = useReadyMembers(members)
  const ownedSets = useOwnedSets(ready)

  // Suggestion envoyée disparue du serveur = acceptée OU refusée : on recharge
  // la fiche du perso visé pour trancher (✓ possédé ou retour de la croix).
  // Le dernier état connu est persisté pour couvrir aussi les transitions
  // survenues pendant que l'appli était fermée (sinon le cache de fiche fait
  // passer une acceptation pour un refus jusqu'à son expiration).
  const prevSentRef = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!sugg.sentLoaded) {
      prevSentRef.current = null
      return
    }
    let prev = prevSentRef.current
    if (prev === null) {
      try {
        const stored = JSON.parse(localStorage.getItem('ogs.sentkeys.v1') ?? '[]')
        prev = new Set(Array.isArray(stored) ? stored.filter((k) => typeof k === 'string') : [])
      } catch {
        prev = new Set()
      }
    }
    prevSentRef.current = sugg.sent
    try {
      localStorage.setItem('ogs.sentkeys.v1', JSON.stringify([...sugg.sent]))
    } catch {
      // pas de persistance, pas grave
    }
    const gone = new Set<number>()
    for (const key of prev) {
      if (!sugg.sent.has(key)) gone.add(Number(key.split(':')[0]))
    }
    for (const id of gone) {
      invalidateCharacter(id)
      if (members.some((m) => m.id === id)) reload(id)
    }
  }, [sugg.sentLoaded, sugg.sent, members, reload])

  // Droits sur le groupe actif : le créateur édite, un membre gère son perso.
  // Le retrait et le rafraîchissement des membres se font dans « Mes Groupes ».
  const canEditGroup =
    grp.active !== null && (grp.active.mine === 'owner' || grp.active.id.startsWith('loc-'))
  // L'ajout manuel par ID/URL Lodestone n'existe que pour les groupes privés :
  // dans un groupe synchronisé, on n'entre que par invitation validée.
  const canManualAdd = !grp.active || (canEditGroup && !grp.active.shared)

  async function handleAddMember(id: number) {
    try {
      if (!grp.active) await grp.create(t('groupDefaultName'), [id])
      else await grp.addMember(grp.active.id, id)
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    }
  }

  // Nettoyage des anciens liens : le paramètre o= (coches manuelles) n'existe plus.
  useEffect(() => {
    setHashParam('o', null)
  }, [])

  // L'onglet vit dans le hash (#tab=…) : un rechargement — manuel ou par le
  // rafraîchissement auto — ramène exactement où on était.
  const [tab, setTab] = useState<Tab>(() => {
    const t = readHashParam('tab')
    // Anciens liens vers les trois collections fusionnées sous « Mode ».
    if ((FASHION_KINDS as string[]).includes(t ?? '')) return 'fashion'
    if (
      t === 'relics' ||
      t === 'mypage' ||
      t === 'groups' ||
      t === 'fashion' ||
      t === 'admin' ||
      (KINDS as string[]).includes(t ?? '')
    )
      return t as Tab
    return 'planning'
  })
  useEffect(() => {
    setHashParam('tab', tab === 'planning' ? null : tab)
  }, [tab])
  // Dernière collection consultée : cliquer sur « Collections » y revient.
  const [collectionTab, setCollectionTab] = useState<Kind | 'fashion'>(() => {
    const t = readHashParam('tab')
    if ((FASHION_KINDS as string[]).includes(t ?? '') || t === 'fashion') return 'fashion'
    return (KINDS as string[]).includes(t ?? '') ? (t as Kind) : 'mounts'
  })
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [shownItem, setShownItem] = useState<ShownItem | null>(null)

  // Sélecteur de groupes : bascule instantanée — la gestion vit dans l'onglet
  // « Groupes » (création, invitations, demandes, renommage, suppression…).
  function onGroupAction(value: string) {
    if (value === '__create') {
      setCreatingGroup(true)
    } else if (value === '__manage') {
      setTab('groups')
    } else if (value) {
      grp.setActive(value)
    }
  }

  // Onglet « Mode » de l'explorateur : les trois collections fusionnées,
  // chaque objet étiqueté de sa collection d'origine (ids réels conservés).
  const fashionItems = useMemo(
    () => (db ? FASHION_KINDS.flatMap((k) => db[k].map((it) => ({ ...it, kindOf: k }))) : []),
    [db],
  )

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

  // Treize collections ne tiennent pas dans une pilule d'onglets : la barre du
  // haut ne garde que les grandes sections, la collection se choisit sur une
  // seconde ligne quand on est dans « Collections ».
  const isCollection = (KINDS as string[]).includes(tab) || tab === 'fashion'
  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'planning', label: t('planning'), icon: 'planning' },
    { id: collectionTab, label: t('collections'), icon: 'collections' },
    { id: 'relics', label: t('groupProgressTab'), icon: 'avancement' },
  ]

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <span className="brand-name">Codex</span>
            <span className="brand-sub">Olympia</span>
          </div>
          {/* Sélecteur global de groupe — même dégaine que « Mon Journal » */}
          <select
            className="topbar-group-select"
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
            <option value="__manage">{t('groupsManage')}</option>
          </select>
          <nav className="tabs">
            {TABS.map((tb) => (
              <button
                key={tb.id}
                className={`tab ${tab === tb.id || (tb.id === collectionTab && isCollection) ? 'is-active' : ''}`}
                onClick={() => setTab(tb.id)}
              >
                <TabIcon k={tb.icon} /> {tb.label}
              </button>
            ))}
          </nav>
          <div className="topbar-actions">
            <button
              className={`btn btn-ghost account-btn ${tab === 'groups' ? 'is-active' : ''}`}
              onClick={() => setTab('groups')}
            >
              <TabIcon k="groups" /> {t('groupsTab')}
            </button>
            {!auth.user ? (
              <button className="btn btn-ghost account-btn" onClick={auth.login} title={t('loginIntro')}>
                <TabIcon k="login" /> {t('loginShort')}
              </button>
            ) : (
              <>
                <button
                  className={`btn btn-ghost account-btn ${tab === 'mypage' ? 'is-active' : ''}`}
                  onClick={() => setTab('mypage')}
                >
                  <TabIcon k="journal" /> {t('myPage')}
                </button>
                {auth.user.isAdmin && (
                  <button
                    className={`btn btn-ghost btn-icon-only admin-btn ${tab === 'admin' ? 'is-active' : ''}`}
                    title={t('adminTitle')}
                    onClick={() => setTab('admin')}
                  >
                    <TabIcon k="admin" />
                  </button>
                )}
                <span className="bell-wrap">
                  <button
                    className={`btn btn-ghost btn-icon-only bell-btn ${bellOpen ? 'is-active' : ''}`}
                    title={t('bellTitle')}
                    onClick={() => setBellOpen((v) => !v)}
                  >
                    <TabIcon k="bell" />
                    {sugg.count > 0 && <span className="bell-badge">{sugg.count}</span>}
                  </button>
                  {bellOpen && (
                    <NotificationsPanel
                      suggestions={sugg.list}
                      friendRequests={sugg.friendRequests}
                      groupInvites={sugg.groupInvites}
                      verifiedIds={verifiedIds}
                      db={db}
                      relicDb={relicDb}
                      onResolve={(ids, accept) => {
                        const affected = new Set(
                          sugg.list.filter((s) => ids.includes(s.id)).map((s) => s.charId),
                        )
                        void sugg.resolve(ids, accept).then(() => {
                          for (const id of affected)
                            if (members.some((m) => m.id === id)) reload(id)
                        })
                      }}
                      onRespondFriend={(userId, accept) =>
                        void sugg.respondFriend(userId, accept).then(() => contacts.refresh())
                      }
                      onRespondInvite={(groupId, accept, charId) =>
                        void sugg.respondInvite(groupId, accept, charId).then(() => grp.refreshServer())
                      }
                      onClose={() => setBellOpen(false)}
                    />
                  )}
                </span>
                {/* Le compte n'est affiché qu'ici : plus de doublon dans Mon Journal. */}
                <span className="account-chip" title={auth.user.name}>
                  {auth.user.avatar && <img src={auth.user.avatar} alt="" width={20} height={20} />}
                  <span className="account-name">{auth.user.name}</span>
                  <button className="icon-btn logout-btn" title={t('logout')} onClick={auth.logout}>
                    <TabIcon k="logout" />
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
            {KIND_FAMILIES.map((fam) =>
              fam.merged ? (
                <span key={fam.key} className="kind-family">
                  <button
                    className={`kind-btn ${tab === 'fashion' ? 'is-active' : ''}`}
                    onClick={() => {
                      setTab('fashion')
                      setCollectionTab('fashion')
                    }}
                  >
                    <TabIcon k="fashion" /> {t('fashionFamily')}
                  </button>
                </span>
              ) : (
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
              ),
            )}
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
          {tab !== 'mypage' && tab !== 'groups' && tab !== 'admin' && (
          <RosterBar
            members={members}
            activeKind={isCollection ? (tab as Kind | 'fashion') : undefined}
            controls={
              <div className="sidebar-controls">
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
              </div>
            }
            focusId={focusId}
            absent={absent}
            collapsed={rosterCollapsed}
            onToggleCollapsed={() => setRosterOpen(rosterCollapsed)}
            onTogglePresence={togglePresence}
            onResetPresence={() => setAbsent([])}
            onAdd={canManualAdd ? handleAddMember : undefined}
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
            {cinv.invite && cinv.invite.status !== 'self' && (
              <div className="notice join-banner">
                {cinv.invite.status === 'friend' ? (
                  <span>{t('contactAlready', { name: cinv.invite.name })}</span>
                ) : cinv.invite.status === 'pending' ? (
                  <span>⏳ {t('contactPending', { name: cinv.invite.name })}</span>
                ) : cinv.invite.status === 'pendingIn' ? (
                  <>
                    <span>{t('contactPendingIn', { name: cinv.invite.name })}</span>
                    <button
                      className="btn btn-primary btn-mini"
                      onClick={() =>
                        void sugg
                          .respondFriend(
                            sugg.friendRequests.find((f) => f.name === cinv.invite!.name)?.userId ?? '',
                            true,
                          )
                          .then(() => {
                            contacts.refresh()
                            cinv.dismiss()
                          })
                      }
                    >
                      ✓ {t('requestApprove')}
                    </button>
                  </>
                ) : !auth.token ? (
                  <>
                    <span>{t('contactGuest', { name: cinv.invite.name })}</span>
                    <button className="btn btn-primary btn-mini" onClick={auth.login}>
                      {t('joinLogin')}
                    </button>
                  </>
                ) : (
                  <>
                    <span>{t('contactAsk', { name: cinv.invite.name })}</span>
                    <button
                      className="btn btn-primary btn-mini"
                      onClick={() =>
                        void contacts
                          .request({ code: cinv.invite!.code })
                          .then((status) => {
                            if (status === 'friend') cinv.dismiss()
                            else cinv.markPending()
                          })
                          .catch((e) => alert(e instanceof Error ? e.message : String(e)))
                      }
                    >
                      {t('contactSend')}
                    </button>
                  </>
                )}
                <button className="icon-btn" onClick={cinv.dismiss} title={t('dismiss')}>
                  ×
                </button>
              </div>
            )}
            {dbError && <p className="empty">{t('dbError', { error: dbError })}</p>}
            {!dbError && !db && <p className="empty">{t('dbLoading')}</p>}

            {db && members.length === 0 && tab !== 'mypage' && tab !== 'groups' && (
              <div className="hero">
                <h1>{t('heroTitle')}</h1>
                <p>{t('heroBody')}</p>
                <p className="hero-hint">{t('heroHint')}</p>
              </div>
            )}

            {db && ready.length > 0 && activeReady.length === 0 && tab !== 'groups' && tab !== 'mypage' && (
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
            {db && activeReady.length > 0 && tab === 'fashion' && (
              <Matrix
                kind="fashions"
                titleLabel={t('fashionFamily')}
                items={fashionItems}
                ready={activeReady}
                ownedSets={ownedSets}
                onShowItem={(item, kind) => setShownItem({ item, kind })}
                suggest={
                  auth.token && grp.active?.shared
                    ? {
                        exclude: verifiedIds,
                        sentKeys: sugg.sent,
                        send: async (charId, kind, itemId) => {
                          sugg.markSent(charId, kind, itemId, true)
                          try {
                            await apiSuggest(auth.token!, charId, [{ kind, itemId }])
                          } catch (e) {
                            sugg.markSent(charId, kind, itemId, false)
                            throw e
                          }
                        },
                      }
                    : undefined
                }
                ownAdd={
                  auth.token && verifiedIds.length > 0
                    ? {
                        chars: verifiedIds,
                        add: async (charId, kind, itemId) => {
                          const cur = ownedSets.get(charId)?.[kind] ?? new Set<number>()
                          await auth.saveCollections(charId, { [kind]: [...new Set([...cur, itemId])] })
                          invalidateCharacter(charId)
                          reload(charId)
                        },
                      }
                    : undefined
                }
              />
            )}
            {db &&
              activeReady.length > 0 &&
              tab !== 'planning' &&
              tab !== 'relics' &&
              tab !== 'mypage' &&
              tab !== 'groups' &&
              tab !== 'admin' &&
              tab !== 'fashion' && (
              <Matrix
                kind={tab}
                items={db[tab]}
                ready={activeReady}
                ownedSets={ownedSets}
                onShowItem={(item, kind) => setShownItem({ item, kind })}
                suggest={
                  auth.token && grp.active?.shared
                    ? {
                        exclude: verifiedIds,
                        sentKeys: sugg.sent,
                        send: async (charId, kind, itemId) => {
                          sugg.markSent(charId, kind, itemId, true)
                          try {
                            await apiSuggest(auth.token!, charId, [{ kind, itemId }])
                          } catch (e) {
                            sugg.markSent(charId, kind, itemId, false)
                            throw e
                          }
                        },
                      }
                    : undefined
                }
                ownAdd={
                  auth.token && verifiedIds.length > 0
                    ? {
                        chars: verifiedIds,
                        add: async (charId, kind, itemId) => {
                          const cur = ownedSets.get(charId)?.[kind] ?? new Set<number>()
                          await auth.saveCollections(charId, { [kind]: [...new Set([...cur, itemId])] })
                          invalidateCharacter(charId)
                          reload(charId)
                        },
                      }
                    : undefined
                }
              />
            )}
            {db && activeReady.length > 0 && tab === 'relics' &&
              (relicDb ? (
                <Relics db={relicDb} cdb={db} ready={activeReady} />
              ) : (
                <p className="empty">{t('relicsLoading')}</p>
              ))}
            {tab === 'groups' && (
              <GroupsPage
                grp={grp}
                verifiedIds={verifiedIds}
                canOnline={!!auth.token}
                contacts={contacts}
                token={auth.token}
                myUserId={auth.user?.id ?? null}
              />
            )}
            {tab === 'admin' && auth.token && auth.user?.isAdmin && (
              <AdminPage token={auth.token} />
            )}
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

        {creatingGroup && (
          <GroupCreateDialog
            verifiedIds={verifiedIds}
            canOnline={!!auth.token}
            onCreate={(name, members, online) => {
              setCreatingGroup(false)
              void grp.create(name, members, online).catch((e) =>
                alert(e instanceof Error ? e.message : String(e)),
              )
            }}
            onClose={() => setCreatingGroup(false)}
          />
        )}
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
