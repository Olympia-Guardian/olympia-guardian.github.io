import { useEffect, useMemo, useState } from 'react'
import type { Character, Item, Kind } from '../api'
import { kindLabel, useI18n, type I18n } from '../i18n'
import {
  fetchPrices,
  centreDe,
  fetchRegion,
  moinsDeVoyages,
  parMonde,
  plusDObjets,
  type Achat,
  ecartMoyenne,
  type Prix,
  type Repere,
  chargerVendables,
} from '../market'
import type { Db, Member } from '../store'
import { nomMembre } from '../store'
import { ROLL_ICON, onItemImgError, TabIcon, xivIconUrl } from '../ui'

type Ready = Member & { data: Character }

// Collections dont une partie s'achète à l'hôtel des ventes. Les autres
// (succès, portraits, reliques, magie bleue) ne se vendent pas : les proposer
// donnerait des listes vides.
//
// Les TENUES en font partie depuis qu'on a compare nos catalogues a la liste
// des objets vendables d'Universalis : les 161 marquees echangeables y sont
// toutes inconnues. Une tenue est un ENSEMBLE, ce sont ses pieces qui se
// vendent — l'identifiant que FFXIV Collect nous donne ne designe donc aucun
// objet de l'hotel des ventes. La categorie promettait 161 achats impossibles.
/** Categorie a part : une piece n'est pas une collection, c'est un morceau de
 *  tenue. Elle a son propre stockage cote worker, `outfitpieces`, deja utilise
 *  par « Mon Journal » pour cocher les pieces une a une. */
type Achetable = Kind | 'outfitpieces'

const ACHETABLES: Achetable[] = [
  'mounts',
  'minions',
  'orchestrions',
  'bardings',
  'fashions',
  'outfitpieces',
  'hairstyles',
  'emotes',
]

const BUDGETS = [100_000, 500_000, 1_000_000, 5_000_000, 20_000_000]

/** Plafonds par objet, plus bas que les budgets : ils ecartent la piece rare
 *  hors de prix, la ou le budget arrete la liste entiere. */
const PRIX_MAX = [50_000, 100_000, 250_000, 500_000, 1_000_000]

/** Ce que le marche a fait, en toutes lettres : la moyenne, la derniere vente
 *  et sa date, le sens dans lequel ca va, et a quelle frequence l'objet se
 *  vend. Cette derniere ligne dit la solidite de tout le reste — un ecart
 *  calcule sur une vente tous les quatre jours n'a pas le poids d'un ecart
 *  calcule sur trente ventes par jour. */
function lignesMarche(r: Repere, t: I18n['t'], lang: string): string[] {
  const lignes = [t('marketVsAverage', { moyenne: gils(Math.round(r.moyenne), lang) })]
  if (r.derniere) {
    const jours = Math.floor((Date.now() - r.derniere.quand) / 86_400_000)
    const quand = jours <= 0 ? t('today') : jours === 1 ? t('yesterday') : t('daysAgo', { n: jours })
    lignes.push(
      t('marketLastSale', { prix: gils(Math.round(r.derniere.prix), lang), quand: quand.toLowerCase() }),
    )
    // Sous la moyenne, le prix redescend ; au-dessus, il monte. Deux points
    // suffisent a donner un sens, pas a tracer une courbe : on ne promet pas
    // davantage.
    const ecart = (r.derniere.prix - r.moyenne) / r.moyenne
    if (Math.abs(ecart) >= 0.05) lignes.push(t(ecart < 0 ? 'marketFalling' : 'marketRising'))
  }
  if (r.parJour) {
    lignes.push(
      r.parJour >= 1
        ? t('marketPace', { n: Math.round(r.parJour) })
        : t('marketPaceSlow', { n: Math.max(1, Math.round(1 / r.parJour)) }),
    )
  }
  return lignes
}

function gils(n: number, lang: string): string {
  return n.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US')
}

export function Market({
  db,
  chars,
  onBuy,
}: {
  db: Db
  chars: Ready[]
  /** Coche « acheté » : verse l'objet dans la collection du personnage. */
  onBuy: (charId: number, kind: Achetable, id: number) => Promise<void>
}) {
  const { lang, t } = useI18n()
  const [charId, setCharId] = useState<number | null>(chars[0]?.id ?? null)
  // Zéro = pas de plafond. Les deux champs sont facultatifs et se combinent :
  // le prix maximum écarte les objets trop chers un par un, le budget arrête
  // la liste quand l'enveloppe est épuisée.
  // Pas de budget par défaut : c'est au joueur de dire ce qu'il a en poche,
  // une valeur imposée d'avance ne voudrait rien dire.
  const [budget, setBudget] = useState(0)
  const [prixMax, setPrixMax] = useState(0)
  // Portée de la recherche. Par défaut le centre de données, où le voyage est
  // immédiat ; la région entière ouvre l'autre centre (Chaos et Light en
  // Europe), accessible mais avec un voyage plus lourd.
  const [portee, setPortee] = useState<'dc' | 'region'>('dc')
  const [region, setRegion] = useState<string | null>(null)
  const [kinds, setKinds] = useState<Set<Achetable>>(
    () => new Set<Achetable>(['mounts', 'minions']),
  )
  const [strategie, setStrategie] = useState<'objets' | 'voyages'>('objets')
  const [prix, setPrix] = useState<Prix | null>(null)
  // Recherche par nom. Elle retrecit ce qu'on demande a Universalis AUTANT que
  // ce qu'on affiche : chercher « Todoroki » ne doit pas interroger mille prix
  // pour n'en montrer qu'un.
  const [recherche, setRecherche] = useState('')
  // La liste des objets qu'Universalis sait vendre : elle sert aux compteurs
  // autant qu'aux appels. Sans elle, les categories annoncent des achats qui
  // n'existent pas.
  const [vendables, setVendables] = useState<Set<number> | null>(null)
  useEffect(() => {
    void chargerVendables().then(setVendables)
  }, [])
  // Fenetre d'explication d'un ecart : l'objet regarde, ou rien.
  const [infos, setInfos] = useState<{ nom: string; repere: Repere } | null>(null)
  const [avancement, setAvancement] = useState<{ fait: number; total: number } | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  // Coché tout de suite pour que le geste réponde, sans attendre l'aller-retour
  // serveur ni le rechargement de la fiche.
  // Une fois acheté, l'objet ne « manque » plus et sortirait de la liste : on
  // garde de quoi l'afficher, sinon la liste de courses se vide au fur et à
  // mesure qu'on la suit, et le total ne correspond plus à ce qu'on a dépensé.
  const [achetes, setAchetes] = useState<Map<number, { item: Item; kind: Achetable }>>(
    () => new Map(),
  )

  const perso = chars.find((c) => c.id === charId) ?? chars[0] ?? null

  // La région dépend du personnage choisi : elle décide si l'autre centre de
  // données est atteignable.
  useEffect(() => {
    let annule = false
    if (!perso) return
    void fetchRegion(perso.data.dataCenter).then((r) => {
      if (!annule) setRegion(r)
    })
    return () => {
      annule = true
    }
  }, [perso])

  /** Remet les filtres dans l'etat d'ouverture. Sans elle, on sortait d'une
   *  recherche vide en defaisant a la main quatre reglages poses dix minutes
   *  plus tot, sans toujours se rappeler lesquels. */
  function reinitialiser() {
    setRecherche('')
    setKinds(new Set<Achetable>(['mounts', 'minions']))
    setBudget(0)
    setPrixMax(0)
    setPrix(null)
    setErreur(null)
  }

  /** Toutes les pieces de tenue, a plat, avec l'adresse de leur icone reconstruite
   *  — le catalogue ne garde que le numero de la planche. */
  const pieces = useMemo(() => {
    const out = new Map<number, Item>()
    for (const tenue of db.outfits) {
      for (const p of tenue.pieces ?? []) {
        if (!p.id || !p.icon || out.has(p.id)) continue
        const vignette = xivIconUrl(p.icon)
        out.set(p.id, {
          ...p,
          icon: vignette,
          image: vignette,
          itemId: p.id,
          tradeable: true,
          sources: [],
        } as unknown as Item)
      }
    }
    return out
  }, [db])

  /** Pieces qu'on possede deja. Le worker applique desormais la meme regle —
   *  tenue possedee, donc pieces possedees — et c'est lui qui fait foi.
   *
   *  On la refait ici pour une raison precise : les fiches de personnage sont
   *  gardees en cache dans le navigateur. Celles qui datent d'avant ce
   *  changement portent encore une liste de pieces vide, et sans ce filet leur
   *  proprietaire se verrait proposer d'acheter le costume qu'il porte, le
   *  temps que le cache expire. */
  const piecesPossedees = useMemo(() => {
    const out = new Set<number>(perso?.data.outfitPieceIds ?? [])
    if (perso) {
      const tenues = new Set(perso.data.outfits.ids)
      for (const tenue of db.outfits) {
        if (!tenues.has(tenue.id)) continue
        for (const p of tenue.pieces ?? []) if (p.id) out.add(p.id)
      }
    }
    return out
  }, [perso, db])

  /** Combien d'objets une categorie propose reellement. */
  const dispoDe = (k: Achetable): number => {
    const liste =
      k === 'outfitpieces'
        ? [...pieces.values()]
        : db[k].filter((it) => it.itemId && it.tradeable)
    return vendables ? liste.filter((it) => vendables.has(it.itemId!)).length : liste.length
  }

  /** Ce qui manque au personnage ET qui a un prix possible. */
  const manquants = useMemo(() => {
    if (!perso) return []
    const q = recherche.trim().toLowerCase()
    const correspond = (it: Item) =>
      !q || it.name.toLowerCase().includes(q) || it.nameEn.toLowerCase().includes(q)
    const out: { item: Item; kind: Achetable }[] = []
    for (const k of kinds) {
      const possedes = k === 'outfitpieces' ? piecesPossedees : new Set(perso.data[k].ids)
      const liste = k === 'outfitpieces' ? [...pieces.values()] : db[k]
      for (const it of liste) {
        if (!it.itemId || !it.tradeable || possedes.has(it.id)) continue
        if (vendables && !vendables.has(it.itemId)) continue
        if (!correspond(it)) continue
        out.push({ item: it, kind: k })
      }
    }
    return out
  }, [perso, kinds, db, pieces, vendables, piecesPossedees, recherche])

  const parItemId = useMemo(
    () => new Map(manquants.map((m) => [m.item.itemId!, m])),
    [manquants],
  )

  async function chercher() {
    if (!perso) return
    setErreur(null)
    setPrix(null)
    setAvancement({ fait: 0, total: manquants.length })
    try {
      const p = await fetchPrices(
        portee === 'region' && region ? region : perso.data.dataCenter,
        manquants.map((m) => m.item.itemId!),
        (fait, total) => setAvancement({ fait, total }),
      )
      setPrix(p)
      if (p.offres.size === 0) setErreur(t('marketNoPrice'))
    } catch {
      setErreur(t('marketError'))
    } finally {
      setAvancement(null)
    }
  }

  const selection: Achat[] = useMemo(() => {
    if (!prix) return []
    const plan =
      strategie === 'objets'
        ? plusDObjets(prix.offres, budget, prixMax)
        : moinsDeVoyages(prix.offres, budget, prixMax)
    // Les prix restent en memoire apres une recherche : sans ce filtre, affiner
    // le texte ne changerait rien a la liste deja affichee.
    const gardes = new Set(manquants.map((m) => m.item.itemId!))
    return plan.filter((a) => gardes.has(a.itemId))
  }, [prix, budget, prixMax, strategie, manquants])

  const groupes = useMemo(() => parMonde(selection), [selection])
  const total = selection.reduce((s, a) => s + a.price, 0)

  if (!perso) {
    return (
      <div className="view market">
        <div className="hero">
          <h1>{t('market')}</h1>
          <p>{t('marketNeedChar')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="view market">
      <header className="market-head">
        <div className="market-titre">
          <h2>
            <TabIcon k="market" /> {t('market')}
          </h2>
          <div className="market-qui">
            {chars.length > 1 && (
              <label className="market-field market-field-perso">
                <span>{t('marketChar')}</span>
                <select value={perso.id} onChange={(e) => setCharId(Number(e.target.value))}>
                  {chars.map((c) => (
                    <option key={c.id} value={c.id}>
                      {nomMembre(c)} ({c.data.dataCenter})
                    </option>
                  ))}
                </select>
              </label>
            )}
            {region && (
              <div className="mode-switch market-scope">
                <button
                  className={`mode-btn ${portee === 'dc' ? 'is-active' : ''}`}
                  onClick={() => setPortee('dc')}
                >
                  {t('marketScopeDc', { dc: perso.data.dataCenter })}
                </button>
                <button
                  className={`mode-btn ${portee === 'region' ? 'is-active' : ''}`}
                  title={t('marketScopeRegionHint')}
                  onClick={() => setPortee('region')}
                >
                  {t('marketScopeRegion', { region })}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <section className="market-panneau">
        <span className="market-legende">{t('marketBudgetLegend')}</span>
        <div className="market-form">
          <div className="market-field-groupe">
            <label className="market-field">
              <span>{t('marketBudget')}</span>
              <input
                type="number"
                min={0}
                step={10_000}
                value={budget || ''}
                placeholder={t('marketNoCap')}
                onChange={(e) => setBudget(Math.max(0, Number(e.target.value)))}
              />
            </label>
            {/* Ces montants remplissent le BUDGET. Poses apres « prix maximum
                par objet », ils avaient l'air d'appartenir a l'autre champ. */}
            <div className="market-presets">
              {BUDGETS.map((b) => (
                <button
                  key={b}
                  className={`cat-chip ${budget === b ? 'is-active' : ''}`}
                  onClick={() => setBudget(b)}
                >
                  {gils(b, lang)}
                </button>
              ))}
            </div>
          </div>

          <div className="market-field-groupe">
            <label className="market-field">
              <span>{t('marketMaxPrice')}</span>
              <input
                type="number"
                min={0}
                step={10_000}
                value={prixMax || ''}
                placeholder={t('marketNoCap')}
                onChange={(e) => setPrixMax(Math.max(0, Number(e.target.value)))}
              />
            </label>
            <div className="market-presets">
              {PRIX_MAX.map((b) => (
                <button
                  key={b}
                  className={`cat-chip ${prixMax === b ? 'is-active' : ''}`}
                  onClick={() => setPrixMax(b)}
                >
                  {gils(b, lang)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <span className="market-legende">{t('marketKindsLegend')}</span>
        <input
          className="search market-recherche"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder={t('marketSearchName')}
          spellCheck={false}
        />
        <div className="market-kinds">
          <button
            className={`cat-chip cat-chip-action ${kinds.size === ACHETABLES.length ? 'is-active' : ''}`}
            onClick={() =>
              setKinds((prev) =>
                prev.size === ACHETABLES.length ? new Set() : new Set(ACHETABLES),
              )
            }
          >
            {kinds.size === ACHETABLES.length ? t('marketNone') : t('marketAll')}
          </button>
          {ACHETABLES.map((k) => {
            const actif = kinds.has(k)
            const dispo = dispoDe(k)
            return (
              <button
                key={k}
                className={`cat-chip ${actif ? 'is-active' : ''}`}
                onClick={() =>
                  setKinds((prev) => {
                    const next = new Set(prev)
                    if (next.has(k)) next.delete(k)
                    else next.add(k)
                    return next
                  })
                }
              >
                {k === 'outfitpieces' ? t('marketPieces') : kindLabel(lang, k)}{' '}
                <i className="market-count">{dispo}</i>
              </button>
            )
          })}
        </div>
      </section>

      <div className="market-actions">
        <button
          className="btn btn-primary"
          disabled={manquants.length === 0 || avancement !== null}
          onClick={chercher}
        >
          {avancement
            ? t('marketSearching', { fait: avancement.fait, total: avancement.total })
            : t('marketSearch', { n: manquants.length })}
        </button>
        {prix && (
          <div className="mode-switch">
            <button
              className={`mode-btn ${strategie === 'objets' ? 'is-active' : ''}`}
              onClick={() => setStrategie('objets')}
            >
              {t('marketMostItems')}
            </button>
            <button
              className={`mode-btn ${strategie === 'voyages' ? 'is-active' : ''}`}
              onClick={() => setStrategie('voyages')}
            >
              {t('marketFewestTrips')}
            </button>
          </div>
        )}
      </div>

      {erreur && <p className="notice">{erreur}</p>}

      {infos && (
        <div className="modal-backdrop" onClick={() => setInfos(null)}>
          <div
            className="modal modal-gold"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="icon-btn modal-close" title={t('close')} onClick={() => setInfos(null)}>
              ×
            </button>
            <h3 className="modal-h">{t('marketInfos')}</h3>
            <p className="modal-muted">{infos.nom}</p>
            <ul className="market-infos-lignes">
              {lignesMarche(infos.repere, t, lang).map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Deux facons de n'avoir rien : les filtres n'ont rien laisse passer
          avant meme d'interroger Universalis, ou la recherche n'a rien ramene.
          Le meme bloc repond aux deux, et propose la sortie. */}
      {!erreur && !avancement && (manquants.length === 0 || (prix && selection.length === 0)) && (
        <div className="market-vide">
          <p className="empty">{t('marketNothingFound')}</p>
          {(budget > 0 || prixMax > 0) && (
            <p className="muted">
              {t(prixMax > 0 ? 'marketNothingCap' : 'marketNothing', {
                budget: gils(budget, lang),
                max: gils(prixMax, lang),
              })}
            </p>
          )}
          <button className="btn btn-ghost" onClick={reinitialiser}>
            <TabIcon k="sync" /> {t('marketReset')}
          </button>
        </div>
      )}

      {selection.length > 0 && (
        <>
          <p className="market-summary">
            {budget > 0
              ? t('marketSummary', {
                  n: selection.length,
                  worlds: groupes.length,
                  total: gils(total, lang),
                  reste: gils(Math.max(0, budget - total), lang),
                })
              : t('marketSummaryNoBudget', {
                  n: selection.length,
                  worlds: groupes.length,
                  total: gils(total, lang),
                })}
          </p>
          {/* D'ou viennent ces prix, et jusqu'ou les croire. « Le moins de
              voyages » choisit sciemment des offres plus cheres pour eviter un
              deplacement : l'annoncer evite de prendre la liste pour le
              classement des meilleurs prix, ce qu'elle n'est pas dans ce mode. */}
          <p className="notice market-provenance">
            {t(strategie === 'objets' ? 'marketFromCheapest' : 'marketFromTrips', {
              ou:
                portee === 'region' && region
                  ? t('marketOnRegion', { region })
                  : t('marketOnDc', { dc: perso?.data.dataCenter ?? '' }),
            })}
          </p>
          <div className="market-worlds">
            {groupes.map((g) => (
              <section key={g.world} className="market-world">
                <header className="album-page-head">
                  <b>
                    {centreDe(g.world) && (
                      <span className="market-dc">{centreDe(g.world)!.toUpperCase()}</span>
                    )}
                    {g.world}
                  </b>
                  <span className="mypage-count">
                    {t('marketWorldLine', { n: g.achats.length, total: gils(g.total, lang) })}
                  </span>
                </header>
                <ul className="market-list">
                  {g.achats.map((a) => {
                    const m = parItemId.get(a.itemId) ?? achetes.get(a.itemId)
                    if (!m) return null
                    const { item: it, kind } = m
                    const achete = achetes.has(a.itemId)
                    return (
                      <li key={a.itemId} className={achete ? 'is-bought' : ''}>
                        <button
                          className={`checklist-box ${achete ? 'is-owned' : ''}`}
                          title={t('marketBought')}
                          disabled={achete || !perso}
                          onClick={() => {
                            setAchetes((prev) => new Map(prev).set(a.itemId, m))
                            void onBuy(perso.id, kind, it.id)
                          }}
                        >
                          {achete ? '✓' : ''}
                        </button>
                        <img
                          src={kind === 'orchestrions' ? ROLL_ICON : it.icon}
                          alt=""
                          width={28}
                          height={28}
                          loading="lazy"
                          onError={onItemImgError}
                        />
                        <span className="market-name">
                          {lang === 'fr' ? it.name : it.nameEn}
                        </span>
                        <span className="market-price">
                          <span>
                            {gils(a.price, lang)}
                            <TabIcon k="market" />
                          </span>
                          {(() => {
                            // Le prix seul ne dit rien : 6,5 M est une affaire
                            // sur un objet qui part d'habitude a 7,2 M, et un
                            // vol sur un objet a 2 M.
                            //
                            // La pastille est TOUJOURS posee, vide quand il n'y
                            // a rien a dire : sa largeur reservee est ce qui
                            // tient les prix alignes d'une ligne a l'autre.
                            const repere = prix?.moyennes.get(a.itemId)
                            const ecart = ecartMoyenne(a.price, repere)
                            if (ecart === null) return <i className="market-ecart" />
                            return (
                              <i
                                className={`market-ecart ${
                                  // Au prix habituel, ni vert ni rouge : il n'y
                                  // a rien a signaler, seulement a constater.
                                  ecart === 0 ? 'is-neutre' : ecart < 0 ? 'is-bon' : 'is-cher'
                                }`}
                              >
                                {ecart > 0 ? '+' : ''}
                                {ecart} %
                              </i>
                            )
                          })()}
                          {(() => {
                            // Trois phrases au survol ne se lisent pas, et sur
                            // telephone une infobulle ne s'affiche jamais : le
                            // detail s'ouvre sur demande.
                            //Rien a dire ne veut pas dire rien a occuper : la
                            // place est reservee, sinon les prix des lignes sans
                            // bouton glissent vers la droite.
                            const repere = prix?.moyennes.get(a.itemId)
                            if (!repere) return <span className="market-infos-vide" />
                            return (
                              <button
                                className="icon-btn market-infos"
                                title={t('marketInfosOpen')}
                                onClick={() =>
                                  setInfos({ nom: lang === 'fr' ? it.name : it.nameEn, repere })
                                }
                              >
                                <TabIcon k="infos" />
                              </button>
                            )
                          })()}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
