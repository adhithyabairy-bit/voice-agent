// ============================================================
// Business Service
// Handles business data retrieval, multi-tenant resolution, and context building.
// ============================================================

import { supabaseAdmin, isSupabaseConfigured } from '@/lib/db/supabase';
import type { Business, Agent, Service, FAQ, BusinessContext } from '@/types';

// In-memory cache for business data (keyed by businessId or ownerId)
const contextCache = new Map<string, { context: BusinessContext; timestamp: number }>();
const CACHE_TTL = 3 * 60 * 1000; // 3 minutes

// Generic fallback if Supabase is completely empty or offline
const GENERIC_FALLBACK_BUSINESS: BusinessContext = {
  business: {
    id: 'generic-demo-id',
    business_name: 'Smart Reception AI',
    business_type: 'service',
    description: 'Professional AI voice receptionist answering customer inquiries, booking appointments, and sharing business details.',
    phone: '+91-98765-43210',
    email: 'contact@smartreception.ai',
    address: 'Banjara Hills, Hyderabad, Telangana 500034',
    working_hours: {
      monday: '9:00 AM - 7:00 PM',
      tuesday: '9:00 AM - 7:00 PM',
      wednesday: '9:00 AM - 7:00 PM',
      thursday: '9:00 AM - 7:00 PM',
      friday: '9:00 AM - 7:00 PM',
      saturday: '10:00 AM - 5:00 PM',
      sunday: 'Closed',
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  agent: {
    id: 'agent-demo-id',
    business_id: 'generic-demo-id',
    agent_name: 'Aditya',
    language: 'te-IN',
    voice: 'aditya',
    response_style: 'friendly',
    personality: 'Courteous, helpful receptionist who speaks naturally and helps customers with their inquiries.',
    greeting: 'నమస్కారం! నేను మీకు ఎలా సహాయపడగలను?',
    fallback_message: 'క్షమించండి, మీ మాట సరిగా వినపడలేదు. మళ్లీ చెప్పగలరా?',
    is_active: true,
  },
  services: [
    { id: '1', business_id: 'generic-demo-id', name: 'General Consultation', description: 'Schedule an initial inquiry or consultation.', price: 500, currency: 'INR', duration_minutes: 30 },
    { id: '2', business_id: 'generic-demo-id', name: 'Express Service', description: 'Priority service appointment.', price: 1000, currency: 'INR', duration_minutes: 45 },
  ],
  faqs: [
    { id: '1', business_id: 'generic-demo-id', question: 'Do I need an appointment?', answer: 'Walk-ins are accepted depending on availability, but booking in advance is strongly recommended.' },
    { id: '2', business_id: 'generic-demo-id', question: 'What payment methods do you accept?', answer: 'We accept UPI, cash, and all major debit and credit cards.' },
  ],
};

/**
 * Invalidate the cache for a given business or all.
 */
export function invalidateBusinessCache(key?: string) {
  if (key) {
    contextCache.delete(key);
  } else {
    contextCache.clear();
  }
}

/**
 * Get full business information with services, FAQs, and active agent.
 * Accepts either a businessId or ownerId.
 */
export async function getBusinessInfo(
  businessId?: string,
  ownerId?: string
): Promise<BusinessContext> {
  const cacheKey = businessId || ownerId || 'default';
  const cached = contextCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.context;
  }

  if (!isSupabaseConfigured()) {
    return GENERIC_FALLBACK_BUSINESS;
  }

  try {
    let resolvedBusinessId = businessId;
    let businessData: Business | null = null;

    if (resolvedBusinessId) {
      const { data, error } = await supabaseAdmin
        .from('businesses')
        .select('*')
        .eq('id', resolvedBusinessId)
        .single();
      if (!error && data) businessData = data as Business;
    } else if (ownerId) {
      const { data, error } = await supabaseAdmin
        .from('businesses')
        .select('*')
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (!error && data) {
        businessData = data as Business;
        resolvedBusinessId = businessData.id;
      }
    }

    // If still no business found, grab the most recently created business
    if (!businessData) {
      const { data, error } = await supabaseAdmin
        .from('businesses')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (!error && data) {
        businessData = data as Business;
        resolvedBusinessId = businessData.id;
      }
    }

    if (!businessData || !resolvedBusinessId) {
      return GENERIC_FALLBACK_BUSINESS;
    }

    // Fetch agent, services, and faqs in parallel
    const [agentRes, servicesRes, faqsRes] = await Promise.all([
      supabaseAdmin
        .from('agents')
        .select('*')
        .eq('business_id', resolvedBusinessId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
      supabaseAdmin
        .from('services')
        .select('*')
        .eq('business_id', resolvedBusinessId)
        .order('created_at', { ascending: true }),
      supabaseAdmin
        .from('faqs')
        .select('*')
        .eq('business_id', resolvedBusinessId)
        .order('created_at', { ascending: true }),
    ]);

    const context: BusinessContext = {
      business: {
        ...businessData,
        name: businessData.business_name || (businessData as any).name,
      },
      agent: agentRes.data ? (agentRes.data as Agent) : null,
      services: (servicesRes.data || []) as Service[],
      faqs: (faqsRes.data || []) as FAQ[],
    };

    contextCache.set(cacheKey, { context, timestamp: Date.now() });
    if (resolvedBusinessId) {
      contextCache.set(resolvedBusinessId, { context, timestamp: Date.now() });
    }

    return context;
  } catch (error) {
    console.error('Error fetching business info:', error);
    return GENERIC_FALLBACK_BUSINESS;
  }
}

/**
 * Update business information.
 */
export async function updateBusinessInfo(
  businessId: string,
  data: Partial<Business>
): Promise<Business | null> {
  if (!isSupabaseConfigured()) {
    Object.assign(GENERIC_FALLBACK_BUSINESS.business, data);
    invalidateBusinessCache();
    return GENERIC_FALLBACK_BUSINESS.business;
  }

  try {
    const updatePayload: Record<string, any> = { ...data, updated_at: new Date().toISOString() };
    if (data.business_name) {
      updatePayload.name = data.business_name;
    }
    const { data: updated, error } = await supabaseAdmin
      .from('businesses')
      .update(updatePayload)
      .eq('id', businessId)
      .select()
      .single();

    if (error) throw error;

    invalidateBusinessCache(businessId);
    return updated as Business;
  } catch (error) {
    console.error('Error updating business info:', error);
    return null;
  }
}
