import { driverCopy as dc } from "../lib/copy";
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import ErrorState from './ui/ErrorState';
import { useTheme } from '../theme/ThemeContext';

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

const ThemedFallback = ({ error, onReset }: { error: Error; onReset: () => void }) => {
    const { scheme } = useTheme();
    return (
        <View className="flex-1 w-full items-center justify-center bg-canvas">
            <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} animated />
            <ErrorState
                title={dc("This screen stopped working")}
                message={
                    __DEV__
                        ? error.message
                        : dc("The app hit an error it could not recover from. Your rides are safe on the server — try again to carry on.")
                }
                actionLabel={dc("Try again")}
                onAction={onReset}
            />
        </View>
    );
};

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

        return <ThemedFallback error={error} onReset={this.reset} />;
    }
}

export default ErrorBoundary;
