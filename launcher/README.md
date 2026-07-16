# localdraw

Launch the local-first [ExcaliDash](https://github.com/gulivan/localdraw) desktop app:

```sh
npx localdraw
```

The command downloads a SHA-256-verified native release on first run, installs it in your user account, and opens it. Later runs launch the installed app immediately.

For the smoothest canvas performance on high-refresh-rate displays, run the
local app in your default browser instead of the embedded webview:

```sh
npx localdraw --browser
```

Browser mode prints and opens `http://127.0.0.1:32144`. Run
`npx localdraw --help` to see all launcher options without installing or
starting the app.

Set `LOCALDRAW_VERBOSE=1` to show native installer output when troubleshooting.

The desktop application keeps its SQLite database on your computer and starts with authentication disabled. Supported targets are macOS arm64/x64, Windows x64 (including Windows on ARM through emulation), and Linux x64.

To keep the native download compact, CJK Xiaolai font subsets are downloaded
only when a drawing needs them. Downloads are version-pinned, checksum-verified,
and cached locally; offline use falls back to an installed system font.
