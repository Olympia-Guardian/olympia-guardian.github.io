// Page « Groupes » : visualisation et configuration de tous ses groupes —
// création (online/offline), membres, invitations, demandes d'adhésion,
// renommage, rotation du lien, suppression. Le panneau latéral ne garde que
// la bascule rapide ; tout le reste se gère ici.

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  fetchCharacter,
  parseLodestoneId,
  KINDS,
  type Character,
  type RaidPalier,
} from '../api'
import type { ContactsController } from '../contacts'
import { ancre, ecrireAncre, lienPartage } from '../routes'
import type { GroupsController, Group } from '../groups'
import { apiGroupInvite, type ApiContact, type TypeGroupe } from '../groupsApi'
import { useI18n } from '../i18n'
import { TabIcon, onAvatarImgError } from '../ui'

/** Fiche légère d'un perso (nom + avatar), chargée à la demande. */
function useChar(charId: number): Character | null {
  const [char, setChar] = useState<Character | null>(null)
  useEffect(() => {
    let alive = true
    fetchCharacter(charId)
      .then((c) => alive && setChar(c))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [charId])
  return char
}

/** « Nouveau groupe », une question à la fois.
 *
 *  Le formulaire posait tout d'un coup : nom, ce que le groupe suit, le palier,
 *  les membres à reprendre, en ligne ou non, le personnage fondateur. Six
 *  sections empilées dans une petite fenêtre, dont la moitié ne servait pas au
 *  choix qu'on venait de faire.
 *
 *  Il avance donc par étapes, et chacune ne montre que ce qui reste à décider :
 *  un groupe de collection ne voit jamais de palier, et qui n'a qu'un seul
 *  personnage vérifié ne choisit pas lequel. */
export function GroupCreateDialog({
  verifiedIds,
  canOnline,
  paliers,
  repriseNom,
  repriseIds,
  onCreate,
  onClose,
}: {
  verifiedIds: number[]
  /** Connecté : les groupes en ligne (invitations) sont possibles. */
  canOnline: boolean
  /** Paliers de raid disponibles, null tant qu'ils chargent. */
  paliers: RaidPalier[] | null
  /** Groupe dont on peut reprendre les membres, s'il y en a un. */
  repriseNom?: string
  repriseIds?: number[]
  onCreate: (
    name: string,
    members: number[],
    online: boolean,
    type: TypeGroupe,
    tier?: string,
  ) => void
  onClose: () => void
}) {
  const { t, lang } = useI18n()
  const [etape, setEtape] = useState<'suit' | 'palier' | 'groupe'>('suit')
  const [name, setName] = useState('')
  const [online, setOnline] = useState(false)
  const [type, setType] = useState<TypeGroupe>('collection')
  const [tier, setTier] = useState('')
  // Un palier qui vient de sortir interesse plus que celui d'il y a trois ans :
  // la liste arrive du plus recent au plus ancien.
  const listePaliers = useMemo(() => [...(paliers ?? [])].reverse(), [paliers])
  // Reprise : tout le monde est coche au depart, on decoche qui ne suit pas.
  const [repris, setRepris] = useState<Set<number>>(() => new Set(repriseIds ?? []))
  const [charId, setCharId] = useState<number | null>(verifiedIds[0] ?? null)
  const [charNames, setCharNames] = useState<Record<number, string>>({})
  useEffect(() => {
    let alive = true
    for (const id of [...verifiedIds, ...(repriseIds ?? [])]) {
      fetchCharacter(id)
        .then((c) => alive && setCharNames((prev) => ({ ...prev, [id]: c.name })))
        .catch(() => alive && setCharNames((prev) => ({ ...prev, [id]: `#${id}` })))
    }
    return () => {
      alive = false
    }
  }, [verifiedIds])

  const palierChoisi = listePaliers.find((p) => p.cle === tier)

  function submit(e: FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    // Le perso fondateur et les membres repris forment une seule liste, sans
    // doublon si le fondateur faisait deja partie du groupe d'origine.
    const membres = [...new Set([...(charId !== null ? [charId] : []), ...repris])]
    onCreate(n, membres, online, type, type === 'raid' ? tier : undefined)
  }

  /** Ce qui est deja decide, en une ligne, avec de quoi y revenir. Sans elle,
   *  avancer par etapes ferait perdre de vue ce qu'on a choisi. */
  const fil = etape !== 'suit' && (
    <p className="group-fil">
      <button type="button" className="lien" onClick={() => setEtape('suit')}>
        {type === 'raid' ? t('followRaid') : t('followCollections')}
      </button>
      {type === 'raid' && palierChoisi && (
        <>
          <span aria-hidden="true">›</span>
          <button type="button" className="lien" onClick={() => setEtape('palier')}>
            {lang === 'fr' ? palierChoisi.fr : palierChoisi.en}
          </button>
        </>
      )}
    </p>
  )

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="modal group-create"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h2 className="modal-title">{t('createGroupTitle')}</h2>
        {fil}

        {/* 1. Ce que le groupe suit. Un clic, et la suite en decoule. */}
        {etape === 'suit' && (
          <div className="group-create-field">
            {t('groupFollows')}
            <button
              type="button"
              className="group-choix"
              onClick={() => {
                setType('collection')
                setEtape('groupe')
              }}
            >
              <b>
                <TabIcon k="collections" /> {t('followCollections')}
              </b>
              <small>{t('followCollectionsDesc')}</small>
            </button>
            <button
              type="button"
              className="group-choix"
              onClick={() => {
                setType('raid')
                setEtape(tier ? 'groupe' : 'palier')
              }}
            >
              <b>
                <TabIcon k="raid" /> {t('followRaid')}
              </b>
              <small>{t('followRaidDesc')}</small>
            </button>
          </div>
        )}

        {/* 2. Le palier, pour le raid seulement. */}
        {etape === 'palier' && (
          <div className="group-create-field">
            {t('raidTier')}
            {listePaliers.length === 0 && <p className="group-create-hint">{t('relicsLoading')}</p>}
            {listePaliers.map((p) => (
              <button
                key={p.cle}
                type="button"
                className="group-choix"
                onClick={() => {
                  setTier(p.cle)
                  setEtape('groupe')
                }}
              >
                <b>{lang === 'fr' ? p.fr : p.en}</b>
                <small>{p.etages.map((e) => e.court).join(' · ')}</small>
              </button>
            ))}
          </div>
        )}

        {/* 3. Le groupe lui-meme. Chaque champ ne parait que s'il y a un choix
            a faire : un seul perso verifie ne se choisit pas, et hors compte il
            n'y a pas de groupe en ligne a proposer. */}
        {etape === 'groupe' && (
          <>
            <label className="group-create-field">
              {t('createGroupName')}
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('createGroupNamePh')}
                spellCheck={false}
              />
            </label>

            {(repriseIds?.length ?? 0) > 0 && (
              <div className="group-create-field">
                {t('raidCarryOver', { nom: repriseNom ?? '' })}
                <div className="group-reprise">
                  {repriseIds!.map((id) => (
                    <label key={id} className="check">
                      <input
                        type="checkbox"
                        checked={repris.has(id)}
                        onChange={(e) =>
                          setRepris((prev) => {
                            const next = new Set(prev)
                            if (e.target.checked) next.add(id)
                            else next.delete(id)
                            return next
                          })
                        }
                      />
                      {charNames[id] ?? `#${id}`}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {canOnline ? (
              <div className="group-create-field">
                {t('createGroupType')}
                <label className="group-type-opt">
                  <input
                    type="radio"
                    name="grouptype"
                    checked={!online}
                    onChange={() => setOnline(false)}
                  />
                  <span>
                    <b>{t('typeOffline')}</b>
                    <small>{t('typeOfflineDesc')}</small>
                  </span>
                </label>
                <label className="group-type-opt">
                  <input
                    type="radio"
                    name="grouptype"
                    checked={online}
                    onChange={() => setOnline(true)}
                  />
                  <span>
                    <b>{t('typeOnline')}</b>
                    <small>{t('typeOnlineDesc')}</small>
                  </span>
                </label>
              </div>
            ) : (
              <p className="group-create-hint">{t('typeOnlineNeedLogin')}</p>
            )}

            {verifiedIds.length > 1 && (
              <label className="group-create-field">
                {t('createGroupChar')}
                <select
                  value={charId ?? ''}
                  onChange={(e) => setCharId(e.target.value ? Number(e.target.value) : null)}
                >
                  {verifiedIds.map((id) => (
                    <option key={id} value={id}>
                      {charNames[id] ?? `#${id}`}
                    </option>
                  ))}
                  <option value="">{t('createGroupNoFounder')}</option>
                </select>
              </label>
            )}
            {verifiedIds.length === 0 && (
              <p className="group-create-hint">{t('createGroupNoChar')}</p>
            )}
          </>
        )}

        <div className="group-create-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          {etape === 'groupe' && (
            <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
              {t('createGroupGo')}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

/** Pastille d'un membre : avatar + nom (+ surnom et retrait si autorisés).
 *  Quand un surnom est posé, c'est LUI qu'on affiche : c'est le nom sous lequel
 *  le groupe connaît la personne. Le nom du Lodestone reste au survol, sans
 *  quoi on ne saurait plus de quel perso il s'agit. */
function MemberChip({
  charId,
  alias,
  onRemove,
  onAlias,
}: {
  charId: number
  alias?: string
  onRemove?: () => void
  onAlias?: (nom: string) => void
}) {
  const { t } = useI18n()
  const char = useChar(charId)
  const vrai = char?.name ?? `#${charId}`
  return (
    <span className="member-chip">
      {char?.avatar && (
        <img src={char.avatar} alt="" width={24} height={24} onError={onAvatarImgError} />
      )}
      <span className="member-chip-name" title={alias ? vrai : undefined}>
        {alias ?? vrai}
      </span>
      {onAlias && (
        <button
          className="icon-btn"
          title={alias ? t('memberAliasOf', { name: vrai }) : t('memberAlias')}
          onClick={() => onAlias(vrai)}
        >
          <TabIcon k="rename" />
        </button>
      )}
      {onRemove && (
        <button className="icon-btn" title={t('removeMember')} onClick={onRemove}>
          ×
        </button>
      )}
    </span>
  )
}

/** Perso d'un ami : nom, avatar et complétion globale de ses collections. */
function FriendCharChip({ charId }: { charId: number }) {
  const char = useChar(charId)
  let pct: number | null = null
  if (char) {
    let count = 0
    let total = 0
    for (const k of KINDS) {
      if (!char[k].isPublic) continue
      count += char[k].count
      total += char[k].total
    }
    pct = total > 0 ? Math.round((count / total) * 100) : null
  }
  return (
    <span className="member-chip">
      {char?.avatar && (
        <img src={char.avatar} alt="" width={24} height={24} onError={onAvatarImgError} />
      )}
      <span className="member-chip-name">{char?.name ?? `#${charId}`}</span>
      {pct !== null && <span className="chip chip-type">{pct} %</span>}
    </span>
  )
}

/** Carte d'un ami : persos vérifiés + inviter dans un groupe / retirer / bloquer. */
function FriendCard({
  friend,
  grp,
  contacts,
  token,
}: {
  friend: ApiContact
  grp: GroupsController
  contacts: ContactsController
  token: string | null
}) {
  const { t } = useI18n()
  const myOnlineGroups = grp.groups.filter((g) => g.mine === 'owner' && g.shared)
  const [inviteGroup, setInviteGroup] = useState('')
  const [invited, setInvited] = useState(false)
  return (
    <div className="contact-card">
      <div className="contact-id">
        {friend.avatar && <img src={friend.avatar} alt="" width={32} height={32} />}
        <b>{friend.name}</b>
      </div>
      <div className="group-members contact-chars">
        {(friend.chars ?? []).map((id) => (
          <FriendCharChip key={id} charId={id} />
        ))}
        {(friend.chars ?? []).length === 0 && (
          <span className="modal-muted">{t('contactNoChars')}</span>
        )}
      </div>
      <div className="contact-actions">
        {myOnlineGroups.length > 0 && token && (
          <>
            <select value={inviteGroup} onChange={(e) => setInviteGroup(e.target.value)}>
              <option value="">{t('contactInvite')}</option>
              {myOnlineGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <button
              className="btn btn-primary btn-mini"
              disabled={!inviteGroup || invited}
              onClick={() =>
                void apiGroupInvite(token, inviteGroup, friend.userId)
                  .then(() => setInvited(true))
                  .catch((e) => alert(e instanceof Error ? e.message : String(e)))
              }
            >
              {invited ? t('contactInvited') : <TabIcon k="invite" />}
            </button>
          </>
        )}
        <button
          className="btn btn-ghost btn-mini"
          onClick={() => {
            if (confirm(t('contactRemoveConfirm', { name: friend.name })))
              void contacts.remove(friend.userId)
          }}
        >
          {t('contactRemove')}
        </button>
        <button
          className="btn btn-ghost btn-mini contact-block"
          onClick={() => {
            if (confirm(t('contactBlockConfirm', { name: friend.name })))
              void contacts.block(friend.userId)
          }}
        >
          <TabIcon k="block" /> {t('contactBlock')}
        </button>
      </div>
    </div>
  )
}

/** Section « Contacts » : mon lien, mes amis, demandes en cours, bloqués. */
function ContactsSection({
  grp,
  contacts,
  token,
}: {
  grp: GroupsController
  contacts: ContactsController
  token: string | null
}) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const d = contacts.data
  if (!d) return null
  return (
    <>
      <section className="relic-series group-card">
        <header className="relic-series-head">
          <h4 className="relic-series-name">🔗 {t('contactLinkTitle')}</h4>
        </header>
        <div className="contact-link-row">
          <input className="search contact-link-input" readOnly value={contacts.link ?? ''} />
          <button
            className="btn btn-primary btn-mini"
            onClick={() => {
              void navigator.clipboard?.writeText(contacts.link ?? '').then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              })
            }}
          >
            {copied ? '✓' : t('contactCopy')}
          </button>
          <button
            className="btn btn-ghost btn-mini"
            title={t('contactRotateTitle')}
            onClick={() => {
              if (confirm(t('contactRotateConfirm'))) void contacts.rotate()
            }}
          >
            <TabIcon k="rotate" />
          </button>
        </div>
      </section>

      {d.pendingIn.length > 0 && (
        <section className="relic-series group-card">
          <header className="relic-series-head">
            <h4 className="relic-series-name">📥 {t('contactPendingInTitle', { n: d.pendingIn.length })}</h4>
          </header>
          <div className="contact-rows">
            {d.pendingIn.map((p) => (
              <div key={p.userId} className="contact-row">
                {p.avatar && <img src={p.avatar} alt="" width={24} height={24} />}
                <b>{p.name}</b>
                <span className="contact-row-actions">
                  <button
                    className="btn btn-primary btn-mini"
                    onClick={() => void contacts.respond(p.userId, true)}
                  >
                    ✓ {t('requestApprove')}
                  </button>
                  <button
                    className="btn btn-ghost btn-mini"
                    onClick={() => void contacts.respond(p.userId, false)}
                  >
                    ✗ {t('requestReject')}
                  </button>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="relic-series group-card">
        <header className="relic-series-head">
          <h4 className="relic-series-name">👥 {t('contactFriendsTitle', { n: d.friends.length })}</h4>
        </header>
        {d.friends.length === 0 ? (
          <p className="modal-muted contact-empty">{t('contactFriendsEmpty')}</p>
        ) : (
          <div className="contact-rows">
            {d.friends.map((f) => (
              <FriendCard key={f.userId} friend={f} grp={grp} contacts={contacts} token={token} />
            ))}
          </div>
        )}
      </section>

      {d.pendingOut.length > 0 && (
        <section className="relic-series group-card">
          <header className="relic-series-head">
            <h4 className="relic-series-name">📤 {t('contactPendingOutTitle', { n: d.pendingOut.length })}</h4>
          </header>
          <div className="contact-rows">
            {d.pendingOut.map((p) => (
              <div key={p.userId} className="contact-row">
                <b>{p.name}</b>
                <span className="contact-row-actions">
                  <button
                    className="btn btn-ghost btn-mini"
                    onClick={() => void contacts.remove(p.userId)}
                  >
                    {t('contactCancel')}
                  </button>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {d.blocked.length > 0 && (
        <section className="relic-series group-card">
          <header className="relic-series-head">
            <h4 className="relic-series-name">🚫 {t('contactBlockedTitle', { n: d.blocked.length })}</h4>
          </header>
          <div className="contact-rows">
            {d.blocked.map((b) => (
              <div key={b.userId} className="contact-row">
                <b>{b.name}</b>
                <span className="contact-row-actions">
                  <button
                    className="btn btn-ghost btn-mini"
                    onClick={() => void contacts.unblock(b.userId)}
                  >
                    {t('contactUnblock')}
                  </button>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

/** Ligne d'une demande d'adhésion, côté créateur. */
function RequestRow({
  charId,
  userName,
  onAction,
}: {
  charId: number
  userName: string
  onAction: (action: 'approve' | 'reject' | 'ban') => void
}) {
  const { t } = useI18n()
  const char = useChar(charId)
  return (
    <div className="request-row">
      <span className="request-who">
        {char?.avatar && (
          <img src={char.avatar} alt="" width={22} height={22} onError={onAvatarImgError} />
        )}
        <b>{char?.name ?? `#${charId}`}</b>
        <span className="request-user">{userName}</span>
      </span>
      <span className="request-actions">
        <button className="btn btn-primary btn-mini" onClick={() => onAction('approve')}>
          ✓ {t('requestApprove')}
        </button>
        <button className="btn btn-ghost btn-mini" onClick={() => onAction('reject')}>
          ✗ {t('requestReject')}
        </button>
        <button
          className="btn btn-ghost btn-mini request-ban"
          title={t('requestBanTitle')}
          onClick={() => {
            if (confirm(t('requestBanConfirm', { name: userName }))) onAction('ban')
          }}
        >
          <TabIcon k="block" />
        </button>
      </span>
    </div>
  )
}

/** Carte de gestion d'un groupe. */
function GroupCard({
  g,
  grp,
  verifiedIds,
  isActive,
  contacts,
  myUserId,
}: {
  g: Group
  grp: GroupsController
  verifiedIds: number[]
  isActive: boolean
  contacts: ContactsController
  myUserId: string | null
}) {
  const { t } = useI18n()
  const [input, setInput] = useState('')
  const [inputError, setInputError] = useState(false)
  const [copied, setCopied] = useState(false)
  const canEdit = g.mine === 'owner' || g.id.startsWith('loc-')
  const canRemove = (id: number) =>
    canEdit || (g.mine === 'member' && verifiedIds.includes(id))

  function addManual(e: FormEvent) {
    e.preventDefault()
    const id = parseLodestoneId(input)
    if (id === null) {
      setInputError(true)
      return
    }
    setInputError(false)
    setInput('')
    void grp.addMember(g.id, id)
  }

  async function copyLink() {
    try {
      const link = await grp.share(g.id)
      try {
        await navigator.clipboard.writeText(link)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {
        prompt(t('copyPrompt'), link)
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    }
  }

  async function rotate() {
    if (!confirm(t('rotateConfirm'))) return
    try {
      const link = await grp.rotateInvite(g.id)
      // Échec déjà signalé dans le bandeau d'erreur : rien à copier.
      if (!link) return
      try {
        await navigator.clipboard.writeText(link)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {
        prompt(t('copyPrompt'), link)
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    }
  }

  // Meme droit que le retrait : le chef du groupe, ou le proprietaire verifie
  // du perso. Personne d'autre n'a affaire a ce personnage.
  function surnommer(charId: number, vrai: string) {
    const saisi = prompt(t('memberAliasPrompt', { name: vrai }), g.aliases?.[charId] ?? '')
    if (saisi === null) return
    void grp.setAlias(g.id, charId, saisi.trim())
  }

  function renameGroup() {
    const name = prompt(t('groupNamePrompt'), g.name)?.trim()
    if (name && name !== g.name) void grp.rename(g.id, name)
  }

  function dropGroup() {
    const msg = canEdit
      ? t('groupDeleteConfirm', { name: g.name })
      : t('groupLeaveConfirm', { name: g.name })
    if (confirm(msg)) void grp.drop(g.id)
  }

  return (
    <section className={`relic-series group-card ${isActive ? 'is-active-group' : ''}`}>
      <header className="relic-series-head">
        <h4 className="relic-series-name">
          {g.shared ? '🔗' : '📁'} {g.name}
        </h4>
        <span className="chip chip-type">{t(g.shared ? 'typeOnline' : 'typeOffline')}</span>
        <span className="chip chip-type">
          {t(canEdit ? 'groupOwnerChip' : g.mine === 'member' ? 'groupMemberChip' : 'groupGuestChip')}
        </span>
        {isActive ? (
          <span className="chip chip-owned">{t('groupActive')}</span>
        ) : (
          <button className="btn btn-ghost btn-mini" onClick={() => grp.setActive(g.id)}>
            {t('groupUse')}
          </button>
        )}
        <span className="group-card-spacer" />
        {canEdit && (
          <button className="btn btn-ghost btn-mini" onClick={renameGroup}>
            <TabIcon k="rename" /> {t('groupRenameShort')}
          </button>
        )}
        <button className="btn btn-ghost btn-mini group-drop" onClick={dropGroup}>
          {canEdit ? <><TabIcon k="del" /> {t('groupDeleteShort')}</> : <><TabIcon k="unlink" /> {t('groupLeaveShort')}</>}
        </button>
      </header>

      {/* Membres */}
      <div className="group-members">
        {g.members.length === 0 && <span className="muted-note">{t('groupNoMembers')}</span>}
        {g.members.map((id) => (
          <MemberChip
            key={id}
            charId={id}
            alias={g.aliases?.[id]}
            onRemove={canRemove(id) ? () => void grp.removeMember(g.id, id) : undefined}
            onAlias={canRemove(id) ? (vrai) => surnommer(id, vrai) : undefined}
          />
        ))}
      </div>

      {/* Comptes du groupe online : ajout en contact des co-membres */}
      {g.shared && (g.memberUsers?.some((u) => u.userId !== myUserId) ?? false) && (
        <div className="group-accounts">
          <span className="group-invite-label">{t('groupAccounts')}</span>
          {g.memberUsers!
            .filter((u) => u.userId !== myUserId)
            .map((u) => {
              const isFriend = contacts.data?.friends.some((f) => f.userId === u.userId) ?? false
              const isPending =
                contacts.data?.pendingOut.some((p) => p.userId === u.userId) ?? false
              return (
                <span key={u.userId} className="member-chip">
                  <span className="member-chip-name">{u.name}</span>
                  {isFriend ? (
                    <span title={t('contactAlreadyChip')}>👥</span>
                  ) : isPending ? (
                    <span title={t('contactPendingChip')}>⏳</span>
                  ) : (
                    <button
                      className="icon-btn"
                      title={t('contactAddFromGroup', { name: u.name })}
                      onClick={() =>
                        void contacts
                          .request({ userId: u.userId })
                          .catch((e) => alert(e instanceof Error ? e.message : String(e)))
                      }
                    >
                      <TabIcon k="addfriend" />
                    </button>
                  )}
                </span>
              )
            })}
        </div>
      )}

      {/* Hors ligne (créateur) : ajout libre par ID/URL Lodestone */}
      {!g.shared && canEdit && (
        <form className="group-add-form" onSubmit={addManual}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('addPlaceholder')}
            spellCheck={false}
          />
          <button type="submit" className="btn btn-primary btn-mini">
            {t('add')}
          </button>
          {inputError && <span className="add-error">{t('addError')}</span>}
        </form>
      )}

      {/* En ligne (créateur) : lien d'invitation + demandes */}
      {g.shared && g.mine === 'owner' && (
        <div className="group-invite-block">
          <span className="group-invite-label">{t('inviteLinkLabel')}</span>
          <code className="group-invite-code">
            {g.inviteCode ? lienPartage('j', g.inviteCode) : '…'}
          </code>
          <button className="btn btn-ghost btn-mini" onClick={copyLink}>
            {copied ? t('copied') : <><TabIcon k="share" /> {t('copyShort')}</>}
          </button>
          <button className="btn btn-ghost btn-mini" title={t('rotateConfirm')} onClick={rotate}>
            <TabIcon k="rotate" />
          </button>
        </div>
      )}
      {g.shared && g.mine === 'owner' && (g.requests?.length ?? 0) > 0 && (
        <div className="requests-box">
          <p className="requests-title">{t('requestsTitle', { n: g.requests!.length })}</p>
          {g.requests!.map((r) => (
            <RequestRow
              key={r.userId}
              charId={r.charId}
              userName={r.userName}
              onAction={(action) => void grp.handleRequest(g.id, r.userId, action)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export function GroupsPage({
  grp,
  paliers,
  verifiedIds,
  canOnline,
  contacts,
  token,
  myUserId,
}: {
  grp: GroupsController
  paliers: RaidPalier[] | null
  verifiedIds: number[]
  canOnline: boolean
  contacts: ContactsController
  token: string | null
  myUserId: string | null
}) {
  const { t } = useI18n()
  const [creating, setCreating] = useState(false)
  // Onglet courant (Groupes / Contacts) — dans l'ancre pour survivre au reload.
  // Les contacts n'existent qu'avec un compte : sans jeton, useContacts n'a
  // rien à demander et l'onglet ne pouvait afficher qu'un vide.
  const [section, setSection] = useState<'groups' | 'contacts'>(() =>
    ancre() === 'contacts' && token ? 'contacts' : 'groups',
  )
  useEffect(() => {
    ecrireAncre(section === 'groups' ? null : section)
  }, [section])

  return (
    <div className="view groups-page">
      {token && (
        <nav className="kind-bar groups-tabs">
          <button
            className={`kind-btn ${section === 'groups' ? 'is-active' : ''}`}
            onClick={() => setSection('groups')}
          >
            <TabIcon k="groups" /> {t('groupsSection')}
          </button>
          <button
            className={`kind-btn ${section === 'contacts' ? 'is-active' : ''}`}
            onClick={() => setSection('contacts')}
          >
            <TabIcon k="contacts" /> {t('contactsSection')}
          </button>
        </nav>
      )}
      <div className="groups-head">
        <h2 className="groups-title">
          {t(section === 'groups' ? 'groupsSection' : 'contactsSection')}
        </h2>
        {section === 'groups' && (
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <TabIcon k="newgroup" /> {t('createGroupTitle')}
          </button>
        )}
      </div>

      {section === 'groups' && grp.pending.length > 0 && (
        <section className="relic-series group-card">
          <header className="relic-series-head">
            <h4 className="relic-series-name">⏳ {t('pendingSentTitle')}</h4>
          </header>
          <div className="group-members">
            {grp.pending.map((p) => (
              <span key={p.code} className="member-chip">
                <span className="member-chip-name">{t('pendingEntry', { name: p.name })}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {section === 'groups' && grp.groups.length === 0 && (
        <p className="empty">{t('groupsEmpty')}</p>
      )}
      {section === 'groups' &&
        grp.groups.map((g) => (
        <GroupCard
          key={g.id}
          g={g}
          grp={grp}
          verifiedIds={verifiedIds}
          isActive={g.id === grp.activeId}
          contacts={contacts}
          myUserId={myUserId}
        />
        ))}

      {section === 'contacts' && token && (
        <ContactsSection grp={grp} contacts={contacts} token={token} />
      )}
      {section === 'contacts' && !token && <p className="empty">{t('contactGuestPage')}</p>}

      {creating && (
        <GroupCreateDialog
          verifiedIds={verifiedIds}
          canOnline={canOnline}
          paliers={paliers}
          repriseNom={grp.active?.name}
          repriseIds={grp.active?.members}
          onCreate={(name, members, online, type, tier) => {
            setCreating(false)
            void grp.create(name, members, online, type, tier).catch((e) =>
              alert(e instanceof Error ? e.message : String(e)),
            )
          }}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  )
}
