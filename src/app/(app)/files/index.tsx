import { Redirect, router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { SourceUsage } from '@/components/files/source-usage';
import { ServerSwitchButton, useServerName } from '@/components/servers/server-switcher';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Banner } from '@/components/ui/banner';
import { HeaderTitle } from '@/components/ui/header-title';
import { Icon } from '@/components/ui/icon';
import { ToastHost } from '@/components/ui/toast-host';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSources } from '@/hooks/use-sources';
import { errorMessage } from '@/lib/notify';

/** Lists the user's sources; with only one, goes straight into it. */
export default function SourcesScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { sources, self, visible } = useSources();
  const serverName = useServerName();

  if (visible.length === 1) {
    return <Redirect href={{ pathname: '/files/[source]', params: { source: visible[0].name } }} />;
  }

  return (
    <ThemedView style={styles.flex}>
      <Stack.Screen
        options={{
          title: serverName,
          headerTitle: () => <HeaderTitle title={serverName} subtitle={t('general.sources')} />,
          headerLeft: () => <ServerSwitchButton />,
        }}
      />
      {sources.error ? (
        <View style={styles.pad}>
          <Banner kind="error" message={errorMessage(sources.error)} />
        </View>
      ) : null}
      <FlatList
        data={visible}
        keyExtractor={(s) => s.name}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={sources.isRefetching}
            onRefresh={() => {
              void sources.refetch();
              void self.refetch();
            }}
            colors={[theme.primary]}
          />
        }
        ListEmptyComponent={
          sources.isPending ? null : (
            <ThemedText themeColor="textSecondary" style={styles.pad}>
              {t('index.noSources')}
            </ThemedText>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              router.push({ pathname: '/files/[source]', params: { source: item.name } })
            }
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.card,
              { backgroundColor: pressed ? theme.surfaceSecondary : theme.surfacePrimary },
            ]}>
            <Icon name="storage" color={theme.primary} size={32} />
            <View style={[styles.flex, styles.cardText]}>
              <ThemedText type="smallBold">{item.name}</ThemedText>
              <SourceUsage source={item} />
            </View>
            {item.readOnly ? (
              <ThemedText type="caption" themeColor="textSecondary">
                {t('general.readOnly')}
              </ThemedText>
            ) : null}
            <Icon name="chevron_right" color={theme.textSecondary} />
          </Pressable>
        )}
      />
      <ToastHost />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { padding: Spacing.three },
  list: { padding: Spacing.three, gap: Spacing.two },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.medium,
  },
  cardText: { gap: Spacing.one },
});
