import type { Thing, WithContext } from "schema-dts";

type JsonLdProps = {
  code: WithContext<Thing>;
};

export const JsonLd = ({ code }: JsonLdProps) => (
  <script
    // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD requires raw script content.
    dangerouslySetInnerHTML={{ __html: JSON.stringify(code) }}
    type="application/ld+json"
  />
);

// biome-ignore lint/performance/noBarrelFile: Re-export schema-dts types for convenience.
export * from "schema-dts";
