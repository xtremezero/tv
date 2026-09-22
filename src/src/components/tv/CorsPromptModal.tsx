'use client';

import React from 'react';
import { useTVStore } from '@/lib/tv/store';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ShieldAlert, ExternalLink, CheckCircle2, Download, RefreshCw, Lock } from 'lucide-react';

const EXTENSION_URL = 'https://webextension.org/listing/access-control.html';

export function CorsPromptModal() {
  const corsModalOpen = useTVStore((state) => state.corsModalOpen);
  const corsErrorUrl = useTVStore((state) => state.corsErrorUrl);
  const closeCorsModal = useTVStore((state) => state.closeCorsModal);

  const handleOpenExtension = () => {
    window.open(EXTENSION_URL, '_blank', 'noopener,noreferrer');
  };

  return (
    <Dialog open={corsModalOpen} onOpenChange={(open) => !open && closeCorsModal()}>
      <DialogContent className="max-w-md md:max-w-lg border-red-500/20 bg-background/95 backdrop-blur-xl shadow-2xl p-6 sm:p-8">
        <DialogHeader className="space-y-3 text-left">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-500 ring-1 ring-red-500/20">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Cross-Origin (CORS) Error
              </DialogTitle>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-500 ring-1 ring-red-500/20 mt-1">
                <Lock className="h-3 w-3" /> Browser Security Block
              </span>
            </div>
          </div>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground pt-1">
            Your browser blocked a media stream or playlist request because the remote server does not allow direct cross-origin access.
          </DialogDescription>
        </DialogHeader>

        {corsErrorUrl && (
          <div className="my-1 rounded-xl bg-muted/60 p-3 ring-1 ring-border text-xs font-mono text-muted-foreground break-all max-h-24 overflow-y-auto">
            <span className="font-sans font-semibold text-foreground block mb-1">Blocked Target URL:</span>
            {corsErrorUrl}
          </div>
        )}

        {/* How to Fix Section */}
        <div className="mt-2 space-y-4 rounded-2xl bg-card p-4 ring-1 ring-border/60">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Download className="h-4 w-4 text-red-500" />
              Recommended Quick Fix
            </h4>
            <span className="text-xs font-medium text-emerald-500 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> 100% Free Extension
            </span>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Install the <strong>Access-Control-Allow-Origin</strong> extension to unblock cross-origin fetch requests directly in Chrome, Firefox, or Edge.
          </p>

          <Button
            onClick={handleOpenExtension}
            className="w-full bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-semibold py-2.5 shadow-md shadow-red-500/20 transition-all flex items-center justify-center gap-2"
          >
            <span>Install Access-Control Extension</span>
            <ExternalLink className="h-4 w-4" />
          </Button>

          {/* Instructions */}
          <div className="space-y-2 pt-2 border-t border-border/40 text-xs text-muted-foreground">
            <div className="flex items-start gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted font-bold text-foreground text-[10px]">
                1
              </span>
              <span>Click the button above to open the official extension page.</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted font-bold text-foreground text-[10px]">
                2
              </span>
              <span>Click <strong>Add to Browser</strong> and turn <strong>ON</strong> the extension icon in your toolbar.</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted font-bold text-foreground text-[10px]">
                3
              </span>
              <span className="flex items-center gap-1">
                Return here and click <RefreshCw className="h-3 w-3 inline text-foreground" /> <strong>Retry</strong>.
              </span>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4 sm:justify-between flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleOpenExtension}
            className="text-xs flex items-center gap-1.5"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            webextension.org
          </Button>

          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={closeCorsModal}
            className="text-xs"
          >
            Got It & Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
