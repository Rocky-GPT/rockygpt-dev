export function ErrorPanel({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-red-200">
      <h2 className="font-semibold">{title}</h2>
      {detail && <p className="mt-2 font-mono text-sm">{detail}</p>}
    </div>
  );
}
