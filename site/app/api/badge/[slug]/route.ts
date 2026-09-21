import { COMPARISONS, comparison } from "../../../compare/comparisons";

// Serves an SVG "Compared on Recoder" badge for a /compare/[slug] page. Other
// blogs and READMEs can embed <img src="…/api/badge/<slug>.svg"> wrapped in a
// link back to the comparison — a factual, link-earning widget. The badge only
// ever states the two tool names it compares, which are verifiable facts.
//
// No user input is trusted: the slug must match a known comparison, otherwise
// we 404. The response is a static, cacheable SVG.

export const runtime = "nodejs";
export const dynamic = "force-static";

// Pre-render one badge per known comparison at build time (SSG).
export function generateStaticParams() {
  return COMPARISONS.flatMap((c) => [{ slug: c.slug }, { slug: `${c.slug}.svg` }]);
}

// Brand palette, kept in sync with app/globals.css.
const BG = "#08080a";
const FG = "#ededf0";
const ACCENT = "#6e8bff";
const BORDER = "#2a2a30";

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// Escape the five XML predefined entities so a tool name can never break the
// SVG or inject markup.
function xml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Rough advance width for 11px system font. Good enough to size a badge; we pad
// generously so text never clips.
function textWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    if (ch === " ") w += 3.2;
    else if (/[iIlj.,:'|]/.test(ch)) w += 3.2;
    else if (/[mwMW]/.test(ch)) w += 9;
    else if (/[A-Z]/.test(ch)) w += 7.2;
    else w += 6.1;
  }
  return Math.ceil(w);
}

function renderBadge(leftText: string, rightText: string): string {
  const h = 22;
  const padX = 8;
  const leftW = textWidth(leftText) + padX * 2;
  const rightW = textWidth(rightText) + padX * 2;
  const w = leftW + rightW;
  const leftMid = leftW / 2;
  const rightMid = leftW + rightW / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${xml(leftText)}: ${xml(rightText)}">
  <title>${xml(leftText)}: ${xml(rightText)}</title>
  <rect width="${w}" height="${h}" rx="4" fill="${BG}"/>
  <rect x="${leftW}" width="${rightW}" height="${h}" fill="${BG}"/>
  <rect x="${leftW}" y="0.5" width="${rightW - 0.5}" height="${h - 1}" rx="4" fill="none" stroke="${BORDER}"/>
  <rect width="${w}" height="${h}" rx="4" fill="none" stroke="${BORDER}"/>
  <g font-family="${FONT}" font-size="11">
    <text x="${leftMid}" y="15" fill="${FG}" text-anchor="middle" font-weight="600">${xml(leftText)}</text>
    <text x="${rightMid}" y="15" fill="${ACCENT}" text-anchor="middle">${xml(rightText)}</text>
  </g>
</svg>`;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug: raw } = await params;
  const slug = raw.replace(/\.svg$/, "");
  const c = comparison(slug);
  if (!c) {
    return new Response("Not found", { status: 404 });
  }

  const svg = renderBadge("Recoder", `${c.a.name} vs ${c.b.name}`);

  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400, immutable",
    },
  });
}
