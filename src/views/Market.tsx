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
} from '../market'
import type { Db, Member } from '../store'
import { nomMembre } from '../store'
import { ROLL_ICON, onItemImgError, TabIcon } from '../ui'

type Ready = Member & { data: Character }

// Collections dont une partie s'achète à l'hôtel des ventes. Les autres
// (succès, portraits, reliques, magie bleue) ne se vendent pas : les proposer
// donnerait des listes vides.
const ACHETABLES: Kind[] = [
  'mounts',
  'minions',
  'orchestrions',
  'outfits',
  'bardings',
  'fashions',
  'hairstyles',
  'emotes',
]

const BUDGETS = [100_000, 500_000, 1_000_000, 5_000_000, 20_000_000]

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
  onBuy: (charId: number, kind: Kind, id: number) => Promise<void>
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
  const [kinds, setKinds] = useState<Set<Kind>>(() => new Set<Kind>(['mounts', 'minions']))
  const [strategie, setStrategie] = useState<'objets' | 'voyages'>('objets')
  const [prix, setPrix] = useState<Prix | null>(null)
  // Fenetre d'explication d'un ecart : l'objet regarde, ou rien.
  const [infos, setInfos] = useState<{ nom: string; repere: Repere } | null>(null)
  const [avancement, setAvancement] = useState<{ fait: number; total: number } | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  // Coché tout de suite pour que le geste réponde, sans attendre l'aller-retour
  // serveur ni le rechargement de la fiche.
  // Une fois acheté, l'objet ne « manque » plus et sortirait de la liste : on
  // garde de quoi l'afficher, sinon la liste de courses se vide au fur et à
  // mesure qu'on la suit, et le total ne correspond plus à ce qu'on a dépensé.
  const [achetes, setAchetes] = useState<Map<number, { item: Item; kind: Kind }>>(
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

  /** Ce qui manque au personnage ET qui a un prix possible. */
  const manquants = useMemo(() => {
    if (!perso) return []
    const out: { item: Item; kind: Kind }[] = []
    for (const k of kinds) {
      const possedes = new Set(perso.data[k].ids)
      for (const it of db[k]) {
        if (it.itemId && it.tradeable && !possedes.has(it.id)) out.push({ item: it, kind: k })
      }
    }
    return out
  }, [perso, kinds, db])

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
    return strategie === 'objets'
      ? plusDObjets(prix.offres, budget, prixMax)
      : moinsDeVoyages(prix.offres, budget, prixMax)
  }, [prix, budget, prixMax, strategie])

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
        <h2>
          <TabIcon k="market" /> {t('market')}
        </h2>
        <p className="muted">{t('marketIntro', { dc: perso.data.dataCenter })}</p>
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
      </header>

      <div className="market-form">
        {chars.length > 1 && (
          <label className="market-field">
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

      <div className="market-kinds">
        <button
          className={`cat-chip ${kinds.size === ACHETABLES.length ? 'is-active' : ''}`}
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
          const dispo = db[k].filter((it) => it.itemId && it.tradeable).length
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
              {kindLabel(lang, k)} <i className="market-count">{dispo}</i>
            </button>
          )
        })}
      </div>

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

      {prix && selection.length === 0 && !erreur && (
        <p className="empty">
          {t(prixMax > 0 ? 'marketNothingCap' : 'marketNothing', {
            budget: gils(budget, lang),
            max: gils(prixMax, lang),
          })}
        </p>
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
                              <i className={`market-ecart ${ecart < 0 ? 'is-bon' : 'is-cher'}`}>
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
