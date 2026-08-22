package com.rcstravels.returnoverlay

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.widget.ImageView
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ReturnOverlayModule : Module() {
  private var overlay: View? = null
  private var windowManager: WindowManager? = null

  override fun definition() = ModuleDefinition {
    Name("ReturnOverlay")

    Function("canDrawOverlays") {
      val context = appContext.reactContext ?: return@Function false
      Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)
    }

    AsyncFunction("requestPermission") {
      val context = appContext.reactContext ?: return@AsyncFunction null
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
        val intent = Intent(
          Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
          Uri.parse("package:${context.packageName}")
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
      }
      null
    }

    AsyncFunction("show") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
        return@AsyncFunction false
      }
      showOverlay(context)
      true
    }

    AsyncFunction("hide") {
      hideOverlay()
    }

    OnDestroy {
      hideOverlay()
    }
  }

  private fun showOverlay(context: Context) {
    hideOverlay()

    val density = context.resources.displayMetrics.density
    val button = ImageView(context).apply {
      val logo = resources.getIdentifier("rcs_captains_logo", "drawable", context.packageName)
      if (logo != 0) setImageResource(logo)
      scaleType = ImageView.ScaleType.CENTER_CROP
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.rgb(36, 58, 251))
      }
      clipToOutline = true
      elevation = 10f * density
      contentDescription = "Return to RCS Captains"
      setOnClickListener {
        hideOverlay()
        context.packageManager.getLaunchIntentForPackage(context.packageName)?.let { launch ->
          launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
          context.startActivity(launch)
        }
      }
    }

    val size = (52f * density).toInt()
    val params = WindowManager.LayoutParams(
      size,
      size,
      overlayWindowType(),
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.START or Gravity.TOP
      x = context.resources.displayMetrics.widthPixels - size - (14f * density).toInt()
      y = (context.resources.displayMetrics.heightPixels - size) / 2
    }

    windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    makeDraggable(button, params, context)
    windowManager?.addView(button, params)
    overlay = button
  }

  private fun makeDraggable(view: View, params: WindowManager.LayoutParams, context: Context) {
    val slop = ViewConfiguration.get(context).scaledTouchSlop
    var downRawX = 0f
    var downRawY = 0f
    var downX = 0
    var downY = 0
    var dragged = false

    view.setOnTouchListener { touched, event ->
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          downRawX = event.rawX
          downRawY = event.rawY
          downX = params.x
          downY = params.y
          dragged = false
          true
        }
        MotionEvent.ACTION_MOVE -> {
          val dx = event.rawX - downRawX
          val dy = event.rawY - downRawY
          if (!dragged && (kotlin.math.abs(dx) > slop || kotlin.math.abs(dy) > slop)) dragged = true
          if (dragged) {
            val metrics = context.resources.displayMetrics
            params.x = (downX + dx.toInt()).coerceIn(0, metrics.widthPixels - view.width)
            params.y = (downY + dy.toInt()).coerceIn(0, metrics.heightPixels - view.height)
            runCatching { windowManager?.updateViewLayout(view, params) }
          }
          true
        }
        MotionEvent.ACTION_UP -> {
          if (!dragged) touched.performClick()
          true
        }
        MotionEvent.ACTION_CANCEL -> true
        else -> false
      }
    }
  }

  private fun hideOverlay() {
    overlay?.let { view ->
      runCatching { windowManager?.removeView(view) }
    }
    overlay = null
    windowManager = null
  }

  @Suppress("DEPRECATION")
  private fun overlayWindowType() =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    else
      WindowManager.LayoutParams.TYPE_PHONE
}
