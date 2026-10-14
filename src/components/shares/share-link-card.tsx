import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { type ShareLink } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { HeaderButton } from '@/components/ui/header-button';
import { Icon, type IconName } from '@/components/ui/icon';
import { Radius, Spacing } from '@/constants/theme';
import { useShareActions } from '@/hooks/use-share-actions';
import { useTheme } from '@/hooks/use-theme';
import { expiryText, hasPassword, isExpired } from '@/lib/shares';

type ShareLinkCardProps = {
  share: ShareLink;
  title: string;
  /** When the share list was fetched, for "expired" wording. */
  now: number;
  /** Outlines the link that was just created. */
  highlight?: boolean;
};

/**
 * One share with both of its links: the page to browse/preview it and the direct download
 * (a .zip archive for folders), mirroring the two copy buttons of upstream's share prompt.
 */
export function ShareLinkCard({ share, title, now, highlight }: ShareLinkCardProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const actions = useShareActions();
  const folder = !share.singleFileShare;
  const expired = isExpired(share, now);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.surfacePrimary },
        highlight && { borderColor: theme.primary },
      ]}>
      <View style={styles.header}>
        <Icon name="schedule" size={18} color={expired ? theme.danger : theme.textSecondary} />
        <ThemedText type="caption" themeColor={expired ? 'danger' : 'textSecondary'}>
          {expired ? t('mobile.expired') : expiryText(share, t, now)}
        </ThemedText>
        {hasPassword(share) ? (
          <>
            <Icon name="lock" size={14} color={theme.textSecondary} />
            <ThemedText type="caption" themeColor="textSecondary">
              {t('mobile.passwordProtected')}
            </ThemedText>
          </>
        ) : null}
        <View style={styles.flex} />
        {share.canEditShare ? (
          <HeaderButton
            icon="delete"
            label={t('general.delete')}
            color={theme.danger}
            onPress={() => void actions.remove(share)}
          />
        ) : null}
      </View>
      <LinkRow
        icon="link"
        label={t('mobile.shareLink')}
        hint={folder ? t('mobile.shareLinkFolder') : t('mobile.shareLinkFile')}
        url={share.shareURL}
        onCopy={() => void actions.copy(share.shareURL)}
        onSend={() => void actions.send(share.shareURL, title)}
        onOpen={() => void actions.open(share.shareURL)}
      />
      {share.downloadURL ? (
        <LinkRow
          icon={folder ? 'folder_zip' : 'download'}
          label={t('mobile.downloadLink')}
          hint={folder ? t('mobile.downloadLinkFolder') : t('mobile.downloadLinkFile')}
          url={share.downloadURL}
          onCopy={() => void actions.copy(share.downloadURL)}
          onSend={() => void actions.send(share.downloadURL, title)}
        />
      ) : null}
    </View>
  );
}

type LinkRowProps = {
  icon: IconName;
  label: string;
  hint: string;
  url: string;
  onCopy: () => void;
  onSend: () => void;
  onOpen?: () => void;
};

function LinkRow({ icon, label, hint, url, onCopy, onSend, onOpen }: LinkRowProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={[styles.link, { borderColor: theme.divider }]}>
      <View style={styles.linkHeader}>
        <Icon name={icon} size={20} color={theme.primary} />
        <View style={styles.flex}>
          <ThemedText type="smallBold">{label}</ThemedText>
          <ThemedText type="caption" themeColor="textSecondary">
            {hint}
          </ThemedText>
        </View>
        <HeaderButton icon="content_copy" label={t('buttons.copyToClipboard')} onPress={onCopy} />
        <HeaderButton icon="share" label={t('general.share')} onPress={onSend} />
        {onOpen ? (
          <HeaderButton icon="open_in_new" label={t('general.openFile')} onPress={onOpen} />
        ) : null}
      </View>
      <ThemedText
        type="caption"
        themeColor="textSecondary"
        numberOfLines={1}
        ellipsizeMode="middle">
        {url}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: 'transparent',
    padding: Spacing.three,
    paddingTop: Spacing.one,
    gap: Spacing.two,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  link: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
    gap: Spacing.one,
  },
  linkHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
});
