import { useEffect } from 'react'
import type { Character, Item, Kind } from './api'
import { localName, localSource, useI18n } from './i18n'
import type { Member } from './store'
import { AvatarStack, KindChip, TypeChip, itemIcon, onItemImgError } from './ui'

type Ready = Member & { data: Character }

export interface ShownItem {
  item: Item
  kind: Kind
}

/** Fiche d'un objet, dans le panneau de droite — le même que « Mon Journal ».
 *  Elle s'ouvrait auparavant en boîte au milieu de l'écran, par-dessus la
 *  grille : on perdait de vue la ligne d'où l'on venait, et il fallait fermer
 *  pour comparer avec l'objet suivant. Le panneau laisse la liste lisible et
 *  se remplace d'un clic sur un autre objet. */
export function ItemPanel({
  shown,
  ready,
  ownedSets,
  onClose,
}: {
  shown: ShownItem
  ready: Ready[]
  ownedSets: Map<number, Record<Kind, Set<number>>>
  onClose: () => void
}) {
  const { lang, t } = useI18n()
  const { item, kind } = shown

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const owners = ready.filter((m) => ownedSets.get(m.id)?.[kind].has(item.id))
  const missing = ready.filter((m) => !ownedSets.get(m.id)?.[kind].has(item.id))
  const description = lang === 'fr' ? item.description : item.descriptionEn
  const name = localName(item, lang)
  const otherName = lang === 'fr' ? item.nameEn : item.name

  return (
    <aside className="item-panel">
      <button className="icon-btn item-panel-close" title={t('close')} onClick={onClose}>
        ×
      </button>
      <img
        className="item-panel-image"
        src={itemIcon(kind, item.image)}
        alt=""
        loading="lazy"
        onError={onItemImgError}
      />
      <h3 className="item-panel-name">{name}</h3>
      {otherName !== name && <p className="modal-en">{otherName}</p>}
      <p className="modal-chips">
        <KindChip kind={kind} />
        {item.patch && <span className="chip chip-patch">{t('patch', { n: item.patch })}</span>}
        {item.unobtainable && (
          <span className="chip chip-unavail" title={t('unobtainableTitle')}>
            {t('unobtainableChip')}
          </span>
        )}
        {item.tradeable && (
          <span className="chip chip-hv" title={t('hvTitle')}>
            HV
          </span>
        )}
        {item.ownedPct && (
          <span className="chip chip-type" title={t('ownedPctTitle')}>
            {t('ofPlayers', { pct: item.ownedPct })}
          </span>
        )}
      </p>
      {description && <p className="modal-desc">{description}</p>}

      <h3 className="modal-h">{t('obtention')}</h3>
      {kind === 'achievements' ? (
        // Succès : le descriptif fait office de méthode ; ici les à-côtés.
        <ul className="modal-sources">
          {item.points !== undefined && <li>{t('achPoints', { n: item.points })}</li>}
          {item.group && <li>{lang === 'fr' ? item.group : (item.groupEn ?? item.group)}</li>}
          {item.reward && (
            <li>
              {t('achReward')} : 🏆 {lang === 'fr' ? item.reward : item.rewardEn}
            </li>
          )}
        </ul>
      ) : item.sources.length === 0 ? (
        <p className="modal-muted">{t('unknownSource')}</p>
      ) : (
        <ul className="modal-sources">
          {item.sources.map((s, i) => (
            <li key={i}>
              <TypeChip type={s.type} /> {localSource(s, lang)}
            </li>
          ))}
        </ul>
      )}

      {ready.length === 1 ? (
        <p className={owners.length > 0 ? 'relic-done' : 'modal-solo-missing'}>
          {t(owners.length > 0 ? 'soloOwned' : 'soloMissing')}
        </p>
      ) : (
        <>
          <h3 className="modal-h">{t('inGroup')}</h3>
          <div className="modal-group">
            <div className="modal-group-row">
              <span className="modal-muted">{t('ownedBy', { n: owners.length })}</span>
              {owners.length > 0 && <AvatarStack chars={owners.map((m) => m.data)} size={26} />}
            </div>
            <div className="modal-group-row">
              <span className="modal-muted">{t('missingBy', { n: missing.length })}</span>
              {missing.length > 0 && <AvatarStack chars={missing.map((m) => m.data)} size={26} />}
            </div>
          </div>
        </>
      )}
    </aside>
  )
}
