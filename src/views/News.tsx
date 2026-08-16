import { useMemo, useState } from 'react'
import type { Character, Item, Kind } from '../api'
import { kindLabel, useI18n } from '../i18n'
import { patchList, patchNews, patchNotesUrl } from '../news'
import type { Db } from '../store'
import { onItemImgError, TabIcon } from '../ui'

// Les notes de patch du collectionneur : pas celles de Square Enix, qui parlent
// d'équilibrage et de donjons, mais ce que la mise à jour a ajouté aux
// quatorze collections suivies ici. Le lien vers les notes officielles est en
// tête pour le reste.

/** Au-delà, la page devient un mur : le patch 7.5 a ajouté 367 tenues à lui
 *  seul. Le bouton « voir dans la collection » prend le relais, avec ses
 *  filtres, son tri et la grille du groupe. */
const MAX_CARTES = 24

export function NewsPage({
  db,
  chars,
  onShowItem,
  onOpenCollection,
}: {
  db: Db | null
  /** Persos suivis et vérifiés : ce sont eux qui donnent le « à trouver ». */
  chars: { data: Character }[]
  onShowItem: (item: Item, kind: Kind) => void
  /** Ouvre la collection restreinte aux objets de ce patch. */
  onOpenCollection: (kind: Kind, patch: string) => void
}) {
  const { lang, t } = useI18n()
  const patches = useMemo(() => patchList(db), [db])
  // null = « le dernier », qui suit tout seul l'arrivée des gros catalogues
  // et le patch suivant sans que personne ait à y toucher.
  const [choisi, setChoisi] = useState<string | null>(null)
  const news = useMemo(() => patchNews(db, chars, choisi ?? undefined), [db, chars, choisi])

  if (!db || !news) return <p className="empty">{t('dbLoading')}</p>

  return (
    <div className="view news-view">
      <div className="news-head">
        <h2>
          <TabIcon k="news" /> {t('newsTitle', { patch: news.patch })}
        </h2>
        <div className="news-head-actions">
          {patches.length > 1 && (
            <select
              value={news.patch}
              aria-label={t('newsPatchLabel')}
              onChange={(e) => setChoisi(e.target.value)}
            >
              {patches.map((p) => (
                <option key={p} value={p}>
                  {t('newsPatchOption', { patch: p })}
                </option>
              ))}
            </select>
          )}
          <a
            className="btn btn-ghost"
            href={patchNotesUrl(lang)}
            target="_blank"
            rel="noreferrer"
            title={t('newsOfficialTitle')}
          >
            <TabIcon k="lodestone" /> {t('newsOfficial')}
          </a>
        </div>
      </div>

      <p className="news-summary">
        {t(news.total > 1 ? 'newsCountN' : 'newsCount1', { n: news.total })}
        {news.missing !== null && (
          <>
            {' · '}
            <b>{news.missing > 0 ? t('newsMissing', { n: news.missing }) : t('newsAllOwned')}</b>
          </>
        )}
      </p>

      {news.lines.map((l) => (
        <section className="news-block" key={l.kind}>
          <div className="news-block-head">
            <h3>
              <TabIcon k={l.kind} /> {kindLabel(lang, l.kind)}
            </h3>
            <span className="muted">
              {t(l.items.length > 1 ? 'newsCountN' : 'newsCount1', { n: l.items.length })}
              {l.missing !== null &&
                ` · ${l.missing > 0 ? t('newsMissing', { n: l.missing }) : t('newsAllOwned')}`}
            </span>
            <button className="btn btn-ghost btn-mini" onClick={() => onOpenCollection(l.kind, news.patch)}>
              {t('newsSeeIn')}
            </button>
          </div>
          <div className="news-grid">
            {l.items.slice(0, MAX_CARTES).map((it) => {
              const manque = l.missingIds.has(it.id)
              const boutique = it.sources.some((s) => s.type === 'Premium')
              const source = it.sources[0]
              return (
                <div
                  className={`news-card ${manque ? 'is-todo' : ''}`}
                  key={it.id}
                  role="button"
                  tabIndex={0}
                  title={t('itemDetails')}
                  onClick={() => onShowItem(it, l.kind)}
                  onKeyDown={(e) => e.key === 'Enter' && onShowItem(it, l.kind)}
                >
                  <img
                    className="item-icon"
                    src={it.icon}
                    alt=""
                    loading="lazy"
                    onError={onItemImgError}
                  />
                  {/* Nom sur deux lignes au plus, puis une ligne d'état : les
                      cartes gardent la même hauteur, la grille reste lisible. */}
                  <div className="item-text">
                    <span className="item-name">{lang === 'fr' ? it.name : it.nameEn}</span>
                    <span className="item-source">
                      {manque && <span className="chip chip-todo">{t('newsTodo')}</span>}
                      {boutique && <span className="chip chip-type">{t('newsShop')}</span>}
                      {source && (
                        <span className="item-source-text">
                          {lang === 'fr' ? source.text : source.textEn}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
          {l.items.length > MAX_CARTES && (
            <button
              className="btn btn-ghost more"
              onClick={() => onOpenCollection(l.kind, news.patch)}
            >
              {t('newsMore', { n: l.items.length - MAX_CARTES })}
            </button>
          )}
        </section>
      ))}
    </div>
  )
}
