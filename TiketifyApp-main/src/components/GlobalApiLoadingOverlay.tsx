import React from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import colors from '../constants/colors';
import {subscribeApiLoading} from '../utils/apiLoading';

export default function GlobalApiLoadingOverlay() {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    return subscribeApiLoading(active => setVisible(active));
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.box}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.text}>Loading…</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: {
    backgroundColor: colors.white,
    paddingVertical: 24,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    minWidth: 140,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  text: {
    marginTop: 12,
    fontSize: 15,
    color: colors.gray,
  },
});
