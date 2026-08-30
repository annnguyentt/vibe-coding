import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import { Bricolage_Grotesque, Caveat } from 'next/font/google';
import { PALETTES, DEFAULT_PALETTE, PAGE_BACKGROUND } from '@/components/bloom/palettes';
import { FLOWERS, DEFAULT_FLOWER } from '@/components/bloom/flowers';
import { classNames } from '@/utils/utils';

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  weight: ['400', '500', '600', '700'],
});

const caveat = Caveat({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-caveat',
});

// WebGL only exists in the browser, and the scene is ~1.3MB of models besides.
const BloomScene = dynamic(() => import('@/components/bloom/BloomScene'), {
  ssr: false,
});

const DEFAULT_URL = 'https://www.typingmind.com/';
const SHARE_TEXT = 'I turned a link into a bouquet that scans.';
const CREDIT_URL = 'https://www.typingmind.com/?utm_source=bloom-qr';
const SURFACE = '#ffffff';

// Point these at your own deployment if you fork this.
const PAGE_TITLE = 'Bloom QR — a vase of flowers that becomes a scannable QR code';
const PAGE_DESCRIPTION =
  'Type a link and watch a vase of flowers scatter into a scannable QR code. A 3D toy built with three.js.';
const PAGE_URL = 'https://www.bubbbly.com/bloom';

/** Accept bare hostnames the way a browser address bar would. */
function normalizeUrl(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return DEFAULT_URL;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  if (/^[\w-]+(\.[\w-]+)+/.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

const Icon = ({ d, filled = false, size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={filled ? 'currentColor' : 'none'}
    aria-hidden="true"
    className="shrink-0"
  >
    <path
      d={d}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const BLOOM_GLYPH =
  'M12 9.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8Zm0-6.6c1.6 0 2.6 1.6 2.2 3.2 1.4-.9 3.2-.4 3.9 1s0 3.1-1.5 3.6c1.5.5 2.2 2.2 1.5 3.6s-2.5 1.9-3.9 1c.4 1.6-.6 3.2-2.2 3.2s-2.6-1.6-2.2-3.2c-1.4.9-3.2.4-3.9-1s0-3.1 1.5-3.6c-1.5-.5-2.2-2.2-1.5-3.6s2.5-1.9 3.9-1C9.4 4.6 10.4 3 12 3Z';

const PATHS = {
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  download: 'M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  chevron: 'M6 9l6 6 6-6',
  x: 'M4 4l16 16M20 4L4 20',
  linkedin:
    'M4.6 3a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2ZM3.1 8.4h3V21h-3V8.4Zm5.4 0h2.9v1.7h.04c.4-.75 1.4-1.55 2.9-1.55 3.1 0 3.66 2 3.66 4.63V21h-3v-5.5c0-1.31-.02-3-1.85-3s-2.13 1.42-2.13 2.9V21h-3V8.4Z',
  threads:
    'M12 21c-5 0-7.6-3.2-7.6-9S7.1 3 12.1 3c3.4 0 5.7 1.5 6.8 4.2M9.4 15.6c0 1.6 1.3 2.7 3.1 2.7 2.3 0 3.8-1.5 3.8-4.2 0-2.4-1.7-3.8-4.3-3.8-2 0-3.3 1-3.3 2.5',
};

export default function BloomPage() {
  const [input, setInput] = useState(DEFAULT_URL);
  const [encoded, setEncoded] = useState(DEFAULT_URL);
  const [palette, setPalette] = useState(DEFAULT_PALETTE);
  const [flower, setFlower] = useState(DEFAULT_FLOWER);
  const [showQr, setShowQr] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  // Measured, not assumed: the scene frames the arrangement above whatever the
  // dock currently occupies, which changes as the panel collapses.
  const [dockInset, setDockInset] = useState(0);
  const [copied, setCopied] = useState(false);

  const apiRef = useRef(null);
  const tapRef = useRef(null);
  const dockRef = useRef(null);

  useEffect(() => {
    const el = dockRef.current;
    if (!el) return undefined;
    const measure = () => setDockInset(el.offsetHeight + 12);
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, []);

  // A shared link should reopen the same bouquet.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('u');
    if (!fromUrl) return;
    setInput(fromUrl);
    setEncoded(normalizeUrl(fromUrl));
  }, []);

  // Re-encoding on every keystroke would reflow the whole symbol mid-type.
  useEffect(() => {
    const id = setTimeout(() => setEncoded(normalizeUrl(input)), 420);
    return () => clearTimeout(id);
  }, [input]);

  const handleReady = useCallback((api) => {
    apiRef.current = api;
    setReady(true);
  }, []);

  const handleError = useCallback(() => setFailed(true), []);

  // Readers who ask for reduced motion get the end state, not the flight.
  useEffect(() => {
    if (!ready) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      apiRef.current?.snapTo(showQr ? 1 : 0);
    }
  }, [ready, showQr]);

  // Distinguish a tap (toggle the morph) from a drag (orbit the camera).
  const onPointerDown = (e) => {
    tapRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  };
  const onPointerUp = (e) => {
    const start = tapRef.current;
    tapRef.current = null;
    if (!start) return;
    const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    if (moved < 8 && Date.now() - start.t < 500) setShowQr((v) => !v);
  };

  /*
   * The origin has to arrive via state, not straight off `window`. There is no
   * origin during SSR, so the share links render with an empty `url=`, and
   * React's hydration reuses server-rendered attributes without diffing them —
   * the empty href would then sit in the DOM until some unrelated state change
   * forced a re-render. Setting it from an effect guarantees that commit.
   */
  const [shareOrigin, setShareOrigin] = useState('');
  useEffect(() => {
    setShareOrigin(`${window.location.origin}${window.location.pathname}`);
  }, []);

  const shareUrl = useMemo(
    () => (shareOrigin ? `${shareOrigin}?u=${encodeURIComponent(encoded)}` : ''),
    [shareOrigin, encoded],
  );

  const download = () => {
    const api = apiRef.current;
    if (!api) return;
    const link = document.createElement('a');
    link.href = api.capture();
    link.download = showQr ? 'bloom-qr.png' : 'bloom-bouquet.png';
    link.click();
  };

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const shareTargets = [
    {
      key: 'x',
      label: 'Share on X',
      path: PATHS.x,
      href: `https://x.com/intent/tweet?text=${encodeURIComponent(SHARE_TEXT)}&url=${encodeURIComponent(shareUrl)}`,
    },
    {
      key: 'linkedin',
      label: 'Share on LinkedIn',
      path: PATHS.linkedin,
      filled: true,
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`,
    },
    {
      key: 'threads',
      label: 'Share on Threads',
      path: PATHS.threads,
      href: `https://www.threads.net/intent/post?text=${encodeURIComponent(`${SHARE_TEXT} ${shareUrl}`)}`,
    },
  ];

  const hint = showQr ? 'Tap to gather the bouquet' : 'Tap the bouquet to bloom a QR code';
  const chipClass = (active) =>
    classNames(
      'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition',
      active ? 'font-semibold' : 'opacity-55 hover:opacity-100',
    );
  const actionClass =
    'flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium whitespace-nowrap transition hover:opacity-70 disabled:opacity-40';
  const sectionClass = 'mt-2.5 border-t pt-2.5';
  // On phones the panel drops out of flow when closed; on desktop it always shows.
  const hideWhenCollapsed = collapsed ? 'max-sm:hidden' : '';

  return (
    <>
      <Head>
        <title>{PAGE_TITLE}</title>
        <meta name="description" content={PAGE_DESCRIPTION} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta charSet="utf-8" />
        <meta name="author" content="Ann Nguyen" />

        <meta property="og:type" content="website" />
        <meta property="og:url" content={PAGE_URL} />
        <meta property="og:title" content={PAGE_TITLE} />
        <meta property="og:description" content={PAGE_DESCRIPTION} />

        <meta property="twitter:card" content="summary" />
        <meta property="twitter:url" content={PAGE_URL} />
        <meta property="twitter:title" content={PAGE_TITLE} />
        <meta property="twitter:description" content={PAGE_DESCRIPTION} />
        <meta property="twitter:creator" content="@ann_nnng" />
      </Head>

      <main
        className={classNames(
          bricolage.variable,
          caveat.variable,
          'relative h-[100dvh] w-full overflow-hidden font-[family-name:var(--font-bricolage)]',
        )}
        // Constant white: only the flowers and the code carry the palette.
        style={{ backgroundColor: PAGE_BACKGROUND, color: palette.ink }}
      >
        <div
          className="absolute inset-0"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
        >
          {!failed && (
            <BloomScene
              value={encoded}
              palette={palette}
              flower={flower}
              showQr={showQr}
              bottomInset={dockInset}
              onReady={handleReady}
              onError={handleError}
            />
          )}
        </div>

        {!ready && (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-500"
            style={{ backgroundColor: PAGE_BACKGROUND }}
          >
            <p
              className="font-[family-name:var(--font-caveat)] text-2xl"
              style={{ color: palette.accent }}
            >
              {failed ? 'The greenhouse failed to load.' : 'Arranging the flowers…'}
            </p>
          </div>
        )}

        {/*
          The credit is pinned top-left at every size. The dock below carries
          only the panel, plus a collapse toggle on phones; from `sm` up the
          toggle disappears and the panel floats top-right.
        */}
        <a
          href={CREDIT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute left-4 top-4 z-30 sm:left-6 sm:top-6"
        >
          <span className="block text-xs opacity-55 sm:text-sm">
            Advanced chat UI for AI models
          </span>
          <span className="mt-1 flex items-center gap-2 sm:gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://www.typingmind.com/logo.png"
              alt=""
              width={40}
              height={40}
              className="h-8 w-8 rounded-lg sm:h-10 sm:w-10"
            />
            <span className="text-2xl font-bold tracking-tight sm:text-4xl">
              <span style={{ color: '#0d1526' }}>Typing</span>
              <span style={{ color: '#3b82f6' }}>Mind</span>
            </span>
          </span>
        </a>

        <div
          ref={dockRef}
          className={classNames(
            'pointer-events-none absolute inset-x-3 bottom-3 z-20 flex flex-col gap-2',
            'sm:inset-x-auto sm:bottom-auto sm:right-6 sm:top-6 sm:w-[23.5rem]',
          )}
        >
          <div className="order-1 flex justify-end sm:hidden">
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              aria-expanded={!collapsed}
              aria-label={collapsed ? 'Show menu' : 'Hide menu'}
              className="pointer-events-auto grid h-11 w-11 shrink-0 place-items-center rounded-full border shadow-sm transition sm:hidden"
              style={{ backgroundColor: SURFACE, borderColor: `${palette.ink}1f` }}
            >
              <span
                className={classNames('transition-transform duration-300', collapsed && 'rotate-180')}
              >
                <Icon d={PATHS.chevron} size={20} />
              </span>
            </button>
          </div>

          <div
            className={classNames(
              'pointer-events-auto order-3 rounded-2xl border p-2.5 shadow-md sm:order-none',
              hideWhenCollapsed,
            )}
            style={{ backgroundColor: SURFACE, borderColor: `${palette.ink}1f` }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setEncoded(normalizeUrl(input));
                  setShowQr(true);
                }
              }}
              spellCheck={false}
              autoComplete="off"
              aria-label="Link to encode"
              placeholder="https://your-link.com"
              className="w-full rounded-full border bg-transparent px-3.5 py-2 text-sm outline-none transition focus:ring-2"
              style={{
                borderColor: `${palette.ink}22`,
                '--tw-ring-color': `${palette.accent}55`,
              }}
            />

            <div
              className={classNames(sectionClass, 'flex flex-wrap items-center gap-1')}
              style={{ borderColor: `${palette.ink}1a` }}
            >
              {FLOWERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFlower(f)}
                  aria-pressed={f.id === flower.id}
                  className={chipClass(f.id === flower.id)}
                  style={
                    f.id === flower.id
                      ? { backgroundColor: `${palette.accent}1f`, color: palette.accent }
                      : undefined
                  }
                >
                  <Icon d={BLOOM_GLYPH} filled={f.id === flower.id} />
                  {f.label}
                </button>
              ))}
            </div>

            <div
              className={classNames(sectionClass, 'flex flex-wrap items-center gap-1')}
              style={{ borderColor: `${palette.ink}1a` }}
            >
              {PALETTES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPalette(p)}
                  aria-pressed={p.id === palette.id}
                  className={chipClass(p.id === palette.id)}
                  style={p.id === palette.id ? { backgroundColor: `${p.accent}1f` } : undefined}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: p.accent }}
                  />
                  {p.label}
                </button>
              ))}
            </div>

            <div className={sectionClass} style={{ borderColor: `${palette.ink}1a` }}>
              <div className="flex gap-2">
              <button
                type="button"
                onClick={copyLink}
                className={actionClass}
                style={{ borderColor: `${palette.ink}22` }}
              >
                <Icon d={PATHS.link} />
                {copied ? 'Copied!' : 'Copy link'}
              </button>
              <button
                type="button"
                onClick={download}
                disabled={!ready}
                className={actionClass}
                style={{ borderColor: `${palette.ink}22` }}
              >
                <Icon d={PATHS.download} />
                Download image
              </button>
              </div>

              <div className="mt-2 flex gap-2">
              {shareTargets.map((target) => (
                <a
                  key={target.key}
                  href={target.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={target.label}
                  aria-disabled={!shareUrl}
                  title={target.label}
                  className={classNames(
                    'grid flex-1 place-items-center rounded-xl border py-2 transition hover:opacity-70',
                    !shareUrl && 'pointer-events-none opacity-40',
                  )}
                  style={{ borderColor: `${palette.ink}22` }}
                >
                  <Icon d={target.path} filled={target.filled} size={18} />
                </a>
              ))}
              </div>
            </div>
          </div>
        </div>

        {/* Hint — sits on a pill so it stays legible over the vase */}
        <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center max-sm:hidden">
          <p
            className="rounded-full px-4 py-1.5 font-[family-name:var(--font-caveat)] text-lg shadow-sm"
            style={{ backgroundColor: SURFACE, color: `${palette.ink}cc` }}
            aria-live="polite"
          >
            {hint}
          </p>
        </div>
      </main>
    </>
  );
}
