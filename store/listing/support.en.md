# Corner Note Support

Publisher: Dowon Park  
Package: `DowonPark.CornerNote`  
Support, privacy questions, and AI-content reports: [dowonpark12318@gmail.com](mailto:dowonpark12318@gmail.com)

Corner Note is a free Windows note app. Its optional AI translation requires your own OpenAI API key and internet connection. OpenAI API usage is billed separately from a ChatGPT subscription. There is no required Corner Note account.

## Getting started

Use Windows 10 version 2004 (build 19041) or later, or Windows 11, on an x64 PC. The available build is for Windows desktop; there is no native x86, ARM64, or Xbox package in this release.

For the portable ZIP, extract **all** files to a folder and run `CornerNote.exe`. Do not move the executable away from its companion files. Before replacing an older portable build, right-click the tray icon and choose **Quit**, then extract the new ZIP to a new folder. **−** only hides a note and leaves the app running.

A file named `CornerNote-Store-x64.msix` supplied for submission is an **unsigned Partner Center submission package**. It is not a normal double-click installer. Microsoft signs the Store distribution after certification. A `Development` MSIX is a separate validation build and is not for Store submission. For an unsigned submission/development file, use the portable ZIP for ordinary execution testing; do not import an untrusted certificate merely to bypass an installation warning.

## Everyday controls

- **?** opens help and the option to replay the five-step feature tour.
- **+** makes a new blank note. Notes can overlap; the note most recently clicked or edited comes to the front.
- **−** hides only the current note. Use the tray menu to reopen it, show all notes, or create another note. The tray icon may be in Windows' hidden-icons area.
- **×** asks whether to delete the current note. **No** cancels; **Yes** deletes that note and its saved text. This is not an undo operation.
- Drag the title bar to move an unfolded note. Drag an edge to resize it.
- Drag a corner one third of the way toward the opposite corner and release to fold the note into that screen corner. Release sooner or press Escape to cancel.
- Drag the body of a folded note to move it freely. Double-click it to return to its original folded corner. Pull the diagonal grip inward, or focus it and press Enter, to unfold.

## Why does Alt+Tab not show a pinned note?

**Always on top** applies to all notes. When it is on, notes stay above normal app windows and are excluded from the taskbar. Turn it off to use the taskbar and Alt+Tab normally. The app does not guarantee visibility over Windows security/lock screens, some exclusive full-screen applications, or every other topmost window.

## Where did my notes go?

First check the tray menu: the notes may only be hidden. Quitting and reopening restores notes still in the save file. After the last note is deleted, reopening the app or using the tray can create a new blank note; deleted notes do not reappear as an undo feature.

The portable edition normally stores notes in `%APPDATA%\Corner Note\note-state.json`. Notes are readable text files, so protect your Windows account and backups. Store/MSIX data locations and removal behavior follow Windows package rules. **Do not assume existing portable notes or a remembered key automatically transfer to an MSIX installation.** Keep a backup of the original data before changing installation type, resetting an app, or removing data. Do not overwrite an unfamiliar save file while troubleshooting.

## How do I change the display language?

The app uses the preferred languages reported by Windows. Korean, English, Japanese, Simplified/Traditional Chinese, Spanish, French, German, Portuguese, and Italian are supported; other display languages fall back to English. After changing Windows language preferences, quit the app from the tray and reopen it. Your existing note text is not automatically translated. `Help/manual.html` in the portable folder provides an offline guide that follows the browser's language preferences.

## How do I use AI translation?

Write some text and select the part you want to translate. Click **Translate** to open the language menu, then **AI translation settings** to enter your own OpenAI API key and choose whether to remember it. Selecting a target while no key is connected also opens the connection settings. If you chose a target before connecting, the pending translation starts after connection. Otherwise, reopen Translate and choose a target language. The initial targets use your computer's actual language and English; **Add** lets you save more languages.

Only the selected text is included as the text to translate, up to 6,000 characters per request. Translation uses a live generative AI service, so results can be incorrect or inappropriate. Review the result before copying or applying it. **Replace selection** is a separate action; the original is not changed automatically. If you edited the note during the request, copy the result instead.

If a request fails, check the internet connection, API key permissions, API usage limit, and account balance. A ChatGPT subscription does not by itself include OpenAI API credits. **Disconnect** removes the app's current and remembered key; revoke or rotate the key separately in your OpenAI account if needed. Do not email your key to support.

## Report a problem or AI result

Email [dowonpark12318@gmail.com](mailto:dowonpark12318@gmail.com) with the app version, Windows version, display language, what you tried, and what happened. A screenshot or short redacted excerpt is optional. Do not send private notes, API keys, passwords, or payment information. For an incorrect, harmful, or inappropriate AI result, you can use the [AI report template](ai-report-template.en.md).

For privacy handling and requests about support correspondence, see the [Privacy Policy](privacy/privacy-policy.en.md). Dowon Park cannot remotely open, recover, or delete local notes. The time needed to investigate depends on the issue; this page does not promise a response deadline.
