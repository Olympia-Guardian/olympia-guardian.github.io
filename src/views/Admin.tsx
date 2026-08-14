// Tableau de bord super-admin : vue d'ensemble de l'application (comptes,
// persos, groupes, activité) et actions ciblées — visible du seul compte
// ADMIN_USER_ID (le worker répond 404 à tous les autres).

import { useCallback, useEffect, useState } from 'react'
import { WORKER_API } from '../api'
import { useI18n } from '../i18n'
import { StatTile } from '../ui'

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
  }[]
  groups: {
    id: string
    name: string
    shared: boolean
    created: number
    owner: string
    members: number
  }[]
}

/** « il y a 3 h » compact — l'admin veut jauger la fraîcheur d'un œil. */
function ago(ts: number | null, lang: string): string {
  if (!ts) return '—'
  const mn = Math.round((Date.now() - ts) / 60_000)
  if (mn < 1) return lang === 'fr' ? 'à l’instant' : 'just now'
  if (mn < 60) return `${mn} min`
  const h = Math.round(mn / 60)
  if (h < 48) return `${h} h`
  return `${Math.round(h / 24)} j`
}

export function AdminPage({ token }: { token: string }) {
  const { lang, t } = useI18n()
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${WORKER_API}/admin/overview`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(String(res.status))
      setData(await res.json())
      setError(false)
    } catch {
      setError(true)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  async function action(label: string, path: string, method: string, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return
    setBusy(label)
    try {
      await fetch(`${WORKER_API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
      })
      await load()
    } finally {
      setBusy(null)
    }
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
            🧹 {t('adminPurge')}
          </button>
          <button className="btn btn-ghost btn-mini" onClick={() => void load()}>
            ⟳ {t('adminReload')}
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
                      🗑
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
                    {c.dc} — {c.server}
                  </td>
                  <td>{c.owner ?? <span className="modal-muted">{t('adminFollowed')}</span>}</td>
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
                      ⟳
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

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
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
