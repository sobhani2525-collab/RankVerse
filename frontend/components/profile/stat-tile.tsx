import { MonoLabel } from "@/components/list-detail/ui";

export default function StatTile({
  mono,
  value,
  label,
  icon,
  accent = "#8A93A6",
  valueClassName = "text-ink",
}: {
  mono: string;
  value: string;
  label: string;
  icon: React.ReactNode;
  accent?: string;
  valueClassName?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border-soft bg-surface/60 px-6 py-5">
      <div
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
      />
      <div className="flex items-center justify-between">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-xl"
          style={{ background: `${accent}1f`, color: accent }}
        >
          {icon}
        </div>
        <MonoLabel size="text-[10px]">{mono}</MonoLabel>
      </div>
      <div className={`num mt-4 text-right text-3xl font-bold ${valueClassName}`}>{value}</div>
      <div className="mt-1 text-xs text-muted">{label}</div>
    </div>
  );
}
