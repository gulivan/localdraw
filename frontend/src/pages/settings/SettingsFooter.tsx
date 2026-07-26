type SettingsFooterProps = {
  appVersion: string;
  buildLabel?: string;
};

export const SettingsFooter = ({
  appVersion,
  buildLabel,
}: SettingsFooterProps) => (
  <footer className="mt-10 border-t border-slate-200/80 px-1 py-5 text-sm text-slate-600 dark:border-neutral-800 dark:text-neutral-400">
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
      <span>
        Version {appVersion}
        {buildLabel && (
          <span className="ml-2 font-semibold text-slate-800 dark:text-neutral-200">
            {buildLabel}
          </span>
        )}
      </span>
      <nav aria-label="Project links">
        Based on{" "}
        <a
          href="https://github.com/ZimengXiong/ExcaliDash"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-slate-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:text-neutral-300"
        >
          ExcaliDash
        </a>{" "}
        and{" "}
        <a
          href="https://excalidraw.com"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-slate-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:text-neutral-300"
        >
          Excalidraw
        </a>
      </nav>
    </div>
  </footer>
);
