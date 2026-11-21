# ProBet Tips for Android

This lightweight Android app opens the production ProBet Tips website in a secure Android WebView. It uses the same live account, community, tips, wallet, and payment services as the website, so an internet connection is required.

- APK download: `https://probet-tips.vercel.app/downloads/probet-tips.apk`
- The app clears its web cache and loads the live site each time it starts. Website deployments therefore appear in the installed app without replacing the APK.
- Changes to the Android wrapper itself (for example its icon or native behavior) still require a newly built APK.

## Build

With JDK 17 and Android SDK platform 35/build-tools 35.0.0 installed, run from this directory:

```sh
./gradlew assembleDebug
```

Install `app/build/outputs/apk/debug/app-debug.apk` on an Android device. The debug APK is signed for direct testing; it is not a Play Store release build.

- Application ID: `com.goalline.probettips`
- Android minimum: Android 6.0 (API 23)
- Website: `https://probet-tips.vercel.app/`

External payment and support links open in the device browser. The app only permits HTTPS navigation within the ProBet Tips site.
