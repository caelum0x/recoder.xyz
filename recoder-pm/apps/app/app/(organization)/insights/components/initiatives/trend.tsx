import { authAdmin } from "@repo/backend/auth/server";
import { database } from "@/lib/database";

export const InitiativesTrend = async () => {
  const initiatives = await database.initiative.findMany({
    select: { ownerId: true },
  });

  // Determine the status with the highest count
  const statusCount: {
    ownerId: string;
    count: number;
  }[] = [];

  for (const initiative of initiatives) {
    const existingStatus = statusCount.find(
      ({ ownerId }) => ownerId === initiative.ownerId
    );

    if (existingStatus) {
      existingStatus.count += 1;
    } else {
      statusCount.push({
        ownerId: initiative.ownerId,
        count: 1,
      });
    }
  }

  const highestCountInitiative = statusCount.reduce(
    (prev, current) => (prev.count > current.count ? prev : current),
    statusCount[0]
  );

  const highestCountOwner = await authAdmin.getUserById(
    highestCountInitiative.ownerId
  );

  return (
    <p className="text-muted-foreground text-sm">
      Most of your initiatives are owned by{" "}
      {highestCountOwner?.user_metadata.first_name}.
    </p>
  );
};
