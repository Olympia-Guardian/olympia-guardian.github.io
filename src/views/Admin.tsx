// Tableau de bord super-admin : vue d'ensemble de l'application (comptes,
// persos, groupes, activité) et actions ciblées — visible du seul compte
// ADMIN_USER_ID (le worker répond 404 à tous les autres).

import { useCallback, useEffect, useState } from 'react'
import { WORKER_API } from '../api'
import { useI18n } from '../i18n'
import { StatTile, TabIcon } from '../ui'

interface Overview {
  tiles: {
    users: number
    characters: number
    verifiedChars: number
    groups: number
    onlineGroups: number
    suggestions: number
    friendships: number
    pendingContacts: number
    blocks: number
    joinRequests: number
    sessions: number
  }
  collectionSources: Record<string, number>
  users: {
    id: string
    name: string
    avatar: string
    created: number
    verifiedChars: number
    ownedGroups: number
    friends: number
    suggSent: number
    sessions: number
    lastSeen: number | null
  }[]
  characters: {
    id: number
    name: string
    server: string
    dc: string
    updated: number
    forcedAt: number | null
    owner: string | null
    checked: number
  }[]
  groups: {
    id: string
    name: string
    shared: boolean
    created: number
    owner: string
    members: number
  }[]
  pendingSuggestions: { from: string; charName: string; kind: string; itemId: number; created: number }[]
  pendingRequests: { user: string; charId: number; group: string; created: number }[]
  activity: { type: string; a: string; b: string; created: number }[]
  volumes: { collections: number; rooms: number; tokens: number }
}

/** Icône + phrase d'un événement du journal d'activité. */
const EVENT_FMT: Record<string, { icon: string; fr: (a: string, b: string) => string; en: (a: string, b: string) => string }> = {
  signup: { icon: '🌱', fr: (a) => `${a} a créé son compte`, en: (a) => `${a} signed up` },
  group: { icon: '👥', fr: (a, b) => `${a} a créé le groupe « ${b} »`, en: (a, b) => `${a} created the group “${b}”` },
  suggestion: { icon: '💡', fr: (a, b) => `${a} a proposé un objet à ${b}`, en: (a, b) => `${a} suggested an item to ${b}` },
  friend: { icon: '🤝', fr: (a, b) => `${a} et ${b} sont devenus amis`, en: (a, b) => `${a} and ${b} became friends` },
  contactReq: { icon: '✋', fr: (a, b) => `${a} a demandé ${b} en contact`, en: (a, b) => `${a} sent a contact request to ${b}` },
  ginvite: { icon: '🎟', fr: (a, b) => `${a} a invité quelqu’un dans « ${b} »`, en: (a, b) => `${a} invited someone to “${b}”` },
  grequest: { icon: '⏳', fr: (a, b) => `${a} demande à rejoindre « ${b} »`, en: (a, b) => `${a} asked to join “${b}”` },
}

/** « il y a 3 h » compact — l'admin veut jauger la fraîcheur d'un œil. */
function ago(ts: number | null, lang: string): string {
  if (!ts) return '-'
  const mn = Math.round((Date.now() - ts) / 60_000)
  if (mn < 1) return lang === 'fr' ? 'à l’instant' : 'just now'
  if (mn < 60) return `${mn} min`
  const h = Math.round(mn / 60)
  if (h < 48) return `${h} h`
  return `${Math.round(h / 24)} j`
}

// Le code n'est gardé que le temps de l'onglet : il ne survit ni à une
// fermeture ni à un autre onglet, et n'est jamais écrit sur le disque.
const PIN_KEY = 'ogs.adminpin'

function lirePin(): string {
  try {
    return sessionStorage.getItem(PIN_KEY) ?? ''
  } catch {
    return ''
  }
}

interface Report {
  id: string
  user_id: string
  user_name: string | null
  char_id: number | null
  tab: string | null
  message: string
  created: number
  handled: number
}

interface Adoption {
  comptes: number
  actifs7: number
  actifs30: number
  persos: number
  verifies: number
  groupes: number
  groupesVivants: number
  retention: number | null
  persosActifs: number
}

interface Metric {
  jour: string
  cle: string
  n: number
}

export function AdminPage({ token }: { token: string }) {
  const { lang, t } = useI18n()
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [pin, setPin] = useState(lirePin)
  const [saisie, setSaisie] = useState('')
  const [verrouille, setVerrouille] = useState(false)
  const [onglet, setOnglet] = useState<'apercu' | 'sante' | 'adoption' | 'reports' | 'comptes' | 'groupes'>('apercu')
  const [reports, setReports] = useState<Report[] | null>(null)
  const [metrics, setMetrics] = useState<Metric[] | null>(null)
  const [fraicheur, setFraicheur] = useState<number | null>(null)
  const [adoption, setAdoption] = useState<Adoption | null>(null)

  const entetes = useCallback(
    () => ({ Authorization: `Bearer ${token}`, 'X-Admin-Pin': pin }),
    [token, pin],
  )

  const load = useCallback(async () => {
    if (!pin) {
      setVerrouille(true)
      return
    }
    try {
      const res = await fetch(`${WORKER_API}/admin/overview`, { headers: entetes() })
      // 403 : le code ne correspond pas. On le jette plutôt que de le garder,
      // sinon chaque rechargement retenterait le même code faux.
      if (res.status === 403) {
        try {
          sessionStorage.removeItem(PIN_KEY)
        } catch {
          // rien à nettoyer
        }
        setPin('')
        setVerrouille(true)
        return
      }
      if (!res.ok) throw new Error(String(res.status))
      setData(await res.json())
      setVerrouille(false)
      setError(false)
    } catch {
      setError(true)
    }
  }, [pin, entetes])

  useEffect(() => {
    void load()
  }, [load])

  // Les signalements ne sont demandés qu'en ouvrant leur onglet : inutile de
  // les charger pour quelqu'un qui vient regarder les compteurs.
  const loadReports = useCallback(async () => {
    if (!pin) return
    try {
      const res = await fetch(`${WORKER_API}/admin/reports`, { headers: entetes() })
      if (!res.ok) return
      const j = (await res.json()) as { reports: Report[] }
      setReports(j.reports)
    } catch {
      setReports([])
    }
  }, [pin, entetes])

  useEffect(() => {
    if (onglet === 'reports' && reports === null) void loadReports()
  }, [onglet, reports, loadReports])

  // Santé : les compteurs du worker, plus l'âge des catalogues. Ce dernier ne
  // vient pas de la base mais du fichier publié par le cron : c'est justement
  // le signal qui dit si ce cron tourne encore.
  useEffect(() => {
    if (onglet !== 'adoption' || adoption !== null || !pin) return
    void (async () => {
      try {
        const res = await fetch(`${WORKER_API}/admin/adoption`, { headers: entetes() })
        if (res.ok) setAdoption(await res.json())
      } catch {
        // l'onglet affichera l'etat de chargement
      }
    })()
  }, [onglet, adoption, pin, entetes])

  useEffect(() => {
    if (onglet !== 'sante' || metrics !== null || !pin) return
    void (async () => {
      try {
        const res = await fetch(`${WORKER_API}/admin/metrics`, { headers: entetes() })
        setMetrics(res.ok ? ((await res.json()) as { metrics: Metric[] }).metrics : [])
      } catch {
        setMetrics([])
      }
      try {
        const m = await fetch(`${import.meta.env.BASE_URL}data/meta.json`).then((r) => r.json())
        if (m?.updatedAt) {
          setFraicheur(Math.floor((Date.now() - new Date(m.updatedAt).getTime()) / 3_600_000))
        }
      } catch {
        setFraicheur(null)
      }
    })()
  }, [onglet, metrics, pin, entetes])

  async function marquerTraite(id: string, handled: boolean) {
    setReports((prev) => prev?.map((r) => (r.id === id ? { ...r, handled: handled ? 1 : 0 } : r)) ?? null)
    try {
      await fetch(`${WORKER_API}/admin/reports/${id}`, {
        method: 'POST',
        headers: { ...entetes(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ handled }),
      })
    } catch {
      void loadReports()
    }
  }

  async function action(label: string, path: string, method: string, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return
    setBusy(label)
    try {
      await fetch(`${WORKER_API}${path}`, { method, headers: entetes() })
      await load()
    } finally {
      setBusy(null)
    }
  }

  if (verrouille || !pin) {
    return (
      <div className="view admin">
        <div className="admin-lock">
          <h2>{t('adminTitle')}</h2>
          <p className="muted">{t('adminPinIntro')}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const v = saisie.trim()
              if (!v) return
              try {
                sessionStorage.setItem(PIN_KEY, v)
              } catch {
                // stockage refusé : le code vaudra pour cette page seulement
              }
              setPin(v)
              setVerrouille(false)
              setSaisie('')
            }}
          >
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              value={saisie}
              placeholder={t('adminPinField')}
              onChange={(e) => setSaisie(e.target.value)}
            />
            <button className="btn btn-primary" type="submit">
              {t('adminPinUnlock')}
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (error) return <p className="empty">{t('adminError')}</p>
  if (!data) return <p className="empty">{t('dbLoading')}</p>

  const srcs = data.collectionSources

  return (
    <div className="view admin-page">
      <div className="groups-head">
        <h2 className="groups-title">🛡 {t('adminTitle')}</h2>
        <span className="admin-head-actions">
          <button
            className="btn btn-ghost btn-mini"
            disabled={busy !== null}
            onClick={() => void action('purge', '/admin/purge-tokens', 'POST')}
            title={t('adminPurgeTitle')}
          >
            <TabIcon k="purge" /> {t('adminPurge')}
          </button>
          <button className="btn btn-ghost btn-mini" onClick={() => void load()}>
            <TabIcon k="sync" /> {t('adminReload')}
          </button>
        </span>
      </div>

      <div className="stat-row">
        <StatTile value={data.tiles.users} label={t('adminTileUsers')} />
        <StatTile
          value={`${data.tiles.verifiedChars}/${data.tiles.characters}`}
          label={t('adminTileChars')}
        />
        <StatTile
          value={`${data.tiles.onlineGroups}/${data.tiles.groups}`}
          label={t('adminTileGroups')}
        />
        <StatTile value={data.tiles.sessions} label={t('adminTileSessions')} />
        <StatTile value={data.tiles.suggestions} label={t('adminTileSuggestions')} />
        <StatTile value={data.tiles.friendships} label={t('adminTileFriends')} />
        <StatTile value={data.tiles.joinRequests + data.tiles.pendingContacts} label={t('adminTilePending')} />
        <StatTile value={data.tiles.blocks} label={t('adminTileBlocks')} />
      </div>

      <div className="kind-bar admin-tabs">
        {(
          [
            ['apercu', t('adminTabOverview')],
            ['sante', t('adminTabHealth')],
            ['adoption', t('adminTabAdoption')],
            ['reports', t('adminTabReports')],
            ['comptes', t('adminTabAccounts')],
            ['groupes', t('adminTabGroups')],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className={`kind-btn ${onglet === id ? 'is-active' : ''}`}
            onClick={() => setOnglet(id)}
          >
            {label}
            {id === 'reports' && reports && reports.some((r) => !r.handled) && (
              <span className="bell-badge">{reports.filter((r) => !r.handled).length}</span>
            )}
          </button>
        ))}
      </div>

      {onglet === 'sante' && (
        <section className="relic-series group-card">
          <header className="relic-series-head">
            <h4 className="relic-series-name">{t('adminTabHealth')}</h4>
          </header>
          {metrics === null ? (
            <p className="muted">{t('loading')}</p>
          ) : (
            (() => {
              const somme = (cle: string, jours = 14) => {
                const depuis = new Date(Date.now() - jours * 86_400_000)
                  .toISOString()
                  .slice(0, 10)
                return metrics
                  .filter((m) => m.cle === cle && m.jour >= depuis)
                  .reduce((n, m) => n + m.n, 0)
              }
              const ok = somme('lodestone_ok')
              const ko = somme('lodestone_echec')
              const tauxEchec = ok + ko > 0 ? Math.round((ko / (ok + ko)) * 100) : 0
              const erreurs = somme('erreur_worker')
              const refus = somme('debit_refuse')
              // Seuils : au-dela, il se passe quelque chose qui demande a etre
              // regarde. En dessous, c'est le bruit normal d'un service vivant.
              const etat = (v: number, alerte: number) =>
                v >= alerte ? 'lvl-low' : v > 0 ? 'lvl-mid' : 'is-done'
              return (
                <div className="admin-health">
                  <div className={`admin-health-card ${fraicheur === null ? '' : fraicheur > 72 ? 'lvl-low' : fraicheur > 36 ? 'lvl-mid' : 'is-done'}`}>
                    <b>{fraicheur === null ? '?' : `${fraicheur} h`}</b>
                    <span>{t('adminHealthFresh')}</span>
                    <small>{t('adminHealthFreshHint')}</small>
                  </div>
                  <div className={`admin-health-card ${etat(tauxEchec, 20)}`}>
                    <b>{tauxEchec} %</b>
                    <span>{t('adminHealthLodestone')}</span>
                    <small>{t('adminHealthLodestoneHint', { ok, ko })}</small>
                  </div>
                  <div className={`admin-health-card ${etat(erreurs, 10)}`}>
                    <b>{erreurs}</b>
                    <span>{t('adminHealthErrors')}</span>
                    <small>{t('adminHealthErrorsHint')}</small>
                  </div>
                  <div className={`admin-health-card ${etat(refus, 200)}`}>
                    <b>{refus}</b>
                    <span>{t('adminHealthThrottle')}</span>
                    <small>{t('adminHealthThrottleHint')}</small>
                  </div>
                </div>
              )
            })()
          )}
        </section>
      )}

      {onglet === 'adoption' && (
        <section className="relic-series group-card">
          <header className="relic-series-head">
            <h4 className="relic-series-name">{t('adminTabAdoption')}</h4>
          </header>
          {adoption === null ? (
            <p className="muted">{t('loading')}</p>
          ) : (
            <div className="admin-health">
              <div className="admin-health-card">
                <b>
                  {adoption.actifs7} <small>/ {adoption.comptes}</small>
                </b>
                <span>{t('adminAdoActive7')}</span>
                <small>{t('adminAdoActive7Hint', { n: adoption.actifs30 })}</small>
              </div>
              <div className="admin-health-card">
                <b>{adoption.retention === null ? '—' : `${adoption.retention} %`}</b>
                <span>{t('adminAdoRetention')}</span>
                <small>{t('adminAdoRetentionHint')}</small>
              </div>
              <div className="admin-health-card">
                <b>
                  {adoption.verifies} <small>/ {adoption.persos}</small>
                </b>
                <span>{t('adminAdoChars')}</span>
                <small>{t('adminAdoCharsHint', { n: adoption.persosActifs })}</small>
              </div>
              <div className="admin-health-card">
                <b>
                  {adoption.groupesVivants} <small>/ {adoption.groupes}</small>
                </b>
                <span>{t('adminAdoGroups')}</span>
                <small>{t('adminAdoGroupsHint')}</small>
              </div>
            </div>
          )}
        </section>
      )}

      {onglet === 'reports' && (
        <section className="relic-series group-card">
          <header className="relic-series-head">
            <h4 className="relic-series-name">{t('adminTabReports')}</h4>
          </header>
          {reports === null ? (
            <p className="muted">{t('loading')}</p>
          ) : reports.length === 0 ? (
            <p className="muted">{t('adminNoReport')}</p>
          ) : (
            <ul className="admin-reports">
              {reports.map((r) => (
                <li key={r.id} className={r.handled ? 'is-handled' : ''}>
                  <div className="admin-report-head">
                    <b>{r.user_name ?? r.user_id}</b>
                    <span className="muted">
                      {r.tab ? `· ${r.tab} ` : ''}
                      {r.char_id ? `· ${r.char_id} ` : ''}· {ago(r.created, lang)}
                    </span>
                    <button
                      className="btn btn-ghost btn-mini"
                      onClick={() => void marquerTraite(r.id, !r.handled)}
                    >
                      {r.handled ? t('adminReopen') : t('adminMarkDone')}
                    </button>
                  </div>
                  <p className="admin-report-msg">{r.message}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {onglet === 'apercu' && (
      <>
      {/* Activité récente */}
      <section className="relic-series group-card">
        <header className="relic-series-head">
          <h4 className="relic-series-name">📜 {t('adminActivity')}</h4>
          <span className="admin-sources">
            {t('adminVolumes', {
              collections: data.volumes.collections,
              tokens: data.volumes.tokens,
              rooms: data.volumes.rooms,
            })}
          </span>
        </header>
        <ul className="admin-feed">
          {data.activity.map((e, i) => {
            const fmt = EVENT_FMT[e.type]
            if (!fmt) return null
            return (
              <li key={i} className="admin-feed-row">
                <span className="admin-feed-icon">{fmt.icon}</span>
                <span>{lang === 'fr' ? fmt.fr(e.a, e.b) : fmt.en(e.a, e.b)}</span>
                <span className="admin-feed-when">{ago(e.created, lang)}</span>
              </li>
            )
          })}
        </ul>
      </section>

      </>
      )}

      {(onglet === 'comptes' || onglet === 'apercu') && (
      <>
      {/* Comptes */}
      <section className="relic-series group-card">
        <header className="relic-series-head">
          <h4 className="relic-series-name">👤 {t('adminUsers', { n: data.users.length })}</h4>
        </header>
        <div className="matrix-wrap">
          <table className="matrix admin-table">
            <thead>
              <tr>
                <th>{t('adminColName')}</th>
                <th>{t('adminColCreated')}</th>
                <th>{t('adminColChars')}</th>
                <th>{t('adminColGroups')}</th>
                <th>{t('adminColFriends')}</th>
                <th>{t('adminColSuggSent')}</th>
                <th>{t('adminColLastSeen')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id}>
                  <td className="admin-name">
                    {u.avatar && <img src={u.avatar} alt="" width={22} height={22} />}
                    {u.name}
                  </td>
                  <td>{new Date(u.created).toLocaleDateString(lang)}</td>
                  <td>{u.verifiedChars}</td>
                  <td>{u.ownedGroups}</td>
                  <td>{u.friends}</td>
                  <td>{u.suggSent}</td>
                  <td>{ago(u.lastSeen, lang)}</td>
                  <td>
                    <button
                      className="btn btn-ghost btn-mini admin-danger"
                      disabled={busy !== null}
                      onClick={() =>
                        void action(
                          u.id,
                          `/admin/user/${encodeURIComponent(u.id)}`,
                          'DELETE',
                          t('adminUserDeleteConfirm', { name: u.name }),
                        )
                      }
                    >
                      <TabIcon k="del" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Personnages */}
      <section className="relic-series group-card">
        <header className="relic-series-head">
          <h4 className="relic-series-name">
            ⚔️ {t('adminChars', { n: data.characters.length })}
          </h4>
          <span className="admin-sources">
            {t('adminSources', {
              lodestone: srcs.lodestone ?? 0,
              user: srcs.user ?? 0,
              seed: srcs.seed ?? 0,
              empty: srcs.empty ?? 0,
            })}
          </span>
        </header>
        <div className="matrix-wrap">
          <table className="matrix admin-table">
            <thead>
              <tr>
                <th>{t('adminColName')}</th>
                <th>{t('adminColServer')}</th>
                <th>{t('adminColOwner')}</th>
                <th>{t('adminColChecked')}</th>
                <th>{t('adminColUpdated')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.characters.map((c) => (
                <tr key={c.id}>
                  <td className="admin-name">
                    <a
                      href={`https://eu.finalfantasyxiv.com/lodestone/character/${c.id}/`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {c.name}
                    </a>
                  </td>
                  <td>
                    {c.server} [{c.dc}]
                  </td>
                  <td>{c.owner ?? <span className="modal-muted">{t('adminFollowed')}</span>}</td>
                  <td>{c.checked.toLocaleString(lang)}</td>
                  <td>{ago(c.updated, lang)}</td>
                  <td>
                    <button
                      className="btn btn-ghost btn-mini"
                      disabled={busy !== null}
                      title={t('adminCharRefreshTitle')}
                      onClick={() =>
                        void action(String(c.id), `/admin/character/${c.id}/refresh`, 'POST')
                      }
                    >
                      <TabIcon k="sync" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* En attente : suggestions et demandes d'adhésion */}
      {(data.pendingSuggestions.length > 0 || data.pendingRequests.length > 0) && (
        <section className="relic-series group-card">
          <header className="relic-series-head">
            <h4 className="relic-series-name">⏳ {t('adminPending')}</h4>
          </header>
          <ul className="admin-feed">
            {data.pendingRequests.map((r, i) => (
              <li key={`r${i}`} className="admin-feed-row">
                <span className="admin-feed-icon">🚪</span>
                <span>{t('adminPendingRequest', { user: r.user, group: r.group })}</span>
                <span className="admin-feed-when">{ago(r.created, lang)}</span>
              </li>
            ))}
            {data.pendingSuggestions.map((s, i) => (
              <li key={`s${i}`} className="admin-feed-row">
                <span className="admin-feed-icon">💡</span>
                <span>
                  {t('adminPendingSuggestion', { from: s.from, char: s.charName, kind: s.kind })}
                </span>
                <span className="admin-feed-when">{ago(s.created, lang)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      </>
      )}

      {(onglet === 'groupes' || onglet === 'apercu') && (
      <>
      {/* Groupes */}
      <section className="relic-series group-card">
        <header className="relic-series-head">
          <h4 className="relic-series-name">👥 {t('adminGroups', { n: data.groups.length })}</h4>
        </header>
        <div className="matrix-wrap">
          <table className="matrix admin-table">
            <thead>
              <tr>
                <th>{t('adminColName')}</th>
                <th>{t('adminColType')}</th>
                <th>{t('adminColOwner')}</th>
                <th>{t('adminColMembers')}</th>
                <th>{t('adminColCreated')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.groups.map((g) => (
                <tr key={g.id}>
                  <td className="admin-name">{g.name}</td>
                  <td>{g.shared ? '🔗 online' : '📁 offline'}</td>
                  <td>{g.owner}</td>
                  <td>{g.members}</td>
                  <td>{new Date(g.created).toLocaleDateString(lang)}</td>
                  <td>
                    <button
                      className="btn btn-ghost btn-mini admin-danger"
                      disabled={busy !== null}
                      onClick={() =>
                        void action(
                          g.id,
                          `/admin/group/${g.id}`,
                          'DELETE',
                          t('adminGroupDeleteConfirm', { name: g.name }),
                        )
                      }
                    >
                      <TabIcon k="del" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      </>
      )}
    </div>
  )
}
