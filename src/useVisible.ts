import { useEffect, useRef, useState } from "react";

// « Vu au moins une fois ». Sert à ne PAS rendre les images d'un bloc tant
// qu'il n'approche pas de l'écran.
//
// On a d'abord cru que `content-visibility: auto` suffirait : il saute le
// dessin, mais pas le téléchargement. Mesure sur l'album des cartes : 385
// images hors écran, 385 chargées. Le navigateur n'ouvrant que six connexions
// par hôte, elles repoussaient le portrait et les icônes d'onglets onze
// secondes plus loin.
//
// On observe donc le BLOC (dix-sept pages d'album) et non chaque image (quatre
// cent soixante-quinze), et une fois vu on ne le surveille plus : rien ne doit
// disparaître sous les yeux de quelqu'un qui remonte.
export function useVisible<T extends HTMLElement>(marge = "600px") {
  const ref = useRef<T | null>(null);
  const [vu, setVu] = useState(false);

  useEffect(() => {
    if (vu) return;
    const el = ref.current;
    // Sans IntersectionObserver (navigateur très ancien), on rend tout : mieux
    // vaut lent que vide.
    if (!el || typeof IntersectionObserver === "undefined") {
      setVu(true);
      return;
    }
    // On attend une image de mise en page avant d'observer. Sans ce delai, la
    // premiere mesure tombe alors que tous les blocs sont encore empiles en
    // haut : ils « intersectent » tous, on latche `vu` pour chacun, et le
    // verrou ne sert plus a rien. Constate : dix-sept pages d'album declarees
    // visibles alors que la neuvieme etait a 1857 px et la derniere a 3541.
    let io: IntersectionObserver | null = null;
    const t = requestAnimationFrame(() => {
      io = new IntersectionObserver(
        (entrees) => {
          if (entrees.some((e) => e.isIntersecting)) {
            setVu(true);
            io?.disconnect();
          }
        },
        { rootMargin: marge },
      );
      io.observe(el);
    });
    return () => {
      cancelAnimationFrame(t);
      io?.disconnect();
    };
  }, [vu, marge]);

  return [ref, vu] as const;
}
