'use client';

import { useState } from 'react';
import {
  Clock,
  CheckCircle2,
  ExternalLink,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import { ConnectWhatsAppModal } from './connect-whatsapp-modal';

interface WhatsAppSetupGuideProps {
  isConnected: boolean;
  onRefresh?: () => void;
}

export function WhatsAppSetupGuide({ isConnected, onRefresh }: WhatsAppSetupGuideProps) {
  const [modalOpen, setModalOpen] = useState(false);

  if (isConnected) {
    return null;
  }

  return (
    <div className="space-y-6 mb-8">
      {/* ── Top Trial Strip ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100">
        <div className="flex items-center gap-2.5 text-xs sm:text-sm font-semibold text-indigo-900">
          <Clock className="w-4 h-4 text-indigo-600" />
          <span>7 days left in your free trial</span>
        </div>
        <a
          href="/settings"
          className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-all hover:-translate-y-0.5"
        >
          Upgrade Plan
        </a>
      </div>

      {/* ── Setup Checklist Card ───────────────────────────────── */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-6 sm:p-8">
        <div className="mb-8">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Setup Your WhatsApp Business API Account
            </h1>
            <span className="text-2xl">🟢</span>
          </div>
          <p className="text-slate-500 text-sm mt-2">
            Complete the steps below to connect your WhatsApp API and start automating messages.
          </p>
        </div>

        <div className="space-y-8">
          {/* Step 1 */}
          <div className="flex items-start gap-4 sm:gap-5 pb-8 border-b border-slate-100">
            <div className="w-8 h-8 rounded-full bg-emerald-500 text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-xs shadow-emerald-200">
              1
            </div>
            <div className="flex-1">
              <h2 className="text-base font-bold text-slate-900">Get Your WhatsApp Business API</h2>
              <p className="text-sm text-slate-500 mt-1">
                Get instant access to the official WhatsApp Business API using your Facebook account.
              </p>
              <button
                onClick={() => setModalOpen(true)}
                className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-md shadow-emerald-200 hover:-translate-y-0.5 transition-all"
              >
                <svg className="w-4 h-4 fill-white" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                </svg>
                Connect WhatsApp
              </button>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex items-start gap-4 sm:gap-5 pb-8 border-b border-slate-100">
            <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 font-bold text-sm flex items-center justify-center shrink-0">
              2
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-bold text-slate-900">Add Payment Method</h2>
                <a
                  href="https://business.facebook.com/billing_hub"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-indigo-600 hover:underline inline-flex items-center gap-1"
                >
                  Meta Billing Hub <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <p className="text-sm text-slate-500 mt-1">
                Add a credit or debit card directly in Meta Business Manager to enable bulk campaigns at 0% markup.
              </p>
              <a
                href="https://business.facebook.com/billing_hub"
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors"
              >
                Add Payment Method ↗
              </a>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex items-start gap-4 sm:gap-5">
            <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 font-bold text-sm flex items-center justify-center shrink-0">
              3
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2.5">
                <h2 className="text-base font-bold text-slate-900">Facebook Business Verification</h2>
                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[11px] font-semibold text-slate-600">
                  Optional
                </span>
                <a
                  href="https://business.facebook.com/settings/security"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-indigo-600 hover:underline inline-flex items-center gap-1"
                >
                  Security Center <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <p className="text-sm text-slate-500 mt-1">
                Verify your Facebook business to display your verified brand name instead of your phone number and unlock unlimited messaging tiers.
              </p>
              <div className="mt-3 text-xs text-slate-600 space-y-1">
                <p className="font-semibold text-slate-700">Requirements:</p>
                <ul className="list-disc pl-5 space-y-0.5 text-slate-500">
                  <li>Legal business registration document (GST, Certificate of Incorporation, or MSME)</li>
                  <li>Working business website with your brand name</li>
                </ul>
              </div>
              <a
                href="https://business.facebook.com/settings/security"
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors"
              >
                Verify Business ↗
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Help Videos Button */}
      <a
        href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
        target="_blank"
        rel="noreferrer"
        className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white border border-slate-200 shadow-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all hover:scale-105"
      >
        <HelpCircle className="w-4 h-4 text-indigo-600" />
        Help &amp; Guides
      </a>

      {/* Embedded Signup Modal */}
      <ConnectWhatsAppModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => {
          onRefresh?.();
        }}
      />
    </div>
  );
}
