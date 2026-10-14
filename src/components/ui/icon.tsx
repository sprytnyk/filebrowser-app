import { type AndroidSymbol, SymbolView } from 'expo-symbols';
import { type ColorValue, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export type IconName = AndroidSymbol;

type IconProps = {
  name: IconName;
  size?: number;
  color?: ColorValue;
  style?: StyleProp<ViewStyle>;
};

/** Material Symbols icon, the same icon family the FileBrowser web UI uses. */
export function Icon({ name, size = 24, color, style }: IconProps) {
  const theme = useTheme();

  return (
    <SymbolView
      name={{ android: name }}
      size={size}
      tintColor={color ?? theme.textPrimary}
      style={[{ width: size, height: size }, style]}
    />
  );
}
