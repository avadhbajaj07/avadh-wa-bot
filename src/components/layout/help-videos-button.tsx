'use client';

import { useState } from 'react';
import { HelpCircle, Play } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface VideoTutorial {
  title: string;
  description: string;
  duration: string;
  url: string;
}

const TUTORIALS: VideoTutorial[] = [
  {
    title: 'How to Connect WhatsApp Business API',
    description: 'Connect your WhatsApp Business account with official Meta Cloud API.',
    duration: '3 min',
    url: 'https://business.facebook.com/billing_hub',
  },
  {
    title: 'Creating & Submitting WhatsApp Message Templates',
    description: 'Learn how to design templates, add variables, buttons, and get 2-minute approval.',
    duration: '4 min',
    url: '/templates',
  },
  {
    title: 'Sending Broadcast Campaigns to Contacts',
    description: 'Upload contacts, select approved templates, and send bulk campaigns with 1 click.',
    duration: '5 min',
    url: '/broadcasts',
  },
  {
    title: 'Setting Up AI Chatbot & Auto-Reply',
    description: 'Automate customer support with intelligent 24/7 AI employee workflows.',
    duration: '4 min',
    url: '/agents',
  },
];

export function HelpVideosButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Floating pill in bottom right */}
      <div className="fixed bottom-5 right-5 z-30">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-semibold text-primary shadow-sm backdrop-blur-xs transition-all hover:bg-primary/20 hover:scale-105 active:scale-95 cursor-pointer"
        >
          <HelpCircle className="size-4 text-primary" />
          <span>Help Videos</span>
        </button>
      </div>

      {/* Tutorial Videos Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <HelpCircle className="size-5 text-primary" />
              Help & Tutorial Videos
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Watch quick step-by-step guides to master WhatsApp automation and campaigns.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {TUTORIALS.map((tutorial, idx) => (
              <a
                key={idx}
                href={tutorial.url}
                target={tutorial.url.startsWith('http') ? '_blank' : '_self'}
                rel="noreferrer"
                className="group flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-3 transition-all hover:border-primary/40 hover:bg-primary/5"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                  <Play className="size-4 fill-current ml-0.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                      {tutorial.title}
                    </p>
                    <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                      {tutorial.duration}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                    {tutorial.description}
                  </p>
                </div>
              </a>
            ))}
          </div>

          <div className="flex justify-end pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              className="text-xs border-border"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
