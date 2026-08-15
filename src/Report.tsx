import { useState } from 'react'
import { WORKER_API } from './api'
import { authHeaders } from './auth'
import { useI18n } from './i18n'

// Formulaire de signalement. L'anti-robot n'est pas un captcha : il faut un
// compte connecté, ce qu'un automate n'a pas, et le worker impose en plus un
// quota par compte, une longueur minimale et un champ piège invisible.

const MIN = 10
const MAX = 2000

export function ReportDialog({
  token,
  tab,
  charId,
  onClose,
}: {
  token: string
  /** Écran depuis lequel le signalement part : le contexte que personne ne pense à donner. */
  tab: string
  charId: number | null
  onClose: () => void
}) {
  const { t } = useI18n()
  const [message, setMessage] = useState('')
  // Champ piège : caché à l'écran, donc rempli seulement par un automate.
  const [piege, setPiege] = useState('')
  const [etat, setEtat] = useState<'saisie' | 'envoi' | 'envoye' | 'erreur' | 'quota'>('saisie')

  async function envoyer() {
    if (message.trim().length < MIN) return
    setEtat('envoi')
    try {
      const res = await fetch(`${WORKER_API}/report`, {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.trim(), tab, charId, website: piege }),
        signal: AbortSignal.timeout(15000),
      })
      if (res.status === 429) setEtat('quota')
      else if (!res.ok) setEtat('erreur')
      else setEtat('envoye')
    } catch {
      setEtat('erreur')
    }
  }

  return (
    <div className="report-backdrop" onClick={onClose}>
      <div className="report-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="report-head">
          <b>{t('reportTitle')}</b>
          <button className="icon-btn" title={t('close')} onClick={onClose}>
            ×
          </button>
        </div>

        {etat === 'envoye' ? (
          <>
            <p className="report-ok">{t('reportThanks')}</p>
            <button className="btn btn-primary" onClick={onClose}>
              {t('close')}
            </button>
          </>
        ) : (
          <>
            <p className="muted">{t('reportIntro')}</p>
            <textarea
              className="report-text"
              rows={6}
              maxLength={MAX}
              value={message}
              placeholder={t('reportPlaceholder')}
              onChange={(e) => setMessage(e.target.value)}
            />
            {/* Piège : invisible et hors du parcours clavier, un humain ne le
                voit jamais, un automate le remplit. */}
            <input
              className="report-trap"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={piege}
              onChange={(e) => setPiege(e.target.value)}
            />
            <div className="report-foot">
              <span className="muted">
                {message.trim().length}/{MAX}
              </span>
              <button
                className="btn btn-primary"
                disabled={message.trim().length < MIN || etat === 'envoi'}
                onClick={envoyer}
              >
                {etat === 'envoi' ? t('reportSending') : t('reportSend')}
              </button>
            </div>
            {etat === 'quota' && <p className="notice">{t('reportQuota')}</p>}
            {etat === 'erreur' && <p className="notice">{t('reportError')}</p>}
          </>
        )}
      </div>
    </div>
  )
}
