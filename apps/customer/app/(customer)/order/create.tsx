import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ScrollView, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, Image, Modal, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { rpcPlaceOrder, rpcNearbyBakers, supabase, notifyUser, useAuth, useThemeColors, Spacing, Radius, FontSize } from '@pastacim/shared';

const SEARCH_RADIUS = 20;

// Google Geocoding API anahtarı (app.config.js → extra). Adresi GERÇEK koordinata
// çevirmek için kullanılır; cihaz GPS'i yoksa bile doğru konum elde edilir.
const GOOGLE_API_KEY: string = Constants.expoConfig?.extra?.googlePlacesApiKey ?? '';

// Konum, yazılan adresten Google Geocoding ile çözülür; kullanıcı haritada
// sürüklenebilir pin ile doğrular/düzeltir. İstanbul varsayılanı asla gönderilmez.

type LatLng = { lat: number; lng: number };

/** Adresi Google Geocoding API ile koordinata çevirir. Hata/boş sonuçta null. */
async function geocodeWithGoogle(address: string): Promise<{ point: LatLng; formatted: string } | null> {
  if (!GOOGLE_API_KEY) return null;
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=tr&language=tr&key=${GOOGLE_API_KEY}`
    );
    const data = await res.json();
    if (data.status === 'OK' && data.results?.length > 0) {
      const r = data.results[0];
      return {
        point: { lat: r.geometry.location.lat, lng: r.geometry.location.lng },
        formatted: r.formatted_address ?? address,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// Hazır şablonlar — Hızlı Başla kategorileri
const ORDER_TEMPLATES: { emoji: string; title: string; description: string }[] = [
  { emoji: '🎂', title: 'Doğum günü pastası', description: 'Doğum günü için özel pasta. Tema/karakter, yaş yazısı ve mum tercihlerinizi belirtin.' },
  { emoji: '💍', title: 'Düğün pastası', description: 'Düğün için çok katlı pasta. Kat sayısı, renk teması ve süsleme tarzını belirtin.' },
  { emoji: '🍰', title: 'Yaş pasta', description: 'Klasik yaş pasta. Tatlandırıcı/şurup tercihinizi (çikolatalı, vanilyalı, frambuazlı vs.) belirtin.' },
  { emoji: '🥧', title: 'Tart', description: 'Meyveli veya çikolatalı tart. Tercih ettiğiniz meyve/dolgu ve hamur tipini belirtin.' },
  { emoji: '🥮', title: 'Baklava', description: 'Geleneksel baklava. Cevizli mi fıstıklı mı, tek tepsi mi porsiyon mu olduğunu belirtin.' },
  { emoji: '🍪', title: 'Kurabiye', description: 'Özel kurabiye seti. Tarz (badem ezmeli, çikolatalı, kuru üzümlü vs.) ve adet belirtin.' },
  { emoji: '🧁', title: 'Cupcake', description: 'Cupcake seti. Lezzet ve süsleme tarzını (krema, gofret, çikolata sos vs.) belirtin.' },
  { emoji: '🍩', title: 'Donut', description: 'Donut seti. Çeşit (klasik, çikolatalı, glazlı, renkli) ve adet belirtin.' },
  { emoji: '🍮', title: 'Tatlı tabağı', description: 'Özel tatlı çeşnisi (sütlaç, kazandibi, profiterol vs.). Kişi sayısına göre porsiyon belirtin.' },
];

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
  // Onaylanmış konum. Yalnızca kullanıcı haritada/onay kartında onayladıktan
  // sonra dolar — ASLA İstanbul gibi varsayılan bir değere düşmez.
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationLabel, setLocationLabel] = useState<string | null>(null);

  // Konum onay modalı — geocode/GPS sonrası pin'i onayla/ayarla
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [pendingPoint, setPendingPoint] = useState<LatLng | null>(null);
  const [pendingLabel, setPendingLabel] = useState<string>('');

  // Görseller
  const [photos, setPhotos] = useState<string[]>([]); // local URI'lar
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

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
              mediaTypes: 'images',
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
              mediaTypes: 'images',
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

  // ─── Adresi Koordinata Çevir (Google → Expo fallback) ─────────────────────────
  // Sonuç doğrudan kaydedilmez; kullanıcının haritada/onay kartında onaylaması için
  // modal açar. Böylece yanlış geocode'lar sipariş konumu olarak gitmez.
  const handleGeocodeAddress = async () => {
    if (!deliveryAddress.trim()) {
      Alert.alert('Adres Girin', 'Lütfen önce teslimat adresini yazın.');
      return;
    }
    setIsLocating(true);
    try {
      const addr = deliveryAddress.trim();
      // 1. Google Geocoding (daha isabetli)
      const g = await geocodeWithGoogle(addr);
      if (g) {
        openConfirm(g.point, `📍 "${addr}"`);
        return;
      }
      // 2. Google başarısızsa Expo geocoding'e düş
      const results = await Location.geocodeAsync(addr);
      if (results && results.length > 0) {
        const { latitude, longitude } = results[0];
        openConfirm({ lat: latitude, lng: longitude }, `📍 "${addr}"`);
        return;
      }
      Alert.alert('Adres Bulunamadı', 'Girilen adres koordinatlara çevrilemedi. Daha detaylı bir adres deneyin (şehir, ilçe, mahalle gibi).');
    } catch {
      Alert.alert('Hata', 'Adres çevrilemedi. Mevcut konumu kullanın veya daha detaylı adres girin.');
    } finally {
      setIsLocating(false);
    }
  };

  // ─── Mevcut Konum ─────────────────────────────────────────────────────────────
  // GPS'i bir SEÇENEK olarak korur ama yine aynı onay modalından geçirir.
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

      // Adres alanını GPS'ten doldurmaya çalış (opsiyonel, hata akışı engellemesin)
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
          if (addr.trim()) setDeliveryAddress(addr.trim());
        }
      } catch { /* reverse geocode opsiyonel */ }

      openConfirm({ lat: latitude, lng: longitude }, '📍 Mevcut konumunuz');
    } catch {
      Alert.alert('Konum Alınamadı', 'GPS sinyali bulunamadı.');
    } finally {
      setIsLocating(false);
    }
  };

  // ─── Konum Onay Modalı ────────────────────────────────────────────────────────
  const openConfirm = (point: LatLng, label: string) => {
    setPendingPoint(point);
    setPendingLabel(label);
    setConfirmVisible(true);
  };

  // Modal'da kullanıcı pin'i onayladığında çağrılır
  const handleConfirmLocation = (point: LatLng) => {
    setUserLocation(point);
    setLocationLabel(`${pendingLabel} · konum onaylandı`);
    setConfirmVisible(false);
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

    // Konum zorunlu — yanlış (İstanbul) eşleşmeyi önlemek için ASLA varsayılana düşme
    if (!userLocation) {
      Alert.alert(
        'Konum Gerekli',
        'Doğru pastacılarla eşleşmeniz için konumunuz gerekli. Lütfen adresinizi yazıp "Adresi Doğrula" ya da "Mevcut Konum" ile konumunuzu onaylayın.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Siparişi oluştur
      const { data, error } = await rpcPlaceOrder({
        p_title: title.trim(),
        p_description: description.trim() || undefined,
        p_serving_size: servingSize ? parseInt(servingSize) : undefined,
        p_delivery_type: deliveryType,
        p_delivery_address: deliveryType === 'delivery' ? (deliveryAddress.trim() || undefined) : undefined,
        p_delivery_date: deliveryDate ? toISODate(deliveryDate) : undefined,
        p_delivery_time: deliveryTime ? toTimeString(deliveryTime) : undefined,
        p_is_urgent: false,
        p_latitude: userLocation.lat,
        p_longitude: userLocation.lng,
        p_delivery_latitude: userLocation.lat,
        p_delivery_longitude: userLocation.lng,
        p_search_radius_km: SEARCH_RADIUS,
      });

      const dataObj = data as { error?: string } | null;
      if (error || dataObj?.error) {
        Alert.alert('Hata', dataObj?.error ?? 'Sipariş oluşturulamadı. Lütfen tekrar deneyin.');
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
        const lat = userLocation.lat;
        const lng = userLocation.lng;
        rpcNearbyBakers({ lat, lng, radius_km: SEARCH_RADIUS }).then(({ data: bakers }) => {
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
              targetRole: 'baker',
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
      setPhotos([]);
      setUserLocation(null);
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

  // Başlığı bir şablonla eşleşen aktif şablon (varsa açıklamaya ipucu sağlar)
  const activeTemplate = ORDER_TEMPLATES.find((t) => t.title === title) ?? null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: C.border }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            activeOpacity={0.6}
          >
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
          {/* Hızlı Başla — hazır şablonlar (her zaman görünür) */}
          <View style={styles.field}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[styles.label, { color: C.text }]}>🚀 Hızlı Başla</Text>
              {(title || description) ? (
                <TouchableOpacity
                  onPress={() => { setTitle(''); setDescription(''); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[styles.labelHint, { color: C.primary, fontWeight: '700' }]}>✕ Temizle</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <Text style={[styles.labelHint, { color: C.placeholder }]}>
              Bir kategori seç, formu senin için dolduralım
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.templatesRow}
            >
              {ORDER_TEMPLATES.map((tpl) => {
                const isActive = title === tpl.title;
                return (
                  <TouchableOpacity
                    key={tpl.title}
                    style={[
                      styles.templateChip,
                      { backgroundColor: isActive ? C.primary : C.card, borderColor: isActive ? C.primary : C.border },
                    ]}
                    onPress={() => {
                      // Sadece başlığı doldur; açıklama boş kalsın, şablon metni
                      // aşağıda placeholder (soluk ipucu) olarak gösterilir.
                      setTitle(tpl.title);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.templateEmoji}>{tpl.emoji}</Text>
                    <Text style={[styles.templateText, { color: isActive ? '#FFF' : C.text }]} numberOfLines={1}>
                      {tpl.title}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

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

          {/* Açıklama — aktif şablon seçiliyse onun metni placeholder (ipucu) olur */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: C.text }]}>Detaylar</Text>
            <TextInput
              style={[styles.inputMulti, { backgroundColor: C.card, borderColor: C.border, color: C.text }]}
              placeholder={activeTemplate?.description ?? 'Tasarım, renk, malzeme tercihleri, özel notlar...'}
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
              {locationLabel ? (
                <Text style={{ fontSize: FontSize.xs, color: C.success, marginTop: 2 }}>{locationLabel}</Text>
              ) : (
                <Text style={{ fontSize: FontSize.xs, color: C.textSecondary, marginTop: 2 }}>
                  Doğru pastacılarla eşleşmeniz için konumunuzu onaylayın.
                </Text>
              )}
            </View>
          )}

          {/* Konum Onay Modalı (harita + pin) */}
          <LocationConfirmModal
            visible={confirmVisible}
            point={pendingPoint}
            label={pendingLabel}
            onConfirm={handleConfirmLocation}
            onDismiss={() => setConfirmVisible(false)}
            C={C}
          />

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

            <DatePickerModal
              visible={showDatePicker}
              selectedDate={deliveryDate}
              onSelect={(d) => setDeliveryDate(d)}
              onDismiss={() => setShowDatePicker(false)}
              C={C}
            />
          </View>

          {/* ─── Teslim Saati ─────────────────────────────── */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: C.text }]}>
              Teslim Saati
            </Text>
            <TouchableOpacity
              style={[styles.datePicker, {
                backgroundColor: C.card,
                borderColor: deliveryTime ? C.primary : C.border,
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

            <TimePickerModal
              visible={showTimePicker}
              selectedTime={deliveryTime}
              selectedDate={deliveryDate}
              onSelect={(t) => setDeliveryTime(t)}
              onDismiss={() => setShowTimePicker(false)}
              C={C}
            />
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

// ─── Tarih Seçici Modal ───────────────────────────────────────────────────────
function DatePickerModal({
  visible, selectedDate, onSelect, onDismiss, C,
}: {
  visible: boolean;
  selectedDate: Date | null;
  onSelect: (d: Date) => void;
  onDismiss: () => void;
  C: ReturnType<typeof useThemeColors>;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dates = Array.from({ length: 60 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <View style={pickerStyles.overlay}>
        <View style={[pickerStyles.sheet, { backgroundColor: C.card }]}>
          <Text style={[pickerStyles.title, { color: C.text }]}>Teslim Tarihi Seçin</Text>
          <FlatList
            data={dates}
            keyExtractor={(d) => d.toISOString()}
            style={pickerStyles.list}
            renderItem={({ item }) => {
              const isSelected = selectedDate?.toDateString() === item.toDateString();
              const isToday = item.toDateString() === new Date().toDateString();
              return (
                <TouchableOpacity
                  style={[pickerStyles.item, isSelected && { backgroundColor: C.primary + '22' }]}
                  onPress={() => { onSelect(item); onDismiss(); }}
                >
                  <Text style={[pickerStyles.itemText, { color: C.text }, isSelected && { color: C.primary, fontWeight: '700' }]}>
                    {isToday ? 'Bugün' : item.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </Text>
                  {isSelected && <Text style={{ color: C.primary, fontSize: 18 }}>✓</Text>}
                </TouchableOpacity>
              );
            }}
          />
          <TouchableOpacity style={[pickerStyles.cancelBtn, { borderTopColor: C.border }]} onPress={onDismiss}>
            <Text style={[pickerStyles.cancelText, { color: C.textSecondary }]}>İptal</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Saat Seçici Modal ────────────────────────────────────────────────────────
function TimePickerModal({
  visible, selectedTime, selectedDate, onSelect, onDismiss, C,
}: {
  visible: boolean;
  selectedTime: Date | null;
  selectedDate: Date | null;
  onSelect: (t: Date) => void;
  onDismiss: () => void;
  C: ReturnType<typeof useThemeColors>;
}) {
  const now = new Date();
  // Seçili teslim tarihi bugün mü? Bugünse geçmiş saat dilimlerini gizle.
  const isToday = !!selectedDate && selectedDate.toDateString() === now.toDateString();

  const slots: Date[] = [];
  for (let h = 8; h <= 22; h++) {
    for (const m of [0, 30]) {
      if (h === 22 && m === 30) continue;
      const d = new Date();
      d.setHours(h, m, 0, 0);
      // Bugünse şu andan önceki dilimleri atla
      if (isToday && d.getTime() <= now.getTime()) continue;
      slots.push(d);
    }
  }
  const fmt = (d: Date) =>
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const selectedFmt = selectedTime ? fmt(selectedTime) : null;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <View style={pickerStyles.overlay}>
        <View style={[pickerStyles.sheet, { backgroundColor: C.card }]}>
          <Text style={[pickerStyles.title, { color: C.text }]}>Teslim Saati Seçin</Text>
          <FlatList
            data={slots}
            keyExtractor={(d) => fmt(d)}
            style={pickerStyles.list}
            renderItem={({ item }) => {
              const isSelected = fmt(item) === selectedFmt;
              return (
                <TouchableOpacity
                  style={[pickerStyles.item, isSelected && { backgroundColor: C.primary + '22' }]}
                  onPress={() => { onSelect(item); onDismiss(); }}
                >
                  <Text style={[pickerStyles.itemText, { color: C.text }, isSelected && { color: C.primary, fontWeight: '700' }]}>
                    {fmt(item)}
                  </Text>
                  {isSelected && <Text style={{ color: C.primary, fontSize: 18 }}>✓</Text>}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <Text style={[pickerStyles.itemText, { color: C.textSecondary, textAlign: 'center', padding: Spacing.lg }]}>
                Bugün için uygun saat kalmadı. Lütfen ileri bir tarih seçin.
              </Text>
            }
          />
          <TouchableOpacity style={[pickerStyles.cancelBtn, { borderTopColor: C.border }]} onPress={onDismiss}>
            <Text style={[pickerStyles.cancelText, { color: C.textSecondary }]}>İptal</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Konum Onay Modalı ────────────────────────────────────────────────────────
// Sürüklenebilir pin'li gerçek harita (react-native-maps). Kullanıcı GERÇEK bir
// konumu onaylar — İstanbul varsayılanı asla gönderilmez.
function LocationConfirmModal({
  visible, point, label, onConfirm, onDismiss, C,
}: {
  visible: boolean;
  point: LatLng | null;
  label: string;
  onConfirm: (p: LatLng) => void;
  onDismiss: () => void;
  C: ReturnType<typeof useThemeColors>;
}) {
  const [pin, setPin] = useState<LatLng | null>(point);

  // Modal her açıldığında / yeni nokta geldiğinde pin'i senkronize et
  useEffect(() => { setPin(point); }, [point, visible]);

  if (!visible || !pin) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <View style={pickerStyles.overlay}>
        <View style={[pickerStyles.sheet, { backgroundColor: C.card, paddingBottom: Spacing.lg }]}>
          <Text style={[pickerStyles.title, { color: C.text }]}>Konumu Onayla</Text>
          <Text style={[confirmStyles.hint, { color: C.textSecondary }]}>
            {label} — pin'i basılı tutup sürükleyerek veya haritaya dokunarak konumunuzu ayarlayın.
          </Text>

          <MapView
            // Yeni geocode noktası gelince haritayı yeniden merkezle (key remount)
            key={point ? `${point.lat},${point.lng}` : 'map'}
            style={confirmStyles.map}
            provider={PROVIDER_DEFAULT}
            initialRegion={{
              latitude: pin.lat,
              longitude: pin.lng,
              latitudeDelta: 0.008,
              longitudeDelta: 0.008,
            }}
            onPress={(e) =>
              setPin({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })
            }
          >
            <Marker
              draggable
              coordinate={{ latitude: pin.lat, longitude: pin.lng }}
              onDragEnd={(e) =>
                setPin({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })
              }
            />
          </MapView>
          <Text style={[confirmStyles.coordText, { color: C.textSecondary }]}>
            📍 {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
          </Text>

          <View style={confirmStyles.actions}>
            <TouchableOpacity
              style={[confirmStyles.cancelBtn, { borderColor: C.border }]}
              onPress={onDismiss}
            >
              <Text style={[confirmStyles.cancelText, { color: C.textSecondary }]}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[confirmStyles.confirmBtn, { backgroundColor: C.primary }]}
              onPress={() => onConfirm(pin)}
            >
              <Text style={confirmStyles.confirmText}>✓ Bu Konumu Onayla</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const confirmStyles = StyleSheet.create({
  hint: { fontSize: FontSize.sm, textAlign: 'center', paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  map: { height: 260, marginHorizontal: Spacing.lg, borderRadius: Radius.md },
  fallbackCard: {
    marginHorizontal: Spacing.lg, borderWidth: 1, borderRadius: Radius.md,
    padding: Spacing.md, gap: Spacing.sm, alignItems: 'center',
  },
  coordText: { fontSize: FontSize.md, fontWeight: '700' },
  nudgeGrid: { alignItems: 'center', gap: Spacing.sm },
  nudgeRow: { flexDirection: 'row', gap: Spacing.xl },
  nudgeBtn: { borderWidth: 1.5, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 8, minWidth: 88, alignItems: 'center' },
  nudgeText: { fontSize: FontSize.sm, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.lg, marginTop: Spacing.md },
  cancelBtn: { flex: 1, borderWidth: 1.5, borderRadius: Radius.full, paddingVertical: 14, alignItems: 'center' },
  cancelText: { fontSize: FontSize.md, fontWeight: '600' },
  confirmBtn: { flex: 2, borderRadius: Radius.full, paddingVertical: 14, alignItems: 'center' },
  confirmText: { color: '#FFF', fontSize: FontSize.md, fontWeight: '700' },
});

const pickerStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 16, maxHeight: '70%',
  },
  title: {
    fontSize: FontSize.md, fontWeight: '700',
    textAlign: 'center', paddingBottom: 12,
  },
  list: { flexGrow: 0 },
  item: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: 14,
  },
  itemText: { fontSize: FontSize.md },
  cancelBtn: {
    borderTopWidth: 1, paddingVertical: 16,
    alignItems: 'center', marginTop: 4,
  },
  cancelText: { fontSize: FontSize.md, fontWeight: '600' },
});

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
  templatesRow: { gap: Spacing.sm, paddingVertical: 4, paddingHorizontal: 2 },
  templateChip: {
    borderWidth: 1, borderRadius: Radius.full,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    minWidth: 120,
  },
  templateEmoji: { fontSize: 18 },
  templateText: { fontSize: FontSize.sm, fontWeight: '700', flexShrink: 1 },
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
  submitBtn: {
    paddingVertical: 16, borderRadius: Radius.full, alignItems: 'center', marginTop: Spacing.sm,
    shadowColor: '#D4526E', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  submitBtnText: { color: '#FFF', fontSize: FontSize.md, fontWeight: '700' },
});
