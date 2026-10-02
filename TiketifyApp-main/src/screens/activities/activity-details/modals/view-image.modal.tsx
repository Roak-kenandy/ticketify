import React from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useSelector} from 'react-redux';
import colors from '../../../../constants/colors';
import {radius, spacing} from '../../../../constants/styles';
import {fileImageSource} from '../../../../utils/apiClient';

type Props = {
  image: any;
  modalVisible: boolean;
  setModalVisible: (value: boolean) => void;
};

const ViewImageModal = (props: Props) => {
  const token = useSelector((state: any) => state.auth?.token);
  const {width, height} = useWindowDimensions();
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);
  const source = fileImageSource(props.image?.file?.id, token);

  React.useEffect(() => {
    setLoading(true);
    setFailed(false);
  }, [props.image?.file?.id]);

  const close = () => props.setModalVisible(false);

  return (
    <Modal
      animationType="fade"
      transparent
      statusBarTranslucent
      visible={props.modalVisible}
      onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={close}
          accessibilityLabel="Close image">
          <Icon name="close" size={24} color={colors.white} />
        </TouchableOpacity>
        <View style={[styles.frame, {width: width - 24, height: height * 0.7}]}>
          {source && !failed ? (
            <Image
              style={styles.image}
              resizeMode="contain"
              source={source}
              onLoadEnd={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setFailed(true);
              }}
            />
          ) : null}
          {loading && !failed ? (
            <ActivityIndicator
              style={StyleSheet.absoluteFill}
              color={colors.white}
              size="large"
            />
          ) : null}
          {failed || !source ? (
            <View style={styles.fallback}>
              <Icon
                name="image-outline"
                size={40}
                color="rgba(255,255,255,0.7)"
              />
              <Text style={styles.fallbackText}>Couldn't load this image</Text>
            </View>
          ) : null}
        </View>
        {props.image?.description ? (
          <Text style={styles.caption}>{props.image.description}</Text>
        ) : null}
      </Pressable>
    </Modal>
  );
};

export default ViewImageModal;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  closeBtn: {
    position: 'absolute',
    top: 48,
    right: spacing.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  frame: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {width: '100%', height: '100%'},
  fallback: {alignItems: 'center', gap: spacing.sm},
  fallbackText: {color: 'rgba(255,255,255,0.8)', fontSize: 14},
  caption: {
    color: colors.white,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
});
