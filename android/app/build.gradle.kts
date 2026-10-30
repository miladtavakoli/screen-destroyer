plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.miladtavakoli.screendestroyer"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.miladtavakoli.screendestroyer"
        minSdk = 26
        targetSdk = 35
        versionCode = 3
        versionName = "1.1.0"
    }

    // The shared engine (../../core) is packaged as-is into the APK's assets,
    // so Android and Linux run exactly the same HTML/JS.
    sourceSets["main"].assets.srcDir("../../core")

    // Release signing key comes from the environment (GitHub Secrets in CI), never from the repo.
    //   ANDROID_KEYSTORE_FILE      path to the .jks file
    //   ANDROID_KEYSTORE_PASSWORD  keystore + key password
    //   ANDROID_KEY_ALIAS          key alias
    val keystoreFile = System.getenv("ANDROID_KEYSTORE_FILE")?.takeIf { it.isNotBlank() && file(it).exists() }
    signingConfigs {
        create("release") {
            if (keystoreFile != null) {
                storeFile = file(keystoreFile)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")?.trim()
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")?.trim()?.takeIf { it.isNotEmpty() } ?: "screendestroyer"
                keyPassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")?.trim()
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Without the release key (e.g. local builds) fall back to the debug key.
            signingConfig = if (keystoreFile != null) signingConfigs.getByName("release")
                            else signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}
