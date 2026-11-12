import React from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

const ORIGIN = 'https://moviecasting.app';

// YouTube вимагає коректний origin/referer для вбудованого плеєра, тому
// завантажуємо iframe через HTML-обгортку з baseUrl.
const html = (key: string, muted: boolean) => `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>html,body{margin:0;padding:0;background:#000;height:100%;overflow:hidden}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style>
</head><body>
<iframe src="https://www.youtube.com/embed/${key}?autoplay=1&playsinline=1&rel=0&modestbranding=1&controls=1&loop=1&playlist=${key}&mute=${muted ? 1 : 0}&origin=${encodeURIComponent(ORIGIN)}"
allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
</body></html>`;

export function TrailerPlayer({ videoKey, muted = false }: { videoKey: string; muted?: boolean }) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <WebView
        source={{ html: html(videoKey, muted), baseUrl: ORIGIN }}
        style={{ flex: 1, backgroundColor: '#000' }}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo
        javaScriptEnabled
        scrollEnabled={false}
        bounces={false}
        originWhitelist={['*']}
        setSupportMultipleWindows={false}
      />
    </View>
  );
}
