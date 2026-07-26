# Design System

## Direction

ExcaliDash uses a calm personal-workspace register inspired by the supplied Foldraw prototype. The signature is a continuity trail: recent thumbnail, project color and name, slide position, and truthful save destination follow the user from Home into the editor shell. The embedded Excalidraw surface keeps its own styling.

## Theme

- Light: neutral zinc canvas, white elevated surfaces, graphite text, violet interaction color.
- Dark: zinc-black canvas, slightly lighter zinc surfaces, softened borders, desaturated semantic colors.
- Color strategy: restrained. Violet is reserved for primary actions, focus, and selection. Project colors identify projects but never carry meaning alone.
- Depth: quiet borders and surface shifts. Short shadows are reserved for floating menus and lifted preview cards.

## Color Tokens

- Canvas: `zinc-50` / dark `zinc-950`
- Surface: `white` / dark `zinc-900`
- Inset control: `zinc-100` / dark `zinc-800`
- Ink: `zinc-950` / dark `zinc-50`
- Secondary text: `zinc-600` / dark `zinc-300`
- Metadata: `zinc-500` / dark `zinc-400`
- Border: `zinc-200` / dark `zinc-800`
- Accent: `violet-600`; hover `violet-700`; focus ring `violet-400`
- Success: `emerald-600`; warning: `amber-600`; destructive: `red-600`
- Project palette: violet, indigo, sky, emerald, amber, rose at accessible mid-tone values.

## Typography

Use bundled DM Sans for workspace navigation, headings, labels, and body copy, with system sans fallbacks. Use a fixed product scale from 11px metadata through 24px page titles. Keep labels at 500-600 weight and headings at 650-700. Do not apply workspace typography overrides inside `.excalidraw`.

## Layout

- Base spacing unit: 4px.
- Home content max-width: 1152px with a compact sticky header.
- Editor project rail: 256px desktop, collapsible; modal drawer below 768px.
- Corners: 8px controls, 12px cards and menus, 16px major preview containers.
- Motion: 150-200ms ease-out for state changes; no page-load choreography; honor reduced motion.

## Core Components

- Workspace header: brand and persistence context, global search, creation actions, utility menu.
- Continue rail: horizontally scrollable recent slide previews with project context.
- Project cover: one dominant drawing preview, project color, slide count, recent activity, and compact slide list.
- Ordered slide card: numbered preview with title, time, project context, and accessible move menu.
- Editor project rail: lazy project tree, active slide, add controls, drag targets, storage status.
- Status language: `Saved on this device` for LocalDraw and `Saved to ExcaliDash` for hosted mode, with saving and failure variants.
- Desktop storage settings: show the resolved drawing-folder path with native Choose, Open, and Rescan actions; explain that `.excalidraw` files are portable and `.localdraw` contains ordering/version metadata.

## Responsive and States

Every interactive component includes default, hover, active, focus-visible, disabled, loading, and error behavior. Home moves from three project columns to one; the Continue rail remains horizontally scrollable. Editor navigation becomes an overlay drawer without resizing Excalidraw on phones. Loading uses skeleton structures, while empty states teach the next action.
