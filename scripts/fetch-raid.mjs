// Équipement de raid : ce qui tombe dans chaque palier savage, et de quoi
// reconnaître un BiS importé.
//
// Publie public/data/raid.json, lu par les groupes de raid. Deux tables :
//
//  - `emplacements`, les onze coffres qui se distribuent le soir du raid ;
//  - `pieces`, tout l'équipement du palier — les 77 pièces savage ET les
//    pièces de mémoquartz du même niveau. C'est elle qui range un BiS collé :
//    un identifiant d'objet y donne son emplacement et sa provenance, donc
//    ce qu'on attend du raid, sans une question au joueur ;
//  - `materiaux`, les quatre composants qui améliorent le mémoquartz. Eux
//    aussi tombent en savage : une pièce de tomes n'est pas gratuite en
//    soirées, elle l'est seulement en coffres.
//
// Deux choses que XIVAPI ne dit pas, et qui sont donc écrites ici :
//
//  - la répartition des coffres par ÉTAGE. `InstanceContentRewardItem` n'expose
//    que des colonnes inconnues. Le schéma n'a pas bougé depuis Alexander :
//    accessoires, puis casque/mains/pieds, puis torse/jambes, puis l'arme ;
//  - la FAMILLE de noms de chaque palier. Un palier savage porte un nom
//    d'équipement unique (« Babyface »), qui ne se déduit d'aucun champ.
//
// Un nouveau palier = une ligne dans PALIERS.

import { writeFile } from 'node:fs/promises'

const OUT = new URL('../public/data/', import.meta.url)
const API = 'https://v2.xivapi.com/api'

// `etages` porte deux choses par etage : le nom que les JOUEURS lui donnent
// (« M10S », qu'aucune donnee du jeu ne contient, le jeu numerotant ses matchs
// de 1 a 4 dans chaque palier), et le nom EXACT de la mission, qui sert a
// retrouver sa banniere. L'ordre va du premier etage au dernier.
//
// Les noms français des paliers viennent du jeu, pas d'une traduction maison :
// le jeu dit « Poids lourds-légers » pour Cruiserweight et « Poids lourds »
// pour Heavyweight, la boxe ayant des categories que l'intuition invente mal.
const PALIERS = [
  { cle: 'asphodelos', famille: 'Asphodelos', ilvl: 600,
    courts: ['P1S', 'P2S', 'P3S', 'P4S'],
    missions: [
      'Asphodelos: The First Circle (Savage)',
      'Asphodelos: The Second Circle (Savage)',
      'Asphodelos: The Third Circle (Savage)',
      'Asphodelos: The Fourth Circle (Savage)',
    ],
    fr: 'Asphodélos (P1S-P4S)', en: 'Asphodelos (P1S-P4S)' },
  { cle: 'abyssos', famille: 'Abyssos', ilvl: 630,
    courts: ['P5S', 'P6S', 'P7S', 'P8S'],
    missions: [
      'Abyssos: The Fifth Circle (Savage)',
      'Abyssos: The Sixth Circle (Savage)',
      'Abyssos: The Seventh Circle (Savage)',
      'Abyssos: The Eighth Circle (Savage)',
    ],
    fr: 'Abyssos (P5S-P8S)', en: 'Abyssos (P5S-P8S)' },
  { cle: 'anabaseios', famille: 'Ascension', ilvl: 660,
    courts: ['P9S', 'P10S', 'P11S', 'P12S'],
    missions: [
      'Anabaseios: The Ninth Circle (Savage)',
      'Anabaseios: The Tenth Circle (Savage)',
      'Anabaseios: The Eleventh Circle (Savage)',
      'Anabaseios: The Twelfth Circle (Savage)',
    ],
    fr: 'Anabaseios (P9S-P12S)', en: 'Anabaseios (P9S-P12S)' },
  { cle: 'aac-light', famille: 'Dark Horse', ilvl: 730,
    courts: ['M1S', 'M2S', 'M3S', 'M4S'],
    missions: [
      'AAC Light-heavyweight M1 (Savage)',
      'AAC Light-heavyweight M2 (Savage)',
      'AAC Light-heavyweight M3 (Savage)',
      'AAC Light-heavyweight M4 (Savage)',
    ],
    fr: 'CCA Poids mi-lourds (M1S-M4S)', en: 'AAC Light-heavyweight (M1S-M4S)' },
  { cle: 'aac-cruiser', famille: 'Babyface', ilvl: 760,
    courts: ['M5S', 'M6S', 'M7S', 'M8S'],
    missions: [
      'AAC Cruiserweight M1 (Savage)',
      'AAC Cruiserweight M2 (Savage)',
      'AAC Cruiserweight M3 (Savage)',
      'AAC Cruiserweight M4 (Savage)',
    ],
    fr: 'CCA Poids lourds-légers (M5S-M8S)', en: 'AAC Cruiserweight (M5S-M8S)' },
  { cle: 'aac-heavy', famille: 'Grand Champion', ilvl: 790,
    courts: ['M9S', 'M10S', 'M11S', 'M12S'],
    missions: [
      'AAC Heavyweight M1 (Savage)',
      'AAC Heavyweight M2 (Savage)',
      'AAC Heavyweight M3 (Savage)',
      'AAC Heavyweight M4 (Savage)',
    ],
    fr: 'CCA Poids lourds (M9S-M12S)', en: 'AAC Heavyweight (M9S-M12S)' },
]

// Le nom du coffre est bâti pareil à chaque palier : « … <Emplacement> Coffer ».
// Vérifié sur les six, d'Asphodélos à Grand Champion.
//
// ONZE emplacements pour dix coffres : les deux anneaux sortent du même coffre
// mais se suivent séparément — on peut viser l'un en savage et prendre l'autre
// en mémoquartz.
//
// L'étage est écrit ici : XIVAPI ne le dit nulle part, et la répartition n'a pas
// bougé depuis Alexander.
const EMPLACEMENTS = [
  { cle: 'earring', mot: 'Earring Coffer', etage: 1, fr: 'Boucles', en: 'Earrings' },
  { cle: 'necklace', mot: 'Necklace Coffer', etage: 1, fr: 'Collier', en: 'Necklace' },
  { cle: 'bracelet', mot: 'Bracelet Coffer', etage: 1, fr: 'Bracelet', en: 'Bracelet' },
  { cle: 'ring1', mot: 'Ring Coffer', etage: 1, fr: 'Bague 1', en: 'Ring 1' },
  { cle: 'ring2', mot: 'Ring Coffer', etage: 1, fr: 'Bague 2', en: 'Ring 2' },
  { cle: 'head', mot: 'Head Gear Coffer', etage: 2, fr: 'Tête', en: 'Head' },
  { cle: 'hands', mot: 'Hand Gear Coffer', etage: 2, fr: 'Mains', en: 'Hands' },
  { cle: 'feet', mot: 'Foot Gear Coffer', etage: 2, fr: 'Pieds', en: 'Feet' },
  { cle: 'body', mot: 'Chest Gear Coffer', etage: 3, fr: 'Torse', en: 'Body' },
  { cle: 'legs', mot: 'Leg Gear Coffer', etage: 3, fr: 'Jambes', en: 'Legs' },
  { cle: 'weapon', mot: 'Weapon Coffer', etage: 4, fr: 'Arme', en: 'Weapon' },
]

// Un objet dit son emplacement dans sa catégorie d'équipement, un champ par
// case du personnage. L'ordre compte : une bague porte FingerL ET FingerR (on
// tranche pour la gauche, le BiS dira laquelle), et une arme à deux mains porte
// MainHand à 1 avec OffHand à -1 — la main droite d'abord, donc.
//
// Le BOUCLIER rejoint l'arme : au paladin, le coffre d'arme donne les deux d'un
// coup (« Paladin's <palier> Arms »). Un seul butin, un seul emplacement.
const SLOT_PAR_CATEGORIE = [
  ['MainHand', 'weapon'],
  ['OffHand', 'weapon'],
  ['Head', 'head'],
  ['Body', 'body'],
  ['Gloves', 'hands'],
  ['Legs', 'legs'],
  ['Feet', 'feet'],
  ['Ears', 'earring'],
  ['Neck', 'necklace'],
  ['Wrists', 'bracelet'],
  ['FingerL', 'ring'],
]

function emplacementDe(categorie) {
  const champs = categorie?.fields ?? {}
  for (const [champ, cle] of SLOT_PAR_CATEGORIE) {
    if (champs[champ] === 1) return cle
  }
  return null
}

// Ce que coûte une pièce de mémoquartz en plus des tomes : un composant, qui
// tombe en savage. Leurs noms changent à chaque palier sans suivre de règle
// (Roborant, Coating, Brine, Shine, Ester, Solvent, Glaze...), et RIEN dans les
// données du jeu ne dit lequel améliore quoi : seule la description de l'objet
// le dit, en toutes lettres. Elle a été lue une fois, le résultat est ici.
//
// L'ÉTAGE n'y figure pas, volontairement : les composants tombent au hasard des
// étages. Leur en attribuer un donnerait un décompte de soirées faux, et faux
// avec l'air d'être précis.
//
//  armure     : tête, torse, mains, jambes, pieds
//  accessoire : boucles, collier, bracelet, bagues
//  arme       : l'améliore
//  achat      : et celui-là sert à l'ACHETER, avant même de l'améliorer
const MATERIAUX = {
  asphodelos: {
    armure: 'Radiant Twine', accessoire: 'Radiant Coating',
    arme: 'Radiant Roborant', achat: 'Discal Tomestone',
  },
  abyssos: {
    armure: 'Moonshine Twine', accessoire: 'Moonshine Shine',
    arme: 'Moonshine Brine', achat: 'Ultralight Tomestone',
  },
  anabaseios: {
    armure: 'Divine Twine', accessoire: 'Divine Shine',
    arme: 'Divine Solvent', achat: 'Hermetic Tomestone',
  },
  'aac-light': {
    armure: 'Surgelight Twine', accessoire: 'Surgelight Glaze',
    arme: 'Surgelight Solvent', achat: 'Universal Tomestone',
  },
  'aac-cruiser': {
    armure: 'Evercharged Twine', accessoire: 'Evercharged Glaze',
    arme: 'Evercharged Ester', achat: 'Universal Tomestone 2.0',
  },
  'aac-heavy': {
    armure: 'Thundersteeped Twine', accessoire: 'Thundersteeping Glaze',
    arme: 'Thundersteeped Solvent', achat: 'Universal Tomestone 3.0',
  },
}

async function json(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) })
  if (!res.ok) throw new Error(`${res.status} sur ${url}`)
  return res.json()
}

const icone = (path) =>
  `https://v2.xivapi.com/api/asset?format=webp&path=${encodeURIComponent(path)}`

/** Les coffres d'un palier : ceux-ci sont au niveau 1, l'équipement est au
 *  niveau du palier. La recherche ne fonctionne qu'en anglais ; le français se
 *  relit ensuite ligne par ligne. */
/** Identifiant PROPRE d'un emplacement, stable et unique tous paliers
 *  confondus. Celui du coffre ne convient pas : les deux anneaux le partagent,
 *  et il faut pouvoir marquer l'un sans l'autre. Le rang du palier occupe les
 *  centaines, celui de l'emplacement les unités. */
function identifiant(rangPalier, rangEmplacement) {
  return rangPalier * 100 + rangEmplacement
}

async function coffres(palier, rangPalier) {
  const q = encodeURIComponent(`+Name~"${palier.famille}" +LevelItem=1`)
  const d = await json(`${API}/search?sheets=Item&query=${q}&limit=40&fields=Name,Icon`)
  const trouves = d.results ?? []
  // Le nom français se relit ligne par ligne, la recherche ne marchant qu'en
  // anglais. Les deux anneaux partageant un coffre, on ne le demande qu'une fois.
  const cacheFr = new Map()
  const out = []
  for (let i = 0; i < EMPLACEMENTS.length; i++) {
    const emp = EMPLACEMENTS[i]
    const ligne = trouves.find((r) => (r.fields?.Name ?? '').includes(emp.mot))
    if (!ligne) continue
    if (!cacheFr.has(ligne.row_id)) {
      const fr = await json(`${API}/sheet/Item/${ligne.row_id}?language=fr&fields=Name`)
      cacheFr.set(ligne.row_id, fr.fields?.Name ?? ligne.fields.Name)
    }
    out.push({
      cle: emp.cle,
      etage: emp.etage,
      id: identifiant(rangPalier, i),
      coffre: ligne.row_id,
      fr: emp.fr,
      en: emp.en,
      objetFr: cacheFr.get(ligne.row_id),
      objetEn: ligne.fields.Name,
      icon: icone(ligne.fields?.Icon?.path_hr1 ?? ''),
    })
  }
  return out
}

/** Les noms français, par paquets de cent. La recherche ne peut pas les
 *  donner : son index est celui de la langue demandée, et « Augmented »
 *  n'existe pas en français. On relit donc les lignes trouvées. */
async function nomsFr(ids) {
  const out = new Map()
  for (let i = 0; i < ids.length; i += 100) {
    const lot = ids.slice(i, i + 100).join(',')
    const d = await json(`${API}/sheet/Item?rows=${lot}&language=fr&fields=Name`)
    for (const r of d.rows ?? []) out.set(r.row_id, r.fields?.Name ?? '')
  }
  return out
}

async function chercher(requete, provenance) {
  const q = encodeURIComponent(requete)
  const d = await json(
    `${API}/search?sheets=Item&query=${q}&limit=500&fields=Name,EquipSlotCategory,Icon`,
  )
  const out = []
  for (const r of d.results ?? []) {
    // Un objet non équipable — le coffre, la panoplie du paladin — n'a pas
    // d'emplacement : il n'a rien à faire dans une table de pièces.
    const emplacement = emplacementDe(r.fields?.EquipSlotCategory)
    if (!emplacement) continue
    out.push({
      id: r.row_id,
      emplacement,
      provenance,
      en: r.fields.Name,
      icone: r.fields?.Icon?.id ?? 0,
    })
  }
  return out
}

/** Tout l'équipement d'un palier, savage et mémoquartz.
 *
 *  Le mémoquartz ne demande AUCUNE famille écrite à la main : au niveau
 *  d'objet de l'armure savage, les pièces nommées « Augmented » sont le set de
 *  tomes, et rien d'autre. Vérifié sur les six paliers — Radiant's, Lunar
 *  Envoy's, Credendum, Quetzalli, Veldian, Bygone Brass. */
async function pieces(palier) {
  const savage = await chercher(
    `+Name~"${palier.famille}" +LevelItem>=${palier.ilvl}`,
    'savage',
  )
  const tome = await chercher(`+Name~"Augmented" +LevelItem=${palier.ilvl}`, 'tome')
  const liste = [...savage, ...tome]
  const fr = await nomsFr(liste.map((x) => x.id))
  for (const piece of liste) piece.fr = fr.get(piece.id) ?? piece.en
  return liste
}

/** Les missions sadiques du jeu, par nom exact. Chacune porte sa banniere : la
 *  meme image que le jeu affiche dans la recherche de mission. Une seule
 *  recherche suffit pour les vingt-quatre. */
async function missions() {
  const q = encodeURIComponent('+Name~"Savage"')
  const d = await json(
    `${API}/search?sheets=ContentFinderCondition&query=${q}&limit=500&fields=Name,Image`,
  )
  const par = new Map()
  for (const r of d.results ?? []) {
    par.set(r.fields?.Name, { id: r.row_id, image: r.fields?.Image?.id ?? 0 })
  }
  return par
}

/** Les etages d'un palier : nom des joueurs, nom du jeu, banniere. */
async function etagesDe(palier, catalogue) {
  const out = []
  for (let i = 0; i < palier.courts.length; i++) {
    const nom = palier.missions[i]
    const ligne = catalogue.get(nom)
    if (!ligne) throw new Error(`${palier.cle} : mission « ${nom} » introuvable, écriture refusée`)
    out.push({ court: palier.courts[i], en: nom, id: ligne.id, image: ligne.image })
  }
  const fr = await json(
    `${API}/sheet/ContentFinderCondition?rows=${out.map((e) => e.id).join(',')}` +
      '&language=fr&fields=Name',
  )
  const noms = new Map((fr.rows ?? []).map((r) => [r.row_id, r.fields?.Name ?? '']))
  for (const e of out) {
    e.fr = noms.get(e.id) || e.en
    delete e.id
  }
  return out
}

/** Les quatre composants d'un palier. Le nom exact compte : « Universal
 *  Tomestone » et « Universal Tomestone 2.0 » sont deux paliers différents, et
 *  une recherche floue les confondrait. */
async function materiaux(palier) {
  const table = MATERIAUX[palier.cle]
  if (!table) throw new Error(`${palier.cle} : aucun composant déclaré`)
  const out = []
  for (const [cle, nom] of Object.entries(table)) {
    const q = encodeURIComponent(`+Name~"${nom}" +LevelItem=1`)
    const d = await json(`${API}/search?sheets=Item&query=${q}&limit=40&fields=Name,Icon`)
    const ligne = (d.results ?? []).find((r) => r.fields?.Name === nom)
    if (!ligne) throw new Error(`${palier.cle} : « ${nom} » introuvable, écriture refusée`)
    out.push({ cle, id: ligne.row_id, en: nom, icone: ligne.fields?.Icon?.id ?? 0 })
  }
  const fr = await nomsFr(out.map((x) => x.id))
  for (const m of out) m.fr = fr.get(m.id) ?? m.en
  return out
}

/** Une table amputée rangerait un BiS de travers, et sans le dire : une pièce
 *  savage manquante deviendrait « prise ailleurs » et le compte des soirées
 *  tomberait trop bas. On exige donc que chaque provenance couvre toutes les
 *  cases du personnage. */
function verifier(cle, table) {
  const attendus = new Set(SLOT_PAR_CATEGORIE.map(([, e]) => e))
  for (const provenance of ['savage', 'tome']) {
    const vus = new Set(
      table.filter((x) => x.provenance === provenance).map((x) => x.emplacement),
    )
    const manquants = [...attendus].filter((e) => !vus.has(e))
    if (manquants.length > 0) {
      throw new Error(
        `${cle} : ${provenance} sans ${manquants.join(', ')}, écriture refusée`,
      )
    }
  }
}

const catalogueMissions = await missions()

const paliers = []
for (let rang = 0; rang < PALIERS.length; rang++) {
  const p = PALIERS[rang]
  const liste = await coffres(p, rang + 1)
  // Onze emplacements ou rien : un palier amputé donnerait un décompte faux, et
  // le silence serait pire que l'échec.
  if (liste.length !== EMPLACEMENTS.length) {
    throw new Error(
      `${p.cle} : ${liste.length} emplacements sur ${EMPLACEMENTS.length}, écriture refusée`,
    )
  }
  const table = await pieces(p)
  verifier(p.cle, table)
  const compos = await materiaux(p)
  paliers.push({
    cle: p.cle,
    fr: p.fr,
    en: p.en,
    ilvl: p.ilvl,
    etages: await etagesDe(p, catalogueMissions),
    emplacements: liste,
    pieces: table,
    materiaux: compos,
  })
  const nSavage = table.filter((x) => x.provenance === 'savage').length
  console.log(
    `${p.cle}: ${liste.length} emplacements, ${table.length} pièces ` +
      `(${nSavage} savage, ${table.length - nSavage} mémoquartz), ` +
      `${compos.length} composants — ilvl ${p.ilvl}`,
  )
}

await writeFile(new URL('raid.json', OUT), JSON.stringify({ paliers }))
console.log(`raid: ${paliers.length} paliers`)
