import localFont from "next/font/local";

export const roobert = localFont({
  src: [
    // The shipped Roobert VF exposes a `wght` axis of 300–900 ONLY (verified via
    // the font's fvar table). Declaring a wider 100–900 range advertises weights
    // (100–299) the file cannot render, which drops glyphs / mis-synthesizes text
    // in stricter engines. Keep the declared range equal to the shipped axis.
    { path: "../../public/fonts/roobert/RoobertUprightsVF.woff2", style: "normal", weight: "300 900" },
    { path: "../../public/fonts/roobert/RoobertItalicsVF.woff2", style: "italic", weight: "300 900" },
  ],
  variable: "--font-roobert",
  display: "swap",
  declarations: [
    { prop: "font-feature-settings", value: "'ss10' on, 'ss09' on, 'ss03' on, 'ss04' on, 'ss14' on" },
  ],
});

export const roobertMono = localFont({
  src: [
    // Roobert Mono VF also ships a 300–900 `wght` axis only — match it.
    { path: "../../public/fonts/roobert/RoobertMonoUprightsVF.woff2", style: "normal", weight: "300 900" },
    { path: "../../public/fonts/roobert/RoobertMonoItalicsVF.woff2", style: "italic", weight: "300 900" },
  ],
  variable: "--font-roobert-mono",
  display: "swap",
});
