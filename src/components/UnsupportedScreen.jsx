// Shown when WebXR immersive-ar isn't available: the app is AR-only,
// so all we can do is point the user at a capable device.

function PhoneArIcon() {
  return (
    <svg
      className="unsupported-icon"
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="18" y="6" width="28" height="52" rx="5" />
      <line x1="28" y1="12" x2="36" y2="12" />
      <line x1="30" y1="52" x2="34" y2="52" />
      {/* AR cube on the screen */}
      <path d="M32 22l8 4.5v9L32 40l-8-4.5v-9L32 22z" />
      <path d="M24 26.5l8 4.5 8-4.5" />
      <line x1="32" y1="31" x2="32" y2="40" />
    </svg>
  )
}

export function UnsupportedScreen() {
  const href = typeof window !== 'undefined' ? window.location.href : ''
  return (
    <div className="unsupported-screen">
      <header className="hotspot-brand" aria-label="Invisible Safety NYC">
        <span className="brand-mark" aria-hidden="true">IS</span>
        <span className="brand-name">Invisible Safety</span>
      </header>

      <section className="unsupported-panel" role="alert">
        <PhoneArIcon />
        <h1 className="unsupported-title">Device not supported</h1>
        <p className="unsupported-text">
          This experience requires an AR-capable phone or headset that supports
          WebXR <code>immersive-ar</code>.
        </p>
        <p className="unsupported-text">
          Open this site in Chrome on Android or the Meta Quest browser.
        </p>

        <div className="unsupported-url-label">Current page:</div>
        <div className="unsupported-url">{href}</div>

        <p className="unsupported-learn">
          Learn more about WebXR:{' '}
          <a href="https://immersiveweb.dev" target="_blank" rel="noreferrer">
            immersiveweb.dev
          </a>
        </p>
      </section>
    </div>
  )
}
