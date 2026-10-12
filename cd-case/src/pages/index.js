import CaseStage from '@/components/cd-case/CaseStage';
import { DISC } from '@/components/cd-case/disc';
import Head from 'next/head';
import { useEffect, useRef, useState } from 'react';

export default function CdCase() {
  const stageRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [spin, setSpin] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('button') && (e.key === ' ' || e.key === 'Enter')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'o' || e.key === 'O') stageRef.current?.setOpen();
      else if (e.key === 's' || e.key === 'S') setSpin((s) => !s);
      else if (e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <main
      className="cd"
      data-ready={ready || undefined}
    >
      <Head>
        <title>CD Case</title>
        <meta
          name="description"
          content="A clear CD jewel case in WebGL: light bends through the plastic, the disc spins inside with its rainbow, and the case turns round as its lid swings open."
        />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1"
        />
      </Head>

      <CaseStage
        ref={stageRef}
        disc={DISC}
        paused={paused}
        spin={spin}
        onOpen={setOpen}
        onReady={() => setReady(true)}
        onFail={() => setFailed(true)}
      />

      {failed && <p className="cd-fail">This page needs WebGL, and your browser couldn&apos;t start it.</p>}

      <h1 className="cd-sr">CD Case</h1>
      <p
        className="cd-sr"
        aria-live="polite"
      >
        {`${DISC.name}${open ? ', case open' : ''}`}
      </p>

      <div className="cd-corner">
        <a
          className="cd-badge"
          href="https://www.typingmind.com/?utm_source=cd-case"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="cd-tag">Advanced chat UI for AI models</span>
          <span className="cd-badge-mark">
            <img
              src="https://www.typingmind.com/logo.png"
              alt=""
              width={20}
              height={20}
            />
            <span>
              <span className="cd-typing">Typing</span>
              <span className="cd-mind">Mind</span>
            </span>
          </span>
        </a>
        <a
          className="cd-credit"
          href="https://x.com/ann_nnng"
          target="_blank"
          rel="noopener noreferrer"
        >
          created by <strong>Ann Nguyen</strong>
        </a>
      </div>

      <p
        className="cd-hint"
        aria-hidden="true"
      >
        Tap the case to open it · drag to turn it
      </p>

      <nav
        className="cd-dock"
        aria-label="Controls"
      >
        <button
          type="button"
          className="cd-tool"
          onClick={() => setSpin((s) => !s)}
          aria-label="Spin the disc"
          aria-pressed={spin}
          data-on={spin || undefined}
          title="Spin (S)"
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <circle
              cx="12"
              cy="12"
              r="8.5"
            />
            <circle
              cx="12"
              cy="12"
              r="2.4"
            />
            <path
              d="M12 5.8a6.2 6.2 0 0 1 6.2 6.2"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <button
          type="button"
          className="cd-tool"
          onClick={() => stageRef.current?.setOpen()}
          aria-label={open ? 'Close the case' : 'Open the case'}
          aria-pressed={open}
          data-on={open || undefined}
          title="Open (O)"
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          >
            <path d="M11 5.5 3.5 7.8v10.4L11 18.5z" />
            <rect
              x="11"
              y="5.5"
              width="9.5"
              height="13"
              rx="1.4"
            />
            <circle
              cx="15.75"
              cy="12"
              r="2.6"
            />
          </svg>
        </button>
        <button
          type="button"
          className="cd-tool"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? 'Play' : 'Pause'}
          aria-pressed={paused}
          title="Pause (Space)"
        >
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            aria-hidden="true"
          >
            {paused ? (
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
        .cd {
          --ink: #111114;
          --faint: rgba(17, 17, 20, 0.08);
          position: fixed;
          inset: 0;
          overflow: hidden;
          background: #ffffff;
          color: var(--ink);
          -webkit-user-select: none;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }
        .cd-stage {
          position: absolute;
          inset: 0;
          touch-action: none;
        }
        .cd-canvas {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          display: block;
          opacity: 0;
          transition: opacity 0.8s ease;
        }
        .cd[data-ready] .cd-canvas {
          opacity: 1;
        }
        .cd-sr {
          position: absolute;
          width: 1px;
          height: 1px;
          margin: -1px;
          overflow: hidden;
          clip: rect(0 0 0 0);
          white-space: nowrap;
        }
        .cd-fail {
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

        .cd-corner {
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
        .cd:not([data-ready]) .cd-corner {
          opacity: 0;
        }
        .cd-corner a {
          color: var(--ink);
          text-decoration: none;
          transition: opacity 0.25s ease;
        }
        .cd-corner a:hover {
          opacity: 0.7;
        }
        .cd-corner a:focus-visible {
          outline: 1px solid var(--ink);
          outline-offset: 2px;
        }
        .cd-badge {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 4px;
        }
        .cd-corner .cd-tag {
          font-size: 12px;
          color: rgba(17, 17, 20, 0.5);
        }
        .cd-badge-mark {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 18px;
          font-weight: 700;
          line-height: 1;
          letter-spacing: -0.02em;
        }
        .cd-badge-mark img {
          width: 20px;
          height: 20px;
          border-radius: 5px;
        }
        .cd-typing {
          color: #0d1526;
        }
        .cd-mind {
          color: #3b82f6;
        }
        .cd-corner .cd-credit {
          font-size: 12px;
          color: rgba(17, 17, 20, 0.5);
        }
        .cd-credit strong {
          font-weight: 400;
        }

        .cd-hint {
          position: absolute;
          left: 50%;
          bottom: calc(max(24px, env(safe-area-inset-bottom)) + 76px);
          transform: translateX(-50%);
          margin: 0;
          white-space: nowrap;
          pointer-events: none;
          font: 11.5px/1 -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif;
          letter-spacing: 0.01em;
          color: rgba(17, 17, 20, 0.42);
          transition: opacity 0.8s ease 0.6s;
        }
        .cd:not([data-ready]) .cd-hint {
          opacity: 0;
        }

        .cd-dock {
          position: absolute;
          left: 50%;
          bottom: max(24px, env(safe-area-inset-bottom));
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 7px;
          border-radius: 30px;
          background: rgba(255, 255, 255, 0.7);
          border: 1px solid var(--faint);
          box-shadow: 0 10px 30px -12px rgba(17, 17, 20, 0.18);
          -webkit-backdrop-filter: blur(14px);
          backdrop-filter: blur(14px);
          transition: opacity 0.8s ease 0.2s, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s;
        }
        .cd:not([data-ready]) .cd-dock {
          opacity: 0;
          transform: translate(-50%, 12px);
        }
        .cd-tool {
          flex: none;
          display: grid;
          place-items: center;
          width: 44px;
          height: 44px;
          padding: 0;
          border: 0;
          border-radius: 50%;
          background: transparent;
          color: var(--ink);
          cursor: pointer;
          transition: background 0.25s ease, color 0.25s ease;
        }
        .cd-tool:hover {
          background: rgba(17, 17, 20, 0.05);
        }
        .cd-tool:focus-visible {
          outline: 1px solid var(--ink);
          outline-offset: 2px;
        }
        .cd-tool[data-on] {
          background: var(--ink);
          color: #ffffff;
        }

        @media (max-width: 720px) {
          .cd-dock {
            gap: 2px;
            padding: 5px;
            bottom: max(16px, env(safe-area-inset-bottom));
          }
          .cd-tool {
            width: 38px;
            height: 38px;
          }
          .cd-hint {
            bottom: calc(max(16px, env(safe-area-inset-bottom)) + 62px);
            font-size: 11px;
          }
        }
      `}</style>
    </main>
  );
}
