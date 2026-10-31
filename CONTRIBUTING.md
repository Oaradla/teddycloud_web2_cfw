# Contributing

Same rules as in teddycloud_web: Conventional Commits (`feat(tonies): ...`), `npm run format`
before committing, `npm run build` and `npm test` must pass. Keep changes small enough to review
in one sitting.

## Coming from the classic UI (teddycloud_web)

The base is the same: React 19, TypeScript, Vite, react-router, the same teddyCloud API and the
same words (box, tonie, overlay, library). What differs:

| In teddycloud_web                                        | In web2                                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/pages/<area>/` and `src/components/<area>/`         | `src/features/<area>/`, page and its parts together                                              |
| `src/components/common/`, antd                           | `src/ui/kit.tsx` (`Page`, `Section`, `Row`, `Switch`, `Notice`, `Empty` ...), `src/ui/Sheet.tsx` |
| styled-components, antd theme                            | CSS classes in `src/styles.css`, colours as CSS variables (light, dark, matrix)                  |
| `new TeddyCloudApi(defaultAPIConfig()).apiGet...()`      | `tc.<call>()` in `src/api/tc.ts`, written by hand on `fetch` (`src/api/client.ts`)               |
| hooks with `useEffect` + `useState` (`src/hooks/`)       | TanStack Query: `useBoxes()`, `useTags()`, `useSetting()` ... in `src/lib/queries.ts`            |
| `useGetSettingNewBoxesAllowed()` and friends             | `useSetting("core.allowNewBox")`                                                                 |
| `addNotification(...)`                                   | `useUi().toast("ok" \| "error" \| "info", text, detail)`                                         |
| `ConfirmationModal`                                      | `await useUi().confirm({ title, text })`, `useUi().prompt(...)`                                  |
| `public/translations/<lang>.json`, `useTranslation()`    | `src/translations/<lang>.json`, `import { t } from "../../lib/i18n"`                             |
| `t("tonieboxes.title")`, `{{name}}`                      | `t("boxes.title")`, `{{name}}`; keys are checked by the compiler                                 |
| `settings.options.<id>` in the translations              | the same, under `settings.options`, `groups`, `values`                                           |
| routes `/tonieboxes`, `/tonies/library`, `/settings/...` | hash routes `#/`, `#/box/:id`, `#/tonies`, `#/library`, `#/more`, `#/system/...` (`src/App.tsx`) |
| side menu per area                                       | four tabs (boxes, tonies, library, more); everything else is reached from "more"                 |

### Texts

Every language is one JSON file, nested by area; the area is the folder in `src/features/` that
uses the text, `common` when several do, `setup` for the box setup. German and English are
complete, Spanish, French, Italian and Polish fall back to English per key. A new text goes into
all six files. `t()` only takes keys that exist in `en.json`, so a typo is a build error.

`src/translations/translations.test.ts` checks that German and English have the same keys, that
no language has keys English does not know, and that every language keeps the placeholders.

The names of the settings and the ESP32 flasher texts come from the classic UI:
`node scripts/import-settings-i18n.mjs <teddycloud_web>/public/translations/{de,es,fr,it,pl}.json`.

### Data

Lists are queries with keys from `keys` in `src/lib/queries.ts`; after a change, invalidate the
query instead of setting state. The server's live events (SSE) refresh the state of the boxes by
themselves (`useLiveEvents`). Features of the forked server (custom firmware, login, rights) are
detected at run time (`useAccess()`, `tc.cfwEnabled()`), so each page must also work without them.
