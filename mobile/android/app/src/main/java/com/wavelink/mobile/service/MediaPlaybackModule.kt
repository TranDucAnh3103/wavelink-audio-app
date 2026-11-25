package com.wavelink.mobile.service

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Arguments
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
        reactContext.startService(intent)
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
        reactContext.startService(intent)
    }

    @ReactMethod
    fun stopService() {
        val intent = Intent(reactContext, MediaPlaybackService::class.java).apply {
            action = MediaPlaybackService.ACTION_STOP
        }
        reactContext.startService(intent)
    }
}
