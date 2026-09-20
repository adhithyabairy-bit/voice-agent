import Link from 'next/link';
import {
  Mic,
  Globe,
  Clock,
  Brain,
  CalendarCheck,
  Users,
  FileText,
  ArrowRight,
  Phone,
  Sparkles,
} from 'lucide-react';

// ============================================================
// Landing Page — Hero + Demo Conversation + Features
// ============================================================

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[var(--background)]/80 backdrop-blur-lg border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 h-16">
          <Link href="/" className="flex items-center gap-2.5 no-underline">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
              style={{ background: 'var(--gradient-primary)' }}>
              <Mic size={16} />
            </div>
            <span className="font-semibold text-lg text-[var(--foreground)]">VoiceAI</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm text-[var(--muted-foreground)]">
            <a href="#features" className="hover:text-[var(--foreground)] transition-colors">Features</a>
            <a href="#demo" className="hover:text-[var(--foreground)] transition-colors">Demo</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors hidden sm:block no-underline"
            >
              Dashboard
            </Link>
            <Link
              href="/agent"
              className="flex items-center gap-2 px-5 py-2.5 rounded-full text-white text-sm font-medium transition-all hover:opacity-90 hover:scale-105 active:scale-95 no-underline"
              style={{ background: 'var(--gradient-primary)' }}
              id="cta-try-agent"
            >
              <Phone size={14} />
              Try AI Agent
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative flex-1 flex flex-col items-center justify-center px-6 pt-20 pb-16 overflow-hidden">
        {/* Background gradient */}
        <div
          className="absolute inset-0 -z-10 opacity-5"
          style={{
            background: 'radial-gradient(ellipse 80% 60% at 50% -20%, rgba(99, 102, 241, 0.4), transparent)',
          }}
        />

        <div className="max-w-4xl mx-auto text-center space-y-8 animate-fade-in">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] text-xs font-medium text-[var(--muted-foreground)]">
            <Sparkles size={12} className="text-[var(--accent)]" />
            Real-time multilingual voice AI
          </div>

          {/* Headline */}
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1]">
            AI Voice Agents for{' '}
            <span
              className="bg-clip-text text-transparent animate-gradient"
              style={{ backgroundImage: 'var(--gradient-hero)' }}
            >
              Indian Businesses
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-lg md:text-xl text-[var(--muted-foreground)] max-w-2xl mx-auto leading-relaxed">
            Talk to your customers in Telugu, Hindi, English and more — naturally, instantly, and 24/7.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link
              href="/agent"
              className="flex items-center gap-2 px-8 py-3.5 rounded-full text-white text-base font-medium transition-all hover:opacity-90 hover:scale-105 active:scale-95 shadow-lg no-underline"
              style={{ background: 'var(--gradient-primary)', boxShadow: 'var(--shadow-glow)' }}
              id="hero-cta-primary"
            >
              <Phone size={18} />
              Try AI Agent
            </Link>
            <a
              href="#demo"
              className="flex items-center gap-2 px-8 py-3.5 rounded-full text-[var(--foreground)] text-base font-medium border border-[var(--border)] transition-all hover:bg-[var(--muted)] hover:scale-105 active:scale-95 no-underline"
              id="hero-cta-secondary"
            >
              View Demo
              <ArrowRight size={16} />
            </a>
          </div>
        </div>
      </section>

      {/* Demo Conversation Section */}
      <section id="demo" className="py-20 px-6 bg-[var(--muted)]/50">
        <div className="max-w-3xl mx-auto space-y-10">
          <div className="text-center space-y-3">
            <h2 className="text-3xl md:text-4xl font-bold">See it in action</h2>
            <p className="text-[var(--muted-foreground)]">A real conversation with our AI receptionist</p>
          </div>

          {/* Demo conversation card */}
          <div className="glass-card p-8 space-y-6 animate-slide-up">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white" style={{ background: 'var(--gradient-accent)' }}>
                  <Mic size={18} />
                </div>
                <div>
                  <p className="font-semibold text-sm">ABC Dental Clinic</p>
                  <p className="text-xs text-[var(--muted-foreground)]">AI Receptionist</p>
                </div>
              </div>
              <span className="text-xs px-3 py-1 rounded-full bg-green-100 text-green-700 font-medium">● Live</span>
            </div>

            {/* Conversation messages */}
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-medium flex-shrink-0">C</div>
                <div className="bg-blue-500 text-white px-4 py-2.5 rounded-2xl rounded-bl-md text-sm max-w-[80%]">
                  <p className="m-0">మీ క్లినిక్ రేపు ఎన్ని గంటలకు ఓపెన్ అవుతుంది?</p>
                  <p className="text-[10px] text-white/60 mt-1">Customer · Telugu</p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-xs font-medium flex-shrink-0">AI</div>
                <div className="bg-[var(--muted)] px-4 py-2.5 rounded-2xl rounded-bl-md text-sm max-w-[80%]">
                  <p className="m-0">మా క్లినిక్ రేపు ఉదయం 9 గంటలకు ఓపెన్ అవుతుంది, రాత్రి 8 గంటల వరకు ఉంటుంది.</p>
                  <p className="text-[10px] text-[var(--muted-foreground)] mt-1">AI · Telugu · 340ms</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-1 pt-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="w-1 rounded-full bg-[var(--accent)]"
                  style={{
                    height: `${8 + Math.random() * 16}px`,
                    opacity: 0.5 + Math.random() * 0.5,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-6">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="text-center space-y-3">
            <h2 className="text-3xl md:text-4xl font-bold">Built for Indian businesses</h2>
            <p className="text-[var(--muted-foreground)] max-w-xl mx-auto">
              Everything you need to automate customer conversations in your language
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Globe,
                title: 'Indian Languages',
                description: 'Telugu, Hindi, English — with natural code-mixing support. More languages coming soon.',
              },
              {
                icon: Clock,
                title: 'Real-time Conversations',
                description: 'Sub-second response times. Natural barge-in and interruption. Feels like a real phone call.',
              },
              {
                icon: Brain,
                title: 'Business Knowledge',
                description: 'Knows your services, prices, hours, and policies. Answers accurately every time.',
              },
              {
                icon: CalendarCheck,
                title: 'Appointment Assistance',
                description: 'Collects customer details and appointment preferences. Follow-up ready.',
              },
              {
                icon: Users,
                title: 'Lead Collection',
                description: 'Automatically identifies interested customers. Tracks intent and follow-up needs.',
              },
              {
                icon: FileText,
                title: 'Call Summaries',
                description: 'AI-generated summaries after every conversation. Customer name, intent, and action items.',
              },
            ].map((feature, i) => (
              <div
                key={i}
                className="glass-card p-6 space-y-3 transition-all hover:shadow-lg hover:-translate-y-1"
              >
                <div className="w-10 h-10 rounded-xl bg-[var(--muted)] flex items-center justify-center text-[var(--accent)]">
                  <feature.icon size={20} />
                </div>
                <h3 className="font-semibold text-base">{feature.title}</h3>
                <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div
          className="max-w-4xl mx-auto rounded-3xl p-12 text-center text-white space-y-6"
          style={{ background: 'var(--gradient-hero)' }}
        >
          <h2 className="text-3xl md:text-4xl font-bold">Ready to automate your calls?</h2>
          <p className="text-white/80 max-w-lg mx-auto">
            Start talking to your AI receptionist now. No setup required for the demo.
          </p>
          <Link
            href="/agent"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-white text-[var(--primary)] text-base font-semibold transition-all hover:bg-white/90 hover:scale-105 active:scale-95 no-underline"
            id="bottom-cta"
          >
            <Phone size={18} />
            Try AI Agent Now
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-8 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-[var(--muted-foreground)]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center text-white" style={{ background: 'var(--gradient-primary)' }}>
              <Mic size={12} />
            </div>
            <span>VoiceAI</span>
          </div>
          <p>Multilingual AI voice agents for Indian businesses</p>
        </div>
      </footer>
    </div>
  );
}
