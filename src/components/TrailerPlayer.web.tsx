import React from 'react';
import { StyleSheet, View } from 'react-native';

export function TrailerPlayer({ videoKey, muted = true }: { videoKey: string; muted?: boolean }) {
  // У браузері автозапуск дозволено лише без звуку.
  const src = `https://www.youtube.com/embed/${videoKey}?autoplay=1&playsinline=1&rel=0&modestbranding=1&loop=1&playlist=${videoKey}&mute=${muted ? 1 : 0}`;
  return (
    <View style={StyleSheet.absoluteFill}>
      {React.createElement('iframe', {
        src,
        style: { width: '100%', height: '100%', border: 0, background: '#000' },
        allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
        allowFullScreen: true,
      })}
    </View>
  );
}
