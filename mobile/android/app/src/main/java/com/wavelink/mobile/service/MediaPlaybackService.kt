package com.wavelink.mobile.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.drawable.Drawable
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.media.app.NotificationCompat.MediaStyle
import com.bumptech.glide.Glide
import com.bumptech.glide.request.target.CustomTarget
import com.bumptech.glide.request.transition.Transition
import com.wavelink.mobile.MainActivity
import com.wavelink.mobile.R

class MediaPlaybackService : Service() {

    companion object {
        const val ACTION_START = "com.wavelink.mobile.action.START"
        const val ACTION_UPDATE_STATE = "com.wavelink.mobile.action.UPDATE_STATE"
        const val ACTION_UPDATE_METADATA = "com.wavelink.mobile.action.UPDATE_METADATA"
        const val ACTION_STOP = "com.wavelink.mobile.action.STOP"

        // Các Action điều khiển từ Notification PendingIntent
        const val ACTION_CONTROL_PLAY = "com.wavelink.mobile.action.CONTROL_PLAY"
        const val ACTION_CONTROL_PAUSE = "com.wavelink.mobile.action.CONTROL_PAUSE"
        const val ACTION_CONTROL_NEXT = "com.wavelink.mobile.action.CONTROL_NEXT"
        const val ACTION_CONTROL_PREV = "com.wavelink.mobile.action.CONTROL_PREV"
        const val ACTION_CONTROL_REWIND = "com.wavelink.mobile.action.CONTROL_REWIND"
        const val ACTION_CONTROL_FORWARD = "com.wavelink.mobile.action.CONTROL_FORWARD"

        const val EXTRA_TITLE = "extra_title"
        const val EXTRA_ARTIST = "extra_artist"
        const val EXTRA_ARTWORK = "extra_artwork"
        const val EXTRA_IS_PLAYING = "extra_is_playing"
        const val EXTRA_POSITION = "extra_position"
        const val EXTRA_DURATION = "extra_duration"
        const val EXTRA_SPEED = "extra_speed"

        private const val NOTIFICATION_ID = 9983
        private const val CHANNEL_ID = "wavelink_media_playback_channel"
    }

    private var mediaSession: MediaSessionCompat? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null
    private var audioManager: AudioManager? = null
    private var audioFocusRequest: AudioFocusRequest? = null
    private var hasAudioFocus: Boolean = false
    private var pausedByTransientFocusLoss: Boolean = false
    private val mainHandler = Handler(Looper.getMainLooper())

    private val audioFocusChangeListener = AudioManager.OnAudioFocusChangeListener { focusChange ->
        when (focusChange) {
            AudioManager.AUDIOFOCUS_LOSS -> {
                hasAudioFocus = false
                pausedByTransientFocusLoss = false
                MediaPlaybackModule.emitAction("pause")
            }
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
                if (isPlaying) {
                    pausedByTransientFocusLoss = true
                    MediaPlaybackModule.emitAction("pause")
                }
            }
            AudioManager.AUDIOFOCUS_GAIN -> {
                hasAudioFocus = true
                if (pausedByTransientFocusLoss) {
                    pausedByTransientFocusLoss = false
                    MediaPlaybackModule.emitAction("play")
                }
            }
        }
    }

    private var currentTitle: String = "WaveLink Audio"
    private var currentArtist: String = "Sẵn sàng phát"
    private var currentArtworkUrl: String = ""
    private var currentArtworkBitmap: Bitmap? = null
    private var isPlaying: Boolean = false
    private var currentPositionMs: Long = 0L
    private var currentDurationMs: Long = 0L
    private var currentPlaybackSpeed: Float = 1.0f

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()

        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "WaveLink::MediaPlaybackServiceLock")
        wakeLock?.setReferenceCounted(false)

        val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        val wifiLockMode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            WifiManager.WIFI_MODE_FULL_LOW_LATENCY
        } else {
            @Suppress("DEPRECATION")
            WifiManager.WIFI_MODE_FULL_HIGH_PERF
        }
        wifiLock = wifiManager.createWifiLock(wifiLockMode, "WaveLink::MediaWifiLock").apply {
            setReferenceCounted(false)
        }

        audioManager = getSystemService(Context.AUDIO_SERVICE) as? AudioManager

        initMediaSession()
    }

    private fun acquirePlaybackLocks() {
        if (wakeLock?.isHeld != true) {
            wakeLock?.acquire(24 * 60 * 60 * 1000L)
        }
        if (wifiLock?.isHeld != true) {
            try {
                wifiLock?.acquire()
            } catch (_: Exception) {}
        }
        requestAudioFocus()
    }

    private fun releasePlaybackLocks(releaseFocus: Boolean) {
        if (wakeLock?.isHeld == true) {
            try {
                wakeLock?.release()
            } catch (_: Exception) {}
        }
        if (wifiLock?.isHeld == true) {
            try {
                wifiLock?.release()
            } catch (_: Exception) {}
        }
        if (releaseFocus) {
            abandonAudioFocus()
        }
    }

    private fun requestAudioFocus() {
        val manager = audioManager ?: return
        if (hasAudioFocus) return
        val res = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val attrs = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build()
            val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(attrs)
                .setOnAudioFocusChangeListener(audioFocusChangeListener)
                .build()
            audioFocusRequest = req
            manager.requestAudioFocus(req)
        } else {
            @Suppress("DEPRECATION")
            manager.requestAudioFocus(
                audioFocusChangeListener,
                AudioManager.STREAM_MUSIC,
                AudioManager.AUDIOFOCUS_GAIN
            )
        }
        hasAudioFocus = res == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    }

    private fun abandonAudioFocus() {
        val manager = audioManager ?: return
        if (!hasAudioFocus) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest?.let { manager.abandonAudioFocusRequest(it) }
        } else {
            @Suppress("DEPRECATION")
            manager.abandonAudioFocus(audioFocusChangeListener)
        }
        hasAudioFocus = false
    }

    private fun initMediaSession() {
        mediaSession = MediaSessionCompat(this, "WaveLinkMediaSession").apply {
            isActive = true
            setCallback(object : MediaSessionCompat.Callback() {
                override fun onPlay() {
                    MediaPlaybackModule.emitAction("play")
                }

                override fun onPause() {
                    MediaPlaybackModule.emitAction("pause")
                }

                override fun onSkipToNext() {
                    MediaPlaybackModule.emitAction("next")
                }

                override fun onSkipToPrevious() {
                    MediaPlaybackModule.emitAction("previous")
                }

                override fun onSeekTo(pos: Long) {
                    val seconds = pos / 1000.0
                    MediaPlaybackModule.emitAction("seek", seconds)
                }

                override fun onRewind() {
                    MediaPlaybackModule.emitAction("rewind", 15.0)
                }

                override fun onFastForward() {
                    MediaPlaybackModule.emitAction("forward", 30.0)
                }

                override fun onStop() {
                    MediaPlaybackModule.emitAction("stop")
                    stopSelfService()
                }
            })
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        if (action == null) {
            // Re-attach foreground notification if OS recreated sticky service after memory pressure
            val notification = buildMediaNotification()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
            return START_STICKY
        }

        when (action) {
            ACTION_START -> {
                currentTitle = intent.getStringExtra(EXTRA_TITLE) ?: currentTitle
                currentArtist = intent.getStringExtra(EXTRA_ARTIST) ?: currentArtist
                currentArtworkUrl = intent.getStringExtra(EXTRA_ARTWORK) ?: currentArtworkUrl
                isPlaying = intent.getBooleanExtra(EXTRA_IS_PLAYING, true)
                currentPositionMs = intent.getLongExtra(EXTRA_POSITION, 0L)
                currentDurationMs = intent.getLongExtra(EXTRA_DURATION, 0L)
                currentPlaybackSpeed = intent.getFloatExtra(EXTRA_SPEED, 1.0f)

                if (isPlaying) {
                    acquirePlaybackLocks()
                }
                loadArtworkAndRefresh(currentArtworkUrl)

                val notification = buildMediaNotification()
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    startForeground(
                        NOTIFICATION_ID,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
                    )
                } else {
                    startForeground(NOTIFICATION_ID, notification)
                }
            }

            ACTION_UPDATE_STATE -> {
                isPlaying = intent.getBooleanExtra(EXTRA_IS_PLAYING, isPlaying)
                currentPositionMs = intent.getLongExtra(EXTRA_POSITION, currentPositionMs)
                currentDurationMs = intent.getLongExtra(EXTRA_DURATION, currentDurationMs)
                currentPlaybackSpeed = intent.getFloatExtra(EXTRA_SPEED, currentPlaybackSpeed)

                if (isPlaying) {
                    acquirePlaybackLocks()
                } else {
                    releasePlaybackLocks(releaseFocus = false)
                }

                updateMediaSessionState()
                updateNotification()
            }

            ACTION_UPDATE_METADATA -> {
                val newTitle = intent.getStringExtra(EXTRA_TITLE) ?: currentTitle
                val newArtist = intent.getStringExtra(EXTRA_ARTIST) ?: currentArtist
                val newArtwork = intent.getStringExtra(EXTRA_ARTWORK) ?: currentArtworkUrl
                val newDuration = intent.getLongExtra(EXTRA_DURATION, currentDurationMs)

                currentTitle = newTitle
                currentArtist = newArtist
                currentDurationMs = newDuration

                if (newArtwork != currentArtworkUrl) {
                    currentArtworkUrl = newArtwork
                    loadArtworkAndRefresh(currentArtworkUrl)
                } else {
                    updateMediaSessionMetadata()
                    updateNotification()
                }
            }

            ACTION_CONTROL_PLAY -> MediaPlaybackModule.emitAction("play")
            ACTION_CONTROL_PAUSE -> MediaPlaybackModule.emitAction("pause")
            ACTION_CONTROL_NEXT -> MediaPlaybackModule.emitAction("next")
            ACTION_CONTROL_PREV -> MediaPlaybackModule.emitAction("previous")
            ACTION_CONTROL_REWIND -> MediaPlaybackModule.emitAction("rewind", 15.0)
            ACTION_CONTROL_FORWARD -> MediaPlaybackModule.emitAction("forward", 30.0)

            ACTION_STOP -> stopSelfService()
        }

        return START_STICKY
    }

    private fun loadArtworkAndRefresh(url: String) {
        if (url.isBlank()) {
            currentArtworkBitmap = null
            updateMediaSessionMetadata()
            updateNotification()
            return
        }

        mainHandler.post {
            try {
                Glide.with(applicationContext)
                    .asBitmap()
                    .load(url)
                    .into(object : CustomTarget<Bitmap>() {
                        override fun onResourceReady(resource: Bitmap, transition: Transition<in Bitmap>?) {
                            currentArtworkBitmap = resource
                            updateMediaSessionMetadata()
                            updateNotification()
                        }

                        override fun onLoadCleared(placeholder: Drawable?) {
                            currentArtworkBitmap = null
                        }
                    })
            } catch (_: Exception) {}
        }
    }

    private fun updateMediaSessionState() {
        val session = mediaSession ?: return
        val state = if (isPlaying) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED

        val actions = PlaybackStateCompat.ACTION_PLAY or
                PlaybackStateCompat.ACTION_PAUSE or
                PlaybackStateCompat.ACTION_PLAY_PAUSE or
                PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
                PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
                PlaybackStateCompat.ACTION_SEEK_TO or
                PlaybackStateCompat.ACTION_REWIND or
                PlaybackStateCompat.ACTION_FAST_FORWARD or
                PlaybackStateCompat.ACTION_STOP

        val playbackState = PlaybackStateCompat.Builder()
            .setActions(actions)
            .setState(state, currentPositionMs, currentPlaybackSpeed)
            .build()

        session.setPlaybackState(playbackState)
    }

    private fun updateMediaSessionMetadata() {
        val session = mediaSession ?: return
        val metadataBuilder = MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, currentTitle)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, currentArtist)
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, "WaveLink Audio")
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, currentDurationMs)

        currentArtworkBitmap?.let {
            metadataBuilder.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, it)
            metadataBuilder.putBitmap(MediaMetadataCompat.METADATA_KEY_ART, it)
        }

        session.setMetadata(metadataBuilder.build())
    }

    private fun buildMediaNotification(): Notification {
        val session = mediaSession ?: return NotificationCompat.Builder(this, CHANNEL_ID).build()

        updateMediaSessionState()
        updateMediaSessionMetadata()

        // Intent mở app khi bấm vào Notification body
        val openAppIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val openAppPendingIntent = PendingIntent.getActivity(
            this,
            0,
            openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Helper tạo Action PendingIntent
        fun createActionPendingIntent(actionStr: String, requestCode: Int): PendingIntent {
            val intent = Intent(this, MediaPlaybackService::class.java).apply {
                action = actionStr
            }
            return PendingIntent.getService(
                this,
                requestCode,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        val prevPendingIntent = createActionPendingIntent(ACTION_CONTROL_PREV, 1)
        val playPausePendingIntent = createActionPendingIntent(
            if (isPlaying) ACTION_CONTROL_PAUSE else ACTION_CONTROL_PLAY,
            2
        )
        val nextPendingIntent = createActionPendingIntent(ACTION_CONTROL_NEXT, 3)
        val stopPendingIntent = createActionPendingIntent(ACTION_STOP, 4)

        // Action Buttons
        val prevAction = NotificationCompat.Action(
            android.R.drawable.ic_media_previous,
            "Bài trước",
            prevPendingIntent
        )
        val playPauseAction = NotificationCompat.Action(
            if (isPlaying) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
            if (isPlaying) "Tạm dừng" else "Phát",
            playPausePendingIntent
        )
        val nextAction = NotificationCompat.Action(
            android.R.drawable.ic_media_next,
            "Bài tiếp",
            nextPendingIntent
        )

        val mediaStyle = MediaStyle()
            .setMediaSession(session.sessionToken)
            .setShowActionsInCompactView(0, 1, 2) // Previous, Play/Pause, Next hiển thị ở dạng thu gọn
            .setShowCancelButton(true)
            .setCancelButtonIntent(stopPendingIntent)

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setStyle(mediaStyle)
            .setContentTitle(currentTitle)
            .setContentText(currentArtist)
            .setSubText("WaveLink")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(openAppPendingIntent)
            .setDeleteIntent(stopPendingIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(isPlaying)
            .addAction(prevAction)
            .addAction(playPauseAction)
            .addAction(nextAction)

        currentArtworkBitmap?.let {
            builder.setLargeIcon(it)
        }

        return builder.build()
    }

    private fun updateNotification() {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        manager?.notify(NOTIFICATION_ID, buildMediaNotification())
    }

    private fun stopSelfService() {
        releasePlaybackLocks(releaseFocus = true)
        mediaSession?.isActive = false
        mediaSession?.release()
        mediaSession = null
        stopForeground(true)
        stopSelf()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "WaveLink Audio Playback",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Điều khiển âm thanh WaveLink trên Màn hình khóa và Thông báo hệ thống"
                setShowBadge(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    override fun onDestroy() {
        stopSelfService()
        super.onDestroy()
    }
}
