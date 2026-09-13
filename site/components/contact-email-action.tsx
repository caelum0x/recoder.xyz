"use client";

type ContactEmailActionProps = {
  label?: string;
  subject?: string;
};

export function ContactEmailAction({
  label = "Email the Recoder team",
  subject,
}: ContactEmailActionProps) {
  function openEmailClient() {
    // Build the address only after a deliberate click. This keeps Cloudflare's
    // email-obfuscation feature from rewriting server-rendered markup into the
    // crawlable /cdn-cgi/l/email-protection pseudo-link reported by OpenSEO.
    const address = ["founders", "recoder.xyz"].join("@");
    const query = subject ? `?subject=${encodeURIComponent(subject)}` : "";
    window.location.assign(`mailto:${address}${query}`);
  }

  return (
    <button
      type="button"
      onClick={openEmailClient}
      className="inline-flex rounded-md bg-fg px-4 py-2.5 text-sm font-medium text-bg transition-opacity hover:opacity-85"
    >
      {label}
    </button>
  );
}
