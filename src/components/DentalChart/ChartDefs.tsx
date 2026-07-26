/** Shared SVG paint servers — clinical white→gray gradient + soft shadows */
export function ChartDefs() {
  return (
    <defs>
      <linearGradient id="dc-fill" x1="30%" y1="8%" x2="72%" y2="96%">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="52%" stopColor="#F7F7F7" />
        <stop offset="100%" stopColor="#E9E9E9" />
      </linearGradient>
      <linearGradient id="dc-selected" x1="30%" y1="8%" x2="72%" y2="96%">
        <stop offset="0%" stopColor="#A78BFA" />
        <stop offset="45%" stopColor="#7C3AED" />
        <stop offset="100%" stopColor="#6D28D9" />
      </linearGradient>
      <filter id="dc-glow" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="1" stdDeviation="1.1" floodColor="#000000" floodOpacity="0.11" />
      </filter>
      <filter id="dc-hover" x="-45%" y="-45%" width="190%" height="190%">
        <feDropShadow dx="0" dy="1.5" stdDeviation="1.8" floodColor="#5B21B6" floodOpacity="0.2" />
      </filter>
      <filter id="dc-selected-glow" x="-55%" y="-55%" width="210%" height="210%">
        <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor="#7C3AED" floodOpacity="0.48" />
      </filter>
    </defs>
  );
}
