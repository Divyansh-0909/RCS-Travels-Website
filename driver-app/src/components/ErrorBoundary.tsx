import { Component, type ErrorInfo, type ReactNode } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import ErrorState from './ui/ErrorState';

/**
 * The app's last line. Anything that throws while RENDERING below this point lands
 * here instead of unmounting the tree to a white screen, which is what React 19 does
 * with an uncaught error in production.
 *
 * WHAT IT DOES NOT CATCH, because React boundaries cannot: event handlers, anything
 * async (a rejected fetch, a setTimeout), and errors thrown by this component itself.
 * Those still have to be handled where they happen — which is why Rides keeps its own
 * error state for a request that fails rather than leaning on this. A boundary is a
 * net under the render pass, not a global try/catch.
 *
 * A class because there is still no hook for this; getDerivedStateFromError and
 * componentDidCatch have no functional equivalent.
 */

type Props = { children: ReactNode };
type State = { error: Error | null };

class ErrorBoundary extends Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        // Logged rather than swallowed. The boundary turning a crash into a tidy screen
        // is worth nothing if it also removes the only record of what crashed — and in
        // a release build this console line is the one trace a captain's device leaves.
        // When crash reporting lands (ROADMAP), this is where it reports.
        console.error('Unhandled render error', error, info.componentStack);
    }

    // Clears the failure and lets the tree mount again. Honest about its limits: if the
    // error is deterministic the next render throws the same way and this screen comes
    // straight back, which is the correct outcome — it is a retry, not a repair.
    reset = () => this.setState({ error: null });

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;

        return (
            // Its own opaque page. This replaces whatever was on screen, and half of the
            // app's screens are the dark auth shell — without a background of its own
            // the error would be drawn over a login form it has already broken.
            <View className="flex-1 w-full items-center justify-center bg-[var(--foreground)]">
                <StatusBar style="dark" animated />
                <ErrorState
                    title="This screen stopped working"
                    // The raw message only in development. On a captain's phone it is a
                    // minified variable name, which tells him nothing and reads as the
                    // app talking to somebody else.
                    message={
                        __DEV__
                            ? error.message
                            : 'The app hit an error it could not recover from. Your rides are safe on the server — try again to carry on.'
                    }
                    actionLabel="Try again"
                    onAction={this.reset}
                />
            </View>
        );
    }
}

export default ErrorBoundary;
