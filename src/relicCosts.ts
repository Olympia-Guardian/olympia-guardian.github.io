// ---------------------------------------------------------------------------
// Objets nécessaires par étape et par arme/pièce, pour chaque série de
// reliques. Statique : l'API ne fournit pas ces données. Sources : guides
// ffxiv-eorzea.com (sagas d'armes) et wiki consolegameswiki (outils, armures),
// relevé 2026-08. `materials` = par arme ; `once` = 1re arme seulement ;
// `url` = guide de l'étape.
// ---------------------------------------------------------------------------

export interface Material {
  qty: number
  fr: string
  en: string
  /** Clé de fusion : le même objet sous des libellés différents s'agrège. */
  key?: string
  /** Catégorie pour les vues agrégées (défaut : objet). */
  cat?: 'currency' | 'item' | 'drop'
  /** Icône officielle de l'objet (XIVAPI) — affichée dans le total d'en-tête. */
  icon?: string
}

/** Icône d'objet servie par XIVAPI (même format que nos catalogues). */
const XIV = (path: string) =>
  `https://v2.xivapi.com/api/asset?format=webp&path=${encodeURIComponent(path)}`

/** Libellés canoniques des objets fusionnés (affichage des totaux). */
const CANON: Record<string, { fr: string; en: string }> = {
  gil: { fr: 'gils', en: 'gil' },
  'wolf-marks': { fr: 'marques de loup', en: 'Wolf Marks' },
  collectables: { fr: 'collectionnables (tous paliers)', en: 'collectables (all tiers)' },
  eclipticite: { fr: "morceaux d'écliptite", en: 'Eclipticite' },
  'final-fixative': { fr: 'agents fixants ultimes', en: 'Final Fixatives' },
  'hydatos-cr': { fr: 'cristaux Hydatos', en: 'Hydatos Crystals' },
  'eureka-frag': { fr: "fragments d'Eurêka", en: 'Eureka Fragments' },
}

/** Fusionne un matériau dans un accumulateur (clé canonique, quantité ×times). */
export function mergeMaterial(acc: Map<string, Material>, mat: Material, times = 1): void {
  const k = mat.key ?? mat.en
  const existing = acc.get(k)
  if (existing) {
    existing.qty += mat.qty * times
  } else {
    const canon = mat.key ? CANON[mat.key] : undefined
    acc.set(k, { ...mat, ...(canon ?? {}), qty: mat.qty * times })
  }
}

export interface StepCost {
  materials: Material[]
  once?: Material[]
  url?: string
  /** Guide anglophone (le guide par défaut des sagas est en français). */
  urlEn?: string
}

export interface SeriesCosts {
  /** Coûts indexés par étape (1..n, ordre FFXIV Collect). */
  steps?: StepCost[]
  /** Séries à palier unique (armures, GARO…) : même coût pour chaque pièce. */
  perPiece?: Material[]
  /** Guide de la série (utilisé quand l'étape n'a pas le sien). */
  url?: string
  urlEn?: string
  /** Quand les « étapes » sont en réalité des séries venant de contenus
   *  distincts (donjons sans fond) : libellé de provenance par étape. */
  stepLabels?: { fr: string; en: string }[]
}

/** Étapes effectives d'une série (perPiece → répliqué sur chaque étape dérivée). */
export function effectiveSteps(costs: SeriesCosts, steps: number): StepCost[] {
  if (costs.steps) return costs.steps
  return Array.from({ length: steps }, () => ({
    materials: costs.perPiece ?? [],
    url: costs.url,
    urlEn: costs.urlEn,
  }))
}

const m = (
  qty: number,
  fr: string,
  en: string,
  key?: string,
  cat?: Material['cat'],
  icon?: string,
): Material => ({ qty, fr, en, key, cat, icon })

// Guides ffxiv-eorzea.com (sagas d'armes)
const EZ = 'https://www.ffxiv-eorzea.com'
const ZOD1 = `${EZ}/bien-debuter/classes-jobs/armes-reliques/guide-des-armes-reliques-saga-du-zodiaque-etape-1-arme-antique/2024/08/29/`
const ZOD2 = `${EZ}/bien-debuter/classes-jobs/armes-reliques/guide-des-armes-reliques-saga-du-zodiaque-etape-2-arme-zenithatma/2024/09/01/`
const ZOD3 = `${EZ}/bien-debuter/classes-jobs/armes-reliques/guide-des-armes-reliques-saga-du-zodiaque-etape-3-arme-animus/2024/09/01/`
const ZOD4 = `${EZ}/bien-debuter/classes-jobs/armes-reliques/guide-des-armes-reliques-saga-du-zodiaque-etape-4-arme-novus/2024/09/04/`
const ZOD5 = `${EZ}/bien-debuter/classes-jobs/armes-reliques/guide-des-armes-reliques-saga-du-zodiaque-etape-5-arme-nexus/2024/09/03/`
const ZOD6 = `${EZ}/bien-debuter/classes-jobs/armes-reliques/guide-des-armes-reliques-saga-du-zodiaque-etape-6-arme-du-zodiaque/2024/09/11/`
const ZOD7 = `${EZ}/bien-debuter/classes-jobs/armes-reliques/guide-des-armes-reliques-saga-du-zodiaque-etape-finale-arme-du-zodiaque-zeta/2024/09/11/`
const ANI1 = `${EZ}/bien-debuter/classes-jobs/armes-reliques/saga-des-armes-animas-etape-1-animee-eveillee/2025/01/11/`
const ANI2 = `${EZ}/bien-debuter/classes-jobs/armes-reliques/saga-des-armes-animas-etape-2-anima-hyperconductrice/2025/01/10/`
const ANI3 = `${EZ}/bien-debuter/classes-jobs/armes-reliques/saga-des-armes-animas-etape-3-anima-epanouie-anima-vivifiee/2025/01/10/`
const ANI4 = `${EZ}/bien-debuter/classes-jobs/armes-reliques/saga-des-armes-animas-etape-finale-anima-parachevee-anima-lux/2025/01/11/`
const EUR1 = `${EZ}/bien-debuter/classes-jobs/armes-reliques/guide-des-armes-reliques-eureka-anemos/2025/03/11/`
const EUR2 = `${EZ}/guides-instances/guide-des-armes-reliques-eureka-pagos/2025/11/22/`
const EUR3 = `${EZ}/guides-instances/guide-des-armes-reliques-eureka-pyros/2025/11/25/`
const EUR4 = `${EZ}/guides-instances/guide-des-armes-reliques-eureka-hydatos/2026/07/09/`
const MAND = `${EZ}/bien-debuter/classes-jobs/armes-reliques/guide-des-armes-reliques-saga-des-manderville/2024/09/11/`
const PHA1 = `${EZ}/bien-debuter/classes-jobs/armes-reliques/saga-des-armes-fantomes-partie-1-fantome-penumbra/2025/06/01/`
const PHA2 = `${EZ}/bien-debuter/classes-jobs/armes-reliques/saga-des-armes-fantomes-partie-2-umbra/2025/09/06/`
const PHA3 = `${EZ}/bien-debuter/classes-jobs/armes-reliques/saga-des-armes-fantomes-partie-3-obscurum/2026/01/29/`
const PHA4 = `${EZ}/bien-debuter/guides-divers/saga-des-armes-fantomes-partie-finale-occultum/2026/08/05/`

// Wiki consolegameswiki (outils, armures)
const WIKI = 'https://ffxiv.consolegameswiki.com/wiki'

export const RELIC_COSTS: Record<string, SeriesCosts> = {
  // -------------------------------------------------------- 2.x — Zodiaque
  'A Relic Reborn': {
    urlEn: `${WIKI}/Zodiac_Weapons`,
    stepLabels: [{ fr: 'Antique', en: 'Relic' },{ fr: 'Zénith', en: 'Zenith' },{ fr: 'Âtma', en: 'Atma' },{ fr: 'Animus', en: 'Animus' },{ fr: 'Novus', en: 'Novus' },{ fr: 'Nexus', en: 'Nexus' },{ fr: 'Zodiaque', en: 'Zodiac' },{ fr: 'Zodiaque Zêta', en: 'Zodiac Zeta' }],
    steps: [
      {
        url: ZOD1,
        materials: [
          m(1, 'arme 50★ HQ (+2 matérias III du job)', 'HQ i50★ weapon (+2 grade III materia)'),
          m(1, "flamme d'Ifrit", "Ifrit's Flame"),
          m(1, 'rafale de Garuda', "Garuda's Gale"),
          m(1, 'pierre de Titan', "Titan's Stone"),
          m(1, 'huile de trempe de Radz-at-Han (15 poétiques)', 'Radz-at-Han Quenching Oil (15 poetics)', undefined, undefined, XIV('ui/icon/022000/022636_hr1.tex')),
        ],
      },
      { url: ZOD2, materials: [m(3, 'lymphes de Thavnair (20 poétiques pièce)', 'Thavnairian Mist (20 poetics each)', undefined, undefined, XIV('ui/icon/020000/020661_hr1.tex'))] },
      { url: ZOD2, materials: [m(12, 'âtmas (ALÉA 2.x)', 'Atmas (ARR FATEs)', undefined, undefined, XIV('ui/icon/026000/026025_hr1.tex'))] },
      { url: ZOD3, materials: [m(9, 'tomes des chroniques (100 poétiques pièce)', 'Chronicle books (100 poetics each)', undefined, undefined, XIV('ui/icon/026000/026446_hr1.tex'))] },
      {
        url: ZOD4,
        materials: [
          m(1, 'parchemin stellaire', 'Sphere Scroll', undefined, undefined, XIV('ui/icon/025000/025934_hr1.tex')),
          m(3, 'encres enchantées de haute qualité (25 poétiques pièce)', 'Superior Enchanted Ink (25 poetics each)', undefined, undefined, XIV('ui/icon/025000/025923_hr1.tex')),
          m(75, 'alexandrites', 'Alexandrite', undefined, undefined, XIV('ui/icon/021000/021290_hr1.tex')),
        ],
      },
      { url: ZOD5, materials: [m(2000, 'éclats de lumière (farm)', 'Light shards (grind)')] },
      {
        url: ZOD6,
        materials: [
          m(800, 'mémoquartz allagois poétiques', 'Tomestones of Poetics', 'poetics', 'currency', XIV('ui/icon/065000/065023_hr1.tex')),
          m(80000, 'sceaux de grande compagnie', 'Grand Company seals', 'gc-seals', 'currency', XIV('ui/icon/065000/065004_hr1.tex')),
          m(500000, 'gils', 'gil', 'gil', 'currency', XIV('ui/icon/065000/065002_hr1.tex')),
          m(8, 'objets craftés HQ (tarte, étoffe, bague…)', 'HQ crafted items (pie, cloth, ring…)'),
        ],
      },
      { url: ZOD7, materials: [m(12, 'mahatmas (50 poétiques pièce)', 'Mahatmas (50 poetics each)')] },
    ],
  },

  // ---------------------------------------------------------- 3.x — Animas
  'Anima Weapons': {
    urlEn: `${WIKI}/Anima_Weapons`,
    stepLabels: [{ fr: 'Animée', en: 'Animated' },{ fr: 'Éveillée', en: 'Awoken' },{ fr: 'Anima', en: 'Anima' },{ fr: 'Hyperconductrice', en: 'Hyperconductive' },{ fr: 'Épanouie', en: 'Reconditioned' },{ fr: 'Vivifiée', en: 'Sharpened' },{ fr: 'Parachevée', en: 'Complete' },{ fr: 'Lux', en: 'Lux' }],
    steps: [
      {
        url: ANI1,
        materials: [
          m(1, 'cristal astral (ALÉA de Heavensward)', 'Astral Crystal (HW FATEs)'),
          m(1, 'cristal ombral (ALÉA de Heavensward)', 'Umbral Crystal (HW FATEs)'),
        ],
      },
      { url: ANI1, materials: [m(10, "donjons à compléter (pas d'objet)", 'dungeons to clear (no items)', undefined, 'drop')] },
      {
        url: ANI2,
        materials: [
          m(1, 'caoutchouc enchanté', 'Enchanted Rubber'),
          m(1, "fiole d'agent solidifiant allagois supérieur", 'Fast-drying Carboncoat'),
          m(1, 'eaux divines', 'Divine Water catalyst'),
          m(1, "bouteille d'eau divine", 'Divine Water'),
        ],
      },
      { url: ANI2, materials: [m(5, "pots d'huile isolante (350 poétiques pièce)", 'Aether Oil (350 poetics each)')] },
      {
        url: ANI3,
        materials: [
          m(50, 'roches ombrales dures (75 poétiques pièce)', 'Umbrite (75 poetics each)'),
          m(50, 'sables de cristal', 'Crystal Sand'),
        ],
      },
      { url: ANI3, materials: [m(50, 'agrégats résonnants (40 poétiques pièce)', 'Singing Clusters (40 poetics each)')] },
      { url: ANI4, materials: [m(15, 'agrégats obscurs (100 poétiques pièce)', 'Pneumite (100 poetics each)')] },
      { url: ANI4, materials: [m(1, 'encre enchantée ancienne (500 poétiques)', 'Archaic Enchanted Ink (500 poetics)')] },
    ],
  },

  // ---------------------------------------------------------- 4.x — Eurêka
  'Eureka Weapons': {
    urlEn: `${WIKI}/Eureka_Weapons`,
    stepLabels: [{ fr: 'Antique', en: 'Antiquated' },{ fr: '+1', en: '+1' },{ fr: '+2', en: '+2' },{ fr: 'Anemos', en: 'Anemos' },{ fr: 'Pagos', en: 'Pagos' },{ fr: 'Pagos +1', en: 'Pagos +1' },{ fr: 'Élémentaire', en: 'Elemental' },{ fr: 'Élémentaire +1', en: 'Elemental +1' },{ fr: 'Élémentaire +2', en: 'Elemental +2' },{ fr: 'Pyros', en: 'Pyros' },{ fr: 'Hydatos', en: 'Hydatos' },{ fr: 'Hydatos +1', en: 'Hydatos +1' },{ fr: 'Eurêka (base)', en: 'Base' },{ fr: 'Eurêka', en: 'Eureka' },{ fr: 'Physeos', en: 'Physeos' }],
    steps: [
      { url: EUR1, materials: [m(12, 'cristaux instables', 'Unstable Crystals'), m(4, 'cristaux Anemos', 'Anemos Crystals')] },
      { url: EUR1, materials: [m(12, 'cristaux instables', 'Unstable Crystals'), m(8, 'cristaux Anemos', 'Anemos Crystals')] },
      { url: EUR1, materials: [m(16, 'cristaux instables', 'Unstable Crystals'), m(12, 'cristaux Anemos', 'Anemos Crystals')] },
      {
        url: EUR1,
        materials: [
          m(24, 'cristaux instables', 'Unstable Crystals'),
          m(16, 'cristaux Anemos', 'Anemos Crystals'),
          m(4, 'plumes de Pazuzu', 'Pazuzu Feathers'),
        ],
      },
      { url: EUR2, materials: [m(5, 'cristaux instables', 'Unstable Crystals')] },
      { url: EUR2, materials: [m(10, 'cristaux instables', 'Unstable Crystals'), m(500, 'cristaux Pagos', 'Pagos Crystals')] },
      { url: EUR2, materials: [m(16, 'cristaux instables', 'Unstable Crystals'), m(5, 'glaces de Louhi', "Louhi's Ice")] },
      { url: EUR3, materials: [m(150, 'cristaux Pyros', 'Pyros Crystals')] },
      { url: EUR3, materials: [m(200, 'cristaux Pyros', 'Pyros Crystals')] },
      { url: EUR3, materials: [m(300, 'cristaux Pyros', 'Pyros Crystals'), m(5, 'braises de Penthésilée', "Penthesilea's Flames")] },
      { url: EUR4, materials: [m(50, 'cristaux Hydatos', 'Hydatos Crystals', 'hydatos-cr')] },
      { url: EUR4, materials: [m(100, 'cristaux Hydatos', 'Hydatos Crystals', 'hydatos-cr')] },
      { url: EUR4, materials: [m(100, 'cristaux Hydatos', 'Hydatos Crystals', 'hydatos-cr')] },
      {
        url: EUR4,
        materials: [
          m(100, 'cristaux Hydatos', 'Hydatos Crystals', 'hydatos-cr'),
          m(5, 'écailles de dragon de cristal', 'Crystalline Scales'),
        ],
      },
      { url: EUR4, materials: [m(100, "fragments d'Eurêka (Arsenal de Baldesion)", 'Eureka Fragments (Baldesion Arsenal)', 'eureka-frag')] },
    ],
  },

  // ------------------------------------------------------ 5.x — Résistance
  'Resistance Weapons': {
    urlEn: `${WIKI}/Resistance_Weapons`,
    stepLabels: [{ fr: 'Résistance', en: 'Resistance' },{ fr: 'Résistance améliorée', en: 'Augmented Resistance' },{ fr: 'In memoriam', en: 'Recollection' },{ fr: 'Verdict des Juges', en: "Law's Order" },{ fr: 'Verdict des Juges amélioré', en: "Augmented Law's Order" },{ fr: 'Euphorie de Gunnhildr', en: "Blade's" }],
    url: `${WIKI}/Resistance_Weapons`,
    steps: [
      { url: `${WIKI}/Resistance_Weapons`, materials: [m(4, "poudres d'écaille de Thavnair (250 poétiques pièce)", 'Thavnairian Scalepowder (250 poetics each)')] },
      {
        url: `${WIKI}/Resistance_Weapons`,
        materials: [
          m(20, 'amas mémoriels de tourment', 'Tortured Memories'),
          m(20, 'amas mémoriels de peine', 'Sorrowful Memories'),
          m(20, 'amas mémoriels de terreur', 'Harrowing Memories'),
        ],
      },
      { url: `${WIKI}/Resistance_Weapons`, materials: [m(6, 'amas mémoriels de sauvagerie', 'Bitter Memories')] },
      { url: `${WIKI}/Resistance_Weapons`, materials: [m(15, 'amas mémoriels de répugnance', 'Loathsome Memories')] },
      { url: `${WIKI}/Resistance_Weapons`, materials: [m(15, 'artefacts anciens', 'Timeworn Artifacts')] },
      { url: `${WIKI}/Resistance_Weapons`, materials: [m(15, 'cristaux du volcan émotionnel', 'Raw Emotions')] },
    ],
  },

  // ----------------------------------------------------- 6.x — Manderville
  'Manderville Weapons': {
    urlEn: `${WIKI}/Manderville_Weapons`,
    stepLabels: [{ fr: 'Manderville', en: 'Manderville' },{ fr: 'Éblouissante', en: 'Amazing' },{ fr: 'Majestueuse', en: 'Majestic' },{ fr: 'Manderveilleuse', en: 'Mandervillous' }],
    steps: [
      { url: MAND, materials: [m(3, 'météorites rarissimes (500 poétiques pièce)', 'Manderium Meteorites (500 poetics each)')] },
      { url: MAND, materials: [m(3, 'chondrites rarissimes (500 poétiques pièce)', 'Complementary Chondrites (500 poetics each)')] },
      { url: MAND, materials: [m(3, 'achondrites rarissimes (500 poétiques pièce)', 'Amplifying Achondrites (500 poetics each)')] },
      { url: MAND, materials: [m(3, 'cristallites cosmiques (500 poétiques pièce)', 'Cosmic Crystallites (500 poetics each)')] },
    ],
  },

  // -------------------------------------------------- 7.x — Armes fantômes
  'Phantom Weapons': {
    urlEn: `${WIKI}/Phantom_Weapons`,
    stepLabels: [{ fr: 'Penumbra', en: 'Penumbra' },{ fr: 'Umbra', en: 'Umbra' },{ fr: 'Obscurum', en: 'Obscurum' },{ fr: 'Eclipticum', en: 'Eclipticum' },{ fr: 'Occultum', en: 'Occultum' }],
    steps: [
      {
        url: PHA1,
        materials: [m(1500, 'mémoquartz allagois héliologiques (3 lunulites)', 'Tomestones of Heliometry (3 Lunulites)', 'heliometry', 'currency')],
        once: [m(18, 'demi-âtmas (ALÉA/affrontements du Croissant occulte)', 'Demiatmas (Occult Crescent FATEs/CEs)')],
      },
      {
        url: PHA2,
        materials: [m(3, 'ombralites (500 héliologiques pièce)', 'Umbralites (500 Heliometry each)')],
        once: [
          m(1, 'colle de rroneek (300 000 gils)', 'Rroneek Glue (300,000 gil)'),
          m(1, "fer météorique d'Ut'ohmu (600 gemmes bicolores)", "Ut'ohmu Siderite (600 bicolor gems)"),
          m(3, 'matières sombres artificielles α/β/γ', 'Synthetic Dark Matter α/β/γ'),
        ],
      },
      {
        url: PHA3,
        materials: [m(3, "morceaux d'alunite (500 mathématiques pièce)", 'Alunite (500 Mathematics each)')],
        once: [
          m(1, 'argile ombrale (500 000 gils)', 'Umbral Clay (500,000 gil)'),
          m(3, 'composants additifs aspectés (craft)', 'Aspected additive components (crafted)'),
          m(1200, 'pâtes de cristal', 'Crystal Paste'),
        ],
      },
      {
        url: PHA4,
        materials: [m(3, "morceaux d'écliptite", 'Eclipticite', 'eclipticite')],
        once: [
          m(1, 'pierre à aiguiser opaline (500 000 gils)', 'Opaline Whetstone (500,000 gil)'),
          m(1, "lingot d'alliage atypique", 'Atypical Alloy Ingot'),
          m(1, 'ficelle inusable', 'Everlasting Twine'),
          m(1, 'huile de camélia', 'Camellia Oil'),
          m(100, 'dissipateurs spirituels α', 'Phantom Dispellers α'),
          m(100, 'dissipateurs spirituels β', 'Phantom Dispellers β'),
          m(100, 'dissipateurs spirituels γ', 'Phantom Dispellers γ'),
        ],
      },
      { url: PHA4, materials: [m(1, "morceau d'écliptite (cristal de savoir via quête)", 'Eclipticite (Knowledge Crystal via quest)', 'eclipticite')] },
    ],
  },

  // ------------------------------------------------------ Donjons sans fond
  // Ici les « étapes » ne sont pas des paliers d'amélioration : chaque groupe
  // de 21 armes vient d'un donjon sans fond précis.
  'Deep Dungeon Weapons': {
    url: `${WIKI}/Deep_Dungeon`,
    stepLabels: [
      { fr: 'Armes padjales — le Palais des morts', en: 'Padjali — Palace of the Dead' },
      { fr: 'Armes kinna — le Palais des morts (sous-sol 100)', en: 'Kinna — Palace of the Dead (floor 100)' },
      { fr: 'Armes empyréennes — le Pilier des Cieux', en: 'Empyrean — Heaven-on-High' },
      { fr: 'Armes Orthos — Eurêka Orthos', en: 'Orthos — Eureka Orthos' },
      { fr: 'Armes Enaretos — Eurêka Orthos (améliorées)', en: 'Enaretos — Eureka Orthos (upgraded)' },
      { fr: 'Armes de la Lumière originelle — le Sanctuaire des pèlerins', en: "First Light — Pilgrim's Traverse" },
      { fr: 'Armes sacramentelles — le Sanctuaire des pèlerins (améliorées)', en: "Sacramental — Pilgrim's Traverse (upgraded)" },
    ],
  },

  // --------------------------------- Armes de rêve/magnifiées (donjons annexes)
  // Rien à voir avec le Croissant occulte : ces deux séries viennent des donjons
  // à embranchements et de leurs versions annexes (Aloalo, Contes du Camelot).
  'Figmental Weapons': {
    url: `${WIKI}/Figmental_Weapons`,
    perPiece: [
      m(
        1,
        "coffret d'arme de rêve (Cénote Ja Ja Gural ou Le coffre d'Oneiron)",
        'Figmental Weapon Coffer (Cenote Ja Ja Gural or Vault Oneiron)',
        undefined,
        'drop',
      ),
    ],
  },
  'Exquisite Weapons': {
    url: `${WIKI}/Exquisite_Weapons`,
    perPiece: [
      m(1, 'arme Credendum améliorée', 'Augmented Credendum Weapon'),
      m(
        1,
        "agent renforçant du ciel ouvert (L'île d'Aloalo annexe sadique, ou Contes du Camelot)",
        "Elevated Ester (Another Aloalo Island Savage, or The Merchant's Tale)",
        'elevated-ester',
      ),
    ],
  },

  // ----------------------------------------------------------------- Outils
  'Resplendent Tools': {
    url: `${WIKI}/Resplendent_Tools`,
    perPiece: [m(1, "lot de composants resplendissants (craft/récolte)", 'resplendent component set (craft/gather)', undefined, 'drop')],
  },
  'Lucis Tools': {
    url: `${WIKI}/Lucis_Tools`,
    steps: [
      { url: `${WIKI}/Lucis_Tools`, materials: [m(1, "lot d'objets de quête spécifiques au métier", 'job-specific quest item set', undefined, 'drop')] },
      { url: `${WIKI}/Lucis_Tools`, materials: [m(1, "lot d'objets spécifiques au métier (craft/récolte)", 'job-specific item set (craft/gather)', undefined, 'drop')] },
      { url: `${WIKI}/Lucis_Tools`, materials: [m(1, "lot d'objets HQ spécifiques au métier", 'job-specific HQ item set', undefined, 'drop')] },
    ],
  },
  'Skysteel Tools': {
    url: `${WIKI}/Skysteel_Tools`,
    steps: [
      { url: `${WIKI}/Skysteel_Tools`, materials: [m(80000, 'gils (ou coffre de quête)', 'gil (or quest coffer)', 'gil', 'currency')] },
      { url: `${WIKI}/Skysteel_Tools`, materials: [m(20, 'collectionnables HQ du métier', 'HQ collectables', 'collectables')] },
      { url: `${WIKI}/Skysteel_Tools`, materials: [m(30, 'collectionnables HQ du métier', 'HQ collectables', 'collectables')] },
      { url: `${WIKI}/Skysteel_Tools`, materials: [m(18, 'collectionnables (collecte maximale)', 'max-collectability collectables', 'collectables')] },
      { url: `${WIKI}/Skysteel_Tools`, materials: [m(21, 'collectionnables (collecte maximale)', 'max-collectability collectables', 'collectables')] },
      { url: `${WIKI}/Skysteel_Tools`, materials: [m(1, 'lot de collectionnables du Diadème (recettes expertes)', 'Diadem collectables (expert recipes)', undefined, 'drop')] },
    ],
  },
  'Splendorous Tools': {
    url: `${WIKI}/Splendorous_Tools`,
    steps: [
      { url: `${WIKI}/Splendorous_Tools`, materials: [m(750, 'pions violets (ou coffre de quête)', 'Purple Scrips (or quest coffer)', 'purple-scrips', 'currency')] },
      { url: `${WIKI}/Splendorous_Tools`, materials: [m(20, 'collectionnables (60 composants)', 'collectables (60 components)', 'collectables')] },
      { url: `${WIKI}/Splendorous_Tools`, materials: [m(30, 'collectionnables (90 composants)', 'collectables (90 components)', 'collectables')] },
      { url: `${WIKI}/Splendorous_Tools`, materials: [m(30, 'collectionnables (90 composants)', 'collectables (90 components)', 'collectables')] },
      { url: `${WIKI}/Splendorous_Tools`, materials: [m(30, 'collectionnables (90 composants)', 'collectables (90 components)', 'collectables')] },
      { url: `${WIKI}/Splendorous_Tools`, materials: [m(30, 'collectionnables (90 composants)', 'collectables (90 components)', 'collectables')] },
      { url: `${WIKI}/Splendorous_Tools`, materials: [m(30, 'collectionnables (90 composants)', 'collectables (90 components)', 'collectables')] },
    ],
  },
  'Cosmic Tools': {
    url: `${WIKI}/Cosmic_Tools`,
    steps: [
      { url: `${WIKI}/Cosmic_Tools`, materials: [m(1, 'palier de données de recherche (missions stellaires)', 'research data tier (cosmic missions)', undefined, 'drop')] },
      { url: `${WIKI}/Cosmic_Tools`, materials: [m(1, 'palier de données de recherche (missions stellaires)', 'research data tier (cosmic missions)', undefined, 'drop')] },
      { url: `${WIKI}/Cosmic_Tools`, materials: [m(1, 'palier de données de recherche (missions stellaires)', 'research data tier (cosmic missions)', undefined, 'drop')] },
      { url: `${WIKI}/Cosmic_Tools`, materials: [m(1, 'palier de données de recherche (missions stellaires)', 'research data tier (cosmic missions)', undefined, 'drop')] },
    ],
  },

  // ------------------------------------------------------------------ GARO
  'GARO Armor': {
    url: `${WIKI}/GARO`,
    perPiece: [m(2800, 'marques de loup (moyenne — 2 000 à 4 000 selon la pièce)', 'Wolf Marks (avg — 2,000–4,000 per piece)', 'wolf-marks', 'currency')],
  },
  'GARO Weapons': {
    url: `${WIKI}/GARO`,
    perPiece: [m(4000, 'marques de loup', 'Wolf Marks', 'wolf-marks', 'currency')],
  },

  // -------------------------------------------------------- Armures Eurêka
  'Eureka Job Armor': {
    url: `${WIKI}/Anemos_Gear`,
    steps: [
      { materials: [m(50, 'cristaux instables', 'Protean Crystals')] },
      { materials: [m(150, 'cristaux instables', 'Protean Crystals')] },
      { materials: [m(400, 'cristaux instables', 'Protean Crystals')] },
    ],
  },
  'Eureka Anemos Armor': { url: `${WIKI}/Anemos_Gear`, perPiece: [m(150, 'cristaux Anemos', 'Anemos Crystals')] },
  'Elemental Armor': {
    url: `${WIKI}/Elemental_Armor`,
    steps: [
      { materials: [m(40, 'cristaux Pyros', 'Pyros Crystals')] },
      {
        materials: [
          m(38, 'cristaux Hydatos (moyenne — 30 à 50 selon la pièce)', 'Hydatos Crystals (avg — 30–50 per piece)', 'hydatos-cr'),
        ],
      },
      {
        materials: [
          m(27, "fragments d'Eurêka (moyenne — 21 à 35 selon la pièce)", 'Eureka Fragments (avg — 21–35 per piece)', 'eureka-frag'),
        ],
      },
    ],
  },

  // --------------------------------------------------------- Armures Bozja
  'Idealized Armor': {
    url: `${WIKI}/Idealized_Artifact_Armor`,
    perPiece: [
      m(
        4,
        'totems du grand général des armées impériales (Memoria Misera Extrême — 19 pour un set de 5 pièces)',
        'High Legatus Idols (Memoria Misera Extreme — 19 for a 5-piece set)',
        undefined,
        'drop',
      ),
    ],
  },
  'Bozjan Armor': {
    url: `${WIKI}/Augmented_Bozjan_Armor`,
    steps: [
      {
        materials: [
          m(1, 'drop du Front sud de Bozja (engagements/coffres)', 'Bozjan Southern Front drop (engagements/coffers)', undefined, 'drop'),
        ],
      },
      {
        materials: [
          m(1, 'matériaux ultralégers bozjiens (500–999 pièces bozjiennes)', "Bozjan Runner's Secrets (500–999 Bozjan Coins)"),
        ],
      },
    ],
  },
  "Law's Order": {
    url: `${WIKI}/Augmented_Law's_Order_Armor`,
    steps: [
      { materials: [m(1, 'drop de Delubrum Reginae', 'Delubrum Reginae drop', undefined, 'drop')] },
      {
        materials: [
          m(1, 'matériaux ultralégers du verdict des Juges (Delubrum sauvage, ou 10 plaques)', "Orderly Runner's Secrets (DR Savage, or 10 platings)"),
          m(1, 'pièce bozjienne augmentée correspondante', 'matching Augmented Bozjan piece'),
        ],
      },
    ],
  },
  "Blade's Armor": {
    url: `${WIKI}/Blade's_Armor`,
    perPiece: [m(7, 'pièces bozjiennes en platine (moyenne — 6 à 9 selon la pièce)', 'Bozjan Platinum Coins (avg — 6–9 per piece)', 'boz-platinum', 'currency')],
  },

  // --------------------------------------------------- Armures du Croissant
  // Les paliers « +1 / +2 » et « améliorée » sont fusionnés dans la série de
  // base (scripts/fetch-data.mjs) : ils deviennent des étapes, comme les armes.
  "Arcanaut's Armor": {
    url: `${WIKI}/Phantom_Armor`,
    steps: [
      {
        materials: [
          m(4000, "pièces d'argent des douze cités", 'Enlightenment Silver Pieces', 'twelve-silver', 'currency'),
        ],
      },
      {
        materials: [
          m(3, 'fils magiques argentés (1 200 argent pièce)', 'Aetherspun Silver (1,200 silver each)'),
          m(3, 'agents fixants (1 600 or pièce)', 'Aetherial Fixative (1,600 gold each)'),
        ],
      },
      {
        materials: [
          m(3, 'fils magiques dorés', 'Aetherspun Gold'),
          m(6, 'agents fixants X (60 sanguinites pièce)', 'X-Fixative (60 Sanguinite each)'),
        ],
      },
    ],
  },
  'Phantom Vision': {
    url: `${WIKI}/Phantom_Armor`,
    steps: [
      { materials: [m(4000, 'pièces de nickel des douze cités (North Horn)', 'Enlightenment Silver Obols (North Horn)', 'obols', 'currency')] },
      {
        materials: [
          m(3, 'agents fixants ultimes (ou échange Arcanaut +1)', "Final Fixatives (or Arcanaut's +1 trade-in)", 'final-fixative'),
        ],
      },
      {
        materials: [
          m(4, 'agents fixants ultimes (ou échange Arcanaut +2)', "Final Fixatives (or Arcanaut's +2 trade-in)", 'final-fixative'),
        ],
      },
      {
        materials: [m(8, 'agents fixants ultimes (Tour fourchue)', 'Final Fixatives (Forked Tower)', 'final-fixative')],
      },
    ],
  },
}

/** Agrège les matériaux restants : par étape, armes manquantes × coût de l'étape,
 *  plus les objets « première arme » si aucune arme de l'étape n'est faite. */
export function remainingMaterials(
  costs: SeriesCosts,
  missingPerStep: number[],
  jobs: number,
): { perWeapon: Material[]; once: Material[] } {
  const acc = new Map<string, Material>()
  const onceAcc = new Map<string, Material>()
  const steps = effectiveSteps(costs, missingPerStep.length)
  for (let i = 0; i < missingPerStep.length; i++) {
    const step = steps[i]
    if (!step || missingPerStep[i] === 0) continue
    for (const mat of step.materials) mergeMaterial(acc, mat, missingPerStep[i])
    if (step.once && missingPerStep[i] === jobs) {
      for (const mat of step.once) mergeMaterial(onceAcc, mat)
    }
  }
  return {
    perWeapon: [...acc.values()].filter((mat) => mat.qty > 0),
    once: [...onceAcc.values()].filter((mat) => mat.qty > 0),
  }
}
