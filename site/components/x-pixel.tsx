import Script from "next/script";

/**
 * X (Twitter) conversion tracking base code.
 *
 * Loaded once from the root layout so it is present on every page. Uses
 * next/script with strategy="afterInteractive" so it does not block the
 * initial render; Next.js injects/executes it after the page becomes
 * interactive, same lifecycle X's own docs expect for the base snippet.
 *
 * Snippet is the exact base code from the X Ads conversion tracking setup
 * for pixel id "rhhqi" — do not alter beyond what's needed to render it.
 */
export function XPixel() {
  return (
    <Script id="x-pixel-base" strategy="afterInteractive">
      {`!function(e,t,n,s,u,a){e.twq||(s=e.twq=function(){s.exe?s.exe.apply(s,arguments):s.queue.push(arguments);
},s.version='1.1',s.queue=[],u=t.createElement(n),u.async=!0,u.src='https://static.ads-twitter.com/uwt.js',
a=t.getElementsByTagName(n)[0],a.parentNode.insertBefore(u,a))}(window,document,'script');
twq('config','rhhqi');`}
    </Script>
  );
}
