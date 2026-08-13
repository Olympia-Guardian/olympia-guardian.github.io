// Contacts : amis, demandes en cours, blacklist et mon lien de contact.
// Chargé à la connexion, rafraîchi après chaque action (et exposé à la page
// « Groupes & Contacts » comme aux fiches de groupe pour « ajouter en contact »).

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  apiBlock,
  apiContactPreview,
  apiContacts,
  apiRemoveContact,
  apiRequestContact,
  apiRespondContact,
  apiRotateContactCode,
  apiUnblock,
  type ApiContacts,
  type ContactStatus,
} from './groupsApi'
import { readHashParam, setHashParam } from './store'

export interface ContactsController {
  data: ApiContacts | null
  refresh: () => Promise<void>
  /** Lien de contact à partager (#c=…). */
  link: string | null
  rotate: () => Promise<void>
  request: (target: { code: string } | { userId: string }) => Promise<string>
  respond: (userId: string, accept: boolean) => Promise<void>
  remove: (userId: string) => Promise<void>
  block: (userId: string) => Promise<void>
  unblock: (userId: string) => Promise<void>
}

export function contactLink(code: string): string {
  return `${location.origin}${location.pathname}#c=${code}`
}

/** Lien de contact ouvert (#c=…) : pilote le bandeau « Ajouter X ? ». */
export interface ContactInvite {
  code: string
  name: string
  avatar: string
  status: ContactStatus
}

export function useContactInvite(token: string | null) {
  const [invite, setInvite] = useState<ContactInvite | null>(null)
  useEffect(() => {
    const code = readHashParam('c')
    if (!code) return
    let alive = true
    apiContactPreview(code, token)
      .then((p) => alive && setInvite({ code, ...p }))
      .catch(() => alive && setInvite(null))
    return () => {
      alive = false
    }
  }, [token])
  return {
    invite,
    dismiss: () => {
      setInvite(null)
      setHashParam('c', null)
    },
    markPending: () =>
      setInvite((v) => (v ? { ...v, status: 'pending' as ContactStatus } : v)),
  }
}

export function useContacts(token: string | null): ContactsController {
  const [data, setData] = useState<ApiContacts | null>(null)
  const tokenRef = useRef(token)
  tokenRef.current = token

  const refresh = useCallback(async () => {
    const tok = tokenRef.current
    if (!tok) {
      setData(null)
      return
    }
    try {
      setData(await apiContacts(tok))
    } catch {
      // hors-ligne : on garde l'état courant
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [token, refresh])

  const rotate = useCallback(async () => {
    if (!tokenRef.current) return
    await apiRotateContactCode(tokenRef.current)
    await refresh()
  }, [refresh])

  const request = useCallback(
    async (target: { code: string } | { userId: string }) => {
      if (!tokenRef.current) throw new Error('non connecté')
      const r = await apiRequestContact(tokenRef.current, target)
      await refresh()
      return r.status
    },
    [refresh],
  )

  const respond = useCallback(
    async (userId: string, accept: boolean) => {
      if (!tokenRef.current) return
      await apiRespondContact(tokenRef.current, userId, accept)
      await refresh()
    },
    [refresh],
  )

  const remove = useCallback(
    async (userId: string) => {
      if (!tokenRef.current) return
      await apiRemoveContact(tokenRef.current, userId)
      await refresh()
    },
    [refresh],
  )

  const block = useCallback(
    async (userId: string) => {
      if (!tokenRef.current) return
      await apiBlock(tokenRef.current, userId)
      await refresh()
    },
    [refresh],
  )

  const unblock = useCallback(
    async (userId: string) => {
      if (!tokenRef.current) return
      await apiUnblock(tokenRef.current, userId)
      await refresh()
    },
    [refresh],
  )

  return {
    data,
    refresh,
    link: data ? contactLink(data.code) : null,
    rotate,
    request,
    respond,
    remove,
    block,
    unblock,
  }
}
