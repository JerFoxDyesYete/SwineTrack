import React from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';

type Props = {
  streamUrl: string;
  style?: any;
  onLoadStart?: () => void;
  onError?: () => void;
};

export function LiveStreamView({ streamUrl, style, onLoadStart, onError }: Props) {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          /* 1. Make background grey so we can see if WebView is working */
          body { margin: 0; background: #222; height: 100vh; display: flex; justify-content: center; align-items: center; }
          
          /* 2. Force image to fill screen and add debug border */
          img { 
            width: 100%; 
            height: 100%; 
            object-fit: contain; 
            border: 2px solid red; /* Debug Border */
          }
        </style>
      </head>
      <body>
        <script>
          function log(type, msg) {
             window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, message: msg }));
          }
        </script>
        
        <img 
          src="${streamUrl}" 
          onload="if(this.naturalWidth > 0) { log('SUCCESS', 'Size: ' + this.naturalWidth + 'x' + this.naturalHeight); } else { log('WARN', 'Image loaded but width is 0'); }"
          onerror="log('ERROR', 'Stream failed')"
        />
      </body>
    </html>
  `;

  return (
    <View style={[styles.container, style]}>
      <WebView
        originWhitelist={['*']}
        source={{ html: htmlContent }}
        style={{ flex: 1, backgroundColor: '#222' }}
        scrollEnabled={false}
        mixedContentMode="always"
        javaScriptEnabled={true}
        
        androidLayerType="software" 
        opacity={0.99}
        
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            console.log(`[Stream] ${data.type}: ${data.message}`);
          } catch(e) {}
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: '#000',
    flex: 1,
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
});