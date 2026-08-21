// Temps réel : WebSocket vers le salon de l'utilisateur (worker + Durable
// Object). À la réception d'un événement, l'App rafraîchit la donnée visée —
// cloche, fiche de perso, liste de groupes — sans attendre le poll de 90 s,
// qui reste en filet de secours si le socket tombe.

import { useEffect, useRef } from 'react'
import { WORKER_API } from './api'

export interface LiveEvent {
  t: 'inbox' | 'char' | 'groups'
  id?: number
}

const PING_MS = 45_000
const MAX_BACKOFF_MS = 30_000

/** L'état du direct, lisible par qui veut SANS s'abonner. Les timers de
 *  secours le consultent à chaque tour : un binding vivant suffit, une valeur
 *  React aurait re-rendu l'application entière à chaque coupure de réseau. */
export const etatLive = { connecte: false }

export function useLive(token: string | null, onEvent: (e: LiveEvent) => void) {
  // Le handler vit dans une ref : sa fraîcheur ne recrée pas la connexion.
  const handlerRef = useRef(onEvent)
  handlerRef.current = onEvent

  useEffect(() => {
    if (!token) return
    let ws: WebSocket | null = null
    let pingTimer: ReturnType<typeof setInterval> | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let backoff = 1000
    let closed = false

    const connect = () => {
      if (closed) return
      const url = `${WORKER_API.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(token)}`
      try {
        ws = new WebSocket(url)
      } catch {
        scheduleRetry()
        return
      }
      ws.onopen = () => {
        backoff = 1000
        etatLive.connecte = true
        pingTimer = setInterval(() => ws?.send('ping'), PING_MS)
      }
      ws.onmessage = (ev) => {
        if (typeof ev.data !== 'string' || ev.data === 'pong') return
        try {
          const e = JSON.parse(ev.data) as LiveEvent
          if (e && typeof e.t === 'string') handlerRef.current(e)
        } catch {
          // message inattendu : ignoré
        }
      }
      ws.onclose = () => {
        etatLive.connecte = false
        if (pingTimer) clearInterval(pingTimer)
        pingTimer = null
        scheduleRetry()
      }
      ws.onerror = () => {
        try {
          ws?.close()
        } catch {
          // déjà fermé
        }
      }
    }

    const scheduleRetry = () => {
      if (closed) return
      retryTimer = setTimeout(connect, backoff)
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
    }

    connect()
    return () => {
      closed = true
      if (pingTimer) clearInterval(pingTimer)
      if (retryTimer) clearTimeout(retryTimer)
      try {
        ws?.close()
      } catch {
        // déjà fermé
      }
    }
  }, [token])
}
