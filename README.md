# TeddyCloud web2

A new, mobile-first web UI for [teddyCloud](https://github.com/toniebox-reverse-engineering/teddycloud),
built to feel like a native app when installed on a phone (PWA), and to look good on the desktop.
It talks to the existing teddyCloud API and is meant to replace the classic UI completely: it
uses nothing of it (no texts, files or links), so the classic UI can be dropped one day.

> [!CAUTION] This repository is not supported by Revvox, and there are no plans for long-term support!
The goal remains to support the official teddycloud_web website. 
Web2 is simply a concept of what Teddycloud could look like, with the intention of potentially incorporating parts of it.

## Focus

1. **Boxes**: state at a glance (online, battery, the tonie on the box), quick box settings,
   remote control (custom firmware).
2. **Tonies**: grid with search and filters; per tonie: listen in the browser, chapters, assign
   content from the library or a stream, figure, live / cloud / hide, custom firmware profile and
   event tags; system sounds.
3. **Library**, **upload** (audio files become one TAF, every file a chapter, encoded by the
   server from PCM the browser decodes), **custom models**.
4. **Box setup** (which box, opening it, CC3200 with patches made in the browser, CC3235, ESP32
   flashing over Web Serial), **Box Update** (custom firmware), **TeddyStudio** (labels to print).
5. Everything else: all server and box settings (searchable, all levels), users and permissions,
   certificates, box log (RTNL), content folder, plugins, community, system info.

Features of the forked server (custom firmware, web login, permissions) are detected at run time
and hidden on servers without them.

## Where it is served

teddyCloud serves its web UI from `data/www/web`. web2 goes into `data/www/web/v2/` and is opened
as

    http://<teddycloud>/web/v2/index.html

All routes are hash routes (`index.html#/tonies`), so teddyCloud's rewrite of extensionless
`/web/...` paths to the classic `index.html` never applies, and with the web login on the files
are public like the rest of `/web/` while the API still needs the session. Note that
`/web/v2/` without `index.html` opens the classic UI.

Installing as an app (service worker) needs HTTPS, e.g. through a reverse proxy; over plain
HTTP the UI works, iOS can still add it to the home screen.

A later server option could choose which UI `/` redirects to.

## Development

```sh
npm install
TEDDYCLOUD=http://teddycloud.local npm run dev   # dev server on :5173, API proxied to teddyCloud
npm run build                                  # typecheck + build into dist/
```

Stack: React 19, TypeScript, Vite, TanStack Query, lucide icons; no UI framework, the design
system lives in `src/styles.css`. Texts are German and English (`src/lib/i18n.ts`).

| Path | What |
| --- | --- |
| `src/api/` | fetch layer (`client.ts`, path prefix, reauth), endpoints (`tc.ts`), types |
| `src/lib/` | queries and live events (SSE), formatting, i18n, preferences, PCM decoding |
| `src/ui/` | kit (page, lists, switches, toasts, dialogs), bottom sheet with back-button support |
| `src/player/` | global audio player: mini player, full screen, chapters, lock screen controls |
| `src/features/` | boxes, tonies, library, upload, models, settings, more, auth |
| `public/` | manifest, service worker, icons |

## Deploying to a teddyCloud

Copy `dist/` to `<teddycloud>/data/www/web/v2/`. The release builds of teddyCloud with CFW support
ship it there already; the setting "Default web interface" makes it the start page.

## Legal

Toniebox, Tonie and tonies are trademarks of tonies GmbH (formerly Boxine
GmbH). This project is not affiliated with, endorsed or supported by tonies
GmbH; the names only say which devices the software works with.

Changing the firmware of a box, opening it or connecting to its debug port
is at your own risk: a box can become unusable, and it can affect claims
against the manufacturer. The software comes without any warranty (see the
licence).

## Licence

GPL-3.0-or-later (see `COPYING`). The CC3200 setup contains a port of
[cc3200tool](https://github.com/toniebox-reverse-engineering/cc3200tool) (GPL-2.0-or-later,
Copyright (C) 2016-2020 Allterco Robotics) and ships TI's NWP bootloader `rbtl3100s.dll` as it comes
with cc3200tool. The ESP32 flasher was taken over from teddycloud_web.

Parts taken over from other projects keep their authors' copyright:

| Part | From | Licence there |
| --- | --- | --- |
| `src/features/setup/cc3200/protocol.ts` | port of cc3200tool, Allterco Robotics | GPL-2.0-or-later |
| `src/features/setup/cc3200/rbtl3100s.dll` | Texas Instruments, the CC3200 NWP bootloader patch, as cc3200tool ships it | none stated |
| `src/features/setup/esp32/` (flasher) | teddycloud_web (toniebox-reverse-engineering), based on flasher.js by g3gg0 | no licence file |
| `src/features/setup/img/opentb-step*.webp` (opening the box) | Tobias Isakeit, iFixit guides "Toniebox Opening Procedure" and "Toniebox Teardown", converted to WebP | CC BY-NC-SA 3.0 (credited on the page) |
| `src/features/setup/img/` (the other photos of the boxes and tools) | teddycloud_web, `src/assets/boxSetup` | no licence file |

Where the source publishes no licence file, these parts are used as the
teddyCloud project uses them itself; they are not covered by the GPL of this
repository until their authors licence them.
