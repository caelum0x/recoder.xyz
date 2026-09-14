/**
 * Renders a JSON-LD structured-data block. Centralizes the escape convention
 * already used inline in layout.tsx and page.tsx (`</` → `<`) so every
 * page emits schema.org data the same, XSS-safe way.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
