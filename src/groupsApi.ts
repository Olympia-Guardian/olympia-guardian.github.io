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
}

export type InviteStatus = 'none' | 'pending' | 'member'

async function call<T>(
  path: string,
  token: string | null,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`${WORKER_API}${path}`, {
    method: init?.method ?? 'GET',
    headers: token ? authHeaders(token) : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
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
