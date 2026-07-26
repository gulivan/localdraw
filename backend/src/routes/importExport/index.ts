import { registerExcalidashExportRoute } from "./exportRoutes";
import { RegisterImportExportDeps } from "./shared";

export const registerImportExportRoutes = (deps: RegisterImportExportDeps) => {
  registerExcalidashExportRoute(deps);
};

export type { RegisterImportExportDeps } from "./shared";
