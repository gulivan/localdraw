# localdraw

Launch the local-first [LocalDraw](https://github.com/gulivan/localdraw) desktop app:

```sh
npx localdraw
```

The command downloads a SHA-256-verified native release on first run, caches it
in your user account, and opens it. Later runs launch the cached app immediately.
On Windows, the download is the same single-file portable executable published
on the GitHub release.

For the smoothest canvas performance on high-refresh-rate displays, run the
local app in your default browser instead of the embedded webview:

```sh
npx localdraw --browser
```

Browser mode prints and opens `http://127.0.0.1:32144`. Run
`npx localdraw --help` to see all launcher options without installing or
starting the app.

If another LocalDraw build is already using port `32144`, the launcher verifies
its identity, asks it to shut down cleanly, and then starts the requested
release. It never kills an unrelated process that happens to use the port.

Set `LOCALDRAW_VERBOSE=1` to show native installer output when troubleshooting.

The same CLI can inspect a running LocalDraw MCP endpoint without
launching the desktop app:

```sh
LOCALDRAW_MCP_TOKEN=exd_... npx localdraw -- list-tools
LOCALDRAW_MCP_TOKEN=exd_... npx localdraw -- call list_projects
```

Set `LOCALDRAW_MCP_URL` when connecting to a non-default MCP endpoint.

The desktop application stores ordinary `.excalidraw` files in your LocalDraw
workspace and starts with authentication disabled. Supported targets are macOS
arm64/x64, Windows x64 (including Windows on ARM through emulation), and Linux
x64.

To keep the native download compact, CJK Xiaolai font subsets are downloaded
only when a drawing needs them. Downloads are version-pinned, checksum-verified,
and cached locally; offline use falls back to an installed system font.
