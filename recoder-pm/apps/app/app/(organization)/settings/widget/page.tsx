import { currentOrganizationId, currentUser } from "@repo/backend/auth/utils";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/env";
import { database } from "@/lib/database";
import { WidgetForm } from "./components/form";
import { WidgetPreview } from "./components/preview";

export const metadata: Metadata = createMetadata({
  title: "Widget",
  description: "Create a widget for websites and apps.",
});

export const dynamic = "force-dynamic";
const Widget = async () => {
  const [user, organizationId] = await Promise.all([
    currentUser(),
    currentOrganizationId(),
  ]);

  if (!(user && organizationId)) {
    notFound();
  }

  let [widget, portals] = await Promise.all([
    database.widget.findFirst({
      include: {
        items: true,
        organization: {
          select: {
            polarSubscriptionId: true,
            slug: true,
          },
        },
      },
    }),
    database.portal.count(),
  ]);

  if (!widget) {
    widget = await database.widget.create({
      data: {
        organizationId,
        creatorId: user.id,
      },
      include: {
        items: true,
        organization: {
          select: {
            polarSubscriptionId: true,
            slug: true,
          },
        },
      },
    });
  }

  return (
    <div className="grid grid-cols-2 items-start divide-x">
      <WidgetForm
        data={widget}
        hasPortal={portals > 0}
        isSubscribed={Boolean(widget.organization.polarSubscriptionId)}
        slug={widget.organization.slug}
        widgetUrl={env.RECODER_PM_API_URL}
      />
      <div className="sticky top-0 flex h-screen items-center justify-center bg-backdrop/50">
        <WidgetPreview data={widget} />
      </div>
    </div>
  );
};

export default Widget;
