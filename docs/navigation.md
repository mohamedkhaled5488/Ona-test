# Navigation: where Back goes

The rule for the whole app. It applies to the header back arrow, the swipe gesture and Android's Back key alike. Checked by `src/navigation/__tests__/backMatrix.test.tsx` (NAV-*), `src/hooks/__tests__/useSectionStack.test.ts` (NAV-STACK-*) and the E2E flow `.maestro/06-back-navigation.yaml`.

## The rule

1. **Back returns to the screen you came from**, as you left it: the same page, its scroll position and its state.
2. **A screen opened from somewhere else** is pushed on top of where you started, so Back returns there. This covers a Recap area page or link, a folder, Discover and the tour's "Try it", Settings, and a link from one section to another.
3. **Opened straight at an item**, such as Recap opening one Quit habit or Quit opening its "Doing instead" habit, that item is the first page. Back returns to where you came from, never through a list you didn't see. The page's own "‹ list" link goes to its parent: a day, then its habit, then the list.
4. **A tab's root** (Plan, Reflect, Grow or Learn) goes to Home. **On Home**, Back shows "Press Back again to close Ona"; a second Back within 2 seconds closes it. The first-run screen does the same.
5. **Unsaved changes** ask Save / Discard / Keep editing first. **Sheets and dialogs** close first.
6. **The account choice after sign-in**: Back is "Decide later". The sheet closes, nothing is chosen, and the choice waits in Settings → Account.

Notifications open Ona at Home; no notification opens a screen of its own. There are no deep links yet. When either is added, Back from that screen goes to its logical parent and then to Home (rule 4).

## How it's built

- **`openSection(route, params)`** (`src/navigation/navigationRef.ts`) is the one way to open another screen. It always pushes; `recap` and `Main` go back to Home. Plain `navigation.navigate` could reuse a copy of the screen further back and drop the screens in between.
- **`useBackHandler`** (`src/hooks/useBackHandler.ts`) lets a screen step back through its own pages. It works through React Navigation's `beforeRemove` (the header back arrow and the swipe), and through the Android Back key while the screen is focused.
  - The Back-key path is the fix for the phone bug. `beforeRemove` never fires on Home, which is the root, so Back on a Recap area page used to close the app.
- **`useSectionStack`** (`src/hooks/useSectionStack.ts`) is a section's own page history. It's used by Quit, Habit Builder, Skills, Book and Budget.
- **The "close Ona" hint** is registered first in `RootNavigator`. Android asks the newest Back listener first, so this one is asked last, only when nothing else used the press.

## Why tests missed the phone bug

`renderScreen` renders one screen as the only route, with every other route a stub. No test pressed Android's Back key on the real navigator, and none started on Home. `renderApp` (`src/test-utils/renderApp.tsx`) now renders the real `RootNavigator` with the Back key, and the matrix covers every route and entry point.
