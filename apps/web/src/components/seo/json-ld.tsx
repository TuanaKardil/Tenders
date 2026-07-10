/** Renders a schema.org JSON-LD script tag. Server component. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify output is safe; no user HTML is injected.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
