export default function BotUserLabel() {
  return (
    <span className="bot-user-label" title="Bot account">
      <svg
        aria-hidden="true"
        fill="none"
        height="10"
        viewBox="0 0 16 16"
        width="10"
      >
        <path d="M8 1.5v2" />
        <circle cx="8" cy="1.5" r=".75" fill="currentColor" stroke="none" />
        <rect height="8" rx="2" width="12" x="2" y="3.5" />
        <circle cx="5.5" cy="7.5" r=".75" fill="currentColor" stroke="none" />
        <circle cx="10.5" cy="7.5" r=".75" fill="currentColor" stroke="none" />
        <path d="M5.5 10h5M4.5 13.5h7" />
      </svg>
      <span>Bot</span>
    </span>
  );
}
