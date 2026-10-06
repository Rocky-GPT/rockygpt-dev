export function BrainFeaturePending({ contract }: { contract: string }) {
  return (
    <div className="max-w-3xl rounded-2xl border border-white/10 bg-white/5 p-5 text-sm leading-6 text-muted-foreground">
      <p>
        This page is switched off. It reads something the current Brain does not serve, so it would
        only show errors or empty numbers. The code is kept for when the Brain serves it.
      </p>
      <p className="mt-2 font-mono text-xs text-foreground/70">Waiting for {contract}</p>
    </div>
  );
}
