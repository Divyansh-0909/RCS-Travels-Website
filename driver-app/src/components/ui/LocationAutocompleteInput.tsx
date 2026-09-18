import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { MapPinIcon } from 'phosphor-react-native';
import { useApi } from '../../hooks/useApi';
import { driverCopy as dc } from '../../lib/copy';
import { useTheme } from '../../theme/ThemeContext';
import AppText from '../AppText';
import Input from './Input';

type Suggestion = {
  id: string;
  label: string;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  error?: boolean;
  backgroundColor?: string;
};

const LocationAutocompleteInput = ({ value, onChange, placeholder, error = false, backgroundColor }: Props) => {
  const api = useApi();
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const cacheRef = useRef(new Map<string, Suggestion[]>());
  const requestRef = useRef(0);
  const skipNextLookupRef = useRef(false);

  const typed = value.trim().length >= 3;

  useEffect(() => {
    if (skipNextLookupRef.current) {
      skipNextLookupRef.current = false;
      return;
    }

    const query = value.trim();
    if (query.length < 3) {
      setSuggestions([]);
      setLookupError(null);
      setLoading(false);
      return;
    }

    const cacheKey = query.toLowerCase();
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setSuggestions(cached);
      setLookupError(null);
      setLoading(false);
      return;
    }

    const requestId = ++requestRef.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      let data;
      try {
        data = await api.placesAutoComplete(query);
      } catch {
        data = { error: 'network' };
      }

      if (requestRef.current !== requestId) return;
      setLoading(false);

      if (data?.error) {
        setSuggestions([]);
        setLookupError(dc("Couldn't load suggestions. You can still type the address in full."));
        return;
      }

      const next = (data?.suggestions ?? [])
        .map((suggestion: any) => ({
          id: suggestion.placePrediction?.placeId,
          label: suggestion.placePrediction?.text?.text,
        }))
        .filter((suggestion: Suggestion) => Boolean(suggestion.id && suggestion.label?.trim()));

      cacheRef.current.set(cacheKey, next);
      setSuggestions(next);
      setLookupError(null);
    }, 300);

    return () => clearTimeout(timer);
  }, [api, value]);

  const select = (suggestion: Suggestion) => {
    skipNextLookupRef.current = true;
    setFocused(false);
    setSuggestions([]);
    setLookupError(null);
    onChange(suggestion.label);
  };

  const showPanel = focused && typed;

  return (
    <View>
      <Input
        prop={{
          variant: 'light',
          bg: backgroundColor,
          value,
          placeholder,
          onChangeFn: onChange,
          onFocusFn: () => setFocused(true),
          onBlurFn: () => setTimeout(() => setFocused(false), 120),
          autoCorrect: false,
          error,
        }}
      />

      {showPanel ? (
        <View
          className="mt-2 overflow-hidden rounded-xl border"
          style={{
            backgroundColor: colors.surfaceRaised,
            borderColor: colors.borderUi,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.08,
            shadowRadius: 8,
            elevation: 3,
          }}
        >
          {loading ? (
            <View className="flex-row items-center gap-2.5 px-3.5 py-3">
              <ActivityIndicator size="small" color={colors.primary} />
              <AppText className="text-sm text-ink-muted">{dc("Finding locations...")}</AppText>
            </View>
          ) : lookupError ? (
            <AppText className="px-3.5 py-3 text-sm leading-5 text-ink-muted">{lookupError}</AppText>
          ) : suggestions.length ? suggestions.map((suggestion, index) => (
            <Pressable
              key={suggestion.id}
              accessibilityRole="button"
              accessibilityLabel={suggestion.label}
              onPress={() => select(suggestion)}
              style={({ pressed }) => ({
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: colors.borderUi,
                backgroundColor: pressed ? colors.surfaceMuted : colors.surfaceRaised,
              })}
            >
              <View className="flex-row items-center gap-2.5">
                <View
                  className="h-7 w-7 shrink-0 items-center justify-center"
                >
                  <MapPinIcon size={17} weight="fill" color={colors.primary} />
                </View>
                <View className="min-w-0 flex-1 gap-0.5">
                  <AppText className="text-sm font-medium text-ink" numberOfLines={1}>{suggestion.label.split(',')[0]}</AppText>
                  <AppText className="text-xs leading-4 text-ink-muted" numberOfLines={1}>
                    {suggestion.label.includes(',') ? suggestion.label.slice(suggestion.label.indexOf(',') + 1).trim() : ''}
                  </AppText>
                </View>
              </View>
            </Pressable>
          )) : (
            <AppText className="px-3.5 py-3 text-sm text-ink-muted">{dc("No matching locations found.")}</AppText>
          )}
        </View>
      ) : null}
    </View>
  );
};

export default LocationAutocompleteInput;

