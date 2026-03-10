'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const PYTHON_SNIPPET = `import hmac
import hashlib

def verify_webhook(payload: str, signature: str, secret: str, timestamp: str) -> bool:
    """Verify a Recoder webhook signature.

    Args:
        payload: The raw request body as a string.
        signature: The X-Recoder-Signature header value (without 'sha256=' prefix).
        secret: Your webhook signing secret.
        timestamp: The X-Recoder-Timestamp header value.

    Returns:
        True if the signature is valid.
    """
    # Strip 'sha256=' prefix if present
    if signature.startswith("sha256="):
        signature = signature[7:]

    # Reconstruct the signed content
    signed_content = f"{timestamp}.{payload}"

    # Compute expected signature
    expected = hmac.new(
        secret.encode("utf-8"),
        signed_content.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    # Constant-time comparison
    return hmac.compare_digest(expected, signature)`;

const TYPESCRIPT_SNIPPET = `import { createHmac, timingSafeEqual } from 'crypto';

function verifyWebhook(
  payload: string,
  signature: string,
  secret: string,
  timestamp: string,
): boolean {
  // Strip 'sha256=' prefix if present
  const sig = signature.startsWith('sha256=')
    ? signature.slice(7)
    : signature;

  // Reconstruct the signed content
  const signedContent = \`\${timestamp}.\${payload}\`;

  // Compute expected signature
  const expected = createHmac('sha256', secret)
    .update(signedContent)
    .digest('hex');

  // Constant-time comparison
  return timingSafeEqual(
    Buffer.from(expected, 'utf-8'),
    Buffer.from(sig, 'utf-8'),
  );
}`;

function CodeBlock({
  code,
  language,
}: {
  code: string;
  language: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="relative rounded-lg border border-border bg-muted/30 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/50">
        <span className="text-xs font-mono text-muted-foreground uppercase">
          {language}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={handleCopy}
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-500" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </Button>
      </div>
      <pre className="p-3 overflow-x-auto text-xs font-mono text-foreground/90 leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function WebhookVerificationGuide() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors rounded-xl"
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}
        <ShieldCheck className="h-4 w-4 text-primary flex-shrink-0" />
        <span className="text-sm font-medium text-foreground">
          Signature Verification Guide
        </span>
        <span className="text-xs text-muted-foreground ml-auto">
          Python & TypeScript
        </span>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-foreground">
              How Webhook Signatures Work
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Every webhook request includes two headers for verification:
            </p>
            <ul className="text-xs text-muted-foreground space-y-1 pl-4">
              <li>
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">
                  X-Recoder-Signature
                </code>{' '}
                -- HMAC-SHA256 signature (prefixed with{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">sha256=</code>)
              </li>
              <li>
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">
                  X-Recoder-Timestamp
                </code>{' '}
                -- Unix timestamp when the webhook was sent
              </li>
            </ul>
            <p className="text-xs text-muted-foreground leading-relaxed">
              The signed payload is constructed as:{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">
                {'{timestamp}.{request_body}'}
              </code>
            </p>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground">
              Python Example
            </h4>
            <CodeBlock code={PYTHON_SNIPPET} language="python" />
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground">
              TypeScript / Node.js Example
            </h4>
            <CodeBlock code={TYPESCRIPT_SNIPPET} language="typescript" />
          </div>

          <div className="rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            <strong>Security tip:</strong> Always use constant-time comparison
            (like <code className="font-mono">hmac.compare_digest</code> or{' '}
            <code className="font-mono">timingSafeEqual</code>) to prevent
            timing attacks. Also verify the timestamp is recent (within 5
            minutes) to prevent replay attacks.
          </div>
        </div>
      )}
    </div>
  );
}
