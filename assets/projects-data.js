/* ============================================================
   PROJECT DATA — single source of truth, shared by the home page
   (nav list + 2 cover images per project in the carousel) and each
   project page (title, description, metadata, full image gallery).

   Order here = order in the nav = order of appearance on the home.
   `covers` are the (up to 2) images used on the home carousel;
   `images` are the full gallery shown on the project's own page, in
   page order. Each entry is {type, src, w, h} — w/h are the real pixel
   dimensions, used as the width/height hint so layout doesn't jump while
   the (large) files are still loading. A `video` entry gets native
   controls on the project page (play/pause, seek, volume, fullscreen);
   on the thumbnail strip it just shows its first frame, muted and inert.
   ============================================================ */

function img(src, w, h) {
  return { type: "image", src, w: w || 2086, h: h || 2608 };
}

function video(src, w, h) {
  return { type: "video", src, w: w || 2086, h: h || 2608 };
}

const SITE_PROJECTS = [
  {
    slug: "inventaire-general",
    navLabel: "Inventaire général",
    title: "Inventaire général d'une maison probablement imaginaire, Vol. 1",
    description: [
      "Pour mon projet de fin d'études, j'ai réalisé une vidéo d'animation, imaginée comme l'annonce d'un appel à candidatures pour les 40 ans de l'Institut du monde arabe.",
      "J'ai sculpté les éléments principaux en pâte à modeler, avant de les scanner en 3D. L'ensemble des animations et des scènes a été réalisé dans Cinema 4D.",
    ],
    technique: "DA, écriture, 3D, set design",
    year: "2026",
    covers: [img("assets/PROJET_01/cover_01.png", 2086, 2782), img("assets/PROJET_01/cover_02.png", 2086, 2782)],
    images: [
      video("assets/PROJET_01/asset_01.mp4", 1920, 1080),
      img("assets/PROJET_01/asset_02.png"),
      video("assets/PROJET_01/asset_03.mp4", 1080, 1350),
      video("assets/PROJET_01/asset_04.mp4", 1080, 1350),
      img("assets/PROJET_01/asset_05.png"),
      img("assets/PROJET_01/asset_06.png"),
      img("assets/PROJET_01/asset_07.png"),
      img("assets/PROJET_01/asset_08.png"),
      img("assets/PROJET_01/asset_09.png"),
    ],
  },
  {
    slug: "natures-mortes",
    navLabel: "Natures mortes",
    title: "Natures mortes",
    description: [
      "Étude de lumière et de composition à partir d'un élément de mon projet de fin d'études.",
      "J'ai d'abord sculpté le poisson en pâte à modeler, puis je l'ai scanné en 3D. Les scènes ont été créées dans Cinema 4D.",
    ],
    technique: "3D, set design",
    year: "2026",
    covers: [img("assets/PROJET_02/cover_01.png"), img("assets/PROJET_02/cover_02.png")],
    images: [
      img("assets/PROJET_02/asset_01.png"),
      img("assets/PROJET_02/asset_02.png"),
      img("assets/PROJET_02/asset_03.png"),
      img("assets/PROJET_02/asset_04.png"),
    ],
  },
  {
    slug: "absent",
    navLabel: "Absent",
    title: "Absent",
    description: [
      "Absent – für draussen gear – est un projet fictif de marque outdoor, développé avec @ADAAAP afin d'expérimenter, de tester et de comprendre comment créer ensemble.",
    ],
    technique: "DA, 3D, product design",
    year: "2025",
    covers: [img("assets/PROJET_03/cover_01.png"), img("assets/PROJET_03/cover_02.png")],
    images: [
      img("assets/PROJET_03/asset_01.png"),
      img("assets/PROJET_03/asset_02.png"),
      img("assets/PROJET_03/asset_03.png"),
      video("assets/PROJET_03/asset_04.mp4", 1080, 1440),
      img("assets/PROJET_03/asset_05.png"),
      img("assets/PROJET_03/asset_06.png"),
      video("assets/PROJET_03/asset_07.mp4", 1080, 1350),
      img("assets/PROJET_03/asset_08.png"),
    ],
  },
  {
    slug: "dodo",
    navLabel: "Dodo, l'enfant do",
    title: "Dodo, l'enfant do",
    description: [
      "Sur le thème du rêve, ce projet d'édition prend la forme d'un recueil de berceuses à travers le monde.",
    ],
    technique: "DA, illustrations & retouches photo",
    year: "2026",
    covers: [img("assets/PROJET_04/cover_01.png"), img("assets/PROJET_04/cover_02.png")],
    images: [
      img("assets/PROJET_04/asset_01.png"),
      img("assets/PROJET_04/asset_02.png"),
      img("assets/PROJET_04/asset_03.png"),
      img("assets/PROJET_04/asset_04.png"),
      img("assets/PROJET_04/asset_05.png"),
      img("assets/PROJET_04/asset_06.png"),
      img("assets/PROJET_04/asset_07.png"),
    ],
  },
  {
    slug: "en-cours",
    navLabel: "En cours",
    title: "En cours",
    description: [
      "Ce court-métrage parlera de tous les amours que nous rencontrons dans notre vie. Le premier étant l'amour des lumières et du battement de cœur de notre mère. Puis le deuxième : la découverte des insectes, des bobos qui guérissent tout seuls et des taches de bolognaise autour de la bouche.",
      "Les amours défilent jusqu'à arriver au dernier amour : l'amour patient et silencieux que portent les personnes âgées, trop souvent isolées. Toutes seront dessinées en crayon de couleurs, puis animées digitalement.",
    ],
    technique: "DA, écriture, illustrations & motion 2D",
    year: "2026",
    // Only one image for this one — single cover, single-image gallery.
    covers: [img("assets/PROJET_05/cover_01.png")],
    images: [img("assets/PROJET_05/asset_01.png")],
  },
];
