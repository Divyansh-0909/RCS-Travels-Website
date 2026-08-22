import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { CameraIcon, FilePdfIcon, ImageIcon, XIcon } from 'phosphor-react-native';
import AppText from '../AppText';

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

const INK = 'text-[var(--background-primary)]';
const MUTED = 'text-gray-600';
const ICON = '#121220';

export type DocumentSource = 'camera' | 'library' | 'pdf';

type OptionProps = {
  Icon: typeof CameraIcon;
  label: string;
  onPress: () => void;
};

const Option = ({ Icon, label, onPress }: OptionProps) => {
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
      className="w-full flex-row items-center gap-3 rounded-xl px-3.5 py-3.5"
      style={{
        backgroundColor: WELL,
        opacity: pressed ? 0.7 : 1,
      }}
    >
      <Icon size={22} weight="regular" color={ICON} />
      <AppText className={`font-semibold ${INK}`}>{label}</AppText>
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
  const [closePressed, setClosePressed] = useState(false);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      {/* The scrim dismisses too. The cross is small and in the far corner, which
          is the wrong end of the screen from a thumb — tapping away from the sheet
          is how most people will actually leave it. */}
      <Pressable className="flex-1 justify-end" style={{ backgroundColor: SCRIM }} onPress={onCancel}>
        {/* Swallows the tap, so pressing the sheet itself does not close it. */}
        <Pressable className="bg-white rounded-t-3xl px-5 pt-5 pb-8 gap-4" onPress={() => {}}>
          {/* The way out, level with the title rather than under the options.
              A full-width Cancel at the foot is a fourth thing the eye has to rule
              out before it can choose one of the three above it; up here it is
              chrome, and the three rows are the only choices on the sheet.

              items-start, so a label that wraps to two lines pushes the cross down
              with the top of the block instead of centring it against both. */}
          <View className="flex-row items-start gap-3">
            <View className="flex-1 gap-1">
              <AppText className={`text-lg font-semibold ${INK}`}>{label}</AppText>
              <AppText className={`text-sm ${MUTED}`}>How would you like to add this?</AppText>
            </View>

            <Pressable
              role="button"
              aria-label="Close"
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
              <XIcon size={16} weight="bold" color={ICON} />
            </Pressable>
          </View>

          <View className="gap-2">
            <Option Icon={CameraIcon} label="Take a photo" onPress={() => onPick('camera')} />
            <Option Icon={ImageIcon} label="Choose a photo" onPress={() => onPick('library')} />
            {allowPdf ? (
              <Option Icon={FilePdfIcon} label="Choose a PDF" onPress={() => onPick('pdf')} />
            ) : null}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

export default DocumentSourceSheet;
