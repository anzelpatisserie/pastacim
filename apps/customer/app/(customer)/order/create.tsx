import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  TextInput, ScrollView, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, Image, FlatList,
} from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { rpcPlaceOrder, rpcNearbyBakers, supabase, notifyUser, useAuth, useThemeColors, Spacing, Radius, FontSize, DEFAULT_LOCATION } from '@pastacim/shared';

export default function CreateOrderScreen() {
  const C = useThemeColors();
  const { user, refreshProfile } = useAuth();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [servingSize, setServingSize] = useState('');
  const [deliveryType, setDeliveryType] = useState<'delivery' | 'pickup'>('delivery');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryDate, setDeliveryDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [deliveryTime, setDeliveryTime] = useState<Date | null>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [isUrgent, setIsUrgent] = useState(false);
  const [searchRadius, setSearchRadius] = useState(20);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationLabel, setLocationLabel] = useState<string | null>(null);

  // Görseller
  const [photos, setPhotos] = useState<string[]>([]); // local URI'lar
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setUserLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        } catch {
          setUserLocation({ lat: DEFAULT_LOCATION.latitude, lng: DEFAULT_LOCATION.longitude });
        }
      } else {
        setUserLocation({ lat: DEFAULT_LOCATION.latitude, lng: DEFAULT_LOCATION.longitude });
      }
    })();
  }, []);

  // ─── Görsel Seç ──────────────────────────────────────────────────────────────
  const handlePickImage = async () => {
    if (photos.length >= 5) {
      Alert.alert('Limit', 'En fazla 5 görsel ekleyebilirsiniz.');
      return;
    }

    Alert.alert(
      'Görsel Ekle',
      'Görseli nereden eklemek istersiniz?',
      [
        {
          text: '📷 Kamera',
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('İzin Gerekli', 'Kamera erişimi için izin vermeniz gerekiyor.');
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.7,
              allowsEditing: true,
              aspect: [4, 3],
            });
            if (!result.canceled && result.assets[0]) {
              setPhotos((prev) => [...prev, result.assets[0].uri]);
            }
          },
        },
        {
          text: '🖼️ Galeri',
          onPress: async () => {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('İzin Gerekli', 'Galeri erişimi için izin vermeniz gerekiyor.');
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.7,
              allowsMultipleSelection: true,
              selectionLimit: 5 - photos.length,
            });
            if (!result.canceled && result.assets.length > 0) {
              setPhotos((prev) => [...prev, ...result.assets.map((a) => a.uri)]);
            }
          },
        },
        { text: 'İptal', style: 'cancel' },
      ]
    );
  };

  const handleRemovePhoto = (uri: string) => {
    setPhotos((prev) => prev.filter((p) => p !== uri));
  };

  // ─── Görselleri Storage'a Yükle ──────────────────────────────────────────────
  const uploadPhotos = async (orderId: string): Promise<string[]> => {
    if (photos.length === 0 || !user?.id) return [];
    const urls: string[] = [];

    for (let i = 0; i < photos.length; i++) {
      const uri = photos[i];
      try {
        // MIME tipini belirle (expo-image-picker her zaman JPEG export eder)
        const mimeType = 'image/jpeg';
        const path = `${user.id}/${orderId}/${i}.jpg`;

        // fetch() ile local file:// URI'yi binary olarak oku
        const response = await fetch(uri);
        if (!response.ok) throw new Error(`Dosya okunamadı (HTTP ${response.status})`);
        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength === 0) throw new Error('Boş dosya — fotoğraf okunamadı');

        const { error: uploadError } = await supabase.storage
          .from('order-photos')
          .upload(path, arrayBuffer, { contentType: mimeType, upsert: true });

        if (uploadError) {
          Alert.alert('📷 Görsel Yüklenemedi', `${i + 1}. görsel: ${uploadError.message}`);
        } else {
          const { data: urlData } = supabase.storage
            .from('order-photos')
            .getPublicUrl(path);
          urls.push(urlData.publicUrl);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        Alert.alert('📷 Görsel Hatası', `${i + 1}. görsel işlenemedi:\n${msg}`);
      }
    }
    return urls;
  };

  // ─── Adresi Koordinata Çevir ──────────────────────────────────────────────────
  const handleGeocodeAddress = async () => {
    if (!deliveryAddress.trim()) {
      Alert.alert('Adres Girin', 'Lütfen önce teslimat adresini yazın.');
      return;
    }
    setIsLocating(true);
    try {
      const results = await Location.geocodeAsync(deliveryAddress.trim());
      if (!results || results.length === 0) {
        Alert.alert('Adres Bulunamadı', 'Girilen adres koordinatlara çevrilemedi. Daha detaylı bir adres deneyin (şehir, ilçe, mahalle gibi).');
        return;
      }
      const { latitude, longitude } = results[0];
      setUserLocation({ lat: latitude, lng: longitude });
      setLocationLabel(`📍 "${deliveryAddress.trim()}" adresi konuma çevrildi`);
    } catch {
      Alert.alert('Hata', 'Adres çevrilemedi. Mevcut konumu kullanın veya daha detaylı adres girin.');
    } finally {
      setIsLocating(false);
    }
  };

  // ─── Mevcut Konum ─────────────────────────────────────────────────────────────
  const handleUseCurrentLocation = async () => {
    setIsLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('İzin Gerekli', 'Konum erişimi için ayarlardan izin vermeniz gerekiyor.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = loc.coords;
      setUserLocation({ lat: latitude, lng: longitude });

      try {
        const results = await Location.reverseGeocodeAsync({ latitude, longitude });
        const place = results[0];
        if (place) {
          const parts = [
            place.streetNumber,
            place.street,
            place.district ?? place.subregion ?? place.name,
            place.city ?? place.region,
          ].filter((p): p is string => !!p && p.trim().length > 0);

          const addr = parts.join(' ');
          if (addr.trim()) {
            setDeliveryAddress(addr.trim());
            setLocationLabel('📍 Mevcut konum kullanılıyor');
            Alert.alert('📍 Konum Eklendi', `Adres dolduruldu:\n${addr.trim()}`);
          } else {
            setLocationLabel('📍 Mevcut konum kullanılıyor');
            Alert.alert('📍 Konum Kaydedildi', 'Koordinatınız alındı. Adres alanını manuel doldurun.');
          }
        }
      } catch {
        Alert.alert('📍 Konum Kaydedildi', 'Koordinatınız alındı. Adres alanını manuel doldurun.');
      }
    } catch {
      Alert.alert('Konum Alınamadı', 'GPS sinyali bulunamadı.');
    } finally {
      setIsLocating(false);
    }
  };

  // Date → "YYYY-MM-DD" (Supabase için)
  const toISODate = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  // Date → "GG MMMM YYYY" (görüntüleme için)
  const formatDisplayDate = (d: Date): string =>
    d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

  // Date → "HH:MM" (görüntüleme için)
  const formatDisplayTime = (d: Date): string =>
    d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  // Date → "HH:MM:00" (Supabase time tipi için)
  const toTimeString = (d: Date): string => {
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}:00`;
  };

  const handleDateChange = (_: DateTimePickerEvent, selected?: Date) => {
    setShowDatePicker(Platform.OS === 'ios'); // iOS'ta açık kal, Android'de kapat
    if (selected) setDeliveryDate(selected);
  };

  // ─── Siparişi Gönder ──────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Eksik bilgi', 'Lütfen sipariş başlığı girin.');
      return;
    }
    if (!servingSize || parseInt(servingSize) < 1) {
      Alert.alert('Eksik bilgi', 'Lütfen kaç kişilik olduğunu girin.');
      return;
    }
    if (isUrgent && !deliveryTime) {
      Alert.alert('Eksik bilgi', 'Acil siparişlerde teslimat saati seçilmelidir.');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Siparişi oluştur
      const { data, error } = await rpcPlaceOrder({
        p_title: title.trim(),
        p_description: description.trim() || null,
        p_serving_size: servingSize ? parseInt(servingSize) : null,
        p_delivery_type: deliveryType,
        p_delivery_address: deliveryType === 'delivery' ? (deliveryAddress.trim() || null) : null,
        p_delivery_latitude: null,
        p_delivery_longitude: null,
        p_delivery_date: deliveryDate ? toISODate(deliveryDate) : null,
        p_delivery_time: deliveryTime ? toTimeString(deliveryTime) : null,
        p_is_urgent: isUrgent,
        p_latitude: userLocation?.lat ?? DEFAULT_LOCATION.latitude,
        p_longitude: userLocation?.lng ?? DEFAULT_LOCATION.longitude,
        p_search_radius_km: searchRadius,
      });

      if (error || data?.error) {
        Alert.alert('Hata', data?.error ?? 'Sipariş oluşturulamadı. Lütfen tekrar deneyin.');
        return;
      }

      // place_order bazen array bazen object döner — her ikisini de destekle
      const rawData = data as { order_id?: string } | Array<{ order_id?: string }> | null;
      const orderId = Array.isArray(rawData) ? rawData[0]?.order_id : rawData?.order_id;

      if (!orderId) {
        Alert.alert('Uyarı', 'Sipariş oluşturuldu fakat ID alınamadı — görseller yüklenemeyecek.');
      }

      // 2. Görselleri yükle (sipariş ID'si gerekiyor)
      if (photos.length > 0 && orderId) {
        setUploadingPhotos(true);
        const photoUrls = await uploadPhotos(orderId);
        if (photoUrls.length > 0) {
          // Sipariş kaydına görselleri ekle
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: updateError } = await (supabase as any)
            .from('orders')
            .update({ photos: photoUrls })
            .eq('id', orderId);
          if (updateError) {
            Alert.alert(
              '📷 Görseller Kaydedilemedi',
              `Görseller Storage'a yüklendi fakat siparişe eklenemedi:\n${updateError.message}`,
            );
          }
        }
        setUploadingPhotos(false);
      }

      await refreshProfile();

      // Yakındaki pastacılara bildirim gönder (arka planda, sessizce)
      if (orderId) {
        const lat = userLocation?.lat ?? DEFAULT_LOCATION.latitude;
        const lng = userLocation?.lng ?? DEFAULT_LOCATION.longitude;
        rpcNearbyBakers({ lat, lng, radius_km: searchRadius }).then(({ data: bakers }) => {
          if (!bakers || bakers.length === 0) return;
          const body = [
            title.trim(),
            servingSize ? `${servingSize} kişilik` : null,
          ].filter(Boolean).join(' · ');
          bakers.forEach((baker) => {
            notifyUser({
              userId: baker.user_id,
              type:   'new_order',
              title:  '📋 Yeni Sipariş Talebi',
              body,
              data:   { orderId },
            }).catch(() => {});
          });
        }).catch(() => {});
      }

      // Formu sıfırla
      setTitle('');
      setDescription('');
      setServingSize('');
      setDeliveryType('delivery');
      setDeliveryAddress('');
      setDeliveryDate(null);
      setDeliveryTime(null);
      setIsUrgent(false);
      setPhotos([]);
      setLocationLabel(null);

      Alert.alert(
        '🎂 Teklif Talebiniz Alındı!',
        'Talebiniz yayında! Yakındaki pastacılar tekliflerini gönderecek.',
        [{ text: 'Tamam', onPress: () => router.replace('/(customer)/my-orders') }]
      );
    } finally {
      setIsSubmitting(false);
      setUploadingPhotos(false);
    }
  };

  const isLoading = isSubmitting || uploadingPhotos;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: C.border }]}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={[styles.backText, { color: C.primary }]}>← Geri</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: C.text }]}>Teklif Al</Text>
          <View style={{ width: 48 }} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Başlık */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: C.text }]}>Ne sipariş etmek istiyorsunuz? *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.card, borderColor: C.border, color: C.text }]}
              placeholder="Örn: Düğün pastası, Baklava, Yaş pasta..."
              placeholderTextColor={C.placeholder}
              value={title}
              onChangeText={setTitle}
              maxLength={100}
            />
          </View>

          {/* Açıklama */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: C.text }]}>Detaylar</Text>
            <TextInput
              style={[styles.inputMulti, { backgroundColor: C.card, borderColor: C.border, color: C.text }]}
              placeholder="Tasarım, renk, malzeme tercihleri, özel notlar..."
              placeholderTextColor={C.placeholder}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={500}
            />
            <Text style={[styles.charCount, { color: C.placeholder }]}>{description.length}/500</Text>
          </View>

          {/* ─── Görseller ─────────────────────────────────────────────────── */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: C.text }]}>
              Referans Görseller
              <Text style={[styles.labelHint, { color: C.placeholder }]}> (isteğe bağlı, maks. 5)</Text>
            </Text>

            <View style={styles.photoRow}>
              {/* Mevcut görseller */}
              {photos.map((uri) => (
                <View key={uri} style={styles.photoThumbWrapper}>
                  <Image source={{ uri }} style={styles.photoThumb} />
                  <TouchableOpacity
                    style={[styles.photoRemoveBtn, { backgroundColor: C.error }]}
                    onPress={() => handleRemovePhoto(uri)}
                  >
                    <Text style={styles.photoRemoveBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}

              {/* Ekle butonu */}
              {photos.length < 5 && (
                <TouchableOpacity
                  style={[styles.photoAddBtn, { backgroundColor: C.card, borderColor: C.border }]}
                  onPress={handlePickImage}
                >
                  <Text style={[styles.photoAddIcon, { color: C.primary }]}>+</Text>
                  <Text style={[styles.photoAddText, { color: C.textSecondary }]}>Ekle</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Kişi sayısı */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: C.text }]}>Kaç kişilik?</Text>
            <TextInput
              style={[styles.inputSmall, { backgroundColor: C.card, borderColor: C.border, color: C.text }]}
              placeholder="Örn: 20"
              placeholderTextColor={C.placeholder}
              value={servingSize}
              onChangeText={(t) => setServingSize(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              maxLength={4}
            />
          </View>

          {/* Teslim Tipi */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: C.text }]}>Teslim Şekli</Text>
            <View style={[styles.toggleRow, { backgroundColor: C.card, borderColor: C.border }]}>
              <TouchableOpacity
                style={[styles.toggleBtn, deliveryType === 'delivery' && { backgroundColor: C.primary }]}
                onPress={() => setDeliveryType('delivery')}
              >
                <Text style={[styles.toggleBtnText, { color: deliveryType === 'delivery' ? '#FFF' : C.textSecondary }]}>
                  🚚 Adrese Teslim
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, deliveryType === 'pickup' && { backgroundColor: C.primary }]}
                onPress={() => setDeliveryType('pickup')}
              >
                <Text style={[styles.toggleBtnText, { color: deliveryType === 'pickup' ? '#FFF' : C.textSecondary }]}>
                  🏪 Gel-Al
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ─── Acil Sipariş ─────────────────────────────── */}
          <View style={styles.field}>
            <TouchableOpacity
              style={[styles.toggleRow, {
                backgroundColor: isUrgent ? C.primary + '15' : C.card,
                borderColor: isUrgent ? C.primary : C.border,
              }]}
              onPress={() => setIsUrgent((v) => !v)}
              activeOpacity={0.75}
            >
              <Text style={[styles.toggleBtnText, { color: isUrgent ? C.primary : C.textSecondary, flex: 1, textAlign: 'center' }]}>
                {isUrgent ? '⚡ Acil Sipariş' : '⚡ Acil Sipariş Değil'}
              </Text>
            </TouchableOpacity>
            {isUrgent && (
              <Text style={{ fontSize: FontSize.xs, color: C.textSecondary }}>
                Acil siparişlerde teslimat saati zorunludur.
              </Text>
            )}
          </View>

          {/* Teslimat Adresi */}
          {deliveryType === 'delivery' && (
            <View style={styles.field}>
              <Text style={[styles.label, { color: C.text }]}>Teslimat Adresi</Text>
              <TextInput
                style={[styles.input, { backgroundColor: C.card, borderColor: C.border, color: C.text }]}
                placeholder="Mahalle, cadde, sokak, kapı no..."
                placeholderTextColor={C.placeholder}
                value={deliveryAddress}
                onChangeText={setDeliveryAddress}
                maxLength={200}
              />
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                <TouchableOpacity
                  style={[styles.locationBtn, { flex: 1, backgroundColor: C.primary + '15', borderColor: C.primary + '44' }]}
                  onPress={handleGeocodeAddress}
                  disabled={isLocating}
                >
                  {isLocating ? (
                    <ActivityIndicator size="small" color={C.primary} />
                  ) : (
                    <Text style={[styles.locationBtnText, { color: C.primary }]}>🔍 Adresi Doğrula</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.locationBtn, { flex: 1, backgroundColor: C.card, borderColor: C.border }]}
                  onPress={handleUseCurrentLocation}
                  disabled={isLocating}
                >
                  <Text style={[styles.locationBtnText, { color: C.textSecondary }]}>📍 Mevcut Konum</Text>
                </TouchableOpacity>
              </View>
              {locationLabel && (
                <Text style={{ fontSize: FontSize.xs, color: C.success, marginTop: 2 }}>{locationLabel}</Text>
              )}
            </View>
          )}

          {/* Tarih */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: C.text }]}>Teslim Tarihi</Text>
            <TouchableOpacity
              style={[styles.datePicker, { backgroundColor: C.card, borderColor: deliveryDate ? C.primary : C.border }]}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.75}
            >
              <Text style={[styles.datePickerText, { color: deliveryDate ? C.text : C.placeholder }]}>
                📅 {deliveryDate ? formatDisplayDate(deliveryDate) : 'Tarih seçin'}
              </Text>
              {deliveryDate && (
                <TouchableOpacity
                  onPress={(e) => { e.stopPropagation(); setDeliveryDate(null); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[styles.dateClearBtn, { color: C.placeholder }]}>✕</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>

            {showDatePicker && (
              <DateTimePicker
                value={deliveryDate ?? new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                minimumDate={new Date()}
                locale="tr-TR"
                onChange={handleDateChange}
              />
            )}

            {/* iOS'ta "Tamam" butonu */}
            {showDatePicker && Platform.OS === 'ios' && (
              <TouchableOpacity
                style={[styles.dateConfirmBtn, { backgroundColor: C.primary }]}
                onPress={() => setShowDatePicker(false)}
              >
                <Text style={styles.dateConfirmBtnText}>Tamam</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* ─── Teslim Saati ─────────────────────────────── */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: C.text }]}>
              Teslim Saati{isUrgent && <Text style={{ color: C.error }}> *</Text>}
            </Text>
            <TouchableOpacity
              style={[styles.datePicker, {
                backgroundColor: C.card,
                borderColor: deliveryTime ? C.primary : (isUrgent ? C.error + '80' : C.border),
              }]}
              onPress={() => setShowTimePicker(true)}
              activeOpacity={0.75}
            >
              <Text style={[styles.datePickerText, { color: deliveryTime ? C.text : C.placeholder }]}>
                🕐 {deliveryTime ? formatDisplayTime(deliveryTime) : 'Saat seçin'}
              </Text>
              {deliveryTime && (
                <TouchableOpacity
                  onPress={(e) => { e.stopPropagation(); setDeliveryTime(null); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[styles.dateClearBtn, { color: C.placeholder }]}>✕</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>

            {showTimePicker && (
              <DateTimePicker
                value={deliveryTime ?? new Date()}
                mode="time"
                is24Hour
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                locale="tr-TR"
                onChange={(_: DateTimePickerEvent, selected?: Date) => {
                  setShowTimePicker(Platform.OS === 'ios');
                  if (selected) setDeliveryTime(selected);
                }}
              />
            )}

            {showTimePicker && Platform.OS === 'ios' && (
              <TouchableOpacity
                style={[styles.dateConfirmBtn, { backgroundColor: C.primary }]}
                onPress={() => setShowTimePicker(false)}
              >
                <Text style={styles.dateConfirmBtnText}>Tamam</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Gönder */}
          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: C.primary }]}
            onPress={handleSubmit}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator color="#FFF" />
                <Text style={styles.submitBtnText}>
                  {uploadingPhotos ? 'Görseller yükleniyor...' : 'Oluşturuluyor...'}
                </Text>
              </View>
            ) : (
              <Text style={styles.submitBtnText}>🎂 Siparişi Yayınla</Text>
            )}
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const PHOTO_SIZE = 88;

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1,
  },
  backText: { fontSize: FontSize.md, fontWeight: '600' },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '800' },
  content: { padding: Spacing.lg, gap: Spacing.md },
  field: { gap: Spacing.xs },
  label: { fontSize: FontSize.sm, fontWeight: '600' },
  labelHint: { fontSize: FontSize.xs, fontWeight: '400' },
  input: {
    borderWidth: 1, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 12, fontSize: FontSize.md,
  },
  inputMulti: {
    borderWidth: 1, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    fontSize: FontSize.md, minHeight: 100,
  },
  inputSmall: {
    borderWidth: 1, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    fontSize: FontSize.md, alignSelf: 'flex-start', minWidth: 120,
  },
  charCount: { fontSize: FontSize.xs, textAlign: 'right' },
  // Görseller
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  photoThumbWrapper: { position: 'relative', width: PHOTO_SIZE, height: PHOTO_SIZE },
  photoThumb: { width: PHOTO_SIZE, height: PHOTO_SIZE, borderRadius: Radius.md },
  photoRemoveBtn: {
    position: 'absolute', top: -6, right: -6,
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  photoRemoveBtnText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  photoAddBtn: {
    width: PHOTO_SIZE, height: PHOTO_SIZE, borderRadius: Radius.md,
    borderWidth: 1.5, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  photoAddIcon: { fontSize: 28, fontWeight: '300', lineHeight: 32 },
  photoAddText: { fontSize: FontSize.xs },
  // Diğer
  datePicker: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 13,
  },
  datePickerText: { fontSize: FontSize.md },
  dateClearBtn: { fontSize: FontSize.md, fontWeight: '700', paddingLeft: Spacing.sm },
  dateConfirmBtn: {
    alignSelf: 'flex-end', paddingHorizontal: Spacing.xl,
    paddingVertical: 10, borderRadius: Radius.full, marginTop: Spacing.sm,
  },
  dateConfirmBtnText: { color: '#FFF', fontWeight: '700', fontSize: FontSize.sm },
  locationBtn: {
    borderWidth: 1, borderRadius: Radius.md,
    paddingVertical: 10, alignItems: 'center', marginTop: 4,
  },
  locationBtnText: { fontSize: FontSize.sm, fontWeight: '600' },
  toggleRow: { flexDirection: 'row', borderWidth: 1, borderRadius: Radius.md, overflow: 'hidden' },
  toggleBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  toggleBtnText: { fontSize: FontSize.sm, fontWeight: '600' },
  radiusRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  radiusBtn: { paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1.5 },
  radiusBtnText: { fontSize: FontSize.sm, fontWeight: '600' },
  submitBtn: {
    paddingVertical: 16, borderRadius: Radius.full, alignItems: 'center', marginTop: Spacing.sm,
    shadowColor: '#D4526E', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  submitBtnText: { color: '#FFF', fontSize: FontSize.md, fontWeight: '700' },
});
