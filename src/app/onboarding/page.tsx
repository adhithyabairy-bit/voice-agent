'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { supabase } from '@/lib/db/supabase';
import { authFetch } from '@/lib/api/auth-fetch';
import {
  Building2,
  Bot,
  Layers,
  HelpCircle,
  FileText,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Plus,
  Trash2,
  Sparkles,
  Loader2,
  Lock,
  X,
} from 'lucide-react';

interface ServiceItem {
  name: string;
  description: string;
  price: number | '';
  duration_minutes: number | '';
}

interface FAQItem {
  question: string;
  answer: string;
}

const BUSINESS_TEMPLATES: Record<string, { services: ServiceItem[]; faqs: FAQItem[] }> = {
  clinic: {
    services: [
      { name: 'General Consultation', description: 'Comprehensive doctor checkup and initial evaluation', price: 500, duration_minutes: 30 },
      { name: 'Follow-up Checkup', description: 'Review of lab tests and prescription checkup', price: 300, duration_minutes: 15 },
      { name: 'Dental Cleaning', description: 'Complete dental scaling and polishing', price: 1200, duration_minutes: 45 },
    ],
    faqs: [
      { question: 'Do I need an appointment?', answer: 'Walk-ins are accommodated when slots are open, but booking in advance avoids waiting.' },
      { question: 'Do you accept health insurance?', answer: 'Yes, we accept major cashless health insurance providers.' },
      { question: 'Where is parking located?', answer: 'Complimentary patient parking is available directly in front of the building.' },
    ],
  },
  restaurant: {
    services: [
      { name: 'Table Reservation (2-4 People)', description: 'Indoor dining table booking with standard seating', price: 0, duration_minutes: 90 },
      { name: 'Family / Group Dining (5+ People)', description: 'Large booth or banquet seating reservation', price: 0, duration_minutes: 120 },
      { name: 'Party Hall Booking', description: 'Private celebration space for birthdays and events', price: 5000, duration_minutes: 240 },
    ],
    faqs: [
      { question: 'Do you have vegetarian and vegan choices?', answer: 'Yes! We have extensive pure vegetarian and vegan menu sections.' },
      { question: 'Is home delivery available?', answer: 'Yes, you can order online via Swiggy, Zomato, or direct phone call.' },
      { question: 'What are your peak hours?', answer: 'Our lunch peak is 1:00 PM to 3:00 PM and dinner peak is 8:00 PM to 10:30 PM.' },
    ],
  },
  salon: {
    services: [
      { name: 'Signature Haircut & Styling', description: 'Hair wash, personalized cut, blow dry, and styling', price: 600, duration_minutes: 45 },
      { name: 'Keratin Hair Spa', description: 'Deep nourishing treatment with essential oils and steam', price: 1800, duration_minutes: 60 },
      { name: 'Bridal / Party Makeup', description: 'High-definition makeup and hair setting for special events', price: 4500, duration_minutes: 120 },
    ],
    faqs: [
      { question: 'Do I need to book in advance?', answer: 'Advance booking is recommended, especially for weekends and bridal styling.' },
      { question: 'Which hair care brands do you use?', answer: 'We exclusively use premium international brands like L’Oréal Professional and Schwarzkopf.' },
    ],
  },
  gym: {
    services: [
      { name: 'Monthly Gym Membership', description: 'Unlimited access to cardio, weights, and locker facilities', price: 2000, duration_minutes: 0 },
      { name: 'Personal Training (12 Sessions)', description: 'Dedicated certified trainer with custom diet roadmap', price: 8000, duration_minutes: 60 },
      { name: 'Trial Day Pass', description: 'One-day trial session with facility walkthrough', price: 200, duration_minutes: 120 },
    ],
    faqs: [
      { question: 'What are the gym timings?', answer: 'We are open Monday to Saturday from 6:00 AM to 10:00 PM, and Sunday 7:00 AM to 1:00 PM.' },
      { question: 'Is personal training mandatory?', answer: 'No, our floor trainers are always present to assist you with equipment.' },
    ],
  },
  real_estate: {
    services: [
      { name: 'Property Site Visit', description: 'Guided physical inspection of available apartments or villas', price: 0, duration_minutes: 60 },
      { name: 'Investment Consultation', description: '1-on-1 portfolio consultation on high-ROI commercial and residential plots', price: 0, duration_minutes: 45 },
    ],
    faqs: [
      { question: 'Are all listed properties RERA approved?', answer: 'Yes, 100% of our featured projects are fully RERA approved with clear legal titles.' },
      { question: 'Do you offer home loan assistance?', answer: 'Yes, our banking partners offer pre-approved home loans at competitive rates.' },
    ],
  },
  dealership: {
    services: [
      { name: 'New Vehicle Test Drive', description: 'Test drive at showroom or home delivery test drive', price: 0, duration_minutes: 45 },
      { name: 'Vehicle Periodic Maintenance', description: 'Full synthetic oil change, brake check, and 40-point inspection', price: 3500, duration_minutes: 180 },
      { name: 'Old Vehicle Valuation', description: 'Free transparent evaluation for exchange or resale', price: 0, duration_minutes: 30 },
    ],
    faqs: [
      { question: 'Can I exchange my old car/bike?', answer: 'Yes, we provide instant exchange bonus offers on all models.' },
      { question: 'Do you offer fast financing?', answer: 'Yes, on-spot loan approvals with minimal documentation.' },
    ],
  },
  education: {
    services: [
      { name: 'Campus Tour & Counseling', description: 'Walkthrough of classrooms, labs, and interactive curriculum counseling', price: 0, duration_minutes: 60 },
      { name: 'Admission Assessment Test', description: 'Aptitude and subject placement test for new applicants', price: 500, duration_minutes: 90 },
    ],
    faqs: [
      { question: 'When does the admission cycle close?', answer: 'Admissions are open until seats are filled for the upcoming academic semester.' },
      { question: 'Is transport/bus facility available?', answer: 'Yes, GPS-tracked bus routes cover all major localities in the city.' },
    ],
  },
  service: {
    services: [
      { name: 'Initial Consultation', description: 'Explore requirements, timeline, and scope of work', price: 500, duration_minutes: 30 },
      { name: 'Standard Project Service', description: 'Full execution based on agreed deliverables', price: 5000, duration_minutes: 120 },
    ],
    faqs: [
      { question: 'What is your response time?', answer: 'We typically respond to requests and inquiries within 1 to 2 business hours.' },
      { question: 'What payment methods do you accept?', answer: 'We accept UPI, bank transfers, credit/debit cards, and cash.' },
    ],
  },
};

export default function OnboardingPage() {
  const router = useRouter();
  const { user, business } = useAuth();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Authentication modal state for unauthenticated launch attempts
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authLoading, setAuthLoading] = useState(false);
  const [authModalError, setAuthModalError] = useState<string | null>(null);

  // Step 1: Business details
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState('clinic');
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(user?.email || '');
  const [address, setAddress] = useState('');

  // Step 2: Agent persona
  const [agentName, setAgentName] = useState('Aditya');
  const [language, setLanguage] = useState<'te-IN' | 'hi-IN' | 'en-IN'>('te-IN');
  const [voice, setVoice] = useState('aditya');
  const [responseStyle, setResponseStyle] = useState<'friendly' | 'professional' | 'concise'>('friendly');
  const [customGreeting, setCustomGreeting] = useState('');

  // Step 3: Services
  const [services, setServices] = useState<ServiceItem[]>(BUSINESS_TEMPLATES.clinic.services);

  // Step 4: FAQs
  const [faqs, setFaqs] = useState<FAQItem[]>(BUSINESS_TEMPLATES.clinic.faqs);

  // Step 5: Knowledge doc
  const [docTitle, setDocTitle] = useState('Business Policies & Information');
  const [docContent, setDocContent] = useState('');

  // Handle template switch when business type changes
  const handleTypeChange = (type: string) => {
    setBusinessType(type);
    const template = BUSINESS_TEMPLATES[type] || BUSINESS_TEMPLATES.service;
    setServices(template.services);
    setFaqs(template.faqs);
  };

  // Add/remove services
  const addService = () => {
    setServices([...services, { name: '', description: '', price: '', duration_minutes: '' }]);
  };
  const removeService = (index: number) => {
    setServices(services.filter((_, i) => i !== index));
  };
  const updateService = (index: number, field: keyof ServiceItem, value: any) => {
    const updated = [...services];
    updated[index] = { ...updated[index], [field]: value };
    setServices(updated);
  };

  // Add/remove FAQs
  const addFaq = () => {
    setFaqs([...faqs, { question: '', answer: '' }]);
  };
  const removeFaq = (index: number) => {
    setFaqs(faqs.filter((_, i) => i !== index));
  };
  const updateFaq = (index: number, field: keyof FAQItem, value: string) => {
    const updated = [...faqs];
    updated[index] = { ...updated[index], [field]: value };
    setFaqs(updated);
  };

  const dynamicGreetingPreview = customGreeting || (
    language === 'te-IN'
      ? `నమస్కారం! ${businessName || 'మా సంస్థ'}కి స్వాగతం. నేను ${agentName || 'AI'}. నేను మీకు ఎలా సహాయపడగలను?`
      : language === 'hi-IN'
      ? `नमस्ते! ${businessName || 'हमारी संस्था'} में आपका स्वागत है। मैं ${agentName || 'AI'} हूँ। मैं आपकी क्या मदद कर सकता हूँ?`
      : `Hello! Welcome to ${businessName || 'our business'}. My name is ${agentName || 'AI'}. How can I assist you today?`
  );

  const handleSubmit = async () => {
    if (!businessName.trim()) {
      setError('Please provide a business name.');
      setStep(1);
      return;
    }

    // Check if user has an active session before submitting
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      setAuthEmail(email || user?.email || '');
      setShowAuthModal(true);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        business_name: businessName,
        business_type: businessType,
        description,
        phone,
        email: email || session.user.email || '',
        address,
        agent_name: agentName,
        language,
        voice,
        response_style: responseStyle,
        greeting: customGreeting || dynamicGreetingPreview,
        services: services.filter(s => s.name.trim()),
        faqs: faqs.filter(f => f.question.trim() && f.answer.trim()),
        knowledge_docs: docContent.trim() ? [{ title: docTitle, content: docContent }] : [],
      };

      const res = await authFetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          setAuthEmail(email || user?.email || '');
          setShowAuthModal(true);
          return;
        }
        throw new Error(data.error || 'Failed to complete onboarding');
      }

      // Successful onboarding! Redirect straight to the live agent to test it out!
      router.push('/agent?onboarded=true');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleModalAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPassword) return;

    setAuthLoading(true);
    setAuthModalError(null);

    try {
      if (authMode === 'signup') {
        const regRes = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: authEmail, password: authPassword, fullName: businessName }),
        });
        const regData = await regRes.json();
        if (!regRes.ok && regRes.status !== 409) {
          throw new Error(regData.error || 'Failed to sign up');
        }
      }

      let { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword,
      });

      if (signInError && signInError.message.toLowerCase().includes('email not confirmed')) {
        await fetch('/api/auth/auto-confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: authEmail }),
        });
        const retry = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        });
        data = retry.data;
        signInError = retry.error;
      }

      if (signInError) {
        throw signInError;
      }

      if (data?.session?.access_token && typeof document !== 'undefined') {
        const maxAge = data.session.expires_in || 3600;
        document.cookie = `sb-access-token=${data.session.access_token}; path=/; max-age=${maxAge}; SameSite=Lax`;
      }

      setShowAuthModal(false);
      // Wait a tick for auth state to update, then submit onboarding
      setTimeout(() => {
        handleSubmit();
      }, 150);
    } catch (err: any) {
      setAuthModalError(err.message || 'Authentication failed. Please verify your email and password.');
    } finally {
      setAuthLoading(false);
    }
  };

  const steps = [
    { num: 1, label: 'Business Profile', icon: Building2 },
    { num: 2, label: 'Agent Persona', icon: Bot },
    { num: 3, label: 'Services & Pricing', icon: Layers },
    { num: 4, label: 'Common FAQs', icon: HelpCircle },
    { num: 5, label: 'Knowledge Base', icon: FileText },
    { num: 6, label: 'Review & Launch', icon: Sparkles },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center py-10 px-4">
      {/* Header */}
      <div className="max-w-4xl w-full text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-3">
          <Sparkles className="w-3.5 h-3.5" /> Fast AI Setup
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
          Create Your AI Voice Receptionist
        </h1>
        <p className="mt-2 text-slate-400 text-sm sm:text-base max-w-xl mx-auto">
          Set up your business profile, customize your voice persona, and launch a multilingual AI receptionist in minutes.
        </p>
      </div>

      {/* Step Indicator */}
      <div className="max-w-4xl w-full mb-8 overflow-x-auto pb-2">
        <div className="flex items-center justify-between min-w-[600px] px-4">
          {steps.map((s, idx) => {
            const Icon = s.icon;
            const isCompleted = step > s.num;
            const isCurrent = step === s.num;
            return (
              <React.Fragment key={s.num}>
                <button
                  type="button"
                  onClick={() => s.num < step && setStep(s.num)}
                  disabled={s.num > step}
                  className={`flex flex-col items-center gap-1.5 transition-colors ${
                    isCurrent ? 'text-emerald-400' : isCompleted ? 'text-slate-200' : 'text-slate-600'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all ${
                      isCurrent
                        ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300 shadow-lg shadow-emerald-500/20'
                        : isCompleted
                        ? 'border-emerald-500/60 bg-emerald-950 text-emerald-400'
                        : 'border-slate-800 bg-slate-900 text-slate-500'
                    }`}
                  >
                    {isCompleted ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <Icon className="w-5 h-5" />}
                  </div>
                  <span className="text-xs font-medium">{s.label}</span>
                </button>
                {idx < steps.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-2 transition-colors ${
                      step > s.num ? 'bg-emerald-500/60' : 'bg-slate-800'
                    }`}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Main Wizard Card */}
      <div className="max-w-3xl w-full bg-slate-900/90 border border-slate-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>{error}</div>
            {(error.toLowerCase().includes('sign in') || error.toLowerCase().includes('unauthorized')) && (
              <button
                type="button"
                onClick={() => {
                  setAuthEmail(email || user?.email || '');
                  setShowAuthModal(true);
                }}
                className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs shrink-0 transition shadow-md shadow-emerald-500/20"
              >
                Sign In & Launch Now
              </button>
            )}
          </div>
        )}

        {/* STEP 1: Business Profile */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-400" /> Business Profile
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                Tell us about your business. Your agent uses this identity to represent you.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Business Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Health Clinic, Royal Spice Bistro, Urban Salon"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Industry / Business Type
                </label>
                <select
                  value={businessType}
                  onChange={(e) => handleTypeChange(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                >
                  <option value="clinic">Clinic / Hospital / Healthcare</option>
                  <option value="restaurant">Restaurant / Cafe / Food Service</option>
                  <option value="salon">Salon / Spa / Beauty Wellness</option>
                  <option value="gym">Gym / Fitness Center / Yoga</option>
                  <option value="real_estate">Real Estate / Housing / PropTech</option>
                  <option value="dealership">Automobile Dealership / Service Center</option>
                  <option value="education">Educational Institute / Academy / Coaching</option>
                  <option value="retail">Retail Store / Boutique</option>
                  <option value="professional_services">Professional Services (Legal / CA / Consulting)</option>
                  <option value="service">Local Services / Contracting / Other</option>
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  Selecting an industry auto-fills recommended services and FAQs for quick setup.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  About Your Business
                </label>
                <textarea
                  rows={3}
                  placeholder="Briefly describe what your business does and what makes it special..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    Contact Phone
                  </label>
                  <input
                    type="text"
                    placeholder="+91-98765-43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    Contact Email
                  </label>
                  <input
                    type="email"
                    placeholder="contact@mybusiness.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Full Address & Location
                </label>
                <input
                  type="text"
                  placeholder="Road No 12, Banjara Hills, Hyderabad, Telangana"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Agent Persona */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Bot className="w-5 h-5 text-emerald-400" /> Voice Agent Persona
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                Customize how your AI receptionist introduces itself, sounds, and interacts.
              </p>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    Agent Name
                  </label>
                  <input
                    type="text"
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    placeholder="e.g. Aditya, Ritu, Priya, Maya"
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    Primary Language
                  </label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as any)}
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  >
                    <option value="te-IN">Telugu (తెలుగు)</option>
                    <option value="hi-IN">Hindi (हिन्दी)</option>
                    <option value="en-IN">Indian English</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    Voice Preset
                  </label>
                  <select
                    value={voice}
                    onChange={(e) => setVoice(e.target.value)}
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  >
                    <option value="aditya">Aditya (Natural Male - Clear & Professional)</option>
                    <option value="ritu">Ritu (Natural Female - Warm & Expressive)</option>
                    <option value="priya">Priya (Smooth Female - Conversational)</option>
                    <option value="neha">Neha (Warm Female - Friendly)</option>
                    <option value="rohan">Rohan (Dynamic Male - Energetic)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    Tone / Response Style
                  </label>
                  <select
                    value={responseStyle}
                    onChange={(e) => setResponseStyle(e.target.value as any)}
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  >
                    <option value="friendly">Friendly & Warm</option>
                    <option value="professional">Professional & Formal</option>
                    <option value="concise">Concise & Direct</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Live Greeting Preview
                </label>
                <div className="p-4 rounded-xl bg-slate-950/80 border border-emerald-500/30 text-emerald-300 text-sm leading-relaxed">
                  &ldquo;{dynamicGreetingPreview}&rdquo;
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Custom Greeting Override (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Leave empty to use automatic greeting above..."
                  value={customGreeting}
                  onChange={(e) => setCustomGreeting(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-sm"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Services & Pricing */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-emerald-400" /> Services & Catalog
                </h2>
                <p className="text-sm text-slate-400 mt-1">
                  Add the services, products, or consultation packages your business offers.
                </p>
              </div>
              <button
                type="button"
                onClick={addService}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 text-xs font-medium transition"
              >
                <Plus className="w-3.5 h-3.5" /> Add Service
              </button>
            </div>

            <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
              {services.map((service, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 relative group"
                >
                  <button
                    type="button"
                    onClick={() => removeService(idx)}
                    className="absolute top-3 right-3 text-slate-500 hover:text-rose-400 transition"
                    title="Remove service"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">Service Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Teeth Cleaning, Site Visit, Consultation"
                        value={service.name}
                        onChange={(e) => updateService(idx, 'name', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">Price (₹)</label>
                        <input
                          type="number"
                          placeholder="500 (or 0 if free)"
                          value={service.price}
                          onChange={(e) => updateService(idx, 'price', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">Duration (Mins)</label>
                        <input
                          type="number"
                          placeholder="30"
                          value={service.duration_minutes}
                          onChange={(e) => updateService(idx, 'duration_minutes', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">Description</label>
                    <input
                      type="text"
                      placeholder="Brief details about what is included..."
                      value={service.description}
                      onChange={(e) => updateService(idx, 'description', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 4: FAQs */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <HelpCircle className="w-5 h-5 text-emerald-400" /> Frequently Asked Questions
                </h2>
                <p className="text-sm text-slate-400 mt-1">
                  Teach your agent how to answer frequent questions callers ask.
                </p>
              </div>
              <button
                type="button"
                onClick={addFaq}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 text-xs font-medium transition"
              >
                <Plus className="w-3.5 h-3.5" /> Add FAQ
              </button>
            </div>

            <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
              {faqs.map((faq, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 relative group"
                >
                  <button
                    type="button"
                    onClick={() => removeFaq(idx)}
                    className="absolute top-3 right-3 text-slate-500 hover:text-rose-400 transition"
                    title="Remove FAQ"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <div className="mb-2">
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">Question</label>
                    <input
                      type="text"
                      placeholder="e.g. Do you accept insurance? What are parking options?"
                      value={faq.question}
                      onChange={(e) => updateFaq(idx, 'question', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">Answer</label>
                    <textarea
                      rows={2}
                      placeholder="Provide the exact, clear answer the agent should convey..."
                      value={faq.answer}
                      onChange={(e) => updateFaq(idx, 'answer', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 5: Knowledge Base */}
        {step === 5 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-400" /> Business Knowledge & Documents
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                Paste special business rules, doctor qualifications, menu items, or cancellation policies.
                Our vector engine indexes this for live semantic search during calls.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Document Title
                </label>
                <input
                  type="text"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder="e.g. Doctor Profiles, Return Policies, Clinic Protocols"
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Document Content (Plain Text / Policies)
                </label>
                <textarea
                  rows={8}
                  value={docContent}
                  onChange={(e) => setDocContent(e.target.value)}
                  placeholder="Paste any detailed business rules, menus, doctor specializations, branch directions, warranty details, or discount policies here..."
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono text-sm leading-relaxed"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Text is automatically split into chunks and indexed into Supabase pgvector embeddings.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* STEP 6: Review & Launch */}
        {step === 6 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-400" /> Review & Launch
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                Everything is ready! Confirm your settings below and launch your AI voice receptionist.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                <span className="text-xs uppercase text-slate-400 font-semibold">Business Identity</span>
                <h3 className="text-base font-bold text-white mt-1">{businessName || 'Unnamed Business'}</h3>
                <p className="text-xs text-emerald-400 capitalize">{businessType.replace('_', ' ')}</p>
                <p className="text-xs text-slate-400 mt-2">{phone || 'No phone'} · {address || 'No address'}</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                <span className="text-xs uppercase text-slate-400 font-semibold">Voice Persona</span>
                <h3 className="text-base font-bold text-white mt-1">{agentName} ({voice})</h3>
                <p className="text-xs text-emerald-400">
                  {language === 'te-IN' ? 'Telugu (తెలుగు)' : language === 'hi-IN' ? 'Hindi (हिन्दी)' : 'Indian English'} · {responseStyle}
                </p>
                <p className="text-xs text-slate-400 mt-2 line-clamp-2">
                  &ldquo;{dynamicGreetingPreview}&rdquo;
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span>Configured Catalog & Knowledge Base</span>
                <span className="text-emerald-400 font-medium">
                  {services.filter(s => s.name).length} Services · {faqs.filter(f => f.question).length} FAQs
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {services.filter(s => s.name).slice(0, 5).map((s, i) => (
                  <span key={i} className="px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-300">
                    {s.name} {s.price ? `(₹${s.price})` : ''}
                  </span>
                ))}
                {services.filter(s => s.name).length > 5 && (
                  <span className="px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-400">
                    +{services.filter(s => s.name).length - 5} more
                  </span>
                )}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-emerald-300">Ready for Ultra-Low Latency Calling</p>
                <p className="text-xs text-emerald-400/80 mt-1">
                  Once created, your agent will immediately begin responding to live voice calls with sub-500ms voice synthesis, native barge-in, and instant business knowledge lookup.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="mt-8 pt-6 border-t border-slate-800 flex items-center justify-between">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-sm font-medium transition"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          ) : (
            <div />
          )}

          {step < 6 ? (
            <button
              type="button"
              onClick={() => {
                if (step === 1 && !businessName.trim()) {
                  setError('Please enter your business name.');
                  return;
                }
                setError(null);
                setStep(step + 1);
              }}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold text-sm transition shadow-lg shadow-emerald-500/20"
            >
              Next Step <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmit}
              className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-bold text-sm transition shadow-xl shadow-emerald-500/30 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Launching Agent...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> Create & Launch Voice Agent
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Inline Auth Modal (Preserves all form state!) */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-7 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setShowAuthModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  {authMode === 'signin' ? 'Sign In to Launch' : 'Create Account & Launch'}
                </h3>
                <p className="text-xs text-slate-400">
                  Save & launch <span className="text-emerald-400 font-medium">{businessName || 'your business'}</span>
                </p>
              </div>
            </div>

            {authModalError && (
              <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
                {authModalError}
              </div>
            )}

            <form onSubmit={handleModalAuth} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Business Email</label>
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="name@business.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition disabled:opacity-50"
              >
                {authLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Verifying...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" /> {authMode === 'signin' ? 'Sign In & Launch Receptionist' : 'Register & Launch Receptionist'}
                  </>
                )}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode(authMode === 'signin' ? 'signup' : 'signin');
                    setAuthModalError(null);
                  }}
                  className="text-xs text-slate-400 hover:text-emerald-400 transition"
                >
                  {authMode === 'signin'
                    ? "Don't have an account? Sign up & launch"
                    : 'Already have an account? Sign in & launch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
