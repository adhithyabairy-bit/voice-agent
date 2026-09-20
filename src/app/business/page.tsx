'use client';

// ============================================================
// Business Profile & Knowledge Base Management
// Multi-Business Tenant Architecture
// ============================================================

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Building2,
  Clock,
  MapPin,
  Phone,
  Mail,
  IndianRupee,
  HelpCircle,
  Save,
  Plus,
  Trash2,
  Loader2,
  Sparkles,
} from 'lucide-react';
import type { Service, FAQ } from '@/types';
import { authFetch } from '@/lib/api/auth-fetch';

export default function BusinessPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [businessId, setBusinessId] = useState<string>('');

  const [business, setBusiness] = useState({
    business_name: '',
    business_type: 'service',
    description: '',
    address: '',
    phone: '',
    email: '',
    working_hours: {
      monday: '9:00 AM - 7:00 PM',
      tuesday: '9:00 AM - 7:00 PM',
      wednesday: '9:00 AM - 7:00 PM',
      thursday: '9:00 AM - 7:00 PM',
      friday: '9:00 AM - 7:00 PM',
      saturday: '10:00 AM - 5:00 PM',
      sunday: 'Closed',
    } as Record<string, string>,
  });

  const [services, setServices] = useState<Service[]>([]);
  const [faqs, setFaqs] = useState<FAQ[]>([]);

  // New service input state
  const [newServiceName, setNewServiceName] = useState('');
  const [newServicePrice, setNewServicePrice] = useState('');
  const [newServiceDesc, setNewServiceDesc] = useState('');
  const [newServiceDuration, setNewServiceDuration] = useState('');

  // New FAQ input state
  const [newFaqQuestion, setNewFaqQuestion] = useState('');
  const [newFaqAnswer, setNewFaqAnswer] = useState('');

  // Load business, services, and FAQs
  const loadData = async () => {
    try {
      setLoading(true);
      const resp = await authFetch('/api/business');
      if (resp.ok) {
        const data = await resp.json();
        if (data.business) {
          setBusinessId(data.business.id);
          setBusiness({
            business_name: data.business.business_name || data.business.name || '',
            business_type: data.business.business_type || 'service',
            description: data.business.description || '',
            address: data.business.address || '',
            phone: data.business.phone || '',
            email: data.business.email || '',
            working_hours: data.business.working_hours || {},
          });
        }
        if (Array.isArray(data.services)) {
          setServices(data.services);
        }
        if (Array.isArray(data.faqs)) {
          setFaqs(data.faqs);
        }
      }
    } catch (err) {
      console.error('Error fetching business info:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveBusiness = async () => {
    setSaving(true);
    try {
      await authFetch('/api/business', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId,
          ...business,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Error saving business info:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleAddService = async () => {
    if (!newServiceName.trim()) return;
    try {
      const res = await authFetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId,
          name: newServiceName.trim(),
          description: newServiceDesc.trim(),
          price: newServicePrice ? Number(newServicePrice) : null,
          duration_minutes: newServiceDuration ? Number(newServiceDuration) : null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.service) {
          setServices([...services, data.service]);
          setNewServiceName('');
          setNewServicePrice('');
          setNewServiceDesc('');
          setNewServiceDuration('');
        }
      }
    } catch (err) {
      console.error('Error adding service:', err);
    }
  };

  const handleDeleteService = async (id: string) => {
    try {
      const res = await authFetch(`/api/services/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setServices(services.filter((s) => s.id !== id));
      }
    } catch (err) {
      console.error('Error deleting service:', err);
    }
  };

  const handleAddFaq = async () => {
    if (!newFaqQuestion.trim() || !newFaqAnswer.trim()) return;
    try {
      const res = await authFetch('/api/faqs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId,
          question: newFaqQuestion.trim(),
          answer: newFaqAnswer.trim(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.faq) {
          setFaqs([...faqs, data.faq]);
          setNewFaqQuestion('');
          setNewFaqAnswer('');
        }
      }
    } catch (err) {
      console.error('Error adding FAQ:', err);
    }
  };

  const handleDeleteFaq = async (id: string) => {
    try {
      const res = await authFetch(`/api/faqs/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setFaqs(faqs.filter((f) => f.id !== id));
      }
    } catch (err) {
      console.error('Error deleting FAQ:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Business Profile & Catalog</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Configure how your AI receptionist answers questions, explains offerings, and schedules bookings.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/onboarding"
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-[var(--border)] text-sm font-medium hover:bg-[var(--muted)] transition"
          >
            <Sparkles size={15} /> Setup Wizard
          </Link>
          <button
            onClick={handleSaveBusiness}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-medium transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: saved ? 'var(--success)' : 'var(--gradient-primary)' }}
            id="save-business"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saved ? 'Saved!' : 'Save Business Info'}
          </button>
        </div>
      </div>

      {/* Business Info Form */}
      <div className="glass-card p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
            <Building2 size={18} />
          </div>
          <div>
            <h2 className="font-semibold">Business Identity</h2>
            <p className="text-xs text-[var(--muted-foreground)]">Core details provided to your AI voice receptionist</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--muted-foreground)]">Business Name</label>
            <input
              value={business.business_name}
              onChange={(e) => setBusiness({ ...business, business_name: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              placeholder="e.g. Apex Health Clinic"
              id="business-name"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--muted-foreground)]">Business Type</label>
            <select
              value={business.business_type}
              onChange={(e) => setBusiness({ ...business, business_type: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            >
              <option value="clinic">Clinic / Healthcare</option>
              <option value="restaurant">Restaurant / Dining</option>
              <option value="salon">Salon / Spa</option>
              <option value="gym">Gym / Fitness</option>
              <option value="real_estate">Real Estate</option>
              <option value="dealership">Automobile Dealership</option>
              <option value="education">Educational Institute</option>
              <option value="retail">Retail</option>
              <option value="professional_services">Professional Services</option>
              <option value="service">Local Services / Other</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--muted-foreground)] flex items-center gap-1">
              <Phone size={12} /> Phone Number
            </label>
            <input
              value={business.phone}
              onChange={(e) => setBusiness({ ...business, phone: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              placeholder="+91-98765-43210"
              id="business-phone"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--muted-foreground)] flex items-center gap-1">
              <Mail size={12} /> Email Address
            </label>
            <input
              value={business.email}
              onChange={(e) => setBusiness({ ...business, email: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              placeholder="contact@business.com"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[var(--muted-foreground)]">About / Overview</label>
          <textarea
            value={business.description}
            onChange={(e) => setBusiness({ ...business, description: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-none"
            placeholder="Describe what services you provide..."
            id="business-description"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[var(--muted-foreground)] flex items-center gap-1.5">
            <MapPin size={12} /> Full Address & Location
          </label>
          <input
            value={business.address}
            onChange={(e) => setBusiness({ ...business, address: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            placeholder="Street address, City, State"
            id="business-address"
          />
        </div>
      </div>

      {/* Working Hours */}
      <div className="glass-card p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-500">
            <Clock size={18} />
          </div>
          <div>
            <h2 className="font-semibold">Business Operating Hours</h2>
            <p className="text-xs text-[var(--muted-foreground)]">Informed to callers asking about timings</p>
          </div>
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

      {/* Dynamic Services Catalog */}
      <div className="glass-card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <IndianRupee size={18} />
            </div>
            <div>
              <h2 className="font-semibold">Services & Offerings ({services.length})</h2>
              <p className="text-xs text-[var(--muted-foreground)]">Pricing and duration quoted to callers</p>
            </div>
          </div>
        </div>

        {/* Existing services table */}
        <div className="overflow-x-auto border border-[var(--border)] rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-[var(--muted)]/50">
              <tr className="border-b border-[var(--border)]">
                <th className="text-left p-3 font-medium text-[var(--muted-foreground)]">Service Name</th>
                <th className="text-left p-3 font-medium text-[var(--muted-foreground)]">Description</th>
                <th className="text-left p-3 font-medium text-[var(--muted-foreground)]">Duration</th>
                <th className="text-right p-3 font-medium text-[var(--muted-foreground)]">Price</th>
                <th className="text-center p-3 font-medium text-[var(--muted-foreground)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => (
                <tr key={service.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--muted)]/30 transition">
                  <td className="p-3 font-medium">{service.name}</td>
                  <td className="p-3 text-[var(--muted-foreground)]">{service.description || '—'}</td>
                  <td className="p-3 text-[var(--muted-foreground)]">{service.duration_minutes ? `${service.duration_minutes} mins` : '—'}</td>
                  <td className="p-3 text-right font-mono font-semibold">
                    {service.price !== null ? `₹${service.price.toLocaleString()}` : 'Free / Inquiry'}
                  </td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => handleDeleteService(service.id)}
                      className="p-1 text-slate-400 hover:text-rose-500 transition"
                      title="Delete service"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {services.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-sm text-[var(--muted-foreground)]">
                    No services added yet. Add your first service below!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Add new service form */}
        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] space-y-3">
          <span className="text-xs font-semibold text-[var(--foreground)] uppercase tracking-wider">
            + Add New Service
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              placeholder="Service Name (e.g. VIP Table Reservation)"
              value={newServiceName}
              onChange={(e) => setNewServiceName(e.target.value)}
              className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
            <input
              type="number"
              placeholder="Price (₹) or 0 if free"
              value={newServicePrice}
              onChange={(e) => setNewServicePrice(e.target.value)}
              className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
            <input
              type="number"
              placeholder="Duration in mins (e.g. 30)"
              value={newServiceDuration}
              onChange={(e) => setNewServiceDuration(e.target.value)}
              className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Brief description..."
              value={newServiceDesc}
              onChange={(e) => setNewServiceDesc(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
            <button
              onClick={handleAddService}
              disabled={!newServiceName.trim()}
              className="flex items-center gap-1 px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-xs font-medium hover:opacity-90 disabled:opacity-50 transition"
            >
              <Plus size={14} /> Add
            </button>
          </div>
        </div>
      </div>

      {/* Dynamic FAQs */}
      <div className="glass-card p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
            <HelpCircle size={18} />
          </div>
          <div>
            <h2 className="font-semibold">Frequently Asked Questions ({faqs.length})</h2>
            <p className="text-xs text-[var(--muted-foreground)]">Caller questions answered instantly by the agent</p>
          </div>
        </div>

        <div className="space-y-3">
          {faqs.map((faq) => (
            <div key={faq.id} className="p-4 rounded-xl bg-[var(--muted)]/40 border border-[var(--border)] flex items-start justify-between gap-4">
              <div className="space-y-1 text-sm">
                <p className="font-medium text-[var(--foreground)]">Q: {faq.question}</p>
                <p className="text-[var(--muted-foreground)] text-xs sm:text-sm">A: {faq.answer}</p>
              </div>
              <button
                onClick={() => handleDeleteFaq(faq.id)}
                className="text-slate-400 hover:text-rose-500 transition shrink-0 p-1"
                title="Delete FAQ"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {faqs.length === 0 && (
            <p className="text-center py-6 text-sm text-[var(--muted-foreground)]">
              No FAQs added yet. Add common questions below!
            </p>
          )}
        </div>

        {/* Add new FAQ form */}
        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] space-y-3">
          <span className="text-xs font-semibold text-[var(--foreground)] uppercase tracking-wider">
            + Add New FAQ
          </span>
          <input
            type="text"
            placeholder="Question (e.g. Do you have vegetarian options?)"
            value={newFaqQuestion}
            onChange={(e) => setNewFaqQuestion(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          />
          <textarea
            rows={2}
            placeholder="Accurate answer the agent should convey..."
            value={newFaqAnswer}
            onChange={(e) => setNewFaqAnswer(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-none"
          />
          <div className="flex justify-end">
            <button
              onClick={handleAddFaq}
              disabled={!newFaqQuestion.trim() || !newFaqAnswer.trim()}
              className="flex items-center gap-1 px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-xs font-medium hover:opacity-90 disabled:opacity-50 transition"
            >
              <Plus size={14} /> Add FAQ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
