import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useLanguage } from '../../i18n';
import { driverCopy as dc } from '../../lib/copy';
import { useTheme } from '../../theme/ThemeContext';
import AppText from '../AppText';

export const MARKETPLACE_MIN_LEAD_MS = 30 * 60 * 1000;
export const MARKETPLACE_MAX_AHEAD_DAYS = 7;

const WHEEL_ROW_HEIGHT = 44;
const WHEEL_HEIGHT = WHEEL_ROW_HEIGHT * 4;
const WHEEL_PADDING = (WHEEL_HEIGHT - WHEEL_ROW_HEIGHT) / 2;
const FADE_HEIGHT = 52;
const CYCLIC_COPY_COUNT = 5;
const CYCLIC_MIDDLE_COPY = Math.floor(CYCLIC_COPY_COUNT / 2);
const FLING_PROJECTION_MS = 100;
const MAX_FLING_ROWS = 4;

const HOURS = Array.from({ length: 12 }, (_, index) => String(index + 1));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));
const PERIODS = ['AM', 'PM'];

const SNAP_SPRING = {
  duration: 400,
  dampingRatio: 1,
  overshootClamping: true,
  reduceMotion: ReduceMotion.System,
} as const;

const COLUMN_FLEX = {
  day: 1.7,
  hour: 0.62,
  minute: 0.72,
  period: 0.86,
} as const;

export const getDefaultScheduledAt = (now = new Date()) => {
  const interval = 15 * 60 * 1000;
  return new Date(Math.ceil((now.getTime() + MARKETPLACE_MIN_LEAD_MS) / interval) * interval);
};

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const isSameDay = (first: Date, second: Date) => (
  first.getFullYear() === second.getFullYear()
  && first.getMonth() === second.getMonth()
  && first.getDate() === second.getDate()
);

const transparent = (hex: string) => {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  if (!match) return 'rgba(255,255,255,0)';
  return `rgba(${Number.parseInt(match[1], 16)},${Number.parseInt(match[2], 16)},${Number.parseInt(match[3], 16)},0)`;
};

type WheelColumnProps = {
  items: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  accessibilityLabel: string;
  flex: number;
  cyclic?: boolean;
  align?: 'center' | 'flex-start';
};

type WheelItemProps = {
  item: string;
  selected: boolean;
  align: 'center' | 'flex-start';
  onPress: () => void;
};

const WheelItem = ({
  item,
  selected,
  align,
  onPress,
}: WheelItemProps) => {
  return (
    <View
      style={{
        height: WHEEL_ROW_HEIGHT,
        justifyContent: 'center',
        alignItems: align,
        paddingHorizontal: align === 'flex-start' ? 12 : 4,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={onPress}
        hitSlop={4}
        style={{
          minHeight: WHEEL_ROW_HEIGHT,
          alignSelf: 'stretch',
          justifyContent: 'center',
          alignItems: align,
        }}
      >
        <AppText
          numberOfLines={1}
          className={`text-base tabular-nums ${selected ? 'font-semibold text-ink' : 'font-medium text-ink-muted'}`}
        >
          {item}
        </AppText>
      </Pressable>
    </View>
  );
};

const WheelColumn = ({
  items,
  selectedIndex,
  onSelect,
  accessibilityLabel,
  flex,
  cyclic = false,
  align = 'center',
}: WheelColumnProps) => {
  const selectedIndexRef = useRef(selectedIndex);
  const skipNextSelectedSync = useRef<number | null>(null);
  const renderedItems = useMemo(
    () => cyclic
      ? Array.from({ length: items.length * CYCLIC_COPY_COUNT }, (_, index) => items[index % items.length])
      : items,
    [cyclic, items],
  );
  const middleCopyOffset = cyclic ? items.length * CYCLIC_MIDDLE_COPY : 0;
  const selectedRenderedIndex = middleCopyOffset + selectedIndex;
  const minTranslateY = WHEEL_PADDING - (renderedItems.length - 1) * WHEEL_ROW_HEIGHT;
  const maxTranslateY = WHEEL_PADDING;

  const translateY = useSharedValue(WHEEL_PADDING - selectedRenderedIndex * WHEEL_ROW_HEIGHT);
  const dragStartY = useSharedValue(translateY.get());
  selectedIndexRef.current = selectedIndex;

  useEffect(() => {
    if (skipNextSelectedSync.current === selectedIndex) {
      skipNextSelectedSync.current = null;
      return;
    }

    cancelAnimation(translateY);
    translateY.set(WHEEL_PADDING - selectedRenderedIndex * WHEEL_ROW_HEIGHT);
  }, [selectedIndex, selectedRenderedIndex, translateY]);

  const commitRenderedIndex = useCallback((renderedIndex: number) => {
    const nextIndex = cyclic ? renderedIndex % items.length : renderedIndex;

    if (nextIndex === selectedIndexRef.current) return;

    selectedIndexRef.current = nextIndex;
    skipNextSelectedSync.current = nextIndex;
    onSelect(nextIndex);
  }, [cyclic, items.length, onSelect]);

  const animateToRenderedIndex = useCallback((renderedIndex: number) => {
    const boundedRenderedIndex = Math.max(0, Math.min(renderedItems.length - 1, renderedIndex));
    const logicalIndex = cyclic ? boundedRenderedIndex % items.length : boundedRenderedIndex;
    const targetY = WHEEL_PADDING - boundedRenderedIndex * WHEEL_ROW_HEIGHT;
    const recenteredY = WHEEL_PADDING - (middleCopyOffset + logicalIndex) * WHEEL_ROW_HEIGHT;

    cancelAnimation(translateY);
    commitRenderedIndex(boundedRenderedIndex);
    translateY.set(withSpring(targetY, SNAP_SPRING, (finished) => {
      if (finished && cyclic) {
        translateY.set(recenteredY);
      }
    }));
  }, [commitRenderedIndex, cyclic, items.length, middleCopyOffset, renderedItems.length, translateY]);

  const panGesture = useMemo(() => Gesture.Pan()
    .activeOffsetY([-4, 4])
    .failOffsetX([-20, 20])
    .onBegin(() => {
      cancelAnimation(translateY);
      dragStartY.set(translateY.get());
    })
    .onUpdate((event) => {
      let nextY = dragStartY.get() + event.translationY;

      if (nextY > maxTranslateY) {
        nextY = maxTranslateY + Math.min((nextY - maxTranslateY) * 0.35, 24);
      } else if (nextY < minTranslateY) {
        nextY = minTranslateY - Math.min((minTranslateY - nextY) * 0.35, 24);
      }

      translateY.set(nextY);
    })
    .onEnd((event) => {
      const currentIndex = (WHEEL_PADDING - translateY.get()) / WHEEL_ROW_HEIGHT;
      const projectedRows = -(event.velocityY * (FLING_PROJECTION_MS / 1000)) / WHEEL_ROW_HEIGHT;
      const limitedRows = Math.max(-MAX_FLING_ROWS, Math.min(MAX_FLING_ROWS, projectedRows));
      const targetRenderedIndex = Math.max(
        0,
        Math.min(renderedItems.length - 1, Math.round(currentIndex + limitedRows)),
      );
      const logicalIndex = cyclic ? targetRenderedIndex % items.length : targetRenderedIndex;
      const targetY = WHEEL_PADDING - targetRenderedIndex * WHEEL_ROW_HEIGHT;
      const recenteredY = WHEEL_PADDING - (middleCopyOffset + logicalIndex) * WHEEL_ROW_HEIGHT;

      scheduleOnRN(commitRenderedIndex, targetRenderedIndex);
      translateY.set(withSpring(targetY, {
        ...SNAP_SPRING,
        velocity: event.velocityY,
      }, (finished) => {
        if (finished && cyclic) {
          translateY.set(recenteredY);
        }
      }));
    }), [
    commitRenderedIndex,
    cyclic,
    dragStartY,
    items.length,
    maxTranslateY,
    middleCopyOffset,
    minTranslateY,
    renderedItems.length,
    translateY,
  ]);

  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.get() }],
  }));

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={{ flex, height: WHEEL_HEIGHT, overflow: 'hidden' }}
    >
      <GestureDetector gesture={panGesture}>
        <Animated.View style={trackStyle}>
          {renderedItems.map((item, renderedIndex) => {
            const itemIndex = cyclic ? renderedIndex % items.length : renderedIndex;

            return (
              <WheelItem
                key={`${item}-${renderedIndex}`}
                item={item}
                selected={itemIndex === selectedIndex}
                align={align}
                onPress={() => animateToRenderedIndex(renderedIndex)}
              />
            );
          })}
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

const PickerTag = ({ label, flex }: { label: string; flex: number }) => {
  const { colors } = useTheme();
  return (
    <View style={{ flex, alignItems: 'center' }}>
      <View className="rounded-full px-2 py-1" style={{ backgroundColor: colors.surfaceMuted }}>
        <AppText className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
          {label}
        </AppText>
      </View>
    </View>
  );
};

const DateTimeSelector = ({ value, onChange }: { value: Date; onChange: (value: Date) => void }) => {
  const { colors } = useTheme();
  const { language } = useLanguage();
  const locale = language === 'hi' ? 'hi-IN' : 'en-IN';

  const days = useMemo(() => Array.from({ length: 7 }, (_, offset) => {
    const day = startOfDay(new Date());
    day.setDate(day.getDate() + offset);
    return day;
  }), []);

  const update = (day: Date, hour: number, minute: number) => {
    const next = new Date(day);
    next.setHours(hour, minute, 0, 0);
    onChange(next);
  };

  const selectedDayIndex = Math.max(0, days.findIndex((day) => isSameDay(day, value)));
  const hour24 = value.getHours();
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  const minute = value.getMinutes();
  const tooSoon = value.getTime() < Date.now() + MARKETPLACE_MIN_LEAD_MS;
  const fadedSurface = transparent(colors.surface);

  const dayLabels = days.map((day, index) => (
    index === 0
      ? dc('Today')
      : new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(day)
  ));

  return (
    <View className="gap-3">
      <View className="overflow-hidden rounded-2xl" style={{ backgroundColor: colors.surface }}>
        <View style={{ height: WHEEL_HEIGHT, position: 'relative', overflow: 'hidden' }}>
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: WHEEL_PADDING,
              height: WHEEL_ROW_HEIGHT,
              borderRadius: 12,
              backgroundColor: colors.surfaceMuted,
              zIndex: 0,
            }}
          />

          <View className="relative z-10 flex-row gap-0.5">
            <WheelColumn
              items={dayLabels}
              selectedIndex={selectedDayIndex}
              onSelect={(index) => update(days[index], hour24, minute)}
              accessibilityLabel={dc('Day')}
              flex={COLUMN_FLEX.day}
              align="flex-start"
            />
            <WheelColumn
              items={HOURS}
              selectedIndex={hour12 - 1}
              onSelect={(index) => update(value, ((index + 1) % 12) + (period === 'PM' ? 12 : 0), minute)}
              accessibilityLabel={dc('Hour')}
              flex={COLUMN_FLEX.hour}
              cyclic
            />
            <WheelColumn
              items={MINUTES}
              selectedIndex={minute}
              onSelect={(index) => update(value, hour24, index)}
              accessibilityLabel={dc('Min')}
              flex={COLUMN_FLEX.minute}
              cyclic
            />
            <WheelColumn
              items={PERIODS}
              selectedIndex={period === 'PM' ? 1 : 0}
              onSelect={(index) => update(value, (hour12 % 12) + (index === 1 ? 12 : 0), minute)}
              accessibilityLabel="AM/PM"
              flex={COLUMN_FLEX.period}
            />
          </View>

          <LinearGradient
            pointerEvents="none"
            colors={[colors.surface, fadedSurface]}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: FADE_HEIGHT,
              zIndex: 20,
            }}
          />
          <LinearGradient
            pointerEvents="none"
            colors={[fadedSurface, colors.surface]}
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: FADE_HEIGHT,
              zIndex: 20,
            }}
          />
        </View>

        <View className="relative z-30 flex-row gap-0.5 pt-2 pb-1.5">
          <PickerTag label={dc('Day')} flex={COLUMN_FLEX.day} />
          <PickerTag label={dc('Hour')} flex={COLUMN_FLEX.hour} />
          <PickerTag label={dc('Min')} flex={COLUMN_FLEX.minute} />
          <PickerTag label="AM/PM" flex={COLUMN_FLEX.period} />
        </View>
      </View>

      <AppText
        className="text-center text-xs tabular-nums text-ink-muted"
        style={tooSoon ? { color: '#B91C1C' } : undefined}
      >
        {tooSoon
          ? dc('Choose a pickup time at least 30 minutes from now.')
          : new Intl.DateTimeFormat(locale, {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: 'numeric',
            minute: '2-digit',
          }).format(value)}
      </AppText>
    </View>
  );
};

export default DateTimeSelector;
