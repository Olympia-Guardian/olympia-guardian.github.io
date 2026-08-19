// ---------------------------------------------------------------------------
// Adresses de l'application.
//
// Une section = un CHEMIN, son onglet interne = l'ANCRE :
//   /                       le planning
//   /collections#mounts     les collections, onglet Montures
//   /journal#cards          Mon Journal, onglet Cartes
//   /groups#contacts        Groupes & Contacts, onglet Contacts
//   /progress · /market · /patch-notes · /guide · /account · /login · /admin
//
// GitHub Pages ne route rien côté serveur : chaque chemin ci-dessous doit
// exister en fichier. C'est `scripts/pages.mjs` qui les fabrique après le
// build, en copiant index.html — d'où l'obligation de garder CHEMINS et ce
// script d'accord entre eux. Un chemin oublié rendrait 404 au rechargement.
//
// Le hash sert donc à deux choses à la fois, distinguées par le signe égal :
// les parties SANS `=` sont l'ancre (l'onglet), celles AVEC restent des
// paramètres (#j=invitation, #c=contact, #login=jeton du retour OAuth). Ces
// derniers viennent de liens déjà partagés et de redirections enregistrées
// chez Google, Discord et XIVAuth : ils ne bougent pas.
// ---------------------------------------------------------------------------

import { KINDS, type Kind } from './api'

export type Tab =
  | 'planning'
  /** La section Collections, aucune collection choisie : /collections nu. */
  | 'collections'
  | Kind
  | 'fashion'
  | 'relics'
  | 'mypage'
  | 'market'
  | 'groups'
  | 'admin'
  | 'guide'
  | 'news'
  | 'account'
  | 'login'

/** Collections fusionnées de l'onglet « Mode » (accessoires, lunettes, coiffures). */
export const FASHION_KINDS: Kind[] = ['fashions', 'facewear', 'hairstyles']

/** Chemin → section. « collections » est à part : sa section est la collection
 *  nommée par l'ancre. */
const CHEMINS: Record<string, Tab> = {
  '': 'planning',
  progress: 'relics',
  journal: 'mypage',
  groups: 'groups',
  market: 'market',
  'patch-notes': 'news',
  guide: 'guide',
  account: 'account',
  login: 'login',
  admin: 'admin',
}

/** Section → chemin, pour écrire l'adresse. */
const PAR_TAB = new Map<Tab, string>(
  Object.entries(CHEMINS).map(([chemin, tab]) => [tab, chemin]) as [Tab, string][],
)

/** Anciens liens : #tab=… → chemin. Les collections y étaient nommées par leur
 *  `kind`, qui devient l'ancre de /collections. */
const ANCIENS: Record<string, Tab> = {
  planning: 'planning',
  relics: 'relics',
  mypage: 'mypage',
  market: 'market',
  groups: 'groups',
  news: 'news',
  guide: 'guide',
  account: 'account',
  login: 'login',
  admin: 'admin',
}

function estCollection(v: string): boolean {
  return v === 'fashion' || (KINDS as string[]).includes(v)
}

/** Collection normalisée : les trois familles de mode répondent « fashion ». */
function collection(v: string): Kind | 'fashion' | null {
  if (FASHION_KINDS.includes(v as Kind) || v === 'fashion') return 'fashion'
  return (KINDS as string[]).includes(v) ? (v as Kind) : null
}

/** Segment de chemin, sans les barres. '' à la racine. */
function segment(): string {
  return location.pathname.replace(/^\/+|\/+$/g, '')
}

/** Parties du hash portant un `=` : les paramètres (j, c, login…). */
function parametres(): string[] {
  return location.hash
    .replace(/^#/, '')
    .split('&')
    .filter((p) => p.includes('='))
}

/** L'ancre : la partie du hash sans `=`. Null s'il n'y en a pas. */
export function ancre(): string | null {
  const part = location.hash
    .replace(/^#/, '')
    .split('&')
    .find((p) => p.length > 0 && !p.includes('='))
  return part ?? null
}

/** Où l'adresse dit qu'on est. Une adresse inconnue ramène au planning : mieux
 *  vaut l'accueil qu'un écran vide. */
export function lireEmplacement(): Tab {
  const chemin = segment()
  if (chemin === 'collections') return collection(ancre() ?? '') ?? 'collections'
  return CHEMINS[chemin] ?? 'planning'
}

/** Sections qui ont un onglet interne : elles écrivent l'ancre elles-mêmes.
 *  Sans cette liste, l'écriture du chemin par App effacerait l'ancre que la vue
 *  vient de poser — les effets des enfants s'exécutent AVANT celui du parent,
 *  donc le parent aurait toujours le dernier mot. Les collections font
 *  exception : leur onglet EST leur section, et App le tient. */
const AVEC_ANCRE: Tab[] = ['mypage', 'groups']

/** Écrit l'adresse sans recharger. Les paramètres du hash sont conservés : une
 *  invitation en cours de traitement ne doit pas disparaître sous nos pieds.
 *  L'ancre d'une section qui n'en a pas est effacée, sinon celle de l'écran
 *  précédent traînerait derrière (/market#emotes). */
export function ecrireEmplacement(tab: Tab): void {
  const dansCollections = tab === 'collections' || estCollection(tab)
  const chemin = dansCollections ? 'collections' : (PAR_TAB.get(tab) ?? '')
  const anc = estCollection(tab)
    ? tab
    : tab === 'collections'
      ? null
      : AVEC_ANCRE.includes(tab)
        ? ancre()
        : null
  const parts = [...(anc ? [anc] : []), ...parametres()]
  const url = '/' + chemin + (parts.length > 0 ? '#' + parts.join('&') : '')
  if (url !== location.pathname + location.hash) history.replaceState(null, '', url)
}

/** Écrit la seule ancre, le chemin restant celui de la section affichée. */
export function ecrireAncre(valeur: string | null): void {
  const parts = [...(valeur ? [valeur] : []), ...parametres()]
  history.replaceState(
    null,
    '',
    location.pathname + (parts.length > 0 ? '#' + parts.join('&') : ''),
  )
}

/** Lien destiné à quelqu'un d'autre : invitation (#j=) ou contact (#c=).
 *  Toujours sur la RACINE du site, jamais sur `location.pathname`. Depuis que
 *  chaque section a son chemin, le même lien d'invitation copié depuis
 *  /collections, /journal ou /progress donnait trois adresses différentes ; il
 *  changeait sous les yeux de celui qui venait de le partager. La racine, elle,
 *  ne bouge pas, et c'est là que l'application lit ces paramètres. */
export function lienPartage(cle: 'j' | 'c', code: string): string {
  return `${location.origin}/#${cle}=${code}`
}

/** Traduit un ancien lien (#tab=…, #jtab=…, #gtab=…) vers la nouvelle adresse,
 *  AVANT le premier rendu. Rend true si l'adresse a changé. Ces liens ont été
 *  partagés et mis en favori : les casser serait perdre des visiteurs pour une
 *  question de forme. */
export function convertirAncienLien(): boolean {
  const brut = location.hash.replace(/^#/, '')
  if (!brut) return false
  const map = new Map<string, string>()
  for (const part of brut.split('&')) {
    const i = part.indexOf('=')
    if (i > 0) map.set(part.slice(0, i), part.slice(i + 1))
  }
  const t = map.get('tab')
  const jtab = map.get('jtab')
  const gtab = map.get('gtab')
  if (t === undefined && jtab === undefined && gtab === undefined) return false

  let chemin = segment()
  let anc: string | null = ancre()
  if (t !== undefined) {
    if (estCollection(t)) {
      chemin = 'collections'
      anc = collection(t)
    } else {
      chemin = PAR_TAB.get(ANCIENS[t] ?? 'planning') ?? ''
      anc = null
    }
  }
  // Les sous-onglets suivaient leur section : ils deviennent son ancre.
  if (jtab !== undefined && chemin === 'journal') anc = collection(jtab) ?? jtab
  if (gtab !== undefined && chemin === 'groups') anc = gtab

  map.delete('tab')
  map.delete('jtab')
  map.delete('gtab')
  // o= (coches manuelles) n'existe plus ; r= et g= sont convertis en groupes
  // par useGroups, qui les efface lui-même.
  map.delete('o')
  const parts = [
    ...(anc ? [anc] : []),
    ...[...map.entries()].map(([k, v]) => `${k}=${v}`),
  ]
  history.replaceState(
    null,
    '',
    '/' + chemin + (parts.length > 0 ? '#' + parts.join('&') : ''),
  )
  return true
}
