import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import * as Clipboard from "expo-clipboard";

// Pulls the OTP off the clipboard so the boxes fill themselves.
//
// The code arrives over WhatsApp (see sendOtpWhatsApp in
// backend/services/notification.js), and the autofill the OS offers cannot read
// it: Android's SMS Retriever behind autoComplete="sms-otp" and iOS's
// oneTimeCode are both wired to SMS. What the WhatsApp authentication template
// does give us is a "Copy code" button — one tap and the code is on the
// clipboard. A copy from the notification shade can happen while the app stays
// active, so Clipboard's native change listener is the primary signal. AppState
// is still kept as a fallback for copies made while the app is fully backgrounded.
//
// The two platforms differ on what reading costs. Android hands the clipboard
// over (12+ shows its own "pasted from" toast), so the code can land by itself.
// iOS 16 puts a system alert in front of every read, and one that appears
// unprompted reads as the app going through your pockets — so there this only
// asks whether the clipboard holds *anything*, which is silent, and surfaces a
// Paste control for the captain to tap.

// Exactly `length` digits with no digit either side, so "code 123456 expires in
// 5 min" yields the code and a longer run of digits yields nothing.
const extractCode = (text, length) => {
    const match = String(text ?? "").match(new RegExp(`(?:\\D|^)(\\d{${length}})(?:\\D|$)`));
    return match?.[1] ?? null;
};

export function useOtpClipboard({ enabled, length = 6, onCode }) {
    const [canPaste, setCanPaste] = useState(false);

    // Read through a ref so the effect below doesn't tear down and re-run — and
    // re-read the clipboard — on every render that hands it a new closure.
    const onCodeRef = useRef(onCode);
    onCodeRef.current = onCode;

    // A code that has already been through the boxes once. Verification failing
    // clears them, which re-enables this hook; without the guard it would put
    // the same rejected code straight back and the captain would sit there
    // pressing Confirm on it. A deliberate tap ignores the guard.
    const filled = useRef(null);
    // Clipboard contents that were already present when this OTP step opened.
    // That value belongs to a previous attempt (or something unrelated), so it
    // must never auto-fill the new code screen. Only a later clipboard change is
    // eligible for automatic filling.
    const initialCode = useRef(null);

    const fill = useCallback(async (auto) => {
        try {
            const code = extractCode(await Clipboard.getStringAsync(), length);
            if (!code || (auto && (code === filled.current || code === initialCode.current))) return false;
            filled.current = code;
            onCodeRef.current?.(code);
            setCanPaste(false);
            return true;
        } catch {
            // Denied on iOS, or nothing readable there. Nothing to report: the
            // boxes are still there to type into.
            return false;
        }
    }, [length]);

    const paste = useCallback(() => fill(false), [fill]);

    useEffect(() => {
        if (!enabled) {
            setCanPaste(false);
            return;
        }

        let cancelled = false;
        let leftApp = false;
        let clipboardSub = null;

        // Snapshot the clipboard when the OTP screen becomes active. On Android
        // this read is silent apart from the OS clipboard toast, and it gives us
        // a baseline so a code copied during the previous auth attempt cannot be
        // inserted into this one.
        const prime = Platform.OS === "android"
            ? Clipboard.getStringAsync()
                .then((text) => {
                    if (!cancelled) initialCode.current = extractCode(text, length);
                })
                .catch(() => {
                    if (!cancelled) initialCode.current = null;
                })
            : Promise.resolve();

        const check = async () => {
            if (Platform.OS === "android") {
                if (!cancelled) await fill(true);
                return;
            }
            try {
                const has = await Clipboard.hasStringAsync();
                if (!cancelled) setCanPaste(has);
            } catch {
                if (!cancelled) setCanPaste(false);
            }
        };

        // Copying from a WhatsApp notification usually does not background the
        // app. Listen for that clipboard mutation so the freshly copied OTP can
        // fill immediately while the old clipboard value remains ignored.
        prime.then(() => {
            if (cancelled) return;
            clipboardSub = Clipboard.addClipboardListener((event) => {
                if (cancelled) return;

                if (Platform.OS === "android") {
                    fill(true);
                    return;
                }

                // Reading iOS clipboard contents automatically can trigger the
                // system paste-permission prompt. Surface the existing Paste
                // affordance only when the new clipboard content is plain text.
                setCanPaste(event.contentTypes?.includes(Clipboard.ContentType.PLAIN_TEXT) ?? true);
            });
        });

        const sub = AppState.addEventListener("change", (state) => {
            if (state !== "active") {
                leftApp = true;
                return;
            }

            if (!leftApp) return;
            leftApp = false;
            prime.then(() => {
                if (!cancelled) check();
            });
        });
        return () => {
            cancelled = true;
            sub.remove();
            clipboardSub?.remove();
        };
    }, [enabled, fill, length]);

    return { canPaste, paste };
}
