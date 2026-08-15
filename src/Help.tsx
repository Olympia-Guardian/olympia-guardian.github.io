import { lsGet, lsRemove, lsSet } from './storage'
// Aide active façon FFXIV : une petite fenêtre apparaît à la PREMIÈRE visite
// de chaque écran (« Ne plus afficher » implicite : fermer = vu), et la page
// Guide regroupe tous les sujets, relisibles à volonté.

import { useEffect, useState } from 'react'
import { useI18n, type StrKey } from './i18n'
import { TabIcon } from './ui'

const SEEN_KEY = 'ogs.help.v1'

export const HELP_TOPICS: { key: string; icon: string; title: StrKey; body: StrKey }[] = [
  { key: 'link', icon: 'login', title: 'helpLinkTitle', body: 'helpLinkBody' },
  { key: 'planning', icon: 'planning', title: 'helpPlanningTitle', body: 'helpPlanningBody' },
  { key: 'collections', icon: 'collections', title: 'helpCollectionsTitle', body: 'helpCollectionsBody' },
  { key: 'relics', icon: 'avancement', title: 'helpRelicsTitle', body: 'helpRelicsBody' },
  { key: 'mypage', icon: 'journal', title: 'helpMypageTitle', body: 'helpMypageBody' },
  { key: 'groups', icon: 'groups', title: 'helpGroupsTitle', body: 'helpGroupsBody' },
  { key: 'bell', icon: 'bell', title: 'helpBellTitle', body: 'helpBellBody' },
]

function readSeen(): string[] {
  try {
    const v = JSON.parse(lsGet(SEEN_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

function markSeen(key: string): void {
  try {
    lsSet(SEEN_KEY, JSON.stringify([...new Set([...readSeen(), key])]))
  } catch {
    // pas de persistance : l'aide reviendra, tant pis
  }
}

export function resetSeenHelp(): void {
  try {
    lsRemove(SEEN_KEY)
  } catch {
    // rien à faire
  }
}

/** Fenêtre d'aide contextuelle : apparaît si le sujet n'a jamais été vu. */
export function ActiveHelp({ topicKey }: { topicKey: string | null }) {
  const { t } = useI18n()
  const [visible, setVisible] = useState<string | null>(null)
  useEffect(() => {
    if (!topicKey) {
      setVisible(null)
      return
    }
    setVisible(readSeen().includes(topicKey) ? null : topicKey)
  }, [topicKey])
  const topic = HELP_TOPICS.find((h) => h.key === visible)
  if (!topic) return null
  const dismiss = () => {
    markSeen(topic.key)
    setVisible(null)
  }
  return (
    <aside className="active-help" role="dialog" aria-label={t('helpWindowTitle')}>
      <header className="active-help-head">
        <b>{t('helpWindowTitle')}</b>
        <button className="icon-btn" title={t('close')} onClick={dismiss}>
          ×
        </button>
      </header>
      <h4 className="active-help-title">
        <TabIcon k={topic.icon} /> {t(topic.title)}
      </h4>
      <p className="active-help-body">{t(topic.body)}</p>
      <footer className="active-help-foot">
        <button className="btn btn-primary btn-mini" onClick={dismiss}>
          {t('helpGotIt')}
        </button>
      </footer>
    </aside>
  )
}

/** Page Guide : tous les sujets d'aide, plus le bouton de réinitialisation. */
export function GuidePage() {
  const { t } = useI18n()
  const [resetDone, setResetDone] = useState(false)
  return (
    <div className="view guide-page">
      <div className="groups-head">
        <h2 className="groups-title">
          <TabIcon k="guide" /> {t('guideTitle')}
        </h2>
        <button
          className="btn btn-ghost btn-mini"
          onClick={() => {
            resetSeenHelp()
            setResetDone(true)
          }}
        >
          <TabIcon k="sync" /> {resetDone ? t('guideResetDone') : t('guideResetHelp')}
        </button>
      </div>
      <p className="modal-muted">{t('guideIntro')}</p>
      {HELP_TOPICS.map((topic) => (
        <section key={topic.key} className="relic-series group-card">
          <header className="relic-series-head">
            <h4 className="relic-series-name">
              <TabIcon k={topic.icon} /> {t(topic.title)}
            </h4>
          </header>
          <p className="guide-body">{t(topic.body)}</p>
        </section>
      ))}
    </div>
  )
}
