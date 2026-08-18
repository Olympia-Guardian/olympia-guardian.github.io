import { useEffect, useRef, useState } from 'react'
import { fetchCharacter, KINDS, WORKER_API, type Kind } from '../api'
import { authHeaders } from '../auth'
import { kindLabel, useI18n, type Lang } from '../i18n'
import type { Db } from '../store'
import { TabIcon } from '../ui'

// Page de compte : tout ce qui se règle, par opposition à Mon Journal, qui
// montre ce qu'on possède. Elle rassemble aussi les deux droits qu'on doit à
// quiconque nous confie des données — emporter et disparaître — qui n'avaient
// jusqu'ici aucune surface : seul l'administrateur pouvait effacer un compte.

interface Utilisateur {
  id: string
  name: string
  avatar?: string
}

/** Lecture d'un export FFXIV Collect. Leur fichier est un simple
 *  { "bardings": [105,106], … } et leurs identifiants sont les nôtres, nos
 *  catalogues venant de leur API : il n'y a aucune correspondance à établir,
 *  seulement à écarter ce qu'on ne connaît pas. */
export function lireExportCollect(
  texte: string,
  db: Db,
): { par: Partial<Record<Kind, number[]>>; inconnus: number } {
  const doc = JSON.parse(texte) as Record<string, unknown>
  const par: Partial<Record<Kind, number[]>> = {}
  let inconnus = 0
  for (const k of KINDS) {
    const brut = doc[k]
    if (!Array.isArray(brut)) continue
    const connus = new Set(db[k].map((it) => it.id))
    const gardes = brut.filter((id) => typeof id === 'number' && connus.has(id))
    inconnus += brut.length - gardes.length
    if (gardes.length > 0) par[k] = gardes
  }
  return { par, inconnus }
}

export function AccountPage({
  user,
  token,
  db,
  lang,
  setLang,
  chars,
  onImport,
  onLogout,
  onManageChars,
  spoil,
}: {
  user: Utilisateur
  token: string
  db: Db | null
  lang: Lang
  setLang: (l: Lang) => void
  /** Persos vérifiés : l'import doit savoir dans quel journal il verse. */
  chars: { id: number; name: string }[]
  onImport: (charId: number, par: Partial<Record<Kind, number[]>>) => Promise<void>
  onLogout: () => void
  onManageChars: () => void
  /** Anti-révélation : l'état courant et de quoi le changer. */
  spoil: { tout: boolean; basculer: (v: boolean) => void; msq: number | null }
}) {
  const { t } = useI18n()
  const fichier = useRef<HTMLInputElement>(null)
  // Un perso lie hors du groupe affiche n'a pas de nom sous la main : on va le
  // chercher (la fiche est en cache la plupart du temps) plutot que d'afficher
  // un numero brut dans le selecteur d'import.
  const [noms, setNoms] = useState<Record<number, string>>({})
  useEffect(() => {
    let annule = false
    for (const c of chars) {
      if (c.name || noms[c.id]) continue
      void fetchCharacter(c.id)
        .then((f) => !annule && setNoms((p) => ({ ...p, [c.id]: f.name })))
        .catch(() => undefined)
    }
    return () => {
      annule = true
    }
  }, [chars, noms])
  const nomDe = (c: { id: number; name: string }) => c.name || noms[c.id] || `#${c.id}`
  // Choix explicite seulement : les personnages arrivent après le premier
  // rendu, donc figer la cible ici la laisserait à zéro et l'import ne
  // partirait jamais — en silence, ce qui est le pire des cas.
  const [choisi, setChoisi] = useState<number | null>(null)
  const cible = choisi ?? chars[0]?.id ?? 0
  const [apercu, setApercu] = useState<{
    par: Partial<Record<Kind, number[]>>
    inconnus: number
  } | null>(null)
  const [etat, setEtat] = useState<'' | 'lecture' | 'envoi' | 'fait' | 'erreur'>('')
  const [suppression, setSuppression] = useState(false)
  const [nomFichier, setNomFichier] = useState('')

  async function choisirFichier(f: File | undefined) {
    if (!f || !db) return
    setEtat('lecture')
    try {
      setApercu(lireExportCollect(await f.text(), db))
      setEtat('')
    } catch {
      setApercu(null)
      setEtat('erreur')
    }
  }

  async function importer() {
    if (!apercu || !cible) {
      setEtat("erreur")
      return
    }
    setEtat('envoi')
    try {
      await onImport(cible, apercu.par)
      setEtat('fait')
      setApercu(null)
      setNomFichier('')
      if (fichier.current) fichier.current.value = ''
    } catch {
      setEtat('erreur')
    }
  }

  async function exporter() {
    const res = await fetch(`${WORKER_API}/me/export`, { headers: authHeaders(token) })
    if (!res.ok) return setEtat('erreur')
    const url = URL.createObjectURL(new Blob([await res.text()], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `codex-olympia-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function supprimer() {
    setEtat('envoi')
    try {
      const res = await fetch(`${WORKER_API}/me`, {
        method: 'DELETE',
        headers: authHeaders(token),
      })
      if (!res.ok) throw new Error('échec')
      onLogout()
    } catch {
      setEtat('erreur')
    }
  }

  const total = apercu
    ? Object.values(apercu.par).reduce((n, l) => n + (l?.length ?? 0), 0)
    : 0

  return (
    <div className="view account-view">
      <h2>
        <TabIcon k="account" /> {t('accountTitle')}
      </h2>

      <section className="group-card account-block">
        <h3>{t('accountIdentity')}</h3>
        <div className="account-row">
          {user.avatar && <img src={user.avatar} alt="" width={40} height={40} />}
          <span className="account-id">
            <b>{user.name}</b>
            <small className="muted">{user.id}</small>
          </span>
          <button className="btn btn-ghost btn-mini is-danger" onClick={onLogout}>
            <TabIcon k="logout" /> {t('logout')}
          </button>
        </div>
        <div className="account-row">
          <span>{t('accountLang')}</span>
          <span className="lang-switch">
            {(['fr', 'en'] as Lang[]).map((l) => (
              <button
                key={l}
                className={`lang-btn ${lang === l ? 'is-active' : ''}`}
                onClick={() => setLang(l)}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </span>
        </div>
      </section>

      <section className="group-card account-block">
        <h3>{t('accountChars')}</h3>
        <p className="muted">{t('accountCharsHint', { n: chars.length })}</p>
        <button className="btn btn-ghost btn-mini" onClick={onManageChars}>
          <TabIcon k="journal" /> {t('accountCharsManage')}
        </button>
      </section>

      <section className="group-card account-block">
        <h3>{t('spoilerSection')}</h3>
        <p className="muted">{t('spoilerToggleHint')}</p>
        <p className="muted">
          {spoil.msq === null ? t('spoilerUnknown') : t('spoilerState', { patch: spoil.msq })}
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={spoil.tout}
            onChange={(e) => spoil.basculer(e.target.checked)}
          />
          {t('spoilerToggle')}
        </label>
      </section>

      <section className="group-card account-block">
        <h3>{t('accountData')}</h3>
        <p className="muted">{t('accountDataWhat')}</p>
        <button className="btn btn-ghost btn-mini" onClick={() => void exporter()}>
          <TabIcon k="share" /> {t('accountExport')}
        </button>

        <h4 className="account-h4">{t('accountImport')}</h4>
        <p className="muted">{t('accountImportHint')}</p>
        {chars.length > 1 && (
          <select value={cible} onChange={(e) => setChoisi(Number(e.target.value))}>
            {chars.map((c) => (
              <option key={c.id} value={c.id}>
                {nomDe(c)}
              </option>
            ))}
          </select>
        )}
        <label className="account-file">
          <input
            ref={fichier}
            type="file"
            accept="application/json,.json"
            disabled={!db || chars.length === 0}
            onChange={(e) => {
              setNomFichier(e.target.files?.[0]?.name ?? '')
              void choisirFichier(e.target.files?.[0])
            }}
          />
          <span className="btn btn-ghost btn-mini">
            <TabIcon k="collect" /> {t('accountImportPick')}
          </span>
          {nomFichier && <span className="account-file-name">{nomFichier}</span>}
        </label>
        {/* Récapitulatif avant écriture : on ne verse rien dans un journal sans
            avoir dit ce qu'on y verse. */}
        {apercu && (
          <div className="account-preview">
            <p>
              <b>{t('accountImportFound', { n: total })}</b>
              {apercu.inconnus > 0 && ` · ${t('accountImportUnknown', { n: apercu.inconnus })}`}
            </p>
            <ul>
              {(Object.entries(apercu.par) as [Kind, number[]][]).map(([k, ids]) => (
                <li key={k}>
                  {kindLabel(lang, k)} : <b>{ids.length}</b>
                </li>
              ))}
            </ul>
            <p className="muted">{t('accountImportAddOnly')}</p>
            <button
              className="btn btn-primary btn-mini"
              disabled={etat === 'envoi' || total === 0}
              onClick={() => void importer()}
            >
              {etat === 'envoi' ? t('reportSending') : t('accountImportDo')}
            </button>
          </div>
        )}
        {etat === 'fait' && <p className="relic-done">{t('accountImportDone')}</p>}
        {etat === 'erreur' && <p className="notice">{t('accountError')}</p>}
      </section>

      <section className="group-card account-block account-danger">
        <h3>{t('accountDelete')}</h3>
        <p className="muted">{t('accountDeleteWhat')}</p>
        {!suppression ? (
          <button className="btn btn-ghost btn-mini is-danger" onClick={() => setSuppression(true)}>
            {t('accountDelete')}
          </button>
        ) : (
          <div className="account-confirm">
            <p>
              <b>{t('accountDeleteConfirm')}</b>
            </p>
            <button className="btn btn-ghost btn-mini" onClick={() => setSuppression(false)}>
              {t('crossNo')}
            </button>
            <button className="btn btn-mini is-danger" onClick={() => void supprimer()}>
              {t('accountDeleteYes')}
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
