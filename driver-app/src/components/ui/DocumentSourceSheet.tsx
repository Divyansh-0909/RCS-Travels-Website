import { useLanguage as useCopyLanguage } from "../../i18n";
import { driverCopy as dc } from "../../lib/copy";
import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { CameraIcon, CaretRightIcon, FilePdfIcon, ImageIcon, XIcon } from 'phosphor-react-native';
import AppText from '../AppText';
import { useTheme } from '../../theme/ThemeContext';

// Where the file is coming from: the camera, the gallery, or the files app.
//
// Was Alert.alert with three buttons. A native alert cannot be styled at all — it
// draws the platform's own dialog, in the platform's font, with the platform's
// button order, and on Android it stacked three unadorned blue words in the middle
// of the screen. Every other decision in this flow is asked for on a white sheet
// that rises from the bottom edge, so this one was the odd step out.
//
// Deliberately the same shell as DocumentDetailsSheet, which is the step straight
// after it: same scrim, same radius, same padding, same title-over-subtitle. The
// two are one sequence and a captain should not feel the seam between them.

const SCRIM = 'rgba(18,18,32,0.45)';
const WELL = 'rgba(18,18,32,0.03)';

const INK = 'text-ink';
const MUTED = 'text-ink-muted';

export type DocumentSource = 'camera' | 'library' | 'pdf';

type OptionProps = {
  Icon: typeof CameraIcon;
  label: string;
  onPress: () => void;
};

const Option = ({ Icon, label, onPress }: OptionProps) => {
    useCopyLanguage();
  const { colors } = useTheme();
  // Held rather than read from Pressable's style callback. This row carries a
  // className, and NativeWind merges an inline style into its own computation and
  // understands objects and arrays only — a function is collected, applied, and
  // yields nothing, so the fill would be dropped silently.
  // See the note at the top of ui/Button.
  const [pressed, setPressed] = useState(false);

  return (
    <Pressable
      role="button"
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      className="w-full flex-row items-center gap-3 rounded-2xl px-4 py-3.5"
      style={{
        backgroundColor: colors.strong,
        opacity: pressed ? 0.7 : 1,
      }}
    >
      <View
        className="h-12 w-12 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: colors.surfaceRaised }}
      >
        <Icon size={22} weight="regular" color={colors.ink} />
      </View>

      <AppText className="flex-1 text-base font-semibold" style={{ color: colors.onStrong }}>
        {label}
      </AppText>

      <CaretRightIcon size={20} weight="regular" color={colors.onStrong} />
    </Pressable>
  );
};

type Props = {
  visible: boolean;
  label: string;
  /** False for the three photographs, which the server refuses as a PDF at both gates. */
  allowPdf: boolean;
  onCancel: () => void;
  onPick: (source: DocumentSource) => void;
};

const DocumentSourceSheet = ({ visible, label, allowPdf, onCancel, onPick }: Props) => {
    useCopyLanguage();
  const { colors } = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const [closePressed, setClosePressed] = useState(false);
  const [mounted, setMounted] = useState(visible);
  const scrimOpacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const sheetY = useRef(new Animated.Value(visible ? 0 : windowHeight)).current;

  useEffect(() => {
    const hiddenY = Math.max(windowHeight * 0.55, 420);

    scrimOpacity.stopAnimation();
    sheetY.stopAnimation();

    if (visible) {
      if (!mounted) {
        scrimOpacity.setValue(0);
        sheetY.setValue(hiddenY);
        setMounted(true);
      }

      Animated.parallel([
        Animated.timing(scrimOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(sheetY, {
          toValue: 0,
          duration: 240,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    if (!mounted) return;

    Animated.parallel([
      Animated.timing(scrimOpacity, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(sheetY, {
        toValue: hiddenY,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [mounted, scrimOpacity, sheetY, visible, windowHeight]);

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onCancel}>
      {/* The scrim dismisses too. The cross is small and in the far corner, which
          is the wrong end of the screen from a thumb — tapping away from the sheet
          is how most people will actually leave it. */}
      <View className="flex-1 justify-end">
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, { backgroundColor: SCRIM, opacity: scrimOpacity }]}
        />
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onCancel} />
        {/* Swallows the tap, so pressing the sheet itself does not close it. */}
        <Animated.View style={{ transform: [{ translateY: sheetY }] }}>
          <Pressable className="bg-surface rounded-t-3xl px-5 pt-5 pb-8 gap-4" onPress={() => {}}>
          {/* The way out, level with the title rather than under the options.
              A full-width Cancel at the foot is a fourth thing the eye has to rule
              out before it can choose one of the three above it; up here it is
              chrome, and the three rows are the only choices on the sheet.

              items-start, so a label that wraps to two lines pushes the cross down
              with the top of the block instead of centring it against both. */}
          <View className="flex-row items-start gap-3">
            <View className="flex-1 gap-1">
              <AppText className={`text-lg font-semibold ${INK}`}>{label}</AppText>
              <AppText className={`text-sm ${MUTED}`}>{dc("How would you like to add this?")}</AppText>
            </View>

            <Pressable
              role="button"
              aria-label={dc("Close")}
              onPress={onCancel}
              onPressIn={() => setClosePressed(true)}
              onPressOut={() => setClosePressed(false)}
              // Size in POINTS, not w-8/h-8: the spacing scale is rem and
              // NativeWind's inlineRem is 14, so those classes would draw 28 while
              // reading as 32. And 32 is still under the 44 a thumb wants, which is
              // what hitSlop is buying — the sheet has no room for 44 of visible
              // circle beside a title, but the target can be that big unseen.
              hitSlop={10}
              className="rounded-full items-center justify-center"
              style={{
                width: 32,
                height: 32,
                backgroundColor: WELL,
                opacity: closePressed ? 0.6 : 1,
              }}
            >
              <XIcon size={16} weight="bold" color={colors.ink} />
            </Pressable>
          </View>

          <View className="gap-2">
            <Option Icon={CameraIcon} label={dc("Take a photo")} onPress={() => onPick('camera')} />
            <Option Icon={ImageIcon} label={dc("Choose a photo")} onPress={() => onPick('library')} />
            {allowPdf ? (
              <Option Icon={FilePdfIcon} label={dc("Choose a PDF")} onPress={() => onPick('pdf')} />
            ) : null}
          </View>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
};

export default DocumentSourceSheet;
