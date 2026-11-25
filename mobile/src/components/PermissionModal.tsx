import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';

interface PermissionModalProps {
  visible: boolean;
  onRequestPermission: () => void;
  onUsePipFallback: () => void;
  onDismiss: () => void;
}

const { width } = Dimensions.get('window');

export const PermissionModal: React.FC<PermissionModalProps> = ({
  visible,
  onRequestPermission,
  onUsePipFallback,
  onDismiss,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header Icon / Visual */}
          <View style={styles.iconCircle}>
            <Text style={styles.iconText}>🫧</Text>
          </View>

          {/* Title */}
          <Text style={styles.title}>Bật Bong Bóng Phát Nổi</Text>

          {/* Description */}
          <Text style={styles.description}>
            Để âm thanh <Text style={styles.highlight}>tiếp tục phát liên tục</Text> khi bạn thoát app, lướt Facebook hay tắt màn hình, WaveLink cần hiển thị một bong bóng phát nhỏ trên màn hình của bạn.
          </Text>

          <View style={styles.featureBox}>
            <Text style={styles.featureItem}>✨ Chạy nền không bị ngắt quãng</Text>
            <Text style={styles.featureItem}>👆 Chạm 1 chạm để Play/Pause nhanh</Text>
            <Text style={styles.featureItem}>🎯 Kéo thả tự do bất kỳ đâu trên màn hình</Text>
          </View>

          {/* Action Buttons */}
          <TouchableOpacity
            style={styles.primaryButton}
            activeOpacity={0.85}
            onPress={onRequestPermission}
          >
            <Text style={styles.primaryButtonText}>Cấp Quyền Vẽ Lên Ứng Dụng</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            activeOpacity={0.75}
            onPress={onUsePipFallback}
          >
            <Text style={styles.secondaryButtonText}>Dùng chế độ Thu nhỏ (PiP)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.dismissButton}
            activeOpacity={0.6}
            onPress={onDismiss}
          >
            <Text style={styles.dismissButtonText}>Để sau</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    width: Math.min(width - 40, 380),
    backgroundColor: '#1E1E24',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333340',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#2A2A38',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#6366F1',
  },
  iconText: {
    fontSize: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 10,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    color: '#A1A1AA',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  highlight: {
    color: '#818CF8',
    fontWeight: '600',
  },
  featureBox: {
    width: '100%',
    backgroundColor: '#272733',
    borderRadius: 14,
    padding: 12,
    marginBottom: 20,
  },
  featureItem: {
    fontSize: 13,
    color: '#E4E4E7',
    marginVertical: 4,
  },
  primaryButton: {
    width: '100%',
    backgroundColor: '#6366F1',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButton: {
    width: '100%',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#4F46E5',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  secondaryButtonText: {
    color: '#A5B4FC',
    fontSize: 14,
    fontWeight: '500',
  },
  dismissButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  dismissButtonText: {
    color: '#71717A',
    fontSize: 13,
  },
});
