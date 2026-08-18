export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="7" y="5" width="25" height="32" rx="5" fill="currentColor" opacity="0.12" />
      <path d="M14 12h12M14 18h10M14 24h7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="32" cy="32" r="11" fill="var(--surface)" stroke="currentColor" strokeWidth="3" />
      <path d="m27 32 3.2 3.2L37 28.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
