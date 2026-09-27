import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import colors from '../../../../constants/colors';
import ModalFooterActions from '../../../../components/ui/modal-footer-actions';

type Props = {
  visible: boolean;
  onClose: () => void;
  onConfirm: (comment: string) => void;
  loading?: boolean;
};

const PresenceBusyModal = (props: Props) => {
  const [comment, setComment] = React.useState('');

  React.useEffect(() => {
    if (!props.visible) {
      setComment('');
    }
  }, [props.visible]);

  return (
    <Modal visible={props.visible} animationType="fade" transparent>
      <TouchableWithoutFeedback onPress={props.onClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.sheet}>
              <Text style={styles.title}>Busy (yellow)</Text>
              <Text style={styles.hint}>
                Describe your current workload so supervisors can assign tickets
                appropriately.
              </Text>
              <TextInput
                style={styles.input}
                value={comment}
                onChangeText={setComment}
                placeholder="e.g. Two installs in Hulhumalé until 16:00"
                multiline
                maxLength={500}
              />
              <ModalFooterActions
                onCancel={props.onClose}
                onSubmit={() => props.onConfirm(comment.trim())}
                submitText="Set busy"
                submitDisabled={!comment.trim() || props.loading}
                loading={props.loading}
              />
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

export default PresenceBusyModal;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 20,
    gap: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },
  hint: {
    fontSize: 13,
    color: '#64748B',
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    minHeight: 88,
    textAlignVertical: 'top',
    color: colors.primary,
  },
});
