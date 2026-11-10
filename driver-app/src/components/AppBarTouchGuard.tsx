import { type ReactNode } from 'react';
import { View, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';
import { useAppBarVisibility, useShellHidden } from './AppBarVisibility';

/** Place INSIDE a ScrollView: its native pan handling must remain an ancestor. */
const AppBarTouchGuard = ({ children, style, enabled = true }: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  enabled?: boolean;
}) => {
  const { visible, scrimBounds } = useAppBarVisibility();
  const { hidden: shellHidden } = useShellHidden();

  const captureCoveredTap = (event: GestureResponderEvent) => {
    const bounds = scrimBounds.current;
    const y = event.nativeEvent.pageY;
    return enabled && !shellHidden && visible.get() > 0 && bounds !== null
      && y >= bounds.top && y <= bounds.bottom;
  };

  return (
    <View
      collapsable={false}
      accessible={false}
      style={style}
      onStartShouldSetResponderCapture={captureCoveredTap}
      onResponderGrant={() => false}
      // Native ScrollViews may take over a drag that began in the faded strip.
      onResponderTerminationRequest={() => true}
    >
      {children}
    </View>
  );
};

export default AppBarTouchGuard;
