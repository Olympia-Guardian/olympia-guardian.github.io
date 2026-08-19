import { useState, type FormEvent, type ReactNode } from 'react'
import { parseLodestoneId, type Kind } from './api'
import { kindLabel, useI18n, type I18n } from './i18n'
import type { Member } from './store'
import { nomMembre } from './store'
import { Meter, onAvatarImgError } from './ui'

function relativeDate(iso: string, t: I18n['t']): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return t('today')
  if (days === 1) return t('yesterday')
  return t('daysAgo', { n: days })
}

// Treize jauges par joueur rendraient la colonne illisible : on affiche celle
// de la collection consultée, plus les deux qui viennent du Lodestone.
function PlayerCard({
  member,
  focus,
  present,
  activeKind,
  onTogglePresence,
}: {
  member: Member
  focus?: boolean
  present: boolean
  activeKind?: Kind | 'fashion'
  onTogglePresence?: () => void
}) {
  const { lang, t } = useI18n()
  if (member.status === 'loading') {
    return (
      <div className="player-card is-loading">
        <div className="player-skeleton" />
        <div className="player-name muted">{t('loading')}</div>
      </div>
    )
  }
  if (member.status === 'error' || !member.data) {
    return (
      <div className="player-card is-error">
        <div className="player-head">
          <span className="player-name">ID {member.id}</span>
          <span className="player-actions" />
        </div>
        <p className="player-error">{member.error ?? t('loadError')}</p>
      </div>
    )
  }
  const c = member.data
  const somePrivate = !c.mounts.isPublic || !c.minions.isPublic
  return (
    <div className={`player-card ${focus ? 'is-focus' : ''} ${present ? '' : 'is-absent'}`}>
      <div className="player-head">
        <img className="player-avatar" src={c.avatar} alt="" width={38} height={38} onError={onAvatarImgError} />
        <div className="player-id">
          <a
            className="player-name"
            href={`https://ffxivcollect.com/characters/${c.id}`}
            target="_blank"
            rel="noreferrer"
            title={t('syncedAgo', { when: relativeDate(c.lastParsed, t) })}
          >
            {nomMembre(member)}
          </a>
          <span className="player-server">{c.server}</span>
        </div>
        <span className="player-actions">
          {onTogglePresence && (
            <button
              className={`icon-btn presence-btn ${present ? 'is-on' : ''}`}
              title={present ? t('presentTitle') : t('absentTitle')}
              onClick={onTogglePresence}
            >
              {present ? '🎮' : '💤'}
            </button>
          )}
        </span>
      </div>
      {/* Une seule jauge : celle de l'onglet ouvert. Sur les autres onglets
          (Planning, Avancement), la carte reste sobre — pas de jauge. L'onglet
          « Mode » somme ses trois collections. */}
      {activeKind && (
        <div className="meter-grid">
          <Meter
            label={
              activeKind === 'fashion' ? t('fashionFamily') : kindLabel(lang, activeKind, 'short')
            }
            count={
              activeKind === 'fashion'
                ? c.fashions.count + c.facewear.count + c.hairstyles.count
                : c[activeKind].count
            }
            total={
              activeKind === 'fashion'
                ? c.fashions.total + c.facewear.total + c.hairstyles.total
                : c[activeKind].total
            }
          />
        </div>
      )}
      {(c.cards.count === 0 || c.fashions.count === 0) && (
        <p className="player-note" title={t('playerNoteTitle')}>
          {t('playerNote')}
        </p>
      )}
      {somePrivate && (
        <p className="player-warning" title={t('privateTitle')}>
          {t('privateCollection')}
        </p>
      )}
    </div>
  )
}

export function RosterBar({
  members,
  controls,
  focusId,
  absent,
  activeKind,
  collapsed,
  onToggleCollapsed,
  onTogglePresence,
  onResetPresence,
  onAdd,
}: {
  members: Member[]
  controls?: ReactNode
  focusId: number | null
  absent: number[]
  /** Collection consultée : sa jauge s'ajoute aux cartes des joueurs. */
  activeKind?: Kind | 'fashion'
  collapsed: boolean
  onToggleCollapsed: () => void
  onTogglePresence: (id: number) => void
  onResetPresence: () => void
  /** Absent : le groupe actif n'est pas éditable — le formulaire d'ajout disparaît. */
  onAdd?: (id: number) => void
}) {
  const { t } = useI18n()
  const [input, setInput] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    const id = parseLodestoneId(input)
    if (id === null) {
      setInputError(t('addError'))
      return
    }
    setInputError(null)
    setInput('')
    onAdd?.(id)
  }

  const presentCount = members.length - absent.length

  if (collapsed) {
    return (
      <aside className="sidebar rail">
        <button className="icon-btn rail-toggle" title={t('expandRoster')} onClick={onToggleCollapsed}>
          »
        </button>
        {members.map((m) =>
          m.status === 'ok' && m.data ? (
            <img
              key={m.id}
              src={m.data.avatar}
              alt={nomMembre(m)}
              title={`${nomMembre(m)}${absent.includes(m.id) ? ' ' + t('awayTonight') : ''}`}
              width={34}
              height={34}
              className={`rail-face ${m.id === focusId ? 'is-focus' : ''} ${
                absent.includes(m.id) ? 'is-absent' : ''
              }`}
              onError={onAvatarImgError}
            />
          ) : (
            <span key={m.id} className="rail-face rail-pending" title={`ID ${m.id}`}>
              …
            </span>
          ),
        )}
      </aside>
    )
  }

  return (
    <aside className={`sidebar ${focusId !== null ? 'has-focus' : ''}`}>
      <div className="sidebar-head">
        <span className="sidebar-title">
          {members.length === 1 ? (
            t('soloChar')
          ) : (
            <>
              {t('team')} · {members.length}
              {absent.length > 0 && (
                <span className="sidebar-presence">
                  {' · '}
                  {t(presentCount > 1 ? 'presents' : 'present', { n: presentCount })}
                </span>
              )}
            </>
          )}
        </span>
        {absent.length > 0 && (
          <button className="btn btn-ghost btn-mini" onClick={onResetPresence} title={t('allHereTitle')}>
            {t('allHere')}
          </button>
        )}
        <button className="icon-btn" title={t('collapseRoster')} onClick={onToggleCollapsed}>
          «
        </button>
      </div>
      {controls}
      {members.map((m) => (
        <PlayerCard
          key={m.id}
          member={m}
          focus={m.id === focusId}
          present={!absent.includes(m.id)}
          activeKind={activeKind}
          onTogglePresence={members.length > 1 ? () => onTogglePresence(m.id) : undefined}
        />
      ))}
      {onAdd && (
      <form className="player-card add-card" onSubmit={submit}>
        <label className="add-label" htmlFor="add-input">
          {t('addChar')}
        </label>
        <input
          id="add-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('addPlaceholder')}
          spellCheck={false}
        />
        <button type="submit" className="btn btn-primary">
          {t('add')}
        </button>
        {inputError ? (
          <p className="add-error">{inputError}</p>
        ) : (
          <p className="add-hint">
            {t('addHintPre')}{' '}
            <a
              href="https://eu.finalfantasyxiv.com/lodestone/community/search/"
              target="_blank"
              rel="noreferrer"
            >
              Lodestone
            </a>
            &nbsp;: …/lodestone/character/<b>12345678</b>/
          </p>
        )}
      </form>
      )}
    </aside>
  )
}
