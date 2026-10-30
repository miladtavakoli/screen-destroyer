package com.miladtavakoli.screendestroyer

import android.app.Activity
import android.app.StatusBarManager
import android.content.ComponentName
import android.content.Intent
import android.graphics.drawable.Icon
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.webkit.WebView
import android.widget.Toast

/**
 * Translucent full-screen activity running the shared engine.
 * Opened from the launcher it sits over the home screen; opened from the
 * Quick Settings tile it sits over whatever app the user was in.
 */
class MainActivity : Activity() {

    companion object {
        const val EXTRA_FROM_TILE = "from_tile"
        private const val PREFS = "prefs"
        private const val KEY_TILE_ASKED = "tile_asked"
    }

    private var web: WebView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN or WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val w = DestroyerWeb.create(this) { close() }
        web = w
        setContentView(w)

        if (!intent.getBooleanExtra(EXTRA_FROM_TILE, false)) offerTileOnce()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        // reopened (e.g. from the tile over a different app): start with a clean screen
        web?.evaluateJavascript("window.Destroyer && Destroyer.clear()", null)
    }

    /** First launch from the icon: offer to add the Quick Settings tile. */
    private fun offerTileOnce() {
        val prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
        if (prefs.getBoolean(KEY_TILE_ASKED, false)) return
        prefs.edit().putBoolean(KEY_TILE_ASKED, true).apply()

        if (Build.VERSION.SDK_INT >= 33) {
            val sbm = getSystemService(StatusBarManager::class.java) ?: return
            sbm.requestAddTileService(
                ComponentName(this, DestroyTileService::class.java),
                getString(R.string.tile_label),
                Icon.createWithResource(this, R.drawable.ic_stat),
                mainExecutor
            ) { _ -> }
        } else {
            Toast.makeText(this, R.string.tile_hint, Toast.LENGTH_LONG).show()
        }
    }

    private fun close() {
        finishAndRemoveTask()
        @Suppress("DEPRECATION")
        overridePendingTransition(0, 0)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        close()
    }

    override fun onDestroy() {
        web?.destroy()
        web = null
        super.onDestroy()
    }
}
