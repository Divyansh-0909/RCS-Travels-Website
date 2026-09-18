import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import { TrashIcon, XIcon } from 'phosphor-react-native';
import { useLanguage as useCopyLanguage } from '../../i18n';
import { useBottomSheetMotion } from '../../hooks/useBottomSheetMotion';
import { driverCopy as dc } from '../../lib/copy';
import { useTheme } from '../../theme/ThemeContext';
import AppText from '../AppText';
import Button from './Button';
import { sheetSurfaceStyle } from './sheetSurfaceStyle';

const SCRIM = 'rgba(18,18,32,0.45)';
const DANGER_WELL = 'rgba(185,28,28,0.08)';
const NEUTRAL_WELL = 'rgba(18,18,32,0.04)';

type Props = {
  visible: boolean;
  busy: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

const DeleteAccountSheet = ({ visible, busy, error, onCancel, onConfirm }: Props) => {
  useCopyLanguage();
  const { colors } = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const [closePressed, setClosePressed] = useState(false);
  const { mounted, scrimStyle, sheetStyle } = useBottomSheetMotion(
    visible,
    Math.max(windowHeight * 0.55, 420),
  );

  useEffect(() => setClosePressed(false), [visible]);

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={() => { if (!busy) onCancel(); }}
    >
      <View className="flex-1 justify-end">
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, { backgroundColor: SCRIM }, scrimStyle]}
        />
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={() => { if (!busy) onCancel(); }}
        />
        <Animated.View style={sheetStyle}>
          <Pressable
          className="rounded-t-3xl bg-surface px-5 pt-5 pb-8 gap-5"
          style={sheetSurfaceStyle}
          onPress={() => {}}
          >
          <View className="flex-row items-start gap-3">
            <View
              className="shrink-0 items-center justify-center rounded-xl"
              style={{ width: 44, height: 44, backgroundColor: DANGER_WELL }}
            >
              <TrashIcon size={22} weight="regular" color={colors.negative} />
            </View>

            <View className="flex-1 gap-1 pt-0.5">
              <AppText className="text-lg font-semibold text-ink">
                {dc('Delete captain account?')}
              </AppText>
              <AppText className="text-sm text-ink-muted">
                {dc('This permanently removes access to your RCS Captains account and deletes or anonymizes your account details. Some ride, payment, safety and legal records may be kept where required.')}
              </AppText>
            </View>

            <Pressable
              role="button"
              aria-label={dc('Close')}
              hitSlop={10}
              disabled={busy}
              onPress={onCancel}
              onPressIn={() => setClosePressed(true)}
              onPressOut={() => setClosePressed(false)}
              className="items-center justify-center rounded-full"
              style={{
                width: 32,
                height: 32,
                backgroundColor: NEUTRAL_WELL,
                opacity: busy ? 0.35 : closePressed ? 0.6 : 1,
              }}
            >
              <XIcon size={16} weight="bold" color={colors.ink} />
            </Pressable>
          </View>

          <View className="rounded-2xl bg-surface-raised px-4 py-3">
            <AppText className="text-sm text-ink">
              {dc('Before you continue, please confirm that you understand:')}
            </AppText>
            <View className="mt-2 gap-1">
              <AppText className="text-sm text-ink-muted">
                • {dc('Your captain account access will be permanently removed.')}
              </AppText>
              <AppText className="text-sm text-ink-muted">
                • {dc('Your personal details will be deleted or anonymized where applicable.')}
              </AppText>
              <AppText className="text-sm text-ink-muted">
                • {dc('Some ride, payment, safety and legal records may be retained when required.')}
              </AppText>
              <AppText className="text-sm text-ink-muted">
                • {dc('You cannot delete your account while you have an active ride.')}
              </AppText>
            </View>
          </View>

          {error ? (
            <View className="rounded-2xl px-4 py-3" style={{ backgroundColor: DANGER_WELL }}>
              <AppText className="text-sm text-[#B91C1C]">{error}</AppText>
            </View>
          ) : null}

          <View className="gap-2">
            <Button prop={{ variant: 'negative', disabled: busy }} onPress={onConfirm}>
              {busy ? dc('Deleting account…') : dc('Delete account')}
            </Button>
            <Button prop={{ variant: 'secondary', disabled: busy }} onPress={onCancel}>
              {dc('Keep account')}
            </Button>
          </View>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
};

export default DeleteAccountSheet;
