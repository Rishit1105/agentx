/** Themed YouTube clips for the landing page. IDs, titles, channels and lengths were verified
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
  algoGuardrails: {
    id: "j_OHE_TtCu4",
    title: "SEBI proposes algorithmic trading for retail investors: more of a guard rail, say experts",
    channel: "CNBC-TV18",
    duration: "8:12",
    alt: "CNBC-TV18 panel discussing SEBI's proposed guard rails for retail algorithmic trading",
  },
  nifty50: {
    id: "1hm8veTIlIE",
    title: "The creation of NSE 50 and how it came to be called NIFTY",
    channel: "NSE India",
    duration: "1:35",
    alt: "NSE India film on how the NSE 50 index was created and named NIFTY",
  },
  stopLoss: {
    id: "eXMrEMdQWrQ",
    title: "How to place a stop-loss order on Kite",
    channel: "Zerodha",
    duration: "4:17",
    alt: "Zerodha walkthrough of placing a stop-loss order on the Kite trading platform",
  },
  foLosses: {
    id: "5l_aOZgvEwA",
    title: "Why did 93% of F&O traders lose money?",
    channel: "Business Standard",
    duration: "6:08",
    alt: "Business Standard explainer on why most futures and options traders lost money",
  },
  tradingNotes: {
    id: "iYQy7tyHxWc",
    title: "How to use Kite's Notes feature for better trading decisions",
    channel: "Zerodha",
    duration: "0:51",
    alt: "Zerodha clip showing how to keep notes on trades in Kite, like a trading journal",
  },
} satisfies Record<string, Video>;

export const watchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
export const thumbUrl = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
export const embedUrl = (id: string) =>
  `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
