import {SafeAreaView, StyleSheet, Text, View} from 'react-native';
import React from 'react';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import colors from '../../constants/colors';
import BackButton from '../../components/buttons/back-button/BackButton';

type Props = {
  navigation: any;
};

export default function CameraScreen(props: Props) {
  const device = useCameraDevice('back');
  const {hasPermission, requestPermission} = useCameraPermission();

  React.useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }

    props.navigation.setOptions({
      headerLeft: () => <BackButton navigation={props.navigation} />,
      headerTitle: 'Camera',
    });
  }, []);

  return (
    <SafeAreaView
      style={{
        padding: 20,
        flex: 1,
      }}>
      {device == null ? (
        <Text style={styles.text}>No Camera detected</Text>
      ) : (
        <Camera
          device={device}
          isActive={hasPermission}
          style={StyleSheet.absoluteFill}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  text: {
    color: colors.black,
    padding: 10,
  },
});
