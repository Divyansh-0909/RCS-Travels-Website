import { useLanguage as useCopyLanguage } from "../i18n";
import { driverCopy as dc } from "../lib/copy";
import { useEffect } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import {
  ClockIcon,
  ShieldCheckIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
  XCircleIcon,
} from 'phosphor-react-native';
import { useNavigate } from 'react-router-native';
import { HomeGateSkeleton } from '../components/ui/LoadingSkeletons';
import AppText from '../components/AppText';
import Button from '../components/ui/Button';
import { useDriver } from '../hooks/useDriver';
import { openSupportWhatsApp } from '../constants/support';
import { useTheme } from '../theme/ThemeContext';

// Home, for a captain who cannot drive yet.
//
// Not a screen he is sent to — the one the Home tab opens, for as long as being
// approved is the only thing he is waiting on. HomeGate swaps the ride board in
// under him the moment that changes.
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

const INK = 'text-ink';
const MUTED = 'text-ink-muted';
const TITLE_TRACKING = { letterSpacing: -0.72 };

// Same clearance every other board inside the shell reserves. This screen centres
// its stack rather than scrolling it, so without this the stack centres on the
// full height and parks its last button behind the floating bar.
const BAR_CLEARANCE = 132;

// How wide the column is allowed to get. A cap, not a width — a 360px phone is
// narrower than this once the padding is off, and nothing about that screen
// should change.
const CONTENT_MAX = 320;

const PRIMARY = '#243AFB';
const AMBER = '#92400E';
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
    get "title"() { return dc("Add your documents"); },
    get "body"() { return dc("We need your photo, your licence and the car’s papers before you can take rides. It takes about five minutes."); },
    action: 'documents',
    get "actionLabel"() { return dc("Start"); },
  },
  uploading: {
    Icon: UploadSimpleIcon,
    tone: PRIMARY,
    get "title"() { return dc("Nearly there"); },
    get "body"() { return dc("A few documents are still missing. Add the rest and we’ll get them reviewed."); },
    action: 'documents',
    // Names the job, not the navigation. "Continue" describes what the app does
    // when tapped; this describes what he does when he gets there, in the same
    // words the sentence above just used.
    get "actionLabel"() { return dc("Add the rest"); },
  },
  // Seconds, not days. Said plainly so he does not close the app thinking it has
  // hung, and so he does not ring the office about a machine check.
  scanning: {
    Icon: ShieldCheckIcon,
    tone: PRIMARY,
    get "title"() { return dc("Checking your documents"); },
    get "body"() { return dc("This usually takes a few seconds. You don’t need to do anything."); },
    action: 'documents',
    get "actionLabel"() { return dc("See documents"); },
  },
  // The long one, and the only state where the honest answer is "wait". It says
  // who has it and that he will be told, because those are the two things that
  // stop a man refreshing a screen.
  pending: {
    Icon: ClockIcon,
    tone: AMBER,
    get "title"() { return dc("With the office"); },
    get "body"() { return dc("Your documents passed our checks and someone is reviewing them now. We’ll message you as soon as it’s done — you can close the app."); },
    action: 'documents',
    get "actionLabel"() { return dc("See documents"); },
  },
  rejected: {
    Icon: XCircleIcon,
    tone: RED,
    get "title"() { return dc("Something needs fixing"); },
    get "body"() { return dc("One or more of your documents couldn’t be accepted. Open the list to see which, and what to change."); },
    action: 'documents',
    get "actionLabel"() { return dc("Fix documents"); },
  },
  suspended: {
    Icon: WarningCircleIcon,
    tone: RED,
    get "title"() { return dc("Your account is on hold"); },
    get "body"() { return dc("You can’t take rides at the moment. Talk to the office and they’ll tell you what’s needed."); },
    action: 'support',
    get "actionLabel"() { return dc("Contact the office"); },
  },
  inactive: {
    Icon: WarningCircleIcon,
    tone: RED,
    get "title"() { return dc("Your account is closed"); },
    get "body"() { return dc("This account can’t take rides. If you think that’s wrong, get in touch."); },
    action: 'support',
    get "actionLabel"() { return dc("Contact the office"); },
  },
};

const OnboardingStatus = () => {
    useCopyLanguage();
    const { colors } = useTheme();
  const { profile, loading, refresh } = useDriver();
  const navigate = useNavigate();

  const blockedBy = profile?.onboarding?.blockedBy ?? 'notUploaded';
  const owedRides = profile?.onboarding?.assignedRides ?? 0;

  // No approved case to handle here any more. This screen only ever renders as
  // Home's unapproved face, so the moment canDrive flips, HomeGate stops
  // rendering it — there is nothing left for it to redirect away from.

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
    return <HomeGateSkeleton />;
  }

  const face = FACES[blockedBy] ?? FACES.notUploaded;
  const { Icon } = face;

  return (
    <ScrollView
      // w-full is load-bearing, not tidiness. The shell centres this with
      // alignItems: 'center', which leaves the scroller's width auto — and a child
      // asking for w-full inside an auto-width parent resolves its percentage
      // against nothing and comes out zero wide. The text blocks below size from
      // their own content and survive it; the button is w-full, and without this it
      // renders at zero width, which is to say invisibly.
      className="flex-1 w-full bg-canvas"
      contentContainerStyle={{
        padding: 20,
        paddingBottom: BAR_CLEARANCE,
        flexGrow: 1,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* The column, capped. Everything here is one short line of type over one
          button, and both read worse the wider they get: a sentence that runs the
          full width of a large phone is a sentence the eye has to track back
          across, and a button that wide stops looking like a thing to press.
          Below CONTENT_MAX the padding above still governs, so on a small phone
          this changes nothing. */}
      <View style={{ width: '100%', maxWidth: CONTENT_MAX, gap: 16 }}>
      <View className="items-center gap-4">
        <View
          className="w-16 h-16 rounded-2xl items-center justify-center"
          style={{ backgroundColor: colors.surfaceMuted }}
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
          <View className="w-full rounded-2xl p-4" style={{ backgroundColor: colors.surfaceMuted }}>
            <AppText className={`text-sm ${MUTED}`}>
              {profile.onboarding.suspensionReason}
            </AppText>
          </View>
        ) : null}

        {/* Rides he was given before this screen appeared, and still has to do.
            The body copy above says he cannot take rides, which is true of NEW
            ones and would read as "walk away from the pickup you agreed to" to a
            captain holding one. He can reach them from the Rides tab either way;
            this is what tells him they are still his, on the screen that just
            told him he is blocked. */}
        {owedRides > 0 ? (
          <View className="w-full rounded-2xl p-4 gap-3" style={{ backgroundColor: colors.surfaceMuted }}>
            <AppText className={`text-sm ${MUTED}`}>
              {owedRides === 1
                ? dc("You still have one ride to finish. Please complete it as normal — someone is waiting for it.")
                : dc("You still have {{value0}} rides to finish. Please complete them as normal — people are waiting for them.", {value0: (owedRides)})}
            </AppText>
            <Button prop={{ variant: 'secondary' }} onPress={() => navigate('/rides')}>
              {owedRides === 1 ? dc("Go to my ride") : dc("Go to my rides")}
            </Button>
          </View>
        ) : null}
      </View>

      {/* The shared Button, not a Pressable carrying both a className and a
          style-as-a-function. NativeWind merges an inline style into its own
          computation and understands objects and arrays only — a function is
          collected, applied, and yields nothing (see the note in Button.tsx). That
          silently dropped this button's fill, leaving it full width, correctly
          padded, and setting white text on a white page. */}
      {face.action ? (
        <Button
          onPress={() => {
            if (face.action === 'support') openSupportWhatsApp();
            else navigate('/account/documents');
          }}
        >
          {face.actionLabel}
        </Button>
      ) : null}

      {/* Always reachable, from every state. A captain who is stuck and cannot
          find a human is a captain who stops trying. */}
      {face.action !== 'support' ? (
        // No className on the Pressable, so that the style function actually runs
        // and the press feedback with it — the same NativeWind rule the button
        // above ran into. Layout moves into the function rather than being split
        // across both.
        <Pressable
          role="button"
          onPress={() => openSupportWhatsApp()}
          // No alignItems, so the label stretches the full width and text-center
          // has something to centre against. Centring the View instead would
          // shrink-wrap the text and leave a two-line wrap ragged.
          style={({ pressed }) => ({
            width: '100%',
            paddingVertical: 12,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          {/* Nested, because only half of this is the link. The question is a
              muted aside; "Talk to Raju" is the thing being offered, and it is
              the only part that should look like it can be tapped.

              text-primary rather than an inline colour: AppText only skips its
              white default when the className says a colour, so setting it in
              style alone would leave two colours on the element and stylesheet
              order to pick between them. The underline is safe in style — an
              object merges. */}
          <AppText className={`text-sm text-center ${MUTED}`}>{dc("Need help?")}{' '}
            <AppText
              className="text-sm font-medium text-primary"
              style={{ textDecorationLine: 'underline' }}
            >{dc("Talk to Raju")}</AppText>
          </AppText>
        </Pressable>
      ) : null}
      </View>
    </ScrollView>
  );
};

export default OnboardingStatus;
