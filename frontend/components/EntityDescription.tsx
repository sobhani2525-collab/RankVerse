interface EntityDescriptionProps {
  text?: string | null;
}

export default function EntityDescription({ text }: EntityDescriptionProps) {
  if (!text) return null;

  return <p className="mt-5 text-sm leading-relaxed text-ink/90">{text}</p>;
}
