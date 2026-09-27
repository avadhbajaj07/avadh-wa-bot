'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { toast } from 'sonner'
import {
  Check,
  Copy,
  CreditCard,
  Loader2,
  QrCode,
  ShieldCheck,
  Smartphone,
} from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface RechargeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  upiId?: string
  upiName?: string
  onSuccess?: () => void
}

const PRESET_AMOUNTS = [200, 500, 1000, 2500]

export function RechargeModal({
  open,
  onOpenChange,
  upiId = 'avadhbajaj02@okhdfcbank',
  upiName = 'SandeshAI',
  onSuccess,
}: RechargeModalProps) {
  const [amount, setAmount] = useState<number>(500)
  const [customAmount, setCustomAmount] = useState<string>('500')
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [utrNumber, setUtrNumber] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [copiedUpi, setCopiedUpi] = useState<boolean>(false)
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [step, setStep] = useState<'pay' | 'utr' | 'success'>('pay')

  // Generate UPI URI
  const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(
    upiName
  )}&am=${amount}&cu=INR&tn=${encodeURIComponent(`SandeshAI Wallet Topup ₹${amount}`)}`

  useEffect(() => {
    if (!open) {
      setStep('pay')
      setUtrNumber('')
      setNotes('')
      return
    }

    QRCode.toDataURL(upiUrl, {
      width: 260,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('Failed to generate QR code:', err))
  }, [open, upiUrl])

  function handleSelectPreset(preset: number) {
    setAmount(preset)
    setCustomAmount(preset.toString())
  }

  function handleCustomAmountChange(val: string) {
    setCustomAmount(val)
    const parsed = parseInt(val, 10)
    if (!isNaN(parsed) && parsed > 0) {
      setAmount(parsed)
    }
  }

  function copyUpiId() {
    navigator.clipboard.writeText(upiId).then(() => {
      setCopiedUpi(true)
      toast.success('UPI ID copied to clipboard')
      setTimeout(() => setCopiedUpi(false), 2000)
    })
  }

  async function handleSubmitUtr(e: React.FormEvent) {
    e.preventDefault()
    const cleanUtr = utrNumber.trim()
    if (!cleanUtr || cleanUtr.length < 6) {
      toast.error('Please enter a valid 12-digit UPI UTR / Reference ID')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/wallet/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          utrNumber: cleanUtr,
          notes: notes.trim() || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit top-up request')
      }

      setStep('success')
      toast.success('Payment submitted for verification!')
      onSuccess?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Recharge Message Wallet
          </DialogTitle>
          <DialogDescription>
            Pay using any UPI app (GPay, PhonePe, Paytm, BHIM). Messages are deducted from this
            balance.
          </DialogDescription>
        </DialogHeader>

        {step === 'pay' && (
          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-xs text-muted-foreground">Select Amount (INR ₹)</Label>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {PRESET_AMOUNTS.map((preset) => (
                  <Button
                    key={preset}
                    type="button"
                    variant={amount === preset ? 'default' : 'outline'}
                    size="sm"
                    className="font-medium"
                    onClick={() => handleSelectPreset(preset)}
                  >
                    ₹{preset}
                  </Button>
                ))}
              </div>
              <div className="mt-2.5">
                <Input
                  type="number"
                  placeholder="Or enter custom amount (min ₹10)"
                  value={customAmount}
                  onChange={(e) => handleCustomAmountChange(e.target.value)}
                  min="10"
                />
              </div>
            </div>

            <div className="flex flex-col items-center justify-center rounded-xl border bg-muted/30 p-4">
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrDataUrl}
                  alt={`UPI QR Code for ₹${amount}`}
                  className="h-44 w-44 rounded-lg border bg-white p-2 shadow-sm"
                />
              ) : (
                <div className="flex h-44 w-44 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}

              <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <QrCode className="h-3.5 w-3.5 text-primary" />
                <span>Scan with Google Pay, PhonePe, Paytm, or BHIM</span>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/80 bg-background p-2.5 text-xs">
              <div>
                <span className="text-muted-foreground">UPI ID: </span>
                <span className="font-semibold text-foreground">{upiId}</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={copyUpiId}
              >
                {copiedUpi ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                <span className="ml-1 text-xs">{copiedUpi ? 'Copied' : 'Copy'}</span>
              </Button>
            </div>

            {/* Mobile direct UPI trigger link */}
            <a
              href={upiUrl}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary/20 bg-primary/10 p-2.5 text-xs font-medium text-primary sm:hidden"
            >
              <Smartphone className="h-4 w-4" />
              Tap to Pay directly in your UPI App
            </a>

            <Button
              type="button"
              className="w-full"
              onClick={() => setStep('utr')}
            >
              I Have Completed Payment →
            </Button>
          </div>
        )}

        {step === 'utr' && (
          <form onSubmit={handleSubmitUtr} className="space-y-4 pt-2">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
              You are submitting verification for{' '}
              <strong className="text-foreground">₹{amount}</strong> paid to{' '}
              <strong className="text-foreground">{upiId}</strong>.
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="utr" className="text-xs font-semibold">
                12-Digit UPI Reference Number (UTR / Transaction ID) *
              </Label>
              <Input
                id="utr"
                required
                placeholder="e.g. 427189024819"
                value={utrNumber}
                onChange={(e) => setUtrNumber(e.target.value)}
                maxLength={30}
                className="font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                Found in your Google Pay / PhonePe / Paytm receipt details.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-xs">
                Optional Note / Sender Name
              </Label>
              <Input
                id="notes"
                placeholder="e.g. Paid via Avadh PhonePe"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="w-1/3"
                onClick={() => setStep('pay')}
                disabled={submitting}
              >
                ← Back
              </Button>
              <Button type="submit" className="w-2/3" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Verification'
                )}
              </Button>
            </div>
          </form>
        )}

        {step === 'success' && (
          <div className="flex flex-col items-center py-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <h3 className="mt-3 text-base font-semibold text-foreground">
              Verification Submitted!
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Your UPI payment for ₹{amount} with UTR <code className="font-mono">{utrNumber}</code>{' '}
              has been recorded. Your wallet will update shortly.
            </p>
            <Button
              type="button"
              className="mt-6 w-full"
              onClick={() => onOpenChange(false)}
            >
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
