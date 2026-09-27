'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Wallet as WalletIcon,
  XCircle,
} from 'lucide-react'

import { SettingsPanelHead } from './settings-panel-head'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { RechargeModal } from '@/components/wallet/recharge-modal'
import type { WalletTransaction, TopupRequest, WalletRates } from '@/lib/wallet/wallet'

interface WalletApiResponse {
  balance: number
  currency: string
  isExempt: boolean
  role?: string
  rates: WalletRates
  transactions: WalletTransaction[]
  pendingTopups: TopupRequest[]
}

export function WalletSettings() {
  const [data, setData] = useState<WalletApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [openRecharge, setOpenRecharge] = useState(false)
  const [busyActionId, setBusyActionId] = useState<string | null>(null)
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [adjusting, setAdjusting] = useState(false)

  const fetchWalletData = useCallback(async () => {
    try {
      const res = await fetch('/api/wallet', { cache: 'no-store' })
      if (!res.ok) throw new Error('Could not load wallet data')
      const json = await res.json()
      setData(json)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load wallet')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchWalletData()

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const sessionId = params.get('stripe_session_id')
      const cancelled = params.get('stripe_cancel')

      if (cancelled === 'true') {
        toast.info('Stripe payment was cancelled.')
        window.history.replaceState({}, '', window.location.pathname)
        return
      }

      if (sessionId) {
        toast.loading('Verifying your Stripe payment...', { id: 'stripe-verify' })
        fetch(`/api/wallet/stripe-verify?session_id=${encodeURIComponent(sessionId)}`)
          .then((res) => res.json())
          .then((result) => {
            if (result.paid) {
              toast.success(
                `Payment verified! ₹${result.amount} has been added to your wallet.`,
                { id: 'stripe-verify' }
              )
              void fetchWalletData()
            } else {
              toast.error(result.message || 'Payment not yet verified', { id: 'stripe-verify' })
            }
          })
          .catch(() => {
            toast.error('Could not verify Stripe payment', { id: 'stripe-verify' })
          })
          .finally(() => {
            window.history.replaceState({}, '', window.location.pathname)
          })
      }
    }
  }, [fetchWalletData])

  async function handleApproveTopup(requestId: string, action: 'approve' | 'reject') {
    setBusyActionId(requestId)
    try {
      const res = await fetch('/api/wallet/topup', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, action }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || `Could not ${action} request`)
      toast.success(action === 'approve' ? 'Payment approved and credited!' : 'Request rejected.')
      await fetchWalletData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusyActionId(null)
    }
  }

  async function handleToggleExemption(nextVal: boolean) {
    try {
      const res = await fetch('/api/wallet/topup', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isExempt: nextVal }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Failed to update exemption')
      toast.success(nextVal ? 'Account exempted from billing' : 'Exemption disabled')
      await fetchWalletData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed')
    }
  }

  async function handleManualAdjustment(e: React.FormEvent) {
    e.preventDefault()
    const amt = parseFloat(adjustAmount)
    if (isNaN(amt) || amt === 0) {
      toast.error('Enter a valid non-zero adjustment amount (e.g. 500 or -50)')
      return
    }

    setAdjusting(true)
    try {
      const res = await fetch('/api/wallet/topup', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adjustAmount: amt,
          adjustReason: adjustReason.trim() || undefined,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Adjustment failed')
      toast.success(`Wallet adjusted by ₹${amt}`)
      setAdjustAmount('')
      setAdjustReason('')
      await fetchWalletData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Adjustment failed')
    } finally {
      setAdjusting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const isOwner = data?.role === 'owner' || data?.role === 'admin'

  return (
    <div className="space-y-6">
      <SettingsPanelHead
        title="Prepaid Message Wallet"
        description="Recharge credits via UPI to send WhatsApp messages and campaigns without needing your own credit card."
        action={
          <Button size="sm" onClick={() => setOpenRecharge(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Recharge via UPI
          </Button>
        }
      />

      {/* Top Overview Grid */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Balance Card */}
        <Card className="border-primary/20 bg-primary/[0.03] md:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Current Available Balance
              </span>
              {data?.isExempt ? (
                <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                  Unlimited (Exempt)
                </Badge>
              ) : (
                <Badge variant="outline" className="border-primary/30 text-primary">
                  Prepaid INR (₹)
                </Badge>
              )}
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                {data?.isExempt ? 'Unlimited' : `₹${data?.balance.toFixed(2) ?? '0.00'}`}
              </span>
              {!data?.isExempt && (
                <span className="text-xs text-muted-foreground">available for messages</span>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button size="sm" onClick={() => setOpenRecharge(true)}>
                <CreditCard className="mr-1.5 h-4 w-4" />
                Add Funds via UPI
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchWalletData}
                title="Refresh balance"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <p className="text-xs text-muted-foreground">
                Zero processing fee. Scan UPI QR from any app.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Per-Message Rate Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Message Rates</CardTitle>
            <CardDescription className="text-xs">
              Deducted per sent recipient
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex items-center justify-between border-b pb-1.5">
              <span className="text-muted-foreground">Marketing Template</span>
              <span className="font-semibold text-foreground">
                ₹{data?.rates.marketingRate.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between border-b pb-1.5">
              <span className="text-muted-foreground">Utility Template</span>
              <span className="font-semibold text-foreground">
                ₹{data?.rates.utilityRate.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between border-b pb-1.5">
              <span className="text-muted-foreground">Service / Freeform</span>
              <span className="font-semibold text-foreground">
                ₹{data?.rates.serviceRate.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between pt-0.5">
              <span className="text-muted-foreground">Delivery Failures</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                Auto-Refunded
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Top-Up Verification Requests (Admins) */}
      {data?.pendingTopups && data.pendingTopups.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/[0.02]">
          <CardHeader>
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <Clock className="h-5 w-5" />
              <CardTitle className="text-base">
                Pending UPI Payment Verifications ({data.pendingTopups.length})
              </CardTitle>
            </div>
            <CardDescription>
              Review submitted UPI reference numbers (UTR) to credit account balances.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.pendingTopups.map((req) => (
                <div
                  key={req.id}
                  className="flex flex-col justify-between gap-3 rounded-lg border border-border/80 bg-background p-3 sm:flex-row sm:items-center"
                >
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-foreground">₹{req.amount}</span>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        UTR: {req.utrNumber}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground">
                      Submitted on {new Date(req.createdAt).toLocaleString()}
                      {req.notes ? ` • "${req.notes}"` : ''}
                    </p>
                  </div>

                  {isOwner && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                        disabled={busyActionId === req.id}
                        onClick={() => handleApproveTopup(req.id, 'approve')}
                      >
                        {busyActionId === req.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Approve & Credit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-destructive hover:bg-destructive/10"
                        disabled={busyActionId === req.id}
                        onClick={() => handleApproveTopup(req.id, 'reject')}
                      >
                        <XCircle className="mr-1.5 h-3.5 w-3.5" />
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Owner Controls: Exemption & Manual Topup */}
      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Admin Credit Adjustment</CardTitle>
            <CardDescription className="text-xs">
              Quickly adjust wallet balance or toggle billing exemption for this account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-xs font-semibold">Billing Exemption (Unlimited Sending)</Label>
                <p className="text-xs text-muted-foreground">
                  If enabled, outbound messages are never blocked and no balance is deducted.
                </p>
              </div>
              <Switch
                checked={data?.isExempt ?? false}
                onCheckedChange={handleToggleExemption}
              />
            </div>

            <form onSubmit={handleManualAdjustment} className="flex flex-col gap-2.5 sm:flex-row">
              <Input
                type="number"
                placeholder="Amount (e.g. 500 or -50)"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                className="w-full sm:w-44 text-xs"
              />
              <Input
                placeholder="Reason / Note (optional)"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                className="flex-1 text-xs"
              />
              <Button type="submit" size="sm" disabled={adjusting}>
                {adjusting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply Adjustment'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Transaction History / Ledger */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transaction Ledger</CardTitle>
          <CardDescription className="text-xs">
            Complete record of UPI recharges, message deductions, and delivery refunds.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!data?.transactions || data.transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-xs text-muted-foreground">
              <WalletIcon className="h-8 w-8 text-muted-foreground/40 mb-2" />
              No transactions recorded yet. Recharge your wallet to start.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="pb-2 font-medium">Type</th>
                    <th className="pb-2 font-medium">Description</th>
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 font-medium text-right">Amount</th>
                    <th className="pb-2 font-medium text-right">Balance After</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {data.transactions.map((tx) => {
                    const isCredit = tx.amount > 0
                    return (
                      <tr key={tx.id} className="hover:bg-muted/30">
                        <td className="py-2.5">
                          <div className="flex items-center gap-1.5 font-medium">
                            {tx.type === 'topup' && (
                              <ArrowDownRight className="h-3.5 w-3.5 text-emerald-500" />
                            )}
                            {tx.type === 'refund' && (
                              <RotateCcw className="h-3.5 w-3.5 text-blue-500" />
                            )}
                            {tx.type.includes('debit') && (
                              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                            {tx.type === 'admin_adjustment' && (
                              <RefreshCw className="h-3.5 w-3.5 text-amber-500" />
                            )}
                            <span className="capitalize">
                              {tx.type.replace('_', ' ')}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 text-muted-foreground max-w-xs truncate">
                          {tx.description}
                          {tx.referenceId ? (
                            <span className="ml-1.5 font-mono text-[10px] text-muted-foreground/70">
                              ({tx.referenceId})
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2.5 text-muted-foreground whitespace-nowrap">
                          {new Date(tx.createdAt).toLocaleDateString()}{' '}
                          <span className="text-[10px]">
                            {new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </td>
                        <td
                          className={`py-2.5 text-right font-semibold whitespace-nowrap ${
                            isCredit
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-foreground'
                          }`}
                        >
                          {isCredit ? `+₹${tx.amount.toFixed(2)}` : `-₹${Math.abs(tx.amount).toFixed(2)}`}
                        </td>
                        <td className="py-2.5 text-right text-muted-foreground whitespace-nowrap">
                          {tx.balanceAfter !== null ? `₹${tx.balanceAfter.toFixed(2)}` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <RechargeModal
        open={openRecharge}
        onOpenChange={setOpenRecharge}
        upiId={data?.rates.upiId}
        upiName={data?.rates.upiName}
        onSuccess={fetchWalletData}
      />
    </div>
  )
}
