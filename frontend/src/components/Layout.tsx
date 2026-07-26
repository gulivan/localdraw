import type React from "react";
import { useNavigate } from "react-router-dom";
import { ImpersonationBanner } from "./ImpersonationBanner";
import { Logo } from "./Logo";
import { UpdateBanner } from "./UpdateBanner";
import { UploadStatus } from "./UploadStatus";
import { productName } from "../utils/productBrand";

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const navigate = useNavigate();

  return (
    <div className="workspace-shell flex h-screen min-w-0 flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      <header className="shrink-0 border-b border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center px-4 sm:px-6">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="workspace-focus flex items-center gap-2 rounded-lg"
            aria-label={`${productName} Home`}
          >
            <Logo className="h-8 w-8" />
            <span className="text-sm font-bold tracking-tight">{productName}</span>
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto min-h-full w-full max-w-[1600px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
          <UpdateBanner />
          <ImpersonationBanner />
          {children}
        </div>
      </main>

      <UploadStatus />
    </div>
  );
};
