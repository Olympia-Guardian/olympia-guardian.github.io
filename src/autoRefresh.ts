// Recharge l'appli quand une nouvelle version est déployée : GitHub Pages
// garde index.html en cache jusqu'à 10 minutes, et un onglet ouvert peut
// rester des heures sur un vieux bundle. On compare le bundle du index.html
// frais avec celui réellement chargé, au retour sur l'onglet et toutes les
// 5 minutes. cache: 'reload' remplit le cache HTTP au passage, donc le
// location.reload() qui suit repart bien sur la nouvelle version.

const CHECK_EVERY = 5 * 60_000
const MIN_GAP = 60_000

let lastCheck = 0

async function checkNewBuild(): Promise<void> {
  const now = Date.now()
  if (now - lastCheck < MIN_GAP) return
  lastCheck = now
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}index.html`, { cache: 'reload' })
    if (!res.ok) return
    const fresh = (await res.text()).match(/assets\/index-[\w-]+\.js/)?.[0]
    const current = [...document.scripts].map((s) => s.src).find((s) => s.includes('assets/index-'))
    if (fresh && current && !current.includes(fresh)) location.reload()
  } catch {
    // hors ligne : on réessaiera au prochain passage
  }
}

export function initAutoRefresh(): void {
  setInterval(checkNewBuild, CHECK_EVERY)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void checkNewBuild()
  })
}
