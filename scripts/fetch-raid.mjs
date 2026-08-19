// Équipement de raid : ce qui tombe dans chaque palier savage.
//
// Publie public/data/raid.json, lu par les groupes de raid. Le fichier ne sort
// QUE les dix emplacements qui tombent, pas les 88 objets d'un palier : c'est
// le coffre qui se distribue le soir du raid, pas la variante par job.
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

const PALIERS = [
  { cle: 'asphodelos', famille: 'Asphodelos', ilvl: 600,
    fr: 'Asphodélos (P1S-P4S)', en: 'Asphodelos (P1S-P4S)' },
  { cle: 'abyssos', famille: 'Abyssos', ilvl: 630,
    fr: 'Abyssos (P5S-P8S)', en: 'Abyssos (P5S-P8S)' },
  { cle: 'anabaseios', famille: 'Ascension', ilvl: 660,
    fr: 'Anabaseios (P9S-P12S)', en: 'Anabaseios (P9S-P12S)' },
  { cle: 'aac-light', famille: 'Dark Horse', ilvl: 730,
    fr: 'AAC Poids mi-lourds (M1S-M4S)', en: 'AAC Light-heavyweight (M1S-M4S)' },
  { cle: 'aac-cruiser', famille: 'Babyface', ilvl: 760,
    fr: 'AAC Poids lourds (M5S-M8S)', en: 'AAC Cruiserweight (M5S-M8S)' },
  { cle: 'aac-heavy', famille: 'Grand Champion', ilvl: 790,
    fr: 'AAC Poids super-lourds (M9S-M12S)', en: 'AAC Heavyweight (M9S-M12S)' },
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
  paliers.push({ cle: p.cle, fr: p.fr, en: p.en, ilvl: p.ilvl, emplacements: liste })
  console.log(`${p.cle}: ${liste.length} emplacements (ilvl ${p.ilvl})`)
}

await writeFile(new URL('raid.json', OUT), JSON.stringify({ paliers }))
console.log(`raid: ${paliers.length} paliers`)
