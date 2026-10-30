plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.miladtavakoli.screendestroyer"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.miladtavakoli.screendestroyer"
        minSdk = 26          // TYPE_APPLICATION_OVERLAY
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    // The shared engine (../../core) is packaged as-is into the APK's assets,
    // so Android and Linux run exactly the same HTML/JS.
    sourceSets["main"].assets.srcDir("../../core")

    buildTypes {
        release {
            isMinifyEnabled = false
            // Signed with the debug key so the CI-built release APK installs directly.
            // Replace with your own keystore before publishing anywhere.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}
