import React from 'react';
import {StyleSheet, View, ViewStyle} from 'react-native';
import PrimaryButton from './primary-button';
import SecondaryButton from './secondary-button';
import {spacing} from '../../constants/styles';

type Props = {
  onCancel: () => void;
  onSubmit: () => void;
  cancelText?: string;
  submitText?: string;
  loading?: boolean;
  submitDisabled?: boolean;
  style?: ViewStyle;
};

const ModalFooterActions = (props: Props) => {
  return (
    <View style={[styles.row, props.style]}>
      <SecondaryButton
        text={props.cancelText ?? 'Close'}
        onPress={props.onCancel}
        style={styles.button}
        disabled={props.loading}
      />
      <PrimaryButton
        text={props.submitText ?? 'Submit'}
        onPress={props.onSubmit}
        style={styles.button}
        loading={props.loading}
        disabled={props.submitDisabled || props.loading}
      />
    </View>
  );
};

export default ModalFooterActions;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
    marginTop: spacing.sm,
  },
  button: {
    flex: 1,
  },
});
