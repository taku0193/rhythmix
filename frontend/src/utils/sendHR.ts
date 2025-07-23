let lastSent = 0

export function sendHR(hr: number | null, confidence?: number, intervalMs = 2000) {
  if (hr == null) return
  const now = Date.now()
  if (now - lastSent < intervalMs) return
  lastSent = now

  fetch('/api/hr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hr, confidence }),
  }).catch(console.warn)
}
