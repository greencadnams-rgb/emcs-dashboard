const rateLimit = new Map();

export default function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxRequests = 15;

  if (!rateLimit.has(ip)) {
    rateLimit.set(ip, []);
  }

  // Remove old entries outside the time window
  const requests = rateLimit.get(ip).filter(time => now - time < windowMs);

  if (requests.length >= maxRequests) {
    return false; // Blocked
  }

  requests.push(now);
  rateLimit.set(ip, requests);
  return true; // Allowed
}
