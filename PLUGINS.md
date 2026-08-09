# LocalDraw plugins

LocalDraw has two plugin lanes:

- Bundled plugins live in this repository and may contribute native React UI plus backend capabilities. Connect AI and Image generation use this lane.
- External plugins are installed from an HTTPS manifest URL or a GitHub repository URL. They run in a Web Worker without DOM or filesystem access and can only receive/apply canvas data covered by declared permissions.

Open **Settings → Plugins** to enable bundled plugins or install an external one. A GitHub repository URL resolves to `localdraw.plugin.json` at the repository root. Tree URLs resolve the manifest relative to that directory. External plugins install disabled so their source and permissions can be reviewed first.

## Manifest

```json
{
  "manifestVersion": 1,
  "id": "acme.my-plugin",
  "name": "My plugin",
  "version": "1.0.0",
  "description": "What the plugin does.",
  "entry": "./plugin.js",
  "permissions": ["canvas:read", "canvas:write"],
  "contributes": {
    "editorActions": [
      {
        "id": "run",
        "label": "Run plugin",
        "description": "Shown in the editor toolbar.",
        "selection": "required"
      }
    ]
  }
}
```

Supported permissions are `canvas:read`, `canvas:write`, `network`, `preferences:read`, and `preferences:write`. Plugin IDs use lowercase letters, numbers, dots, dashes, and underscores.

## Entry contract

The entry is a self-contained classic JavaScript file up to 2 MiB. It calls `localdrawPlugin.register()` once:

```js
localdrawPlugin.register({
  actions: {
    run({ prompt, selectedElements, settings }) {
      return {
        message: "Done",
        elements: [{ type: "text", x: 100, y: 100, text: prompt }]
      };
    }
  }
});
```

An action receives only the data allowed by its permissions. It may return Excalidraw element skeletons and up to ten image files as data URLs. Returned canvas changes are rejected without `canvas:write`. Network APIs are disabled inside the worker unless `network` was declared.

See [`plugins/example-caption`](plugins/example-caption) for an installable example.

## Bundled plugins

Bundled manifests live under `plugins/`; their implementations are registered in `frontend/src/plugins/builtin`. Bundled plugins can contribute `HomeAction`, `EditorActions`, and `SettingsPanel` components. Server-side capabilities should be registered through the backend embedded-plugin registry rather than directly from the server entrypoint.

### Image generation

The bundled image plugin uses the OpenAI-compatible Image API:

- `/images/generations` when there is no selection.
- `/images/edits` with a rendered PNG of selected elements when there is a selection.

The provider host, API key, and model are configurable. OpenAI works out of the box with `https://api.openai.com/v1` and `gpt-image-2`. The key remains in the current browser profile and is sent only to the configured provider host.
