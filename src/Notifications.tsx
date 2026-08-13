// Panneau de la cloche : suggestions reçues, à accepter (l'objet est coché)
// ou refuser — unitairement ou en masse.

import { useEffect, useState } from 'react'
import { fetchCharacter, type Kind, type RelicDb } from './api'
import type { ApiSuggestion } from './groupsApi'
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

export function NotificationsPanel({
  suggestions,
  db,
  relicDb,
  onResolve,
  onClose,
}: {
  suggestions: ApiSuggestion[]
  db: Db | null
  relicDb: RelicDb | null
  onResolve: (ids: number[], accept: boolean) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const showChar = new Set(suggestions.map((s) => s.charId)).size > 1
  return (
    <div className="notif-panel">
      <div className="notif-head">
        <b>{t('suggestionsTitle', { n: suggestions.length })}</b>
        <button className="icon-btn" title={t('close')} onClick={onClose}>
          ×
        </button>
      </div>
      {suggestions.length === 0 ? (
        <p className="notif-empty">{t('suggestionsEmpty')}</p>
      ) : (
        <>
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
