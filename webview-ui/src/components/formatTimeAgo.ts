/** "just now" / "12s ago" / "3m ago" / "2h ago". `0` is the "never" sentinel. */
export function formatTimeAgo(ms: number, now = Date.now()): string {
  if (ms === 0) return 'never';
  const seconds = Math.round((now - ms) / 1000);
  if (seconds < 2) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}
