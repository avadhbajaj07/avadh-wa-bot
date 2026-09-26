'use client';

import { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Phone,
  ArrowLeftRight,
  ShieldCheck,
  X,
  CheckCircle2,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';

declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

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
  const [isSyncing, setIsSyncing] = useState(false);
  const [serverSecretConfigured, setServerSecretConfigured] = useState<boolean | null>(null);

  // Embedded Signup Meta Config
  const appId = process.env.NEXT_PUBLIC_META_APP_ID || '1543169234022851';
  const configId = '1748805636232767'; // Generated Tech Provider Config
  const redirectUri = typeof window !== 'undefined'
    ? `${window.location.origin}/api/whatsapp/oauth/callback`
    : 'https://www.shikhabajaj.online/api/whatsapp/oauth/callback';

  // Captured data from Meta postMessage & FB.login
  const sessionDataRef = useRef<{ waba_id?: string; phone_number_id?: string }>({});
  const isHandlingCodeRef = useRef(false);

  // Check server configuration status on modal open
  useEffect(() => {
    if (!open) return;
    fetch('/api/whatsapp/config')
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.meta_app_secret_configured === 'boolean') {
          setServerSecretConfigured(data.meta_app_secret_configured);
        }
      })
      .catch(() => {});
  }, [open]);

  // Load and initialize Facebook JavaScript SDK if not already done by layout
  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.fbAsyncInit = function () {
      if (window.FB) {
        window.FB.init({
          appId: appId,
          cookie: true,
          xfbml: false,
          version: 'v22.0',
        });
        console.log('[FB SDK] Initialized with App ID:', appId);
      }
    };

    if (!document.getElementById('facebook-jssdk')) {
      const script = document.createElement('script');
      script.id = 'facebook-jssdk';
      script.src = 'https://connect.facebook.net/en_US/sdk.js';
      script.async = true;
      script.defer = true;
      script.crossOrigin = 'anonymous';
      document.body.appendChild(script);
    } else if (window.FB) {
      try {
        window.FB.init({
          appId: appId,
          cookie: true,
          xfbml: false,
          version: 'v22.0',
        });
      } catch (err) {
        console.warn('[FB SDK] Re-init notice:', err);
      }
    }
  }, [appId]);

  // Listen for Embedded Signup completion message from Facebook popup or callback
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const isFacebook = typeof event.origin === 'string' && event.origin.endsWith('facebook.com');
      const isSelf = typeof window !== 'undefined' && event.origin === window.location.origin;
      if (!isFacebook && !isSelf) return;

      try {
        const payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;

        // Event from Meta Embedded Signup popup
        if (payload.type === 'WA_EMBEDDED_SIGNUP') {
          console.log('[Embedded Signup Message Event]:', payload);
          if (
            payload.event === 'FINISH' ||
            payload.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' ||
            payload.event === 'FINISH_ONLY_WABA'
          ) {
            const { phone_number_id, waba_id } = payload.data || {};
            sessionDataRef.current = {
              phone_number_id: phone_number_id || sessionDataRef.current.phone_number_id,
              waba_id: waba_id || sessionDataRef.current.waba_id,
            };
          } else if (payload.event === 'CANCEL') {
            setIsLaunching(false);
          } else if (payload.event === 'ERROR') {
            toast.error(payload.data?.error_message || 'WhatsApp Onboarding Error');
            setIsLaunching(false);
          }
        }

        // Response from popup OAuth redirect fallback
        if (payload.type === 'WA_EMBEDDED_SIGNUP_SUCCESS') {
          toast.success('WhatsApp Business Account authorized successfully!');
          onSuccess?.();
          onClose();
        } else if (payload.type === 'WA_EMBEDDED_SIGNUP_ERROR') {
          toast.error(payload.error || 'WhatsApp connection failed.');
          setIsLaunching(false);
        }
      } catch {
        // Ignore unparseable postMessages from browser extensions
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onClose, onSuccess]);

  if (!open) return null;

  const completeBackendExchange = async (code: string) => {
    if (isHandlingCodeRef.current) return;
    isHandlingCodeRef.current = true;
    setIsSyncing(true);

    try {
      toast.loading('Linking your WhatsApp Business Account...', { id: 'wa-onboarding' });

      // Brief tick in case sessionInfo postMessage with waba_id is in flight
      await new Promise((resolve) => setTimeout(resolve, 500));

      const payload = {
        code,
        waba_id: sessionDataRef.current.waba_id,
        phone_number_id: sessionDataRef.current.phone_number_id,
      };

      console.log('[Embedded Signup] Completing backend handshake with payload:', payload);

      const res = await fetch('/api/whatsapp/oauth/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to complete WhatsApp connection');
      }

      toast.success('WhatsApp Business Account connected successfully!', { id: 'wa-onboarding' });
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'WhatsApp connection failed';
      console.error('[Embedded Signup Handshake Error]:', err);
      toast.error(msg, { id: 'wa-onboarding' });
    } finally {
      setIsLaunching(false);
      setIsSyncing(false);
      isHandlingCodeRef.current = false;
    }
  };

  const handleContinueWithFacebook = () => {
    if (!confirmedOtp) {
      toast.error('Please confirm you can receive an OTP on your WhatsApp number.');
      return;
    }

    setIsLaunching(true);
    isHandlingCodeRef.current = false;
    sessionDataRef.current = {};

    const extrasPayload: Record<string, string> = {
      version: 'v4',
      sessionInfoVersion: '3',
    };
    if (scenario === 'active_wa_app') {
      extrasPayload.featureType = 'whatsapp_business_app_onboarding';
    }

    const fb = typeof window !== 'undefined' ? window.FB : null;

    // Official Meta Flow: Facebook JavaScript SDK FB.login (synchronous to preserve user gesture)
    if (fb) {
      console.log('[Embedded Signup] Launching via FB.login...');
      fb.login(
        (response: any) => {
          console.log('[FB.login response]:', response);
          if (response.authResponse?.code) {
            completeBackendExchange(response.authResponse.code);
          } else {
            console.warn('[FB.login] No authResponse code returned:', response);
            setIsLaunching(false);
          }
        },
        {
          config_id: configId,
          response_type: 'code',
          override_default_response_type: true,
          extras: extrasPayload,
        }
      );
    } else {
      // Fallback: If FB SDK is blocked by browser ad blocker, use standard OAuth dialog
      console.log('[Embedded Signup] FB SDK not loaded, using direct dialog popup...');
      const targetUrl = `https://www.facebook.com/v22.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&config_id=${configId}&response_type=code&extras=${encodeURIComponent(JSON.stringify(extrasPayload))}`;

      const width = 600;
      const height = 750;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      const popup = window.open(
        targetUrl,
        'MetaEmbeddedSignup',
        `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,status=no,toolbar=no`
      );

      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        window.location.href = targetUrl;
      } else {
        popup.focus();
      }
    }
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

        {/* Server Setup Notice if META_APP_SECRET is not configured */}
        {serverSecretConfigured === false && (
          <div className="my-4 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
            <div className="flex items-center gap-2 font-bold mb-1.5 text-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Vercel Configuration Notice: META_APP_SECRET is not configured</span>
            </div>
            <p className="text-amber-800 leading-relaxed mb-2">
              Meta requires your <strong>App Secret</strong> on the server to finish linking WhatsApp. Please copy it from:
            </p>
            <a
              href="https://developers.facebook.com/apps/1543169234022851/settings/basic/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-indigo-700 underline hover:text-indigo-900"
            >
              Meta App Dashboard &gt; Settings &gt; Basic &gt; App Secret ↗
            </a>
            <p className="text-amber-700 mt-2">
              Add it in your <strong>Vercel Project Settings &gt; Environment Variables</strong> as <code>META_APP_SECRET</code>, then redeploy.
            </p>
          </div>
        )}

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
              disabled={isLaunching || isSyncing}
              className="w-1/2 sm:w-auto px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-semibold transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleContinueWithFacebook}
              disabled={isLaunching || isSyncing}
              className="w-1/2 sm:w-auto px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold shadow-md shadow-blue-200 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
            >
              {isSyncing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  Linking Account...
                </>
              ) : isLaunching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  Waiting for Meta...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 fill-white" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                  Continue with Facebook
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
