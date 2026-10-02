import React from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import colors from '../../constants/colors';
import {radius, spacing, typography} from '../../constants/styles';
import ModalFooterActions from '../ui/modal-footer-actions';

type FooterProps = {
  onSubmit: () => void;
  submitText?: string;
  cancelText?: string;
  submitDisabled?: boolean;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  /** Standard Cancel / Submit row. Omit to render a custom footer via children. */
  footer?: FooterProps;
  /** Blocks closing (back button, backdrop, X) while a request is in flight. */
  loading?: boolean;
  scroll?: boolean;
  contentStyle?: ViewStyle;
};

/**
 * Shared dialog shell for every form in the app: dimmed backdrop, keyboard
 * avoidance, scrollable body, consistent header and footer, and Android back
 * button support.
 */
export default function FormModal({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  loading,
  scroll = true,
  contentStyle,
}: Props) {
  const {height} = useWindowDimensions();
  const close = () => {
    if (!loading) {
      Keyboard.dismiss();
      onClose();
    }
  };

  const body = scroll ? (
    <ScrollView
      style={{maxHeight: height * 0.62}}
      contentContainerStyle={[styles.body, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.body, contentStyle]}>{children}</View>
  );

  return (
    <Modal
      animationType="fade"
      transparent
      statusBarTranslucent
      visible={visible}
      onRequestClose={close}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable style={styles.sheet} onPress={Keyboard.dismiss}>
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.title}>{title}</Text>
                {subtitle ? (
                  <Text style={styles.subtitle}>{subtitle}</Text>
                ) : null}
              </View>
              <TouchableOpacity
                onPress={close}
                disabled={loading}
                hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
                accessibilityLabel="Close"
                style={styles.closeBtn}>
                <Icon name="close" size={20} color={colors.gray2} />
              </TouchableOpacity>
            </View>
            {body}
            {footer ? (
              <ModalFooterActions
                onCancel={close}
                onSubmit={footer.onSubmit}
                submitText={footer.submitText}
                cancelText={footer.cancelText ?? 'Cancel'}
                loading={loading}
                submitDisabled={footer.submitDisabled}
              />
            ) : null}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export const formStyles = StyleSheet.create({
  field: {gap: spacing.xs, width: '100%'},
  label: {...typography.label},
  hint: {...typography.caption},
  textArea: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 104,
    fontSize: 15,
    color: colors.black,
    textAlignVertical: 'top',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 48,
    fontSize: 15,
    color: colors.black,
  },
  error: {color: colors.error, fontSize: 13},
});

const styles = StyleSheet.create({
  flex: {flex: 1},
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
    shadowColor: '#0F172A',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  headerText: {flex: 1, gap: 2},
  title: {...typography.h3},
  subtitle: {...typography.bodySm},
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {gap: spacing.lg},
});
