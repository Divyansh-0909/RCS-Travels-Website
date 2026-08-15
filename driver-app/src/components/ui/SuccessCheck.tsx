import LottieView from 'lottie-react-native';
import { View, type StyleProp, type ViewStyle } from 'react-native';

const SuccessAnimation = require('../../assets/Success.json');

type SuccessCheckProps = {
    size?: number;
    loop?: boolean;
    autoplay?: boolean;
    speed?: number;
    className?: string;
    style?: StyleProp<ViewStyle>;
};

const SuccessCheck = ({
    size = 150,
    loop = false,
    autoplay = true,
    speed = 1.4,
    className = '',
    style,
}: SuccessCheckProps) => {
    return (
        <View
            className={className}
            accessible
            accessibilityRole="image"
            accessibilityLabel="Success"
            style={[
                {
                    width: size,
                    height: size,
                },
                style,
            ]}
        >
            <LottieView
                source={SuccessAnimation}
                autoPlay={autoplay}
                loop={loop}
                speed={speed}
                style={{
                    width: '100%',
                    height: '100%',
                }}
            />
        </View>
    );
};

export default SuccessCheck;