# Store submission readiness — Corner Note 1.6.0

This is a review checklist, not a Microsoft approval. Material preparation and completed validation are distinct from Partner Center declarations and final submission.

| Item | Current evidence / required action |
| --- | --- |
| Publisher and package identity | Supplied by publisher: `DowonPark.CornerNote`, `CN=B3FCB264-7CC2-48BC-8B90-21070B7AFBD4`, `Dowon Park`. |
| Price | Publisher selected **Free**. Retain the separate OpenAI API-cost disclosure. |
| Public support contact | Publisher supplied **dowonpark12318@gmail.com**. Use for support, privacy requests and inappropriate-AI-result reports. |
| Submission package | `PACKAGE-MANIFEST.json` records the exact registered-identity unsigned Store MSIX release URL, version and SHA-256 for this material build. Download that file and verify its checksum before uploading. A Development MSIX or portable ZIP is not the Store submission. |
| Existing automated checks | Publishing this material bundle requires the Windows workflow to pass UI/localization/native Windows checks, temporary-certificate Development-MSIX installation/activation, registered Store-MSIX generation, actual desktop capture and material validation. The source revision and capture evidence are recorded in `PACKAGE-MANIFEST.json` and `assets/screenshots/provenance.json`. These checks do not replace WACK or Microsoft certification. |
| Store product display name | **Select `CornerNote` exactly, without a space, in every listing language.** The publisher-provided Partner Center screenshot confirms this name in the product header. This evidence verifies the product name only, not other submission fields or Microsoft certification. |
| Listing texts | Review each of the ten locale files for meaning and market suitability. For this update, use the localized release notes; only a first Store submission leaves “What's new” blank. Keep optional search terms empty in every submitted language following the earlier policy 10.1.3 finding. |
| Screenshots and icon | Validate the generated asset manifest/provenance, all actual PNG files, Desktop dimensions ≥1366×768 and size ≤50MB, captions ≤200 characters, and 300×300 app tile icon. Do not describe a mocked result as a live AI response. |
| Public privacy/support URLs | Open each final GitHub-hosted policy/support URL while logged out. Ensure full text is available without login before entering the URL in Partner Center. |
| Generative AI | Declare **Yes**. Keep optional BYOK translation, selected-text transmission, separate billing and report email clearly disclosed. Review and respond to reports as described in the support materials. |
| Personal information | Declare access/transmission and provide the policy; a local-first design is not a basis to claim that the app never accesses personal information. |
| Actual live OpenAI test | **Not yet performed.** Use an authorized key privately to check real success, errors, cancellation and billing. Mock-provider automated tests do not establish real-provider behavior. |
| Certification access to AI | **Arrange if required for review.** Supply any dedicated, restricted test credential only through an appropriate private review channel. Never place credentials in this public bundle, Git or screenshots. |
| Windows App Certification Kit | **Not yet run.** Run on the final submission build and resolve applicable findings. |
| IARC age ratings | **Not yet generated.** Complete the actual questionnaire; do not assign an assumed 3+/PEGI/ESRB rating. Account/region-specific fields remain the publisher's responsibility. |
| Accessibility declaration | Do not claim full accessibility-guideline testing: keyboard/ARIA coverage alone is not Narrator, high-contrast, Magnifier and high-DPI end-to-end verification. |
| Other product declarations | Review actual Portal wording. Do not certify untested alternate-drive installation or automatic backup/restore. No app purchase checkout exists; external OpenAI billing is separately disclosed. |
| Store install/update and portable migration | Initial temporary-certificate install was tested. Store-served update behavior and automatic import from an existing portable profile are **not established**; do not advertise a verified automatic migration. |
| Market, legal/contact and release choices | Publisher selects countries, fulfills applicable account/market contact requirements and chooses release timing. No physical address or universal market approval is invented by these materials. |
| Final submission | **Not submitted by this work.** After review and remaining checks, use Partner Center's submission action. Only Microsoft certification can establish Store approval. |
