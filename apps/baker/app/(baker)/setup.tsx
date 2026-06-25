import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
  Switch, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { supabase, useAuth, useThemeColors, Spacing, Radius, FontSize } from '@pastacim/shared';
import { shopJustCreatedSignal } from './index';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function buildSocialUrl(handle: string, platform: 'instagram' | 'facebook' | 'tiktok' | 'youtube'): string | null {
  const h = handle.trim().replace(/^@/, '');
  if (!h) return null;
  if (/^https?:\/\//i.test(h)) return h;
  const bases = {
    instagram: 'https://www.instagram.com/',
    facebook:  'https://www.facebook.com/',
    tiktok:    'https://www.tiktok.com/@',
    youtube:   'https://www.youtube.com/@',
  };
  return bases[platform] + h;
}

const PLACES_API_KEY: string = Constants.expoConfig?.extra?.googlePlacesApiKey ?? '';

function normalize(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/[^a-z0-9çğıöşü\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function similarity(a: string, b: string): number {
  const A = normalize(a);
  const B = normalize(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  if (B.includes(A) || A.includes(B)) return 0.85;
  // Token overlap
  const aTokens = new Set(A.split(' '));
  const bTokens = new Set(B.split(' '));
  let common = 0;
  aTokens.forEach((t) => { if (bTokens.has(t)) common += 1; });
  const denom = Math.max(aTokens.size, bTokens.size);
  return denom > 0 ? common / denom : 0;
}

async function fetchGooglePlaceByName(shopName: string): Promise<{
  rating: number | null; reviewCount: number; mapsUrl: string | null;
  matchedName: string | null; similarity: number;
} | null> {
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(shopName + ' pastane')}&key=${PLACES_API_KEY}`
    );
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      const place = data.results[0];
      const matchedName = (place.name ?? null) as string | null;
      const sim = matchedName ? similarity(shopName, matchedName) : 0;
      const mapsUrl = place.place_id
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(matchedName ?? shopName)}&query_place_id=${place.place_id}`
        : null;
      return {
        rating: place.rating ?? null,
        reviewCount: place.user_ratings_total ?? 0,
        mapsUrl,
        matchedName,
        similarity: sim,
      };
    }
    return null;
  } catch {
    return null;
  }
}

type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Pzt', tue: 'Sal', wed: 'Çar', thu: 'Per', fri: 'Cum', sat: 'Cmt', sun: 'Paz',
};
const DAY_KEYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
type WorkingDay = { open: string; close: string; closed: boolean };
type WorkingHours = Record<DayKey, WorkingDay>;
const DEFAULT_HOURS: WorkingHours = DAY_KEYS.reduce((acc, d) => {
  acc[d] = { open: '09:00', close: '18:00', closed: false };
  return acc;
}, {} as WorkingHours);

export default function BakerSetupScreen() {
  const C = useThemeColors();
  const { user, refreshProfile } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  // Yeni geocode/konum gelince haritayı yeniden merkezle (drag'de DEĞİŞMEZ).
  const [mapKey, setMapKey] = useState(0);
  const [isLocating, setIsLocating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Opsiyonel alanlar
  const [workingHours, setWorkingHours] = useState<WorkingHours>({ ...DEFAULT_HOURS });
  const [instagramUrl, setInstagramUrl] = useState('');
  const [facebookUrl, setFacebookUrl] = useState('');
  const [tiktokUrl, setTiktokUrl] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  const [googleRating, setGoogleRating] = useState('');
  const [googleReviewCount, setGoogleReviewCount] = useState('');
  const [isFetchingGoogle, setIsFetchingGoogle] = useState(false);

  const updateDay = (day: DayKey, field: keyof WorkingDay, value: string | boolean) => {
    setWorkingHours((prev) => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  };

  const openSocialUrl = (handle: string, platform: 'instagram' | 'facebook' | 'tiktok' | 'youtube') => {
    const url = buildSocialUrl(handle, platform);
    if (!url) {
      Alert.alert('Kullanıcı Adı Boş', 'Önce bir kullanıcı adı yazın.');
      return;
    }
    Linking.openURL(url).catch(() => Alert.alert('Hata', 'Bağlantı açılamadı.'));
  };

  const geocodeAddress = async () => {
    if (!address.trim()) {
      Alert.alert('Adres Girin', 'Lütfen önce dükkan adresini yazın.');
      return;
    }
    setIsLocating(true);
    try {
      const results = await Location.geocodeAsync(address.trim());
      if (!results || results.length === 0) {
        Alert.alert('Adres Bulunamadı', 'Girilen adres koordinatlara çevrilemedi. Daha detaylı bir adres deneyin.');
        return;
      }
      const { latitude: lat, longitude: lng } = results[0];
      setLatitude(lat);
      setLongitude(lng);
      setMapKey((k) => k + 1);
      Alert.alert('✅ Konum Belirlendi', `"${address.trim()}" adresi koordinatlara çevrildi.`);
    } catch {
      Alert.alert('Hata', 'Adres çevrilemedi. Mevcut konumu kullanmayı deneyin.');
    }
    setIsLocating(false);
  };

  const useCurrentLocation = async () => {
    setIsLocating(true);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Konum İzni', 'Konumunuzu kullanmak için izin verilmedi.');
      setIsLocating(false);
      return;
    }
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLatitude(loc.coords.latitude);
      setLongitude(loc.coords.longitude);
      setMapKey((k) => k + 1);
      try {
        const results = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        const place = results[0];
        if (place) {
          const parts = [
            place.street, place.district ?? place.subregion ?? place.name,
            place.city ?? place.region,
          ].filter((p): p is string => !!p && p.trim().length > 0);
          const addr = parts.join(' ');
          if (addr && !address.trim()) setAddress(addr);
        }
      } catch { /* ignore */ }
      Alert.alert('✅ Konum Alındı', `${loc.coords.latitude.toFixed(5)}, ${loc.coords.longitude.toFixed(5)}`);
    } catch {
      Alert.alert('Hata', 'Konum alınamadı.');
    }
    setIsLocating(false);
  };

  const fetchGoogle = async () => {
    if (!name.trim()) {
      Alert.alert('Dükkan Adı Gerekli', 'Önce dükkan adını girin.');
      return;
    }
    setIsFetchingGoogle(true);
    const result = await fetchGooglePlaceByName(name.trim());
    setIsFetchingGoogle(false);
    if (!result) {
      Alert.alert('Bulunamadı', `"${name.trim()}" için Google'da işletme bulunamadı. Dükkan adının Google Maps'teki adla aynı olduğundan emin olun.`);
      return;
    }
    if (result.similarity < 0.5) {
      Alert.alert(
        '❌ Eşleşme Bulunamadı',
        `"${name.trim()}" adına ait Google işletme profili bulunamadı.\n\nGoogle'da dönen en yakın sonuç: "${result.matchedName ?? '—'}"\n\nGoogle Haritalar'da işletmenizi kayıt etmeden bu bilgileri otomatik getiremezsiniz.`
      );
      return;
    }
    if (result.rating != null) setGoogleRating(String(result.rating));
    if (result.reviewCount > 0) setGoogleReviewCount(String(result.reviewCount));
    if (result.mapsUrl) setGoogleMapsUrl(result.mapsUrl);
    Alert.alert('✅ Başarılı', `Puan: ${result.rating ?? '—'} · ${result.reviewCount} yorum${result.matchedName ? `\n(${result.matchedName})` : ''}`);
  };

  const handleCreate = async () => {
    if (!name.trim()) return setError('Dükkan adı gerekli.');
    if (!address.trim()) return setError('Adres gerekli.');
    if (latitude == null || longitude == null) {
      return setError('Lütfen "Adresi Doğrula" veya "Mevcut Konum" butonuyla konumunuzu belirleyin.');
    }

    setIsLoading(true);
    setError(null);

    try {
      type RpcFn = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
      const { data, error: rpcError } = await (supabase as unknown as { rpc: RpcFn }).rpc('create_shop', {
        p_name: name.trim(),
        p_description: description.trim() || null,
        p_address: address.trim(),
        p_latitude: latitude,
        p_longitude: longitude,
        p_working_hours: workingHours,
        p_instagram_url: buildSocialUrl(instagramUrl, 'instagram'),
        p_facebook_url:  buildSocialUrl(facebookUrl, 'facebook'),
        p_tiktok_url:    buildSocialUrl(tiktokUrl, 'tiktok'),
        p_youtube_url:   buildSocialUrl(youtubeUrl, 'youtube'),
        p_google_maps_url: googleMapsUrl.trim() || null,
        p_google_rating: googleRating ? parseFloat(googleRating) : null,
        p_google_review_count: googleReviewCount ? parseInt(googleReviewCount, 10) : 0,
      });

      if (rpcError) {
        Alert.alert('Hata', 'Dükkan oluşturulamadı: ' + rpcError.message);
        return;
      }

      const rpcErrMsg = (data as { error?: string } | null)?.error;
      if (rpcErrMsg === 'mevcut_dukkan') {
        await refreshProfile();
        // index'e: dükkan artık var, stale 'none' latch'ini sıfırla ve yeniden sorgula.
        shopJustCreatedSignal.value = true;
        router.replace('/(baker)');
        return;
      }
      if (rpcErrMsg) {
        Alert.alert('Hata', rpcErrMsg);
        return;
      }

      // Cep telefonu (opsiyonel) → users.phone (müşteriler teklif sonrası görebilsin)
      if (phone.trim() && user?.id) {
        await supabase.from('users').update({ phone: phone.trim() }).eq('id', user.id);
      }

      await refreshProfile();
      // index'e: dükkan oluşturuldu, redirect latch'ini sıfırla ve 'exists'e geçecek
      // taze sorgu yap (aksi halde stale 'none' setup'a geri yönlendirir).
      shopJustCreatedSignal.value = true;
      Alert.alert('🎉 Dükkan Oluşturuldu', 'Artık taleplere teklif verebilirsiniz!', [
        { text: 'Tamam', onPress: () => router.replace('/(baker)') },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Bilinmeyen hata';
      Alert.alert('Hata', 'Dükkan oluşturulamadı: ' + msg);
    } finally {
      setIsLoading(false);
    }
  };

  // NOT: Eskiden burada bir "guard" effect'i vardı (getSession + is_baker sorgusu)
  // — _layout.tsx'in kırılgan redirect'ine karşı defans amaçlıydı. Artık setup'a
  // yönlendirme kararını YALNIZCA (baker)/index veriyor (DB'deki pastry_shops
  // sorgusuna dayalı, stabil latch). setup'a yalnızca dükkanı olmayan kullanıcı
  // gelir; defansif kontrol gereksizdi ve sorgusu askıda kaldığında spinner'da
  // takılarak yeni bir başarısızlık noktası yaratıyordu. Kaldırıldı.

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: C.text }]}>🧑‍🍳 Dükkanını Kur</Text>
        <Text style={[styles.subtitle, { color: C.textSecondary }]}>
          Pastacım Pro'yu kullanmak için önce bir dükkan oluşturman gerekiyor.
        </Text>

        {/* Bilgilendirme kartı */}
        <View style={[styles.infoCard, { backgroundColor: C.primary + '12', borderColor: C.primary + '44' }]}>
          <Text style={[styles.infoCardText, { color: C.text }]}>
            <Text style={{ fontWeight: '800' }}>ℹ️ </Text>
            Buradaki bilgiler teklif verdiğiniz müşterilere gösterilecek ve müşteriler profilinizden detaylara ulaşabilecek. Doldurulması önerilir.
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={[styles.label, { color: C.textSecondary }]}>Dükkan Adı *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: C.card, borderColor: C.border, color: C.text }]}
            placeholder="Örn: Ayşe'nin Pastanesi"
            placeholderTextColor={C.placeholder}
            value={name}
            onChangeText={(t) => { setName(t); setError(null); }}
          />

          <Text style={[styles.label, { color: C.textSecondary }]}>Açıklama (opsiyonel)</Text>
          <TextInput
            style={[styles.input, styles.multiline, { backgroundColor: C.card, borderColor: C.border, color: C.text }]}
            placeholder="Dükkanınız hakkında kısa bir bilgi..."
            placeholderTextColor={C.placeholder}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          <Text style={[styles.label, { color: C.textSecondary }]}>Cep Telefonu (opsiyonel)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: C.card, borderColor: C.border, color: C.text }]}
            placeholder="05XX XXX XX XX"
            placeholderTextColor={C.placeholder}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            maxLength={20}
          />

          <Text style={[styles.label, { color: C.textSecondary }]}>Adres *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: C.card, borderColor: C.border, color: C.text }]}
            placeholder="Mahalle, İlçe, İl"
            placeholderTextColor={C.placeholder}
            value={address}
            onChangeText={(t) => { setAddress(t); setError(null); }}
          />

          {latitude != null && longitude != null ? (
            <Text style={{ fontSize: FontSize.xs, color: C.success, marginTop: -8 }}>
              ✅ Konum: {latitude.toFixed(4)}, {longitude.toFixed(4)}
            </Text>
          ) : (
            <Text style={{ fontSize: FontSize.xs, color: C.textSecondary, marginTop: -8 }}>
              Müşterilerin sizi bulabilmesi için konum gerekli
            </Text>
          )}

          <View style={styles.locationRow}>
            <TouchableOpacity
              style={[styles.locationBtn, { backgroundColor: C.primary + '15', borderColor: C.primary + '44' }]}
              onPress={geocodeAddress}
              disabled={isLocating}
            >
              {isLocating ? (
                <ActivityIndicator size="small" color={C.primary} />
              ) : (
                <Text style={[styles.locationBtnText, { color: C.primary }]}>🔍 Adresi Doğrula</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.locationBtn, { backgroundColor: C.card, borderColor: C.border }]}
              onPress={useCurrentLocation}
              disabled={isLocating}
            >
              <Text style={[styles.locationBtnText, { color: C.textSecondary }]}>📍 Mevcut Konum</Text>
            </TouchableOpacity>
          </View>

          {/* Harita — konum belirlenince pin'le ince ayar */}
          {latitude != null && longitude != null && (
            <View style={{ marginTop: Spacing.sm }}>
              <Text style={{ fontSize: FontSize.xs, color: C.textSecondary, marginBottom: 4 }}>
                Pin'i basılı tutup sürükleyerek veya haritaya dokunarak konumunuzu tam ayarlayın
              </Text>
              <MapView
                key={mapKey}
                style={{ height: 200, borderRadius: Radius.md }}
                provider={PROVIDER_DEFAULT}
                initialRegion={{ latitude, longitude, latitudeDelta: 0.008, longitudeDelta: 0.008 }}
                onPress={(e) => {
                  setLatitude(e.nativeEvent.coordinate.latitude);
                  setLongitude(e.nativeEvent.coordinate.longitude);
                }}
              >
                <Marker
                  draggable
                  coordinate={{ latitude, longitude }}
                  onDragEnd={(e) => {
                    setLatitude(e.nativeEvent.coordinate.latitude);
                    setLongitude(e.nativeEvent.coordinate.longitude);
                  }}
                />
              </MapView>
            </View>
          )}

          {/* Çalışma Saatleri (opsiyonel) */}
          <Text style={[styles.label, { color: C.textSecondary, marginTop: Spacing.sm }]}>Çalışma Saatleri (opsiyonel)</Text>
          <View style={[styles.hoursCard, { backgroundColor: C.card, borderColor: C.border }]}>
            {DAY_KEYS.map((day) => {
              const d = workingHours[day];
              return (
                <View key={day} style={styles.dayRow}>
                  <Text style={[styles.dayLabel, { color: C.text }]}>{DAY_LABELS[day]}</Text>
                  <Switch
                    value={!d.closed}
                    onValueChange={(v) => updateDay(day, 'closed', !v)}
                    trackColor={{ false: C.border, true: C.primary }}
                    thumbColor="#FFF"
                  />
                  {!d.closed ? (
                    <View style={styles.timeRow}>
                      <TextInput
                        style={[styles.timeInput, { borderColor: C.border, color: C.text, backgroundColor: C.background }]}
                        value={d.open}
                        onChangeText={(v) => updateDay(day, 'open', v)}
                        placeholder="09:00"
                        placeholderTextColor={C.placeholder}
                        maxLength={5}
                      />
                      <Text style={{ color: C.textSecondary }}>–</Text>
                      <TextInput
                        style={[styles.timeInput, { borderColor: C.border, color: C.text, backgroundColor: C.background }]}
                        value={d.close}
                        onChangeText={(v) => updateDay(day, 'close', v)}
                        placeholder="18:00"
                        placeholderTextColor={C.placeholder}
                        maxLength={5}
                      />
                    </View>
                  ) : (
                    <Text style={[styles.closedLabel, { color: C.error }]}>Kapalı</Text>
                  )}
                </View>
              );
            })}
          </View>

          {/* Sosyal Medya (opsiyonel) */}
          <Text style={[styles.label, { color: C.textSecondary, marginTop: Spacing.sm }]}>Sosyal Medya (opsiyonel)</Text>
          {([
            { key: 'instagram' as const, value: instagramUrl, set: setInstagramUrl, placeholder: '📸 Instagram kullanıcı adı' },
            { key: 'facebook'  as const, value: facebookUrl,  set: setFacebookUrl,  placeholder: '👍 Facebook kullanıcı adı' },
            { key: 'tiktok'    as const, value: tiktokUrl,    set: setTiktokUrl,    placeholder: '🎵 TikTok kullanıcı adı' },
            { key: 'youtube'   as const, value: youtubeUrl,   set: setYoutubeUrl,   placeholder: '▶ YouTube kullanıcı adı veya kanal' },
          ]).map((row) => (
            <View key={row.key} style={styles.socialRow}>
              <TextInput
                style={[styles.input, styles.socialInput, { backgroundColor: C.card, borderColor: C.border, color: C.text }]}
                placeholder={row.placeholder}
                placeholderTextColor={C.placeholder}
                value={row.value}
                onChangeText={row.set}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={[styles.verifyBtn, { borderColor: C.primary + '66' }]}
                onPress={() => openSocialUrl(row.value, row.key)}
                disabled={!row.value.trim()}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[styles.verifyBtnText, { color: row.value.trim() ? C.primary : C.placeholder }]}>🔗 Aç</Text>
              </TouchableOpacity>
            </View>
          ))}

          {/* Google İşletme Bilgileri (opsiyonel) */}
          <Text style={[styles.label, { color: C.textSecondary, marginTop: Spacing.sm }]}>Google İşletme (opsiyonel)</Text>
          <TouchableOpacity
            style={[styles.locationBtn, { backgroundColor: isFetchingGoogle ? C.border : '#4285F4' + '15', borderColor: '#4285F4' + '55' }]}
            disabled={isFetchingGoogle || !name.trim()}
            onPress={fetchGoogle}
          >
            {isFetchingGoogle
              ? <ActivityIndicator color="#4285F4" size="small" />
              : <Text style={[styles.locationBtnText, { color: '#4285F4' }]}>🌐 Google'dan Otomatik Getir</Text>}
          </TouchableOpacity>
          {(googleRating || googleReviewCount) ? (
            <View style={[styles.googlePreview, { backgroundColor: '#4285F4' + '12', borderColor: '#4285F4' + '33' }]}>
              <Text style={{ color: '#4285F4', fontSize: 13, fontWeight: '600' }}>
                🌐 Google · ★ {googleRating || '—'} · {googleReviewCount || '0'} yorum
              </Text>
            </View>
          ) : null}

          {error && (
            <View style={[styles.errorBox, { backgroundColor: C.error + '15', borderColor: C.error + '40' }]}>
              <Text style={[styles.errorText, { color: C.error }]}>⚠️ {error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: C.primary }, isLoading && styles.btnDisabled]}
            onPress={handleCreate}
            disabled={isLoading}
          >
            {isLoading
              ? <ActivityIndicator color="#FFF" />
              : <Text style={styles.btnText}>🏪 Dükkanı Oluştur</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingTop: 72 },
  title: { fontSize: FontSize.xxl, fontWeight: '800', marginBottom: Spacing.xs },
  subtitle: { fontSize: FontSize.md, lineHeight: 22, marginBottom: Spacing.md },
  infoCard: {
    borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  infoCardText: { fontSize: FontSize.sm, lineHeight: 20 },
  form: { gap: Spacing.md },
  label: { fontSize: FontSize.sm, fontWeight: '600' },
  input: {
    borderWidth: 1.5, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 14,
    fontSize: FontSize.md,
  },
  multiline: { height: 90 },
  locationRow: { flexDirection: 'row', gap: Spacing.sm },
  locationBtn: {
    flex: 1, borderWidth: 1, borderRadius: Radius.md,
    paddingVertical: 12, alignItems: 'center', justifyContent: 'center',
  },
  locationBtnText: { fontSize: FontSize.sm, fontWeight: '700' },
  hoursCard: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.sm, gap: 6 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dayLabel: { width: 32, fontSize: FontSize.sm, fontWeight: '700' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  timeInput: {
    borderWidth: 1, borderRadius: Radius.sm,
    paddingHorizontal: 8, paddingVertical: 6,
    fontSize: FontSize.sm, width: 56, textAlign: 'center',
  },
  closedLabel: { fontSize: FontSize.sm, flex: 1, textAlign: 'center' },
  socialRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  socialInput: { flex: 1, paddingVertical: 10 },
  verifyBtn: {
    borderWidth: 1.5, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
  },
  verifyBtnText: { fontSize: FontSize.sm, fontWeight: '700' },
  googlePreview: {
    padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 1, alignItems: 'center',
  },
  errorBox: { borderWidth: 1, borderRadius: Radius.sm, padding: Spacing.sm },
  errorText: { fontSize: FontSize.sm, fontWeight: '500' },
  btn: {
    paddingVertical: 16, borderRadius: Radius.full,
    alignItems: 'center', marginTop: Spacing.sm,
  },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: '#FFF', fontSize: FontSize.lg, fontWeight: '700' },
});
