import { Nav, Footer } from "@/components/site";

export interface LegalSection {
  heading: string;
  /** Paragraphs of body copy. Each string renders as its own <p>. */
  body: string[];
  /** Optional bullet list rendered after the body paragraphs. */
  bullets?: string[];
}

interface LegalPageProps {
  title: string;
  /** ISO calendar date the document was last updated. */
  updated: string;
  intro: string;
  sections: LegalSection[];
}

/**
 * Shared presentation for long-form legal documents (privacy, terms).
 * Keeps typography and structure consistent across legal pages so copy is the
 * only thing that changes per document.
 */
export function LegalPage({ title, updated, intro, sections }: LegalPageProps) {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-6 py-20">
        <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
          {title}
        </h1>
        <p className="mt-3 text-sm text-faint">Last updated {updated}</p>
        <p className="mt-6 text-muted">{intro}</p>

        <div className="mt-12 space-y-10">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-xl font-semibold tracking-tight">
                {section.heading}
              </h2>
              {section.body.map((paragraph, i) => (
                <p
                  key={i}
                  className="mt-3 text-sm leading-relaxed text-muted"
                >
                  {paragraph}
                </p>
              ))}
              {section.bullets && section.bullets.length > 0 && (
                <ul className="mt-4 space-y-2 text-sm text-muted">
                  {section.bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-2">
                      <span className="text-accent">·</span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
