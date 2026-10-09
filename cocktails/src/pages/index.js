import CocktailStage from '@/components/cocktails/CocktailStage';
import { DRINKS } from '@/components/cocktails/drinks';
import Head from 'next/head';
import { useEffect, useRef, useState } from 'react';

// Point these at your own deployment if you fork this.
const PAGE_TITLE = 'Cocktails — TypingMind';
const PAGE_DESCRIPTION =
  'Ray traced cocktails in WebGL: a pink margarita, an Aperol spritz, a violet orchid, a Manhattan, a Lavender Field, a Mrs. Fild, a Pode & Dill and an Enzoni in real glass, with ice, condensation and garnish. They slosh in, get their garnish and get drunk down.';
const PAGE_URL = 'https://www.bubbbly.com/cocktails';

export default function Cocktails() {
  const stageRef = useRef(null);
  const railRef = useRef(null);
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // auto: each drink comes in, gets drunk down, and the next one comes in, the way the video runs
  const [auto, setAuto] = useState(true);
  const [thumbs, setThumbs] = useState([]);
  const [empty, setEmpty] = useState(false);
  const [full, setFull] = useState(true);
  const [sipping, setSipping] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target.closest?.('button') && (e.key === ' ' || e.key === 'Enter')) return;
      if (e.key === 'ArrowRight') stageRef.current?.next();
      else if (e.key === 'ArrowLeft') stageRef.current?.prev();
      else if (e.key === 's' || e.key === 'S') {
        if (!e.repeat) stageRef.current?.hold();
        setSipping(true);
      } else if (e.key === 'r' || e.key === 'R') stageRef.current?.refill();
      else if (e.key === ' ') {
        e.preventDefault();
        setAuto((a) => !a);
      }
    };
    const onKeyUp = (e) => {
      if (e.key === 's' || e.key === 'S') {
        stageRef.current?.release();
        setSipping(false);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // on a phone not every thumbnail fits, so the rail scrolls to keep the current one in view
  useEffect(() => {
    const rail = railRef.current;
    const thumb = rail?.children[index];
    if (!thumb || rail.scrollWidth <= rail.clientWidth) return;
    rail.scrollTo({ left: thumb.offsetLeft - (rail.clientWidth - thumb.offsetWidth) / 2, behavior: 'smooth' });
  }, [index]);

  const drink = DRINKS[index];

  // a press is a sip; holding it keeps drinking
  const sipDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    stageRef.current?.sip();
    stageRef.current?.hold();
    setSipping(true);
  };
  const sipUp = () => {
    stageRef.current?.release();
    setSipping(false);
  };

  return (
    <main
      className="ck"
      data-ready={ready || undefined}
    >
      <Head>
        <title>{PAGE_TITLE}</title>
        <meta
          name="description"
          content={PAGE_DESCRIPTION}
        />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1"
        />
        <meta charSet="utf-8" />
        <meta
          name="author"
          content="Ann Nguyen"
        />

        <meta
          property="og:type"
          content="website"
        />
        <meta
          property="og:url"
          content={PAGE_URL}
        />
        <meta
          property="og:title"
          content={PAGE_TITLE}
        />
        <meta
          property="og:description"
          content={PAGE_DESCRIPTION}
        />

        <meta
          property="twitter:card"
          content="summary"
        />
        <meta
          property="twitter:url"
          content={PAGE_URL}
        />
        <meta
          property="twitter:title"
          content={PAGE_TITLE}
        />
        <meta
          property="twitter:description"
          content={PAGE_DESCRIPTION}
        />
        <meta
          property="twitter:creator"
          content="@ann_nnng"
        />
      </Head>

      <CocktailStage
        ref={stageRef}
        drinks={DRINKS}
        auto={auto}
        onIndex={setIndex}
        onFill={(f) => {
          railRef.current?.style.setProperty('--p', f.toFixed(4));
          setEmpty(f <= 0);
          setFull(f >= 1);
        }}
        onThumbs={setThumbs}
        onReady={() => setReady(true)}
        onFail={() => setFailed(true)}
      />

      {failed && <p className="ck-fail">This page needs WebGL, and your browser couldn&apos;t start it.</p>}

      {/* the page shows no text; screen readers still get a heading and the drink */}
      <h1 className="ck-sr">Cocktails</h1>
      <p
        className="ck-sr"
        aria-live="polite"
      >
        {empty ? `${drink.name}, all gone` : drink.name}
      </p>

      {/* the drink's name, small, at the top: it fades in with each glass */}
      <p
        key={drink.slug}
        className="ck-name"
        aria-hidden="true"
      >
        {drink.name}
      </p>

      <div className="ck-corner">
        <a
          className="ck-badge"
          href="https://www.typingmind.com/?utm_source=cocktails"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="ck-badge-mark">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://www.typingmind.com/logo.png"
              alt=""
              width={16}
              height={16}
            />
            <span>
              <span className="ck-typing">Typing</span>
              <span className="ck-mind">Mind</span>
            </span>
          </span>
        </a>
        <a
          className="ck-credit"
          href="https://x.com/ann_nnng"
          target="_blank"
          rel="noopener noreferrer"
        >
          created by <strong>Ann Nguyen</strong>
        </a>
      </div>

      <nav
        className="ck-dock"
        aria-label="Drinks"
      >
        <div
          className="ck-rail"
          ref={railRef}
        >
          {DRINKS.map((d, i) => (
            <button
              key={d.slug}
              type="button"
              className="ck-thumb"
              data-active={i === index || undefined}
              aria-current={i === index ? 'true' : undefined}
              aria-label={d.name}
              onClick={() => stageRef.current?.goTo(i)}
            >
              {thumbs[i] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbs[i]}
                  alt=""
                  draggable={false}
                />
              )}
              <span className="ck-bar" />
            </button>
          ))}
        </div>
        <span
          className="ck-divider"
          aria-hidden="true"
        />
        <button
          type="button"
          className="ck-tool"
          onPointerDown={sipDown}
          onPointerUp={sipUp}
          onPointerCancel={sipUp}
          onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && !e.repeat && stageRef.current?.sip()}
          disabled={empty}
          aria-label="Take a sip"
          data-on={(sipping && !empty) || undefined}
          title="Sip (hold S)"
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
            strokeLinecap="round"
          >
            <path d="M5.5 9.5h13l-1.6 10.5H7.1z" />
            <path d="m12.5 9.5 2.6-6.5h3.4" />
          </svg>
        </button>
        <button
          type="button"
          className="ck-tool"
          onClick={() => stageRef.current?.refill()}
          disabled={full}
          aria-label="Refill"
          title="Refill (R)"
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
            strokeLinecap="round"
          >
            <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
            <path d="M19.5 4.5v4h-4" />
          </svg>
        </button>
        <button
          type="button"
          className="ck-tool"
          onClick={() => setAuto((a) => !a)}
          aria-label={auto ? 'Stop the auto show' : 'Auto: drink each one up, then the next'}
          aria-pressed={auto}
          title="Auto (Space)"
        >
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            aria-hidden="true"
          >
            {!auto ? (
              <path
                d="M7 4.5v15l12.5-7.5z"
                fill="currentColor"
              />
            ) : (
              <path
                d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z"
                fill="currentColor"
              />
            )}
          </svg>
        </button>
      </nav>

      <style
        jsx
        global
      >{`
        html,
        body {
          background: #f4f2dd;
        }
        .ck {
          --ink: #111114;
          --faint: rgba(17, 17, 20, 0.08);
          position: fixed;
          inset: 0;
          overflow: hidden;
          background: #f4f2dd;
          color: var(--ink);
          -webkit-user-select: none;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }
        .ck-canvas {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          display: block;
          touch-action: none;
          cursor: grab;
          opacity: 0;
          transition: opacity 0.6s ease;
        }
        .ck[data-ready] .ck-canvas {
          opacity: 1;
        }
        .ck-canvas[data-grabbing] {
          cursor: grabbing;
        }
        .ck-sr {
          position: absolute;
          width: 1px;
          height: 1px;
          margin: -1px;
          overflow: hidden;
          clip: rect(0 0 0 0);
          white-space: nowrap;
        }
        .ck-fail {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          margin: 0;
          max-width: 80vw;
          text-align: center;
          font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif;
          color: rgba(17, 17, 20, 0.6);
        }

        .ck-name {
          position: absolute;
          top: max(22px, env(safe-area-inset-top));
          left: 50%;
          z-index: 1;
          margin: 0;
          transform: translateX(-50%);
          font: 500 11px/1 -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif;
          letter-spacing: 0.24em;
          text-transform: uppercase;
          white-space: nowrap;
          color: rgba(17, 17, 20, 0.62);
          pointer-events: none;
          animation: ck-name-in 0.9s ease 0.35s both;
        }
        .ck:not([data-ready]) .ck-name {
          opacity: 0;
        }
        @keyframes ck-name-in {
          from {
            opacity: 0;
            transform: translate(-50%, 4px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }

        .ck-corner {
          position: absolute;
          top: max(18px, env(safe-area-inset-top));
          left: max(18px, env(safe-area-inset-left));
          z-index: 2;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 6px;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif;
          transition: opacity 0.6s ease 0.2s;
        }
        .ck:not([data-ready]) .ck-corner {
          opacity: 0;
        }
        .ck-corner a {
          color: var(--ink);
          text-decoration: none;
          transition: opacity 0.25s ease;
        }
        .ck-corner a:hover {
          opacity: 0.7;
        }
        .ck-corner a:focus-visible {
          outline: 1px solid var(--ink);
          outline-offset: 2px;
        }
        .ck-badge {
          display: flex;
        }
        .ck-badge-mark {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 15px;
          font-weight: 700;
          line-height: 1;
          letter-spacing: -0.02em;
        }
        .ck-badge-mark img {
          width: 16px;
          height: 16px;
          border-radius: 4px;
        }
        .ck-typing {
          color: #0d1526;
        }
        .ck-mind {
          color: #3b82f6;
        }
        .ck-corner .ck-credit {
          font-size: 12px;
          color: rgba(17, 17, 20, 0.5);
        }
        .ck-credit strong {
          font-weight: 400;
        }

        .ck-dock {
          position: absolute;
          left: 50%;
          bottom: max(24px, env(safe-area-inset-bottom));
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          gap: 6px;
          max-width: calc(100vw - 24px);
          padding: 7px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.7);
          border: 1px solid var(--faint);
          box-shadow: 0 10px 30px -12px rgba(17, 17, 20, 0.18);
          -webkit-backdrop-filter: blur(14px);
          backdrop-filter: blur(14px);
          transition: opacity 0.8s ease 0.2s, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s;
        }
        .ck:not([data-ready]) .ck-dock {
          opacity: 0;
          transform: translate(-50%, 12px);
        }
        .ck-rail {
          position: relative;
          display: flex;
          gap: 6px;
          min-width: 0;
          overflow-x: auto;
          overscroll-behavior-x: contain;
          scrollbar-width: none;
          /* room for the lifted thumbnail's shadow inside the scroll box */
          padding-block: 10px;
          margin-block: -10px;
        }
        .ck-rail::-webkit-scrollbar {
          display: none;
        }
        .ck-thumb {
          position: relative;
          flex: none;
          width: 52px;
          height: 52px;
          padding: 4px;
          border: 0;
          border-radius: 14px;
          background: transparent;
          cursor: pointer;
          transition: background 0.3s ease;
        }
        .ck-thumb:hover {
          background: rgba(17, 17, 20, 0.04);
        }
        .ck-thumb:focus-visible,
        .ck-tool:focus-visible {
          outline: 1px solid var(--ink);
          outline-offset: 2px;
        }
        .ck-thumb img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
          opacity: 0.55;
          filter: saturate(0.35) drop-shadow(0 2px 3px rgba(17, 17, 20, 0.18));
          transform: scale(0.88);
          transition: opacity 0.35s ease, filter 0.35s ease, transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .ck-thumb:hover img {
          opacity: 0.85;
          filter: saturate(0.8) drop-shadow(0 4px 6px rgba(17, 17, 20, 0.22));
          transform: scale(0.96) translateY(-2px);
        }
        .ck-thumb[data-active] img {
          opacity: 1;
          filter: saturate(1) drop-shadow(0 6px 10px rgba(17, 17, 20, 0.24));
          transform: scale(1.04) translateY(-3px);
        }
        /* how much of the drink is left */
        .ck-bar {
          position: absolute;
          left: 28%;
          right: 28%;
          bottom: 1px;
          height: 2px;
          border-radius: 2px;
          overflow: hidden;
          background: rgba(17, 17, 20, 0.1);
          opacity: 0;
          transition: opacity 0.3s ease;
        }
        .ck-thumb[data-active] .ck-bar {
          opacity: 1;
        }
        .ck-bar::after {
          content: '';
          position: absolute;
          inset: 0;
          background: var(--ink);
          transform-origin: left;
          transform: scaleX(var(--p, 1));
        }

        .ck-divider {
          flex: none;
          align-self: stretch;
          width: 1px;
          margin: 8px 2px;
          background: var(--faint);
        }
        .ck-tool {
          flex: none;
          display: grid;
          place-items: center;
          width: 44px;
          height: 44px;
          border: 0;
          border-radius: 50%;
          background: transparent;
          color: var(--ink);
          cursor: pointer;
          touch-action: none;
          transition: background 0.25s ease, color 0.25s ease, opacity 0.25s ease;
        }
        .ck-tool:hover {
          background: rgba(17, 17, 20, 0.05);
        }
        .ck-tool[data-on] {
          background: var(--ink);
          color: #ffffff;
        }
        .ck-tool:disabled {
          opacity: 0.3;
          cursor: default;
          background: transparent;
        }

        @media (max-width: 720px) {
          .ck-dock,
          .ck-rail {
            gap: 2px;
          }
          .ck-dock {
            padding: 5px;
            bottom: max(16px, env(safe-area-inset-bottom));
          }
          .ck-rail {
            padding-inline: 10px;
            -webkit-mask-image: linear-gradient(90deg, transparent, #000 14px, #000 calc(100% - 14px), transparent);
            mask-image: linear-gradient(90deg, transparent, #000 14px, #000 calc(100% - 14px), transparent);
          }
          .ck-thumb {
            width: 42px;
            height: 42px;
            padding: 3px;
          }
          .ck-tool {
            width: 38px;
            height: 38px;
          }
        }
      `}</style>
    </main>
  );
}
