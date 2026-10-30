package com.miladtavakoli.screendestroyer

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.webkit.WebView
import android.widget.FrameLayout
import android.widget.TextView
import android.widget.Toast
import kotlin.math.abs

/**
 * Keeps two overlay windows alive over other apps:
 *  - FULL:   transparent full-screen WebView running the destroy engine.
 *  - BUBBLE: small draggable 💥 button. Tap = destroy whatever app is on screen now,
 *            long-press = quit.
 * Closing the full overlay (✕ / back) minimises it to the bubble.
 */
class OverlayService : Service() {

    companion object {
        const val ACTION_SHOW_FULL = "show_full"
        const val ACTION_SHOW_BUBBLE = "show_bubble"
        const val ACTION_STOP = "stop"
        private const val CHANNEL = "overlay"
        private const val NOTIF_ID = 7
    }

    private lateinit var wm: WindowManager
    private val main = Handler(Looper.getMainLooper())

    private var fullRoot: FrameLayout? = null
    private var fullWeb: WebView? = null
    private var bubble: View? = null
    private var bubbleParams: WindowManager.LayoutParams? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        goForeground()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!Settings.canDrawOverlays(this)) {
            stopSelf()
            return START_NOT_STICKY
        }
        when (intent?.action) {
            ACTION_STOP -> stopSelf()
            ACTION_SHOW_BUBBLE -> showBubble()
            else -> showFull()
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        hideFull()
        hideBubble()
        super.onDestroy()
    }

    // ---------------------------------------------------------------- full overlay

    @SuppressLint("ClickableViewAccessibility")
    private fun showFull() {
        hideBubble()
        if (fullRoot != null) return

        val root = object : FrameLayout(this) {
            override fun dispatchKeyEvent(event: KeyEvent): Boolean {
                if (event.keyCode == KeyEvent.KEYCODE_BACK) {
                    if (event.action == KeyEvent.ACTION_UP) minimise()
                    return true
                }
                return super.dispatchKeyEvent(event)
            }
        }
        val web = DestroyerWeb.create(this) { minimise() }
        root.addView(web, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))

        val lp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
                WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED or
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
            PixelFormat.TRANSLUCENT
        )
        lp.gravity = Gravity.TOP or Gravity.START
        if (Build.VERSION.SDK_INT >= 28) {
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }

        wm.addView(root, lp)
        root.isFocusableInTouchMode = true
        root.requestFocus()
        fullRoot = root
        fullWeb = web
    }

    private fun hideFull() {
        val root = fullRoot ?: return
        fullWeb?.let { it.stopLoading(); root.removeView(it); it.destroy() }
        try { wm.removeView(root) } catch (_: Exception) {}
        fullRoot = null
        fullWeb = null
    }

    private fun minimise() {
        hideFull()
        showBubble()
    }

    // ---------------------------------------------------------------- bubble

    @SuppressLint("ClickableViewAccessibility", "SetTextI18n")
    private fun showBubble() {
        if (bubble != null) return
        val size = dp(58)
        val tv = TextView(this).apply {
            text = "💥"
            gravity = Gravity.CENTER
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 26f)
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#E6FF6D1F"))
                setStroke(dp(2), Color.WHITE)
            }
            elevation = dp(6).toFloat()
        }
        val lp = WindowManager.LayoutParams(
            size, size,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        )
        lp.gravity = Gravity.TOP or Gravity.START
        lp.x = resources.displayMetrics.widthPixels - size - dp(12)
        lp.y = resources.displayMetrics.heightPixels / 3

        val slop = ViewConfiguration.get(this).scaledTouchSlop
        val longPressMs = ViewConfiguration.getLongPressTimeout().toLong()
        var downX = 0f; var downY = 0f; var startX = 0; var startY = 0
        var dragging = false; var longFired = false
        val longPress = Runnable {
            longFired = true
            Toast.makeText(this, R.string.bye, Toast.LENGTH_SHORT).show()
            stopSelf()
        }

        tv.setOnTouchListener { _, e ->
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    downX = e.rawX; downY = e.rawY; startX = lp.x; startY = lp.y
                    dragging = false; longFired = false
                    main.postDelayed(longPress, longPressMs * 2)
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = e.rawX - downX; val dy = e.rawY - downY
                    if (!dragging && (abs(dx) > slop || abs(dy) > slop)) {
                        dragging = true
                        main.removeCallbacks(longPress)
                    }
                    if (dragging) {
                        lp.x = startX + dx.toInt(); lp.y = startY + dy.toInt()
                        try { wm.updateViewLayout(tv, lp) } catch (_: Exception) {}
                    }
                }
                MotionEvent.ACTION_UP -> {
                    main.removeCallbacks(longPress)
                    if (!dragging && !longFired) showFull()
                }
                MotionEvent.ACTION_CANCEL -> main.removeCallbacks(longPress)
            }
            true
        }

        wm.addView(tv, lp)
        bubble = tv
        bubbleParams = lp
    }

    private fun hideBubble() {
        val b = bubble ?: return
        try { wm.removeView(b) } catch (_: Exception) {}
        bubble = null
        bubbleParams = null
    }

    // ---------------------------------------------------------------- foreground notification

    private fun goForeground() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, getString(R.string.channel_name), NotificationManager.IMPORTANCE_MIN)
        )
        val pFlags = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        val destroyNow = PendingIntent.getService(
            this, 1, Intent(this, OverlayService::class.java).setAction(ACTION_SHOW_FULL), pFlags
        )
        val stop = PendingIntent.getService(
            this, 2, Intent(this, OverlayService::class.java).setAction(ACTION_STOP), pFlags
        )
        val notif = Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(getString(R.string.notif_text))
            .setContentIntent(destroyNow)
            .setOngoing(true)
            .addAction(Notification.Action.Builder(null as android.graphics.drawable.Icon?, getString(R.string.notif_stop), stop).build())
            .build()

        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIF_ID, notif)
        }
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()
}
