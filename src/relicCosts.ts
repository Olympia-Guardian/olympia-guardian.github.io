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
}

/** Libellés canoniques des objets fusionnés (affichage des totaux). */
const CANON: Record<string, { fr: string; en: string }> = {
  gil: { fr: 'gils', en: 'gil' },
  'wolf-marks': { fr: 'marques de loup', en: 'Wolf Marks' },
  collectables: { fr: 'collectionnables (tous paliers)', en: 'collectables (all tiers)' },
  eclipticite: { fr: "morceaux d'écliptite", en: 'Eclipticite' },
  'final-fixative': { fr: 'fixatifs ultimes', en: 'Final Fixatives' },
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
}

export interface SeriesCosts {
  /** Coûts indexés par étape (1..n, ordre FFXIV Collect). */
  steps?: StepCost[]
  /** Séries à palier unique (armures, GARO…) : même coût pour chaque pièce. */
  perPiece?: Material[]
  /** Guide de la série (utilisé quand l'étape n'a pas le sien). */
  url?: string
}

/** Étapes effectives d'une série (perPiece → répliqué sur chaque étape dérivée). */
export function effectiveSteps(costs: SeriesCosts, steps: number): StepCost[] {
  if (costs.steps) return costs.steps
  return Array.from({ length: steps }, () => ({
    materials: costs.perPiece ?? [],
    url: costs.url,
  }))
}

const m = (
  qty: number,
  fr: string,
  en: string,
  key?: string,
  cat?: Material['cat'],
): Material => ({ qty, fr, en, key, cat })

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
    steps: [
      {
        url: ZOD1,
        materials: [
          m(1, 'arme 50★ HQ (+2 matérias III du job)', 'HQ i50★ weapon (+2 grade III materia)'),
          m(1, "flamme d'Ifrit", "Ifrit's Flame"),
          m(1, 'rafale de Garuda', "Garuda's Gale"),
          m(1, 'pierre de Titan', "Titan's Stone"),
          m(1, "fiole d'huile de trempe (15 poétiques)", 'Quenching Oil (15 poetics)'),
        ],
      },
      { url: ZOD2, materials: [m(3, 'lymphes de Thavnair (20 poétiques pièce)', 'Thavnairian Mist (20 poetics each)')] },
      { url: ZOD2, materials: [m(12, 'atmas (ALÉA 2.x)', 'Atmas (ARR FATEs)')] },
      { url: ZOD3, materials: [m(9, 'tomes des chroniques (100 poétiques pièce)', 'Chronicle books (100 poetics each)')] },
      {
        url: ZOD4,
        materials: [
          m(1, 'parchemin stellaire', 'Star Scroll'),
          m(3, 'encres enchantées HQ (25 poétiques pièce)', 'HQ Enchanted Ink (25 poetics each)'),
          m(75, 'alexandrites', 'Alexandrite'),
        ],
      },
      { url: ZOD5, materials: [m(2000, 'éclats de lumière (farm)', 'Light shards (grind)')] },
      {
        url: ZOD6,
        materials: [
          m(800, 'mémoquartz poétiques', 'Tomestones of Poetics', 'poetics', 'currency'),
          m(80000, 'sceaux de grande compagnie', 'Grand Company seals', 'gc-seals', 'currency'),
          m(500000, 'gils', 'gil', 'gil', 'currency'),
          m(8, 'objets craftés HQ (tarte, étoffe, bague…)', 'HQ crafted items (pie, cloth, ring…)'),
        ],
      },
      { url: ZOD7, materials: [m(12, 'mahatmas (50 poétiques pièce)', 'Mahatmas (50 poetics each)')] },
    ],
  },

  // ---------------------------------------------------------- 3.x — Animas
  'Anima Weapons': {
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
          m(1, 'mesure de caoutchouc enchanté', 'Enchanted Rubber'),
          m(1, "fiole d'agent solidifiant allagois supérieur", 'Fast-drying Carboncoat'),
          m(1, 'pot de catalyseur allagois supérieur', 'Divine Water catalyst'),
          m(1, "bouteille d'eau divine", 'Divine Water'),
        ],
      },
      { url: ANI2, materials: [m(5, "pots d'huile isolante (350 poétiques pièce)", 'Aether Oil (350 poetics each)')] },
      {
        url: ANI3,
        materials: [
          m(50, 'umbrites dures (75 poétiques pièce)', 'Umbrite (75 poetics each)'),
          m(50, 'sables cristallisés raffinés', 'Crystal Sand'),
        ],
      },
      { url: ANI3, materials: [m(50, 'agrégats résonnants (40 poétiques pièce)', 'Singing Clusters (40 poetics each)')] },
      { url: ANI4, materials: [m(15, 'agrégats obscurs (100 poétiques pièce)', 'Pneumite (100 poetics each)')] },
      { url: ANI4, materials: [m(1, 'encre enchantée ancienne (500 poétiques)', 'Archaic Enchanted Ink (500 poetics)')] },
    ],
  },

  // ---------------------------------------------------------- 4.x — Eurêka
  'Eureka Weapons': {
    steps: [
      { url: EUR1, materials: [m(12, 'cristaux instables', 'Unstable Crystals'), m(4, 'cristaux Anémos', 'Anemos Crystals')] },
      { url: EUR1, materials: [m(12, 'cristaux instables', 'Unstable Crystals'), m(8, 'cristaux Anémos', 'Anemos Crystals')] },
      { url: EUR1, materials: [m(16, 'cristaux instables', 'Unstable Crystals'), m(12, 'cristaux Anémos', 'Anemos Crystals')] },
      {
        url: EUR1,
        materials: [
          m(24, 'cristaux instables', 'Unstable Crystals'),
          m(16, 'cristaux Anémos', 'Anemos Crystals'),
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
    url: `${WIKI}/Resistance_Weapons`,
    steps: [
      { url: `${WIKI}/Resistance_Weapons`, materials: [m(4, "poudres d'écaille de Thavnair (250 poétiques pièce)", 'Thavnairian Scalepowder (250 poetics each)')] },
      {
        url: `${WIKI}/Resistance_Weapons`,
        materials: [
          m(20, 'souvenirs torturés', 'Tortured Memories'),
          m(20, 'souvenirs affligés', 'Sorrowful Memories'),
          m(20, 'souvenirs déchirants', 'Harrowing Memories'),
        ],
      },
      { url: `${WIKI}/Resistance_Weapons`, materials: [m(6, 'souvenirs amers', 'Bitter Memories')] },
      { url: `${WIKI}/Resistance_Weapons`, materials: [m(15, 'souvenirs détestables', 'Loathsome Memories')] },
      { url: `${WIKI}/Resistance_Weapons`, materials: [m(15, 'artefacts anciens', 'Timeworn Artifacts')] },
      { url: `${WIKI}/Resistance_Weapons`, materials: [m(15, 'émotions brutes', 'Raw Emotions')] },
    ],
  },

  // ----------------------------------------------------- 6.x — Manderville
  'Manderville Weapons': {
    steps: [
      { url: MAND, materials: [m(3, 'morceaux de météorite rarissime (500 poétiques pièce)', 'Manderium Meteorites (500 poetics each)')] },
      { url: MAND, materials: [m(3, 'morceaux de chondrite rarissime (500 poétiques pièce)', 'Complementary Chondrites (500 poetics each)')] },
      { url: MAND, materials: [m(3, 'achondrites rarissimes (500 poétiques pièce)', 'Amplifying Achondrites (500 poetics each)')] },
      { url: MAND, materials: [m(3, 'cristallites cosmiques (500 poétiques pièce)', 'Cosmic Crystallites (500 poetics each)')] },
    ],
  },

  // -------------------------------------------------- 7.x — Armes fantômes
  'Phantom Weapons': {
    steps: [
      {
        url: PHA1,
        materials: [m(1500, 'mémoquartz héliologiques (3 lunulites)', 'Tomestones of Heliometry (3 Lunulites)', 'heliometry', 'currency')],
        once: [m(18, 'demi-âtmas (ALÉA/affrontements du Croissant occulte)', 'Demiatmas (Occult Crescent FATEs/CEs)')],
      },
      {
        url: PHA2,
        materials: [m(3, 'ombralites (500 héliologiques pièce)', 'Umbralites (500 Heliometry each)')],
        once: [
          m(1, 'bloc de colle de rroneek (300 000 gils)', 'Rroneek Glue (300,000 gil)'),
          m(1, "fragment de fer météorique d'Ut'ohmu (600 gemmes bicolores)", "Ut'ohmu Siderite (600 bicolor gems)"),
          m(3, 'matières sombres artificielles α/β/γ', 'Synthetic Dark Matter α/β/γ'),
        ],
      },
      {
        url: PHA3,
        materials: [m(3, "morceaux d'alunite (500 mathématiques pièce)", 'Alunite (500 Mathematics each)')],
        once: [
          m(1, 'argile ombrale (500 000 gils)', 'Umbral Clay (500,000 gil)'),
          m(3, 'composants additifs aspectés (craft)', 'Aspected additive components (crafted)'),
          m(1200, 'morceaux de pâte de cristal', 'Crystal Paste'),
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
  'Eureka Job Armor': { url: `${WIKI}/Anemos_Gear`, perPiece: [m(50, 'cristaux instables', 'Protean Crystals')] },
  'Eureka Job Armor +1': { url: `${WIKI}/Anemos_Gear`, perPiece: [m(150, 'cristaux instables', 'Protean Crystals')] },
  'Eureka Job Armor +2': { url: `${WIKI}/Anemos_Gear`, perPiece: [m(400, 'cristaux instables', 'Protean Crystals')] },
  'Eureka Anemos Armor': { url: `${WIKI}/Anemos_Gear`, perPiece: [m(150, 'cristaux Anémos', 'Anemos Crystals')] },
  'Elemental Armor': { url: `${WIKI}/Elemental_Armor`, perPiece: [m(40, 'cristaux Pyros', 'Pyros Crystals')] },
  'Elemental Armor +1': {
    url: `${WIKI}/Elemental_Armor`,
    perPiece: [m(38, 'cristaux Hydatos (moyenne — 30 à 50 selon la pièce)', 'Hydatos Crystals (avg — 30–50 per piece)', 'hydatos-cr')],
  },
  'Elemental Armor +2': {
    url: `${WIKI}/Elemental_Armor`,
    perPiece: [m(27, "fragments d'Eurêka (moyenne — 21 à 35 selon la pièce)", 'Eureka Fragments (avg — 21–35 per piece)', 'eureka-frag')],
  },

  // --------------------------------------------------------- Armures Bozja
  'Idealized Armor': {
    url: `${WIKI}/The_Baldesion_Arsenal`,
    perPiece: [m(1, "drop de l'Arsenal de Baldesion (coffres personnels)", 'Baldesion Arsenal drop (personal coffers)', undefined, 'drop')],
  },
  'Bozjan Armor': {
    url: `${WIKI}/Augmented_Bozjan_Armor`,
    perPiece: [m(1, 'drop du Front sud de Bozja (engagements/coffres)', 'Bozjan Southern Front drop (engagements/coffers)', undefined, 'drop')],
  },
  'Augmented Bozjan Armor': {
    url: `${WIKI}/Augmented_Bozjan_Armor`,
    perPiece: [m(1, 'secret du coureur bozjien (500–999 pièces bozjiennes)', "Bozjan Runner's Secrets (500–999 Bozjan Coins)")],
  },
  "Law's Order": {
    url: `${WIKI}/Augmented_Law's_Order_Armor`,
    perPiece: [m(1, 'drop de Delubrum Reginae', 'Delubrum Reginae drop', undefined, 'drop')],
  },
  "Augmented Law's Order": {
    url: `${WIKI}/Augmented_Law's_Order_Armor`,
    perPiece: [
      m(1, 'secret du coureur ordonné (Delubrum sauvage, ou 10 plaques)', "Orderly Runner's Secrets (DR Savage, or 10 platings)"),
      m(1, 'pièce bozjienne augmentée correspondante', 'matching Augmented Bozjan piece'),
    ],
  },
  "Blade's Armor": {
    url: `${WIKI}/Blade's_Armor`,
    perPiece: [m(7, 'pièces de platine bozjiennes (moyenne — 6 à 9 selon la pièce)', 'Bozjan Platinum Coins (avg — 6–9 per piece)', 'boz-platinum', 'currency')],
  },

  // --------------------------------------------------- Armures du Croissant
  "Arcanaut's Armor": {
    url: `${WIKI}/Phantom_Armor`,
    perPiece: [m(4000, "pièces d'argent des douze cités", 'Enlightenment Silver Pieces', 'twelve-silver', 'currency')],
  },
  "Arcanaut's Armor +1": {
    url: `${WIKI}/Phantom_Armor`,
    perPiece: [
      m(3, 'argents éthérés (1 200 argent pièce)', 'Aetherspun Silver (1,200 silver each)'),
      m(3, 'fixatifs éthérés (1 600 or pièce)', 'Aetherial Fixative (1,600 gold each)'),
    ],
  },
  "Arcanaut's Armor +2": {
    url: `${WIKI}/Phantom_Armor`,
    perPiece: [
      m(3, 'ors éthérés', 'Aetherspun Gold'),
      m(6, 'fixatifs X (60 sanguinites pièce)', 'X-Fixative (60 Sanguinite each)'),
    ],
  },
  'Phantom Vision': {
    url: `${WIKI}/Phantom_Armor`,
    perPiece: [m(4000, "oboles d'argent (North Horn)", 'Silver Obols (North Horn)', 'obols', 'currency')],
  },
  'Phantom Vision +1': {
    url: `${WIKI}/Phantom_Armor`,
    perPiece: [m(3, 'fixatifs ultimes (ou échange Arcanaut +1)', "Final Fixatives (or Arcanaut's +1 trade-in)", 'final-fixative')],
  },
  'Phantom Vision +2': {
    url: `${WIKI}/Phantom_Armor`,
    perPiece: [m(4, 'fixatifs ultimes (ou échange Arcanaut +2)', "Final Fixatives (or Arcanaut's +2 trade-in)", 'final-fixative')],
  },
  'Phantom Vision +3': {
    url: `${WIKI}/Phantom_Armor`,
    perPiece: [m(8, 'fixatifs ultimes (Tour fourchue)', 'Final Fixatives (Forked Tower)', 'final-fixative')],
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
