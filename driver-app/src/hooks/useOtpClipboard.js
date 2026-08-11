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
// clipboard, and the captain is coming back to this screen anyway. Returning to
// the app is the signal, which is why this listens to AppState rather than to
// Clipboard's own listener: that one never fires for a copy made while the app
// was in the background, which is every copy that matters here.
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

    const fill = useCallback(async (auto) => {
        try {
            const code = extractCode(await Clipboard.getStringAsync(), length);
            if (!code || (auto && code === filled.current)) return false;
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

        check();
        const sub = AppState.addEventListener("change", (state) => {
            if (state === "active") check();
        });
        return () => {
            cancelled = true;
            sub.remove();
        };
    }, [enabled, fill]);

    return { canPaste, paste };
}
