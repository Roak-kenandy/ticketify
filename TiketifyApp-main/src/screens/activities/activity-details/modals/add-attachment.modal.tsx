import React from 'react';
import {
  Image,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {
  Asset,
  ImageLibraryOptions,
  launchCamera,
  launchImageLibrary,
} from 'react-native-image-picker';
import {useSelector} from 'react-redux';
import FormModal, {formStyles} from '../../../../components/modal/form-modal';
import colors from '../../../../constants/colors';
import {radius, spacing} from '../../../../constants/styles';
import {apiRequest} from '../../../../utils/apiClient';
import {showError, showSuccess} from '../../../../utils/notify';

type Props = {
  navigation?: any;
  modalVisible: boolean;
  setModalVisible: (value: boolean) => void;
  ticketId: number | string;
  onSuccess?: () => void;
};

// Resize on device: full-resolution camera photos are 4-8 MB and make uploads
// over mobile data slow or time out.
const PICKER_OPTIONS: ImageLibraryOptions = {
  mediaType: 'photo',
  maxWidth: 1600,
  maxHeight: 1600,
  quality: 0.8,
  selectionLimit: 1,
};

const AddAttachmentModal = (props: Props) => {
  const token = useSelector((state: any) => state.auth?.token);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [asset, setAsset] = React.useState<Asset | null>(null);
  const [description, setDescription] = React.useState('');
  const [error, setError] = React.useState('');

  const reset = () => {
    setAsset(null);
    setDescription('');
    setError('');
  };

  const close = () => {
    setError('');
    props.setModalVisible(false);
  };

  const handlePicked = (response: {
    assets?: Asset[];
    didCancel?: boolean;
    errorCode?: string;
    errorMessage?: string;
  }) => {
    if (response.didCancel) {
      return;
    }
    if (response.errorCode) {
      showError(
        response.errorCode === 'camera_unavailable'
          ? 'Camera is not available on this device'
          : response.errorCode === 'permission'
          ? 'Allow camera and photo access in Settings to attach photos'
          : response.errorMessage || 'Could not open the photo',
      );
      return;
    }
    const picked = response.assets?.[0];
    if (picked?.uri) {
      setAsset(picked);
      setError('');
    }
  };

  async function submitAttachment() {
    if (!asset?.uri) {
      setError('Choose or take a photo first.');
      return;
    }
    if (!description.trim()) {
      setError('Add a short description.');
      return;
    }
    setIsSubmitting(true);
    setError('');
    try {
      const form = new FormData();
      form.append('description', description.trim());
      form.append('file', {
        uri: asset.uri,
        name: asset.fileName || `photo-${Date.now()}.jpg`,
        type: asset.type || 'image/jpeg',
      } as any);
      await apiRequest(
        'POST',
        `/tickets/${props.ticketId}/attachments`,
        token,
        form,
        {timeoutMs: 90000},
      );
      showSuccess('Photo attached');
      reset();
      props.setModalVisible(false);
      props.onSuccess?.();
    } catch (err: any) {
      showError(err?.message || 'Could not upload the photo');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <FormModal
      visible={props.modalVisible}
      onClose={close}
      title="Add attachment"
      subtitle="Attach a site photo to this ticket."
      loading={isSubmitting}
      footer={{onSubmit: submitAttachment, submitText: 'Upload'}}>
      {asset?.uri ? (
        <View style={styles.preview}>
          <Image source={{uri: asset.uri}} style={styles.previewImage} />
          <View style={styles.previewMeta}>
            <Text style={styles.fileName} numberOfLines={1}>
              {asset.fileName || 'Photo'}
            </Text>
            {asset.fileSize ? (
              <Text style={formStyles.hint}>
                {(asset.fileSize / (1024 * 1024)).toFixed(1)} MB
              </Text>
            ) : null}
          </View>
          <TouchableOpacity
            onPress={() => setAsset(null)}
            disabled={isSubmitting}
            style={styles.removeBtn}
            accessibilityLabel="Remove photo">
            <Icon name="trash-outline" size={18} color={colors.error} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.pickRow}>
          <PickButton
            icon="camera-outline"
            label="Take photo"
            onPress={async () => {
              if (!(await ensureCameraPermission())) {
                showError('Allow camera access in Settings to take photos');
                return;
              }
              launchCamera(
                {...PICKER_OPTIONS, saveToPhotos: false},
                handlePicked,
              );
            }}
          />
          <PickButton
            icon="images-outline"
            label="From gallery"
            onPress={() => launchImageLibrary(PICKER_OPTIONS, handlePicked)}
          />
        </View>
      )}

      <View style={formStyles.field}>
        <Text style={formStyles.label}>Description</Text>
        <TextInput
          multiline
          value={description}
          onChangeText={value => {
            setDescription(value);
            if (error) {
              setError('');
            }
          }}
          style={formStyles.textArea}
          placeholder="e.g. ONT installed on the living room wall"
          placeholderTextColor={colors.gray3}
          editable={!isSubmitting}
        />
      </View>
      {error ? <Text style={formStyles.error}>{error}</Text> : null}
    </FormModal>
  );
};

async function ensureCameraPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  try {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.CAMERA,
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

function PickButton({
  icon,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.pickBtn}
      onPress={onPress}
      activeOpacity={0.8}>
      <Icon name={icon} size={26} color={colors.primary} />
      <Text style={styles.pickLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

export default AddAttachmentModal;

const styles = StyleSheet.create({
  pickRow: {flexDirection: 'row', gap: spacing.md},
  pickBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xl,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.tertiary,
    backgroundColor: colors.surface,
  },
  pickLabel: {fontSize: 13, fontWeight: '600', color: colors.primary},
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  previewImage: {width: 64, height: 64, borderRadius: radius.sm},
  previewMeta: {flex: 1, gap: 2},
  fileName: {fontSize: 14, fontWeight: '600', color: colors.black},
  removeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.errorBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
