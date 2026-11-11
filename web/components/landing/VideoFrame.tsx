"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { ArrowUpRight, Play } from "lucide-react";
import clsx from "clsx";
import { useReducedMotion } from "./context";
import { EASE } from "./ui";
import { embedUrl, thumbUrl, watchUrl, type Video } from "./videos";

type Size = "lg" | "md" | "sm";

const PLAY: Record<Size, { box: string; icon: number }> = {
  lg: { box: "h-16 w-16", icon: 22 },
  md: { box: "h-14 w-14", icon: 19 },
  sm: { box: "h-11 w-11", icon: 16 },
};

/**
 * A YouTube clip in a quiet browser-style frame. It first renders a click-to-load facade (the public
 * thumbnail and a play button), and only swaps in the privacy-enhanced player when someone presses play,
 * so no player JavaScript is loaded at first paint.
 */
export default function VideoFrame({
  video,
  size = "md",
  chrome = true,
  note,
  className,
}: {
  video: Video;
  size?: Size;
  /** Show the window bar with dots and the address pill. */
  chrome?: boolean;
  /** An extra line under the credit, e.g. a newer figure. */
  note?: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const [playing, setPlaying] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const play = PLAY[size];

  // keep keyboard focus on the player once the facade button disappears
  useEffect(() => {
    if (playing) frameRef.current?.focus();
  }, [playing]);

  return (
    <motion.figure
      initial={reduced ? false : { opacity: 0, scale: 0.96 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.8, ease: EASE }}
      className={clsx("min-w-0", className)}
    >
      <div className="overflow-hidden rounded-[14px] border border-(--lp-line-2) bg-(--lp-surface) shadow-(--lp-shadow-lg)">
        {chrome && (
          <div className="flex h-9 items-center gap-3 border-b border-(--lp-line) bg-(--lp-surface-2) px-3">
            <span className="flex shrink-0 gap-1.5" aria-hidden>
              <span className="h-2 w-2 rounded-full bg-(--lp-line-2)" />
              <span className="h-2 w-2 rounded-full bg-(--lp-line-2)" />
              <span className="h-2 w-2 rounded-full bg-(--lp-line-2)" />
            </span>
            <span className="lp-mono mx-auto min-w-0 truncate rounded-md border border-(--lp-line) bg-(--lp-surface) px-2.5 py-0.5 text-[11px] text-(--lp-muted)">
              youtube.com · {video.channel}
            </span>
            <span className="lp-mono shrink-0 text-[11px] text-(--lp-faint)">{video.duration}</span>
          </div>
        )}

        <div className="relative aspect-video overflow-hidden bg-(--lp-bg-2)">
          {playing ? (
            <iframe
              ref={frameRef}
              src={embedUrl(video.id)}
              title={video.title}
              allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              className="absolute inset-0 h-full w-full border-0"
            />
          ) : (
            <button
              type="button"
              onClick={() => setPlaying(true)}
              aria-label={`Play video: ${video.title}, ${video.duration}, from ${video.channel}`}
              className="lp-video-facade absolute inset-0 block h-full w-full cursor-pointer overflow-hidden text-left"
            >
              {/* the public thumbnail; next/image would need a remote-pattern config for one static jpg */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbUrl(video.id)}
                alt={video.alt}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <span aria-hidden className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent" />
              <span aria-hidden className="absolute inset-0 grid place-items-center">
                <span className={clsx("lp-video-play grid place-items-center rounded-full bg-white text-[#14181f] shadow-[0_1px_2px_rgba(20,24,31,0.2),0_8px_24px_-8px_rgba(20,24,31,0.45)]", play.box)}>
                  <Play size={play.icon} fill="currentColor" strokeWidth={0} className="translate-x-[1.5px]" />
                </span>
              </span>
              <span
                aria-hidden
                className="lp-mono absolute bottom-2.5 left-2.5 rounded-md bg-[#14181f]/85 px-1.5 py-0.5 text-[11px] text-white"
              >
                {video.duration}
              </span>
            </button>
          )}
        </div>

        <figcaption className={clsx("flex items-start gap-3 border-t border-(--lp-line)", size === "sm" ? "px-3 py-2.5" : "px-4 py-3")}>
          <span className="min-w-0 flex-1">
            <span className={clsx("block text-pretty font-medium leading-snug text-(--lp-ink)", size === "sm" ? "text-[13px]" : "text-[14px]")}>
              {video.title}
            </span>
            <span className="mt-1 block text-[12.5px] text-(--lp-muted)">
              {video.channel} · <span className="lp-mono text-[11.5px]">{video.duration}</span>
            </span>
          </span>
          <a
            href={watchUrl(video.id)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Watch "${video.title}" on YouTube (opens in a new tab)`}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[12px] font-medium text-(--lp-ink-2) transition-colors hover:text-(--lp-ink)"
          >
            YouTube <ArrowUpRight size={13} aria-hidden />
          </a>
        </figcaption>
      </div>

      <p className="mt-2 text-pretty text-[12px] leading-snug text-(--lp-muted)">
        Video: {video.channel} on YouTube{note ? <> · {note}</> : null}
      </p>
    </motion.figure>
  );
}
