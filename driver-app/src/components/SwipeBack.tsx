import { useRef } from 'react';
import { PanResponder, View } from 'react-native';
import { useLocation, useNavigate } from 'react-router-native';

const EDGE_WIDTH = 30;
const SWIPE_DISTANCE = 100;
const SWIPE_VELOCITY = 0.5;

const SwipeBack = ({ children }: { children: React.ReactNode }) => {
    const navigate = useNavigate();
    const { pathname } = useLocation();

    const pan = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: (_, gesture) => {
                return pathname !== '/' && gesture.x0 <= EDGE_WIDTH;
            },

            onMoveShouldSetPanResponder: (_, gesture) => {
                return (
                    pathname !== '/' &&
                    gesture.x0 <= EDGE_WIDTH &&
                    gesture.dx > 5 &&
                    Math.abs(gesture.dx) > Math.abs(gesture.dy)
                );
            },

            onPanResponderRelease: (_, gesture) => {
                const distance = Math.max(gesture.dx, 0);

                if (
                    distance >= SWIPE_DISTANCE ||
                    gesture.vx >= SWIPE_VELOCITY
                ) {
                    navigate(-1);
                }
            },
        }),
    ).current;

    return (
        <View style={{ flex: 1, width: '100%' }}>
            {children}

            <View
                {...pan.panHandlers}
                pointerEvents="box-only"
                style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: EDGE_WIDTH,
                }}
            />
        </View>
    );
};

export default SwipeBack;