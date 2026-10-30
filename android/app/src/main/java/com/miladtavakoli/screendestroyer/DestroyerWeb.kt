package com.miladtavakoli.screendestroyer

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient

/** Builds the transparent WebView that runs the shared engine (core/index.html). */
object DestroyerWeb {

    const val ENGINE_URL = "file:///android_asset/index.html"

    @SuppressLint("SetJavaScriptEnabled")
    fun create(context: Context, onClose: () -> Unit): WebView {
        val web = WebView(context)
        web.setBackgroundColor(Color.TRANSPARENT)
        web.setLayerType(View.LAYER_TYPE_HARDWARE, null)
        web.isVerticalScrollBarEnabled = false
        web.isHorizontalScrollBarEnabled = false
        web.overScrollMode = View.OVER_SCROLL_NEVER
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
        }
        web.webViewClient = WebViewClient()
        web.addJavascriptInterface(Bridge(context, onClose), "AndroidHost")
        web.loadUrl(ENGINE_URL)
        return web
    }

    /** Exposed to JavaScript as window.AndroidHost */
    private class Bridge(private val context: Context, private val onClose: () -> Unit) {
        private val main = Handler(Looper.getMainLooper())

        @JavascriptInterface
        fun close() {
            main.post { onClose() }
        }

        @JavascriptInterface
        fun vibrate(ms: Int) {
            if (ms <= 0) return
            @Suppress("DEPRECATION")
            val v = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator ?: return
            if (!v.hasVibrator()) return
            v.vibrate(VibrationEffect.createOneShot(ms.toLong().coerceAtMost(1000), VibrationEffect.DEFAULT_AMPLITUDE))
        }
    }
}
