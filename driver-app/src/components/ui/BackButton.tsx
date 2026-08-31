import { useState } from 'react';
import { Pressable } from 'react-native';
import { cssInterop } from 'nativewind';
import { ArrowLeftIcon, CaretLeftIcon } from 'phosphor-react-native';

const asThemed = { className: { target: false, nativeStyleToProp: { color: true } } } as const;
const ArrowLeft = cssInterop(ArrowLeftIcon, asThemed);
const CaretLeft = cssInterop(CaretLeftIcon, asThemed);

type Props = {
  onPress: () => void;
  label?: string;
  icon?: 'arrow' | 'caret';
  iconClassName?: string;
  iconSize?: number;
  weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
  className?: string;
};

/**
 * A compact glyph inside a full 48-point touch target. The extra hitSlop also
 * forgives taps that land just outside the visible header control.
 */
const BackButton = ({
  onPress,
  label = 'Back',
  icon = 'arrow',
  iconClassName = 'text-[var(--background-primary)]',
  iconSize = 22,
  weight = 'bold',
  className = '',
}: Props) => {
  const [pressed, setPressed] = useState(false);
  const BackIcon = icon === 'caret' ? CaretLeft : ArrowLeft;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      hitSlop={4}
      className={`shrink-0 items-center justify-center ${className}`}
      style={{ width: 48, height: 48, opacity: pressed ? 0.6 : 1 }}
    >
      <BackIcon size={iconSize} weight={weight} className={iconClassName} />
    </Pressable>
  );
};

export default BackButton;
