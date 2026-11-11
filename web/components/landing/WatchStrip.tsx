"use client";
import { SectionHeader } from "./ui";
import VideoFrame from "./VideoFrame";
import { VIDEOS } from "./videos";

const CARDS = [
  { video: VIDEOS.stopLoss, why: "The old way: a stop-loss placed by hand. Meridian requires one on every ticket." },
  { video: VIDEOS.foLosses, why: "The wider picture: why most F&O traders lost money, in six minutes." },
  { video: VIDEOS.tradingNotes, why: "A broker pitching the trading journal. Meridian's Ledger writes it for you." },
];

/** A compact "watch" row: short, reputable clips that give the context behind the product. */
export default function WatchStrip() {
  return (
    <section aria-label="Watch: the context" className="relative border-t border-(--lp-line)">
      <div className="lp-wrap py-20 sm:py-24">
        <SectionHeader
          eyebrow="Watch · the context"
          title={<>Three short clips. <span className="text-(--lp-muted)">Why the guard rails matter.</span></>}
        />
        <ul className="mt-10 grid grid-cols-1 gap-8 sm:mt-12 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          {CARDS.map((c) => (
            <li key={c.video.id} className="min-w-0">
              <VideoFrame video={c.video} size="sm" chrome={false} note={c.why} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
