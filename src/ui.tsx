import type { Character, Kind } from './api'
import { kindLabel, useI18n } from './i18n'
import { typeLabel } from './sources'

/** Jauge fine : progression d'une collection. La valeur est toujours écrite en toutes lettres à côté. */
export function Meter({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0
  return (
    <div className="meter">
      <div className="meter-head">
        <span className="meter-label">{label}</span>
        <span className="meter-value">
          {count}
          <span className="meter-total">/{total}</span>
        </span>
      </div>
      <div className="meter-track" role="img" aria-label={`${label}: ${count}/${total}`}>
        <div className="meter-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function TypeChip({ type }: { type: string }) {
  const { lang } = useI18n()
  return <span className="chip chip-type">{typeLabel(type, lang)}</span>
}

export function KindChip({ kind }: { kind: Kind }) {
  const { lang } = useI18n()
  return <span className={`chip chip-kind chip-kind-${kind}`}>{kindLabel(lang, kind, 'one')}</span>
}

/** Pile d'avatars des joueurs concernés, avec leur nom au survol.
 *  Limitée à 6 avatars + « +N » pour rester lisible dans les gros groupes. */
const AVATAR_STACK_MAX = 6

export function AvatarStack({ chars, size = 22 }: { chars: Character[]; size?: number }) {
  const shown = chars.slice(0, AVATAR_STACK_MAX)
  const rest = chars.length - shown.length
  return (
    <span className="avatar-stack" title={chars.map((c) => c.name).join(', ')}>
      {shown.map((c) => (
        <img key={c.id} src={c.avatar} alt={c.name} width={size} height={size} loading="lazy" />
      ))}
      {rest > 0 && (
        <span className="avatar-more" style={{ width: size, height: size }}>
          +{rest}
        </span>
      )}
    </span>
  )
}

export function StatTile({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="stat-tile">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}
