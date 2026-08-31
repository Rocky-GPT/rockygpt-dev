export function BrainFeaturePending({ contract }: { contract: string }) {
  return (
    <div className="max-w-3xl rounded-2xl border border-white/10 bg-white/5 p-5 text-sm leading-6 text-muted-foreground">
      <p>This interface is preserved, but it is disconnected while the clean-room Brain is rebuilt.</p>
      <p className="mt-2 font-mono text-xs text-foreground/70">Waiting for {contract}</p>
    </div>
  );
}
