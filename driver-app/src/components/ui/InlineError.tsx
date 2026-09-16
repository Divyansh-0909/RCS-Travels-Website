import { View, type ViewStyle } from 'react-native';
import { WarningCircleIcon } from 'phosphor-react-native';
import AppText from '../AppText';
import { useTheme } from '../../theme/ThemeContext';

type Props = {
  message?: string | null;
  color?: string;
  className?: string;
  style?: ViewStyle;
};

const InlineError = ({ message, color, className = '', style }: Props) => {
  const { colors } = useTheme();
  if (!message) return null;

  const errorColor = color ?? colors.negative;

  return (
    <View
      className={`flex-row items-start gap-1.5 ${className}`}
      style={style}
      role="alert"
    >
      <WarningCircleIcon
        size={16}
        weight="regular"
        color={errorColor}
        style={{ marginTop: 1 }}
      />
      <AppText className="flex-1 text-sm text-left" style={{ color: errorColor }}>
        {message}
      </AppText>
    </View>
  );
};

export default InlineError;
