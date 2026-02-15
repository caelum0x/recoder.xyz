import { RecoderPmRole } from "@repo/backend/auth";
import { getUserName } from "@repo/backend/auth/format";
import { currentMembers, currentUser } from "@repo/backend/auth/utils";
import type { Changelog } from "@repo/backend/prisma/client";
import { Badge } from "@repo/design-system/components/ui/badge";
import { formatDate } from "@repo/lib/format";
import { notFound } from "next/navigation";
import { AvatarTooltip } from "@/components/avatar-tooltip";
import {
  Item as SettingsBarItem,
  Root as SettingsBarRoot,
} from "@/components/settings-bar";
import { database } from "@/lib/database";
import { staticify } from "@/lib/staticify";
import { ChangelogContributorsPicker } from "./changelog-contributors-picker";
import { ChangelogDatePicker } from "./changelog-date-picker";
import { ChangelogSettingsDropdown } from "./changelog-settings-dropdown";
import { ChangelogSlugInput } from "./changelog-slug-input";
import { ChangelogStatusPicker } from "./changelog-status-picker";
import { ChangelogTagsPicker } from "./changelog-tags-picker";

type ChangelogSidebarProperties = {
  readonly changelogId: Changelog["id"];
};

export const ChangelogSidebar = async ({
  changelogId,
}: ChangelogSidebarProperties) => {
  const [user, changelog, members, changelogTags] = await Promise.all([
    currentUser(),
    database.changelog.findUnique({
      where: { id: changelogId },
      select: {
        id: true,
        createdAt: true,
        publishAt: true,
        slug: true,
        contributors: {
          select: { userId: true },
        },
        status: true,
        tags: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
    currentMembers(),
    database.changelogTag.findMany(),
  ]);

  if (!(user && changelog)) {
    notFound();
  }

  return (
    <SettingsBarRoot>
      {user.user_metadata.organization_role !== RecoderPmRole.Member && (
        <ChangelogSettingsDropdown changelogId={changelogId} />
      )}

      <SettingsBarItem title="Created">
        <p className="text-sm">{formatDate(changelog.createdAt)}</p>
      </SettingsBarItem>

      <SettingsBarItem title="Publish Date">
        <ChangelogDatePicker
          changelogId={changelog.id}
          defaultPublishAt={changelog.publishAt}
          disabled={
            user.user_metadata.organization_role === RecoderPmRole.Member
          }
        />
      </SettingsBarItem>

      <SettingsBarItem
        action={
          user.user_metadata.organization_role !== RecoderPmRole.Member && (
            <ChangelogContributorsPicker
              changelogId={changelog.id}
              defaultContributors={changelog.contributors.map(
                ({ userId }) => userId
              )}
              users={staticify(members)}
            />
          )
        }
        title="Contributors"
      >
        <div className="flex flex-wrap items-center gap-1">
          {changelog.contributors.map((contributor) => {
            const member = members.find((m) => m.id === contributor.userId);

            if (!member) {
              return null;
            }

            return (
              <AvatarTooltip
                fallback={getUserName(member).slice(0, 2)}
                key={contributor.userId}
                src={member.user_metadata?.image_url}
                subtitle={member.email ?? ""}
                title={getUserName(member)}
              />
            );
          })}
        </div>
      </SettingsBarItem>

      <SettingsBarItem title="Status">
        <ChangelogStatusPicker
          changelogId={changelog.id}
          defaultValue={changelog.status}
          disabled={
            user.user_metadata.organization_role === RecoderPmRole.Member
          }
        />
      </SettingsBarItem>

      <SettingsBarItem title="Slug">
        <ChangelogSlugInput
          changelogId={changelog.id}
          defaultValue={changelog.slug}
          disabled={
            user.user_metadata.organization_role === RecoderPmRole.Member
          }
        />
      </SettingsBarItem>

      <SettingsBarItem
        action={
          user.user_metadata.organization_role !== RecoderPmRole.Member && (
            <ChangelogTagsPicker
              changelogId={changelog.id}
              defaultTags={changelog.tags.map(({ id }) => id)}
              storedTags={changelogTags}
            />
          )
        }
        title="Tags"
      >
        <div className="flex flex-wrap items-center gap-1">
          {changelog.tags.map((tag) => (
            <Badge key={tag.id} variant="outline">
              {tag.name}
            </Badge>
          ))}
        </div>
      </SettingsBarItem>
    </SettingsBarRoot>
  );
};
