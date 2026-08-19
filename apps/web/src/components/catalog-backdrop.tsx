export function CatalogBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 text-foreground/25 opacity-40 dark:opacity-25 [mask-image:radial-gradient(ellipse_at_top,black,transparent_75%)]"
      style={{
        backgroundImage:
          "radial-gradient(circle, currentColor 0.9px, transparent 1.2px)",
        backgroundSize: "22px 22px",
      }}
    />
  );
}
