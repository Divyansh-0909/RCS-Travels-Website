import { View } from 'react-native';
import AppText from '../AppText';

/**
 * Where the map goes.
 *
 * A DELIBERATE PLACEHOLDER, and its own component so that swapping it for the
 * real thing is one file rather than a search. The map needs react-native-maps
 * (a native module), a Maps SDK for Android key restricted to this app's SHA-1,
 * and therefore a fresh dev build — none of which the ride flow itself depends
 * on. Everything layered over this works against the grey exactly as it will
 * against a map, so the screens can be built, run and corrected first and the
 * map dropped in behind them without touching any of the logic.
 *
 * Sized by its parent, always absolute behind the panel — see ActiveRide.
 */
const MapSlot = () => (
    <View
        style={{ position: 'absolute', inset: 0, backgroundColor: '#dcdce2' }}
        // Nothing above it should lose a tap to it, and there is nothing here to
        // press: the grey is scenery until the map arrives.
        pointerEvents="none"
    >
        <View className="flex-1 items-center justify-center">
            <AppText className="text-sm font-medium" style={{ color: '#8b8b96' }}>
                Map
            </AppText>
        </View>
    </View>
);

export default MapSlot;
