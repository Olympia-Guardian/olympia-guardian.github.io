import type { Fournisseur } from '../auth'
import { useI18n } from '../i18n'
import { TabIcon } from '../ui'

// Page de connexion. Un bouton perdu dans la barre du haut n'explique rien :
// ni ce qu'un compte apporte, ni ce qui distingue les trois portes, ni ce
// qu'on garde de vous. Surtout, personne ne devinerait seul que passer par
// XIVAuth dispense de recopier un code sur son profil Lodestone.

interface Porte {
  cle: Fournisseur
  icone: string
  /** Mise en avant : la porte qui fait gagner une manipulation entière. */
  phare?: boolean
}

const PORTES: Porte[] = [
  { cle: 'xivauth', icone: 'lodestone', phare: true },
  { cle: 'discord', icone: 'login' },
  { cle: 'google', icone: 'account' },
]

export function LoginPage({
  fournisseurs,
  onLogin,
  onGuide,
}: {
  /** Ceux que le serveur a réellement configurés. */
  fournisseurs: Fournisseur[]
  onLogin: (f: Fournisseur) => void
  onGuide: () => void
}) {
  const { t } = useI18n()
  const dispo = PORTES.filter((p) => fournisseurs.includes(p.cle))

  return (
    <div className="view login-view">
      <h2>{t('loginPageTitle')}</h2>
      <p className="login-lead">
        {t('loginPageLead')}
        {/* La promesse ne s'affiche que si la porte qui la tient existe. */}
        {fournisseurs.includes('xivauth') && ` ${t('loginPageLeadXiv')}`}
      </p>

      <div className="login-doors">
        {dispo.map((p) => (
          <button
            key={p.cle}
            className={`login-door ${p.phare ? 'is-featured' : ''}`}
            onClick={() => onLogin(p.cle)}
          >
            <span className="login-door-head">
              <TabIcon k={p.icone} />
              <b>{t(`loginWith_${p.cle}` as 'loginWith_discord')}</b>
              {p.phare && <span className="chip chip-todo">{t('loginBest')}</span>}
            </span>
            <span className="login-door-body">
              {t(`loginWhy_${p.cle}` as 'loginWhy_discord')}
            </span>
          </button>
        ))}
      </div>

      <section className="group-card login-note">
        <h3>{t('loginPrivacyTitle')}</h3>
        <p>{t('loginPrivacyBody')}</p>
        <p className="muted">{t('loginPrivacyDelete')}</p>
      </section>

      <p className="muted login-guest">
        {t('loginGuest')}{' '}
        <button className="footer-link" onClick={onGuide}>
          {t('guideTitle')}
        </button>
      </p>
    </div>
  )
}
