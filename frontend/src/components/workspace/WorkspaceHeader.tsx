import { useRef } from "react";
import {
  FilePlus2,
  LogOut,
  Moon,
  Search,
  Settings,
  Shield,
  Sun,
  Trash2,
  Upload,
  User,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { getInitialsFromName } from "../../utils/user";
import { productName } from "../../utils/productBrand";
import { Logo } from "../Logo";
import { usePlugins } from "../../plugins/PluginProvider";

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  onNewSlide: () => void;
  onImport: (files: FileList | null) => void;
};

export const WorkspaceHeader = ({
  query,
  onQueryChange,
  onNewSlide,
  onImport,
}: Props) => {
  const navigate = useNavigate();
  const { enabledEmbeddedPlugins } = usePlugins();
  const fileRef = useRef<HTMLInputElement>(null);
  const { user, authEnabled, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const appVersion = import.meta.env.VITE_APP_VERSION || "development";

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200/80 bg-white/95 dark:border-zinc-800 dark:bg-zinc-950/95">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="workspace-focus flex shrink-0 items-center gap-2.5 rounded-lg text-left"
        >
          <Logo className="h-9 w-9" />
          <span className="block text-sm font-bold tracking-tight">{productName}</span>
        </button>

        <label className="relative order-3 w-full min-w-0 flex-1 sm:order-none sm:ml-3 sm:max-w-md">
          <span className="sr-only">Search projects and canvases</span>
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
          />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search"
            className="workspace-focus h-10 w-full rounded-xl border border-zinc-200 bg-zinc-100 pl-9 pr-3 text-sm text-zinc-950 placeholder:text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-400"
          />
        </label>

        <div className="ml-auto flex items-center gap-2">
          {enabledEmbeddedPlugins.map((plugin) => plugin.HomeAction ? <plugin.HomeAction key={plugin.manifest.id} /> : null)}
          <button
            type="button"
            onClick={onNewSlide}
            className="workspace-focus inline-flex h-10 items-center gap-1.5 rounded-xl bg-violet-600 px-3 text-xs font-semibold text-white hover:bg-violet-700"
          >
            <FilePlus2 size={15} /> <span className="hidden sm:inline">New Canvas</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,.excalidraw"
            multiple
            className="hidden"
            onChange={(event) => {
              onImport(event.target.files);
              event.target.value = "";
            }}
          />
          <details className="group relative">
            <summary className="workspace-focus flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-xl border border-zinc-200 bg-white text-xs font-bold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800">
              {user ? getInitialsFromName(user.name) : <User size={17} />}
              <span className="sr-only">Open workspace menu</span>
            </summary>
            <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-[0_4px_8px_rgba(24,24,27,0.12)] dark:border-zinc-700 dark:bg-zinc-900">
              {user && (
                <div className="border-b border-zinc-100 px-2.5 py-2 dark:border-zinc-800">
                  <div className="truncate text-xs font-semibold">{user.name}</div>
                  <div className="truncate text-[11px] text-zinc-600 dark:text-zinc-400">{user.email}</div>
                </div>
              )}
              <MenuButton icon={<Upload size={15} />} label="Import canvases" onClick={() => fileRef.current?.click()} />
              <MenuButton icon={<Trash2 size={15} />} label="Trash" onClick={() => navigate("/collections?id=trash")} />
              <MenuButton icon={theme === "dark" ? <Sun size={15} /> : <Moon size={15} />} label={theme === "dark" ? "Light theme" : "Dark theme"} onClick={toggleTheme} />
              <MenuButton icon={<Settings size={15} />} label="Settings" onClick={() => navigate("/settings")} />
              {authEnabled && <MenuButton icon={<User size={15} />} label="Profile" onClick={() => navigate("/profile")} />}
              {authEnabled && user?.role === "ADMIN" && <MenuButton icon={<Shield size={15} />} label="Admin" onClick={() => navigate("/admin")} />}
              {authEnabled && <MenuButton danger icon={<LogOut size={15} />} label="Log out" onClick={logout} />}
              <div className="mt-1 space-y-1 border-t border-zinc-100 px-2.5 pt-2 text-center text-[10px] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <p>
                  based on <FooterLink href="https://excalidraw.com">Excalidraw</FooterLink>
                  {" & "}
                  <FooterLink href="https://github.com/ZimengXiong/ExcaliDash">
                    ExcaliDash
                  </FooterLink>
                </p>
                <p>{productName} v{appVersion} <span aria-hidden="true">·</span>{" "}<FooterLink href="https://github.com/gulivan/localdraw">GitHub</FooterLink></p>
              </div>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
};

const FooterLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="workspace-focus rounded-sm font-semibold text-zinc-700 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-950 dark:text-zinc-300 dark:decoration-zinc-600 dark:hover:text-white"
  >
    {children}
  </a>
);

const MenuButton = ({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`workspace-focus flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium ${
      danger
        ? "text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
        : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
    }`}
  >
    {icon} {label}
  </button>
);
