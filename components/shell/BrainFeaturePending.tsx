export function BrainFeaturePending({
  contract,
  kind,
}: {
  contract: string;
  kind: 'off' | 'planned';
}) {
  return (
    <div className="max-w-3xl rounded-2xl border border-white/10 bg-white/5 p-5 text-sm leading-6 text-muted-foreground">
      <p>
        {kind === 'off'
          ? 'This page is switched off. It was built for an older Brain and reads something the current Brain does not serve, so it would only show errors or empty numbers. Its code is kept for when the Brain serves it.'
          : 'This page does not exist yet.'}
      </p>
      <p className="mt-2 font-mono text-xs text-foreground/70">Waiting for {contract}</p>
    </div>
  );
}
