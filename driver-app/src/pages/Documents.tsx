import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';
import { CaretLeftIcon } from 'phosphor-react-native';
import { useNavigate, useSearchParams } from 'react-router-native';
import AppText from '../components/AppText';
import DocumentRow, { type DocumentRowState } from '../components/ui/DocumentRow';
import DocumentDetailsSheet from '../components/ui/DocumentDetailsSheet';
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
} from '../lib/documentState';
import { uploadDriverDocuments, type PendingUpload } from '../lib/uploadDocuments';
import { isImageOnly, vehicleClassLabel, type DriverDocumentType } from '../constants/documents';

const CARD = '#f3f3f3';
const HAIRLINE = 'rgba(18,18,32,0.1)';
const INK = 'text-[var(--background-primary)]';
const MUTED = 'text-gray-600';
const TITLE_TRACKING = { letterSpacing: -0.72 };

// Same clearance the Account and Rides boards reserve. Without it the last row
// can never be read past the floating AppBar.
const BAR_CLEARANCE = 132;
const POLL_MS = 3000;

type Uploading = { progress: number };

const Documents = () => {
  const api = useApi();
  const navigate = useNavigate();
  // Which car this checklist is about. Absent, the server answers for the one he
  // is driving — which is what the Account link wants; the vehicle list passes an
  // id so a captain can do the papers of the car parked at home.
  const [params] = useSearchParams();
  const vehicleId = params.get('vehicleId');

  const [data, setData] = useState<DocumentsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<Record<string, Uploading>>({});

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const result = await api.getMyDocuments(vehicleId);
    if (result.error) {
      setError(result.error);
    } else {
      setError(null);
      setData(result as DocumentsResponse);
    }
    setLoading(false);
    return result as DocumentsResponse;
  }, [api, vehicleId]);

  useEffect(() => {
    load();
  }, [load]);

  // Re-ask only while something is actually mid-check, and stop as soon as nothing is.
  useEffect(() => {
    const outstanding = [...(data?.documents ?? []), ...(data?.replacements ?? [])]
      .some((d) => d.scanStatus === 'pending' || d.scanStatus === 'scanning');

    if (!outstanding) return;

    pollTimer.current = setTimeout(() => { load(); }, POLL_MS);
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [data, load]);

  const currentByType = new Map<string, ServerDocument>(
    (data?.documents ?? []).map((d) => [d.type, d]),
  );
  const replacementByType = new Map<string, ServerDocument>(
    (data?.replacements ?? []).map((d) => [d.type, d]),
  );

  
  // keeps the whole pick -> details -> upload sequence readable as one function instead of
  // scattering it across three callbacks and a state machine.
  const [sheet, setSheet] = useState<{
    label: string;
    needsNumber: boolean;
    needsExpiry: boolean;
    settle: (details: { number?: string; expiresAt?: string } | null) => void;
  } | null>(null);

  const askForDetails = useCallback(
    (label: string, needsNumber: boolean, expires: boolean) =>
      new Promise<{ number?: string; expiresAt?: string } | null>((resolve) => {
        if (!needsNumber && !expires) return resolve({});

        setSheet({
          label,
          needsNumber,
          needsExpiry: expires,
          settle: (details) => { setSheet(null); resolve(details); },
        });
      }),
    [],
  );

  const send = useCallback(
    async (document: PreparedDocument, type: DriverDocumentType, details: { number?: string; expiresAt?: string }) => {
      const pending: PendingUpload = { ...document, type, ...details };

      setUploading((u) => ({ ...u, [type]: { progress: 0.05 } }));

      const outcome = await uploadDriverDocuments([pending], api.getToken, (t, phase) => {
        const progress =
          phase === 'signing' ? 0.1
            : phase === 'uploading' ? 0.4
              : phase === 'uploaded' ? 0.85
                : phase === 'registering' ? 0.95
                  : 1;
        setUploading((u) => ({ ...u, [t]: { progress } }));
      // The car this screen is showing, not the one he happens to be driving.
      // Filing the Innova's RC against the Dzire would be accepted, approved and
      // quietly wrong.
      }, data?.vehicle?.id ?? vehicleId);

      setUploading((u) => {
        const next = { ...u };
        delete next[type];
        return next;
      });

      if (!outcome.ok) {
        const failure = outcome.results.find((r) => !r.ok && r.error);
        Alert.alert('Upload failed', failure?.error ?? outcome.error ?? 'Please try again.');
      }

      await load();
    },
    [api, load, data?.vehicle?.id, vehicleId],
  );

  const pick = useCallback(
    async (type: DriverDocumentType, label: string, needsNumber: boolean, expires: boolean) => {
      // No PDF option for the three photographs. The server refuses one at both
      // gates, so offering it here would only be a way to waste an upload — and
      // "choose a PDF" against "Your photo" reads as a suggestion that a PDF is
      // a reasonable thing to send.
      const photoOnly = isImageOnly(type);

      const choice = await new Promise<'camera' | 'library' | 'pdf' | null>((resolve) => {
        Alert.alert(label, 'How would you like to add this?', [
          { text: 'Take a photo', onPress: () => resolve('camera') },
          { text: 'Choose a photo', onPress: () => resolve('library') },
          ...(photoOnly ? [] : [{ text: 'Choose a PDF', onPress: () => resolve('pdf') }]),
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
        ]);
      });

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

      const details = await askForDetails(label, needsNumber, expires);
      if (details === null) return;

      await send(picked, type, details);
    },
    [askForDetails, send],
  );

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  const types = data?.allTypes ?? [];
  const missing = data?.missing ?? [];
  const warningDays = data?.warningDays ?? 30;
  const vehicle = data?.vehicle ?? null;

  // Two lists, not one. A captain who owns two cars has to be able to see at a
  // glance which of these he uploads once and which he uploads again per car —
  // otherwise the second car's checklist looks like the app has forgotten his
  // licence. For the captain with one car it reads as a plain grouping.
  const personalTypes = types.filter((t) => t.owner === 'driver');
  const carTypes = types.filter((t) => t.owner === 'vehicle');

  const renderRow = (info: DocumentTypeInfo, i: number, list: DocumentTypeInfo[]) => {
    const current = currentByType.get(info.type);
    const replacement = replacementByType.get(info.type);
    const inFlight = uploading[info.type];

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
          pick(info.type, info.label, info.needsNumber, info.expires)}
        onRetry={inFlight ? undefined : () =>
          pick(info.type, info.label, info.needsNumber, info.expires)}
        last={i === list.length - 1}
      />
    );
  };

  const section = (heading: string, note: string, list: DocumentTypeInfo[]) => (
    <>
      <View className="mx-4 mt-2">
        <AppText className={`text-sm font-semibold ${INK}`}>{heading}</AppText>
        <AppText className={`text-xs mt-0.5 ${MUTED}`}>{note}</AppText>
      </View>
      <View
        className="mx-4 rounded-2xl px-4"
        style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: HAIRLINE }}
      >
        {list.map((info, i) => renderRow(info, i, list))}
      </View>
    </>
  );

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerStyle={{ paddingBottom: BAR_CLEARANCE, gap: 8 }}
    >
      <View className="flex-row items-center gap-2 px-4 pt-4">
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
          captain opens this screen to find out whether he is done. */}
      <View className="mx-4 rounded-2xl p-4" style={{ backgroundColor: CARD }}>
        <AppText className={`font-semibold ${INK}`}>
          {missing.length === 0
            ? 'All required documents are on file'
            : `${missing.length} still to upload`}
        </AppText>
        <AppText className={`text-sm mt-1 ${MUTED}`}>
          Every document is checked automatically, then reviewed by the Raju.
          Both have to pass before you can go online.
        </AppText>
      </View>

      {section(
        'Your documents',
        'Uploaded once. They stay valid in every car you drive.',
        personalTypes,
      )}

      {vehicle ? (
        section(
          `${vehicleClassLabel(vehicle.class)} · ${vehicle.number}`,
          `These belong to this car. ${verificationLabel(vehicle.verificationStatus)}.`,
          carTypes,
        )
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
      <DocumentDetailsSheet
        visible={sheet !== null}
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
