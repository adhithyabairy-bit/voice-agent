// ============================================================
// Business Service
// Handles business data retrieval and context building.
// ============================================================

import { supabaseAdmin, isSupabaseConfigured } from '@/lib/db/supabase';
import type { Business, Service, FAQ, BusinessContext } from '@/types';

// In-memory cache for business data (refreshed every 5 minutes)
let cachedContext: BusinessContext | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Default business ID (seeded ABC Dental Clinic)
const DEFAULT_BUSINESS_ID = '00000000-0000-0000-0000-000000000001';

// Fallback data when Supabase is not configured
const FALLBACK_BUSINESS: BusinessContext = {
  business: {
    id: DEFAULT_BUSINESS_ID,
    name: 'ABC Dental Clinic',
    description: 'Family dental clinic providing general and cosmetic dental services in Hyderabad.',
    address: '123 MG Road, Banjara Hills, Hyderabad, Telangana 500034',
    phone: '+91-40-1234-5678',
    working_hours: {
      monday: '9:00 AM - 8:00 PM',
      tuesday: '9:00 AM - 8:00 PM',
      wednesday: '9:00 AM - 8:00 PM',
      thursday: '9:00 AM - 8:00 PM',
      friday: '9:00 AM - 8:00 PM',
      saturday: '9:00 AM - 8:00 PM',
      sunday: 'Closed',
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  services: [
    { id: '1', business_id: DEFAULT_BUSINESS_ID, name: 'Dental Consultation', description: 'General dental check-up and consultation', price: 500, currency: 'INR', created_at: new Date().toISOString() },
    { id: '2', business_id: DEFAULT_BUSINESS_ID, name: 'Teeth Cleaning', description: 'Professional teeth cleaning and polishing', price: 1000, currency: 'INR', created_at: new Date().toISOString() },
    { id: '3', business_id: DEFAULT_BUSINESS_ID, name: 'Root Canal', description: 'Root canal treatment', price: 5000, currency: 'INR', created_at: new Date().toISOString() },
    { id: '4', business_id: DEFAULT_BUSINESS_ID, name: 'Teeth Whitening', description: 'Professional teeth whitening treatment', price: 3000, currency: 'INR', created_at: new Date().toISOString() },
    { id: '5', business_id: DEFAULT_BUSINESS_ID, name: 'Dental Filling', description: 'Composite dental filling', price: 800, currency: 'INR', created_at: new Date().toISOString() },
    { id: '6', business_id: DEFAULT_BUSINESS_ID, name: 'Tooth Extraction', description: 'Simple tooth extraction', price: 1500, currency: 'INR', created_at: new Date().toISOString() },
    { id: '7', business_id: DEFAULT_BUSINESS_ID, name: 'Teeth Gap Treatment / Braces', description: 'Orthodontic braces, aligners, and dental gap closures', price: 15000, currency: 'INR', created_at: new Date().toISOString() },
  ],
  faqs: [
    { id: '1', business_id: DEFAULT_BUSINESS_ID, question: 'Do you accept insurance?', answer: 'Yes, we accept most major dental insurance plans.', created_at: new Date().toISOString() },
    { id: '2', business_id: DEFAULT_BUSINESS_ID, question: 'Is parking available?', answer: 'Yes, free parking is available in front of the clinic.', created_at: new Date().toISOString() },
    { id: '3', business_id: DEFAULT_BUSINESS_ID, question: 'Do I need an appointment?', answer: 'Walk-ins are welcome, but appointments are recommended to avoid waiting.', created_at: new Date().toISOString() },
    { id: '4', business_id: DEFAULT_BUSINESS_ID, question: 'What payment methods do you accept?', answer: 'We accept cash, UPI, credit/debit cards, and net banking.', created_at: new Date().toISOString() },
  ],
};

/**
 * Get full business information with services and FAQs.
 */
export async function getBusinessInfo(
  businessId: string = DEFAULT_BUSINESS_ID
): Promise<BusinessContext> {
  // Check cache first
  if (cachedContext && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedContext;
  }

  // If Supabase isn't configured, use fallback data
  if (!isSupabaseConfigured()) {
    cachedContext = FALLBACK_BUSINESS;
    cacheTimestamp = Date.now();
    return FALLBACK_BUSINESS;
  }

  try {
    // Fetch business, services, and FAQs in parallel
    const [businessResult, servicesResult, faqsResult] = await Promise.all([
      supabaseAdmin.from('businesses').select('*').eq('id', businessId).single(),
      supabaseAdmin.from('services').select('*').eq('business_id', businessId),
      supabaseAdmin.from('faqs').select('*').eq('business_id', businessId),
    ]);

    if (businessResult.error) throw businessResult.error;

    const context: BusinessContext = {
      business: businessResult.data as Business,
      services: (servicesResult.data || []) as Service[],
      faqs: (faqsResult.data || []) as FAQ[],
    };

    // Cache the result
    cachedContext = context;
    cacheTimestamp = Date.now();

    return context;
  } catch (error) {
    console.error('Error fetching business info:', error);
    // Fall back to cached or default data
    return cachedContext || FALLBACK_BUSINESS;
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
    // Update fallback data in memory
    Object.assign(FALLBACK_BUSINESS.business, data);
    cachedContext = null; // Invalidate cache
    return FALLBACK_BUSINESS.business;
  }

  try {
    const { data: updated, error } = await supabaseAdmin
      .from('businesses')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', businessId)
      .select()
      .single();

    if (error) throw error;

    cachedContext = null; // Invalidate cache
    return updated as Business;
  } catch (error) {
    console.error('Error updating business info:', error);
    return null;
  }
}
