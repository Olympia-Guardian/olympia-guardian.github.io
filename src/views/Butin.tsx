import { useMemo, useState } from 'react'
import { iconeObjet, type Character, type RaidPalier } from '../api'
import { useI18n } from '../i18n'
import { ErreurBis, etages, importerBis, rangerBis, type Bis, type Vise } from '../raid'
import { nomCourt, type Member } from '../store'
import { onAvatarImgError, onItemImgError } from '../ui'

type Ready = Member & { data: Character }

// ---------------------------------------------------------------------------
// « Combien de kills reste-t-il ? »
//
// C'est la seule question qu'un static se pose devant un palier. Pas un
// inventaire : un nombre de soirées. Elle est donc en haut, avant tout le reste.
//
// En dessous, une carte par joueur. Ce que chacun vise ne se saisit pas : il l'a
// déjà écrit dans son BiS, on colle le lien et le catalogue du palier range les
// douze pièces tout seul. Le seul geste qui reste est celui qui ne se déduit
// d'aucune donnée : « je l'ai obtenue ».
// ---------------------------------------------------------------------------

export function Butin({
  palier,
  ready,
  bis,
  peutModifier,
  onImport,
  onBascule,
}: {
  palier: RaidPalier
  ready: Ready[]
  /** BiS du palier, par personnage. Absent tant que rien n'a été importé. */
  bis: Record<number, Bis | undefined>
  /** Qui peut toucher à la carte de ce personnage. */
  peutModifier: (charId: number) => boolean
  onImport: (charId: number, bis: Bis) => Promise<void>
  onBascule: (charId: number, id: number, fait: boolean) => void
}) {
  const { lang, t } = useI18n()

  const cartes = useMemo(
    () =>
      ready.map((m) => ({
        membre: m,
        vises: rangerBis(palier, bis[m.id] ?? null, m.data.raidFait),
      })),
    [ready, palier, bis],
  )

  const parEtage = useMemo(
    () => etages(cartes.map((c) => ({ charId: c.membre.id, vises: c.vises }))),
    [cartes],
  )

  const nomDe = (charId: number) => {
    const c = cartes.find((x) => x.membre.id === charId)
    return c ? nomCourt(c.membre) : ''
  }

  return (
    <div className="view">
      <p className="muted">{t('butinIntro', { palier: lang === 'fr' ? palier.fr : palier.en })}</p>

      {/* La réponse, en haut, lisible sans défiler. */}
      <div className="kills-row">
        {parEtage.map((e) => (
          <section key={e.etage} className={`kills-card ${e.kills === 0 ? 'is-done' : ''}`}>
            <header>
              <b>{t('butinFloor', { n: e.etage })}</b>
              <span className="kills-n">{e.kills}</span>
            </header>
            <p className="kills-label">
              {e.kills === 0 ? t('butinDone') : t('butinKills', { n: e.kills })}
            </p>
            {e.parJoueur.length > 0 && (
              <ul className="kills-detail">
                {e.parJoueur.map((j) => (
                  <li key={j.charId}>
                    <b>{nomDe(j.charId)}</b>{' '}
                    {j.emplacements.map((x) => (lang === 'fr' ? x.fr : x.en)).join(', ')}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <div className="bis-cards">
        {cartes.map((c) => (
          <CarteJoueur
            key={c.membre.id}
            membre={c.membre}
            vises={c.vises}
            bis={bis[c.membre.id]}
            modifiable={peutModifier(c.membre.id)}
            onImport={(b) => onImport(c.membre.id, b)}
            onBascule={(id, fait) => onBascule(c.membre.id, id, fait)}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function CarteJoueur({
  membre,
  vises,
  bis,
  modifiable,
  onImport,
  onBascule,
}: {
  membre: Ready
  vises: Vise[]
  bis: Bis | undefined
  modifiable: boolean
  onImport: (bis: Bis) => Promise<void>
  onBascule: (id: number, fait: boolean) => void
}) {
  const { t } = useI18n()
  const [saisie, setSaisie] = useState(false)
  const reste = vises.filter((v) => v.etat === 'attendu').length

  return (
    <section className="bis-card">
      <header className="bis-head">
        <img
          className="bis-avatar"
          src={membre.data.avatar}
          alt=""
          width={44}
          height={44}
          onError={onAvatarImgError}
        />
        <div className="bis-qui">
          <b>{nomCourt(membre)}</b>
          {bis && (
            <span className="bis-set">
              {bis.job && <span className="bis-job">{bis.job}</span>}
              {bis.url ? (
                <a href={bis.url} target="_blank" rel="noreferrer">
                  {bis.nom || 'Etro'}
                </a>
              ) : (
                bis.nom
              )}
            </span>
          )}
        </div>
        <span className={`bis-reste ${reste === 0 ? 'is-done' : ''}`}>
          {reste === 0 ? t('bisRien') : t('bisReste', { n: reste })}
        </span>
      </header>

      {bis && !saisie && (
        <ul className="bis-slots">
          {vises.map((v) => (
            <Pastille
              key={v.emplacement.cle}
              vise={v}
              modifiable={modifiable}
              onBascule={onBascule}
            />
          ))}
        </ul>
      )}

      {(!bis || saisie) && (
        <Import
          modifiable={modifiable}
          annulable={!!bis}
          onAnnuler={() => setSaisie(false)}
          onImport={async (b) => {
            await onImport(b)
            setSaisie(false)
          }}
        />
      )}

      {bis && !saisie && modifiable && (
        <button type="button" className="btn-ghost bis-remplacer" onClick={() => setSaisie(true)}>
          {t('bisRemplacer')}
        </button>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------

function Pastille({
  vise,
  modifiable,
  onBascule,
}: {
  vise: Vise
  modifiable: boolean
  onBascule: (id: number, fait: boolean) => void
}) {
  const { lang, t } = useI18n()
  const { emplacement, pieces, inconnus, etat } = vise
  const piece = pieces[0]

  // Ce que la pastille montre : la pièce visée, pas une étiquette abstraite.
  // Faute de BiS pour cette case, on nomme au moins l'emplacement.
  const nom = piece
    ? lang === 'fr'
      ? piece.fr
      : piece.en
    : lang === 'fr'
      ? emplacement.fr
      : emplacement.en

  // La provenance en toutes lettres. Un emplacement attendu affiche son étage :
  // c'est ce qu'on veut savoir devant un tableau de raid.
  const ou =
    etat === 'attendu'
      ? t('butinFloor', { n: emplacement.etage })
      : etat === 'fait'
        ? t('bisObtenue')
        : pieces.length > 0
          ? t('bisTome')
          : inconnus.length > 0
            ? t('bisAilleurs')
            : t('bisVideSlot')

  const cliquable = modifiable && (etat === 'attendu' || etat === 'fait')
  const infobulle = !modifiable
    ? t('bisPasLeDroit')
    : etat === 'attendu'
      ? t('bisClicPrendre')
      : etat === 'fait'
        ? t('bisClicRendre')
        : ''

  return (
    <li className={`bis-slot est-${etat}`}>
      <button
        type="button"
        disabled={!cliquable}
        title={infobulle}
        onClick={() => onBascule(emplacement.id, etat !== 'fait')}
      >
        <img
          src={piece ? iconeObjet(piece.icone) : emplacement.icon}
          alt=""
          width={32}
          height={32}
          loading="lazy"
          onError={onItemImgError}
        />
        <span className="bis-slot-texte">
          <span className="bis-slot-nom">{nom}</span>
          <span className="bis-slot-ou">{ou}</span>
        </span>
      </button>
      {/* Le paladin reçoit son bouclier dans le même coffre que son arme : un
          seul butin, donc une seule pastille, mais les deux pièces se disent. */}
      {pieces.length > 1 && (
        <span className="bis-slot-bis">{lang === 'fr' ? pieces[1].fr : pieces[1].en}</span>
      )}
    </li>
  )
}

// ---------------------------------------------------------------------------

function Import({
  modifiable,
  annulable,
  onAnnuler,
  onImport,
}: {
  modifiable: boolean
  annulable: boolean
  onAnnuler: () => void
  onImport: (bis: Bis) => Promise<void>
}) {
  const { t } = useI18n()
  const [lien, setLien] = useState('')
  const [encours, setEncours] = useState(false)
  const [erreur, setErreur] = useState('')

  if (!modifiable) return <p className="empty bis-vide">{t('bisAucun')}</p>

  async function envoyer(e: React.FormEvent) {
    e.preventDefault()
    setErreur('')
    setEncours(true)
    try {
      await onImport(await importerBis(lien))
      setLien('')
    } catch (err) {
      // Le message d'erreur EST une clé de traduction : l'import parle la
      // langue de la vue, sans que la vue ait à connaître ses cas d'échec.
      const cle = err instanceof ErreurBis ? err.message : 'bisEchecEcriture'
      setErreur(t(cle as 'bisLienInvalide'))
    } finally {
      setEncours(false)
    }
  }

  return (
    <form className="bis-import" onSubmit={envoyer}>
      <p className="muted">{t('bisAide')}</p>
      <div className="bis-import-ligne">
        <input
          type="url"
          value={lien}
          placeholder="https://etro.gg/gearset/..."
          onChange={(e) => setLien(e.target.value)}
          required
        />
        <button type="submit" className="btn-primary" disabled={encours || !lien.trim()}>
          {encours ? t('bisEnCours') : t('bisImporter')}
        </button>
        {annulable && (
          <button type="button" className="btn-ghost" onClick={onAnnuler}>
            {t('bisAnnuler')}
          </button>
        )}
      </div>
      {erreur && <p className="bis-erreur">{erreur}</p>}
    </form>
  )
}
