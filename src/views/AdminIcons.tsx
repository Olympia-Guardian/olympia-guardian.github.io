import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import { TAB_ICONS, xivIconUrl } from '../ui'

// ---------------------------------------------------------------------------
// Catalogue des icônes du jeu, pour en choisir une.
//
// Deux sources, parce qu'aucune ne suffit seule :
//
//  - Les FEUILLES du jeu, servies par XIVAPI, qui donnent un nom à chaque
//    icône — et en français. « MainCommand » est celle des menus du jeu, d'où
//    viennent la plupart de nos boutons. C'est la seule façon d'avoir un nom :
//    l'URL d'un asset n'en porte aucun.
//
//  - Le PARCOURS PAR NUMÉRO, pour tout le reste. Plusieurs de nos icônes
//    (cartes 027661, marché 065002, admin 060840) vivent hors de ces feuilles ;
//    sans ce mode, elles seraient introuvables.
//
// Les images partent par centaines : chargement différé obligatoire, et une
// tranche bornée. C'est exactement ce qui avait fait attendre onze secondes la
// barre d'onglets de « Mon Journal ».
// ---------------------------------------------------------------------------

/** Feuilles proposées : celles qui portent à la fois un nom et une icône, et
 *  dont le contenu ressemble à un bouton d'interface. */
const FEUILLES = [
  { cle: 'MainCommand', label: 'Menus du jeu' },
  { cle: 'Emote', label: 'Emotes' },
  { cle: 'ContentType', label: 'Types de contenu' },
  { cle: 'Status', label: 'Effets' },
] as const

/** Tranche maximale d'un parcours par numéro. Au-delà, la page mettrait plus de
 *  temps à s'afficher qu'on n'en met à changer de tranche. */
const TRANCHE_MAX = 240

interface Icone {
  id: string
  nom: string
}

/** Numéro d'icône sur six chiffres, la forme attendue par TAB_ICONS. */
function code(n: number): string {
  return String(n).padStart(6, '0')
}

/** Clé de TAB_ICONS qui utilise déjà cette icône, s'il y en a une : inutile de
 *  proposer un numéro qui sert déjà ailleurs sans le dire. */
function dejaUtilisee(id: string): string | null {
  const trouve = Object.entries(TAB_ICONS).find(([, v]) => v === id)
  return trouve ? trouve[0] : null
}

export function AdminIcons() {
  const { lang, t } = useI18n()
  const [source, setSource] = useState<string>('MainCommand')
  const [feuille, setFeuille] = useState<Icone[] | null>(null)
  const [erreur, setErreur] = useState(false)
  const [recherche, setRecherche] = useState('')
  const [debut, setDebut] = useState(60000)
  const [copie, setCopie] = useState<string | null>(null)

  const parcours = source === 'numeros'

  useEffect(() => {
    if (parcours) return
    let annule = false
    setFeuille(null)
    setErreur(false)
    fetch(
      `https://v2.xivapi.com/api/sheet/${source}?limit=2000&language=${lang}&fields=Name,Icon`,
      { signal: AbortSignal.timeout(20000) },
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { rows?: { fields?: { Name?: string; Icon?: { id?: number } } }[] }) => {
        if (annule) return
        const vues = new Set<string>()
        const out: Icone[] = []
        for (const row of j.rows ?? []) {
          const id = row.fields?.Icon?.id
          const nom = row.fields?.Name
          // Une icône sans nom ne s'écrit pas dans une liste de choix, et le
          // numéro 0 est le trou noir des feuilles : il ne dessine rien.
          if (!id || !nom || vues.has(code(id))) continue
          vues.add(code(id))
          out.push({ id: code(id), nom })
        }
        setFeuille(out)
      })
      .catch(() => {
        if (!annule) setErreur(true)
      })
    return () => {
      annule = true
    }
  }, [source, lang, parcours])

  const listeNumeros = useMemo(
    () => Array.from({ length: TRANCHE_MAX }, (_, i) => ({ id: code(debut + i), nom: '' })),
    [debut],
  )

  const trouves = useMemo(() => {
    const base = parcours ? listeNumeros : (feuille ?? [])
    const q = recherche.trim().toLowerCase()
    if (!q) return base
    return base.filter((i) => i.nom.toLowerCase().includes(q) || i.id.includes(q))
  }, [parcours, listeNumeros, feuille, recherche])

  // « Effets » compte plusieurs milliers de lignes : tout dessiner d'un coup
  // lancerait autant d'images. On montre une tranche et on dit combien reste.
  const liste = useMemo(() => trouves.slice(0, TRANCHE_MAX), [trouves])
  const enTrop = trouves.length - liste.length

  const copier = (id: string) => {
    void navigator.clipboard?.writeText(id).catch(() => {})
    setCopie(id)
  }

  return (
    <section className="relic-series group-card">
      <header className="relic-series-head">
        <h4 className="relic-series-name">{t('adminTabIcons')}</h4>
        <span className="relic-shape">{trouves.length}</span>
      </header>
      <p className="muted">{t('adminIconsNote')}</p>

      <div className="controls">
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          {FEUILLES.map((f) => (
            <option key={f.cle} value={f.cle}>
              {f.label}
            </option>
          ))}
          <option value="numeros">{t('adminIconsByNumber')}</option>
        </select>
        {parcours && (
          <>
            <button
              className="btn btn-ghost btn-mini"
              onClick={() => setDebut((v) => Math.max(0, v - TRANCHE_MAX))}
            >
              ◀
            </button>
            <input
              className="admin-icons-from"
              type="number"
              step={TRANCHE_MAX}
              value={debut}
              onChange={(e) => setDebut(Math.max(0, Number(e.target.value) || 0))}
            />
            <button className="btn btn-ghost btn-mini" onClick={() => setDebut((v) => v + TRANCHE_MAX)}>
              ▶
            </button>
          </>
        )}
        <input
          className="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder={t('adminIconsSearch')}
        />
      </div>

      {copie && <p className="notice">{t('adminIconsCopied', { id: copie })}</p>}

      {!parcours && erreur && <p className="empty">{t('adminIconsError')}</p>}
      {!parcours && !erreur && feuille === null && <p className="muted">{t('loading')}</p>}

      <div className="admin-icons">
        {liste.map((ic) => {
          const usage = dejaUtilisee(ic.id)
          return (
            <button
              key={ic.id}
              className={`admin-icon ${copie === ic.id ? 'is-active' : ''}`}
              title={t('adminIconsCopy')}
              onClick={() => copier(ic.id)}
            >
              <img src={xivIconUrl(ic.id)} alt="" width={40} height={40} loading="lazy" />
              <code>{ic.id}</code>
              {ic.nom && <span className="admin-icon-name">{ic.nom}</span>}
              {usage && <span className="chip chip-type admin-icon-used">{usage}</span>}
            </button>
          )
        })}
      </div>
      {enTrop > 0 && <p className="muted">{t('adminIconsMore', { n: enTrop })}</p>}
    </section>
  )
}
