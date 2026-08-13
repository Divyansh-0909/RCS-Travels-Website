import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { CarIcon, CaretDownIcon, CaretLeftIcon } from 'phosphor-react-native';
import { useNavigate, useSearchParams } from 'react-router-native';
import AppText from '../components/AppText';
import DocumentRow, { type DocumentRowState } from '../components/ui/DocumentRow';
import DocumentDetailsSheet from '../components/ui/DocumentDetailsSheet';
import DocumentSourceSheet, { type DocumentSource } from '../components/ui/DocumentSourceSheet';
import { useApi } from '../hooks/useApi';
import {
  captureDocumentPhoto,
  isFailure,
  pickDocumentPdf,
  pickDocumentPhoto,
  type PreparedDocument,
} from '../lib/documentFile';
import {
  expiryLabel,
  reasonFor,
  rowStateFor,
  verificationLabel,
  type DocumentsResponse,
  type DocumentTypeInfo,
  type ServerDocument,
  type Vehicle,
  type VehiclesResponse,
} from '../lib/documentState';
import { uploadDriverDocuments, type PendingUpload } from '../lib/uploadDocuments';
import { isImageOnly, vehicleClassLabel, type DriverDocumentType } from '../constants/documents';

const CARD = '#f3f3f3';
const HAIRLINE = 'rgba(18,18,32,0.1)';
const INK = 'text-[var(--background-primary)]';
const MUTED = 'text-gray-600';
const TITLE_TRACKING = { letterSpacing: -0.72 };

// Not the 132 the boards reserve. This screen is a drill-down now (see
// isDrillDown), so there is no floating bar at the foot of it and no scrim
// either — the clearance those needed would just be an inch of white under the
// last row. What is left is the ordinary breathing room at the end of a list.
const TAIL_PADDING = 32;

// Under the title band only. The scroller's gap of 8 is the rhythm BETWEEN cards,
// and letting the heading sit at that same distance made it read as the first card
// in the stack rather than as the thing the stack is under.
const HEADING_GAP = 12;

const POLL_MS = 3000;

// Which upload is in flight, keyed by CAR as well as by type.
//
// Two cars owe the same nine documents. Keyed on the type alone — which it was,
// back when this screen only ever showed one car — the Innova's RC row would
// carry the progress bar of an upload filed against the Dzire, and the captain
// would watch a document he did not touch fill up.
const uploadKey = (carId: string | null, type: string) => `${carId ?? 'me'}:${type}`;

type Uploading = { progress: number };

// One car's papers, behind one tap.
//
// A component rather than a block inside the page, because each panel owns state
// the page must not share: its own caret angle and its own press feedback. Which
// one is OPEN is the page's business — it holds a single vehicle id, which is what
// makes "only one at a time" true by construction rather than by bookkeeping.
const CarPanel = ({
  vehicle,
  missingCount,
  open,
  onToggle,
  children,
}: {
  vehicle: Vehicle;
  missingCount: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) => {
  // Held rather than read from Pressable's style callback: the header carries a
  // className, and NativeWind drops a style-as-a-function on anything that does.
  // Same reason Button and Input hold theirs.
  const [pressed, setPressed] = useState(false);

  // 0 closed, 1 open.
  const turn = useSharedValue(0);
  useEffect(() => {
    turn.value = withTiming(open ? 1 : 0, { duration: 200 });
  }, [open, turn]);

  const caretStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${turn.value * 180}deg` }],
  }));

  return (
    // One surface, not two. The header and the rows used to be siblings of the
    // scroller, which put its 8px gap between them and left both with a full
    // radius — so the thing that opened read as a second card that had appeared
    // nearby rather than as the inside of the one just tapped. The radius and the
    // border live on this wrapper and the children are square, clipped to it by
    // overflow-hidden, which makes the seam between them a fold in one object
    // instead of the space between two.
    <View
      className="mx-4 rounded-2xl overflow-hidden"
      style={{ borderWidth: 1, borderColor: HAIRLINE }}
    >
      {/* What the panel has to earn is the right to hide the rows, which is why
          the second line counts what is still owed rather than repeating the
          heading above it. Collapsed and silent, this would be a page that looked
          finished while nine documents were missing. */}
      <Pressable
        role="button"
        aria-expanded={open}
        aria-label={`${vehicleClassLabel(vehicle.class)} ${vehicle.number} documents`}
        onPress={onToggle}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        className="flex-row items-center gap-3 px-4 py-3.5"
        style={{ backgroundColor: CARD, opacity: pressed ? 0.7 : 1 }}
      >
        <CarIcon size={24} weight="fill" color="#121220" />

        <View className="flex-1">
          <AppText numberOfLines={1} className={`font-semibold ${INK}`}>
            {vehicleClassLabel(vehicle.class)} · {vehicle.number}
          </AppText>
          <AppText numberOfLines={1} className={`text-xs mt-0.5 ${MUTED}`}>
            {/* "Driving now" leads when it applies. With one panel this screen
                did not need to say which car it was about; with one per car, the
                captain's first question at every row is which of them he is
                answering for. */}
            {vehicle.isActive ? 'Driving now · ' : ''}
            {missingCount > 0
              ? `${missingCount} still to upload`
              : verificationLabel(vehicle.verificationStatus)}
          </AppText>
        </View>

        {/* Rotated, not swapped for an up-caret. The turn is what says the panel
            moved; two different glyphs would only say it changed. */}
        <Animated.View style={caretStyle}>
          <CaretDownIcon size={18} weight="bold" color="#121220" />
        </Animated.View>
      </Pressable>

      {/* Square, and bordered only along the top. The wrapper owns the radius and
          the outline; all this seam has to do is separate the rows from the header
          they belong to. */}
      {open ? (
        <View
          className="px-4"
          style={{ backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: HAIRLINE }}
        >
          {children}
        </View>
      ) : null}
    </View>
  );
};

const Documents = () => {
  const api = useApi();
  const navigate = useNavigate();
  // Which car the caller pointed at. It no longer decides which checklist is on
  // screen — every car is now — it decides which panel starts open. The vehicle
  // list passes an id so a captain who tapped "Documents" against the car parked
  // at home lands with that one already unfolded.
  const [params] = useSearchParams();
  const vehicleId = params.get('vehicleId');

  // His cars, and their papers keyed by car.
  //
  // The endpoint answers about ONE car at a time by design — see its comment in
  // routes/driver.ts: one flat list would put three RCs on screen with nothing to
  // tell them apart. So this screen asks per car rather than asking for all of
  // them, and it only asks for a car whose panel is actually opened.
  //
  // That costs nothing to start with, because GET /me/vehicles already carries
  // each car's `missing` list — which is the whole of what a CLOSED panel has to
  // say. A captain with four cars loads this screen in two requests and pays for
  // a checklist only when he opens one.
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [carDocs, setCarDocs] = useState<Record<string, DocumentsResponse>>({});

  // The response the page itself is built out of: his two personal documents, the
  // type catalogue and warningDays. It is also one car's checklist — the one the
  // caller asked for, or the one he is driving — so it seeds carDocs and that car
  // opens without a second request.
  const [base, setBase] = useState<DocumentsResponse | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<Record<string, Uploading>>({});

  // WHICH car is open, not whether one is — so opening a second closes the first
  // without either panel having to know the other exists. Shut unless the caller
  // named a car: a captain who came here to replace one expiring licence should
  // not have to scroll past a car he was not asked about to find it.
  const [openCarId, setOpenCarId] = useState<string | null>(vehicleId);

  const loadCar = useCallback(async (id: string) => {
    const result = await api.getMyDocuments(id);
    if (result.error) {
      setError(result.error);
      return;
    }
    setCarDocs((all) => ({ ...all, [id]: result as DocumentsResponse }));
  }, [api]);

  const load = useCallback(async () => {
    // Together, not one after the other. They answer different questions and
    // neither needs the other's reply, so serialising them would only make the
    // spinner last as long as both.
    const [list, mine] = await Promise.all([
      api.getVehicles(),
      api.getMyDocuments(vehicleId),
    ]);

    if (list.error || mine.error) setError(list.error ?? mine.error);
    else setError(null);

    if (!list.error) setVehicles((list as VehiclesResponse).vehicles);

    if (!mine.error) {
      const response = mine as DocumentsResponse;
      setBase(response);

      const car = response.vehicle;
      if (car) setCarDocs((all) => ({ ...all, [car.id]: response }));
    }

    setLoading(false);
  }, [api, vehicleId]);

  useEffect(() => {
    load();
  }, [load]);

  // Which checklists are in hand, read through a ref so the poll below can reach
  // them without taking them as a dependency — as a dep it would rebuild the
  // refresh callback on every response and re-arm the timer from inside itself.
  const loadedIds = useRef<string[]>([]);
  loadedIds.current = Object.keys(carDocs);

  const refresh = useCallback(async () => {
    await Promise.all([load(), ...loadedIds.current.map((id) => loadCar(id))]);
  }, [load, loadCar]);

  const responses = [base, ...Object.values(carDocs)];

  // Re-ask only while something is actually mid-check, and stop as soon as
  // nothing is — across every checklist he has open, not just the first.
  const outstanding = responses.some((response) =>
    response != null
    && [...(response.documents ?? []), ...(response.replacements ?? [])]
      .some((d) => d.scanStatus === 'pending' || d.scanStatus === 'scanning'));

  useEffect(() => {
    if (!outstanding) return;

    const timer = setTimeout(() => { refresh(); }, POLL_MS);
    return () => clearTimeout(timer);
    // base and carDocs are what re-arm the chain: each poll writes new objects,
    // which runs this effect again and schedules the next one.
  }, [outstanding, refresh, base, carDocs]);


  // keeps the whole pick -> details -> upload sequence readable as one function instead of
  // scattering it across three callbacks and a state machine.
  const [sheet, setSheet] = useState<{
    // Carried as well as the label, because the sheet names the number field off
    // the TYPE — "Policy number", "Registration number" — and the label is the
    // document's own name, which is a different string.
    type: DriverDocumentType;
    label: string;
    needsNumber: boolean;
    needsExpiry: boolean;
    settle: (details: { number?: string; expiresAt?: string } | null) => void;
  } | null>(null);

  // Same shape as askForDetails below, and for the same reason: the pick -> details
  // -> upload sequence reads as one function instead of three callbacks and a state
  // machine. This one used to be an Alert, which could hand back a choice without
  // any of this — a styled sheet has to be mounted and asked.
  const [source, setSource] = useState<{
    label: string;
    allowPdf: boolean;
    settle: (choice: DocumentSource | null) => void;
  } | null>(null);

  const askForSource = useCallback(
    (label: string, allowPdf: boolean) =>
      new Promise<DocumentSource | null>((resolve) => {
        setSource({
          label,
          allowPdf,
          settle: (choice) => { setSource(null); resolve(choice); },
        });
      }),
    [],
  );

  const askForDetails = useCallback(
    (type: DriverDocumentType, label: string, needsNumber: boolean, expires: boolean) =>
      new Promise<{ number?: string; expiresAt?: string } | null>((resolve) => {
        if (!needsNumber && !expires) return resolve({});

        setSheet({
          type,
          label,
          needsNumber,
          needsExpiry: expires,
          settle: (details) => { setSheet(null); resolve(details); },
        });
      }),
    [],
  );

  const send = useCallback(
    async (
      document: PreparedDocument,
      type: DriverDocumentType,
      details: { number?: string; expiresAt?: string },
      // The car this row belongs to, and null for the two documents that follow
      // the man rather than a car. Filing the Innova's RC against the Dzire would
      // be accepted, approved and quietly wrong.
      carId: string | null,
    ) => {
      const pending: PendingUpload = { ...document, type, ...details };

      setUploading((u) => ({ ...u, [uploadKey(carId, type)]: { progress: 0.05 } }));

      const outcome = await uploadDriverDocuments([pending], api.getToken, (t, phase) => {
        const progress =
          phase === 'signing' ? 0.1
            : phase === 'uploading' ? 0.4
              : phase === 'uploaded' ? 0.85
                : phase === 'registering' ? 0.95
                  : 1;
        setUploading((u) => ({ ...u, [uploadKey(carId, t)]: { progress } }));
      }, carId);

      setUploading((u) => {
        const next = { ...u };
        delete next[uploadKey(carId, type)];
        return next;
      });

      if (!outcome.ok) {
        const failure = outcome.results.find((r) => !r.ok && r.error);
        Alert.alert('Upload failed', failure?.error ?? outcome.error ?? 'Please try again.');
      }

      await refresh();
    },
    [api, refresh],
  );

  const pick = useCallback(
    async (
      type: DriverDocumentType,
      label: string,
      needsNumber: boolean,
      expires: boolean,
      carId: string | null,
    ) => {
      // No PDF option for the three photographs. The server refuses one at both
      // gates, so offering it here would only be a way to waste an upload — and
      // "choose a PDF" against "Your photo" reads as a suggestion that a PDF is
      // a reasonable thing to send.
      const photoOnly = isImageOnly(type);

      const choice = await askForSource(label, !photoOnly);

      if (!choice) return;

      const picked =
        choice === 'camera' ? await captureDocumentPhoto()
          : choice === 'library' ? await pickDocumentPhoto()
            : await pickDocumentPdf();

      if (picked === null) return;

      if (isFailure(picked)) {
        Alert.alert(label, picked.error);
        return;
      }

      const details = await askForDetails(type, label, needsNumber, expires);
      if (details === null) return;

      await send(picked, type, details, carId);
    },
    [askForSource, askForDetails, send],
  );

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  const types = base?.allTypes ?? [];
  const warningDays = base?.warningDays ?? 30;

  // Two lists, not one. A captain who owns two cars has to be able to see at a
  // glance which of these he uploads once and which he uploads again per car —
  // otherwise the second car's checklist looks like the app has forgotten his
  // licence. For the captain with one car it reads as a plain grouping.
  const personalTypes = types.filter((t) => t.owner === 'driver');
  const carTypes = types.filter((t) => t.owner === 'vehicle');
  const carTypeSet = new Set(carTypes.map((t) => t.type));

  // What one car still owes, counted off the server's own `missing` list rather
  // than off the rows — a closed panel is hiding the rows, so counting them there
  // would be counting the thing that is not on screen.
  //
  // Two sources, and the fallback is the point: a car whose checklist has been
  // opened is counted off that answer, and every other car off the `missing` list
  // the vehicle endpoint already sent. Which is what lets four collapsed panels
  // each state their own total without four requests behind them.
  const missingFor = (vehicle: Vehicle) => {
    const response = carDocs[vehicle.id];
    if (response) return response.missing.filter((t) => carTypeSet.has(t)).length;
    return vehicle.missing?.length ?? carTypes.length;
  };

  const personalMissing = (base?.missing ?? [])
    .filter((t) => !carTypeSet.has(t)).length;
  const totalMissing = personalMissing
    + vehicles.reduce((total, vehicle) => total + missingFor(vehicle), 0);

  const renderRow = (
    info: DocumentTypeInfo,
    i: number,
    list: DocumentTypeInfo[],
    response: DocumentsResponse | undefined,
    carId: string | null,
  ) => {
    const byType = (documents: ServerDocument[] | undefined) =>
      (documents ?? []).find((d) => d.type === info.type);

    const current = byType(response?.documents);
    const replacement = byType(response?.replacements);
    const inFlight = uploading[uploadKey(carId, info.type)];

    const state: DocumentRowState = inFlight ? 'uploading' : rowStateFor(current);
    const expiry = expiryLabel(current?.expiresAt ?? null, warningDays);

    return (
      <DocumentRow
        key={info.type}
        label={info.label}
        required={info.required}
        state={state}
        reason={reasonFor(current)}
        expiry={expiry.text}
        expiryWarn={expiry.warn}
        progress={inFlight?.progress}
        renewing={Boolean(replacement) && replacement?.status !== 'approved'}
        onPress={inFlight ? undefined : () =>
          pick(info.type, info.label, info.needsNumber, info.expires, carId)}
        onRetry={inFlight ? undefined : () =>
          pick(info.type, info.label, info.needsNumber, info.expires, carId)}
        last={i === list.length - 1}
      />
    );
  };

  return (
    <ScrollView
      // Explicit, because the shell centres its Outlet with alignItems: 'center'
      // and leaves this auto-width otherwise — which shrink-wraps every mx-4 card
      // below to the width of its own longest line.
      className="flex-1 w-full bg-white"
      contentContainerStyle={{ paddingBottom: TAIL_PADDING, gap: 8 }}
    >
      <View className="flex-row items-center gap-2 px-4 pt-4" style={{ paddingBottom: HEADING_GAP }}>
        <Pressable
          role="button"
          aria-label="Back"
          onPress={() => navigate(-1)}
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <CaretLeftIcon size={22} weight="bold" color="#121220" />
        </Pressable>
        <AppText className={`text-xl font-semibold ${INK}`} style={TITLE_TRACKING}>
          Documents
        </AppText>
      </View>

      {error ? (
        <View className="mx-4 rounded-2xl p-4" style={{ backgroundColor: CARD }}>
          <AppText className={`text-sm ${MUTED}`}>{error}</AppText>
        </View>
      ) : null}

      {/* The one summary line, above the list rather than repeated in it. A
          captain opens this screen to find out whether he is done — and with more
          than one car, "done" means every car, so this counts across all of them
          rather than only the one whose panel happens to be open. */}
      <View className="mx-4 rounded-2xl p-4" style={{ backgroundColor: CARD }}>
        <AppText className={`font-semibold ${INK}`}>
          {totalMissing === 0
            ? 'All required documents are on file'
            : `${totalMissing} still to upload`}
        </AppText>
        <AppText className={`text-sm mt-1 ${MUTED}`}>
          Every document is checked automatically, then reviewed by the Raju.
          Both have to pass before you can go online.
        </AppText>
      </View>

      {/* Personal documents carry no car. Passing null rather than the active
          car's id is also what the upload asks the server for — see
          resolveUploadVehicle: a batch of his licence and his photograph involves
          no car and must not name one. */}
      <View className="mx-4 mt-2">
        <AppText className={`text-sm font-semibold ${INK}`}>Your documents</AppText>
      </View>
      <View
        className="mx-4 rounded-2xl px-4"
        style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: HAIRLINE }}
      >
        {personalTypes.map((info, i) => renderRow(info, i, personalTypes, base ?? undefined, null))}
      </View>

      {vehicles.length > 0 ? (
        <>
          {/* The same heading the personal list gets. That one names what a captain
              owes as a driver, this names what a car owes — and each panel below
              names which car. */}
          <View className="mx-4 mt-2">
            <AppText className={`text-sm font-semibold ${INK}`}>Car documents</AppText>
          </View>

          {/* One panel per car, all shut but the one the caller named. The toggle
              clears the id rather than flipping a flag, so opening a second closes
              the first without either of them being taught about the other.

              A car's rows are fetched the first time it is opened and kept
              afterwards — reopening is instant, and the poll above refreshes every
              checklist already in hand. */}
          {vehicles.map((vehicle) => {
            const response = carDocs[vehicle.id];

            return (
              <CarPanel
                key={vehicle.id}
                vehicle={vehicle}
                missingCount={missingFor(vehicle)}
                open={openCarId === vehicle.id}
                onToggle={() => {
                  setOpenCarId((id) => (id === vehicle.id ? null : vehicle.id));
                  if (!carDocs[vehicle.id]) loadCar(vehicle.id);
                }}
              >
                {response
                  ? carTypes.map((info, i) => renderRow(info, i, carTypes, response, vehicle.id))
                  : (
                    <View className="items-center py-6">
                      <ActivityIndicator />
                    </View>
                  )}
              </CarPanel>
            );
          })}
        </>
      ) : (
        // No car on the account, so the nine below have nothing to attach to. A
        // dead checklist would be the alternative — eleven rows, nine of which
        // fail on tap with a message about a car he has never been asked for.
        <View className="mx-4 mt-2 rounded-2xl p-4" style={{ backgroundColor: CARD }}>
          <AppText className={`font-semibold ${INK}`}>Add your car first</AppText>
          <AppText className={`text-sm mt-1 ${MUTED}`}>
            The RC, insurance and permits belong to a specific car, so we need to know
            which one before you can upload them.
          </AppText>
          <Pressable
            role="button"
            onPress={() => navigate('/account/vehicles')}
            hitSlop={8}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, marginTop: 12 })}
          >
            <AppText className={`font-semibold ${INK}`}>Add a car →</AppText>
          </Pressable>
        </View>
      )}
      <DocumentSourceSheet
        visible={source !== null}
        label={source?.label ?? ''}
        allowPdf={source?.allowPdf ?? false}
        onCancel={() => source?.settle(null)}
        onPick={(choice) => source?.settle(choice)}
      />
      <DocumentDetailsSheet
        visible={sheet !== null}
        type={sheet?.type ?? 'dl'}
        label={sheet?.label ?? ''}
        needsNumber={sheet?.needsNumber ?? false}
        needsExpiry={sheet?.needsExpiry ?? false}
        onCancel={() => sheet?.settle(null)}
        onSubmit={(details) => sheet?.settle(details)}
      />
    </ScrollView>
  );
};

export default Documents;
