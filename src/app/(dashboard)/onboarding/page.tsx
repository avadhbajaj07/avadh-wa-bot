'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import {
  Building2,
  Globe,
  Briefcase,
  MapPin,
  Radio,
  Bot,
  Users,
  Zap,
  FileSpreadsheet,
  Wrench,
  HelpCircle,
  Check,
  ArrowRight,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';

const INDUSTRIES = [
  'E-commerce & Retail',
  'Real Estate & Construction',
  'Healthcare & Clinics',
  'Education & Coaching',
  'Automotive & Dealerships',
  'Marketing & Advertising Agency',
  'Financial Services & Consulting',
  'Hospitality & Tourism',
  'Software & Technology',
  'Other',
];

const STATES = [
  'Andhra Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Delhi NCR',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Tamil Nadu',
  'Telangana',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Other / International',
];

const USE_CASES = [
  { id: 'campaign', label: 'Bulk WhatsApp Campaign', icon: Radio },
  { id: 'chatbot', label: 'Chatbot', icon: Bot },
  { id: 'inbox', label: 'Multi Agent Inbox', icon: Users },
  { id: 'automation', label: 'Automation', icon: Zap },
  { id: 'flows', label: 'WhatsApp Flows/Forms', icon: FileSpreadsheet },
  { id: 'custom', label: 'Custom WhatsApp Solution', icon: Wrench },
  { id: 'other', label: 'Other', icon: HelpCircle },
];

const REFERRAL_SOURCES = [
  'Friend or Referral',
  'Google Search',
  'YouTube',
  'Google Sheets Add-on',
  'LinkedIn',
  'Reddit',
  'AI Assistant',
  'Social Media',
  'Other',
];

export default function OnboardingPage() {
  const router = useRouter();
  const { user, accountId } = useAuth();
  const supabase = createClient();

  const [step, setStep] = useState<2 | 3>(2);
  const [saving, setSaving] = useState(false);

  // Step 2 Form
  const [companyName, setCompanyName] = useState('');
  const [website, setWebsite] = useState('');
  const [industry, setIndustry] = useState(INDUSTRIES[0]);
  const [state, setState] = useState('Madhya Pradesh');

  // Step 3 Form
  const [selectedUseCases, setSelectedUseCases] = useState<string[]>(['campaign', 'inbox']);
  const [hasExperience, setHasExperience] = useState<'yes' | 'no'>('no');
  const [referralSource, setReferralSource] = useState('Google Search');

  const toggleUseCase = (id: string) => {
    setSelectedUseCases((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleStep2Submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      toast.error('Please enter your company name');
      return;
    }
    setStep(3);
  };

  const handleFinishOnboarding = async () => {
    try {
      setSaving(true);
      if (accountId && companyName.trim()) {
        // Update account name
        await supabase
          .from('accounts')
          .update({ name: companyName.trim(), updated_at: new Date().toISOString() })
          .eq('id', accountId);
      }

      toast.success('Workspace personalized successfully!');
      router.push('/dashboard');
    } catch (err) {
      console.error('Onboarding save error:', err);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/60 py-12 px-4 sm:px-6 lg:px-8 flex flex-col justify-center items-center">
      <div className="w-full max-w-2xl">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between text-xs font-semibold text-indigo-600 mb-2">
            <span>Step {step} of 3</span>
            <span>{step === 2 ? '67% complete' : 'Final step'}</span>
          </div>
          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-indigo-600 h-full rounded-full transition-all duration-300"
              style={{ width: step === 2 ? '67%' : '100%' }}
            />
          </div>
        </div>

        {/* ── STEP 2: Company Details ────────────────────────────── */}
        {step === 2 && (
          <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-8 sm:p-10">
            <div className="text-center mb-8">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
                Tell us about your company
              </h1>
              <p className="text-slate-500 text-sm mt-2">
                This helps us personalize your workspace and recommend the right setup for your business.
              </p>
            </div>

            <form onSubmit={handleStep2Submit} className="space-y-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                  Company name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Building2 className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g. Maruti Digital"
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-slate-900 text-sm outline-hidden transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                  Website or social profile <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Globe className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="Instagram, LinkedIn, or company website"
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-slate-900 text-sm outline-hidden transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                    Industry <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Briefcase className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <select
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-slate-900 text-sm outline-hidden bg-white transition-all appearance-none cursor-pointer"
                    >
                      {INDUSTRIES.map((ind) => (
                        <option key={ind} value={ind}>
                          {ind}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                    State / Union Territory <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <MapPin className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <select
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-slate-900 text-sm outline-hidden bg-white transition-all appearance-none cursor-pointer"
                    >
                      {STATES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="w-full mt-6 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-md shadow-indigo-200 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
              >
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}

        {/* ── STEP 3: Personalize Workspace ─────────────────────── */}
        {step === 3 && (
          <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-8 sm:p-10">
            <div className="text-center mb-8">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
                Personalize your workspace
              </h1>
              <p className="text-slate-500 text-sm mt-2">
                What do you want to use Maruti Digital for? Pick your use cases (you&apos;ll still have access to all features).
              </p>
            </div>

            <div className="space-y-8">
              {/* Use Cases Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {USE_CASES.map((uc) => {
                  const active = selectedUseCases.includes(uc.id);
                  const Icon = uc.icon;
                  return (
                    <button
                      key={uc.id}
                      type="button"
                      onClick={() => toggleUseCase(uc.id)}
                      className={`flex items-center justify-between p-4 rounded-xl border text-left text-sm font-medium transition-all ${
                        active
                          ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900'
                          : 'border-slate-200 hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={`w-5 h-5 ${active ? 'text-indigo-600' : 'text-slate-400'}`} />
                        <span>{uc.label}</span>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                          active ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300'
                        }`}
                      >
                        {active && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Experience Level */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
                  Have you used WhatsApp Business API before? <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setHasExperience('no')}
                    className={`p-4 rounded-xl border text-sm font-semibold flex items-center justify-between transition-all ${
                      hasExperience === 'no'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-900'
                        : 'border-slate-200 text-slate-700'
                    }`}
                  >
                    <span>No, I am new to this</span>
                    {hasExperience === 'no' && <Check className="w-4 h-4 text-indigo-600 stroke-[3]" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setHasExperience('yes')}
                    className={`p-4 rounded-xl border text-sm font-semibold flex items-center justify-between transition-all ${
                      hasExperience === 'yes'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-900'
                        : 'border-slate-200 text-slate-700'
                    }`}
                  >
                    <span>Yes, I have experience</span>
                    {hasExperience === 'yes' && <Check className="w-4 h-4 text-indigo-600 stroke-[3]" />}
                  </button>
                </div>
              </div>

              {/* Referral Source */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
                  How did you hear about us? <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {REFERRAL_SOURCES.map((src) => {
                    const active = referralSource === src;
                    return (
                      <button
                        key={src}
                        type="button"
                        onClick={() => setReferralSource(src)}
                        className={`p-2.5 rounded-lg border text-xs font-medium text-center transition-all ${
                          active
                            ? 'border-indigo-600 bg-indigo-600 text-white font-semibold'
                            : 'border-slate-200 hover:border-slate-300 text-slate-600'
                        }`}
                      >
                        {src}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-6 py-3.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-sm transition-all flex items-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleFinishOnboarding}
                  className="flex-1 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-md shadow-indigo-200 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {saving ? 'Setting up workspace...' : 'Complete setup'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
