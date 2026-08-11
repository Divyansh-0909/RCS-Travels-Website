import { useEffect } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import {
  CheckCircleIcon,
  ClockIcon,
  ShieldCheckIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
  XCircleIcon,
} from 'phosphor-react-native';
import { useNavigate } from 'react-router-native';
import AppText from '../components/AppText';
import { useDriver } from '../hooks/useDriver';
import { openSupportWhatsApp } from '../constants/support';

// Where a captain lands whenever he cannot drive yet.
//
// One screen with six faces rather than six screens, because the difference
// between them is a sentence and a button — and because the state changes under
// him: he arrives here on `scanning`, and thirty seconds later the same screen
// has to become `pending` without him navigating anywhere.
//
// The thing this screen is really for is answering "is anyone actually doing
// something about this". A captain who has uploaded eight documents and sees a
// spinner assumes he has been forgotten. Every state below therefore says what
// is happening, who it is waiting on, and what he can do — even when the honest
// answer to the last one is "nothing, we'll message you".

const CARD = '#f3f3f3';
const INK = 'text-[var(--background-primary)]';
const MUTED = 'text-gray-600';
const TITLE_TRACKING = { letterSpacing: -0.72 };

const PRIMARY = '#243AFB';
const AMBER = '#92400E';
const GREEN = '#15803D';
const RED = '#B91C1C';

type Face = {
  Icon: typeof ClockIcon;
  tone: string;
  title: string;
  body: string;
  action: 'documents' | 'support' | null;
  actionLabel?: string;
};

const FACES: Record<string, Face> = {
  notUploaded: {
    Icon: UploadSimpleIcon,
    tone: PRIMARY,
    title: 'Add your documents',
    body: 'We need your photo, your licence and the car’s papers before you can take rides. It takes about five minutes.',
    action: 'documents',
    actionLabel: 'Start',
  },
  uploading: {
    Icon: UploadSimpleIcon,
    tone: PRIMARY,
    title: 'Nearly there',
    body: 'A few documents are still missing. Add the rest and we’ll get them reviewed.',
    action: 'documents',
    actionLabel: 'Continue',
  },
  // Seconds, not days. Said plainly so he does not close the app thinking it has
  // hung, and so he does not ring the office about a machine check.
  scanning: {
    Icon: ShieldCheckIcon,
    tone: PRIMARY,
    title: 'Checking your documents',
    body: 'This usually takes a few seconds. You don’t need to do anything.',
    action: 'documents',
    actionLabel: 'See documents',
  },
  // The long one, and the only state where the honest answer is "wait". It says
  // who has it and that he will be told, because those are the two things that
  // stop a man refreshing a screen.
  pending: {
    Icon: ClockIcon,
    tone: AMBER,
    title: 'With the office',
    body: 'Your documents passed our checks and someone is reviewing them now. We’ll message you as soon as it’s done — you can close the app.',
    action: 'documents',
    actionLabel: 'See documents',
  },
  rejected: {
    Icon: XCircleIcon,
    tone: RED,
    title: 'Something needs fixing',
    body: 'One or more of your documents couldn’t be accepted. Open the list to see which, and what to change.',
    action: 'documents',
    actionLabel: 'Fix documents',
  },
  suspended: {
    Icon: WarningCircleIcon,
    tone: RED,
    title: 'Your account is on hold',
    body: 'You can’t take rides at the moment. Talk to the office and they’ll tell you what’s needed.',
    action: 'support',
    actionLabel: 'Contact the office',
  },
  inactive: {
    Icon: WarningCircleIcon,
    tone: RED,
    title: 'Your account is closed',
    body: 'This account can’t take rides. If you think that’s wrong, get in touch.',
    action: 'support',
    actionLabel: 'Contact the office',
  },
};

const OnboardingStatus = () => {
  const { profile, loading, refresh } = useDriver();
  const navigate = useNavigate();

  const blockedBy = profile?.onboarding?.blockedBy ?? 'notUploaded';
  const canDrive = profile?.onboarding?.canDrive ?? false;

  // The moment he is approved, this screen has no reason to exist. Sending him
  // on rather than leaving a "you're approved" page with a button is the point:
  // he came here because he wanted Home.
  useEffect(() => {
    if (canDrive) navigate('/', { replace: true });
  }, [canDrive, navigate]);

  // `scanning` is the one state that resolves on its own in seconds, so it is
  // the one state worth re-asking about while he watches. Everything else waits
  // on a human and is refreshed by the app coming back to the foreground
  // (DriverProvider) or by the push that follows the decision.
  useEffect(() => {
    if (blockedBy !== 'scanning') return;
    const timer = setTimeout(() => { refresh(); }, 4000);
    return () => clearTimeout(timer);
  }, [blockedBy, profile, refresh]);

  if (loading && !profile) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  const face = FACES[blockedBy] ?? FACES.notUploaded;
  const { Icon } = face;

  return (
    <ScrollView className="flex-1 bg-white" contentContainerStyle={{ padding: 20, gap: 16, flexGrow: 1, justifyContent: 'center' }}>
      <View className="items-center gap-4">
        <View
          className="w-16 h-16 rounded-2xl items-center justify-center"
          style={{ backgroundColor: CARD }}
        >
          <Icon size={30} weight="regular" color={face.tone} />
        </View>

        <AppText className={`text-2xl font-semibold text-center ${INK}`} style={TITLE_TRACKING}>
          {face.title}
        </AppText>

        <AppText className={`text-base text-center leading-6 ${MUTED}`}>
          {face.body}
        </AppText>

        {/* The office's own words, when there are any. A suspension with no
            stated reason is the thing a captain cannot argue with or act on. */}
        {blockedBy === 'suspended' && profile?.onboarding?.suspensionReason ? (
          <View className="w-full rounded-2xl p-4" style={{ backgroundColor: CARD }}>
            <AppText className={`text-sm ${MUTED}`}>
              {profile.onboarding.suspensionReason}
            </AppText>
          </View>
        ) : null}
      </View>

      {face.action ? (
        <Pressable
          role="button"
          onPress={() => {
            if (face.action === 'support') openSupportWhatsApp();
            else navigate('/account/documents');
          }}
          className="w-full rounded-xl py-4 items-center mt-2"
          style={({ pressed }) => ({ backgroundColor: PRIMARY, opacity: pressed ? 0.85 : 1 })}
        >
          <AppText className="font-semibold text-white">{face.actionLabel}</AppText>
        </Pressable>
      ) : null}

      {/* Always reachable, from every state. A captain who is stuck and cannot
          find a human is a captain who stops trying. */}
      {face.action !== 'support' ? (
        <Pressable
          role="button"
          onPress={() => openSupportWhatsApp()}
          className="w-full py-3 items-center"
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <AppText className={`text-sm ${MUTED}`}>Need help? Talk to the office</AppText>
        </Pressable>
      ) : null}

      {canDrive ? (
        <View className="items-center gap-2">
          <CheckCircleIcon size={22} weight="fill" color={GREEN} />
        </View>
      ) : null}
    </ScrollView>
  );
};

export default OnboardingStatus;
