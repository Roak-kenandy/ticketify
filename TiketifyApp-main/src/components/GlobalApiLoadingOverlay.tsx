import React from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import colors from '../constants/colors';
import {subscribeApiLoading} from '../utils/apiLoading';

const SHOW_DELAY_MS = 300;
const BAR_WIDTH_RATIO = 0.35;

/**
 * Thin, non-blocking activity bar pinned to the top of the screen. Screens own
 * their loading states; this only signals that network work is in flight, and
 * never intercepts touches.
 */
export default function GlobalApiLoadingOverlay() {
  const [visible, setVisible] = React.useState(false);
  const progress = React.useRef(new Animated.Value(0)).current;
  const {width} = useWindowDimensions();
  const insets = useSafeAreaInsets();

  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeApiLoading(active => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (active) {
        timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
      } else {
        setVisible(false);
      }
    });
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
      unsubscribe();
    };
  }, []);

  React.useEffect(() => {
    if (!visible) {
      progress.stopAnimation();
      progress.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1100,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress, visible]);

  if (!visible) {
    return null;
  }

  const barWidth = width * BAR_WIDTH_RATIO;
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-barWidth, width],
  });

  return (
    <View
      pointerEvents="none"
      style={[styles.track, {top: insets.top}]}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading">
      <Animated.View
        style={[styles.bar, {width: barWidth, transform: [{translateX}]}]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    overflow: 'hidden',
    zIndex: 1000,
    elevation: 1000,
  },
  bar: {
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.secondary,
  },
});
