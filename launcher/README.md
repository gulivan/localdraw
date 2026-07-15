# localdraw

Launch the local-first [ExcaliDash](https://github.com/gulivan/localdraw) desktop app:

```sh
npx localdraw
```

The command downloads a SHA-256-verified native release on first run, installs it in your user account, and opens it. Later runs launch the installed app immediately.

Set `LOCALDRAW_VERBOSE=1` to show native installer output when troubleshooting.

The desktop application keeps its SQLite database on your computer and starts with authentication disabled. Supported targets are macOS arm64/x64, Windows x64 (including Windows on ARM through emulation), and Linux x64.
