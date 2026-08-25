import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { Modal, Pressable, View } from 'react-native';
import {
  BellIcon,
  CameraIcon,
  ImageIcon,
  MapPinIcon,
  NavigationArrowIcon,
  XIcon,
  type IconProps,
} from 'phosphor-react-native';
import AppText from '../AppText';

/**
 * The app-owned half of a permission request.
 *
 * Android and iOS own the final permission dialog (and Android owns the
 * display-over-other-apps settings page), so those screens cannot carry our
 * type, spacing, or colours. This sheet is the explanation immediately before
 * them: one consistent, honest place to say what is being requested and why.
 * Its shell deliberately matches DocumentSourceSheet, which is already the
 * captain app's established presentation for choosing camera or gallery.
 */

const SCRIM = 'rgba(18,18,32,0.45)';
const WELL = 'rgba(18,18,32,0.04)';
const INK = '#121220';
const PRIMARY = '#243AFB';

export type PermissionPromptKind =
  | 'camera'
  | 'photos'
  | 'location'
  | 'background-location'
  | 'notifications'
  | 'overlay';

export type PermissionPromptRequest = {
  kind: PermissionPromptKind;
  title: string;
  message: string;
  actionLabel: string;
  cancelLabel?: string;
};

type QueuedPrompt = PermissionPromptRequest & {
  resolve: (accepted: boolean) => void;
};

type Prompt = (request: PermissionPromptRequest) => Promise<boolean>;

const PermissionPromptContext = createContext<Prompt | null>(null);

// Imperative callers are limited to plain library functions (document capture
// and external navigation), where a React hook cannot be used. The presenter is
// installed by the provider high in the app tree and every user-triggered call
// happens after that provider has mounted.
let mountedPrompt: Prompt | null = null;

export const showPermissionPrompt: Prompt = (request) =>
  mountedPrompt ? mountedPrompt(request) : Promise.resolve(false);

const iconFor = (kind: PermissionPromptKind): ComponentType<IconProps> => {
  if (kind === 'camera') return CameraIcon;
  if (kind === 'photos') return ImageIcon;
  if (kind === 'notifications') return BellIcon;
  if (kind === 'overlay') return NavigationArrowIcon;
  return MapPinIcon;
};

const PermissionSheet = ({
  prompt,
  onAnswer,
}: {
  prompt: QueuedPrompt | null;
  onAnswer: (accepted: boolean) => void;
}) => {
  const [closePressed, setClosePressed] = useState(false);
  const [actionPressed, setActionPressed] = useState(false);
  const [cancelPressed, setCancelPressed] = useState(false);
  const Icon = prompt ? iconFor(prompt.kind) : MapPinIcon;

  useEffect(() => {
    setClosePressed(false);
    setActionPressed(false);
    setCancelPressed(false);
  }, [prompt]);

  return (
    <Modal
      visible={Boolean(prompt)}
      transparent
      animationType="fade"
      onRequestClose={() => onAnswer(false)}
    >
      <Pressable
        className="flex-1 justify-end"
        style={{ backgroundColor: SCRIM }}
        onPress={() => onAnswer(false)}
      >
        <Pressable
          className="rounded-t-3xl bg-white px-5 pt-5 pb-8 gap-5"
          onPress={() => {}}
        >
          <View className="flex-row items-start gap-3">
            <View
              className="shrink-0 items-center justify-center rounded-xl"
              style={{ width: 44, height: 44, backgroundColor: WELL }}
            >
              <Icon size={23} weight="regular" color={INK} />
            </View>

            <View className="flex-1 gap-1 pt-0.5">
              <AppText className="text-lg font-semibold text-[var(--background-primary)]">
                {prompt?.title ?? ''}
              </AppText>
              <AppText className="text-sm text-gray-600">
                {prompt?.message ?? ''}
              </AppText>
            </View>

            <Pressable
              role="button"
              aria-label="Close"
              hitSlop={10}
              onPress={() => onAnswer(false)}
              onPressIn={() => setClosePressed(true)}
              onPressOut={() => setClosePressed(false)}
              className="items-center justify-center rounded-full"
              style={{
                width: 32,
                height: 32,
                backgroundColor: WELL,
                opacity: closePressed ? 0.6 : 1,
              }}
            >
              <XIcon size={16} weight="bold" color={INK} />
            </Pressable>
          </View>

          <View className="gap-2">
            <Pressable
              role="button"
              onPress={() => onAnswer(true)}
              onPressIn={() => setActionPressed(true)}
              onPressOut={() => setActionPressed(false)}
              className="w-full items-center justify-center rounded-xl px-4 py-3.5"
              style={{ backgroundColor: PRIMARY, opacity: actionPressed ? 0.8 : 1 }}
            >
              <AppText className="text-base font-semibold text-white">
                {prompt?.actionLabel ?? ''}
              </AppText>
            </Pressable>

            <Pressable
              role="button"
              onPress={() => onAnswer(false)}
              onPressIn={() => setCancelPressed(true)}
              onPressOut={() => setCancelPressed(false)}
              className="w-full items-center justify-center rounded-xl px-4 py-3"
              style={{ backgroundColor: WELL, opacity: cancelPressed ? 0.65 : 1 }}
            >
              <AppText className="text-base font-semibold text-[var(--background-primary)]">
                {prompt?.cancelLabel ?? 'Not now'}
              </AppText>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

export const PermissionPromptProvider = ({ children }: { children: ReactNode }) => {
  const [active, setActive] = useState<QueuedPrompt | null>(null);
  const activeRef = useRef<QueuedPrompt | null>(null);
  const queue = useRef<QueuedPrompt[]>([]);

  const present = useCallback<Prompt>((request) => new Promise<boolean>((resolve) => {
    const item = { ...request, resolve };

    if (activeRef.current) {
      queue.current.push(item);
      return;
    }

    activeRef.current = item;
    setActive(item);
  }), []);

  const answer = useCallback((accepted: boolean) => {
    const current = activeRef.current;
    if (!current) return;

    current.resolve(accepted);
    const next = queue.current.shift() ?? null;
    activeRef.current = next;
    setActive(next);
  }, []);

  useEffect(() => {
    mountedPrompt = present;

    return () => {
      if (mountedPrompt === present) mountedPrompt = null;
      activeRef.current?.resolve(false);
      queue.current.forEach((item) => item.resolve(false));
      queue.current = [];
    };
  }, [present]);

  const value = useMemo(() => present, [present]);

  return (
    <PermissionPromptContext.Provider value={value}>
      {children}
      <PermissionSheet prompt={active} onAnswer={answer} />
    </PermissionPromptContext.Provider>
  );
};

export const usePermissionPrompt = () => {
  const prompt = useContext(PermissionPromptContext);
  if (!prompt) throw new Error('usePermissionPrompt must be used inside <PermissionPromptProvider>');
  return prompt;
};
