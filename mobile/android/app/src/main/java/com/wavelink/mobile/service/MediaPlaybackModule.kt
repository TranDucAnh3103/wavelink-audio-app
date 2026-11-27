package com.wavelink.mobile.service

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class MediaPlaybackModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        var instance: MediaPlaybackModule? = null

        fun emitAction(action: String, value: Double? = null) {
            val map = Arguments.createMap().apply {
                putString("action", action)
                if (value != null) {
                    putDouble("value", value)
                }
            }
            instance?.sendEvent("onMediaAction", map)
        }
    }

    init {
        instance = this
    }

    override fun getName(): String = "MediaPlaybackModule"

    private fun sendEvent(eventName: String, params: WritableMap) {
        try {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        } catch (_: Exception) {}
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    @ReactMethod
    fun startService(metadata: ReadableMap) {
        val title = if (metadata.hasKey("title")) metadata.getString("title") else "WaveLink Audio"
        val artist = if (metadata.hasKey("artist")) metadata.getString("artist") else "Đang phát"
        val artwork = if (metadata.hasKey("artwork")) metadata.getString("artwork") else ""
        val isPlaying = if (metadata.hasKey("isPlaying")) metadata.getBoolean("isPlaying") else true
        val durationSec = if (metadata.hasKey("duration")) metadata.getDouble("duration") else 0.0
        val positionSec = if (metadata.hasKey("currentTime")) metadata.getDouble("currentTime") else 0.0
        val speed = if (metadata.hasKey("playbackSpeed")) metadata.getDouble("playbackSpeed").toFloat() else 1.0f

        val intent = Intent(reactContext, MediaPlaybackService::class.java).apply {
            action = MediaPlaybackService.ACTION_START
            putExtra(MediaPlaybackService.EXTRA_TITLE, title)
            putExtra(MediaPlaybackService.EXTRA_ARTIST, artist)
            putExtra(MediaPlaybackService.EXTRA_ARTWORK, artwork)
            putExtra(MediaPlaybackService.EXTRA_IS_PLAYING, isPlaying)
            putExtra(MediaPlaybackService.EXTRA_DURATION, (durationSec * 1000).toLong())
            putExtra(MediaPlaybackService.EXTRA_POSITION, (positionSec * 1000).toLong())
            putExtra(MediaPlaybackService.EXTRA_SPEED, speed)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            reactContext.startForegroundService(intent)
        } else {
            reactContext.startService(intent)
        }
    }

    @ReactMethod
    fun updateState(isPlaying: Boolean, currentPosition: Double, duration: Double, playbackSpeed: Double) {
        val intent = Intent(reactContext, MediaPlaybackService::class.java).apply {
            action = MediaPlaybackService.ACTION_UPDATE_STATE
            putExtra(MediaPlaybackService.EXTRA_IS_PLAYING, isPlaying)
            putExtra(MediaPlaybackService.EXTRA_POSITION, (currentPosition * 1000).toLong())
            putExtra(MediaPlaybackService.EXTRA_DURATION, (duration * 1000).toLong())
            putExtra(MediaPlaybackService.EXTRA_SPEED, playbackSpeed.toFloat())
        }
        try {
            if (isPlaying && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactContext.startForegroundService(intent)
            } else {
                reactContext.startService(intent)
            }
        } catch (_: Exception) {}
    }

    @ReactMethod
    fun updateMetadata(metadata: ReadableMap) {
        val title = if (metadata.hasKey("title")) metadata.getString("title") else "WaveLink Audio"
        val artist = if (metadata.hasKey("artist")) metadata.getString("artist") else "Đang phát"
        val artwork = if (metadata.hasKey("artwork")) metadata.getString("artwork") else ""
        val durationSec = if (metadata.hasKey("duration")) metadata.getDouble("duration") else 0.0

        val intent = Intent(reactContext, MediaPlaybackService::class.java).apply {
            action = MediaPlaybackService.ACTION_UPDATE_METADATA
            putExtra(MediaPlaybackService.EXTRA_TITLE, title)
            putExtra(MediaPlaybackService.EXTRA_ARTIST, artist)
            putExtra(MediaPlaybackService.EXTRA_ARTWORK, artwork)
            putExtra(MediaPlaybackService.EXTRA_DURATION, (durationSec * 1000).toLong())
        }
        try {
            reactContext.startService(intent)
        } catch (_: Exception) {}
    }

    @ReactMethod
    fun stopService() {
        val intent = Intent(reactContext, MediaPlaybackService::class.java).apply {
            action = MediaPlaybackService.ACTION_STOP
        }
        try {
            reactContext.startService(intent)
        } catch (_: Exception) {}
    }

    @ReactMethod
    fun isBatteryOptimizationIgnored(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                promise.resolve(true)
                return
            }
            val pm = reactContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
            val ignoring = pm?.isIgnoringBatteryOptimizations(reactContext.packageName) ?: true
            promise.resolve(ignoring)
        } catch (e: Exception) {
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun requestIgnoreBatteryOptimizations(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                promise.resolve(true)
                return
            }
            val pm = reactContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
            if (pm?.isIgnoringBatteryOptimizations(reactContext.packageName) == true) {
                promise.resolve(true)
                return
            }
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:${reactContext.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            if (intent.resolveActivity(reactContext.packageManager) != null) {
                reactContext.startActivity(intent)
                promise.resolve(true)
                return
            }
            val fallbackIntent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(fallbackIntent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }
}
