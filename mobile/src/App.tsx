import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
  BackHandler,
  Animated,
} from 'react-native';
import { WebView, WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';
import { getActiveWebUrl } from './config/appConfig';
import { MediaPlayback, MediaActionEvent, MediaMetadata } from './modules/MediaPlayback';

// User Agent giả lập chuẩn Chrome Mobile trên Android 14 để vượt qua bảo mật Google OAuth
const CHROME_MOBILE_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36';

/**
 * WAVELINK BIDIRECTIONAL MEDIA BRIDGE & BACKGROUND ENGINE
 * 1. Chặn đứng cơ chế tự ngắt của YouTube IFrame khi tắt màn hình (Page Visibility Spoofing)
 * 2. Lắng nghe YT.PlayerState, currentTime, duration và gửi về React Native qua postMessage
 * 3. Tiếp nhận lệnh điều khiển (Play, Pause, Next, Prev, Seek) từ Media Notification qua window.__wavelinkControl
 */
const INJECTED_MEDIA_BRIDGE_SCRIPT = `
(function() {
  if (window.__WAVELINK_MEDIA_BRIDGE__) return;
  window.__WAVELINK_MEDIA_BRIDGE__ = true;
  window.__WAVELINK_APP_STREAM_READY__ = true;

  window.__wavelinkUserWantsPause = false;
  window.__wavelinkYTPlayer = null;

  function isStreamMode() {
    return window.__WAVELINK_ENGINE__ === 'stream' || Boolean(document.getElementById('wavelink-html-audio'));
  }

  // 1. Ghi đè Page Visibility API CHỈ cho chế độ YouTube IFrame cũ (bỏ qua khi dùng Direct Audio Stream)
  try {
    var _origHiddenDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden') || Object.getOwnPropertyDescriptor(document, 'hidden');
    var _origVisDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState') || Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'hidden', {
      get: function() {
        if (isStreamMode()) return _origHiddenDesc && _origHiddenDesc.get ? _origHiddenDesc.get.call(document) : false;
        return false;
      },
      configurable: true
    });
    Object.defineProperty(document, 'visibilityState', {
      get: function() {
        if (isStreamMode()) return _origVisDesc && _origVisDesc.get ? _origVisDesc.get.call(document) : 'visible';
        return 'visible';
      },
      configurable: true
    });
    Object.defineProperty(document, 'webkitHidden', {
      get: function() { return isStreamMode() ? document.hidden : false; },
      configurable: true
    });
    Object.defineProperty(document, 'webkitVisibilityState', {
      get: function() { return isStreamMode() ? document.visibilityState : 'visible'; },
      configurable: true
    });
  } catch(e) {}

  // 2. Chặn các sự kiện ngắt tín hiệu khi màn hình tắt (CHỈ cho chế độ YouTube IFrame)
  window.addEventListener('visibilitychange', function(e) { if (!isStreamMode()) e.stopImmediatePropagation(); }, true);
  document.addEventListener('visibilitychange', function(e) { if (!isStreamMode()) e.stopImmediatePropagation(); }, true);
  window.addEventListener('blur', function(e) { if (!isStreamMode()) e.stopImmediatePropagation(); }, true);
  window.addEventListener('pagehide', function(e) { if (!isStreamMode()) e.stopImmediatePropagation(); }, true);

  // 3. Vô hiệu hóa lệnh pause tự động của thẻ Media HTML5 CHỈ ở chế độ YouTube IFrame
  var _origMediaPause = HTMLMediaElement.prototype.pause;
  HTMLMediaElement.prototype.pause = function() {
    if (isStreamMode() || window.__wavelinkUserWantsPause) {
      return _origMediaPause.apply(this, arguments);
    }
    return;
  };

  // 4. Hook Google OAuth Popup
  window.open = function(url) {
    if (url && typeof url === 'string' && url.length > 0) {
      window.location.href = url;
      return window;
    }
    return {
      closed: false,
      close: function() {},
      focus: function() {},
      location: {
        set href(val) { window.location.href = val; },
        get href() { return window.location.href; }
      }
    };
  };

  // 5. Lưu lại các Action Handlers của MediaSession mà WaveLink Web đã đăng ký
  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
    navigator.mediaSession._handlers = {};
    var _origSetActionHandler = navigator.mediaSession.setActionHandler;
    navigator.mediaSession.setActionHandler = function(action, handler) {
      navigator.mediaSession._handlers[action] = handler;
      if (_origSetActionHandler) {
        try { _origSetActionHandler.call(navigator.mediaSession, action, handler); } catch(e) {}
      }
    };
  }

  // 6. Cung cấp API điều khiển 2 chiều cho Native Android
  window.__wavelinkControl = {
    play: function() {
      window.__wavelinkUserWantsPause = false;
      if (window.__wavelinkYTPlayer && typeof window.__wavelinkYTPlayer.playVideo === 'function') {
        window.__wavelinkYTPlayer.playVideo();
      } else if (navigator.mediaSession && navigator.mediaSession._handlers && navigator.mediaSession._handlers['play']) {
        navigator.mediaSession._handlers['play']();
      } else {
        var iframes = document.querySelectorAll('iframe');
        for (var i = 0; i < iframes.length; i++) {
          try { iframes[i].contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*'); } catch(e) {}
        }
      }
    },
    pause: function() {
      window.__wavelinkUserWantsPause = true;
      if (window.__wavelinkYTPlayer && typeof window.__wavelinkYTPlayer.pauseVideo === 'function') {
        window.__wavelinkYTPlayer.pauseVideo();
      } else if (navigator.mediaSession && navigator.mediaSession._handlers && navigator.mediaSession._handlers['pause']) {
        navigator.mediaSession._handlers['pause']();
      } else {
        var iframes = document.querySelectorAll('iframe');
        for (var i = 0; i < iframes.length; i++) {
          try { iframes[i].contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*'); } catch(e) {}
        }
      }
    },
    seekTo: function(seconds) {
      if (window.__wavelinkYTPlayer && typeof window.__wavelinkYTPlayer.seekTo === 'function') {
        window.__wavelinkYTPlayer.seekTo(seconds, true);
      } else if (navigator.mediaSession && navigator.mediaSession._handlers && navigator.mediaSession._handlers['seekto']) {
        navigator.mediaSession._handlers['seekto']({ seekTime: seconds });
      } else {
        var iframes = document.querySelectorAll('iframe');
        for (var i = 0; i < iframes.length; i++) {
          try { iframes[i].contentWindow.postMessage('{"event":"command","func":"seekTo","args":[' + seconds + ', true]}', '*'); } catch(e) {}
        }
      }
    },
    next: function() {
      if (navigator.mediaSession && navigator.mediaSession._handlers && navigator.mediaSession._handlers['nexttrack']) {
        navigator.mediaSession._handlers['nexttrack']();
      }
    },
    previous: function() {
      if (navigator.mediaSession && navigator.mediaSession._handlers && navigator.mediaSession._handlers['previoustrack']) {
        navigator.mediaSession._handlers['previoustrack']();
      }
    },
    rewind: function(sec) {
      var delta = sec || 15;
      if (navigator.mediaSession && navigator.mediaSession._handlers && navigator.mediaSession._handlers['seekbackward']) {
        navigator.mediaSession._handlers['seekbackward']({ seekOffset: delta });
      } else if (window.__wavelinkYTPlayer && typeof window.__wavelinkYTPlayer.getCurrentTime === 'function') {
        var cur = window.__wavelinkYTPlayer.getCurrentTime();
        window.__wavelinkControl.seekTo(Math.max(0, cur - delta));
      }
    },
    forward: function(sec) {
      var delta = sec || 30;
      if (navigator.mediaSession && navigator.mediaSession._handlers && navigator.mediaSession._handlers['seekforward']) {
        navigator.mediaSession._handlers['seekforward']({ seekOffset: delta });
      } else if (window.__wavelinkYTPlayer && typeof window.__wavelinkYTPlayer.getCurrentTime === 'function') {
        var cur = window.__wavelinkYTPlayer.getCurrentTime();
        window.__wavelinkControl.seekTo(cur + delta);
      }
    }
  };

  // Helper gửi tiến trình phát về Native
  function postPlaybackUpdate(isPlaying, title, artist, artwork, currentTime, duration) {
    try {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'WAVELINK_PLAYBACK_STATE',
          payload: {
            isPlaying: Boolean(isPlaying),
            title: title || 'WaveLink Audio',
            artist: artist || 'Đang phát âm thanh',
            artwork: artwork || '',
            currentTime: Number(currentTime || 0),
            duration: Number(duration || 0)
          }
        }));
      }
    } catch (e) {}
  }

  // 7. Bắt instance YT.Player khi website khởi tạo
  function hookYouTubePlayer() {
    if (window.YT && window.YT.Player) {
      var _origYTPlayer = window.YT.Player;
      window.YT.Player = function(id, options) {
        var player = new _origYTPlayer(id, options);
        window.__wavelinkYTPlayer = player;
        return player;
      };
    }
  }
  hookYouTubePlayer();
  var _origOnYTReady = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = function() {
    hookYouTubePlayer();
    if (_origOnYTReady) _origOnYTReady();
  };

  // 8. Lắng nghe iframe YouTube message
  window.addEventListener('message', function(event) {
    try {
      if (typeof event.data === 'string') {
        var data = JSON.parse(event.data);
        if (data.event === 'onStateChange') {
          var state = data.info;
          var isPlaying = state === 1; // 1 = PLAYING
          if (isPlaying) {
            window.__wavelinkUserWantsPause = false;
          }
          var meta = (navigator && navigator.mediaSession) ? navigator.mediaSession.metadata : null;
          var art = (meta && meta.artwork && meta.artwork.length > 0) ? meta.artwork[meta.artwork.length - 1].src : '';
          var curTime = window.__wavelinkYTPlayer && window.__wavelinkYTPlayer.getCurrentTime ? window.__wavelinkYTPlayer.getCurrentTime() : 0;
          var dur = window.__wavelinkYTPlayer && window.__wavelinkYTPlayer.getDuration ? window.__wavelinkYTPlayer.getDuration() : 0;

          postPlaybackUpdate(isPlaying, meta ? meta.title : 'WaveLink Audio', meta ? meta.artist : 'Đang phát âm thanh', art, curTime, dur);

          // Cưỡng chế phát lại nếu YouTube tự pause khi tắt màn hình mà user không ấn dừng
          if (state === 2 && !window.__wavelinkUserWantsPause) {
            setTimeout(function() {
              window.__wavelinkControl.play();
            }, 100);
          }
        } else if (data.event === 'infoDelivery' && data.info) {
          if (typeof data.info.currentTime === 'number') {
            var isP = data.info.playerState === 1 || !window.__wavelinkUserWantsPause;
            var meta = (navigator && navigator.mediaSession) ? navigator.mediaSession.metadata : null;
            var art = (meta && meta.artwork && meta.artwork.length > 0) ? meta.artwork[meta.artwork.length - 1].src : '';
            postPlaybackUpdate(isP, meta ? meta.title : 'WaveLink Audio', meta ? meta.artist : 'Đang phát', art, data.info.currentTime, data.info.duration || 0);
          }
        }
      }
    } catch(e) {}
  }, true);

  // 9. Lắng nghe HTML5 Audio/Video sự kiện (chỉ khi không ở chế độ stream — stream do mobileBridge.ts quản lý)
  document.addEventListener('play', function() {
    window.__wavelinkUserWantsPause = false;
    if (isStreamMode()) return;
    var meta = (navigator && navigator.mediaSession) ? navigator.mediaSession.metadata : null;
    var art = (meta && meta.artwork && meta.artwork.length > 0) ? meta.artwork[meta.artwork.length - 1].src : '';
    postPlaybackUpdate(true, meta ? meta.title : 'WaveLink Audio', meta ? meta.artist : 'Đang phát âm thanh', art, 0, 0);
  }, true);

  // 10. Heartbeat tracking định kỳ 1 giây: Cập nhật vị trí thanh Seekbar cho Media Notification (YouTube fallback)
  setInterval(function() {
    if (isStreamMode()) return;
    try {
      var curTime = 0;
      var dur = 0;
      var isPlaying = false;

      if (window.__wavelinkYTPlayer && typeof window.__wavelinkYTPlayer.getCurrentTime === 'function') {
        curTime = window.__wavelinkYTPlayer.getCurrentTime() || 0;
        dur = window.__wavelinkYTPlayer.getDuration() || 0;
        isPlaying = window.__wavelinkYTPlayer.getPlayerState() === 1;
      } else {
        var media = document.querySelectorAll('audio, video');
        for (var i = 0; i < media.length; i++) {
          if (!media[i].paused && media[i].currentTime > 0) {
            isPlaying = true;
            curTime = media[i].currentTime;
            dur = media[i].duration || 0;
            break;
          }
        }
      }

      if (isPlaying) {
        var meta = (navigator && navigator.mediaSession) ? navigator.mediaSession.metadata : null;
        var art = (meta && meta.artwork && meta.artwork.length > 0) ? meta.artwork[meta.artwork.length - 1].src : '';
        postPlaybackUpdate(true, meta ? meta.title : 'WaveLink Audio', meta ? meta.artist : 'Đang phát âm thanh', art, curTime, dur);
      }
    } catch(e) {}
  }, 1000);

})();
true;
`;

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);

  // Hiệu ứng Fade mượt mà cho Splash Screen khởi động
  const splashFadeAnim = useRef(new Animated.Value(1)).current;
  const [showSplash, setShowSplash] = useState(true);

  // Trạng thái track hiện tại
  const [currentTrack, setCurrentTrack] = useState<MediaMetadata>({
    title: 'WaveLink Audio',
    artist: 'Sẵn sàng phát',
    artwork: '',
    duration: 0,
    currentTime: 0,
    isPlaying: false,
  });
  const currentTrackRef = useRef(currentTrack);
  currentTrackRef.current = currentTrack;
  const hasStartedServiceRef = useRef(false);

  // 1. Lắng nghe các action từ Android Media Notification
  useEffect(() => {
    const subscription = MediaPlayback.addMediaActionListener((event: MediaActionEvent) => {
      if (!webViewRef.current) return;

      switch (event.action) {
        case 'play':
          webViewRef.current.injectJavaScript(
            'if (window.__wavelinkMobileDispatch) { window.__wavelinkMobileDispatch("play"); } else if (window.__wavelinkControl) { window.__wavelinkControl.play(); } true;'
          );
          break;

        case 'pause':
          webViewRef.current.injectJavaScript(
            'if (window.__wavelinkMobileDispatch) { window.__wavelinkMobileDispatch("pause"); } else if (window.__wavelinkControl) { window.__wavelinkControl.pause(); } true;'
          );
          break;

        case 'next':
          webViewRef.current.injectJavaScript(
            'if (window.__wavelinkMobileDispatch) { window.__wavelinkMobileDispatch("next"); } else if (window.__wavelinkControl) { window.__wavelinkControl.next(); } true;'
          );
          break;

        case 'previous':
          webViewRef.current.injectJavaScript(
            'if (window.__wavelinkMobileDispatch) { window.__wavelinkMobileDispatch("prev"); } else if (window.__wavelinkControl) { window.__wavelinkControl.previous(); } true;'
          );
          break;

        case 'seek': {
          const seekPos = Number(event.value || 0);
          webViewRef.current.injectJavaScript(
            `if (window.__wavelinkMobileDispatch) { window.__wavelinkMobileDispatch("seekTo", ${seekPos}); } else if (window.__wavelinkControl) { window.__wavelinkControl.seekTo(${seekPos}); } true;`
          );
          break;
        }

        case 'rewind': {
          const delta = Number(event.value || 15);
          webViewRef.current.injectJavaScript(
            `if (window.__wavelinkMobileDispatch) { window.__wavelinkMobileDispatch("rewind", ${delta}); } else if (window.__wavelinkControl) { window.__wavelinkControl.rewind(${delta}); } true;`
          );
          break;
        }

        case 'forward': {
          const delta = Number(event.value || 30);
          webViewRef.current.injectJavaScript(
            `if (window.__wavelinkMobileDispatch) { window.__wavelinkMobileDispatch("forward", ${delta}); } else if (window.__wavelinkControl) { window.__wavelinkControl.forward(${delta}); } true;`
          );
          break;
        }

        case 'stop':
          webViewRef.current.injectJavaScript(
            'if (window.__wavelinkMobileDispatch) { window.__wavelinkMobileDispatch("pause"); } else if (window.__wavelinkControl) { window.__wavelinkControl.pause(); } true;'
          );
          MediaPlayback.stopService();
          hasStartedServiceRef.current = false;
          break;
      }
    });

    return () => subscription.remove();
  }, []);

  // 2. Xử lý nút Back vật lý của Android
  useEffect(() => {
    const onBackPress = () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => backHandler.remove();
  }, [canGoBack]);

  // 3. Nhận thông điệp từ WaveLink Web chuyển sang
  const handleWebMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (!data || !data.type) return;

      if (data.type === 'WAVELINK_PLAYBACK_STATE') {
        const { isPlaying, title, artist, artwork, duration, currentTime } = data.payload || {};
        const updatedTrack: MediaMetadata = {
          title: title || 'WaveLink Audio',
          artist: artist || 'Đang phát âm thanh',
          artwork: artwork || '',
          isPlaying: Boolean(isPlaying),
          duration: Number(duration || 0),
          currentTime: Number(currentTime || 0),
        };
        setCurrentTrack(updatedTrack);

        // Khởi động hoặc Cập nhật Media Notification hệ thống
        if (updatedTrack.isPlaying) {
          if (!hasStartedServiceRef.current) {
            MediaPlayback.startService(updatedTrack);
            hasStartedServiceRef.current = true;
          } else {
            MediaPlayback.updateState(
              updatedTrack.isPlaying,
              updatedTrack.currentTime || 0,
              updatedTrack.duration || 0
            );
            MediaPlayback.updateMetadata({
              title: updatedTrack.title,
              artist: updatedTrack.artist,
              artwork: updatedTrack.artwork,
              duration: updatedTrack.duration,
            });
          }
        } else {
          if (hasStartedServiceRef.current) {
            MediaPlayback.updateState(
              false,
              updatedTrack.currentTime || 0,
              updatedTrack.duration || 0
            );
          }
        }
      }
    } catch (e) {
      // Ignored
    }
  };

  // 4. Kết thúc tải trang -> Fade out Splash mượt mà
  const handleLoadEnd = () => {
    Animated.timing(splashFadeAnim, {
      toValue: 0,
      duration: 350,
      useNativeDriver: true,
    }).start(() => {
      setShowSplash(false);
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F12" />

      <WebView
        ref={webViewRef}
        source={{ uri: getActiveWebUrl() }}
        style={styles.webView}
        injectedJavaScriptBeforeContentLoaded={INJECTED_MEDIA_BRIDGE_SCRIPT}
        injectedJavaScript={INJECTED_MEDIA_BRIDGE_SCRIPT}
        onMessage={handleWebMessage}
        onNavigationStateChange={(navState: WebViewNavigation) => setCanGoBack(navState.canGoBack)}
        onLoadEnd={handleLoadEnd}
        // Tối ưu hóa hiệu năng & bộ nhớ đệm
        cacheEnabled={true}
        cacheMode="LOAD_DEFAULT"
        domStorageEnabled={true}
        databaseEnabled={true}
        sharedCookiesEnabled={true}
        thirdPartyCookiesEnabled={true}
        javaScriptEnabled={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        allowFileAccess={true}
        mixedContentMode="always"
        setSupportMultipleWindows={false}
        androidLayerType="hardware"
        androidHardwareAccelerationDisabled={false}
        renderToHardwareTextureAndroid={true}
        overScrollMode="never"
        userAgent={CHROME_MOBILE_USER_AGENT}
      />

      {/* Splash Screen khởi động nhanh, mượt mà */}
      {showSplash && (
        <Animated.View style={[styles.splashContainer, { opacity: splashFadeAnim }]} pointerEvents="none">
          <View style={styles.splashIconBox}>
            <Text style={styles.splashIcon}>🎵</Text>
          </View>
          <Text style={styles.splashTitle}>WaveLink Mobile</Text>
          <Text style={styles.splashSubtitle}>Âm thanh & Podcast không giới hạn</Text>
          <View style={styles.splashSpinnerBox}>
            <ActivityIndicator size="small" color="#6366F1" />
          </View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F12',
  },
  webView: {
    flex: 1,
    backgroundColor: '#0F0F12',
  },
  splashContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0F0F12',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  splashIconBox: {
    width: 84,
    height: 84,
    borderRadius: 24,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(99, 102, 241, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  splashIcon: {
    fontSize: 40,
  },
  splashTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  splashSubtitle: {
    color: '#9CA3AF',
    fontSize: 13,
    marginTop: 6,
  },
  splashSpinnerBox: {
    marginTop: 32,
  },
});
