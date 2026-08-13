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
  /** Provenances (« Série · Étape : quantité »), cumulées à la fusion. */
  from?: string[]
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
    if (mat.from?.length) existing.from = [...(existing.from ?? []), ...mat.from]
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
          m(1, 'cristal astral (ALÉA de Heavensward)', 'Astral Nodule (HW FATEs)', undefined, undefined, XIV('ui/icon/026000/026052_hr1.tex')),
          m(1, 'cristal ombral (ALÉA de Heavensward)', 'Umbral Nodule (HW FATEs)', undefined, undefined, XIV('ui/icon/026000/026053_hr1.tex')),
        ],
      },
      { url: ANI1, materials: [m(10, "donjons à compléter (pas d'objet)", 'dungeons to clear (no items)', undefined, 'drop')] },
      {
        url: ANI2,
        materials: [
          m(1, 'caoutchouc enchanté (10 os non identifiables)', 'Enchanted Rubber (10 Unidentifiable Bone)', undefined, undefined, XIV('ui/icon/022000/022658_hr1.tex')),
          m(1, 'agent solidifiant allagois supérieur (10 carapaces non identifiables)', 'Fast-drying Carboncoat (10 Unidentifiable Shell)', undefined, undefined, XIV('ui/icon/027000/027615_hr1.tex')),
          m(1, 'eau divine (10 minerais non identifiables)', 'Divine Water (10 Unidentifiable Ore)', undefined, undefined, XIV('ui/icon/022000/022659_hr1.tex')),
          m(1, 'sable de halonite (10 graines non identifiables)', 'Furite Sand (10 Unidentifiable Seeds)', undefined, undefined, XIV('ui/icon/021000/021204_hr1.tex')),
        ],
      },
      { url: ANI2, materials: [m(5, 'huiles isolantes (350 poétiques pièce)', 'Aether Oil (350 poetics each)', undefined, undefined, XIV('ui/icon/027000/027617_hr1.tex'))] },
      {
        url: ANI3,
        materials: [
          m(50, 'roches ombrales dures (75 poétiques pièce)', 'Umbrite (75 poetics each)', undefined, undefined, XIV('ui/icon/021000/021228_hr1.tex')),
          m(50, 'sables de cristal', 'Crystal Sand', undefined, undefined, XIV('ui/icon/021000/021229_hr1.tex')),
        ],
      },
      { url: ANI3, materials: [m(50, 'agrégats résonnants (40 poétiques pièce)', 'Singing Clusters (40 poetics each)', undefined, undefined, XIV('ui/icon/020000/020027_hr1.tex'))] },
      { url: ANI4, materials: [m(15, 'agrégats obscurs (100 poétiques pièce)', 'Pneumite (100 poetics each)', undefined, undefined, XIV('ui/icon/021000/021230_hr1.tex'))] },
      { url: ANI4, materials: [m(1, 'encre enchantée ancienne (500 poétiques)', 'Archaic Enchanted Ink (500 poetics)', undefined, undefined, XIV('ui/icon/025000/025920_hr1.tex'))] },
    ],
  },

  // ---------------------------------------------------------- 4.x — Eurêka
  'Eureka Weapons': {
    urlEn: `${WIKI}/Eureka_Weapons`,
    stepLabels: [{ fr: 'Antique', en: 'Antiquated' },{ fr: '+1', en: '+1' },{ fr: '+2', en: '+2' },{ fr: 'Anemos', en: 'Anemos' },{ fr: 'Pagos', en: 'Pagos' },{ fr: 'Pagos +1', en: 'Pagos +1' },{ fr: 'Élémentaire', en: 'Elemental' },{ fr: 'Élémentaire +1', en: 'Elemental +1' },{ fr: 'Élémentaire +2', en: 'Elemental +2' },{ fr: 'Pyros', en: 'Pyros' },{ fr: 'Hydatos', en: 'Hydatos' },{ fr: 'Hydatos +1', en: 'Hydatos +1' },{ fr: 'Eurêka (base)', en: 'Base' },{ fr: 'Eurêka', en: 'Eureka' },{ fr: 'Physeos', en: 'Physeos' }],
    steps: [
      { url: EUR1, materials: [m(12, 'cristaux instables', 'Protean Crystals', undefined, undefined, XIV('ui/icon/020000/020029_hr1.tex')), m(4, 'cristaux Anemos', 'Anemos Crystals', undefined, undefined, XIV('ui/icon/020000/020028_hr1.tex'))] },
      { url: EUR1, materials: [m(12, 'cristaux instables', 'Protean Crystals', undefined, undefined, XIV('ui/icon/020000/020029_hr1.tex')), m(8, 'cristaux Anemos', 'Anemos Crystals', undefined, undefined, XIV('ui/icon/020000/020028_hr1.tex'))] },
      { url: EUR1, materials: [m(16, 'cristaux instables', 'Protean Crystals', undefined, undefined, XIV('ui/icon/020000/020029_hr1.tex')), m(12, 'cristaux Anemos', 'Anemos Crystals', undefined, undefined, XIV('ui/icon/020000/020028_hr1.tex'))] },
      {
        url: EUR1,
        materials: [
          m(24, 'cristaux instables', 'Protean Crystals', undefined, undefined, XIV('ui/icon/020000/020029_hr1.tex')),
          m(16, 'cristaux Anemos', 'Anemos Crystals', undefined, undefined, XIV('ui/icon/020000/020028_hr1.tex')),
          m(4, 'plumes de Pazuzu', "Pazuzu's Feathers", undefined, undefined, XIV('ui/icon/021000/021910_hr1.tex')),
        ],
      },
      { url: EUR2, materials: [m(5, 'cristaux instables de glace', 'Frosted Protean Crystals', undefined, undefined, XIV('ui/icon/020000/020031_hr1.tex'))] },
      { url: EUR2, materials: [m(10, 'cristaux instables de glace', 'Frosted Protean Crystals', undefined, undefined, XIV('ui/icon/020000/020031_hr1.tex')), m(500, 'cristaux Pagos', 'Pagos Crystals', undefined, undefined, XIV('ui/icon/020000/020030_hr1.tex'))] },
      { url: EUR2, materials: [m(16, 'cristaux instables de glace', 'Frosted Protean Crystals', undefined, undefined, XIV('ui/icon/020000/020031_hr1.tex')), m(5, 'glaces de Louhi', "Louhi's Ice", undefined, undefined, XIV('ui/icon/021000/021266_hr1.tex'))] },
      { url: EUR3, materials: [m(150, 'cristaux Pyros', 'Pyros Crystals', undefined, undefined, XIV('ui/icon/020000/020032_hr1.tex'))] },
      { url: EUR3, materials: [m(200, 'cristaux Pyros', 'Pyros Crystals', undefined, undefined, XIV('ui/icon/020000/020032_hr1.tex'))] },
      { url: EUR3, materials: [m(300, 'cristaux Pyros', 'Pyros Crystals', undefined, undefined, XIV('ui/icon/020000/020032_hr1.tex')), m(5, 'braises de Penthésilée', "Penthesilea's Flames", undefined, undefined, XIV('ui/icon/025000/025911_hr1.tex'))] },
      { url: EUR4, materials: [m(50, 'cristaux Hydatos', 'Hydatos Crystals', 'hydatos-cr', undefined, XIV('ui/icon/020000/020037_hr1.tex'))] },
      { url: EUR4, materials: [m(100, 'cristaux Hydatos', 'Hydatos Crystals', 'hydatos-cr', undefined, XIV('ui/icon/020000/020037_hr1.tex'))] },
      { url: EUR4, materials: [m(100, 'cristaux Hydatos', 'Hydatos Crystals', 'hydatos-cr', undefined, XIV('ui/icon/020000/020037_hr1.tex'))] },
      {
        url: EUR4,
        materials: [
          m(100, 'cristaux Hydatos', 'Hydatos Crystals', 'hydatos-cr', undefined, XIV('ui/icon/020000/020037_hr1.tex')),
          m(5, 'écailles de dragon de cristal', 'Crystalline Scales', undefined, undefined, XIV('ui/icon/022000/022265_hr1.tex')),
        ],
      },
      { url: EUR4, materials: [m(100, "fragments d'Eurêka (Arsenal de Baldesion)", 'Eureka Fragments (Baldesion Arsenal)', 'eureka-frag', undefined, XIV('ui/icon/026000/026544_hr1.tex'))] },
    ],
  },

  // ------------------------------------------------------ 5.x — Résistance
  'Resistance Weapons': {
    urlEn: `${WIKI}/Resistance_Weapons`,
    stepLabels: [{ fr: 'Résistance', en: 'Resistance' },{ fr: 'Résistance améliorée', en: 'Augmented Resistance' },{ fr: 'In memoriam', en: 'Recollection' },{ fr: 'Verdict des Juges', en: "Law's Order" },{ fr: 'Verdict des Juges amélioré', en: "Augmented Law's Order" },{ fr: 'Euphorie de Gunnhildr', en: "Blade's" }],
    url: `${WIKI}/Resistance_Weapons`,
    steps: [
      { url: `${WIKI}/Resistance_Weapons`, materials: [m(4, "poudres d'écaille de Thavnair (250 poétiques pièce)", 'Thavnairian Scalepowder (250 poetics each)', undefined, undefined, XIV('ui/icon/022000/022650_hr1.tex'))] },
      {
        url: `${WIKI}/Resistance_Weapons`,
        materials: [
          m(20, 'amas mémoriels de tourment', 'Tortured Memories', undefined, undefined, XIV('ui/icon/020000/020038_hr1.tex')),
          m(20, 'amas mémoriels de peine', 'Sorrowful Memories', undefined, undefined, XIV('ui/icon/020000/020039_hr1.tex')),
          m(20, 'amas mémoriels de terreur', 'Harrowing Memories', undefined, undefined, XIV('ui/icon/020000/020040_hr1.tex')),
        ],
      },
      { url: `${WIKI}/Resistance_Weapons`, materials: [m(6, 'amas mémoriels de sauvagerie', 'Bitter Memories', undefined, undefined, XIV('ui/icon/020000/020041_hr1.tex'))] },
      { url: `${WIKI}/Resistance_Weapons`, materials: [m(15, 'amas mémoriels de répugnance', 'Loathsome Memories', undefined, undefined, XIV('ui/icon/020000/020020_hr1.tex'))] },
      { url: `${WIKI}/Resistance_Weapons`, materials: [m(15, 'artefacts anciens', 'Timeworn Artifacts', undefined, undefined, XIV('ui/icon/026000/026597_hr1.tex'))] },
      { url: `${WIKI}/Resistance_Weapons`, materials: [m(15, 'cristaux du volcan émotionnel', 'Raw Emotions', undefined, undefined, XIV('ui/icon/020000/020027_hr1.tex'))] },
    ],
  },

  // ----------------------------------------------------- 6.x — Manderville
  'Manderville Weapons': {
    urlEn: `${WIKI}/Manderville_Weapons`,
    stepLabels: [{ fr: 'Manderville', en: 'Manderville' },{ fr: 'Éblouissante', en: 'Amazing' },{ fr: 'Majestueuse', en: 'Majestic' },{ fr: 'Manderveilleuse', en: 'Mandervillous' }],
    // Chaque palier se débloque par une quête à Radz-at-Han (une seule fois) ;
    // les armes suivantes s'échangent directement contre les objets.
    steps: [
      {
        url: MAND,
        materials: [m(3, 'météorites rarissimes (500 poétiques pièce)', 'Manderium Meteorites (500 poetics each)', undefined, undefined, XIV('ui/icon/021000/021225_hr1.tex'))],
        once: [m(1, "quête « Le secret ancestral des Manderville » (Radz-at-Han — niv. 90, épopée Endwalker et saga Hildibrand jusqu'à « Une armée de gentilshommes » terminées, puis apporter les 3 météorites rarissimes)", 'quest "Make It a Manderville" (Radz-at-Han — lv. 90, Endwalker MSQ and Hildibrand questline through "The Imperfect Gentleman", then hand in the 3 Manderium Meteorites)', undefined, 'drop', XIV('ui/icon/071000/071141_hr1.tex'))],
      },
      {
        url: MAND,
        materials: [m(3, 'chondrites rarissimes (500 poétiques pièce)', 'Complementary Chondrites (500 poetics each)', undefined, undefined, XIV('ui/icon/021000/021243_hr1.tex'))],
        once: [m(1, "quête « Les armes éblouissantes des Manderville » (Radz-at-Han — quête Hildibrand « Tel gentilhomme, tel gentilhomme » terminée, puis apporter les 3 chondrites rarissimes)", 'quest "The Next Mander-level" (Radz-at-Han — Hildibrand quest "Generational Bonding" complete, then hand in the 3 Complementary Chondrites)', undefined, 'drop', XIV('ui/icon/071000/071141_hr1.tex'))],
      },
      {
        url: MAND,
        materials: [m(3, 'achondrites rarissimes (500 poétiques pièce)', 'Amplifying Achondrites (500 poetics each)', undefined, undefined, XIV('ui/icon/021000/021210_hr1.tex'))],
        once: [m(1, "quête « Les armes majestueuses des Manderville » (Radz-at-Han — quête Hildibrand « Un visiteur, venu d'ailleurs » terminée, puis apporter les 3 achondrites rarissimes)", 'quest "In Need of Adjustment" (Radz-at-Han — Hildibrand quest "Not from Around Here" complete, then hand in the 3 Amplifying Achondrites)', undefined, 'drop', XIV('ui/icon/071000/071141_hr1.tex'))],
      },
      {
        url: MAND,
        materials: [m(3, 'cristallites cosmiques (500 poétiques pièce)', 'Cosmic Crystallites (500 poetics each)', undefined, undefined, XIV('ui/icon/021000/021228_hr1.tex'))],
        once: [m(1, "quête « Les armes manderveilleuses des Manderville » (Radz-at-Han — quête Hildibrand « Le cadeau des Dieux » terminée, puis apporter les 3 cristallites cosmiques)", 'quest "Positively Mandervillous" (Radz-at-Han — Hildibrand quest "Gentlemen at Heart" complete, then hand in the 3 Cosmic Crystallites)', undefined, 'drop', XIV('ui/icon/071000/071141_hr1.tex'))],
      },
    ],
  },

  // -------------------------------------------------- 7.x — Armes fantômes
  'Phantom Weapons': {
    urlEn: `${WIKI}/Phantom_Weapons`,
    stepLabels: [{ fr: 'Penumbra', en: 'Penumbra' },{ fr: 'Umbra', en: 'Umbra' },{ fr: 'Obscurum', en: 'Obscurum' },{ fr: 'Eclipticum', en: 'Eclipticum' },{ fr: 'Occultum', en: 'Occultum' }],
    steps: [
      {
        url: PHA1,
        materials: [m(3, 'lunulites (500 mémoquartz mathématiques pièce, chez Ermina)', 'Arcanite (500 Mathematics each, from Ermina)', undefined, undefined, XIV('ui/icon/021000/021209_hr1.tex'))],
        once: [m(18, 'demi-âtmas (3 de chaque : saphir, corail, ambre, turquoise, émeraude, améthyste — ALÉA et affrontements du Croissant occulte, ALÉA des zones de Dawntrail)', 'Demiatmas (3 of each of the 6 types — Occult Crescent FATEs/CEs, Dawntrail FATEs)', undefined, undefined, XIV('ui/icon/026000/026025_hr1.tex'))],
      },
      {
        url: PHA2,
        materials: [m(3, 'ombralites (500 mémoquartz mathématiques pièce, chez Ermina)', 'Waxing Arcanite (500 Mathematics each, from Ermina)', undefined, undefined, XIV('ui/icon/021000/021221_hr1.tex'))],
        once: [
          m(1, 'colle de rroneek (300 000 gils chez Goplu)', 'Rroneek Glue (300,000 gil from Goplu)', undefined, undefined, XIV('ui/icon/022000/022607_hr1.tex')),
          m(1, "fer météorique d'Ut'ohmu (600 gemmes bicolores chez Rral Wuruq)", "Ut'ohmu Siderite (600 bicolor gemstones from Rral Wuruq)", undefined, undefined, XIV('ui/icon/021000/021202_hr1.tex')),
          m(3, 'matières sombres artificielles α, β et γ (recettes expertes ou hôtel des ventes)', 'Synthetic Dark Matter α, β and γ (expert recipes or Market Board)', undefined, undefined, XIV('ui/icon/021000/021465_hr1.tex')),
          m(4, 'sphères magiques chargées (10 000 pts chacune via les roulettes : vent = donjons avancés, feu = défis, eau = raids en alliance, terre = raids normaux)', 'charged aether spheres (10,000 pts each via roulettes: wind = high-level dungeons, fire = trials, water = alliance raids, earth = normal raids)', undefined, 'drop'),
        ],
      },
      {
        url: PHA3,
        materials: [m(3, 'alunites (500 mémoquartz mathématiques pièce, chez Ermina)', 'Waning Arcanite (500 Mathematics each, from Ermina)', undefined, undefined, XIV('ui/icon/021000/021208_hr1.tex'))],
        once: [
          m(1, 'argile ombrale (500 000 gils chez Goplu)', 'Umbral Clay (500,000 gil from Goplu)', undefined, undefined, XIV('ui/icon/020000/020406_hr1.tex')),
          m(3, 'additifs aspectés (alliage, composant et résine — recettes expertes ou hôtel des ventes)', 'aspected additives (Aetheroconductor, Agglomerate, Aetherocatalyst — expert recipes or Market Board)', undefined, undefined, XIV('ui/icon/026000/026125_hr1.tex')),
          m(1200, 'pâtes de cristal (roulettes et contenus niv. 91-100)', 'Crystal Paste (roulettes and level 91-100 content)', undefined, undefined, XIV('ui/icon/021000/021494_hr1.tex')),
        ],
      },
      {
        url: PHA4,
        materials: [m(3, 'écliptites (500 mémoquartz mathématiques pièce, chez Ermina)', 'Ecliptic Arcanite (500 Mathematics each, from Ermina)', undefined, undefined, XIV('ui/icon/021000/021212_hr1.tex'))],
        once: [
          m(1, 'pierre à aiguiser opaline (500 000 gils chez Goplu)', 'Monarch Whetstone (500,000 gil from Goplu)', undefined, undefined, XIV('ui/icon/021000/021485_hr1.tex')),
          m(1, 'alliage atypique (recette experte ou hôtel des ventes)', 'Ancestral Alloy Ingot (expert recipe or Market Board)', undefined, undefined, XIV('ui/icon/021000/021020_hr1.tex')),
          m(1, 'ficelle inusable (recette experte ou hôtel des ventes)', 'Ascendant Twine (expert recipe or Market Board)', undefined, undefined, XIV('ui/icon/022000/022030_hr1.tex')),
          m(1, 'huile de camélia (recette experte ou hôtel des ventes)', 'Majestic Polish (expert recipe or Market Board)', undefined, undefined, XIV('ui/icon/022000/022671_hr1.tex')),
          m(100, 'dissipateurs spirituels alpha (ALÉA/affrontements ou roulette donjons niv. maximum)', 'Phantom Dispellers α (FATEs/CEs or High-level Dungeons roulette)', undefined, undefined, XIV('ui/icon/026000/026229_hr1.tex')),
          m(100, 'dissipateurs spirituels bêta (ALÉA/affrontements ou roulette défis)', 'Phantom Dispellers β (FATEs/CEs or Trials roulette)', undefined, undefined, XIV('ui/icon/026000/026231_hr1.tex')),
          m(100, 'dissipateurs spirituels gamma (ALÉA/affrontements ou roulette raids normaux)', 'Phantom Dispellers γ (FATEs/CEs or Normal Raids roulette)', undefined, undefined, XIV('ui/icon/026000/026230_hr1.tex')),
        ],
      },
      {
        url: PHA4,
        materials: [m(1, "cristal de savoir rempli (mémentos martiaux, à refaire pour chaque arme : 8 sections — ALÉA rang or dans les zones de Dawntrail, donjons de l'épopée et annexes, donjons experts niv. 100, défis normaux, raids Échos de Vana'diel, raids normaux de l'Arcadion — puis remise à Gerolt avec l'arme Eclipticum)", 'filled Knowledge Crystal (martial memories, refilled for each weapon: 8 sections — gold-rank FATEs across Dawntrail zones, leveling & optional dungeons, level 100 expert dungeons, normal trials, Echoes of Vana\'diel raids, Arcadion normal raids — then turned in to Gerolt with the Eclipticum weapon)', undefined, 'drop', XIV('ui/icon/052000/052835_hr1.tex'))],
      },
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

  // ------------------------------------------------------------- Ultimates
  // Une série unique : chaque « étape » est un combat fatidique.
  Ultimates: {
    urlEn: `${WIKI}/Ultimate_Raids`,
    url: `${WIKI}/Ultimate_Raids`,
    stepLabels: [
      { fr: "L'Abîme infini de Bahamut", en: 'The Unending Coil of Bahamut' },
      { fr: 'La Fantasmagorie d’Ultima', en: 'The Weapon’s Refrain' },
      { fr: "L'Odyssée d'Alexander", en: 'The Epic of Alexander' },
      { fr: 'La Guerre du chant des dragons', en: 'Dragonsong’s Reprise' },
      { fr: 'Le Protocole Oméga', en: 'The Omega Protocol' },
      { fr: 'Avenirs réécrits', en: 'Futures Rewritten' },
      { fr: 'Danse démente', en: 'Dancing Mad' },
    ],
    steps: [
      { materials: [], url: `${WIKI}/The_Unending_Coil_of_Bahamut_(Ultimate)` },
      { materials: [], url: `${WIKI}/The_Weapon's_Refrain_(Ultimate)` },
      { materials: [], url: `${WIKI}/The_Epic_of_Alexander_(Ultimate)` },
      { materials: [], url: `${WIKI}/Dragonsong's_Reprise_(Ultimate)` },
      { materials: [], url: `${WIKI}/The_Omega_Protocol_(Ultimate)` },
      { materials: [], url: `${WIKI}/Futures_Rewritten_(Ultimate)` },
      { materials: [], url: `${WIKI}/Dancing_Mad_(Ultimate)` },
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
        "coffret d'arme de rêve (drop des donjons aux trésors Cénote Ja Ja Gural et Le coffre d'Oneiron — l'arme correspond au job à l'ouverture)",
        "Figmental Weapon Coffer (treasure dungeon drop, Cenote Ja Ja Gural / Vault Oneiron — opens into your current job's weapon)",
        undefined,
        'drop',
        XIV('ui/icon/026000/026557_hr1.tex'),
      ),
    ],
  },
  'Exquisite Weapons': {
    url: `${WIKI}/Exquisite_Weapons`,
    perPiece: [
      m(
        1,
        'arme Credendum améliorée (arme de mémoquartz 6.55 du job, améliorée)',
        "Augmented Credendum Weapon (job's augmented 6.55 tomestone weapon)",
      ),
      m(
        1,
        "agent renforçant du ciel ouvert (chez Trisassant, Vieille Sharlayan — contre 1 manuscrit de L'île d'Aloalo annexe sadique, 40 laitons de Corvos des Contes du Camelot avancés ou 20 manuscrits des Contes du Camelot annexes)",
        "Elevated Ester (Trisassant, Old Sharlayan — 1 Aloalo Manuscript from Another Aloalo Island Savage, 40 Corvosi Brass from The Merchant's Tale Advanced, or 20 Corvosi Manuscripts from Another Merchant's Tale)",
        'elevated-ester',
        undefined,
        XIV('ui/icon/027000/027606_hr1.tex'),
      ),
    ],
  },

  // ----------------------------------------------------------------- Outils
  'Resplendent Tools': {
    url: `${WIKI}/Resplendent_Tools`,
    perPiece: [m(1, "lot de composants resplendissants (craft/récolte)", 'resplendent component set (craft/gather)', undefined, 'drop', XIV('ui/icon/026000/026125_hr1.tex'))],
  },
  'Lucis Tools': {
    url: `${WIKI}/Lucis_Tools`,
    stepLabels: [
      { fr: 'Maîtrise', en: 'Mastercraft' },
      { fr: 'Supra', en: 'Supra' },
      { fr: 'Lucis', en: 'Lucis' },
    ],
    steps: [
      {
        url: `${WIKI}/Mastercraft_Tools`,
        materials: [
          m(1, 'quête de classe niv. 50 « Just Tooling Around » (Mor Dhona)', 'level 50 class quest "Just Tooling Around" (Mor Dhona)', undefined, 'drop'),
        ],
      },
      {
        url: `${WIKI}/Supra_Tools`,
        materials: [
          m(3, 'demi-matérias de la maîtrise divine', 'Mastercraft Demimateria', undefined, undefined, XIV('ui/icon/021000/021285_hr1.tex')),
          m(10, "demi-matérias de l'artifice III", 'Fieldcraft Demimateria III', undefined, undefined, XIV('ui/icon/020000/020243_hr1.tex')),
          m(1, "lot d'objets spécifiques au métier (Talan, Mor Dhona — varie selon le métier)", 'job-specific item set (Talan, Mor Dhona — varies per job)', undefined, 'drop'),
        ],
      },
      {
        url: `${WIKI}/Lucis_Tools`,
        materials: [
          m(1, "lot d'objets HQ spécifiques au métier (Talan, Mor Dhona)", 'job-specific HQ item set (Talan, Mor Dhona)', undefined, 'drop'),
        ],
      },
    ],
  },
  'Skysteel Tools': {
    url: `${WIKI}/Skysteel_Tools`,
    steps: [
      { url: `${WIKI}/Skysteel_Tools`, materials: [m(80000, 'gils (ou coffre de quête)', 'gil (or quest coffer)', 'gil', 'currency', XIV('ui/icon/065000/065002_hr1.tex'))] },
      { url: `${WIKI}/Skysteel_Tools`, materials: [m(20, 'collectionnables HQ du métier', 'HQ collectables', 'collectables')] },
      { url: `${WIKI}/Skysteel_Tools`, materials: [m(30, 'collectionnables HQ du métier', 'HQ collectables', 'collectables')] },
      { url: `${WIKI}/Skysteel_Tools`, materials: [m(18, 'collectionnables (collecte maximale)', 'max-collectability collectables', 'collectables')] },
      { url: `${WIKI}/Skysteel_Tools`, materials: [m(21, 'collectionnables (collecte maximale)', 'max-collectability collectables', 'collectables')] },
      { url: `${WIKI}/Skysteel_Tools`, materials: [m(1, 'lot de collectionnables du Diadème (recettes expertes)', 'Diadem collectables (expert recipes)', undefined, 'drop')] },
    ],
  },
  'Splendorous Tools': {
    url: `${WIKI}/Splendorous_Tools`,
    stepLabels: [
      { fr: 'Merveilles', en: 'Splendorous' },
      { fr: 'Merveilles améliorée', en: 'Augmented Splendorous' },
      { fr: 'Cristalline', en: 'Crystalline' },
      { fr: 'Cristalline de Chora-Zoi', en: "Chora-Zoi's Crystalline" },
      { fr: 'Splendide', en: 'Brilliant' },
      { fr: 'Norvrandtesque', en: "Vrandtic Visionary's" },
      { fr: 'Superstellaire', en: 'Lodestar' },
    ],
    steps: [
      { url: `${WIKI}/Splendorous_Tools`, materials: [m(750, 'assignats violets (ou coffre de quête)', 'Purple Scrips (or quest coffer)', 'purple-scrips', 'currency', XIV('ui/icon/065000/065088_hr1.tex'))] },
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
    stepLabels: [
      { fr: 'Outils cosmiques', en: 'Cosmic tools' },
      { fr: 'Outils spatiaux', en: 'Stellar tools' },
      { fr: 'Outils hyperspatiaux', en: 'Hypertools' },
      { fr: 'Outils des constellations', en: 'Tools of Stars' },
    ],
    steps: [
      { url: `${WIKI}/Cosmic_Tools`, materials: [m(1, "données de recherche de types I à III (missions stellaires de l'Exploration cosmique — les rangs or/argent multiplient les gains)", 'research data types I–III (Cosmic Exploration stellar missions — gold/silver ranks multiply rewards)', undefined, 'drop', XIV('ui/icon/026000/026153_hr1.tex'))] },
      { url: `${WIKI}/Cosmic_Tools`, materials: [m(1, 'données de recherche de types I à IV (missions stellaires, remise à Researchingway)', 'research data types I–IV (stellar missions, turned in to Researchingway)', undefined, 'drop', XIV('ui/icon/026000/026153_hr1.tex'))] },
      { url: `${WIKI}/Cosmic_Tools`, materials: [m(1, 'données de recherche de types I à VI (missions stellaires — les missions de classe A donnent le type VI)', 'research data types I–VI (stellar missions — class A missions grant type VI)', undefined, 'drop', XIV('ui/icon/026000/026153_hr1.tex'))] },
      { url: `${WIKI}/Cosmic_Tools`, materials: [m(1, 'données de recherche de types I à VII (missions stellaires — débloque les répliques et un bonus global de recherche)', 'research data types I–VII (stellar missions — unlocks replicas and a global research bonus)', undefined, 'drop', XIV('ui/icon/026000/026153_hr1.tex'))] },
    ],
  },

  // ------------------------------------------------------------------ GARO
  'GARO Armor': {
    url: `${WIKI}/GARO`,
    perPiece: [
      m(2800, 'marques de loup (moyenne — 2 000 à 4 000 selon la pièce)', 'Wolf Marks (avg — 2,000–4,000 per piece)', 'wolf-marks', 'currency', XIV('ui/icon/065000/065014_hr1.tex')),
    ],
  },
  'GARO Weapons': {
    url: `${WIKI}/GARO`,
    perPiece: [
      m(4000, 'marques de loup', 'Wolf Marks', 'wolf-marks', 'currency', XIV('ui/icon/065000/065014_hr1.tex')),
    ],
  },

  // -------------------------------------------------------- Armures Eurêka
  // Base → +1 → +2 → Anemos : une seule armure, quatre paliers.
  'Eureka Job Armor': {
    url: `${WIKI}/Anemos_Gear`,
    stepLabels: [
      { fr: 'Base', en: 'Base' },
      { fr: '+1', en: '+1' },
      { fr: '+2', en: '+2' },
      { fr: 'Anemos', en: 'Anemos' },
    ],
    steps: [
      { materials: [m(50, 'cristaux instables', 'Protean Crystals', undefined, undefined, XIV('ui/icon/020000/020029_hr1.tex'))] },
      { materials: [m(150, 'cristaux instables', 'Protean Crystals', undefined, undefined, XIV('ui/icon/020000/020029_hr1.tex'))] },
      { materials: [m(400, 'cristaux instables', 'Protean Crystals', undefined, undefined, XIV('ui/icon/020000/020029_hr1.tex'))] },
      { materials: [m(150, 'cristaux Anemos', 'Anemos Crystals', undefined, undefined, XIV('ui/icon/020000/020028_hr1.tex'))] },
    ],
  },
  'Elemental Armor': {
    url: `${WIKI}/Elemental_Armor`,
    steps: [
      { materials: [m(40, 'cristaux Pyros', 'Pyros Crystals', undefined, undefined, XIV('ui/icon/020000/020032_hr1.tex'))] },
      {
        materials: [
          m(38, 'cristaux Hydatos (moyenne — 30 à 50 selon la pièce)', 'Hydatos Crystals (avg — 30–50 per piece)', 'hydatos-cr', undefined, XIV('ui/icon/020000/020037_hr1.tex')),
        ],
      },
      {
        materials: [
          m(27, "fragments d'Eurêka (moyenne — 21 à 35 selon la pièce)", 'Eureka Fragments (avg — 21–35 per piece)', 'eureka-frag', undefined, XIV('ui/icon/026000/026544_hr1.tex')),
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
        XIV('ui/icon/026000/026541_hr1.tex'),
      ),
    ],
  },
  // Bozja → Bozja améliorée → Verdict des Juges → Verdict amélioré →
  // Gunnhildr : la progression unique des armures de la Résistance.
  'Resistance Armor': {
    url: `${WIKI}/Blade's_Armor`,
    stepLabels: [
      { fr: 'Bozja', en: 'Bozjan' },
      { fr: 'Bozja améliorée', en: 'Augmented Bozjan' },
      { fr: 'Verdict des Juges', en: "Law's Order" },
      { fr: 'Verdict des Juges amélioré', en: "Augmented Law's Order" },
      { fr: 'Gunnhildr', en: "Blade's" },
    ],
    steps: [
      {
        url: `${WIKI}/Augmented_Bozjan_Armor`,
        materials: [
          m(1, 'drop du Front sud de Bozja (engagements/coffres)', 'Bozjan Southern Front drop (engagements/coffers)', undefined, 'drop'),
        ],
      },
      {
        url: `${WIKI}/Augmented_Bozjan_Armor`,
        materials: [
          m(1, 'matériaux ultralégers bozjiens (500–999 pièces bozjiennes)', "Bozjan Runner's Secrets (500–999 Bozjan Coins)", undefined, undefined, XIV('ui/icon/026000/026108_hr1.tex')),
        ],
      },
      {
        url: `${WIKI}/Augmented_Law's_Order_Armor`,
        materials: [m(1, 'drop de Delubrum Reginae', 'Delubrum Reginae drop', undefined, 'drop')],
      },
      {
        url: `${WIKI}/Augmented_Law's_Order_Armor`,
        materials: [
          m(1, 'matériaux ultralégers du verdict des Juges (Delubrum sauvage, ou 10 plaques)', "Orderly Runner's Secrets (DR Savage, or 10 platings)", undefined, undefined, XIV('ui/icon/020000/020917_hr1.tex')),
          m(1, 'pièce bozjienne augmentée correspondante', 'matching Augmented Bozjan piece'),
        ],
      },
      {
        url: `${WIKI}/Blade's_Armor`,
        materials: [
          m(7, 'pièces bozjiennes en platine (moyenne — 6 à 9 selon la pièce)', 'Bozjan Platinum Coins (avg — 6–9 per piece)', 'boz-platinum', 'currency', XIV('ui/icon/026000/026329_hr1.tex')),
        ],
      },
    ],
  },

  // --------------------------------------------------- Armures du Croissant
  // Les paliers « +1 / +2 » et « améliorée » sont fusionnés dans la série de
  // base (scripts/fetch-data.mjs) : ils deviennent des étapes, comme les armes.
  "Arcanaut's Armor": {
    url: `${WIKI}/Phantom_Armor`,
    steps: [
      {
        materials: [
          m(4000, "pièces d'argent des douze cités (antiquaire de l'expédition, South Horn)", 'Enlightenment Silver Pieces (Expedition Antiquarian, South Horn)', 'twelve-silver', 'currency', XIV('ui/icon/065000/065119_hr1.tex')),
        ],
      },
      {
        materials: [
          m(3, "fils magiques argentés (1 200 pièces d'argent des douze cités pièce)", 'Aetherspun Silver (1,200 silver pieces each)', undefined, undefined, XIV('ui/icon/021000/021656_hr1.tex')),
          m(3, "agents fixants (1 600 pièces d'or des douze cités pièce)", 'Aetherial Fixative (1,600 gold pieces each)', undefined, undefined, XIV('ui/icon/022000/022653_hr1.tex')),
        ],
      },
      {
        materials: [
          m(3, 'fils magiques dorés (coffres au trésor bronze et argent)', 'Aetherspun Gold (bronze/silver treasure coffers)', undefined, undefined, XIV('ui/icon/021000/021657_hr1.tex')),
          m(6, 'agents fixants X (10 gemmes mystiques de la Force pièce — la Tour fourchue : sang)', 'X-Fixative (10 Sanguinite each — the Forked Tower: Blood)', undefined, undefined, XIV('ui/icon/022000/022659_hr1.tex')),
        ],
      },
    ],
  },
  'Phantom Vision': {
    url: `${WIKI}/Phantom_Armor`,
    steps: [
      { materials: [m(4000, "pièces de nickel des douze cités (antiquaire de l'expédition, North Horn)", 'Enlightenment Silver Obols (Expedition Antiquarian, North Horn)', 'obols', 'currency', XIV('ui/icon/065000/065142_hr1.tex'))] },
      {
        materials: [
          m(3, 'agents fixants ultimes (ou échange de la pièce Arcanaute +1)', "Final Final Fixatives (or Arcanaut's +1 trade-in)", 'final-fixative', undefined, XIV('ui/icon/027000/027627_hr1.tex')),
        ],
      },
      {
        materials: [
          m(4, 'agents fixants ultimes (ou échange de la pièce Arcanaute +2)', "Final Final Fixatives (or Arcanaut's +2 trade-in)", 'final-fixative', undefined, XIV('ui/icon/027000/027627_hr1.tex')),
        ],
      },
      {
        materials: [m(8, 'agents fixants ultimes (échanges, coffres au trésor, la Tour fourchue)', 'Final Final Fixatives (exchanges, treasure coffers, the Forked Tower)', 'final-fixative', undefined, XIV('ui/icon/027000/027627_hr1.tex'))],
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
  /** Provenance d'une ligne (« Série · Étape : quantité ») pour les tooltips. */
  origin?: (step: number, qty: number, once: boolean) => string,
): { perWeapon: Material[]; once: Material[] } {
  const acc = new Map<string, Material>()
  const onceAcc = new Map<string, Material>()
  const steps = effectiveSteps(costs, missingPerStep.length)
  for (let i = 0; i < missingPerStep.length; i++) {
    const step = steps[i]
    if (!step || missingPerStep[i] === 0) continue
    for (const mat of step.materials) {
      const src = origin ? { ...mat, from: [origin(i, mat.qty * missingPerStep[i], false)] } : mat
      mergeMaterial(acc, src, missingPerStep[i])
    }
    if (step.once && missingPerStep[i] === jobs) {
      for (const mat of step.once) {
        const src = origin ? { ...mat, from: [origin(i, mat.qty, true)] } : mat
        mergeMaterial(onceAcc, src)
      }
    }
  }
  return {
    perWeapon: [...acc.values()].filter((mat) => mat.qty > 0),
    once: [...onceAcc.values()].filter((mat) => mat.qty > 0),
  }
}
