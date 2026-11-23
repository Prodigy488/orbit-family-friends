# Orbit Family & Friends

Private peer-to-peer circles and chat (no server). Web app in `src/`, iOS shell (Capacitor) in `ios/`.

## Build the iPhone app without a Mac
1. Open the **Actions** tab, choose **Build iOS app**, click **Run workflow**.
2. When it finishes, download the **Orbit-unsigned-ipa** artifact and unzip it to get `Orbit-unsigned.ipa`.
3. On Windows, install **Sideloadly** (or AltStore), plug in your iPhone, drag the IPA in and sign in with your Apple ID. With a free Apple ID the app lasts 7 days; a paid developer account lasts a year.
4. On the iPhone: Settings > General > VPN & Device Management > trust your Apple ID, then open Orbit.

For TestFlight/App Store later, sign the build with your Apple Developer account.
