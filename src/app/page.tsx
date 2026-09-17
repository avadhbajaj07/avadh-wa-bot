import Link from 'next/link';
import {
  MessageSquare,
  Zap,
  Bot,
  Users,
  Check,
  ArrowRight,
  Shield,
  Sparkles,
  ExternalLink,
  ChevronRight,
  PhoneCall,
  Clock,
  BarChart3,
} from 'lucide-react';

export const metadata = {
  title: 'Maruti Digital: Official WhatsApp Business API Platform & CRM',
  description:
    'Send bulk WhatsApp campaigns, deploy 24/7 AI chatbots, manage a multi-agent team inbox, and automate customer support with 0% Meta API markup.',
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans selection:bg-indigo-500 selection:text-white">
      {/* ── Sticky Top Navigation ──────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-emerald-400 flex items-center justify-center text-white shadow-md shadow-indigo-200 transition-transform duration-200 group-hover:scale-105">
              <MessageSquare className="w-5 h-5 fill-white/20" />
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-bold tracking-tight text-slate-900">
                Maruti<span className="text-indigo-600">Digital</span>
              </span>
              <span className="text-[10px] font-semibold text-emerald-600 tracking-wider uppercase">
                Official WhatsApp Partner
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
            <a href="#features" className="hover:text-indigo-600 transition-colors">
              Features
            </a>
            <a href="#pricing" className="hover:text-indigo-600 transition-colors">
              Pricing
            </a>
            <a href="#zero-markup" className="hover:text-indigo-600 transition-colors">
              0% Markup
            </a>
            <Link href="/privacy" className="hover:text-indigo-600 transition-colors">
              Privacy Policy
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-semibold text-slate-700 hover:text-indigo-600 transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 text-white text-sm font-semibold shadow-md shadow-indigo-200 hover:shadow-lg hover:shadow-indigo-300 hover:-translate-y-0.5 transition-all duration-200"
            >
              Start 7-day free trial
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero Section ───────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-12 pb-20 lg:pt-20 lg:pb-28 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(99,102,241,0.12),rgba(255,255,255,0))]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          {/* Pill Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-50 border border-slate-200/80 shadow-xs mb-8">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-slate-700 tracking-wide">
              Official WhatsApp Cloud API &bull; 1-Click Facebook Onboarding
            </span>
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-slate-900 max-w-5xl mx-auto leading-[1.15]">
            Market, Sell, Support, Automate.{' '}
            <span className="block mt-2 bg-gradient-to-r from-indigo-600 via-indigo-500 to-emerald-500 bg-clip-text text-transparent">
              All On WhatsApp.
            </span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Run bulk marketing campaigns, automate AI customer replies, and manage high-volume customer chats with{' '}
            <span className="font-semibold text-slate-900">0% Meta API markup</span>. Built for modern businesses and non-tech teams.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-700 hover:to-indigo-600 text-white text-base font-bold shadow-xl shadow-indigo-500/25 hover:-translate-y-0.5 transition-all duration-200"
            >
              Start 7-day free trial &rarr;
            </Link>
            <Link
              href="/login"
              className="w-full sm:w-auto px-8 py-4 rounded-xl border-2 border-slate-200 hover:border-slate-300 bg-white text-slate-800 text-base font-bold transition-all duration-200 hover:bg-slate-50"
            >
              Open Dashboard
            </Link>
          </div>

          {/* Value Badges */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-xs sm:text-sm font-medium text-slate-500">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-500 stroke-[3]" /> No credit card required
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-500 stroke-[3]" /> 0% Markup on Meta Rates
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-500 stroke-[3]" /> 2-minute setup via Facebook
            </div>
          </div>
        </div>
      </section>

      {/* ── Social Proof & Trust ────────────────────────────────────── */}
      <section className="py-8 bg-slate-50 border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Empowering modern businesses across Retail, Real Estate, Healthcare &amp; Services
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-8 sm:gap-16 opacity-70 grayscale hover:grayscale-0 transition-all">
            <span className="text-sm font-bold text-slate-700 tracking-wider">MARUTI DIGITAL</span>
            <span className="text-sm font-bold text-slate-700 tracking-wider">BAJAJ MOTORS</span>
            <span className="text-sm font-bold text-slate-700 tracking-wider">ECOMMERCE PRO</span>
            <span className="text-sm font-bold text-slate-700 tracking-wider">RETAIL HUB</span>
            <span className="text-sm font-bold text-slate-700 tracking-wider">GROWTH VENTURES</span>
          </div>
        </div>
      </section>

      {/* ── Features Grid ─────────────────────────────────────────── */}
      <section id="features" className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-xs font-bold text-indigo-600 uppercase tracking-widest">
              Everything You Need
            </h2>
            <p className="mt-3 text-3xl sm:text-4xl font-extrabold text-slate-900">
              Powerful tools built for real business results
            </p>
            <p className="mt-4 text-base text-slate-600">
              Designed from the ground up so anyone on your team can send campaigns, close leads, and answer inquiries without engineering support.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="p-8 rounded-2xl bg-white border border-slate-200/80 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-300 group">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Zap className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Bulk WhatsApp Broadcasts</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Send pre-approved template marketing campaigns to thousands of opt-in customers with personalized tags, media, and interactive quick-reply buttons.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-8 rounded-2xl bg-white border border-slate-200/80 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-300 group">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Multi-Agent Team Inbox</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Empower your entire sales and support team to chat from a single WhatsApp number. Assign conversations, add private internal notes, and track response times.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-8 rounded-2xl bg-white border border-slate-200/80 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-300 group">
              <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Bot className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">24/7 AI Employee &amp; Chatbot</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Never lose a lead outside business hours. Intelligent AI agents qualify prospects, answer product questions, and route warm buyers directly to human reps.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="p-8 rounded-2xl bg-white border border-slate-200/80 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-300 group">
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Shield className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">1-Click Facebook Onboarding</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Connect your WhatsApp Business Account in 2 minutes using Meta Embedded Signup. No complex developer settings, API keys, or manual server configs.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="p-8 rounded-2xl bg-white border border-slate-200/80 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-300 group">
              <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <BarChart3 className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Real-Time Delivery Analytics</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Track open rates, click-through metrics, delivery failures, and customer engagement live on your dashboard with instant reporting.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="p-8 rounded-2xl bg-white border border-slate-200/80 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-300 group">
              <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">No Code Automations</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Build welcome flows, order confirmation pings, abandoned cart reminders, and lead follow-up sequences using an intuitive visual editor.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 0% Markup Comparison Section ───────────────────────────── */}
      <section id="zero-markup" className="py-16 bg-slate-900 text-white relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              Fair &amp; Transparent Billing
            </span>
            <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold tracking-tight">
              Why Pay 20% to 50% Markup On Your WhatsApp Messages?
            </h2>
            <p className="mt-4 text-slate-300 text-base leading-relaxed">
              Traditional BSPs add heavy hidden surcharges to Meta&apos;s base conversation fees. With Maruti Digital, you pay{' '}
              <strong className="text-white">0% markup</strong>. You pay Meta directly at actual cost.
            </p>
          </div>

          <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-slate-800/80 border border-slate-700 p-8 rounded-2xl">
              <div className="text-red-400 font-semibold text-sm mb-2">Other Traditional Platforms</div>
              <h3 className="text-2xl font-bold mb-4">Hidden Per-Message Fees</h3>
              <ul className="space-y-3 text-sm text-slate-300">
                <li className="flex items-center gap-2">
                  <span className="text-red-400 font-bold">&times;</span> Heavy markup added to Meta conversation rates
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-red-400 font-bold">&times;</span> Expensive credits wallet that expires
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-red-400 font-bold">&times;</span> Hidden platform delivery fees
                </li>
              </ul>
            </div>

            <div className="bg-gradient-to-b from-indigo-900/60 to-slate-800 border border-indigo-500/40 p-8 rounded-2xl relative shadow-xl shadow-indigo-500/10">
              <div className="absolute top-4 right-4 px-3 py-1 bg-emerald-500 text-slate-900 font-bold text-xs rounded-full">
                RECOMMENDED
              </div>
              <div className="text-indigo-300 font-semibold text-sm mb-2">Maruti Digital Solution</div>
              <h3 className="text-2xl font-bold mb-4">100% Direct at 0% Markup</h3>
              <ul className="space-y-3 text-sm text-slate-200">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 stroke-[3]" /> Exact Meta rates &mdash; 0% markup
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 stroke-[3]" /> Billed directly to your Facebook payment card
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 stroke-[3]" /> Save up to 40% on bulk campaigns monthly
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing Section ────────────────────────────────────────── */}
      <section id="pricing" className="py-20 lg:py-28 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Simple Plans</h2>
          <p className="mt-3 text-3xl sm:text-4xl font-extrabold text-slate-900">
            Start Free, Upgrade When You Grow
          </p>
          <p className="mt-4 text-slate-600 text-base max-w-xl mx-auto">
            Try all features free for 7 days. Cancel anytime with a single click.
          </p>

          <div className="mt-12 max-w-lg mx-auto bg-white rounded-3xl border border-slate-200 shadow-xl p-8 sm:p-10 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-indigo-600 text-white text-xs font-bold uppercase tracking-wider">
              Most Popular
            </div>

            <h3 className="text-2xl font-bold text-slate-900 mt-2">All-in-One Growth Plan</h3>
            <p className="text-slate-500 text-sm mt-2">Full access to broadcasts, chatbots, and team inbox.</p>

            <div className="my-8">
              <span className="text-5xl font-black text-slate-900">₹999</span>
              <span className="text-slate-500 font-medium text-base"> / month</span>
              <p className="text-xs text-emerald-600 font-semibold mt-1">7 Days Free Trial Included</p>
            </div>

            <ul className="space-y-4 text-left text-sm text-slate-600 mb-8">
              <li className="flex items-center gap-3">
                <Check className="w-5 h-5 text-indigo-600 shrink-0" />
                <span>Unlimited WhatsApp Conversations</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-5 h-5 text-indigo-600 shrink-0" />
                <span>Bulk Broadcast Campaigns with CSV import</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-5 h-5 text-indigo-600 shrink-0" />
                <span>Shared Team Inbox for unlimited agents</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-5 h-5 text-indigo-600 shrink-0" />
                <span>AI Automated Auto-Replies &amp; Lead Qualification</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-5 h-5 text-indigo-600 shrink-0" />
                <span>0% Meta API Markup guarantee</span>
              </li>
            </ul>

            <Link
              href="/signup"
              className="block w-full py-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-base shadow-lg shadow-indigo-200 transition-all hover:-translate-y-0.5"
            >
              Start 7-Day Free Trial
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="bg-white border-t border-slate-200 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
              M
            </div>
            <span className="font-bold text-slate-800">Maruti Digital Solutions</span>
          </div>

          <div className="flex items-center gap-6 text-sm text-slate-500">
            <Link href="/privacy" className="hover:text-indigo-600 transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-indigo-600 transition-colors">
              Terms of Service
            </Link>
            <Link href="/login" className="hover:text-indigo-600 transition-colors">
              Login
            </Link>
            <Link href="/signup" className="hover:text-indigo-600 transition-colors">
              Register
            </Link>
          </div>

          <p className="text-xs text-slate-400">
            &copy; {new Date().getFullYear()} Maruti Digital. Official Meta WhatsApp Cloud API Solution.
          </p>
        </div>
      </footer>
    </div>
  );
}
