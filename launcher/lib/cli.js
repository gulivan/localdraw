export const LOCALDRAW_URL = "http://127.0.0.1:32144";

export const parseCliArgs = (args) => ({
  browser: args.includes("--browser"),
  help: args.includes("--help") || args.includes("-h"),
  version: args.includes("--version") || args.includes("-v"),
});

export const formatHelp = () => `Usage: localdraw [options]

Launch the local-first LocalDraw desktop app.

Options:
  --browser      Open LocalDraw in your default browser
  -h, --help     Show this help
  -v, --version  Show the launcher version

Browser address: ${LOCALDRAW_URL}`;
