// ============================================================
// Voice Session Management & Hot Business Context Cache
// Preloads and retains business configuration in memory for the duration of a call.
// Prevents redundant Supabase queries on every caller turn.
// ============================================================

import type { BusinessContext } from '@/types';
import type { VoiceSessionContext } from './types';

// In-memory session cache
const hotContextStore = new Map<string, VoiceSessionContext>();

/**
 * Convert dynamic BusinessContext into a hot, zero-delay VoiceSessionContext.
 */
export function buildVoiceSessionContext(context: BusinessContext): VoiceSessionContext {
  const { business, services = [], faqs = [] } = context;

  const bName = business.business_name || (business as { name?: string }).name || 'Smart Business';
  const hoursFormatted = business.working_hours
    ? Object.entries(business.working_hours)
        .map(([day, hrs]) => `${day}: ${hrs}`)
        .join(', ')
    : 'Mon-Sat 9AM-7PM';

  const servicesList = services.map(
    (s) => `${s.name}${s.price ? ` (₹${s.price})` : ''}${s.description ? `: ${s.description}` : ''}`
  );

  const faqsList = faqs.map((f) => `Q: ${f.question} A: ${f.answer}`);

  const sessionContext: VoiceSessionContext = {
    businessId: business.id,
    businessName: bName,
    description: business.description || 'Professional customer services.',
    services: servicesList,
    hours: hoursFormatted,
    location: business.address || undefined,
    contact: business.phone || undefined,
    faqs: faqsList,
    rawContext: context,
  };

  // Cache in-memory
  hotContextStore.set(business.id, sessionContext);

  return sessionContext;
}

export function getHotSessionContext(businessId: string): VoiceSessionContext | undefined {
  return hotContextStore.get(businessId);
}

export function clearHotSessionContext(businessId?: string): void {
  if (businessId) {
    hotContextStore.delete(businessId);
  } else {
    hotContextStore.clear();
  }
}
