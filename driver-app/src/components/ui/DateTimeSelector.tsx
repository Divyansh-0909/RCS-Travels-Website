import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { useLanguage } from '../../i18n';
import { driverCopy as dc } from '../../lib/copy';
import { useTheme } from '../../theme/ThemeContext';
import AppText from '../AppText';

export const MARKETPLACE_MIN_LEAD_MS = 30 * 60 * 1000;
export const MARKETPLACE_MAX_AHEAD_DAYS = 7;

const WHEEL_ROW_HEIGHT = 44;
const WHEEL_HEIGHT = WHEEL_ROW_HEIGHT * 4;
const WHEEL_PADDING = (WHEEL_HEIGHT - WHEEL_ROW_HEIGHT) / 2;
const FADE_HEIGHT = 60;

const HOURS = Array.from({ length: 12 }, (_, index) => String(index + 1));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));
const PERIODS = ['AM', 'PM'];

const COLUMN_FLEX = {
  day: 1.7,
  hour: 0.55,
  minute: 0.7,
  period: 0.8,
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
  align?: 'center' | 'flex-start';
};

type WheelItemProps = {
  item: string;
  selected: boolean;
  opacity: number;
  align: 'center' | 'flex-start';
  onPress: () => void;
};

const WheelItem = ({
  item,
  selected,
  opacity,
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
        opacity,
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
  align = 'center',
}: WheelColumnProps) => {
  const scrollRef = useRef<ScrollView>(null);
  const committedIndexRef = useRef(selectedIndex);
  const displayedIndexRef = useRef(selectedIndex);
  const latestOffsetRef = useRef(selectedIndex * WHEEL_ROW_HEIGHT);
  const isInteractingRef = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasPositionedRef = useRef(false);
  const [displayedIndex, setDisplayedIndex] = useState(selectedIndex);

  const scrollToIndex = useCallback((index: number, animated: boolean) => {
    scrollRef.current?.scrollTo({
      y: Math.max(0, Math.min(items.length - 1, index)) * WHEEL_ROW_HEIGHT,
      animated,
    });
  }, [items.length]);

  const clearSettleTimer = useCallback(() => {
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    committedIndexRef.current = selectedIndex;
    if (isInteractingRef.current || displayedIndexRef.current === selectedIndex) return;

    displayedIndexRef.current = selectedIndex;
    latestOffsetRef.current = selectedIndex * WHEEL_ROW_HEIGHT;
    setDisplayedIndex(selectedIndex);
    if (hasPositionedRef.current) scrollToIndex(selectedIndex, false);
  }, [scrollToIndex, selectedIndex]);

  useEffect(() => () => clearSettleTimer(), [clearSettleTimer]);

  const indexFromOffset = useCallback((offsetY: number) => (
    Math.max(
      0,
      Math.min(items.length - 1, Math.round(offsetY / WHEEL_ROW_HEIGHT)),
    )
  ), [items.length]);

  const displayFromOffset = useCallback((offsetY: number) => {
    latestOffsetRef.current = offsetY;
    const nextIndex = indexFromOffset(offsetY);
    if (nextIndex === displayedIndexRef.current) return;

    displayedIndexRef.current = nextIndex;
    setDisplayedIndex(nextIndex);
  }, [indexFromOffset]);

  const commitFromOffset = useCallback((offsetY: number) => {
    const nextIndex = Math.max(
      0,
      Math.min(items.length - 1, Math.round(offsetY / WHEEL_ROW_HEIGHT)),
    );
    displayedIndexRef.current = nextIndex;
    latestOffsetRef.current = nextIndex * WHEEL_ROW_HEIGHT;
    setDisplayedIndex(nextIndex);

    if (nextIndex !== committedIndexRef.current) {
      committedIndexRef.current = nextIndex;
      onSelect(nextIndex);
    }
  }, [items.length, onSelect]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    displayFromOffset(event.nativeEvent.contentOffset.y);
  }, [displayFromOffset]);

  const scheduleDragSettle = useCallback(() => {
    clearSettleTimer();
    settleTimerRef.current = setTimeout(() => {
      // Native snapToInterval already handles momentum settling. Only handle
      // the case where the user releases without momentum. Triggering another
      // animated scroll while native snapping is active makes the wheel fight
      // itself and bounce between two rows.
      if (isInteractingRef.current === false) return;
      isInteractingRef.current = false;
      const nextIndex = indexFromOffset(latestOffsetRef.current);
      scrollToIndex(nextIndex, false);
      commitFromOffset(nextIndex * WHEEL_ROW_HEIGHT);
    }, 220);
  }, [clearSettleTimer, commitFromOffset, indexFromOffset, scrollToIndex]);

  const handlePress = useCallback((index: number) => {
    clearSettleTimer();
    isInteractingRef.current = false;
    displayedIndexRef.current = index;
    latestOffsetRef.current = index * WHEEL_ROW_HEIGHT;
    setDisplayedIndex(index);
    if (index !== committedIndexRef.current) {
      committedIndexRef.current = index;
      onSelect(index);
    }
    scrollToIndex(index, true);
  }, [clearSettleTimer, onSelect, scrollToIndex]);

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={{ flex, height: WHEEL_HEIGHT, overflow: 'hidden' }}
    >
      <ScrollView
        ref={scrollRef}
        nestedScrollEnabled
        directionalLockEnabled
        bounces={false}
        decelerationRate="fast"
        snapToInterval={WHEEL_ROW_HEIGHT}
        snapToAlignment="start"
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => {
          clearSettleTimer();
          isInteractingRef.current = true;
        }}
        onScroll={handleScroll}
        onScrollEndDrag={scheduleDragSettle}
        onMomentumScrollBegin={() => {
          clearSettleTimer();
          isInteractingRef.current = true;
        }}
        onMomentumScrollEnd={(event) => {
          clearSettleTimer();
          isInteractingRef.current = false;
          commitFromOffset(event.nativeEvent.contentOffset.y);
        }}
        onContentSizeChange={() => {
          if (hasPositionedRef.current) return;
          hasPositionedRef.current = true;
          scrollToIndex(committedIndexRef.current, false);
        }}
        contentContainerStyle={{ paddingVertical: WHEEL_PADDING }}
      >
        {items.map((item, index) => {
          const distance = Math.abs(index - displayedIndex);
          return (
            <WheelItem
              key={`${item}-${index}`}
              item={item}
              selected={index === displayedIndex}
              opacity={distance === 0 ? 1 : distance === 1 ? 0.42 : 0.16}
              align={align}
              onPress={() => handlePress(index)}
            />
          );
        })}
      </ScrollView>
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
      <View className="overflow-hidden" style={{ backgroundColor: colors.surface }}>
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
            />
            <WheelColumn
              items={MINUTES}
              selectedIndex={minute}
              onSelect={(index) => update(value, hour24, index)}
              accessibilityLabel={dc('Min')}
              flex={COLUMN_FLEX.minute}
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

      </View>

      <AppText
        className="text-center text-sm tabular-nums text-ink-muted"
        style={tooSoon ? { color: '#B91C1C' } : undefined}
      >
        {tooSoon
          ? dc('Choose a pickup time at least 30 minutes from now.')
          : `${new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }).format(value)} · ${new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', hour12: true }).format(value)}`}
      </AppText>
    </View>
  );
};

export default DateTimeSelector;
