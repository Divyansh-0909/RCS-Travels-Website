import { useState } from 'react';
import { Text, View } from 'react-native';
import DateTimeSelector, { getDefaultScheduledAt } from './components/ui/DateTimeSelector';
import { LanguageProvider } from './i18n';
import { ThemeProvider } from './theme/ThemeContext';

const VerifyWheel = () => {
  const [value, setValue] = useState(getDefaultScheduledAt);

  return (
    <ThemeProvider>
      <LanguageProvider>
        <View style={{ width: 420, padding: 24 }}>
          <DateTimeSelector value={value} onChange={setValue} />
          <Text accessibilityLabel="selected-value">{value.toISOString()}</Text>
        </View>
      </LanguageProvider>
    </ThemeProvider>
  );
};

export default VerifyWheel;
