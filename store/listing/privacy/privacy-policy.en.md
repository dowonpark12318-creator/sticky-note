# Corner Note Privacy Policy

Effective date: October 20, 2026  
Publisher: Dowon Park  
App/package: Corner Note — `DowonPark.CornerNote`  
Privacy and support contact: [dowonpark12318@gmail.com](mailto:dowonpark12318@gmail.com)

This policy describes the Windows desktop app's handling of information. Corner Note is free. Writing and saving notes does not require an app account, internet access, or an OpenAI API key. Optional AI translation uses your own OpenAI API account and may incur charges from OpenAI separately from a ChatGPT subscription.

## Notes and settings on your computer

The app stores note titles, note text and local note identifiers, colors, last-save times, window sizes and positions, folding state, display-placement information, and each note’s always-on-top setting in its user-data directory. Shared preferences include additional translation languages and tutorial completion. The app reads your Windows preferred languages and screen layout to display its interface and place note windows. These operations take place on your computer; the app does not request your geographic location.

Notes and preferences are saved in `note-state.json`. **Note text is stored as ordinary readable text, not encrypted by the app.** Anyone with access to the relevant Windows account, files, or backups may be able to read it. The portable edition normally uses `%APPDATA%\Corner Note`; Windows package data rules may change the effective location for an MSIX installation.

Corner Note does not automatically upload or synchronize your notes to a developer-operated server. Dowon Park does not receive or have remote access to your local notes through the app. The app does not include advertising, developer-operated usage analytics, or an automatic developer crash-reporting service. Windows, Microsoft Store, your backup software, and other platform services may independently process information under their own settings and policies.

## Optional AI translation

AI translation runs only when you choose text and request a translation. The app sends the selected text directly from your computer to OpenAI's HTTPS Responses API at `api.openai.com`. It also sends the target language, translation instructions, the selected model identifier (currently `gpt-4.1-mini`), and request settings. Your OpenAI API key is sent to OpenAI as an authentication credential. Network connections also expose information such as your IP address and technical request metadata to the service provider.

The app does not automatically send the rest of the note or other notes with that request. It does not route translation through a server operated by Dowon Park. You decide which text to send; avoid selecting information you are not permitted to share, including another person's private information.

Requests set the API option `store: false` to disable OpenAI response-state storage for that request. **This does not guarantee zero retention, absence of abuse-monitoring logs, or deletion of all provider records.** OpenAI's processing, retention, account controls, and applicable terms govern information received by OpenAI. Review [OpenAI's API data controls](https://platform.openai.com/docs/guides/your-data) and [OpenAI's Privacy Policy](https://openai.com/policies/privacy-policy/) before using translation. The provider may process information in countries other than your own.

You can use all basic note features without translation. Stop making translation requests or use **AI translation settings → Disconnect** to stop future authenticated requests through that connection. Cancelling a request attempts to stop the ongoing operation; it cannot retract information already sent to OpenAI. Disconnecting or deleting a local note does not delete records held by OpenAI. Manage those records and your API account through OpenAI's available controls.

A translation result is held in app memory for preview. The app keeps no separate on-disk translation history. Choosing **Replace selection** saves the result as part of your note; choosing **Copy** places it on the Windows clipboard. The app does not replace your original text automatically. You can also use ordinary Windows copy/paste actions. Clipboard history, synchronization, and access by other software follow Windows and other software's settings.

## Your API key

By default, a key is held in app memory for the current app session. It is not written to the note file. If you explicitly choose **Remember key on this computer**, the app uses Electron `safeStorage` encryption on Windows and saves the encrypted key separately in `translation-key.json`. If secure storage is unavailable, the app does not offer persistent key storage.

**Disconnect** clears the key held by the app and removes its saved key file. Choosing session-only use also removes a previously remembered key. These controls do not revoke the key at OpenAI. Use OpenAI's API account controls to revoke or rotate it. Encryption does not protect against every form of access to a compromised or unlocked Windows account.

## Retention and deletion of local data

Local notes and settings remain until you change or delete them, remove the relevant app data, or a Windows operation affects that data. Use a note's **× → Yes** confirmation to delete that note from the active save. Hiding a note with **−** or closing the portable program folder does not delete its saved text.

Deletion is not a secure-erasure operation. App-created backups of damaged save files, Windows or user backups, and other copies may retain earlier information. Removing the portable program folder does not by itself remove its user-data folder. MSIX uninstallation, reset, and backup behavior depend on Windows and the installed edition; do not assume that uninstalling erases every copy or transfers data between portable and Store editions.

To remove all local copies under your control, quit the app and use the appropriate Windows/app-data and backup controls for your installation. Keep a backup first if you want to preserve any notes. The developer cannot remotely access, recover, or erase this local data for you.

## Email support, privacy requests, and AI-content reports

If you email `dowonpark12318@gmail.com`, Dowon Park receives the address and name your email service supplies, your message, and any attachments you choose to send. This information is used to answer your question, investigate a reported problem, handle a privacy request, or address an AI-content report. Support email is handled through Gmail/Google under [Google's Privacy Policy](https://policies.google.com/privacy).

Send only information needed to explain the issue. Do not send an API key, passwords, payment details, or unredacted private notes. You may report an incorrect, harmful, or inappropriate AI result by email; a short, redacted excerpt is optional. The app version, Windows version, interface language, and a description of the problem are usually sufficient to begin investigating.

Correspondence is retained as needed to handle the matter, maintain relevant support records, and meet applicable obligations. You may request access, correction, or deletion of support correspondence using the contact above. Applicable privacy rights may vary by location, and a request may require verification sufficient to identify the correspondence. Email providers, backups, and legally required records may retain information under their own rules. Requests to the developer cannot erase local notes or records held separately by OpenAI, Microsoft, or another provider.

## Children and other services

The app is intended as a general-purpose note utility and is not directed specifically at children. It does not ask users to submit their age or create an app account. Guardians should consider the terms and privacy requirements of any external AI service before enabling it for a child. A Microsoft Store/IARC content rating is separate from this privacy statement.

Microsoft Store distribution and Windows services are governed by [Microsoft's Privacy Statement](https://privacy.microsoft.com/privacystatement). If you read these documents or use the project's public website/repository on GitHub, GitHub processes website information under the [GitHub General Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement). Website hosting does not add a developer-operated tracking feature to the desktop app.

## Policy changes

Updates to information handling will be reflected in this policy with an updated effective date. For questions about the policy or your information, contact [dowonpark12318@gmail.com](mailto:dowonpark12318@gmail.com).
