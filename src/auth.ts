// Comptes : session OGS adossée au worker (OAuth Discord). Le jeton revient
// dans le hash (#login=...) après le tour chez Discord ; on le range en
// localStorage et on restaure le hash de groupe sauvegardé avant le départ.

import { useCallback, useEffect, useState } from 'react'
import { WORKER_API } from './api'
import { setHashParam } from './store'

export interface Binding {
  charId: number
  verified: boolean
  code?: string
}

export interface SessionUser {
  id: string
  name: string
  avatar: string
}

const TOKEN_KEY = 'ogs.session.v1'
const PRELOGIN_KEY = 'ogs.prelogin.v1'

/** À appeler avant toute lecture du hash : capture #login=… et restaure le
 *  hash de groupe pré-connexion. Retourne le jeton s'il y en a un. */
export function captureLoginToken(): string | null {
  const match = location.hash.match(/login=([\w-]+)/)
  if (match) {
    try {
      localStorage.setItem(TOKEN_KEY, match[1])
      const prev = localStorage.getItem(PRELOGIN_KEY) ?? ''
      localStorage.removeItem(PRELOGIN_KEY)
      history.replaceState(null, '', location.pathname + location.search + prev)
    } catch {
      setHashParam('login', null)
    }
  }
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` }
}

export function useAuth() {
  const [token, setToken] = useState<string | null>(captureLoginToken)
  const [user, setUser] = useState<SessionUser | null>(null)
  const [bindings, setBindings] = useState<Binding[]>([])

  const refresh = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`${WORKER_API}/me`, { headers: authHeaders(token) })
      if (res.status === 401) {
        try {
          localStorage.removeItem(TOKEN_KEY)
        } catch {
          // rien
        }
        setToken(null)
        setUser(null)
        setBindings([])
        return
      }
      if (!res.ok) return
      const me = await res.json()
      setUser(me.user)
      setBindings(me.bindings ?? [])
    } catch {
      // hors-ligne : on garde le jeton, on réessaiera
    }
  }, [token])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const login = useCallback(() => {
    try {
      localStorage.setItem(PRELOGIN_KEY, location.hash)
    } catch {
      // le hash de groupe sera perdu, pas la session
    }
    const ret = encodeURIComponent(location.origin + location.pathname)
    location.href = `${WORKER_API}/auth/discord?return=${ret}`
  }, [])

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      // rien
    }
    setToken(null)
    setUser(null)
    setBindings([])
  }, [])

  const bind = useCallback(
    async (charId: number): Promise<Binding> => {
      if (!token) throw new Error('non connecté')
      const res = await fetch(`${WORKER_API}/bind`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ charId }),
      })
      if (res.status === 409) throw new Error('conflict')
      if (!res.ok) throw new Error(`bind ${res.status}`)
      const b = await res.json()
      await refresh()
      return b
    },
    [token, refresh],
  )

  const verifyBind = useCallback(
    async (charId: number): Promise<boolean> => {
      if (!token) throw new Error('non connecté')
      const res = await fetch(`${WORKER_API}/bind/verify`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ charId }),
      })
      if (res.ok) {
        await refresh()
        return true
      }
      if (res.status === 422) return false
      if (res.status === 409) throw new Error('conflict')
      throw new Error(`verify ${res.status}`)
    },
    [token, refresh],
  )

  const saveCollections = useCallback(
    async (charId: number, partial: Record<string, number[]>): Promise<void> => {
      if (!token) throw new Error('non connecté')
      const res = await fetch(`${WORKER_API}/character/${charId}/collections`, {
        method: 'PUT',
        headers: authHeaders(token),
        body: JSON.stringify(partial),
      })
      if (!res.ok) throw new Error(`save ${res.status}`)
    },
    [token],
  )

  return { token, user, bindings, login, logout, refresh, bind, verifyBind, saveCollections }
}
