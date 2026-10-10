// The hero illustration: a soft-rendered slab showing a night's chart, with a
// ringing bell, a moon and three candles floating around it. Drawn in SVG so
// it ships with the page and needs no image files.

export function Art() {
  return (
    <svg className="art" viewBox="0 0 560 500" role="img" aria-label="A glowing slab showing a price chart, with a bell, a moon and three candlesticks floating around it">
      <defs>
        <linearGradient id="a-face" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#c9bdff" /><stop offset="0.55" stopColor="#a391fb" /><stop offset="1" stopColor="#8672ee" /></linearGradient>
        <linearGradient id="a-edge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f1f0f7" /><stop offset="0.5" stopColor="#a5a4b6" /><stop offset="1" stopColor="#6d6b82" /></linearGradient>
        <pattern id="a-weave" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="none" /><circle cx="1.2" cy="1.2" r="0.8" fill="#ffffff" opacity="0.2" /><circle cx="3.7" cy="3.7" r="0.8" fill="#3b2aa8" opacity="0.14" /></pattern>
        <linearGradient id="a-bell" x1="0.15" y1="0" x2="0.9" y2="1"><stop offset="0" stopColor="#aab6ff" /><stop offset="0.45" stopColor="#6f6ff2" /><stop offset="1" stopColor="#3a2bb5" /></linearGradient>
        <linearGradient id="a-rim" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#4a3fd0" /><stop offset="0.5" stopColor="#8f96ff" /><stop offset="1" stopColor="#3a2bb5" /></linearGradient>
        <radialGradient id="a-lime" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stopColor="#f6ffa8" /><stop offset="0.6" stopColor="#d8f34a" /><stop offset="1" stopColor="#a9c41f" /></radialGradient>
        <radialGradient id="a-moon" cx="0.32" cy="0.28" r="0.85"><stop offset="0" stopColor="#e6dfff" /><stop offset="0.5" stopColor="#9d8bf8" /><stop offset="1" stopColor="#5a44d6" /></radialGradient>
        <linearGradient id="a-candle" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#b9c3ff" /><stop offset="0.5" stopColor="#7d83f6" /><stop offset="1" stopColor="#4b3fd0" /></linearGradient>
        <radialGradient id="a-glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#8b6dff" stopOpacity="0.55" /><stop offset="1" stopColor="#8b6dff" stopOpacity="0" /></radialGradient>
        <filter id="a-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7" /></filter>
        <filter id="a-shadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="18" stdDeviation="16" floodColor="#05030f" floodOpacity="0.55" /></filter>
        <clipPath id="a-screen"><rect x="182" y="52" width="250" height="386" rx="34" /></clipPath>
      </defs>

      <ellipse cx="300" cy="260" rx="270" ry="230" fill="url(#a-glow)" />

      <g className="float f-slab" filter="url(#a-shadow)">
        <g transform="rotate(7 307 245)">
          <rect x="190" y="60" width="250" height="386" rx="36" fill="url(#a-edge)" />
          <rect x="182" y="52" width="250" height="386" rx="34" fill="url(#a-face)" />
          <rect x="182" y="52" width="250" height="386" rx="34" fill="url(#a-weave)" />
          <rect x="268" y="70" width="78" height="13" rx="6.5" fill="#e9e4ff" opacity="0.85" />
          <g clipPath="url(#a-screen)" opacity="0.9">
            <rect x="322" y="120" width="110" height="250" fill="#2b1c8f" opacity="0.14" />
            <line x1="200" x2="414" y1="250" y2="250" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="1.5" strokeDasharray="5 5" />
            <path d="M204 252 L226 248 L246 255 L268 251 L290 247 L306 226 L322 204" fill="none" stroke="#ffffff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="322" cy="204" r="8.5" fill="url(#a-lime)" stroke="#2b1c8f" strokeWidth="2.5" />
            <text x="377" y="262" textAnchor="middle" fontSize="54" fontWeight="700" fill="#ffffff" opacity="0.5" fontFamily="'Inter Tight', system-ui, sans-serif">?</text>
          </g>
        </g>
      </g>

      <g className="float f-moon" filter="url(#a-shadow)">
        <circle cx="150" cy="118" r="58" fill="url(#a-moon)" />
        <circle cx="168" cy="136" r="13" fill="#4a36c4" opacity="0.28" />
        <circle cx="128" cy="140" r="7" fill="#4a36c4" opacity="0.24" />
        <circle cx="158" cy="92" r="9" fill="#4a36c4" opacity="0.2" />
        <ellipse cx="128" cy="92" rx="20" ry="11" fill="#ffffff" opacity="0.35" filter="url(#a-soft)" />
      </g>

      <g className="float f-candles" filter="url(#a-shadow)">
        <g transform="rotate(-10 150 360)">
          <rect x="66" y="330" width="168" height="92" rx="34" fill="url(#a-candle)" />
          <ellipse cx="118" cy="350" rx="38" ry="12" fill="#ffffff" opacity="0.28" filter="url(#a-soft)" />
          <rect x="92" y="352" width="22" height="46" rx="11" fill="url(#a-lime)" />
          <rect x="139" y="344" width="22" height="62" rx="11" fill="#e4e0ff" opacity="0.92" />
          <rect x="186" y="358" width="22" height="34" rx="11" fill="url(#a-lime)" />
          <rect x="101" y="340" width="4" height="70" rx="2" fill="#2b1c8f" opacity="0.35" />
          <rect x="148" y="334" width="4" height="82" rx="2" fill="#2b1c8f" opacity="0.3" />
          <rect x="195" y="348" width="4" height="54" rx="2" fill="#2b1c8f" opacity="0.35" />
        </g>
      </g>

      <g className="float f-bell" filter="url(#a-shadow)">
        <g className="swing">
          <circle cx="432" cy="204" r="14" fill="none" stroke="url(#a-rim)" strokeWidth="9" />
          <path d="M432 214 C384 214 364 254 362 299 C360 339 350 361 330 381 L534 381 C514 361 504 339 502 299 C500 254 480 214 432 214 Z" fill="url(#a-bell)" />
          <ellipse cx="432" cy="381" rx="104" ry="20" fill="url(#a-rim)" />
          <ellipse cx="432" cy="384" rx="86" ry="12" fill="#231a73" />
          <circle cx="432" cy="398" r="17" fill="url(#a-lime)" />
          <ellipse cx="396" cy="282" rx="15" ry="46" fill="#ffffff" opacity="0.34" transform="rotate(12 396 282)" filter="url(#a-soft)" />
        </g>
      </g>
    </svg>
  );
}
