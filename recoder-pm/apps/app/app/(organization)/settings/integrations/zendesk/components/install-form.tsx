"use client";

import { Input } from "@repo/design-system/components/precomposed/input";
import { Button } from "@repo/design-system/components/ui/button";
import { handleError } from "@repo/design-system/lib/handle-error";
import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEventHandler, useState } from "react";
import { toast } from "sonner";
import { createZendeskInstallation } from "@/actions/zendesk-installation/create";

export const ZendeskInstallationForm = () => {
  const [subdomain, setSubdomain] = useState("");
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const disabled =
    loading || !subdomain.trim() || !email.trim() || !apiToken.trim();

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();

    if (disabled) {
      return;
    }

    try {
      setLoading(true);

      const response = await createZendeskInstallation(
        subdomain,
        email,
        apiToken
      );

      if ("error" in response) {
        throw new Error(response.error);
      }

      toast.success("Zendesk integration connected");

      setTimeout(() => {
        router.refresh();
      }, 1000);
    } catch (error) {
      handleError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="grid gap-2" onSubmit={handleSubmit}>
      <Input
        onChange={({ target }) => setSubdomain(target.value)}
        placeholder="your-subdomain"
        value={subdomain}
      />
      <Input
        onChange={({ target }) => setEmail(target.value)}
        placeholder="you@company.com"
        type="email"
        value={email}
      />
      <Input
        onChange={({ target }) => setApiToken(target.value)}
        placeholder="Zendesk API token"
        type="password"
        value={apiToken}
      />
      <Button disabled={disabled} type="submit">
        {loading ? <Loader2Icon className="animate-spin" /> : "Install"}
      </Button>
    </form>
  );
};
