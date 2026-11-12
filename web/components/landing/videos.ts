/** The YouTube clip on the landing page. IDs, titles, channels and lengths were verified
 *  on 12 Nov 2026 (see docs/frontend-research.md, "Landing page videos"). Nothing is downloaded:
 *  each frame shows the public thumbnail and loads the privacy-enhanced player only on click. */
export type Video = {
  id: string;
  title: string;
  channel: string;
  duration: string;
  /** A short, descriptive alt text for the thumbnail. */
  alt: string;
};

export const VIDEOS = {
  sebiStudy: {
    id: "-TcJR_ZRmZc",
    title: "SEBI study: 70% of intraday traders in the cash market faced losses in FY23",
    channel: "CNBC-TV18",
    duration: "2:12",
    alt: "CNBC-TV18 news segment on SEBI's study of intraday trader losses in FY23",
  },
} satisfies Record<string, Video>;

export const watchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
export const thumbUrl = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
export const embedUrl = (id: string) =>
  `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
