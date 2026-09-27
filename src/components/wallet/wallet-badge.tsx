'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, Wallet as WalletIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RechargeModal } from '@/components/wallet/recharge-modal'

interface WalletData {
  balance: number
  currency: string
  isExempt: boolean
  rates: {
    upiId: string
    upiName: string
  }
}

export function WalletBadge() {
  const [wallet, setWallet] = useState<WalletData | null>(null)
  const [openRecharge, setOpenRecharge] = useState(false)

  const fetchWallet = useCallback(async () => {
    try {
      const res = await fetch('/api/wallet', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setWallet(data)
    } catch {
      // Graceful ignore
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const loadData = async () => {
      try {
        const res = await fetch('/api/wallet', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (isMounted) {
          setWallet(data)
        }
      } catch {
        // Graceful ignore
      }
    }

    void loadData()
    // Poll every 30 seconds for balance sync
    const timer = setInterval(() => {
      void loadData()
    }, 30_000)

    return () => {
      isMounted = false
      clearInterval(timer)
    }
  }, [])

  if (!wallet) return null

  const isLow = !wallet.isExempt && wallet.balance < 50
  const isZero = !wallet.isExempt && wallet.balance <= 0

  return (
    <>
      <div className="flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/40 px-2.5 py-1 text-xs shadow-sm transition-colors hover:bg-muted/70">
        <WalletIcon className="h-3.5 w-3.5 text-primary" />
        {wallet.isExempt ? (
          <span className="font-medium text-emerald-600 dark:text-emerald-400">
            Unlimited
          </span>
        ) : (
          <span
            className={`font-semibold ${
              isZero
                ? 'text-destructive font-bold'
                : isLow
                  ? 'text-amber-500'
                  : 'text-foreground'
            }`}
          >
            ₹{wallet.balance.toFixed(2)}
          </span>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-5 w-5 rounded-full p-0 text-muted-foreground hover:bg-primary/20 hover:text-primary"
          onClick={() => setOpenRecharge(true)}
          title="Recharge wallet via UPI"
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>

      <RechargeModal
        open={openRecharge}
        onOpenChange={setOpenRecharge}
        upiId={wallet.rates?.upiId}
        upiName={wallet.rates?.upiName}
        onSuccess={fetchWallet}
      />
    </>
  )
}
