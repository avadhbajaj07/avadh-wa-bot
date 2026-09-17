'use client';

import { useState, useEffect } from 'react';
import {
  MessageSquare,
  Phone,
  ArrowLeftRight,
  ShieldCheck,
  X,
  ExternalLink,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';

interface ConnectWhatsAppModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type NumberScenario = 'new_number' | 'active_wa_app' | 'migrate_bsp';

export function ConnectWhatsAppModal({ open, onClose, onSuccess }: ConnectWhatsAppModalProps) {
  const [scenario, setScenario] = useState<NumberScenario>('new_number');
  const [confirmedOtp, setConfirmedOtp] = useState(true);
  const [isLaunching, setIsLaunching] = useState(false);

  // Embedded Signup Meta Config
  const appId = process.env.NEXT_PUBLIC_META_APP_ID || '1543169234022851';
  const configId = '1748805636232767'; // Generated Tech Provider Config
  const redirectUri = typeof window !== 'undefined'
    ? `${window.location.origin}/api/whatsapp/oauth/callback`
    : 'https://www.shikhabajaj.online/api/whatsapp/oauth/callback';

  // Listen for Embedded Signup completion message from Facebook popup
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (!event.origin.endsWith('facebook.com')) return;

      try {
        const payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (payload.type === 'WA_EMBEDDED_SIGNUP') {
          console.log('[Embedded Signup Message Event]:', payload);
          if (payload.data?.waba_id) {
            toast.success('WhatsApp Business Account authorized! Syncing connection...');
            onSuccess?.();
            onClose();
          }
        }
      } catch {
        // Ignore unparseable postMessages from browser extensions
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onClose, onSuccess]);

  if (!open) return null;

  const handleContinueWithFacebook = () => {
    if (!confirmedOtp) {
      toast.error('Please confirm you can receive an OTP on your WhatsApp number.');
      return;
    }

    setIsLaunching(true);

    const extras = encodeURIComponent(
      JSON.stringify({
        version: 'v4',
        sessionInfoVersion: '3',
        featureType: 'whatsapp_business_app_onboarding',
      })
    );

    const targetUrl = `https://business.facebook.com/messaging/whatsapp/onboard/?app_id=${appId}&config_id=${configId}&extras=${extras}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}`;

    // Open as centered popup window
    const width = 600;
    const height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    const popup = window.open(
      targetUrl,
      'MetaEmbeddedSignup',
      `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,status=no,toolbar=no`
    );

    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      // Popup blocker active — redirect full window
      window.location.href = targetUrl;
    } else {
      popup.focus();
    }

    setIsLaunching(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-2xl w-full p-6 sm:p-8 relative">
        {/* Header */}
        <div className="flex items-center justify-between pb-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <MessageSquare className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Connect WhatsApp Business API</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3 Scenario Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-6">
          {/* Option 1: New Number */}
          <div
            onClick={() => setScenario('new_number')}
            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
              scenario === 'new_number'
                ? 'border-indigo-600 bg-indigo-50/40 shadow-xs ring-1 ring-indigo-600/30'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
                  <Phone className="w-4 h-4" />
                </div>
                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                    scenario === 'new_number' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300'
                  }`}
                >
                  {scenario === 'new_number' && <CheckCircle2 className="w-3.5 h-3.5 fill-white text-indigo-600" />}
                </div>
              </div>
              <p className="text-xs font-semibold text-slate-800 leading-snug">
                I want to use a new number that is not active on any WhatsApp app
              </p>
            </div>
            <span className="text-[11px] font-medium text-indigo-600 mt-4 hover:underline">
              Recommended
            </span>
          </div>

          {/* Option 2: Active WA Business app */}
          <div
            onClick={() => setScenario('active_wa_app')}
            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
              scenario === 'active_wa_app'
                ? 'border-indigo-600 bg-indigo-50/40 shadow-xs ring-1 ring-indigo-600/30'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                    scenario === 'active_wa_app' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300'
                  }`}
                >
                  {scenario === 'active_wa_app' && <CheckCircle2 className="w-3.5 h-3.5 fill-white text-indigo-600" />}
                </div>
              </div>
              <p className="text-xs font-semibold text-slate-800 leading-snug">
                I want to use a number currently active on WhatsApp Business app
              </p>
            </div>
            <span className="text-[11px] font-medium text-slate-500 mt-4">
              Requires delete from app first
            </span>
          </div>

          {/* Option 3: Migrate from BSP */}
          <div
            onClick={() => setScenario('migrate_bsp')}
            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
              scenario === 'migrate_bsp'
                ? 'border-indigo-600 bg-indigo-50/40 shadow-xs ring-1 ring-indigo-600/30'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center">
                  <ArrowLeftRight className="w-4 h-4" />
                </div>
                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                    scenario === 'migrate_bsp' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300'
                  }`}
                >
                  {scenario === 'migrate_bsp' && <CheckCircle2 className="w-3.5 h-3.5 fill-white text-indigo-600" />}
                </div>
              </div>
              <p className="text-xs font-semibold text-slate-800 leading-snug">
                Migrate existing API number from Twilio, Wati, Interakt, AiSensy
              </p>
            </div>
            <span className="text-[11px] font-medium text-slate-500 mt-4">
              0% markup migration
            </span>
          </div>
        </div>

        {/* Verification Checkbox */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
            <span className="text-xs font-bold text-slate-800">Verification Requirements</span>
          </div>
          <label className="flex items-start gap-2.5 text-xs text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={confirmedOtp}
              onChange={(e) => setConfirmedOtp(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded-sm text-indigo-600 border-slate-300 focus:ring-indigo-500"
            />
            <span>
              I confirm that I can receive an <strong>OTP (One-Time Password)</strong> via SMS or Phone Call on this phone number.
            </span>
          </label>
        </div>

        {/* Action Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
          <p className="text-[11px] text-slate-400 text-center sm:text-left">
            By continuing, you agree to our{' '}
            <a href="/terms" target="_blank" className="underline hover:text-slate-600">
              Terms
            </a>{' '}
            and{' '}
            <a href="/privacy" target="_blank" className="underline hover:text-slate-600">
              Privacy Policy
            </a>
          </p>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={onClose}
              className="w-1/2 sm:w-auto px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleContinueWithFacebook}
              disabled={isLaunching}
              className="w-1/2 sm:w-auto px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-md shadow-blue-200 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4 fill-white" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              {isLaunching ? 'Connecting...' : 'Continue with Facebook'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
