import { useMemo, useState } from 'react'
import { KINDS, type Character, type Relic, type RelicDb, type RelicSeriesInfo } from '../api'
import { kindLabel, useI18n } from '../i18n'
import {
  RELIC_COSTS,
  effectiveSteps,
  mergeMaterial,
  remainingMaterials,
  type Material,
  type StepCost,
} from '../relicCosts'
import type { Db, Member } from '../store'
import { Meter, onAvatarImgError, onItemImgError, TabIcon } from '../ui'

type Ready = Member & { data: Character }

// Classement par extension, la plus récente d'abord. Les séries sans extension
// (donjons sans fond, ultimates) ont leur propre section en bas.
const EXPANSIONS: { num: number; fr: string; en: string }[] = [
  { num: 7, fr: 'Dawntrail (7.x)', en: 'Dawntrail (7.x)' },
  { num: 6, fr: 'Endwalker (6.x)', en: 'Endwalker (6.x)' },
  { num: 5, fr: 'Shadowbringers (5.x)', en: 'Shadowbringers (5.x)' },
  { num: 4, fr: 'Stormblood (4.x)', en: 'Stormblood (4.x)' },
  { num: 3, fr: 'Heavensward (3.x)', en: 'Heavensward (3.x)' },
  { num: 2, fr: 'A Realm Reborn (2.x)', en: 'A Realm Reborn (2.x)' },
  { num: 0, fr: 'Donjons spéciaux & Ultimates', en: 'Special dungeons & Ultimates' },
]

function fmt(n: number, lang: string): string {
  return n.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US')
}

function matsText(mats: { qty: number; fr: string; en: string }[], lang: string): string {
  return mats.map((mat) => `${fmt(mat.qty, lang)} ${lang === 'fr' ? mat.fr : mat.en}`).join(' · ')
}

/** Chip d'objet du grand total : icône, nom court, quantité exacte — le nom
 *  complet avec ses précisions entre parenthèses reste au survol. */
function grandChip(mat: Material, lang: string) {
  const full = lang === 'fr' ? mat.fr : mat.en
  const short = full.replace(/\s*\(.*$/, '')
  const title =
    `${fmt(mat.qty, lang)} ${full}` +
    (mat.from?.length ? '\n' + mat.from.map((line) => `• ${line}`).join('\n') : '')
  return (
    <span key={mat.key ?? mat.en} className="relic-mat-chip" title={title}>
      {mat.icon && <img src={mat.icon} alt="" width={18} height={18} loading="lazy" onError={onItemImgError} />}
      <span className="relic-mat-name">{short}</span>
      <i>×{fmt(mat.qty, lang)}</i>
    </span>
  )
}

/** Matériaux d'une étape multipliés par le nombre d'armes manquantes. */
function stepTotal(step: StepCost, missing: number): Material[] {
  return step.materials.map((mat) => ({ ...mat, qty: mat.qty * missing }))
}

/** Icône officielle d'un job (planche 0621xx du jeu, servie par XIVAPI). */
const jobIcon = (id: string) =>
  `https://v2.xivapi.com/api/asset?format=webp&path=${encodeURIComponent(`ui/icon/062000/${id}_hr1.tex`)}`

/** Job de chaque set d'armure Eurêka (catégories de classe officielles).
 *  Les paliers +1/+2/Anemos gardent le même préfixe de set.
 *  `sort` : rôles dans l'ordre du jeu — tanks, soigneurs, puis DPS. */
const ARMOR_SET_JOBS: { match: RegExp; fr: string; en: string; icon: string; sort: number }[] = [
  { match: /^Chivalrous /, fr: 'Paladin', en: 'Paladin', icon: jobIcon('062119'), sort: 0 },
  { match: /^Brutal /, fr: 'Guerrier', en: 'Warrior', icon: jobIcon('062121'), sort: 1 },
  { match: /^Abyss /, fr: 'Chevalier noir', en: 'Dark Knight', icon: jobIcon('062132'), sort: 2 },
  { match: /^Seventh Heaven /, fr: 'Mage blanc', en: 'White Mage', icon: jobIcon('062124'), sort: 10 },
  { match: /^Orator's /, fr: 'Érudit', en: 'Scholar', icon: jobIcon('062128'), sort: 11 },
  { match: /^Constellation /, fr: 'Astromancien', en: 'Astrologian', icon: jobIcon('062133'), sort: 12 },
  { match: /^Pacifist's /, fr: 'Moine', en: 'Monk', icon: jobIcon('062120'), sort: 20 },
  { match: /^Trueblood /, fr: 'Chevalier dragon', en: 'Dragoon', icon: jobIcon('062122'), sort: 21 },
  { match: /^Kage-kakushi /, fr: 'Ninja', en: 'Ninja', icon: jobIcon('062130'), sort: 22 },
  { match: /^Myochin /, fr: 'Samouraï', en: 'Samurai', icon: jobIcon('062134'), sort: 23 },
  { match: /^Storyteller's /, fr: 'Barde', en: 'Bard', icon: jobIcon('062123'), sort: 24 },
  { match: /^Gunner's /, fr: 'Machiniste', en: 'Machinist', icon: jobIcon('062131'), sort: 25 },
  { match: /^Seventh Hell /, fr: 'Mage noir', en: 'Black Mage', icon: jobIcon('062125'), sort: 26 },
  { match: /^Channeler's /, fr: 'Invocateur', en: 'Summoner', icon: jobIcon('062127'), sort: 27 },
  { match: /^Duelist's /, fr: 'Mage rouge', en: 'Red Mage', icon: jobIcon('062135'), sort: 28 },
  // Sets Idéalistes (Shadowbringers)
  { match: /^Idealized Chevalier's /, fr: 'Paladin', en: 'Paladin', icon: jobIcon('062119'), sort: 0 },
  { match: /^Idealized Boii /, fr: 'Guerrier', en: 'Warrior', icon: jobIcon('062121'), sort: 1 },
  { match: /^Idealized Bale /, fr: 'Chevalier noir', en: 'Dark Knight', icon: jobIcon('062132'), sort: 2 },
  { match: /^Idealized Bodyguard's /, fr: 'Pistosabreur', en: 'Gunbreaker', icon: jobIcon('062137'), sort: 3 },
  { match: /^Idealized Ebers /, fr: 'Mage blanc', en: 'White Mage', icon: jobIcon('062124'), sort: 10 },
  { match: /^Idealized Arbatel /, fr: 'Érudit', en: 'Scholar', icon: jobIcon('062128'), sort: 11 },
  { match: /^Idealized Soothsayer's /, fr: 'Astromancien', en: 'Astrologian', icon: jobIcon('062133'), sort: 12 },
  { match: /^Idealized Bhikku /, fr: 'Moine', en: 'Monk', icon: jobIcon('062120'), sort: 20 },
  { match: /^Idealized Pteroslaver /, fr: 'Chevalier dragon', en: 'Dragoon', icon: jobIcon('062122'), sort: 21 },
  { match: /^Idealized Hattori /, fr: 'Ninja', en: 'Ninja', icon: jobIcon('062130'), sort: 22 },
  { match: /^Idealized Kasuga /, fr: 'Samouraï', en: 'Samurai', icon: jobIcon('062134'), sort: 23 },
  { match: /^Idealized Fili /, fr: 'Barde', en: 'Bard', icon: jobIcon('062123'), sort: 24 },
  { match: /^Idealized Gunslinger's /, fr: 'Machiniste', en: 'Machinist', icon: jobIcon('062131'), sort: 25 },
  { match: /^Idealized Dancer's /, fr: 'Danseur', en: 'Dancer', icon: jobIcon('062138'), sort: 26 },
  { match: /^Idealized Wicce /, fr: 'Mage noir', en: 'Black Mage', icon: jobIcon('062125'), sort: 27 },
  { match: /^Idealized Beckoner's /, fr: 'Invocateur', en: 'Summoner', icon: jobIcon('062127'), sort: 28 },
  { match: /^Idealized Estoqueur's /, fr: 'Mage rouge', en: 'Red Mage', icon: jobIcon('062135'), sort: 29 },
]

/** Rang de chaque job pour le tri tank > heal > DPS des grilles d'armes.
 *  Les reliques portent leur catégorie de classe (« GLA PLD ») dans `jobs`. */
const JOB_SORT: Record<string, number> = {
  PLD: 0, WAR: 1, DRK: 2, GNB: 3,
  WHM: 10, SCH: 11, AST: 12, SGE: 13,
  MNK: 20, DRG: 21, NIN: 22, SAM: 23, RPR: 24, VPR: 25,
  BRD: 30, MCH: 31, DNC: 32,
  BLM: 40, SMN: 41, RDM: 42, PCT: 43, BLU: 44,
}

/** Rang d'une relique : le meilleur rang parmi ses jobs (inconnu → à la fin). */
function jobRank(r: Relic): number {
  if (!r.jobs) return 99
  let best = 99
  for (const ab of r.jobs.split(' ')) {
    const v = JOB_SORT[ab]
    if (v !== undefined && v < best) best = v
  }
  return best
}

/** Rôle de chaque set GARO, pour le tri tanks → soigneurs → DPS. */
const GARO_SORT: Record<string, number> = {
  'Golden Wolf': 0, // Paladin
  'Undying Twilight': 1, // Guerrier
  'Pressing Darkness': 2, // Chevalier noir
  'Makai Vanguard': 3, // Pistosabreur
  'Makai Vanbreaker': 4,
  'Makai Sun Guide': 10, // Soigneurs
  'Makai Moon Guide': 11,
  'White Night': 20, // Chevalier dragon
  'Silver Wolf': 21, // Ninja
  'Makai Mauler': 22, // Moine / Samouraï
  'Makai Manhandler': 23,
  'Makai Harbinger': 24, // Faucheur
  'Makai Harrower': 25,
  'Makai Marksman': 26, // Distance
  'Makai Markswoman': 27,
  'Makai Priest': 28, // Mages
  'Makai Priestess': 29,
}

/** Relique sélectionnée : la fiche a besoin de sa série et de son palier. */
/** Paliers liés d'une même arme/pièce : cocher implique les précédents,
 *  décocher entraîne les suivants (séries à étapes d'amélioration seulement). */
type RelicChain = { before: number[]; after: number[] }

type RelicPick = { relic: Relic; info: RelicSeriesInfo; step: number; chain?: RelicChain }

/** Fiche latérale d'une relique, jumelle de celle des collections. */
function RelicPanel({
  pick,
  owned,
  onToggle,
  onClose,
}: {
  pick: RelicPick
  owned: boolean
  onToggle: () => void
  onClose: () => void
}) {
  const { lang, t } = useI18n()
  const { relic, info, step } = pick
  const steps = info.stepSizes?.length ?? Math.max(1, Math.round(info.total / info.jobs))
  const costs = RELIC_COSTS[info.key]
  const stepCost = costs ? effectiveSteps(costs, steps)[step] : null
  const catKey =
    info.category === 'weapons'
      ? 'relCatWeapons'
      : info.category === 'ultimate'
        ? 'relCatUltimate'
        : info.category === 'tools'
          ? 'relCatTools'
          : info.category === 'armor'
            ? 'relCatArmor'
            : 'relCatGaro'
  const perKey =
    info.category === 'weapons' || info.category === 'ultimate'
      ? 'relicPerWeapon'
      : info.category === 'tools'
        ? 'relicPerTool'
        : 'relicPerPiece'

  return (
    <aside className="item-panel">
      <button className="icon-btn item-panel-close" title={t('close')} onClick={onClose}>
        ×
      </button>
      <img className="item-panel-image" src={relic.icon} alt="" loading="lazy" onError={onItemImgError} />
      <h3 className="item-panel-name">{lang === 'fr' ? relic.name : relic.nameEn}</h3>
      {lang === 'fr' && relic.nameEn !== relic.name && <p className="modal-en">{relic.nameEn}</p>}
      <p className="modal-chips">
        <span className="chip chip-type">{t(catKey)}</span>
        <span className="chip chip-patch">{lang === 'fr' ? info.name : info.key}</span>
        {steps > 1 && info.category !== 'garo' && (
          <span className="chip chip-patch">
            {costs?.stepLabels?.[step]
              ? lang === 'fr'
                ? costs.stepLabels[step].fr
                : costs.stepLabels[step].en
              : t(info.category === 'armor' ? 'relicTier' : 'relicStep', { n: step + 1 })}
          </span>
        )}
        <span className={`chip ${owned ? 'chip-owned' : 'chip-type'}`}>
          {owned ? t('panelOwned') : t('panelMissing')}
        </span>
      </p>
      {stepCost && stepCost.materials.length > 0 && (
        <p className="modal-desc">
          <span className="relic-remaining-label">{t(perKey)}</span>{' '}
          {matsText(stepCost.materials, lang)}
        </p>
      )}
      {stepCost?.once && (
        <p className="modal-desc relic-once">
          <span className="relic-remaining-label">{t('relicOnce')}</span>{' '}
          {matsText(stepCost.once, lang)}
        </p>
      )}
      {(() => {
        const url = lang === 'en' ? (stepCost?.urlEn ?? costs?.urlEn ?? stepCost?.url) : stepCost?.url
        return url ? (
          <p className="modal-desc">
            <a className="relic-guide" href={url} target="_blank" rel="noreferrer">
              {t('relicGuide')}
            </a>
          </p>
        ) : null
      })()}
      <button
        className={`btn ${owned ? 'btn-ghost' : 'btn-primary'} item-panel-action`}
        onClick={onToggle}
      >
        {owned ? t('panelRemove') : t('panelAdd')}
      </button>
    </aside>
  )
}

function SeriesCard({
  info,
  relics,
  ready,
  ownedSets,
  onRelicClick,
  onSetRelics,
}: {
  info: RelicSeriesInfo
  relics: Relic[]
  ready: Ready[]
  ownedSets: Map<number, Set<number>>
  onRelicClick?: (relic: Relic, step: number, chain?: RelicChain) => void
  /** « Tout ajouter / retirer » sur un palier (Mon Journal). */
  onSetRelics?: (ids: number[], add: boolean) => void
}) {
  const { lang, t } = useI18n()
  // GARO : pas d'étapes — 17 sets contigus de 5 pièces (Visage/Corps/Bras/
  // Jambes/Pieds), un par job. Le découpage total/jobs n'a aucun sens ici.
  const garoSets = info.category === 'garo' && relics.some((r) => /^The \w+ of /.test(r.nameEn))
  // Ultimates : étapes de tailles inégales, décrites par stepSizes.
  const steps = info.stepSizes
    ? info.stepSizes.length
    : garoSets
      ? 1
      : Math.max(1, Math.round(info.total / info.jobs))
  const costs = RELIC_COSTS[info.key]
  const costSteps: StepCost[] | null = costs ? effectiveSteps(costs, steps) : null
  const name = lang === 'fr' ? info.name : info.key
  // Pour une armure l'unité est la pièce, et une étape est un palier.
  const isArmor = info.category === 'armor'
  const stepKey = isArmor ? 'relicTier' : 'relicStep'
  // Donjons sans fond : chaque « étape » est une série d'armes d'un donjon
  // précis — on affiche sa provenance plutôt qu'un numéro.
  const stepLabel = (i: number) => {
    const l = costs?.stepLabels?.[i]
    return l ? (lang === 'fr' ? l.fr : l.en) : t(stepKey, { n: i + 1 })
  }
  const catKey =
    info.category === 'weapons'
      ? 'relCatWeapons'
      : info.category === 'ultimate'
        ? 'relCatUltimate'
        : info.category === 'tools'
          ? 'relCatTools'
          : info.category === 'armor'
            ? 'relCatArmor'
            : 'relCatGaro'
  const perKey =
    info.category === 'weapons' || info.category === 'ultimate'
      ? 'relicPerWeapon'
      : info.category === 'tools'
        ? 'relicPerTool'
        : 'relicPerPiece'

  // Armures : pièces regroupées par rôle (l'ordre du jeu), puis par
  // emplacement. Les sets propres à un job (Eurêka, Idéalistes) n'ont pas de
  // rôle dans leur nom : on les regroupe par set via le nom anglais, qui
  // commence toujours par le nom du set.
  // Tank > Heal > DPS (mêlée, distance, mages) — la règle de tri des reliques.
  const ROLE_ORDER = ['Fending', 'Healing', 'Maiming', 'Striking', 'Scouting', 'Aiming', 'Casting'] as const
  const roleOf = (r: Relic) =>
    ROLE_ORDER.indexOf(
      (r.nameEn.match(/ of (Fending|Maiming|Striking|Scouting|Aiming|Casting|Healing)\b/)?.[1] ??
        '') as (typeof ROLE_ORDER)[number],
    )
  const sortArmor = (list: Relic[]): Relic[] => {
    if (!isArmor) {
      // Armes (sagas, ultimates, GARO, donjons sans fond) : tank > heal > DPS
      // via la catégorie de classe de chaque arme. Les outils restent dans
      // l'ordre des métiers.
      if (info.category === 'tools') return list
      return [...list].sort((a, b) => jobRank(a) - jobRank(b) || a.order - b.order)
    }
    return [...list].sort((a, b) => {
      const ra = roleOf(a)
      const rb = roleOf(b)
      if (ra !== rb) return ra - rb
      if (ra === -1) return a.nameEn.localeCompare(b.nameEn) || a.order - b.order
      return a.order - b.order
    })
  }

  /** Blocs affichés dans la grille : un par rôle (libellé), ou un par set de
   *  job (5 pièces, sans libellé) pour les armures spécifiques à un job. */
  const armorGroups = (list: Relic[]): { label: string | null; icon?: string; items: Relic[] }[] => {
    if (garoSets) {
      // Un bloc par set de 5 pièces contiguës, étiqueté du nom du set —
      // personnages GARO (« Loup doré ») comme sets Makai (« Lutteur Makai »),
      // rangés tanks → soigneurs → DPS (le job du set n'est pas affiché).
      const enKey = (r: Relic) =>
        r.nameEn.match(/^The \w+ of (?:the )?(.+)$/i)?.[1] ??
        r.nameEn.match(/^(Makai .+?)'s /i)?.[1] ??
        r.nameEn
      const label = (r: Relic) => {
        const raw =
          lang === 'fr'
            ? r.name.replace(/^.*?\s(?:du |de la |de l'|des |de )/i, '')
            : enKey(r)
        return raw.charAt(0).toUpperCase() + raw.slice(1)
      }
      const out: { label: string | null; sort: number; items: Relic[] }[] = []
      for (let j = 0; j < list.length; j += 5) {
        const items = list.slice(j, j + 5)
        out.push({ label: label(items[0]), sort: GARO_SORT[enKey(items[0])] ?? 99, items })
      }
      return out.sort((a, b) => a.sort - b.sort)
    }
    if (!isArmor) return [{ label: null, items: list }]
    if (list.some((r) => roleOf(r) >= 0)) {
      return ROLE_ORDER.map((role, ri) => ({
        label: t(`role${role}` as 'roleFending'),
        items: list.filter((r) => roleOf(r) === ri),
      })).filter((g) => g.items.length > 0)
    }
    // Sets de job (Eurêka, Idéalistes) : contigus par ordre, 5 pièces chacun.
    // Quand le set est connu : icône + nom de la classe, rangés tanks →
    // soigneurs → DPS (l'ordre du jeu).
    const sorted = [...list].sort((a, b) => a.order - b.order)
    const out: { label: string | null; icon?: string; sort: number; items: Relic[] }[] = []
    for (let j = 0; j < sorted.length; j += 5) {
      const items = sorted.slice(j, j + 5)
      const base = items[0].nameEn.replace(/^Anemos /, '')
      const job = ARMOR_SET_JOBS.find((e) => e.match.test(base))
      out.push({
        label: job ? (lang === 'fr' ? job.fr : job.en) : null,
        icon: job?.icon,
        sort: job?.sort ?? 99,
        items,
      })
    }
    return out.sort((a, b) => a.sort - b.sort)
  }

  // relics de chaque étape (l'ordre API est trié étape par étape).
  // GARO : une seule « étape » = toute la série, triée par ordre (les sets
  // de 5 pièces sont contigus).
  const stepRelics = info.stepSizes
    ? (() => {
        const sorted = [...relics].sort((a, b) => a.order - b.order)
        const out: Relic[][] = []
        let off = 0
        for (const n of info.stepSizes) {
          out.push(sortArmor(sorted.slice(off, off + n)))
          off += n
        }
        return out
      })()
    : garoSets
      ? [[...relics].sort((a, b) => a.order - b.order)]
      : Array.from({ length: steps }, (_, i) =>
          sortArmor(relics.filter((r) => Math.ceil(r.order / info.jobs) === i + 1)),
        )
  const ownedInStep = (memberId: number, i: number) => {
    const owned = ownedSets.get(memberId)!
    return stepRelics[i].reduce((sum, r) => sum + (owned.has(r.id) ? 1 : 0), 0)
  }

  // Coche en cascade : un palier implique les précédents (et décosher un
  // palier retire les suivants). Uniquement quand les étapes sont de vraies
  // améliorations — pas pour les donjons sans fond, ultimates ou sets GARO.
  const chained = steps > 1 && !info.stepSizes && !garoSets && !costs?.independentSteps
  const chainFor = (relic: Relic, step: number): RelicChain | undefined => {
    if (!chained) return undefined
    // Position de l'arme/pièce dans son palier via l'ordre API (1-based),
    // insensible aux tris d'affichage (rôles, jobs, noms).
    const pos = (relic.order - 1) % info.jobs
    const before: number[] = []
    const after: number[] = []
    for (let s = 0; s < stepRelics.length; s++) {
      if (s === step) continue
      const match = stepRelics[s].find((r) => (r.order - 1) % info.jobs === pos)
      if (match) (s < step ? before : after).push(match.id)
    }
    return { before, after }
  }

  // Guide dans la langue de l'interface : FR → guides ffxiv-eorzea des sagas,
  // EN → page consolegameswiki correspondante.
  const guideUrl = (st?: StepCost) =>
    lang === 'en' ? (st?.urlEn ?? costs?.urlEn ?? st?.url) : st?.url
  const guideLink = (st?: StepCost) => {
    const url = guideUrl(st)
    return url ? (
      <a className="relic-guide" href={url} target="_blank" rel="noreferrer">
        {t('relicGuide')}
      </a>
    ) : null
  }

  // Total pour UNE relique de bout en bout (toutes étapes + objets « première
  // arme »), affiché en icônes dans l'en-tête. Uniquement pour les séries dont
  // les matériaux ont leurs icônes officielles.
  const totalMats = (() => {
    if (!costSteps) return []
    const acc = new Map<string, Material>()
    costSteps.forEach((st, i) => {
      for (const mat of st.materials) mergeMaterial(acc, mat)
      // Dès qu'une pièce du palier est cochée, sa quête « 1re arme » est
      // forcément faite : on ne compte plus ses objets, quel que soit le mode.
      const started =
        ready.length === 1 && (stepRelics[i]?.length ?? 0) > 0 && ownedInStep(ready[0].id, i) > 0
      if (!started) for (const mat of st.once ?? []) mergeMaterial(acc, mat)
    })
    return [...acc.values()]
  })()
  const showReq = totalMats.length > 0 && totalMats.some((mat) => mat.icon)
  const compactQty = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : fmt(n, lang))

  // Switch « 1 arme / restant » : le restant agrège les matériaux de toutes
  // les pièces manquantes du joueur (visible seul, donc dans Mon Journal).
  const [reqLeft, setReqLeft] = useState(false)
  const remainingMats = (() => {
    if (!costs || ready.length !== 1) return null
    // Manquant par étape = pièces réellement listées dans l'étape (85 pour
    // GARO en bloc unique), pas la colonne « jobs » de l'API.
    const missingPerStep = stepRelics.map((list, i) =>
      list.length > 0 ? list.length - ownedInStep(ready[0].id, i) : 0,
    )
    const rem = remainingMaterials(costs, missingPerStep, info.jobs)
    const acc = new Map<string, Material>()
    for (const mat of [...rem.perWeapon, ...rem.once]) mergeMaterial(acc, mat)
    return [...acc.values()]
  })()
  const shownMats = reqLeft && remainingMats ? remainingMats : totalMats

  /** Chip d'objet : icône (si elle existe), nom court et quantité — le nom
   *  complet avec ses précisions entre parenthèses reste au survol. */
  const matIcon = (mat: Material) => {
    const full = lang === 'fr' ? mat.fr : mat.en
    const short = full.replace(/\s*\(.*$/, '')
    return (
      <span key={mat.key ?? mat.en} className="relic-mat-chip" title={`${fmt(mat.qty, lang)} ${full}`}>
        {mat.icon && <img src={mat.icon} alt="" width={18} height={18} loading="lazy" onError={onItemImgError} />}
        <span className="relic-mat-name">{short}</span>
        <i>×{compactQty(mat.qty)}</i>
      </span>
    )
  }

  return (
    <article className="relic-series">
      <header className="relic-series-head">
        <h4 className="relic-series-name">{name}</h4>
        <span className="chip chip-type">{t(catKey)}</span>
        <span className="relic-shape">
          {info.stepSizes
            ? t('relicShapeFights', { steps })
            : steps > 1
              ? t(isArmor ? 'relicShapeNArmor' : 'relicShapeN', { steps, jobs: info.jobs })
              : garoSets
              ? t('relicShapeGaro', { sets: Math.round(info.total / 5) })
              : t(isArmor ? 'relicShape1Armor' : 'relicShape1', { jobs: info.jobs })}
        </span>
      </header>

      {showReq && (
        <div className="relic-req">
          {remainingMats ? (
            <div className="mode-switch relic-req-switch">
              <button
                className={`mode-btn ${!reqLeft ? 'is-active' : ''}`}
                onClick={() => setReqLeft(false)}
              >
                {t(isArmor ? 'relicReqOnePiece' : 'relicReqOneWeapon')}
              </button>
              <button
                className={`mode-btn ${reqLeft ? 'is-active' : ''}`}
                onClick={() => setReqLeft(true)}
              >
                {t('relicReqLeft')}
              </button>
            </div>
          ) : (
            <span className="relic-remaining-label">
              {t(isArmor ? 'relicReqPiece' : 'relicReqWeapon')}
            </span>
          )}
          <div className="relic-req-items">
            {shownMats.length === 0 && <span className="relic-done">{t('relicDone')}</span>}
            {shownMats.map(matIcon)}
          </div>
        </div>
      )}

      {/* Totaux par joueur */}
      <div className="relic-players">
        {ready.map((member) => {
          const owned = ownedSets.get(member.id)!
          const count = relics.reduce((sum, r) => sum + (owned.has(r.id) ? 1 : 0), 0)
          return (
            <div key={member.id} className="relic-player">
              <img src={member.data.avatar} alt="" width={26} height={26} title={member.data.name} onError={onAvatarImgError} />
              <div className="relic-meter">
                <Meter label={member.data.name.split(' ')[0]} count={count} total={info.total} />
              </div>
              {count >= info.total && <span className="relic-done">{t('relicDone')}</span>}
            </div>
          )
        })}
      </div>

      {/* Solo : grille d'icônes par étape, à la FFXIV Collect */}
      {ready.length === 1 &&
        (() => {
          const owned = ownedSets.get(ready[0].id)!
          return (
            <div className="relic-icon-steps">
              {stepRelics.map((list, i) => {
                const stepCost = costSteps?.[i]
                const c = list.reduce((sum, r) => sum + (owned.has(r.id) ? 1 : 0), 0)
                return (
                  <div key={i} className="relic-icon-step">
                    <div className="relic-step-info">
                      {(steps > 1 || onSetRelics) && (
                        <span className="relic-step-head">
                          {steps > 1 && (
                            <b>
                              {stepLabel(i)} ·{' '}
                              <span className={c >= list.length ? 'relic-done' : ''}>
                                {c}/{list.length}
                              </span>
                            </b>
                          )}
                          {guideLink(stepCost)}
                          {onSetRelics && (
                            <button
                              className="btn btn-ghost btn-mini relic-bulk"
                              onClick={() => {
                                const add = c < list.length
                                // Cascade : ajouter un palier ajoute les précédents,
                                // le retirer retire aussi les suivants.
                                const ids = chained
                                  ? (add ? stepRelics.slice(0, i + 1) : stepRelics.slice(i))
                                      .flat()
                                      .map((r) => r.id)
                                  : list.map((r) => r.id)
                                onSetRelics(ids, add)
                              }}
                            >
                              {c < list.length ? t('relicAddAll') : t('relicRemoveAll')}
                            </button>
                          )}
                          {/* Objets requis sur la même ligne, poussés à droite ;
                              les quantités suivent le switch d'en haut. */}
                          {stepCost && stepCost.materials.length > 0 && showReq && (
                            <span className="relic-req-items">
                              {reqLeft && remainingMats && list.length - c === 0 ? (
                                <span className="relic-done">{t('relicDone')}</span>
                              ) : (
                                (reqLeft && remainingMats
                                  ? stepTotal(stepCost, list.length - c)
                                  : stepCost.materials
                                ).map(matIcon)
                              )}
                            </span>
                          )}
                        </span>
                      )}
                      {/* « 1re arme seulement » : dès qu'une pièce du palier existe, c'est fait. */}
                      {stepCost?.once && showReq && c === 0 && (
                        <span className="relic-step-mats relic-once relic-step-iconrow">
                          <span className="relic-req-items">{stepCost.once.map(matIcon)}</span>
                        </span>
                      )}
                      {/* Séries encore sans icônes : lignes de texte historiques. */}
                      {stepCost && stepCost.materials.length > 0 && !showReq && (
                        <>
                          <span className="relic-step-mats">
                            <span className="relic-remaining-label">{t(perKey)}</span>{' '}
                            {matsText(stepCost.materials, lang)}
                          </span>
                          {list.length - c > 0 && (
                            <span className="relic-step-mats relic-step-total">
                              <span className="relic-remaining-label">
                                {t('relicStepTotal', { n: list.length - c })}
                              </span>{' '}
                              {matsText(stepTotal(stepCost, list.length - c), lang)}
                            </span>
                          )}
                          {stepCost.once && (
                            <span className="relic-step-mats relic-once">
                              <span className="relic-remaining-label">{t('relicOnce')}</span>{' '}
                              {matsText(stepCost.once, lang)}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    <div className={isArmor || garoSets ? 'relic-icon-groups' : undefined}>
                      {armorGroups(list).map((g, gi) => (
                        <div key={gi} className={isArmor || garoSets ? 'relic-icon-group' : undefined}>
                          {g.label && (
                            <span className="relic-role-label">
                              {g.icon && <img src={g.icon} alt="" width={16} height={16} loading="lazy" />}
                              {g.label}
                            </span>
                          )}
                          <div className="relic-icons">
                            {g.items.map((r) => {
                              const has = owned.has(r.id)
                              const label = `${lang === 'fr' ? r.name : r.nameEn}${has ? ' ✓' : ''}`
                              const content = (
                                <>
                                  <img src={r.icon} alt="" width={36} height={36} loading="lazy" onError={onItemImgError} />
                                  {has && <span className="relic-badge">✓</span>}
                                </>
                              )
                              return onRelicClick ? (
                                <button
                                  key={r.id}
                                  className={`relic-icon is-editable ${has ? 'is-owned' : 'is-missing'}`}
                                  title={`${label} — ${t(has ? 'relicUncheck' : 'relicCheck')}`}
                                  onClick={() => onRelicClick(r, i, chainFor(r, i))}
                                >
                                  {content}
                                </button>
                              ) : (
                                <span
                                  key={r.id}
                                  className={`relic-icon ${has ? 'is-owned' : 'is-missing'}`}
                                  title={label}
                                >
                                  {content}
                                </span>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })()}

      {/* Groupe : progression étape par étape en tableau */}
      {ready.length > 1 && steps > 1 && (
        <div className="relic-steps-wrap">
          <table className="relic-steps">
            <thead>
              <tr>
                <th className="relic-step-info" />
                {ready.map((member) => (
                  <th key={member.id} title={member.data.name}>
                    <img src={member.data.avatar} alt={member.data.name} width={24} height={24} onError={onAvatarImgError} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stepRelics.map((_, i) => {
                const stepCost = costSteps?.[i]
                return (
                  <tr key={i}>
                    <td className="relic-step-info">
                      <b>{stepLabel(i)}</b>
                      {stepCost && stepCost.materials.length > 0 && (
                        <span className="relic-step-mats">
                          {' '}
                          <span className="relic-remaining-label">{t(perKey)}</span>{' '}
                          {matsText(stepCost.materials, lang)} {guideLink(stepCost)}
                        </span>
                      )}
                      {stepCost?.once && (
                        <span className="relic-step-mats relic-once">
                          <span className="relic-remaining-label">{t('relicOnce')}</span>{' '}
                          {matsText(stepCost.once, lang)}
                        </span>
                      )}
                    </td>
                    {ready.map((member) => {
                      const c = ownedInStep(member.id, i)
                      const cls = c >= info.jobs ? 'is-full' : c === 0 ? 'is-zero' : 'is-part'
                      const missing = info.jobs - c
                      const tip =
                        stepCost && stepCost.materials.length > 0 && missing > 0
                          ? `${member.data.name.split(' ')[0]} — ${t('relicStepTotal', { n: missing })} ${matsText(stepTotal(stepCost, missing), lang)}`
                          : member.data.name
                      return (
                        <td key={member.id} className={`relic-step-cell ${cls}`} title={tip}>
                          {c}/{info.jobs}
                          {c >= info.jobs && ' ✓'}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Groupe, série à palier unique : le coût par pièce en une ligne */}
      {ready.length > 1 && steps === 1 && costSteps?.[0] && costSteps[0].materials.length > 0 && (
        <p className="relic-step-mats relic-single-cost">
          <span className="relic-remaining-label">{t(perKey)}</span>{' '}
          {matsText(costSteps[0].materials, lang)} {guideLink(costSteps[0])}
        </p>
      )}

    </article>
  )
}

function pct(count: number, total: number, lang: string): string {
  const v = total > 0 ? (count / total) * 100 : 0
  // Toujours une décimale (sauf 100) : même largeur partout, ça s'aligne.
  const sv = v >= 100 ? '100' : v.toFixed(1)
  return `${sv.replace('.', lang === 'fr' ? ',' : '.')} %`
}

/** Vue de groupe : uniquement l'avancement. Le détail (paliers, matériaux,
 *  icônes) vit dans « Mon Journal », où l'on ne regarde que son propre perso. */
/** Couleur de jauge par palier d'avancement (rouge → orange → bleu → vert). */
function barLevel(c: number, total: number): string {
  if (total > 0 && c >= total) return 'is-done'
  const p = total > 0 ? c / total : 0
  return p < 1 / 3 ? 'lvl-low' : p < 2 / 3 ? 'lvl-mid' : 'lvl-high'
}

function RelicSummary({
  db,
  cdb,
  ready,
  ownedSets,
  byExpansion,
  bySeries,
}: {
  db: RelicDb
  /** Catalogues des collections : la page devient « Avancement du groupe ». */
  cdb?: Db
  ready: Ready[]
  ownedSets: Map<number, Set<number>>
  byExpansion: Map<number, RelicSeriesInfo[]>
  bySeries: Map<string, Relic[]>
}) {
  const { lang, t } = useI18n()
  const totalAll = db.relics.length
  // Total du bandeau : reliques + tous les catalogues quand on mixe tout.
  const headerTotal = cdb ? totalAll + KINDS.reduce((s, k) => s + cdb[k].length, 0) : totalAll

  return (
    <div className="view">
      <section className="relic-series relic-global">
        <header className="relic-series-head">
          <h4 className="relic-series-name">{t(cdb ? 'groupProgress' : 'relicGlobal')}</h4>
          <span className="relic-shape">{fmt(headerTotal, lang)}</span>
        </header>
        {ready.map((m) => {
          const owned = ownedSets.get(m.id)!
          const relicCount = db.relics.reduce((sum, r) => sum + (owned.has(r.id) ? 1 : 0), 0)
          // Jauge d'en-tête : collections + reliques confondues.
          const colCount = cdb ? KINDS.reduce((s, k) => s + m.data[k].count, 0) : 0
          const colTotal = cdb ? KINDS.reduce((s, k) => s + m.data[k].total, 0) : 0
          const count = relicCount + colCount
          const total = totalAll + colTotal
          return (
            <details key={m.id} className="relic-player-fold" open={ready.length === 1}>
              <summary className="relic-player">
                <img
                  src={m.data.avatar}
                  alt=""
                  width={26}
                  height={26}
                  title={m.data.name}
                  onError={onAvatarImgError}
                />
                <div className="relic-meter">
                  <Meter label={m.data.name.split(' ')[0]} count={count} total={total} />
                </div>
                <span className="relic-remaining">{pct(count, total, lang)}</span>
              </summary>
              <div className={cdb ? 'relic-breakdown relic-breakdown-single' : 'relic-breakdown'}>
                {cdb && (
                  <div className="relic-exp-block">
                    <header className="relic-exp-head">
                      <b>{t('progressCollections')}</b>
                      <span className={count >= total ? 'relic-done' : 'relic-remaining'}>
                        {pct(count, total, lang)}
                      </span>
                    </header>
                    <ul className="relic-exp-list">
                      {KINDS.filter((k) => k !== 'facewear' && k !== 'hairstyles').map((k) => {
                        // « Mode » : accessoires + lunettes + coiffures en une ligne.
                        const merged = k === 'fashions'
                        const c = merged
                          ? m.data.fashions.count + m.data.facewear.count + m.data.hairstyles.count
                          : m.data[k].count
                        const tt = merged
                          ? m.data.fashions.total + m.data.facewear.total + m.data.hairstyles.total
                          : m.data[k].total
                        const done = tt > 0 && c >= tt
                        return (
                          <li key={k} className="relic-exp-row">
                            <span className="relic-exp-name">
                              {merged ? t('fashionFamily') : kindLabel(lang, k)}
                            </span>
                            <span className="relic-exp-bar">
                              <i
                                className={barLevel(c, tt)}
                                style={{ width: `${tt > 0 ? (c / tt) * 100 : 0}%` }}
                              />
                            </span>
                            <span className="relic-exp-count">
                              {c}/{tt}
                            </span>
                            <span className={`relic-exp-pct ${done ? 'relic-done' : ''}`}>
                              {pct(c, tt, lang)}
                            </span>
                          </li>
                        )
                      })}
                      <li className="relic-exp-row">
                        <span className="relic-exp-name">{t('progressRelics')}</span>
                        <span className="relic-exp-bar">
                          <i
                            className={barLevel(relicCount, totalAll)}
                            style={{ width: `${totalAll > 0 ? (relicCount / totalAll) * 100 : 0}%` }}
                          />
                        </span>
                        <span className="relic-exp-count">
                          {relicCount}/{totalAll}
                        </span>
                        <span className={`relic-exp-pct ${relicCount >= totalAll ? 'relic-done' : ''}`}>
                          {pct(relicCount, totalAll, lang)}
                        </span>
                      </li>
                    </ul>
                  </div>
                )}
                {/* Avancement du groupe : pas de détail des reliques par
                    extension — la ligne « Reliques » du bloc suffit. */}
                {!cdb && EXPANSIONS.map(({ num, fr, en }) => {
                  const series = byExpansion.get(num)
                  if (!series || series.length === 0) return null
                  const expTotal = series.reduce((sum, s) => sum + s.total, 0)
                  const expCount = series.reduce(
                    (sum, s) =>
                      sum +
                      (bySeries.get(s.key) ?? []).reduce((n, r) => n + (owned.has(r.id) ? 1 : 0), 0),
                    0,
                  )
                  return (
                    <div key={num} className="relic-exp-block">
                      <header className="relic-exp-head">
                        <b>{lang === 'fr' ? fr : en}</b>
                        <span className={expCount >= expTotal ? 'relic-done' : 'relic-remaining'}>
                          {pct(expCount, expTotal, lang)}
                        </span>
                      </header>
                      <ul className="relic-exp-list">
                        {series.map((s) => {
                          const c = (bySeries.get(s.key) ?? []).reduce(
                            (n, r) => n + (owned.has(r.id) ? 1 : 0),
                            0,
                          )
                          const done = c >= s.total
                          return (
                            <li key={s.key} className="relic-exp-row">
                              <span className="relic-exp-name">{lang === 'fr' ? s.name : s.key}</span>
                              <span className="relic-exp-bar">
                                <i
                                  className={done ? 'is-done' : ''}
                                  style={{ width: `${s.total > 0 ? (c / s.total) * 100 : 0}%` }}
                                />
                              </span>
                              <span className="relic-exp-count">
                                {c}/{s.total}
                              </span>
                              <span className={`relic-exp-pct ${done ? 'relic-done' : ''}`}>
                                {pct(c, s.total, lang)}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )
                })}
              </div>
            </details>
          )
        })}
      </section>
      <p className="relic-note">{t('relicSummaryNote')}</p>
    </div>
  )
}

export function Relics({
  db,
  cdb,
  ready,
  detailed = false,
  onToggleRelic,
  onSetRelics,
}: {
  db: RelicDb
  /** Catalogues des collections : le résumé devient « Avancement du groupe ». */
  cdb?: Db
  ready: Ready[]
  /** « Mon Journal » : paliers, matériaux et icônes. Sinon : avancement seul. */
  detailed?: boolean
  /** Fourni dans « Mon Journal » : chaque relique devient cochable. */
  onToggleRelic?: (id: number) => void
  /** Fourni dans « Mon Journal » : « Tout ajouter / retirer » par palier. */
  onSetRelics?: (ids: number[], add: boolean) => void
}) {
  const { lang, t } = useI18n()
  const [mode, setMode] = useState<'quick' | 'inspect'>('inspect')
  const [pick, setPick] = useState<RelicPick | null>(null)

  const ownedSets = useMemo(
    () => new Map(ready.map((m) => [m.id, new Set(m.data.relicIds)])),
    [ready],
  )

  const bySeries = useMemo(() => {
    const map = new Map<string, Relic[]>()
    for (const r of db.relics) {
      const arr = map.get(r.series)
      if (arr) arr.push(r)
      else map.set(r.series, [r])
    }
    return map
  }, [db])

  // Séries par extension ; dans chaque extension : armes d'abord, puis le reste.
  // Les armures suivent directement leurs armes ; les outils ferment la marche.
  const CAT_ORDER = ['weapons', 'ultimate', 'armor', 'garo', 'tools']
  const byExpansion = useMemo(() => {
    const map = new Map<number, RelicSeriesInfo[]>()
    for (const s of db.series) {
      const arr = map.get(s.expansion)
      if (arr) arr.push(s)
      else map.set(s.expansion, [s])
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          CAT_ORDER.indexOf(a.category) - CAT_ORDER.indexOf(b.category) || a.order - b.order,
      )
    }
    return map
  }, [db])

  const totalAll = db.relics.length

  // LE GROS TOTAL : tous les objets restants, toutes séries confondues, par joueur.
  const grandTotals = useMemo(() => {
    const perPlayer = new Map<number, Material[]>()
    for (const member of ready) {
      const owned = ownedSets.get(member.id)!
      const acc = new Map<string, Material>()
      for (const info of db.series) {
        const costs = RELIC_COSTS[info.key]
        if (!costs) continue
        const steps = Math.max(1, Math.round(info.total / info.jobs))
        const relics = bySeries.get(info.key) ?? []
        const missingPerStep = Array.from({ length: steps }, (_, i) => {
          const inStep = relics.filter((r) => Math.ceil(r.order / info.jobs) === i + 1)
          return inStep.reduce((sum, r) => sum + (owned.has(r.id) ? 0 : 1), 0)
        })
        // Provenance de chaque ligne, pour le tooltip des chips du grand total.
        const origin = (i: number, qty: number, once: boolean) => {
          const l = costs.stepLabels?.[i]
          const label = l
            ? lang === 'fr'
              ? l.fr
              : l.en
            : steps > 1
              ? t(info.category === 'armor' ? 'relicTier' : 'relicStep', { n: i + 1 })
              : ''
          return `${info.name}${label ? ' · ' + label : ''} : ${fmt(qty, lang)}${once ? ` (${t('relicFromOnce')})` : ''}`
        }
        const rem = remainingMaterials(costs, missingPerStep, info.jobs, origin)
        for (const mat of [...rem.perWeapon, ...rem.once]) mergeMaterial(acc, mat)
      }
      perPlayer.set(
        member.id,
        [...acc.values()].sort((a, b) => b.qty - a.qty),
      )
    }
    return perPlayer
  }, [ready, ownedSets, db, bySeries, lang, t])

  if (!detailed) {
    return (
      <RelicSummary
        db={db}
        cdb={cdb}
        ready={ready}
        ownedSets={ownedSets}
        byExpansion={byExpansion}
        bySeries={bySeries}
      />
    )
  }

  // Coche avec cascade : ajouter un palier ajoute les précédents manquants,
  // retirer un palier retire aussi les suivants possédés.
  const toggleWithChain = (relic: Relic, chain?: RelicChain) => {
    if (!onToggleRelic) return
    const owned = ownedSets.get(ready[0]?.id ?? 0) ?? new Set<number>()
    if (onSetRelics && chain) {
      if (owned.has(relic.id)) {
        const after = chain.after.filter((id) => owned.has(id))
        if (after.length > 0) return onSetRelics([relic.id, ...after], false)
      } else {
        const before = chain.before.filter((id) => !owned.has(id))
        if (before.length > 0) return onSetRelics([...before, relic.id], true)
      }
    }
    onToggleRelic(relic.id)
  }

  // Clic sur une relique : coche directe en « ajout rapide », fiche sinon.
  const handleRelic = onToggleRelic
    ? (info: RelicSeriesInfo) => (relic: Relic, step: number, chain?: RelicChain) => {
        if (mode === 'quick') toggleWithChain(relic, chain)
        else setPick({ relic, info, step, chain })
      }
    : undefined

  return (
    <div className="view">
      {onToggleRelic && (
        <div className="controls editor-controls">
          <div className="mode-switch">
            <button
              className={`mode-btn ${mode === 'quick' ? 'is-active' : ''}`}
              title={t('modeQuickTitle')}
              onClick={() => {
                setMode('quick')
                setPick(null)
              }}
            >
              <TabIcon k="quick" /> {t('modeQuick')}
            </button>
            <button
              className={`mode-btn ${mode === 'inspect' ? 'is-active' : ''}`}
              title={t('modeInspectTitle')}
              onClick={() => setMode('inspect')}
            >
              <TabIcon k="inspect" /> {t('modeInspect')}
            </button>
          </div>
        </div>
      )}
      {pick && onToggleRelic && (
        <RelicPanel
          pick={pick}
          owned={(ownedSets.get(ready[0]?.id ?? 0) ?? new Set()).has(pick.relic.id)}
          onToggle={() => toggleWithChain(pick.relic, pick.chain)}
          onClose={() => setPick(null)}
        />
      )}
      <section className="relic-series relic-global">
        <header className="relic-series-head">
          <h4 className="relic-series-name">{t('relicGlobal')}</h4>
          <span className="relic-shape">{fmt(totalAll, lang)}</span>
        </header>
        <div className="relic-players">
          {ready.map((m) => {
            const owned = ownedSets.get(m.id)!
            const count = db.relics.reduce((sum, r) => sum + (owned.has(r.id) ? 1 : 0), 0)
            return (
              <div key={m.id} className="relic-player">
                <img src={m.data.avatar} alt="" width={26} height={26} title={m.data.name} onError={onAvatarImgError} />
                <div className="relic-meter">
                  <Meter label={m.data.name.split(' ')[0]} count={count} total={totalAll} />
                </div>
                <span className="relic-remaining">{pct(count, totalAll, lang)}</span>
              </div>
            )
          })}
        </div>
        <details className="relic-totals relic-grand">
          <summary>{t('relicGrandTotal')}</summary>
          {ready.map((member) => {
            const mats = grandTotals.get(member.id) ?? []
            const currencies = mats.filter((mat) => mat.cat === 'currency')
            const items = mats.filter((mat) => !mat.cat || mat.cat === 'item')
            const drops = mats.filter((mat) => mat.cat === 'drop')
            return (
              <div key={member.id} className="relic-grand-player">
                <p className="relic-grand-name">{member.data.name.split(' ')[0]}</p>
                {mats.length === 0 && <p className="relic-total-line"><span className="relic-done">{t('relicDone')}</span></p>}
                {currencies.length > 0 && (
                  <div className="relic-grand-line">
                    <span className="relic-grand-cat">{t('relicMatCurrency')}</span>
                    <span className="relic-grand-items">{currencies.map((mat) => grandChip(mat, lang))}</span>
                  </div>
                )}
                {items.length > 0 && (
                  <div className="relic-grand-line">
                    <span className="relic-grand-cat">{t('relicMatItems')}</span>
                    <span className="relic-grand-items">{items.map((mat) => grandChip(mat, lang))}</span>
                  </div>
                )}
                {drops.length > 0 && (
                  <div className="relic-grand-line">
                    <span className="relic-grand-cat">{t('relicMatDrops')}</span>
                    <span className="relic-grand-items">{drops.map((mat) => grandChip(mat, lang))}</span>
                  </div>
                )}
              </div>
            )
          })}
        </details>
      </section>

      {EXPANSIONS.map(({ num, fr, en }) => {
        const series = byExpansion.get(num)
        if (!series || series.length === 0) return null
        return (
          <details key={num} className="relic-cat" open={num === 7}>
            <summary className="relic-cat-head">
              {lang === 'fr' ? fr : en} <span className="relic-cat-count">({series.length})</span>
            </summary>
            <div className="relic-cat-body">
              {series.map((info) => (
                <SeriesCard
                  key={info.key}
                  info={info}
                  relics={bySeries.get(info.key) ?? []}
                  ready={ready}
                  ownedSets={ownedSets}
                  onRelicClick={handleRelic?.(info)}
                  onSetRelics={onSetRelics}
                />
              ))}
            </div>
          </details>
        )
      })}

      {onToggleRelic && <p className="relic-note">{t('relicEditNote')}</p>}
      <p className="relic-note">{t('relicCostNote')}</p>
    </div>
  )
}
