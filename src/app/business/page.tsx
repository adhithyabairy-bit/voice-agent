'use client';

// ============================================================
// Business Knowledge Page — Edit business info, services, FAQs
// ============================================================

import { useState, useEffect } from 'react';
import {
  Building2,
  Clock,
  MapPin,
  Phone,
  IndianRupee,
  HelpCircle,
  Save,
  Loader2,
} from 'lucide-react';

interface BusinessData {
  name: string;
  description: string;
  address: string;
  phone: string;
  working_hours: Record<string, string>;
}

interface ServiceData {
  id: string;
  name: string;
  description: string;
  price: number;
}

interface FAQData {
  id: string;
  question: string;
  answer: string;
}

export default function BusinessPage() {
  const [business, setBusiness] = useState<BusinessData>({
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
  });

  const [services] = useState<ServiceData[]>([
    { id: '1', name: 'Dental Consultation', description: 'General dental check-up and consultation', price: 500 },
    { id: '2', name: 'Teeth Cleaning', description: 'Professional teeth cleaning and polishing', price: 1000 },
    { id: '3', name: 'Root Canal', description: 'Root canal treatment', price: 5000 },
    { id: '4', name: 'Teeth Whitening', description: 'Professional teeth whitening treatment', price: 3000 },
    { id: '5', name: 'Dental Filling', description: 'Composite dental filling', price: 800 },
    { id: '6', name: 'Tooth Extraction', description: 'Simple tooth extraction', price: 1500 },
  ]);

  const [faqs] = useState<FAQData[]>([
    { id: '1', question: 'Do you accept insurance?', answer: 'Yes, we accept most major dental insurance plans.' },
    { id: '2', question: 'Is parking available?', answer: 'Yes, free parking is available in front of the clinic.' },
    { id: '3', question: 'Do I need an appointment?', answer: 'Walk-ins are welcome, but appointments are recommended to avoid waiting.' },
    { id: '4', question: 'What payment methods do you accept?', answer: 'We accept cash, UPI, credit/debit cards, and net banking.' },
  ]);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Fetch business data on mount
  useEffect(() => {
    async function loadBusiness() {
      try {
        const resp = await fetch('/api/business');
        if (resp.ok) {
          const data = await resp.json();
          if (data.business) {
            setBusiness({
              name: data.business.name || '',
              description: data.business.description || '',
              address: data.business.address || '',
              phone: data.business.phone || '',
              working_hours: data.business.working_hours || {},
            });
          }
        }
      } catch {
        // Use defaults
      }
    }
    loadBusiness();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/business', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(business),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // Show error
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Business Knowledge</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Configure the information your AI agent uses to answer customers
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-medium transition-all hover:opacity-90 disabled:opacity-50"
          style={{ background: saved ? 'var(--success)' : 'var(--gradient-primary)' }}
          id="save-business"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      {/* Business Info */}
      <div className="glass-card p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
            <Building2 size={18} />
          </div>
          <h2 className="font-semibold">Business Information</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--muted-foreground)]">Business Name</label>
            <input
              value={business.name}
              onChange={(e) => setBusiness({ ...business, name: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              id="business-name"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--muted-foreground)]">Phone</label>
            <input
              value={business.phone}
              onChange={(e) => setBusiness({ ...business, phone: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              id="business-phone"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[var(--muted-foreground)]">Description</label>
          <textarea
            value={business.description}
            onChange={(e) => setBusiness({ ...business, description: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-none"
            id="business-description"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[var(--muted-foreground)] flex items-center gap-1.5">
            <MapPin size={12} /> Address
          </label>
          <input
            value={business.address}
            onChange={(e) => setBusiness({ ...business, address: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            id="business-address"
          />
        </div>
      </div>

      {/* Working Hours */}
      <div className="glass-card p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600">
            <Clock size={18} />
          </div>
          <h2 className="font-semibold">Working Hours</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Object.entries(business.working_hours).map(([day, hours]) => (
            <div key={day} className="flex items-center gap-3">
              <span className="text-sm font-medium w-24 capitalize">{day}</span>
              <input
                value={hours}
                onChange={(e) =>
                  setBusiness({
                    ...business,
                    working_hours: { ...business.working_hours, [day]: e.target.value },
                  })
                }
                className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Services */}
      <div className="glass-card p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center text-green-600">
            <IndianRupee size={18} />
          </div>
          <h2 className="font-semibold">Services & Prices</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left p-3 font-medium text-[var(--muted-foreground)]">Service</th>
                <th className="text-left p-3 font-medium text-[var(--muted-foreground)]">Description</th>
                <th className="text-right p-3 font-medium text-[var(--muted-foreground)]">Price</th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => (
                <tr key={service.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="p-3 font-medium">{service.name}</td>
                  <td className="p-3 text-[var(--muted-foreground)]">{service.description}</td>
                  <td className="p-3 text-right font-mono">₹{service.price.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* FAQs */}
      <div className="glass-card p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
            <HelpCircle size={18} />
          </div>
          <h2 className="font-semibold">FAQs</h2>
        </div>

        <div className="space-y-4">
          {faqs.map((faq) => (
            <div key={faq.id} className="p-4 rounded-xl bg-[var(--muted)] space-y-2">
              <p className="font-medium text-sm">Q: {faq.question}</p>
              <p className="text-sm text-[var(--muted-foreground)]">A: {faq.answer}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
