// Client des routes /groups du worker (voir worker/index.js, section groupes).
// Toutes les fonctions jettent en cas d'erreur HTTP — l'appelant décide.

import { WORKER_API } from './api'
import { authHeaders } from './auth'

export interface ApiGroupRequest {
  userId: string
  userName: string
  charId: number
  created: number
}

export interface ApiGroup {
  id: string
  name: string
  shared: boolean
  updated: number
  mine: 'owner' | 'member' | 'guest'
  members: number[]
  /** Code du lien d'invitation — présent pour le propriétaire uniquement. */
  inviteCode?: string
  /** Demandes d'adhésion en attente — propriétaire uniquement. */
  requests?: ApiGroupRequest[]
  /** Comptes des co-membres (groupes online) — sert à « ajouter en contact ». */
  memberUsers?: { userId: string; name: string }[]
}

export type InviteStatus = 'none' | 'pending' | 'member'

async function call<T>(
  path: string,
  token: string | null,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  // Sans délai d'expiration, une requête suspendue laissait les boutons
  // désactivés indéfiniment : l'utilisateur n'avait plus qu'à recharger.
  let res: Response
  try {
    res = await fetch(`${WORKER_API}${path}`, {
      method: init?.method ?? 'GET',
      headers: token ? authHeaders(token) : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(15000),
    })
  } catch (e) {
    const nom = e instanceof Error ? e.name : ''
    throw new Error(nom === 'TimeoutError' ? 'timeout' : 'offline')
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      msg = (await res.json())?.error ?? msg
    } catch {
      // corps non JSON
    }
    throw new Error(msg)
  }
  return res.json() as Promise<T>
}

export function apiListGroups(token: string): Promise<{ groups: ApiGroup[] }> {
  return call('/groups', token)
}

export function apiCreateGroup(
  token: string,
  name: string,
  members: number[],
  shared = false,
): Promise<ApiGroup> {
  return call('/groups', token, { method: 'POST', body: { name, members, shared } })
}

export function apiGetGroup(id: string, token: string | null): Promise<ApiGroup> {
  return call(`/group/${id}`, token)
}

export function apiPatchGroup(
  token: string,
  id: string,
  patch: { name?: string; shared?: boolean },
): Promise<ApiGroup> {
  return call(`/group/${id}`, token, { method: 'PATCH', body: patch })
}

export function apiDeleteGroup(token: string, id: string): Promise<{ ok: true }> {
  return call(`/group/${id}`, token, { method: 'DELETE' })
}

export function apiJoinGroup(token: string, id: string, charId?: number): Promise<ApiGroup> {
  return call(`/group/${id}/join`, token, { method: 'POST', body: charId ? { charId } : {} })
}

export function apiQuitGroup(token: string, id: string): Promise<{ ok: true }> {
  return call(`/group/${id}/link`, token, { method: 'DELETE' })
}

export function apiAddMember(token: string, id: string, charId: number): Promise<ApiGroup> {
  return call(`/group/${id}/members`, token, { method: 'POST', body: { charId } })
}

export function apiRemoveMember(token: string, id: string, charId: number): Promise<ApiGroup> {
  return call(`/group/${id}/member/${charId}`, token, { method: 'DELETE' })
}

/** Ce que voit un porteur du lien : le nom du groupe et son propre statut. */
export function apiGetInvite(
  code: string,
  token: string | null,
): Promise<{ name: string; status: InviteStatus }> {
  return call(`/invite/${code}`, token)
}

export function apiRequestJoin(
  token: string,
  code: string,
  charId: number,
): Promise<{ status: InviteStatus }> {
  return call(`/invite/${code}/request`, token, { method: 'POST', body: { charId } })
}

export function apiHandleRequest(
  token: string,
  groupId: string,
  userId: string,
  action: 'approve' | 'reject' | 'ban',
): Promise<{ ok: true }> {
  return call(`/group/${groupId}/requests/${encodeURIComponent(userId)}`, token, {
    method: 'POST',
    body: { action },
  })
}

export function apiRotateInvite(token: string, groupId: string): Promise<{ inviteCode: string }> {
  return call(`/group/${groupId}/rotate`, token, { method: 'POST' })
}

// ------------------------------------------------------------- suggestions

export interface ApiSuggestion {
  id: number
  charId: number
  kind: string
  itemId: number
  from: string
  created: number
}

/** Propose des objets pour le perso d'un autre membre d'un groupe online. */
export function apiSuggest(
  token: string,
  charId: number,
  items: { kind: string; itemId: number }[],
): Promise<{ created: number; skipped: number }> {
  return call('/suggest', token, { method: 'POST', body: { charId, items } })
}

export function apiListSuggestions(token: string): Promise<{ suggestions: ApiSuggestion[] }> {
  return call('/suggestions', token)
}

/** Suggestion envoyée, en attente chez le destinataire. */
export interface ApiSentSuggestion {
  id: number
  charId: number
  kind: string
  itemId: number
  created: number
}

/** Mes suggestions en attente : affichées « cochées » chez le destinataire. */
export function apiListSentSuggestions(token: string): Promise<{ sent: ApiSentSuggestion[] }> {
  return call('/suggestions/sent', token)
}

/** Résultat de la recherche Lodestone par nom (assistant de liaison). */
export interface CharSearchResult {
  id: number
  avatar: string
  name: string
  server: string
  dc: string
}

export function apiSearchCharacter(
  token: string,
  name: string,
  server?: string,
): Promise<{ results: CharSearchResult[] }> {
  const q = new URLSearchParams({ name })
  if (server) q.set('server', server)
  return call(`/search-character?${q.toString()}`, token)
}

// ---------------------------------------------------------------- contacts

export interface ApiContact {
  userId: string
  name: string
  avatar: string
  /** Persos vérifiés (amis seulement — la fiche contact montre leur avancée). */
  chars?: number[]
  created?: number
}

export interface ApiContacts {
  friends: ApiContact[]
  pendingIn: ApiContact[]
  pendingOut: ApiContact[]
  blocked: { userId: string; name: string }[]
  /** Mon code de contact (lien #c=…). */
  code: string
}

export interface ApiFriendRequest {
  userId: string
  name: string
  avatar: string
  created: number
}

export interface ApiGroupInvite {
  groupId: string
  groupName: string
  from: string
  created: number
}

/** Tout ce que porte la cloche, en un appel. */
export interface ApiInbox {
  suggestions: ApiSuggestion[]
  sent: ApiSentSuggestion[]
  friendRequests: ApiFriendRequest[]
  groupInvites: ApiGroupInvite[]
}

export function apiInbox(token: string): Promise<ApiInbox> {
  return call('/inbox', token)
}

export function apiContacts(token: string): Promise<ApiContacts> {
  return call('/contacts', token)
}

export function apiRotateContactCode(token: string): Promise<{ code: string }> {
  return call('/contacts/rotate', token, { method: 'POST', body: {} })
}

export type ContactStatus = 'none' | 'pending' | 'pendingIn' | 'friend' | 'self'

export function apiContactPreview(
  code: string,
  token: string | null,
): Promise<{ name: string; avatar: string; status: ContactStatus }> {
  return call(`/contact/${encodeURIComponent(code)}`, token)
}

/** Demande d'ami — par code de contact OU par compte d'un groupe online commun. */
export function apiRequestContact(
  token: string,
  target: { code: string } | { userId: string },
): Promise<{ status: string }> {
  return call('/contacts/request', token, { method: 'POST', body: target })
}

export function apiRespondContact(
  token: string,
  userId: string,
  accept: boolean,
): Promise<{ ok: true }> {
  return call('/contacts/respond', token, { method: 'POST', body: { userId, accept } })
}

export function apiRemoveContact(token: string, userId: string): Promise<{ ok: true }> {
  return call(`/contacts/${encodeURIComponent(userId)}`, token, { method: 'DELETE' })
}

export function apiBlock(token: string, userId: string): Promise<{ ok: true }> {
  return call('/blocks', token, { method: 'POST', body: { userId } })
}

export function apiUnblock(token: string, userId: string): Promise<{ ok: true }> {
  return call(`/blocks/${encodeURIComponent(userId)}`, token, { method: 'DELETE' })
}

/** Invitation directe d'un ami dans un de mes groupes online. */
export function apiGroupInvite(
  token: string,
  groupId: string,
  userId: string,
): Promise<{ status: string }> {
  return call(`/group/${groupId}/invite`, token, { method: 'POST', body: { userId } })
}

export function apiRespondGroupInvite(
  token: string,
  groupId: string,
  accept: boolean,
  charId?: number,
): Promise<{ ok: true }> {
  return call('/group-invites/respond', token, {
    method: 'POST',
    body: { groupId, accept, ...(charId ? { charId } : {}) },
  })
}

export function apiResolveSuggestions(
  token: string,
  ids: number[],
  accept: boolean,
): Promise<{ accepted: number; dismissed: number }> {
  return call('/suggestions/resolve', token, { method: 'POST', body: { ids, accept } })
}
