import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Icon, type IconName } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import i18n from '@/i18n';

export type SheetAction = {
  id: string;
  title: string;
  /** Second line under the title, e.g. a server's address. */
  subtitle?: string;
  icon?: IconName;
  destructive?: boolean;
  /** Marks the current choice in single-choice lists (sort order, timeouts, …). */
  checked?: boolean;
  /** The sheet stays open, e.g. to show the result of the action in its details. */
  keepOpen?: boolean;
};

type ActionSheetProps = {
  visible: boolean;
  title?: string;
  subtitle?: string;
  /** Read-only label/value rows shown above the actions (used for item info). */
  details?: { label: string; value: string }[];
  actions: SheetAction[];
  onSelect: (id: string) => void;
  onClose: () => void;
};

/** Bottom sheet of actions for an item; one instance per screen instead of a menu per row. */
export function ActionSheet({
  visible,
  title,
  subtitle,
  details,
  actions,
  onSelect,
  onClose,
}: ActionSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent>
      <Pressable
        style={[styles.backdrop, { backgroundColor: theme.overlay }]}
        onPress={onClose}
        accessibilityLabel={i18n.t('general.close')}
        accessibilityRole="button">
        <Pressable
          style={[
            styles.sheet,
            { backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.two },
          ]}>
          <View style={[styles.handle, { backgroundColor: theme.surfaceSecondary }]} />
          {title ? (
            <View style={[styles.header, { borderColor: theme.divider }]}>
              <ThemedText type="smallBold" numberOfLines={1}>
                {title}
              </ThemedText>
              {subtitle ? (
                <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
                  {subtitle}
                </ThemedText>
              ) : null}
            </View>
          ) : null}
          <ScrollView bounces={false}>
            {details?.map((d) => (
              <View key={d.label} style={styles.detail}>
                <ThemedText type="caption" themeColor="textSecondary">
                  {d.label}
                </ThemedText>
                <ThemedText type="small" selectable>
                  {d.value}
                </ThemedText>
              </View>
            ))}
            {actions.map((action) => {
              const color = action.destructive ? theme.danger : theme.text;
              return (
                <Pressable
                  key={action.id}
                  accessibilityRole="menuitem"
                  accessibilityState={{ checked: action.checked }}
                  onPress={() => {
                    if (!action.keepOpen) onClose();
                    onSelect(action.id);
                  }}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: theme.surfacePrimary },
                  ]}>
                  {action.icon ? <Icon name={action.icon} color={color} /> : null}
                  <View style={styles.label}>
                    <ThemedText style={{ color }} numberOfLines={1}>
                      {action.title}
                    </ThemedText>
                    {action.subtitle ? (
                      <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
                        {action.subtitle}
                      </ThemedText>
                    ) : null}
                  </View>
                  {action.checked ? <Icon name="check" color={theme.primary} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: Radius.medium * 1.5,
    borderTopRightRadius: Radius.medium * 1.5,
    maxHeight: '80%',
    paddingTop: Spacing.two,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: Spacing.two,
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
    marginBottom: Spacing.one,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.half,
  },
  detail: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    gap: Spacing.half,
  },
  label: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
    minHeight: 52,
    paddingVertical: Spacing.two,
  },
});

export type SheetConfig = {
  title?: string;
  subtitle?: string;
  actions: SheetAction[];
  onSelect: (id: string) => void;
};

/** One sheet a screen can open with different contents: `open({ title, actions, onSelect })`. */
export function useActionSheet() {
  const [config, setConfig] = useState<SheetConfig | null>(null);
  const sheet = (
    <ActionSheet
      visible={config !== null}
      title={config?.title}
      subtitle={config?.subtitle}
      actions={config?.actions ?? []}
      onSelect={(id) => config?.onSelect(id)}
      onClose={() => setConfig(null)}
    />
  );
  return { open: setConfig, sheet };
}
