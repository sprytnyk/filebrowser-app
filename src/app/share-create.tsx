import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createShare, listShares, type ShareUnit } from '@/api/share';
import { type ShareLink } from '@/api/types';
import { ShareLinkCard } from '@/components/shares/share-link-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useActionSheet } from '@/components/ui/action-sheet';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { HeaderButton } from '@/components/ui/header-button';
import { Icon } from '@/components/ui/icon';
import { TextField } from '@/components/ui/text-field';
import { ToastHost } from '@/components/ui/toast-host';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage, toast } from '@/lib/notify';
import { sharesForItem } from '@/lib/shares';
import { useSelf } from '@/session/session';

/**
 * Share sheet for one item. Like upstream's share prompt it lists the item's existing links
 * first and only shows the create form when there are none or the user asks for another.
 */
export default function ShareCreateScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    source: string;
    path: string;
    name: string;
  }>();
  const { data: self } = useSelf();
  const shares = useQuery({ queryKey: ['shares'], queryFn: listShares });
  const [creating, setCreating] = useState(false);
  const [createdHash, setCreatedHash] = useState<string | null>(null);
  const [expires, setExpires] = useState('');
  const [unit, setUnit] = useState<ShareUnit>('days');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menu = useActionSheet();

  const existing = sharesForItem(shares.data ?? [], params, self?.username, [createdHash])
    // Newest link first.
    .sort((a, b) => Number(b.hash === createdHash) - Number(a.hash === createdHash));
  const showForm = creating || (shares.isSuccess && existing.length === 0);

  const units: { id: ShareUnit; title: string }[] = [
    { id: 'minutes', title: t('time.minutes') },
    { id: 'hours', title: t('time.hours') },
    { id: 'days', title: t('time.days') },
  ];
  const invalidExpiry = expires !== '' && !/^[1-9]\d{0,5}$/.test(expires);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const created = await createShare({
        source: params.source,
        path: params.path,
        expires,
        unit,
        password,
      });
      await Clipboard.setStringAsync(created.shareURL);
      toast(t('mobile.shareCreated'));
      setCreatedHash(created.hash);
      // Show the new link right away; the refetch fills in the rest.
      queryClient.setQueryData<ShareLink[]>(['shares'], (old) => [created, ...(old ?? [])]);
      void queryClient.invalidateQueries({ queryKey: ['shares'] });
      setCreating(false);
      setExpires('');
      setPassword('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ThemedView style={styles.flex}>
      {menu.sheet}
      <View style={[styles.titleBar, { borderColor: theme.divider }]}>
        <Icon name="share" color={theme.primary} />
        <View style={styles.flex}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {t('general.share')}: {params.name}
          </ThemedText>
          <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
            {params.source}:{params.path}
          </ThemedText>
        </View>
        <HeaderButton icon="close" label={t('general.close')} onPress={() => router.back()} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: Spacing.four + insets.bottom }]}
        keyboardShouldPersistTaps="handled">
        {shares.isPending ? <ActivityIndicator color={theme.primary} /> : null}
        {shares.error ? <Banner kind="error" message={errorMessage(shares.error)} /> : null}
        {!showForm
          ? existing.map((share) => (
              <ShareLinkCard
                key={share.hash}
                share={share}
                title={params.name}
                now={shares.dataUpdatedAt}
                highlight={share.hash === createdHash}
              />
            ))
          : null}
        {!showForm && shares.isSuccess ? (
          <Button
            title={t('mobile.newShare')}
            variant="secondary"
            icon="add_link"
            onPress={() => setCreating(true)}
          />
        ) : null}
        {showForm ? (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              {t('share.notice')}
            </ThemedText>
            <View style={styles.expiry}>
              <View style={styles.flex}>
                <TextField
                  label={t('general.expiration')}
                  value={expires}
                  onChangeText={(v) => setExpires(v.replace(/\D/g, ''))}
                  keyboardType="number-pad"
                  placeholder={t('general.permanent')}
                  error={invalidExpiry ? t('prompts.error') : undefined}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('time.timeUnit')}
                onPress={() =>
                  menu.open({
                    title: t('time.timeUnit'),
                    actions: units.map((u) => ({ ...u, checked: u.id === unit })),
                    onSelect: (id) => setUnit(id as ShareUnit),
                  })
                }
                style={({ pressed }) => [
                  styles.unit,
                  { backgroundColor: pressed ? theme.altBackground : theme.surfaceSecondary },
                ]}>
                <ThemedText type="small">{units.find((u) => u.id === unit)?.title}</ThemedText>
                <Icon name="arrow_drop_down" size={20} />
              </Pressable>
            </View>
            <ThemedText type="caption" themeColor="textSecondary">
              {t('share.shareDurationDescription')}
            </ThemedText>
            <TextField
              label={t('prompts.optionalPassword')}
              value={password}
              onChangeText={setPassword}
              secret
              autoComplete="new-password"
              hint={t('share.passwordDescription')}
            />
            {error ? <Banner kind="error" message={error} /> : null}
            <Button
              title={t('general.create')}
              icon="share"
              loading={busy}
              disabled={invalidExpiry}
              onPress={submit}
            />
            {existing.length > 0 ? (
              <Button
                title={t('general.cancel')}
                variant="flat"
                onPress={() => setCreating(false)}
              />
            ) : null}
          </>
        ) : null}
      </ScrollView>
      <ToastHost />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  titleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingLeft: Spacing.four,
    paddingRight: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  body: { padding: Spacing.three, gap: Spacing.three },
  expiry: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  unit: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
    gap: Spacing.one,
  },
});
