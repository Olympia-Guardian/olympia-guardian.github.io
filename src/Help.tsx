import { lsGet, lsRemove, lsSet } from './storage'
// Aide active façon FFXIV : une petite fenêtre apparaît à la PREMIÈRE visite
// de chaque écran (« Ne plus afficher » implicite : fermer = vu), et la page
// Guide regroupe tous les sujets, relisibles à volonté.

import { useEffect, useState } from 'react'
import { FLAGS_ALLUMES, type Flags } from './flags'
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
  { key: 'butin', icon: 'raid', title: 'helpButinTitle', body: 'helpButinBody' },
  { key: 'market', icon: 'market', title: 'helpMarketTitle', body: 'helpMarketBody' },
  { key: 'bell', icon: 'bell', title: 'helpBellTitle', body: 'helpBellBody' },
]

/** L'interrupteur qui commande un sujet, quand il y en a un. Un guide qui
 *  decrit une fonctionnalite eteinte fait chercher un ecran qui n'existe plus. */
const SUJET_INTERRUPTEUR: Record<string, keyof Flags> = {
  butin: 'raid',
  market: 'market',
}

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

/** Où en est le joueur. Le guide s'en sert pour cocher ce qui est fait : une
 *  marche déjà franchie ne se relit pas, et voir trois coches sur cinq dit
 *  mieux « il reste ça » que n'importe quelle phrase. */
export interface Avancement {
  connecte: boolean
  perso: boolean
  groupe: boolean
  raid: boolean
}

/** Les premiers pas, dans l'ordre. Le guide décrivait chaque écran sans jamais
 *  dire par où commencer : neuf paragraphes, tous vrais, et aucun chemin. */
const ETAPES: { cle: keyof Avancement; titre: StrKey; corps: StrKey; onglet: string }[] = [
  { cle: 'connecte', titre: 'pasLoginTitle', corps: 'pasLoginBody', onglet: 'login' },
  { cle: 'perso', titre: 'pasCharTitle', corps: 'pasCharBody', onglet: 'account' },
  { cle: 'groupe', titre: 'pasGroupTitle', corps: 'pasGroupBody', onglet: 'groups' },
  { cle: 'raid', titre: 'pasRaidTitle', corps: 'pasRaidBody', onglet: 'groups' },
]

function PremiersPas({
  avancement,
  flags,
  onAller,
}: {
  avancement: Avancement
  flags: Flags
  onAller?: (onglet: string) => void
}) {
  const { t } = useI18n()
  const etapes = ETAPES.filter((e) => e.cle !== 'raid' || flags.raid)
  const fait = etapes.filter((e) => avancement[e.cle]).length
  // La première marche non franchie : la seule qui compte vraiment, les autres
  // n'étant que du contexte au-dessus et de l'avenir en dessous.
  const courante = etapes.find((e) => !avancement[e.cle])?.cle ?? null

  return (
    <section className="relic-series group-card guide-pas">
      <header className="relic-series-head">
        <h4 className="relic-series-name">{t('pasTitre')}</h4>
        <span className="muted">{t('pasCompte', { n: fait, total: etapes.length })}</span>
      </header>
      <ol>
        {etapes.map((e, i) => {
          const done = avancement[e.cle]
          return (
            <li
              key={e.cle}
              className={`${done ? 'est-fait' : ''} ${courante === e.cle ? 'est-courante' : ''}`}
            >
              <span className="guide-pas-num">{done ? '✓' : i + 1}</span>
              <span className="guide-pas-texte">
                <b>{t(e.titre)}</b>
                <small>{t(e.corps)}</small>
              </span>
              {!done && onAller && (
                <button className="btn btn-mini btn-primary" onClick={() => onAller(e.onglet)}>
                  {t('pasAller')}
                </button>
              )}
            </li>
          )
        })}
      </ol>
      {courante === null && <p className="guide-pas-fini">{t('pasFini')}</p>}
    </section>
  )
}

/** Page Guide : les premiers pas, puis tous les sujets d'aide. */
/** Sujets atteignables sans compte. Les autres décrivent des écrans qu'on ne
 *  peut pas ouvrir : un guide qui parle de ce qu'on ne voit pas donne
 *  l'impression d'avoir raté quelque chose. */
const SUJETS_HORS_COMPTE = ['link', 'planning', 'collections', 'groups']

export function GuidePage({
  connecte = true,
  flags = FLAGS_ALLUMES,
  avancement,
  onAller,
}: {
  connecte?: boolean
  flags?: Flags
  /** Où en est le joueur. Absent, les premiers pas ne s'affichent pas. */
  avancement?: Avancement
  onAller?: (onglet: string) => void
}) {
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
      {avancement && (
        <PremiersPas avancement={avancement} flags={flags} onAller={onAller} />
      )}
      {HELP_TOPICS.filter((h) => {
        // Un sujet sans interrupteur ne s'eteint jamais : le repli sur une cle
        // par defaut aurait fait disparaitre tout le guide le jour ou cette
        // cle-la se trouve eteinte.
        const inter = SUJET_INTERRUPTEUR[h.key]
        if (inter && flags[inter] === false) return false
        return connecte || SUJETS_HORS_COMPTE.includes(h.key)
      }).map((topic) => (
        <section key={topic.key} className="relic-series group-card">
          <header className="relic-series-head">
            <h4 className="relic-series-name">
              <TabIcon k={topic.icon} />{' '}
            {t(!connecte && topic.key === 'groups' ? 'groupsTabAlone' : topic.title)}
            </h4>
          </header>
          <p className="guide-body">
            {t(!connecte && topic.key === 'groups' ? 'helpGroupsAloneBody' : topic.body)}
          </p>
          {!connecte && (topic.key === 'planning' || topic.key === 'collections') && (
            <p className="guide-body muted">{t('guideAloneNote')}</p>
          )}
        </section>
      ))}
    </div>
  )
}
