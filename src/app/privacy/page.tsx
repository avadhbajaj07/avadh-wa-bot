import Link from 'next/link';
import { ArrowLeft, Shield } from 'lucide-react';

export const metadata = {
  title: 'Privacy Policy | Maruti Digital WhatsApp Platform',
  description: 'Privacy policy for Maruti Digital WhatsApp Business API CRM and Tech Provider solution.',
};

export default function PrivacyPage() {
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
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Privacy Policy</h1>
            <p className="text-sm text-slate-500">Last updated: September 17, 2026</p>
          </div>
        </div>

        <div className="prose prose-slate max-w-none space-y-6 text-slate-600 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">1. Introduction</h2>
            <p>
              Welcome to <strong>Maruti Digital</strong> (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;), operating via{' '}
              <strong>shikhabajaj.online</strong>. We provide a business messaging and customer relationship management (CRM) platform
              integrating with the Meta WhatsApp Cloud API. We are committed to protecting the privacy and personal data of our users,
              clients, and their respective customers.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">2. Information We Collect</h2>
            <p>When you register, connect your WhatsApp Business Account (WABA), or use our services, we collect:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Account Information:</strong> Your name, business email address, company name, phone number, and password.
              </li>
              <li>
                <strong>Meta WhatsApp Credentials:</strong> When you connect via Meta Embedded Signup (Facebook Login for Business),
                we receive authorization tokens, your WhatsApp Business Account ID (WABA ID), and Phone Number ID. All tokens are encrypted
                using AES-256-GCM encryption at rest.
              </li>
              <li>
                <strong>Messaging &amp; Communication Data:</strong> Inbound and outbound WhatsApp messages, contact phone numbers, message status receipts
                (sent, delivered, read), and template details processed through the Meta WhatsApp Business Cloud API.
              </li>
              <li>
                <strong>Usage &amp; Technical Data:</strong> Log data, IP addresses, browser types, and interaction telemetry necessary to ensure service stability.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">3. How We Use Your Information</h2>
            <p>We use collected data solely to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Facilitate real-time WhatsApp messaging between your business and your customers.</li>
              <li>Manage broadcasts, automated AI replies, and multi-agent team inbox conversations.</li>
              <li>Deliver webhook events and message delivery notifications securely to your workspace.</li>
              <li>Comply with Meta Platform Policies and applicable legal obligations.</li>
            </ul>
            <p className="mt-2 font-medium text-slate-800">
              We never sell, rent, or monetize your customer data, contact lists, or messaging contents to third parties or advertisers.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">4. WhatsApp Cloud API &amp; Third-Party Sharing</h2>
            <p>
              Our platform operates as a Meta Tech Provider utilizing Meta&apos;s official WhatsApp Cloud API. By using our platform, message payloads
              are transmitted through Meta Platforms, Inc. servers in accordance with Meta&apos;s Data Policy and WhatsApp Business Terms of Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">5. Data Security &amp; Storage</h2>
            <p>
              We implement industry-standard administrative, technical, and physical safeguards. All communication is enforced via TLS 1.3/HTTPS.
              All Meta API access tokens are stored in an encrypted state using AES-256 authenticated encryption.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">6. User Rights &amp; Data Deletion</h2>
            <p>
              You have the right to access, export, or delete your account and associated WhatsApp configurations at any time.
              To request full account deletion, you may disconnect your WhatsApp account directly from Settings &rarr; WhatsApp Connection, or email us at{' '}
              <a href="mailto:support@shikhabajaj.online" className="text-indigo-600 underline">support@shikhabajaj.online</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">7. Contact Information</h2>
            <p>
              If you have any questions or concerns regarding this Privacy Policy, please reach out to:
            </p>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mt-2">
              <p className="font-semibold text-slate-800">Maruti Digital Solutions</p>
              <p>Email: <a href="mailto:support@shikhabajaj.online" className="text-indigo-600">support@shikhabajaj.online</a></p>
              <p>Website: <a href="https://www.shikhabajaj.online" className="text-indigo-600">https://www.shikhabajaj.online</a></p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
