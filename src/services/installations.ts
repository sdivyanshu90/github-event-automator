import { and, eq, notInArray } from "drizzle-orm";
import { database } from "@/db";
import { githubInstallations, repositories } from "@/db/schema";
import { AuthorizationError, ValidationError } from "@/lib/errors";
import { GitHubClient } from "@/services/github/client";

export async function synchronizeInstallation(userId: string, installationId: string, userToken: string, client = new GitHubClient()) {
  if (!/^\d+$/.test(installationId)) throw new ValidationError("Invalid GitHub installation ID");
  await client.verifyUserInstallation(userToken, installationId);
  const details = await client.installationDetails(installationId);
  const db = database();

  return db.transaction(async (transaction) => {
    const [existing] = await transaction
      .select({ userId: githubInstallations.userId })
      .from(githubInstallations)
      .where(eq(githubInstallations.installationId, installationId))
      .limit(1);
    if (existing && existing.userId !== userId) throw new AuthorizationError("This GitHub installation is already connected to another account");

    const [installation] = await transaction
      .insert(githubInstallations)
      .values({
        installationId,
        userId,
        accountLogin: details.accountLogin,
        accountType: details.accountType,
        active: true,
      })
      .onConflictDoUpdate({
        target: githubInstallations.installationId,
        set: {
          accountLogin: details.accountLogin,
          accountType: details.accountType,
          active: true,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!installation) throw new Error("Installation upsert returned no row");

    for (const repository of details.repositories) {
      await transaction
        .insert(repositories)
        .values({ ...repository, userId, installationId: installation.id, active: true })
        .onConflictDoUpdate({
          target: repositories.githubId,
          set: {
            owner: repository.owner,
            name: repository.name,
            fullName: repository.fullName,
            installationId: installation.id,
            active: true,
            updatedAt: new Date(),
          },
        });
    }

    const activeIds = details.repositories.map((repository) => repository.githubId);
    if (activeIds.length > 0) {
      await transaction
        .update(repositories)
        .set({ active: false, updatedAt: new Date() })
        .where(and(eq(repositories.installationId, installation.id), notInArray(repositories.githubId, activeIds)));
    } else {
      await transaction.update(repositories).set({ active: false, updatedAt: new Date() }).where(eq(repositories.installationId, installation.id));
    }

    return { installation, repositoryCount: details.repositories.length };
  });
}
