// Panneau de la cloche : invitations de groupe, demandes d'ami et suggestions
// reçues — chacune à accepter ou refuser (les suggestions aussi en masse).

import { useEffect, useState } from 'react'
import { fetchCharacter, type Kind, type RelicDb } from './api'
import type { CrossSuggestion } from './crossOutfits'
import type { ApiFriendRequest, ApiGroupInvite, ApiSuggestion } from './groupsApi'
import { kindLabel, useI18n } from './i18n'
import type { Db } from './store'
import { onItemImgError } from './ui'

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

function SuggestionRow({
  s,
  db,
  relicDb,
  showChar,
  onResolve,
}: {
  s: ApiSuggestion
  db: Db | null
  relicDb: RelicDb | null
  showChar: boolean
  onResolve: (accept: boolean) => void
}) {
  const { lang, t } = useI18n()
  const charName = useCharName(s.charId)
  const item =
    s.kind === 'relics'
      ? relicDb?.relics.find((r) => r.id === s.itemId)
      : db?.[s.kind as Kind]?.find((i) => i.id === s.itemId)
  const name = item ? (lang === 'fr' ? item.name : item.nameEn) : `#${s.itemId}`
  const icon = item?.icon
  const kindText = s.kind === 'relics' ? t('relicsTab') : kindLabel(lang, s.kind as Kind, 'one')
  return (
    <div className="notif-row">
      {icon && <img src={icon} alt="" width={28} height={28} loading="lazy" onError={onItemImgError} />}
      <span className="notif-text">
        <b>{name}</b>
        <small>
          {kindText} · {t('suggestedBy', { name: s.from })}
          {showChar && charName ? ` → ${charName}` : ''}
          {(s.kind === 'mounts' || s.kind === 'minions') && ` · ${t('suggTemp')}`}
        </small>
      </span>
      <span className="notif-actions">
        <button className="btn btn-primary btn-mini" title={t('requestApprove')} onClick={() => onResolve(true)}>
          ✓
        </button>
        <button className="btn btn-ghost btn-mini" title={t('requestReject')} onClick={() => onResolve(false)}>
          ✗
        </button>
      </span>
    </div>
  )
}

/** Invitation directe dans un groupe : accepter avec un perso vérifié. */
function GroupInviteRow({
  invite,
  verifiedIds,
  onRespond,
}: {
  invite: ApiGroupInvite
  verifiedIds: number[]
  onRespond: (accept: boolean, charId?: number) => void
}) {
  const { t } = useI18n()
  const [charId, setCharId] = useState(verifiedIds[0] ?? 0)
  return (
    <div className="notif-row">
      <span className="notif-text">
        <b>{invite.groupName}</b>
        <small>{t('groupInviteBy', { name: invite.from })}</small>
      </span>
      <span className="notif-actions">
        {verifiedIds.length > 1 && (
          <select value={charId} onChange={(e) => setCharId(Number(e.target.value))}>
            {verifiedIds.map((id) => (
              <InviteCharOption key={id} charId={id} />
            ))}
          </select>
        )}
        <button
          className="btn btn-primary btn-mini"
          title={t('requestApprove')}
          disabled={verifiedIds.length === 0}
          onClick={() => onRespond(true, charId)}
        >
          ✓
        </button>
        <button className="btn btn-ghost btn-mini" title={t('requestReject')} onClick={() => onRespond(false)}>
          ✗
        </button>
      </span>
    </div>
  )
}

function InviteCharOption({ charId }: { charId: number }) {
  const name = useCharName(charId)
  return <option value={charId}>{name ?? `#${charId}`}</option>
}

export function NotificationsPanel({
  suggestions,
  friendRequests,
  groupInvites,
  crossItems,
  verifiedIds,
  db,
  relicDb,
  onResolve,
  onRespondFriend,
  onRespondInvite,
  onRespondCross,
  onClose,
}: {
  suggestions: ApiSuggestion[]
  friendRequests: ApiFriendRequest[]
  groupInvites: ApiGroupInvite[]
  /** Reports possibles entre tenues et armoire (calculés côté navigateur). */
  crossItems: CrossSuggestion[]
  verifiedIds: number[]
  db: Db | null
  relicDb: RelicDb | null
  onResolve: (ids: number[], accept: boolean) => void
  onRespondFriend: (userId: string, accept: boolean) => void
  onRespondInvite: (groupId: string, accept: boolean, charId?: number) => void
  onRespondCross: (item: CrossSuggestion, accept: boolean) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const showChar = new Set(suggestions.map((s) => s.charId)).size > 1
  const total =
    suggestions.length + friendRequests.length + groupInvites.length + crossItems.length
  const plusieursPersos = new Set(crossItems.map((c) => c.charId)).size > 1
  return (
    <div className="notif-panel">
      <div className="notif-head">
        <b>{t('bellPanelTitle', { n: total })}</b>
        <button className="icon-btn" title={t('close')} onClick={onClose}>
          ×
        </button>
      </div>
      {groupInvites.length > 0 && (
        <>
          <p className="notif-section">{t('groupInvitesTitle')}</p>
          <div className="notif-list">
            {groupInvites.map((inv) => (
              <GroupInviteRow
                key={inv.groupId}
                invite={inv}
                verifiedIds={verifiedIds}
                onRespond={(accept, charId) => onRespondInvite(inv.groupId, accept, charId)}
              />
            ))}
          </div>
        </>
      )}
      {crossItems.length > 0 && (
        <>
          <p className="notif-section">{t('crossTitle')}</p>
          <div className="notif-list">
            {crossItems.map((c) => (
              <div className="notif-row" key={c.key}>
                <span className="notif-text">
                  <b>{c.outfitName}</b>
                  <small>
                    {t(c.target === 'armoires' ? 'crossToArmoire' : 'crossToOutfit', {
                      n: c.ids.length,
                    })}
                    {plusieursPersos ? ` (${c.charName})` : ''}
                  </small>
                </span>
                <button className="btn btn-primary" onClick={() => onRespondCross(c, true)}>
                  {t('crossYes')}
                </button>
                <button className="btn ghost" onClick={() => onRespondCross(c, false)}>
                  {t('crossNo')}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      {friendRequests.length > 0 && (
        <>
          <p className="notif-section">{t('friendRequestsTitle')}</p>
          <div className="notif-list">
            {friendRequests.map((fr) => (
              <div className="notif-row" key={fr.userId}>
                {fr.avatar && <img src={fr.avatar} alt="" width={28} height={28} className="notif-avatar" />}
                <span className="notif-text">
                  <b>{fr.name}</b>
                  <small>{t('friendRequestWants')}</small>
                </span>
                <span className="notif-actions">
                  <button
                    className="btn btn-primary btn-mini"
                    title={t('requestApprove')}
                    onClick={() => onRespondFriend(fr.userId, true)}
                  >
                    ✓
                  </button>
                  <button
                    className="btn btn-ghost btn-mini"
                    title={t('requestReject')}
                    onClick={() => onRespondFriend(fr.userId, false)}
                  >
                    ✗
                  </button>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      {total === 0 ? (
        <p className="notif-empty">{t('suggestionsEmpty')}</p>
      ) : suggestions.length === 0 ? null : (
        <>
          {(friendRequests.length > 0 || groupInvites.length > 0) && (
            <p className="notif-section">{t('suggestionsSection')}</p>
          )}
          <div className="notif-bulk">
            <button
              className="btn btn-primary btn-mini"
              onClick={() => onResolve(suggestions.map((s) => s.id), true)}
            >
              ✓ {t('acceptAll')}
            </button>
            <button
              className="btn btn-ghost btn-mini"
              onClick={() => onResolve(suggestions.map((s) => s.id), false)}
            >
              ✗ {t('refuseAll')}
            </button>
          </div>
          <div className="notif-list">
            {suggestions.map((s) => (
              <SuggestionRow
                key={s.id}
                s={s}
                db={db}
                relicDb={relicDb}
                showChar={showChar}
                onResolve={(accept) => onResolve([s.id], accept)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
