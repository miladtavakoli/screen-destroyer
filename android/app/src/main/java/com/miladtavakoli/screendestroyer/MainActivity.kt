package com.miladtavakoli.screendestroyer

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.WindowManager
import android.webkit.WebView

/**
 * Launcher entry point.
 *  - With "display over other apps" permission: starts the overlay service
 *    (full-screen destroy mode over whatever app is underneath) and finishes.
 *  - Without it: asks for the permission, or runs once inside this translucent
 *    activity so the user can still play over the home screen.
 */
class MainActivity : Activity() {

    private var web: WebView? = null
    private var askedForPermission = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }
    }

    override fun onResume() {
        super.onResume()
        if (web != null) return                       // already playing in-activity
        if (Settings.canDrawOverlays(this)) {
            startOverlay()
        } else if (!askedForPermission) {
            askedForPermission = true
            showPermissionDialog()
        } else {
            // came back from settings without granting
            runInsideActivity()
        }
    }

    private fun startOverlay() {
        val i = Intent(this, OverlayService::class.java).setAction(OverlayService.ACTION_SHOW_FULL)
        startForegroundService(i)
        finish()
        overridePendingTransition(0, 0)
    }

    private fun showPermissionDialog() {
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle(R.string.perm_title)
            .setMessage(R.string.perm_message)
            .setPositiveButton(R.string.perm_grant) { _, _ ->
                startActivity(
                    Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName"))
                )
            }
            .setNegativeButton(R.string.perm_just_here) { _, _ -> runInsideActivity() }
            .setOnCancelListener { finish() }
            .show()
    }

    private fun runInsideActivity() {
        window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN or WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val w = DestroyerWeb.create(this) { finish() }
        web = w
        setContentView(w)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        finish()
    }

    override fun onDestroy() {
        web?.destroy()
        web = null
        super.onDestroy()
    }
}
