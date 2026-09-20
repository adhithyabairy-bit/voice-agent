-- ============================================================
-- Migration: Multi-Business AI Voice Agent Platform Schema
-- Enables pgvector, creates multi-tenant tables, RLS policies,
-- search functions, and user profile sync trigger.
-- ============================================================

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- 2. Profiles Table (linked to Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Businesses Table
CREATE TABLE IF NOT EXISTS public.businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  business_type TEXT NOT NULL, -- e.g. clinic, restaurant, salon, gym, real_estate, dealership, education, retail, professional_services, other
  description TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT DEFAULT 'India',
  working_hours JSONB DEFAULT '{"monday":"9:00 AM - 8:00 PM","tuesday":"9:00 AM - 8:00 PM","wednesday":"9:00 AM - 8:00 PM","thursday":"9:00 AM - 8:00 PM","friday":"9:00 AM - 8:00 PM","saturday":"9:00 AM - 8:00 PM","sunday":"Closed"}'::jsonb,
  timezone TEXT DEFAULT 'Asia/Kolkata',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Agents Table
CREATE TABLE IF NOT EXISTS public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL DEFAULT 'Receptionist',
  language TEXT NOT NULL DEFAULT 'te-IN', -- 'te-IN', 'hi-IN', 'en-IN'
  voice TEXT NOT NULL DEFAULT 'aditya',
  response_style TEXT NOT NULL DEFAULT 'friendly', -- 'friendly', 'professional', 'concise'
  personality TEXT,
  system_prompt TEXT,
  greeting TEXT,
  fallback_message TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Services Table
CREATE TABLE IF NOT EXISTS public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC,
  currency TEXT NOT NULL DEFAULT 'INR',
  duration_minutes INTEGER,
  availability TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. FAQs Table
CREATE TABLE IF NOT EXISTS public.faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Knowledge Documents Table
CREATE TABLE IF NOT EXISTS public.knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  source_type TEXT NOT NULL DEFAULT 'text', -- 'text', 'faq', 'policy', 'upload'
  file_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Knowledge Chunks Table (RAG Vector Storage)
CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  document_id UUID REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(384),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Calls Table
CREATE TABLE IF NOT EXISTS public.calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  caller_number TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed', -- 'connecting', 'in-progress', 'completed', 'failed', 'missed'
  language TEXT NOT NULL DEFAULT 'te-IN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. Call Messages Table
CREATE TABLE IF NOT EXISTS public.call_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  speaker TEXT NOT NULL CHECK (speaker IN ('user', 'assistant', 'system')),
  message TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. Call Summaries Table
CREATE TABLE IF NOT EXISTS public.call_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE UNIQUE,
  summary TEXT,
  customer_intent TEXT,
  lead_status TEXT NOT NULL DEFAULT 'none', -- 'none', 'interested', 'converted', 'lost'
  follow_up_required BOOLEAN NOT NULL DEFAULT false,
  extracted_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Indexes for High Performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_businesses_owner ON public.businesses(owner_id);
CREATE INDEX IF NOT EXISTS idx_agents_business ON public.agents(business_id);
CREATE INDEX IF NOT EXISTS idx_services_business ON public.services(business_id);
CREATE INDEX IF NOT EXISTS idx_faqs_business ON public.faqs(business_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_business ON public.knowledge_documents(business_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_business ON public.knowledge_chunks(business_id);
CREATE INDEX IF NOT EXISTS idx_calls_business ON public.calls(business_id);
CREATE INDEX IF NOT EXISTS idx_calls_agent ON public.calls(agent_id);
CREATE INDEX IF NOT EXISTS idx_call_messages_call ON public.call_messages(call_id);
CREATE INDEX IF NOT EXISTS idx_call_summaries_call ON public.call_summaries(call_id);

-- ============================================================
-- Vector Search Function
-- ============================================================
CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(
  p_business_id UUID,
  p_embedding vector(384),
  p_match_threshold FLOAT DEFAULT 0.2,
  p_match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  similarity FLOAT,
  metadata JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.content,
    1 - (kc.embedding <=> p_embedding) AS similarity,
    kc.metadata
  FROM public.knowledge_chunks kc
  WHERE kc.business_id = p_business_id
    AND (kc.embedding IS NOT NULL)
    AND (1 - (kc.embedding <=> p_embedding)) > p_match_threshold
  ORDER BY kc.embedding <=> p_embedding
  LIMIT p_match_count;
END;
$$;

-- ============================================================
-- Profile Auto-Creation Trigger from auth.users
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
      updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_summaries ENABLE ROW LEVEL SECURITY;

-- 1. Profiles Policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- 2. Businesses Policies
DROP POLICY IF EXISTS "Owners can view own business" ON public.businesses;
CREATE POLICY "Owners can view own business" ON public.businesses
  FOR SELECT USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can insert own business" ON public.businesses;
CREATE POLICY "Owners can insert own business" ON public.businesses
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can update own business" ON public.businesses;
CREATE POLICY "Owners can update own business" ON public.businesses
  FOR UPDATE USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can delete own business" ON public.businesses;
CREATE POLICY "Owners can delete own business" ON public.businesses
  FOR DELETE USING (auth.uid() = owner_id);

-- 3. Agents Policies
DROP POLICY IF EXISTS "Owners can view business agents" ON public.agents;
CREATE POLICY "Owners can view business agents" ON public.agents
  FOR SELECT USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Owners can insert business agents" ON public.agents;
CREATE POLICY "Owners can insert business agents" ON public.agents
  FOR INSERT WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Owners can update business agents" ON public.agents;
CREATE POLICY "Owners can update business agents" ON public.agents
  FOR UPDATE USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Owners can delete business agents" ON public.agents;
CREATE POLICY "Owners can delete business agents" ON public.agents
  FOR DELETE USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

-- 4. Services Policies
DROP POLICY IF EXISTS "Owners can view business services" ON public.services;
CREATE POLICY "Owners can view business services" ON public.services
  FOR SELECT USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Owners can insert business services" ON public.services;
CREATE POLICY "Owners can insert business services" ON public.services
  FOR INSERT WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Owners can update business services" ON public.services;
CREATE POLICY "Owners can update business services" ON public.services
  FOR UPDATE USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Owners can delete business services" ON public.services;
CREATE POLICY "Owners can delete business services" ON public.services
  FOR DELETE USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

-- 5. FAQs Policies
DROP POLICY IF EXISTS "Owners can view business faqs" ON public.faqs;
CREATE POLICY "Owners can view business faqs" ON public.faqs
  FOR SELECT USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Owners can insert business faqs" ON public.faqs;
CREATE POLICY "Owners can insert business faqs" ON public.faqs
  FOR INSERT WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Owners can update business faqs" ON public.faqs;
CREATE POLICY "Owners can update business faqs" ON public.faqs
  FOR UPDATE USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Owners can delete business faqs" ON public.faqs;
CREATE POLICY "Owners can delete business faqs" ON public.faqs
  FOR DELETE USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

-- 6. Knowledge Documents Policies
DROP POLICY IF EXISTS "Owners can view business knowledge docs" ON public.knowledge_documents;
CREATE POLICY "Owners can view business knowledge docs" ON public.knowledge_documents
  FOR SELECT USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Owners can insert business knowledge docs" ON public.knowledge_documents;
CREATE POLICY "Owners can insert business knowledge docs" ON public.knowledge_documents
  FOR INSERT WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Owners can update business knowledge docs" ON public.knowledge_documents;
CREATE POLICY "Owners can update business knowledge docs" ON public.knowledge_documents
  FOR UPDATE USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Owners can delete business knowledge docs" ON public.knowledge_documents;
CREATE POLICY "Owners can delete business knowledge docs" ON public.knowledge_documents
  FOR DELETE USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

-- 7. Knowledge Chunks Policies
DROP POLICY IF EXISTS "Owners can view business knowledge chunks" ON public.knowledge_chunks;
CREATE POLICY "Owners can view business knowledge chunks" ON public.knowledge_chunks
  FOR SELECT USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Owners can insert business knowledge chunks" ON public.knowledge_chunks;
CREATE POLICY "Owners can insert business knowledge chunks" ON public.knowledge_chunks
  FOR INSERT WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Owners can update business knowledge chunks" ON public.knowledge_chunks;
CREATE POLICY "Owners can update business knowledge chunks" ON public.knowledge_chunks
  FOR UPDATE USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Owners can delete business knowledge chunks" ON public.knowledge_chunks;
CREATE POLICY "Owners can delete business knowledge chunks" ON public.knowledge_chunks
  FOR DELETE USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

-- 8. Calls Policies
DROP POLICY IF EXISTS "Owners can view business calls" ON public.calls;
CREATE POLICY "Owners can view business calls" ON public.calls
  FOR SELECT USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Owners can insert business calls" ON public.calls;
CREATE POLICY "Owners can insert business calls" ON public.calls
  FOR INSERT WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Owners can update business calls" ON public.calls;
CREATE POLICY "Owners can update business calls" ON public.calls
  FOR UPDATE USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

-- 9. Call Messages Policies
DROP POLICY IF EXISTS "Owners can view call messages" ON public.call_messages;
CREATE POLICY "Owners can view call messages" ON public.call_messages
  FOR SELECT USING (call_id IN (SELECT id FROM public.calls WHERE business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())));

DROP POLICY IF EXISTS "Owners can insert call messages" ON public.call_messages;
CREATE POLICY "Owners can insert call messages" ON public.call_messages
  FOR INSERT WITH CHECK (call_id IN (SELECT id FROM public.calls WHERE business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())));

-- 10. Call Summaries Policies
DROP POLICY IF EXISTS "Owners can view call summaries" ON public.call_summaries;
CREATE POLICY "Owners can view call summaries" ON public.call_summaries
  FOR SELECT USING (call_id IN (SELECT id FROM public.calls WHERE business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())));

DROP POLICY IF EXISTS "Owners can insert call summaries" ON public.call_summaries;
CREATE POLICY "Owners can insert call summaries" ON public.call_summaries
  FOR INSERT WITH CHECK (call_id IN (SELECT id FROM public.calls WHERE business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())));
