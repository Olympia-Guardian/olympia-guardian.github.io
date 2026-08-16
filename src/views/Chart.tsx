import { useId, useMemo, useState } from 'react'
import { useI18n } from '../i18n'

// Courbe d'un compteur jour par jour. Quatre mesures cohabitent dans l'onglet
// Santé et leurs ordres de grandeur n'ont rien à voir (des centaines de scrapes
// contre trois erreurs) : une seule courbe à quatre séries écraserait les trois
// petites contre l'axe. On fait donc quatre petites courbes, chacune à son
// échelle, plutôt qu'un second axe — deux axes sur un même graphique font lire
// des croisements qui n'existent pas.
//
// SVG à la main : la page d'administration n'a pas à faire venir une
// bibliothèque de graphiques de 200 ko pour tracer quatorze points.

const W = 320
const H = 84
const PAD_H = 4
const PAD_B = 14

export interface DayPoint {
  jour: string
  n: number
}

export function DayChart({
  titre,
  aide,
  points,
}: {
  titre: string
  aide?: string
  /** Une entrée par jour, du plus ancien au plus récent, trous déjà comblés. */
  points: DayPoint[]
}) {
  const { lang, t } = useI18n()
  const [survol, setSurvol] = useState<number | null>(null)
  const id = useId()

  const { d, aire, max, x, y } = useMemo(() => {
    const max = Math.max(1, ...points.map((p) => p.n))
    const x = (i: number) =>
      points.length < 2 ? W / 2 : PAD_H + (i * (W - PAD_H * 2)) / (points.length - 1)
    const y = (n: number) => PAD_H + (1 - n / max) * (H - PAD_H - PAD_B)
    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.n)}`).join(' ')
    const aire =
      points.length > 1 ? `${d} L${x(points.length - 1)},${H - PAD_B} L${x(0)},${H - PAD_B} Z` : ''
    return { d, aire, max, x, y }
  }, [points])

  if (points.length < 2) {
    return (
      <figure className="chart">
        <figcaption className="chart-title">{titre}</figcaption>
        <p className="muted chart-empty">{t('chartNotEnough')}</p>
      </figure>
    )
  }

  const jourCourt = (j: string) =>
    new Date(`${j}T12:00:00Z`).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', {
      day: 'numeric',
      month: 'short',
    })
  const dernier = points[points.length - 1]
  const total = points.reduce((n, p) => n + p.n, 0)
  const vu = survol === null ? null : points[survol]

  return (
    <figure className="chart">
      <figcaption className="chart-title">
        {titre}
        <b>{total.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US')}</b>
      </figcaption>
      <div className="chart-plot">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={t('chartAria', { titre, n: total, jours: points.length })}
          onMouseLeave={() => setSurvol(null)}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            const rel = ((e.clientX - r.left) / r.width) * W
            // Point le plus proche : la cible est la colonne, pas le pixel.
            const i = Math.round(((rel - PAD_H) / (W - PAD_H * 2)) * (points.length - 1))
            setSurvol(Math.min(points.length - 1, Math.max(0, i)))
          }}
        >
          <defs>
            <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Ligne de base et repère du maximum : discrets, ils situent sans
              attirer l'œil avant la donnée. */}
          <line x1="0" y1={H - PAD_B} x2={W} y2={H - PAD_B} className="chart-axis" />
          <line x1="0" y1={y(max)} x2={W} y2={y(max)} className="chart-gridline" />
          <path d={aire} fill={`url(#g${id})`} />
          <path d={d} className="chart-line" />
          {vu && (
            <>
              <line x1={x(survol!)} y1={PAD_H} x2={x(survol!)} y2={H - PAD_B} className="chart-cross" />
              <circle cx={x(survol!)} cy={y(vu.n)} r="4" className="chart-dot" />
            </>
          )}
          <circle cx={x(points.length - 1)} cy={y(dernier.n)} r="3" className="chart-dot" />
        </svg>
        {vu && (
          <span
            className="chart-tip"
            style={{ left: `${(x(survol!) / W) * 100}%` }}
          >
            <b>{vu.n}</b> · {jourCourt(vu.jour)}
          </span>
        )}
      </div>
      <div className="chart-foot">
        <span>{jourCourt(points[0].jour)}</span>
        <span className="chart-max">{t('chartMax', { n: max })}</span>
        <span>{jourCourt(dernier.jour)}</span>
      </div>
      {aide && <p className="chart-hint">{aide}</p>}
      {/* Les chiffres restent lisibles sans la courbe : au lecteur d'écran, à
          qui ne distingue pas la couleur, et à qui veut simplement copier. */}
      <details className="chart-table">
        <summary>{t('chartNumbers')}</summary>
        <table>
          <tbody>
            {[...points].reverse().map((p) => (
              <tr key={p.jour}>
                <th scope="row">{jourCourt(p.jour)}</th>
                <td>{p.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}

/** Complète les jours sans ligne par un zéro, mais seulement à partir du
 *  premier jour mesuré : avant l'instrumentation, « rien » n'est pas « zéro »,
 *  c'est « on ne sait pas », et tracer des zéros là serait un mensonge. */
export function serieParJour(
  metrics: { jour: string; cle: string; n: number }[],
  cle: string,
  jours: number,
): DayPoint[] {
  if (metrics.length === 0) return []
  const debutMesures = metrics.reduce((min, m) => (m.jour < min ? m.jour : min), metrics[0].jour)
  const parJour = new Map(metrics.filter((m) => m.cle === cle).map((m) => [m.jour, m.n]))
  const out: DayPoint[] = []
  for (let i = jours - 1; i >= 0; i--) {
    const jour = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10)
    if (jour < debutMesures) continue
    out.push({ jour, n: parJour.get(jour) ?? 0 })
  }
  return out
}
