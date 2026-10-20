# Microsoft Store MSIX build

The app remains an Electron desktop application. MSIX packages launch `app\CornerNote.exe` with application ID `App` and the `runFullTrust` capability, without requesting administrator elevation. Windows 10 version 2004 (build 19041) or later and Windows 11 x64 are supported by the package manifest.

The build needs Windows, Node.js, and the Windows 10/11 SDK's **MakeAppx** and **MakePri** tools. A Windows GitHub Actions runner supplies the SDK. To use another SDK installation, set `CORNER_NOTE_MAKEAPPX_PATH` and `CORNER_NOTE_MAKEPRI_PATH` to the tool executables.

## Development build

```powershell
npm ci
npm run setup
npm run pack:win
node scripts/package-msix.cjs --development
```

Outputs in `dist/`:

- `CornerNote-Development-x64.msix`
- `CornerNote-Development-x64.msix.sha256`
- `CornerNote-Development-x64.msix.json` — build identity, language and checksum metadata

This package uses `CornerNote.Development` and publisher `CN=CornerNoteDevelopment`. It is **unsigned**, is **not for Store submission**, and cannot be installed by double-click on a normal PC without first signing it with a trusted development certificate. CI installation tests should generate a temporary certificate and sign a separate copy; never publish a private signing key. The public download of this unsigned package is a build artifact for development, not a public Store release.

## Store submission build

Create a Microsoft Store developer account, reserve the product name, and open the app's **Product management → Product identity** page in Partner Center. Copy its exact case-sensitive values:

| Partner Center value | Build configuration key | Environment variable |
| --- | --- | --- |
| `Package/Identity/Name` | `name` | `CORNER_NOTE_STORE_IDENTITY_NAME` |
| `Package/Identity/Publisher` | `publisher` | `CORNER_NOTE_STORE_IDENTITY_PUBLISHER` |
| `Package/Properties/PublisherDisplayName` | `publisherDisplayName` | `CORNER_NOTE_STORE_PUBLISHER_DISPLAY_NAME` |

`msix/identity.json` contains the product identity provided for this app: package name `DowonPark.CornerNote`, publisher `CN=B3FCB264-7CC2-48BC-8B90-21070B7AFBD4`, and publisher display name `Dowon Park`. The Store build reads this file by default. These values are public package metadata, not a password or API key.

To build a different reserved product, use environment variables or pass `--config=...` with a JSON file based on `msix/identity.example.json`. Environment variables take precedence over the file. The Store build rejects missing values, example placeholders, and the development identity.

```powershell
npm run pack:win
node scripts/package-msix.cjs --store
```

The output is `dist/CornerNote-Store-x64.msix`, with matching `.sha256` and `.json` files. Partner Center accepts unsigned MSIX submissions and Microsoft re-signs approved packages for Store distribution; a purchased CA certificate is not required for this path. An EXE/MSI listing has different signing requirements.

## Localization and validation

The manifest and compiled `resources.pri` declare ten languages: `en-US`, `ko-KR`, `ja-JP`, `zh-Hans`, `zh-Hant`, `es`, `fr`, `de`, `pt`, and `it`. The Start menu/package display name and description select those resources through Windows; the app's menus and tutorial separately use the computer's preferred language. Other languages fall back to English until a catalog is provided. The version is the app's release version plus a Store-reserved final zero, for example `1.5.0.0`.

MakePri and MakeAppx output is retained in `dist/msix-work/<mode>/*.log`. A failed build reports the SDK's actual validation errors before pointing to the full log, so a long Electron file list cannot hide the failure cause.

Before submitting, test the actual installed MSIX: launch, multiple overlapping notes, minimize/tray, always-on-top toggle and Alt+Tab, folding/resize, deletion and confirmation, note persistence after an update, and AI settings/translation. The MSIX data path can differ from the portable version due to Windows application-data isolation; do not assume a portable user's notes or encrypted key migrate automatically. Run the Windows App Certification Kit and resolve its report before submission.

Store listing materials and review preparation also include screenshots, privacy policy, support contact, age rating, and accurate AI/API-cost disclosures. The Store identity and Microsoft certification are still required before any package can be described as released on the Store.

Official references: [package and signing requirements](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-package-requirements), [Win32 distribution options](https://learn.microsoft.com/en-us/windows/apps/distribute-through-store/how-to-distribute-your-win32-app-through-microsoft-store), [Store policies](https://learn.microsoft.com/en-us/windows/apps/publish/store-policies).
