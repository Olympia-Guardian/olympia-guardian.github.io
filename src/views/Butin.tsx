import { useMemo, useState } from 'react'
import { iconeObjet, type Character, type RaidEmplacement, type RaidPalier } from '../api'
import { useI18n } from '../i18n'
import {
  bisDeFeuille,
  ErreurBis,
  etages,
  etatSuivant,
  lireFeuille,
  materiauDe,
  materiauxManquants,
  rangerBis,
  type Bis,
  type Etat,
  type Feuille,
  type Vise,
} from '../raid'
import { nomCourt, type Member } from '../store'
import { TabIcon, onAvatarImgError, onItemImgError, slotIconUrl } from '../ui'

type Ready = Member & { data: Character }

/** Un emplacement, ses demandeurs, et l'icone qui le represente. */
interface Besoin {
  cle: string
  emplacement: RaidEmplacement
  charIds: number[]
}

/** Regroupe les besoins d'un etage par CATEGORIE d'emplacement. Le suffixe
 *  numerique tombe : « bague 1 » et « bague 2 » sont la meme categorie pour le
 *  jeu, et deux anneaux ne se distinguent pas sur une vignette. */
function regrouper(parJoueur: { charId: number; vises: Vise[] }[]): Besoin[] {
  const out = new Map<string, Besoin>()
  for (const j of parJoueur) {
    for (const v of j.vises) {
      const cle = v.emplacement.cle.replace(/\d+$/, '')
      const b = out.get(cle) ?? { cle, emplacement: v.emplacement, charIds: [] }
      b.charIds.push(j.charId)
      out.set(cle, b)
    }
  }
  return [...out.values()]
}

/** Le nom de la categorie, sans son numero : « Bague », pas « Bague 1 ». */
function nomCategorie(e: RaidEmplacement, lang: string): string {
  return (lang === 'fr' ? e.fr : e.en).replace(/\s*\d+$/, '')
}

/** Une bannière manquante s'efface : mieux vaut une carte sans image qu'une
 *  icône de fichier cassé étalée en fond. */
function onFondImgError(e: React.SyntheticEvent<HTMLImageElement>) {
  e.currentTarget.style.display = 'none'
}

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

  // Le detail des pieces se deplie a la demande, et les quatre etages
  // ENSEMBLE : on regarde une soiree de raid, pas un etage isole, et ouvrir
  // carte par carte decalait les trois autres a chaque clic. La carte repond
  // d'abord au « combien de soirees » ; le « pour qui » est une deuxieme
  // question, qui repoussait les joueurs sous la ligne de flottaison.
  const [detail, setDetail] = useState(false)

  /** L'étage tel que le jeu et les joueurs le nomment. Le numéro ne sert que de
   *  secours, si un palier arrivait sans ses étages. */
  const etageDe = (n: number) => palier.etages?.[n - 1]
  const nomEtage = (n: number) => etageDe(n)?.court ?? t('butinFloor', { n })

  const membreDe = (charId: number) => cartes.find((x) => x.membre.id === charId)?.membre
  const nomDe = (charId: number) => {
    const m = membreDe(charId)
    return m ? nomCourt(m) : ''
  }

  return (
    <div className="view">
      <h3 className="raid-titre">{lang === 'fr' ? palier.fr : palier.en}</h3>

      {/* La réponse, en haut, lisible sans défiler. */}
      <div className="kills-row">
        {parEtage.map((e) => {
          const etage = etageDe(e.etage)
          return (
            <section key={e.etage} className={`kills-card ${e.kills === 0 ? 'is-done' : ''}`}>
              {/* La bannière que le jeu affiche dans sa recherche de mission :
                  on reconnaît l'étage à son image avant d'avoir lu son nom.
                  Elle ne couvre que la TÊTE de la carte : dépliée, la liste des
                  pièces l'aurait étirée sur toute la hauteur. */}
              <div className="kills-tete">
                {etage && (
                  <img
                    className="kills-fond"
                    src={iconeObjet(etage.image, false)}
                    alt=""
                    loading="lazy"
                    onError={onFondImgError}
                  />
                )}
                <div className="kills-contenu">
                  <header>
                    <b>{nomEtage(e.etage)}</b>
                    <span className="kills-n">{e.kills}</span>
                  </header>
                  {etage && (
                    <p className="kills-mission" title={lang === 'fr' ? etage.fr : etage.en}>
                      {lang === 'fr' ? etage.fr : etage.en}
                    </p>
                  )}
                  <p className="kills-label">
                    {e.kills === 0 ? t('butinDone') : t('butinKills', { n: e.kills })}
                  </p>
                  {e.parJoueur.length > 0 && (
                    <button
                      type="button"
                      className="icon-btn kills-plier"
                      aria-expanded={detail}
                      title={detail ? t('butinPlier') : t('butinDeplier')}
                      onClick={() => setDetail((v) => !v)}
                    >
                      <TabIcon k="infos" />
                    </button>
                  )}
                </div>
              </div>

              {/* Ce qui manque, une ligne par emplacement : l'icône de la case
                  du jeu, et au bout de la ligne les visages de ceux qui
                  l'attendent. Les deux bagues s'y confondent, le jeu n'ayant
                  qu'une catégorie « bague ». */}
              {e.parJoueur.length > 0 && detail && (
                <ul className="kills-besoins">
                    {regrouper(e.parJoueur).map((b) => (
                      <li
                        key={b.cle}
                        className="besoin"
                        title={`${nomCategorie(b.emplacement, lang)} · ${b.charIds
                          .map((id) => nomDe(id))
                          .join(', ')}`}
                      >
                        <img
                          className="besoin-case"
                          src={slotIconUrl(b.cle) ?? b.emplacement.icon}
                          alt=""
                          width={34}
                          height={34}
                          loading="lazy"
                          onError={onItemImgError}
                        />
                        <span className="besoin-nom">
                          {nomCategorie(b.emplacement, lang)}
                        </span>
                        <span className="besoin-gens">
                          {b.charIds.map((id) => {
                            const membre = membreDe(id)
                            return (
                              membre && (
                                <img
                                  key={id}
                                  src={membre.data.avatar}
                                  alt=""
                                  title={nomCourt(membre)}
                                  width={22}
                                  height={22}
                                  loading="lazy"
                                  onError={onAvatarImgError}
                                />
                              )
                            )
                          })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
            </section>
          )
        })}
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
        </section>
      )}

      <div className="bis-cards">
        {cartes.map((c) => (
          <CarteJoueur
            key={c.membre.id}
            palier={palier}
            membre={c.membre}
            vises={c.vises}
            bis={bis[c.membre.id]}
            modifiable={peutModifier(c.membre.id)}
            nomEtage={nomEtage}
            onImport={(b) => onImport(c.membre.id, b)}
            onBascule={(id, suivant) => onBascule(c.membre.id, id, suivant)}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

/** La fenêtre d'équipement du jeu, à l'identique : l'arme et l'armure à gauche,
 *  les accessoires à droite, le personnage entre les deux. Un joueur reconnaît
 *  la place de chaque case sans la lire, il la cherche là depuis des années.
 *
 *  L'ordre est donc celui du jeu, pas celui des étages : le décompte des
 *  soirées est déjà rangé par étage, en haut de l'écran. */
const COLONNE_GAUCHE = ['weapon', 'head', 'body', 'hands', 'legs', 'feet']
const COLONNE_DROITE = ['earring', 'necklace', 'bracelet', 'ring1', 'ring2']

function CarteJoueur({
  palier,
  membre,
  vises,
  bis,
  modifiable,
  nomEtage,
  onImport,
  onBascule,
}: {
  palier: RaidPalier
  membre: Ready
  vises: Vise[]
  bis: Bis | undefined
  modifiable: boolean
  nomEtage: (n: number) => string
  onImport: (bis: Bis) => Promise<void>
  onBascule: (id: number, suivant: Etat) => void
}) {
  const { t } = useI18n()
  const [saisie, setSaisie] = useState(false)
  const reste = vises.filter((v) => v.etat === 'attendu').length
  const parCle = new Map(vises.map((v) => [v.emplacement.cle, v]))
  const colonne = (cles: string[]) => cles.map((c) => parCle.get(c)).filter((v) => !!v)

  return (
    <section className="bis-card">
      <header className="bis-head">
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
        <div className="bis-doll">
          <ul className="bis-colonne">
            {colonne(COLONNE_GAUCHE).map((v) => (
              <Pastille
                key={v.emplacement.cle}
                palier={palier}
                vise={v}
                modifiable={modifiable}
                nomEtage={nomEtage}
                onBascule={onBascule}
              />
            ))}
          </ul>
          {/* Le portrait tient la place du modèle 3D, au milieu des deux
              colonnes. C'est ce qui fait reconnaître la fenêtre d'un coup. */}
          <img
            className="bis-portrait"
            src={membre.data.portrait || membre.data.avatar}
            alt=""
            loading="lazy"
            onError={onAvatarImgError}
          />
          <ul className="bis-colonne est-droite">
            {colonne(COLONNE_DROITE).map((v) => (
              <Pastille
                key={v.emplacement.cle}
                palier={palier}
                vise={v}
                modifiable={modifiable}
                nomEtage={nomEtage}
                onBascule={onBascule}
              />
            ))}
          </ul>
        </div>
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

/** Une vignette par emplacement.
 *
 *  Le nom de la PIÈCE ne tient pas sur une vignette : « Bagues d'oreille de
 *  protecteur de grand champion » se coupait au tiers, et onze noms coupés se
 *  ressemblent tous. C'est donc l'EMPLACEMENT qui s'écrit, court et jamais
 *  tronqué, tandis que l'icône montre la pièce et que la bulle donne son nom
 *  entier.
 *
 *  Le coin de l'icône porte ce qu'il reste à faire : le numéro de l'étage tant
 *  que le raid la doit, une coche quand c'est fini, et pour le mémoquartz le
 *  COMPOSANT lui-même — voir la fibre sur la vignette dit ce qu'elle coûte
 *  mieux que le mot « mémoquartz ». */
function Pastille({
  palier,
  vise,
  modifiable,
  nomEtage,
  onBascule,
}: {
  palier: RaidPalier
  vise: Vise
  modifiable: boolean
  nomEtage: (n: number) => string
  onBascule: (id: number, suivant: Etat) => void
}) {
  const { lang, t } = useI18n()
  const { emplacement, pieces, etat } = vise
  const piece = pieces[0]
  const suivant = etatSuivant(etat)
  const materiau = materiauDe(palier, vise)

  const etat_court =
    etat === 'attendu'
      ? nomEtage(emplacement.etage)
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
                : ''

  const cliquable = modifiable && suivant !== null
  // La bulle dit tout ce que la vignette n'a pas la place d'écrire : les noms
  // entiers (deux pour le paladin, arme et bouclier), l'état, et le geste.
  const bulle = [
    lang === 'fr' ? emplacement.fr : emplacement.en,
    pieces.map((p) => (lang === 'fr' ? p.fr : p.en)).join(' + '),
    etat_court,
    !modifiable ? t('bisPasLeDroit') : suivant ? t(CLIC[etat] as 'bisClicPrendre') : '',
  ]
    .filter(Boolean)
    .join('\n')

  // Le nom de la PIÈCE, celui qu'on lit dans le jeu et sur les sites de BiS. La
  // place étant comptée, il se coupe au besoin : la bulle le donne entier, et
  // la position de la case dit déjà de quel emplacement il s'agit.
  const nom = piece
    ? lang === 'fr'
      ? piece.fr
      : piece.en
    : lang === 'fr'
      ? emplacement.fr
      : emplacement.en

  return (
    <li className={`bis-slot est-${etat}`}>
      <button
        type="button"
        disabled={!cliquable}
        title={bulle}
        onClick={() => suivant && onBascule(emplacement.id, suivant)}
      >
        <span className="bis-vignette">
          <img
            className="bis-objet"
            src={piece ? iconeObjet(piece.icone) : emplacement.icon}
            alt=""
            width={40}
            height={40}
            loading="lazy"
            onError={onItemImgError}
          />
          {(etat === 'obtenu' || etat === 'complet') && (
            <span className="bis-marque est-ok">✓</span>
          )}
          {materiau && (etat === 'a-acheter' || etat === 'a-ameliorer') && (
            <img
              className="bis-marque bis-marque-img"
              src={iconeObjet(materiau.icone)}
              alt=""
              width={18}
              height={18}
              loading="lazy"
              onError={onItemImgError}
            />
          )}
        </span>
        <span className="bis-slot-texte">
          <span className="bis-slot-nom">{nom}</span>
          {/* La place reste prise même quand il n'y a rien à dire : sans ça, une
              case se décalerait de quelques pixels sur sa voisine. */}
          <span className="bis-slot-ou">{etat_court || '\u00a0'}</span>
        </span>
      </button>
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
  // Une feuille XIVGear porte souvent plusieurs sets (« 2.50 », « 2.45 »,
  // « Relic »...). Rien ne dit lequel le joueur utilise : on lui montre la
  // liste plutôt que de prendre le premier et de se tromper en silence.
  const [feuille, setFeuille] = useState<Feuille | null>(null)

  if (!modifiable) return <p className="empty bis-vide">{t('bisAucun')}</p>

  async function poser(bis: Bis) {
    setEncours(true)
    try {
      await onImport(bis)
      setLien('')
      setFeuille(null)
    } catch (err) {
      const cle = err instanceof ErreurBis ? err.message : 'bisEchecEcriture'
      setErreur(t(cle as 'bisLienInvalide'))
    } finally {
      setEncours(false)
    }
  }

  async function envoyer(e: React.FormEvent) {
    e.preventDefault()
    setErreur('')
    setEncours(true)
    try {
      const lue = await lireFeuille(lien)
      setEncours(false)
      if (lue.sets.length === 1) await poser(bisDeFeuille(lue, 0))
      else setFeuille(lue)
    } catch (err) {
      // Le message d'erreur EST une clé de traduction : l'import parle la
      // langue de la vue, sans que la vue ait à connaître ses cas d'échec.
      const cle = err instanceof ErreurBis ? err.message : 'bisEchecEcriture'
      setErreur(t(cle as 'bisLienInvalide'))
      setEncours(false)
    }
  }

  if (feuille) {
    return (
      <div className="bis-import">
        <p className="muted">{t('bisChoisirSet', { n: feuille.sets.length })}</p>
        <ul className="bis-sets">
          {feuille.sets.map((jeu, i) => (
            <li key={i}>
              <button
                type="button"
                className="btn-ghost"
                disabled={encours}
                onClick={() => poser(bisDeFeuille(feuille, i))}
              >
                {jeu.nom || feuille.nom || `#${i + 1}`}
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="btn-ghost" onClick={() => setFeuille(null)}>
          {t('bisAnnuler')}
        </button>
        {erreur && <p className="bis-erreur">{erreur}</p>}
      </div>
    )
  }

  return (
    <form className="bis-import" onSubmit={envoyer}>
      <p className="muted">{t('bisAide')}</p>
      <div className="bis-import-ligne">
        <input
          type="url"
          value={lien}
          placeholder="https://etro.gg/gearset/... · https://xivgear.app/?page=sl|..."
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
