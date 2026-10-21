# Certification notes — Corner Note 1.6.0

Copy the sections from **Product and access** through **Capabilities** into the private **Notes for certification** field after completing the live-AI check described at the end. These notes contain no API key or other credential.

## Product and access

- Package name: `DowonPark.CornerNote`.
- Publisher: `CN=B3FCB264-7CC2-48BC-8B90-21070B7AFBD4`.
- Publisher display name: `Dowon Park`.
- Package version: `1.6.0.0`; application version: `1.6.0`.
- Device family: Windows Desktop, x64; Windows 10 build 19041 or later and Windows 11.
- The app is free. Basic note creation, editing, saving, arranging, resizing and folding require no login, API key or internet connection.
- Optional live AI translation uses the customer's own OpenAI API key and an internet connection. OpenAI API charges are separate from a ChatGPT subscription and are billed to the customer's OpenAI account. The developer does not sell API credits or process an in-app payment.
- Developer support and reports of inappropriate AI results: **dowonpark12318@gmail.com**.

## First launch and language

Launch the installed app from Start. A five-step guide appears on first launch; use **Skip** to reach the editor or complete the guide. Replay it from **? → Show the feature tour again**. The guide covers moving notes, resizing, folding/unfolding, moving folded notes and AI translation.

The app follows the Windows preferred-language list at launch. Supported display languages are Korean, English, Japanese, Simplified Chinese, Traditional Chinese, Spanish, French, German, Portuguese and Italian. Unsupported display languages fall back to English. The user's actual computer language remains available as the initial translation target. Changing the Windows preferred language requires quitting and relaunching the app. Notes are not automatically translated when the display language changes.

## Basic note checks — no credential required

1. Enter a short note, a newline and an emoji. Choose another color. Wait for **Saved automatically**.
2. Click the note title to rename it. Enter or clicking elsewhere saves, Escape cancels, and an empty title restores the localized default. Fill the note with several screens of text and scroll down; drag an empty part of the titlebar to move it without resetting the scroll position. Drag each of the four straight edges to resize; corners are folding handles. The minimum note size is 300 × 300.
3. Use **+**, between **?** and **−**, to create another blank note. Give the notes different text and colors, then overlap them. Click or edit an exposed part of a note: it moves above the other notes without rearranging their bounds.
4. New notes start with **Always on top** enabled. Turn it off for only one note: that note becomes an ordinary window accessible with the taskbar or Alt+Tab, while other notes keep their own settings. Re-enable it and confirm that only this note changes. Pinned notes stay above ordinary application windows while another app keeps keyboard focus. Secure desktops and exclusive full-screen apps are not promised to be covered.
5. Drag a corner diagonally toward the opposite corner by approximately one third of the note's diagonal and release. The note folds into the corresponding screen corner. Releasing before the threshold or pressing Escape cancels the gesture.
6. Drag the body of the folded note elsewhere. Double-click the body: it returns to its original folded corner and remains folded. Pull its small diagonal grip inward, or focus the grip and press Enter, to unfold it.
7. Click **−** to hide only that note. Use the notification-area/tray icon, including the hidden-icons area if needed, to show a note or show all notes. **Quit** in that tray menu exits the application; hiding a note does not exit it.
8. Click **×**, to the right of **−**. The **Delete this note?** dialog must preserve the note when **No** or Escape is used. **Yes** deletes only that note and its saved content. Other notes remain. If all notes are deleted, a subsequent app launch creates a fresh blank note.
9. Quit from the tray menu and relaunch. Remaining notes should retain their titles, text, colors, bounds, folded state, original folded anchors and individual always-on-top settings, including a mixture of pinned and ordinary notes. Added translation targets should remain shared. Updating an older save preserves its former shared pin setting on each existing note before allowing independent changes.

## Optional live AI translation

1. Enter a short note and select some text. Click **Translate → AI translation settings** in the language menu. Choosing a target without a connected key also opens these settings. Enter an authorized OpenAI API key privately in the password field. Session-only use is the default; remembering the key is an explicit opt-in and is available only when safe encrypted storage is available.
2. Enter `Hello, have a good day.` in a note. Drag to select part of the text. Click **Translate**, then choose a target language. The initial targets are the computer language and English, without duplicates. **Add** can search for additional languages by name or code.
3. Only the selected text is submitted for translation, with the requested target and processing instructions. The API key authenticates the HTTPS request directly to OpenAI. A request accepts up to 6,000 characters.
4. During the request the button shows **Translating…** and an animated indicator. Cancellation is available.
5. The result is a preview. **Copy** explicitly copies it; **Replace selection** explicitly changes the selected range. The original is never replaced automatically. If the note was changed during a request, replacement is disabled and the result can be copied instead.
6. Disconnect in AI settings to remove the in-memory and remembered key. Do not include a real key or unredacted personal note in a screenshot, public report or support message.

AI output is generated by a third-party model and can be incorrect or inappropriate. Users can report a problem to **dowonpark12318@gmail.com**; the listing, support page and privacy policy provide that contact and request only a minimal redacted example.

## Capabilities

`runFullTrust` is required because this is an Electron Windows desktop application with native top-level windows, tray integration, normal Alt+Tab behavior, note-window positioning/resizing, local note persistence and Windows-protected optional API-key storage. It does not request administrator elevation.

`internetClient` supports optional direct HTTPS requests to the OpenAI Responses API. Basic note features work offline. There is no developer-operated note-sync service, social-sharing service, advertising SDK or app analytics service in this build.

## Publisher-only completion before submission

- Actual Windows desktop and temporary-certificate installed-MSIX tests passed for build `d9157ab` in [Windows CI run 39389998593](https://github.com/dowonpark12318-creator/sticky-note/actions/runs/39389998593). These checks are not a Microsoft Store approval or a Windows App Certification Kit report.
- **Windows App Certification Kit has not been run.** Run it on the exact final submission build and resolve applicable findings.
- **A real OpenAI request has not been validated.** Existing automated translation checks use a mock provider. Test the live flow, errors, cancellation and billing behavior with an authorized key before claiming the feature has been live-tested.
- If certification needs a test credential, arrange a dedicated restricted/budget-limited credential through an appropriate private Partner Center review/support channel and revoke it after review. Never add it to this document, Git, the materials ZIP, public release assets or screenshots. These public notes intentionally contain no credential and do not invent one.
- Complete the actual IARC questionnaire and check all Partner Center declarations. No age rating or accessibility certification is pre-assigned by these notes.
