import Link from 'next/link';
import { ArrowLeft, FileText } from 'lucide-react';

export const metadata = {
  title: 'Terms of Service | Maruti Digital WhatsApp Platform',
  description: 'Terms of service for Maruti Digital WhatsApp Business API CRM.',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-8 sm:p-12">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Terms of Service</h1>
            <p className="text-sm text-slate-500">Last updated: September 17, 2026</p>
          </div>
        </div>

        <div className="prose prose-slate max-w-none space-y-6 text-slate-600 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">1. Agreement to Terms</h2>
            <p>
              By accessing or using Maruti Digital (&quot;shikhabajaj.online&quot;), you agree to be bound by these Terms of Service.
              If you disagree with any part of these terms, you may not use our services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">2. WhatsApp Business &amp; Anti-Spam Compliance</h2>
            <p>
              You agree to comply fully with the Meta WhatsApp Business Policy, Commerce Policy, and all local telecom regulations.
              Specifically, you must:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Obtain prior verifiable opt-in consent from individuals before sending proactive or marketing WhatsApp messages.</li>
              <li>Honor all customer opt-out / unsubscribe requests immediately.</li>
              <li>Refrain from sending spam, fraudulent, misleading, or abusive content.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">3. Meta Conversation Fees (0% Markup)</h2>
            <p>
              Our platform operates on a transparent model: any Meta conversation fees incurred for Marketing, Utility, or Authentication
              messages are billed directly by Meta Platforms, Inc. to your connected payment method without any markup from Maruti Digital.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">4. Limitation of Liability</h2>
            <p>
              Maruti Digital is not liable for account suspensions, number quality downgrades, or messaging restrictions imposed by Meta
              due to user non-compliance with WhatsApp Business policies.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">5. Contact</h2>
            <p>
              For legal notices or questions regarding these Terms, contact{' '}
              <a href="mailto:support@shikhabajaj.online" className="text-indigo-600 underline">support@shikhabajaj.online</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
