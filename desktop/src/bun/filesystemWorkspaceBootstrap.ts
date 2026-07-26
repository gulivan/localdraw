import {
  BOOTSTRAP_USER_ID,
  type WorkspacePrisma,
} from "./filesystemWorkspaceFormat";

export const ensureBootstrapUser = async (
  prisma: WorkspacePrisma,
): Promise<void> => {
  await prisma.user.upsert({
    where: { id: BOOTSTRAP_USER_ID },
    update: {},
    create: {
      id: BOOTSTRAP_USER_ID,
      email: "bootstrap@excalidash.local",
      passwordHash: "",
      name: "LocalDraw",
      role: "ADMIN",
      mustResetPassword: true,
      isActive: false,
    },
  });
};
