import { useMemo, useState } from 'react'
import { iconeObjet, type Character, type RaidPalier } from '../api'
import { useI18n } from '../i18n'
import {
  ErreurBis,
  etages,
  etatSuivant,
  importerBis,
  materiauxManquants,
  rangerBis,
  type Bis,
  type Etat,
  type Vise,
} from '../raid'
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
// douze pièces tout seul. Ne restent que les gestes qui ne se déduisent d'aucune
// donnée : « je l'ai obtenue », et pour le mémoquartz « je l'ai achetée », puis
// « je l'ai améliorée ».
//
// Les composants d'amélioration tombent en savage eux aussi, mais au hasard des
// étages : ils se comptent à part, sous les kills, sans jamais se convertir en
// soirées. Un chiffre honnête vaut mieux qu'une prévision inventée.
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
  onBascule: (charId: number, id: number, suivant: Etat) => void
}) {
  const { lang, t } = useI18n()

  const cartes = useMemo(
    () =>
      ready.map((m) => ({
        membre: m,
        vises: rangerBis(palier, bis[m.id] ?? null, m.data.raidFait, m.data.raidAmeliore),
      })),
    [ready, palier, bis],
  )

  const parEtage = useMemo(
    () => etages(cartes.map((c) => ({ charId: c.membre.id, vises: c.vises }))),
    [cartes],
  )

  const composants = useMemo(() => materiauxManquants(palier, cartes), [palier, cartes])

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

      {/* Les composants. Ils coûtent des soirées eux aussi, mais aucune donnée
          ne dit lesquelles : on les compte, on ne les répartit pas. */}
      {composants.length > 0 && (
        <section className="compo-bande">
          <h4>{t('compoTitre')}</h4>
          <ul className="compo-liste">
            {composants.map((c) => (
              <li key={c.materiau.cle}>
                <img
                  src={iconeObjet(c.materiau.icone)}
                  alt=""
                  width={28}
                  height={28}
                  loading="lazy"
                  onError={onItemImgError}
                />
                <span className="compo-nom">
                  {lang === 'fr' ? c.materiau.fr : c.materiau.en}
                </span>
                <b className="compo-n">{c.nombre}</b>
              </li>
            ))}
          </ul>
          <p className="muted">{t('compoAleatoire')}</p>
        </section>
      )}

      <div className="bis-cards">
        {cartes.map((c) => (
          <CarteJoueur
            key={c.membre.id}
            membre={c.membre}
            vises={c.vises}
            bis={bis[c.membre.id]}
            modifiable={peutModifier(c.membre.id)}
            onImport={(b) => onImport(c.membre.id, b)}
            onBascule={(id, suivant) => onBascule(c.membre.id, id, suivant)}
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
  onBascule: (id: number, suivant: Etat) => void
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

/** Ce que dit l'infobulle, état par état. Une table plutôt qu'un nom de clé
 *  fabriqué : les états portent des traits d'union, pas les clés. */
const CLIC: Record<string, string> = {
  attendu: 'bisClicPrendre',
  obtenu: 'bisClicRendre',
  'a-acheter': 'bisClicAcheter',
  'a-ameliorer': 'bisClicAmeliorer',
  complet: 'bisClicDefaire',
}

function Pastille({
  vise,
  modifiable,
  onBascule,
}: {
  vise: Vise
  modifiable: boolean
  onBascule: (id: number, suivant: Etat) => void
}) {
  const { lang, t } = useI18n()
  const { emplacement, pieces, etat } = vise
  const piece = pieces[0]
  const suivant = etatSuivant(etat)

  // Ce que la pastille montre : la pièce visée, pas une étiquette abstraite.
  // Faute de BiS pour cette case, on nomme au moins l'emplacement.
  const nom = piece
    ? lang === 'fr'
      ? piece.fr
      : piece.en
    : lang === 'fr'
      ? emplacement.fr
      : emplacement.en

  // Où en est la pièce, en toutes lettres. Un emplacement attendu du raid
  // affiche son ÉTAGE : c'est ce qu'on veut savoir devant un tableau de raid.
  // Une pièce de mémoquartz dit la marche qui lui manque encore.
  const ou =
    etat === 'attendu'
      ? t('butinFloor', { n: emplacement.etage })
      : etat === 'obtenu'
        ? t('bisObtenue')
        : etat === 'a-acheter'
          ? t('bisAAcheter')
          : etat === 'a-ameliorer'
            ? t('bisAAmeliorer')
            : etat === 'complet'
              ? t('bisComplet')
              : etat === 'inconnu'
                ? t('bisAilleurs')
                : t('bisVideSlot')

  const cliquable = modifiable && suivant !== null
  const infobulle = !modifiable
    ? t('bisPasLeDroit')
    : suivant
      ? t(CLIC[etat] as 'bisClicPrendre')
      : ''

  return (
    <li className={`bis-slot est-${etat}`}>
      <button
        type="button"
        disabled={!cliquable}
        title={infobulle}
        onClick={() => suivant && onBascule(emplacement.id, suivant)}
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
