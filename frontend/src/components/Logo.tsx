/**
 * ReadLabs brand mark: a vermillion tile with a serif "R".
 * Mirrors /favicon.svg so the navbar lockup matches the browser-tab icon.
 * Decorative (aria-hidden) — always paired with the visible "ReadLabs" wordmark.
 */
export default function Logo({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect width="512" height="512" rx="72" fill="#b23a16" />
      <text
        x="256"
        y="250"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="'Fraunces', Georgia, 'Times New Roman', serif"
        fontWeight="700"
        fontSize="328"
        fill="#ffffff"
      >
        R
      </text>
    </svg>
  );
}
