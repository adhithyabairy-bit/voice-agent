'use client';

// ============================================================
// Knowledge Base & Vector Documents Management
// Multi-Business Tenant Architecture
// ============================================================

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  FileText,
  Plus,
  Trash2,
  Database,
  Search,
  Sparkles,
  Loader2,
  CheckCircle2,
  HelpCircle,
} from 'lucide-react';
import type { KnowledgeDocument } from '@/types';

export default function KnowledgePage() {
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [totalChunks, setTotalChunks] = useState(0);

  // New document form
  const [showAddForm, setShowAddForm] = useState(false);
  const [docTitle, setDocTitle] = useState('');
  const [docContent, setDocContent] = useState('');
  const [sourceType, setSourceType] = useState<'text' | 'policy' | 'faq'>('text');
  const [saving, setSaving] = useState(false);

  // Vector test search
  const [testQuery, setTestQuery] = useState('');
  const [testSearching, setTestSearching] = useState(false);
  const [testResults, setTestResults] = useState<string[]>([]);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/knowledge');
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
        setTotalChunks(data.totalChunks || 0);
      }
    } catch (err) {
      console.error('Error fetching knowledge docs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  const handleAddDocument = async () => {
    if (!docTitle.trim() || !docContent.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: docTitle.trim(),
          content: docContent.trim(),
          sourceType,
        }),
      });

      if (res.ok) {
        setDocTitle('');
        setDocContent('');
        setShowAddForm(false);
        await loadDocuments();
      }
    } catch (err) {
      console.error('Error adding document:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/knowledge/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await loadDocuments();
      }
    } catch (err) {
      console.error('Error deleting document:', err);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Knowledge Base & Semantic Vectors</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Store business documents, doctor bios, dining menus, and policies for instant RAG search during live calls.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-medium transition shadow-lg shadow-emerald-500/20"
            style={{ background: 'var(--gradient-primary)' }}
          >
            <Plus size={16} /> {showAddForm ? 'Cancel' : 'Add Knowledge Document'}
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
            <FileText size={24} />
          </div>
          <div>
            <p className="text-xs text-[var(--muted-foreground)] uppercase font-semibold">Indexed Documents</p>
            <p className="text-2xl font-bold">{documents.length}</p>
          </div>
        </div>

        <div className="glass-card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <Database size={24} />
          </div>
          <div>
            <p className="text-xs text-[var(--muted-foreground)] uppercase font-semibold">pgvector Chunks</p>
            <p className="text-2xl font-bold">{totalChunks}</p>
          </div>
        </div>

        <div className="glass-card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
            <Sparkles size={24} />
          </div>
          <div>
            <p className="text-xs text-[var(--muted-foreground)] uppercase font-semibold">Embedding Dimensions</p>
            <p className="text-2xl font-bold">384 (Fast RAG)</p>
          </div>
        </div>
      </div>

      {/* Add Document Form */}
      {showAddForm && (
        <div className="glass-card p-6 space-y-4 border border-emerald-500/30 animate-fade-in">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Sparkles size={16} className="text-emerald-500" /> New Knowledge Document
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs font-semibold text-[var(--muted-foreground)]">Document Title</label>
              <input
                type="text"
                placeholder="e.g. Doctor Qualifications, Cancellation Policy, Branch Directions"
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[var(--muted-foreground)]">Category</label>
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              >
                <option value="text">General Information</option>
                <option value="policy">Policy / Terms</option>
                <option value="faq">FAQ Collection</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[var(--muted-foreground)]">Content (Plain text)</label>
            <textarea
              rows={6}
              placeholder="Paste raw text, policies, menu descriptions, directions, warranty guidelines..."
              value={docContent}
              onChange={(e) => setDocContent(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] font-mono text-xs leading-relaxed"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 rounded-lg border border-[var(--border)] text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleAddDocument}
              disabled={saving || !docTitle.trim() || !docContent.trim()}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
              Index Document
            </button>
          </div>
        </div>
      )}

      {/* Documents List */}
      <div className="glass-card p-6 space-y-4">
        <h2 className="text-base font-semibold">Indexed Business Documents</h2>
        {loading ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--primary)]" />
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-10 space-y-3">
            <FileText size={40} className="mx-auto text-[var(--muted-foreground)] opacity-40" />
            <p className="text-sm text-[var(--muted-foreground)]">No documents uploaded yet.</p>
            <button
              onClick={() => setShowAddForm(true)}
              className="px-4 py-2 rounded-xl bg-[var(--primary)] text-white text-xs font-medium"
            >
              Add Your First Document
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {documents.map((doc) => (
              <div key={doc.id} className="py-4 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{doc.title}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-[var(--muted)] text-[var(--muted-foreground)]">
                      {doc.source_type}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--muted-foreground)] line-clamp-2">
                    {doc.content}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Added: {new Date(doc.created_at || '').toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="p-1.5 text-slate-400 hover:text-rose-500 transition shrink-0"
                  title="Delete Document"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
