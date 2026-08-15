import { useMemo, useState } from 'react'
import type { Character, Item, Kind } from '../api'
import { kindLabel, useI18n } from '../i18n'
import {
  fetchPrices,
  moinsDeVoyages,
  parMonde,
  plusDObjets,
  type Achat,
  type PriceMap,
} from '../market'
import type { Db, Member } from '../store'
import { onItemImgError, TabIcon } from '../ui'

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
  const [budget, setBudget] = useState(1_000_000)
  const [kinds, setKinds] = useState<Set<Kind>>(() => new Set<Kind>(['mounts', 'minions']))
  const [strategie, setStrategie] = useState<'objets' | 'voyages'>('objets')
  const [prix, setPrix] = useState<PriceMap | null>(null)
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
        perso.data.dataCenter,
        manquants.map((m) => m.item.itemId!),
        (fait, total) => setAvancement({ fait, total }),
      )
      setPrix(p)
      if (p.size === 0) setErreur(t('marketNoPrice'))
    } catch {
      setErreur(t('marketError'))
    } finally {
      setAvancement(null)
    }
  }

  const selection: Achat[] = useMemo(() => {
    if (!prix) return []
    return strategie === 'objets' ? plusDObjets(prix, budget) : moinsDeVoyages(prix, budget)
  }, [prix, budget, strategie])

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
      </header>

      <div className="market-form">
        {chars.length > 1 && (
          <label className="market-field">
            <span>{t('marketChar')}</span>
            <select value={perso.id} onChange={(e) => setCharId(Number(e.target.value))}>
              {chars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.data.name} ({c.data.dataCenter})
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
            value={budget}
            onChange={(e) => setBudget(Math.max(0, Number(e.target.value)))}
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

      {prix && selection.length === 0 && !erreur && (
        <p className="empty">{t('marketNothing', { budget: gils(budget, lang) })}</p>
      )}

      {selection.length > 0 && (
        <>
          <p className="market-summary">
            {t('marketSummary', {
              n: selection.length,
              worlds: groupes.length,
              total: gils(total, lang),
              reste: gils(budget - total, lang),
            })}
          </p>
          <div className="market-worlds">
            {groupes.map((g) => (
              <section key={g.world} className="market-world">
                <header className="album-page-head">
                  <b>{g.world}</b>
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
                          src={it.icon}
                          alt=""
                          width={28}
                          height={28}
                          loading="lazy"
                          onError={onItemImgError}
                        />
                        <span className="market-name">{lang === 'fr' ? it.name : it.nameEn}</span>
                        <span className="market-price">{gils(a.price, lang)}</span>
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
