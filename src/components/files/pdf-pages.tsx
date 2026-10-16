import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  PixelRatio,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type ViewToken,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type PageSize, pdfPageSizes, renderPdfPage } from '@/lib/pdf';

const MAX_ZOOM = 3;
const DOUBLE_TAP_ZOOM = 2;
/** Space around pages at zoom 1; it scales with the pages so offsets scale exactly. */
const GAP = Spacing.two;
/** Longest the native module draws a page, matching its own cap. */
const MAX_RENDER_PX = 4096;
/** Waits before drawing a page that just came into view, so a fast fling doesn't queue them all. */
const RENDER_DELAY_MS = 80;
const VIEWABILITY = { itemVisiblePercentThreshold: 10 };

const clamp = (value: number, min: number, max: number) => {
  'worklet';
  return Math.min(Math.max(value, min), max);
};

type PdfPagesProps = {
  /** file:// URI of the PDF in the app cache. */
  uri: string;
  onError: (e: unknown) => void;
};

/**
 * The pages of a local PDF in a vertical list, with pinch and double-tap zoom. Zoom lays the
 * pages out wider (scrolling sideways too) rather than scaling a picture, so text gets redrawn
 * sharp at up to three times the screen's resolution. While pinching, the view scales live and
 * the new layout takes over when the fingers lift.
 */
export function PdfPages({ uri, onError }: PdfPagesProps) {
  const theme = useTheme();
  const [sizes, setSizes] = useState<PageSize[] | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(0);

  const hScroll = useRef<ScrollView>(null);
  const list = useRef<FlatList<PageSize>>(null);

  const scrollX = useSharedValue(0);
  const scrollY = useSharedValue(0);
  /** Scroll position to restore once the layout for a new zoom is in place, per axis. */
  const pending = useSharedValue<{ x: number | null; y: number | null } | null>(null);
  const scale = useSharedValue(1);
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const zoomValue = useSharedValue(1);

  useEffect(() => {
    let live = true;
    pdfPageSizes(uri).then(
      (s) => live && setSizes(s),
      (e) => live && onError(e),
    );
    return () => {
      live = false;
    };
  }, [uri, onError]);

  useEffect(() => {
    zoomValue.set(zoom);
  }, [zoom, zoomValue]);

  /** Drops the live pinch scale once both axes are back in place. */
  const settle = (axis: 'x' | 'y' | 'both') => {
    const p = pending.get();
    if (!p) return;
    const next = { x: axis === 'y' ? p.x : null, y: axis === 'x' ? p.y : null };
    if (next.x === null && next.y === null) {
      pending.set(null);
      scale.set(1);
    } else {
      pending.set(next);
    }
  };

  /** Applies a zoom by `factor` around (fx, fy) in the viewport. */
  const commit = (factor: number, fx: number, fy: number) => {
    const next = clamp(zoom * factor, 1, MAX_ZOOM);
    const ratio = next / zoom;
    if (Math.abs(ratio - 1) < 0.01) {
      scale.set(1);
      return;
    }
    pending.set({
      x: Math.max(0, (scrollX.get() + fx) * ratio - fx),
      y: Math.max(0, (scrollY.get() + fy) * ratio - fy),
    });
    setZoom(next);
    // In case a size-change callback never comes, don't leave the view scaled.
    setTimeout(() => settle('both'), 500);
  };

  const toggleZoom = (x: number, y: number) => {
    commit((zoom > 1 ? 1 : DOUBLE_TAP_ZOOM) / zoom, x, y);
  };

  // Pinching may start while a finger is already scrolling the pages.
  const hNative = Gesture.Native();
  const listNative = Gesture.Native();
  const pinch = Gesture.Pinch()
    .simultaneousWithExternalGesture(hNative, listNative)
    .onStart((e) => {
      originX.value = e.focalX;
      originY.value = e.focalY;
    })
    .onUpdate((e) => {
      scale.value = clamp(e.scale, 1 / zoomValue.value, MAX_ZOOM / zoomValue.value);
    })
    .onEnd(() => {
      scheduleOnRN(commit, scale.value, originX.value, originY.value);
    });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      scheduleOnRN(toggleZoom, e.x, e.y);
    });

  const liveZoom = useAnimatedStyle(() => ({
    transformOrigin: [originX.value, originY.value, 0],
    transform: [{ scale: scale.value }],
  }));

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setViewport({ width, height });
  };

  // FlatList rejects a new callback after the first render, so this one must stay the same.
  const onViewable = useCallback(({ viewableItems }: { viewableItems: ViewToken<PageSize>[] }) => {
    const first = viewableItems[0]?.index;
    if (first != null) setPage(first);
  }, []);

  if (!sizes || viewport.width === 0) {
    return (
      <View style={styles.center} onLayout={onLayout}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  const gap = GAP * zoom;
  const contentWidth = viewport.width * zoom;
  const pageWidth = (viewport.width - 2 * GAP) * zoom;
  // Redraw at 1x, 2x or 3x the screen's pixels as the zoom grows, not on every small pinch.
  const level = clamp(Math.ceil(zoom - 0.25), 1, MAX_ZOOM);
  const renderWidth = Math.min(
    Math.round((viewport.width - 2 * GAP) * PixelRatio.get() * level),
    MAX_RENDER_PX,
  );
  const rowHeights = sizes.map((s) => gap + (pageWidth * s.height) / s.width);
  const rowOffsets: number[] = [];
  rowHeights.reduce((sum, h, i) => {
    rowOffsets[i] = sum;
    return sum + h;
  }, 0);

  return (
    <View style={[styles.root, { backgroundColor: theme.surfaceSecondary }]} onLayout={onLayout}>
      <GestureDetector gesture={Gesture.Simultaneous(pinch, doubleTap)}>
        <Animated.View style={[styles.fill, liveZoom]}>
          <GestureDetector gesture={hNative}>
            <ScrollView
              ref={hScroll}
              horizontal
              scrollEnabled={zoom > 1}
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={(e) => scrollX.set(e.nativeEvent.contentOffset.x)}
              onContentSizeChange={() => {
                const x = pending.get()?.x;
                if (x == null) return;
                hScroll.current?.scrollTo({ x, animated: false });
                scrollX.set(x);
                settle('x');
              }}>
              <GestureDetector gesture={listNative}>
                <FlatList
                  ref={list}
                  data={sizes}
                  style={{ width: contentWidth }}
                  keyExtractor={(_, i) => String(i)}
                  getItemLayout={(_, i) => ({
                    length: rowHeights[i],
                    offset: rowOffsets[i],
                    index: i,
                  })}
                  contentContainerStyle={{ paddingBottom: gap }}
                  windowSize={5}
                  initialNumToRender={2}
                  maxToRenderPerBatch={2}
                  scrollEventThrottle={16}
                  onScroll={(e) => scrollY.set(e.nativeEvent.contentOffset.y)}
                  onContentSizeChange={() => {
                    const y = pending.get()?.y;
                    if (y == null) return;
                    list.current?.scrollToOffset({ offset: y, animated: false });
                    scrollY.set(y);
                    settle('y');
                  }}
                  onViewableItemsChanged={onViewable}
                  viewabilityConfig={VIEWABILITY}
                  renderItem={({ index }) => (
                    <View style={{ paddingTop: gap, paddingHorizontal: gap }}>
                      <PdfPage
                        uri={uri}
                        index={index}
                        width={pageWidth}
                        height={rowHeights[index] - gap}
                        renderWidth={renderWidth}
                      />
                    </View>
                  )}
                />
              </GestureDetector>
            </ScrollView>
          </GestureDetector>
        </Animated.View>
      </GestureDetector>
      {sizes.length > 1 ? (
        <ThemedText type="caption" style={styles.counter}>
          {page + 1} / {sizes.length}
        </ThemedText>
      ) : null}
    </View>
  );
}

type PdfPageProps = {
  uri: string;
  index: number;
  width: number;
  height: number;
  renderWidth: number;
};

/** One page; keeps showing the last drawing while a sharper one for a new zoom is made. */
function PdfPage({ uri, index, width, height, renderWidth }: PdfPageProps) {
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      renderPdfPage(uri, index, renderWidth).then(
        (path) => live && setImage(path),
        // Leave a page that fails to draw blank; the rest of the file still reads.
        () => {},
      );
    }, RENDER_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [uri, index, renderWidth]);

  return (
    <View style={[styles.page, { width, height }]}>
      {image ? (
        <Image
          source={{ uri: image }}
          style={styles.fill}
          contentFit="fill"
          cachePolicy="memory"
          accessibilityIgnoresInvertColors
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Pages stay white in dark mode, like paper.
  page: { backgroundColor: '#ffffff' },
  counter: {
    position: 'absolute',
    bottom: Spacing.five,
    alignSelf: 'center',
    color: '#ffffff',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: 8,
  },
});
