// Deterministic pagination/scroll decision. Given the current discovery state,
// decide the next action. Stops when the cap is reached, no new profiles appear
// after N attempts, there is no next control, or a blocked/cancel state is set.

const MAX_NO_GROWTH_ATTEMPTS = 3;

export function decideNextAction({
  acceptedCount,
  maxProfiles,
  discoveredTotal,
  lastDiscoveredTotal,
  noGrowthAttempts,
  hasNextControl,
  hasScrollContainer,
  blocked,
  cancelled,
  paused
}) {
  if (cancelled) return { action: 'stop', reason: 'cancelled' };
  if (paused) return { action: 'pause', reason: 'paused' };
  if (blocked) return { action: 'stop', reason: 'blocked' };
  if (acceptedCount >= maxProfiles) return { action: 'stop', reason: 'max_profiles' };

  const grew = discoveredTotal > lastDiscoveredTotal;
  const attempts = grew ? 0 : noGrowthAttempts + 1;
  if (!grew && attempts >= MAX_NO_GROWTH_ATTEMPTS) {
    return { action: 'stop', reason: 'no_new_profiles', noGrowthAttempts: attempts };
  }
  if (hasNextControl) return { action: 'next', reason: 'has_next', noGrowthAttempts: attempts };
  if (hasScrollContainer) return { action: 'scroll', reason: 'scrollable', noGrowthAttempts: attempts };
  return { action: 'stop', reason: 'no_next_control', noGrowthAttempts: attempts };
}

export { MAX_NO_GROWTH_ATTEMPTS };
