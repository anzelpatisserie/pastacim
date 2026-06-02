import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  TextInput, ScrollView, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, Image, Switch, Share, Linking,
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { supabase, useAuth, useThemeColors, Spacing, Radius, FontSize, DEFAULT_LOCATION } from '@pastacim/shared';
import type { Database } from '@pastacim/shared';

type Shop = Database['public']['Tables']['pastry_shops']['Row'];

function extractHandle(url: string, platform: 'instagram' | 'facebook' | 'tiktok' | 'youtube'): string {
  if (!url) return '';
  if (!url.startsWith('http')) return url.replace(/^@/, '');
  const patterns: Record<string, RegExp> = {
    instagram: /instagram\.com\/@?([^/?#\s]+)/,
    facebook:  /facebook\.com\/@?([^/?#\s]+)/,
    tiktok:    /tiktok\.com\/@?([^/?#\s]+)/,
    youtube:   /youtube\.com\/(?:@|channel\/|user\/)?([^/?#\s]+)/,
  };
  const m = url.match(patterns[platform]);
  return m ? m[1] : url;
}

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _db: any = supabase;

type Review = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  customer: { full_name: string | null } | null;
};

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

export default function BakerProfileScreen() {
  const C = useThemeColors();
  const { profile, signOut } = useAuth();

  const [shop, setShop] = useState<Shop | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [editMode, setEditMode] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [workingHours, setWorkingHours] = useState<WorkingHours>({ ...DEFAULT_HOURS });

  // Sosyal medya & Google form state
  const [instagramUrl, setInstagramUrl] = useState('');
  const [facebookUrl, setFacebookUrl] = useState('');
  const [tiktokUrl, setTiktokUrl] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  const [googleRating, setGoogleRating] = useState('');
  const [googleReviewCount, setGoogleReviewCount] = useState('');

  const loadShop = useCallback(async () => {
    if (!profile?.id) return;
    setIsLoading(true);
    const walletRes = await _db.from('users').select('wallet_balance').eq('id', profile.id).single();
    if (walletRes.data) setWalletBalance(Number(walletRes.data.wallet_balance ?? 0));

    const { data } = await _db
      .from('pastry_shops')
      .select('*')
      .eq('user_id', profile.id)
      .maybeSingle();
    const shopData = data as Shop | null;
    setShop(shopData ?? null);
    if (shopData) {
      setName(shopData.name);
      setDescription(shopData.description ?? '');
      setAddress(shopData.address ?? '');
      setLatitude(shopData.latitude ?? null);
      setLongitude(shopData.longitude ?? null);
      setCoverImageUrl(shopData.cover_image_url ?? null);
      const wh = shopData.working_hours as WorkingHours | null;
      setWorkingHours(wh ?? { ...DEFAULT_HOURS });
      setInstagramUrl(extractHandle(shopData.instagram_url ?? '', 'instagram'));
      setFacebookUrl(extractHandle(shopData.facebook_url ?? '', 'facebook'));
      setTiktokUrl(extractHandle(shopData.tiktok_url ?? '', 'tiktok'));
      setYoutubeUrl(extractHandle(shopData.youtube_url ?? '', 'youtube'));
      setGoogleMapsUrl(shopData.google_maps_url ?? '');
      setGoogleRating(shopData.google_rating != null ? String(shopData.google_rating) : '');
      setGoogleReviewCount(shopData.google_review_count > 0 ? String(shopData.google_review_count) : '');

      // Yorumları yükle
      const { data: revData } = await _db
        .from('reviews')
        .select('id, rating, comment, created_at, customer:users!customer_id(full_name)')
        .eq('shop_id', shopData.id)
        .order('created_at', { ascending: false })
        .limit(20);
      setReviews((revData ?? []) as Review[]);
    }
    setIsLoading(false);
  }, [profile?.id]);

  useEffect(() => { loadShop(); }, [loadShop]);

  const getLocation = async () => {
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
      Alert.alert('✅ Konum Alındı', `${loc.coords.latitude.toFixed(5)}, ${loc.coords.longitude.toFixed(5)}`);
    } catch {
      Alert.alert('Hata', 'Konum alınamadı.');
    }
    setIsLocating(false);
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
        setIsLocating(false);
        return;
      }
      const { latitude: lat, longitude: lng } = results[0];
      setLatitude(lat);
      setLongitude(lng);
      Alert.alert('✅ Konum Belirlendi', `"${address.trim()}" adresi koordinatlara çevrildi.`);
    } catch {
      Alert.alert('Hata', 'Adres çevrilemedi. Mevcut konumu kullanmayı deneyin.');
    }
    setIsLocating(false);
  };

  const pickCoverPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('İzin Gerekli', 'Fotoğraf seçmek için galeri erişimine izin verin.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    if (!shop?.id) { Alert.alert('Önce kaydet', 'Fotoğraf yüklemek için önce dükkanı kaydedin.'); return; }

    setIsUploadingPhoto(true);
    try {
      const asset = result.assets[0];
      const path = `covers/${shop.id}.jpg`;

      const response = await fetch(asset.uri);
      if (!response.ok) throw new Error('Görsel okunamadı');
      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength === 0) throw new Error('Boş görsel');

      const { error: upErr } = await supabase.storage
        .from('shop-images')
        .upload(path, arrayBuffer, { contentType: 'image/jpeg', upsert: true });

      if (upErr) throw new Error(upErr.message);

      const { data: urlData } = supabase.storage.from('shop-images').getPublicUrl(path);
      const url = urlData.publicUrl + `?t=${Date.now()}`;

      await _db.from('pastry_shops').update({ cover_image_url: url }).eq('id', shop.id);
      setCoverImageUrl(url);
      setShop((prev) => prev ? { ...prev, cover_image_url: url } : prev);
      Alert.alert('✅ Fotoğraf Güncellendi');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Bilinmeyen hata';
      Alert.alert('Hata', `Fotoğraf yüklenemedi: ${msg}`);
    }
    setIsUploadingPhoto(false);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Eksik bilgi', 'Dükkan adı zorunludur.');
      return;
    }
    if (!profile?.id) return;

    setIsSaving(true);
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      address: address.trim() || null,
      latitude,
      longitude,
      working_hours: workingHours,
      instagram_url: buildSocialUrl(instagramUrl, 'instagram'),
      facebook_url: buildSocialUrl(facebookUrl, 'facebook'),
      tiktok_url: buildSocialUrl(tiktokUrl, 'tiktok'),
      youtube_url: buildSocialUrl(youtubeUrl, 'youtube'),
      google_maps_url: googleMapsUrl.trim() || null,
      google_rating: googleRating ? parseFloat(googleRating) : null,
      google_review_count: googleReviewCount ? parseInt(googleReviewCount, 10) : 0,
    };

    if (shop) {
      const { error } = await _db.from('pastry_shops').update(payload).eq('id', shop.id);
      if (error) {
        Alert.alert('Hata', 'Profil güncellenemedi.');
      } else {
        Alert.alert('✅ Kaydedildi', 'Dükkan profiliniz güncellendi.');
        await loadShop();
        setEditMode(false);
      }
    } else {
      const { error } = await _db.from('pastry_shops').insert({
        user_id: profile.id,
        ...payload,
        latitude: payload.latitude ?? DEFAULT_LOCATION.latitude,
        longitude: payload.longitude ?? DEFAULT_LOCATION.longitude,
      });
      if (error) {
        Alert.alert('Hata', 'Dükkan oluşturulamadı: ' + error.message);
      } else {
        Alert.alert('🎉 Dükkan Oluşturuldu!', 'Artık taleplere teklif verebilirsiniz.');
        await loadShop();
        setEditMode(false);
      }
    }
    setIsSaving(false);
  };

  const updateDay = (day: DayKey, field: keyof WorkingDay, value: string | boolean) => {
    setWorkingHours((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }));
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.header, { borderBottomColor: C.border }]}>
          <Text style={[styles.title, { color: C.text }]}>Profilim</Text>
          <TouchableOpacity style={[styles.signOutBtn, { backgroundColor: C.border }]} onPress={signOut}>
            <Text style={[styles.signOutText, { color: C.textSecondary }]}>Çıkış</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Kullanıcı Bilgileri */}
          <View style={[styles.userCard, { backgroundColor: C.card, borderColor: C.border }]}>
            <View style={[styles.avatarCircle, { backgroundColor: C.primary + '22' }]}>
              <Text style={styles.avatarEmoji}>👨‍🍳</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.userName, { color: C.text }]}>{profile?.full_name ?? '—'}</Text>
              <Text style={[styles.userEmail, { color: C.textSecondary }]}>{profile?.email ?? '—'}</Text>
            </View>
          </View>

          {/* Cüzdan Özeti */}
          <TouchableOpacity
            style={[styles.walletCard, { backgroundColor: C.primary }]}
            onPress={() => (router as any).push('/(baker)/wallet')}
            activeOpacity={0.85}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.walletLabel}>💰 Cüzdan Bakiyesi</Text>
              <Text style={styles.walletAmount}>
                ₺{Math.floor(walletBalance).toLocaleString('en-US')}
              </Text>
            </View>
            <Text style={styles.walletArrow}>→</Text>
          </TouchableOpacity>

          {/* Dükkan Profili */}
          {!shop && !editMode ? (
            <View style={[styles.noShopBox, { backgroundColor: C.card, borderColor: C.border }]}>
              <Text style={styles.noShopEmoji}>🏪</Text>
              <Text style={[styles.noShopTitle, { color: C.text }]}>Dükkan Profili Yok</Text>
              <Text style={[styles.noShopSubtitle, { color: C.textSecondary }]}>
                Taleplere teklif verebilmek için dükkan profilinizi oluşturun
              </Text>
              <TouchableOpacity
                style={[styles.createShopBtn, { backgroundColor: C.primary }]}
                onPress={() => setEditMode(true)}
              >
                <Text style={styles.createShopBtnText}>🏪 Dükkan Oluştur</Text>
              </TouchableOpacity>
            </View>
          ) : shop && !editMode ? (
            <>
              {/* Kapak Fotoğrafı */}
              <TouchableOpacity
                style={[styles.coverContainer, { backgroundColor: C.card, borderColor: C.border }]}
                onPress={pickCoverPhoto}
                disabled={isUploadingPhoto}
              >
                {coverImageUrl ? (
                  <Image source={{ uri: coverImageUrl }} style={styles.coverImage} resizeMode="cover" />
                ) : (
                  <View style={[styles.coverPlaceholder, { backgroundColor: C.skeleton }]}>
                    <Text style={styles.coverPlaceholderEmoji}>🎂</Text>
                    <Text style={[styles.coverPlaceholderText, { color: C.textSecondary }]}>
                      Kapak fotoğrafı ekle
                    </Text>
                  </View>
                )}
                {isUploadingPhoto && (
                  <View style={styles.uploadOverlay}>
                    <ActivityIndicator size="large" color="#FFF" />
                  </View>
                )}
                <View style={[styles.coverEditBadge, { backgroundColor: C.primary }]}>
                  <Text style={styles.coverEditText}>📷</Text>
                </View>
              </TouchableOpacity>

              {/* Dükkan Bilgileri */}
              <View style={[styles.shopCard, { backgroundColor: C.card, borderColor: C.border }]}>
                <View style={styles.shopCardHeader}>
                  <Text style={[styles.shopName, { color: C.text }]}>{shop.name}</Text>
                  <TouchableOpacity
                    style={[styles.editBtn, { borderColor: C.primary }]}
                    onPress={() => setEditMode(true)}
                  >
                    <Text style={[styles.editBtnText, { color: C.primary }]}>Düzenle</Text>
                  </TouchableOpacity>
                </View>
                {shop.description && (
                  <Text style={[styles.shopDesc, { color: C.textSecondary }]}>{shop.description}</Text>
                )}
                <View style={styles.shopStats}>
                  <View style={[styles.statBox, { backgroundColor: C.background }]}>
                    <Text style={[styles.statValue, { color: C.primary }]}>
                      {shop.rating > 0 ? shop.rating.toFixed(1) : '—'}
                    </Text>
                    <Text style={[styles.statLabel, { color: C.textSecondary }]}>⭐ Puan</Text>
                  </View>
                  <View style={[styles.statBox, { backgroundColor: C.background }]}>
                    <Text style={[styles.statValue, { color: C.primary }]}>{shop.review_count}</Text>
                    <Text style={[styles.statLabel, { color: C.textSecondary }]}>📝 Yorum</Text>
                  </View>
                  <View style={[styles.statBox, { backgroundColor: C.background }]}>
                    <Text style={[styles.statValue, { color: shop.is_active ? C.success : C.error }]}>
                      {shop.is_active ? 'Açık' : 'Kapalı'}
                    </Text>
                    <Text style={[styles.statLabel, { color: C.textSecondary }]}>Durum</Text>
                  </View>
                </View>
                {shop.address && (
                  <Text style={[styles.shopAddress, { color: C.textSecondary }]}>📍 {shop.address}</Text>
                )}

                {/* Google Bilgileri */}
                {(shop.google_rating != null || shop.google_review_count > 0) && (
                  <View style={[styles.googleRow, { backgroundColor: C.background }]}>
                    <Text style={{ fontSize: 16 }}>🌐</Text>
                    <Text style={[styles.googleText, { color: C.text }]}>Google</Text>
                    {shop.google_rating != null && (
                      <Text style={[styles.googleRatingText, { color: '#F5A623' }]}>★ {shop.google_rating.toFixed(1)}</Text>
                    )}
                    {shop.google_review_count > 0 && (
                      <Text style={[styles.googleReviewText, { color: C.textSecondary }]}>({shop.google_review_count} yorum)</Text>
                    )}
                    {shop.google_maps_url ? (
                      <TouchableOpacity onPress={() => Linking.openURL(shop.google_maps_url!)}>
                        <Text style={[styles.socialLinkBtn, { color: C.primary }]}>Haritada Gör →</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                )}

                {/* Sosyal Medya Linkleri */}
                {(shop.instagram_url || shop.facebook_url || shop.tiktok_url || shop.youtube_url) && (
                  <View style={styles.socialRow}>
                    {shop.instagram_url && (
                      <TouchableOpacity
                        style={[styles.socialBtn, { backgroundColor: '#E1306C' + '22', borderColor: '#E1306C' + '44' }]}
                        onPress={() => Linking.openURL(shop.instagram_url!)}
                      >
                        <Text style={[styles.socialBtnText, { color: '#E1306C' }]}>Instagram</Text>
                      </TouchableOpacity>
                    )}
                    {shop.facebook_url && (
                      <TouchableOpacity
                        style={[styles.socialBtn, { backgroundColor: '#1877F2' + '22', borderColor: '#1877F2' + '44' }]}
                        onPress={() => Linking.openURL(shop.facebook_url!)}
                      >
                        <Text style={[styles.socialBtnText, { color: '#1877F2' }]}>Facebook</Text>
                      </TouchableOpacity>
                    )}
                    {shop.tiktok_url && (
                      <TouchableOpacity
                        style={[styles.socialBtn, { backgroundColor: '#000000' + '15', borderColor: C.border }]}
                        onPress={() => Linking.openURL(shop.tiktok_url!)}
                      >
                        <Text style={[styles.socialBtnText, { color: C.text }]}>TikTok</Text>
                      </TouchableOpacity>
                    )}
                    {shop.youtube_url && (
                      <TouchableOpacity
                        style={[styles.socialBtn, { backgroundColor: '#FF0000' + '15', borderColor: '#FF0000' + '44' }]}
                        onPress={() => Linking.openURL(shop.youtube_url!)}
                      >
                        <Text style={[styles.socialBtnText, { color: '#FF0000' }]}>YouTube</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>

              {/* Yorum Listesi */}
              {reviews.length > 0 && (
                <View style={[styles.reviewsSection, { backgroundColor: C.card, borderColor: C.border }]}>
                  <Text style={[styles.reviewsTitle, { color: C.text }]}>📝 Müşteri Yorumları</Text>
                  {reviews.map((r) => (
                    <View key={r.id} style={[styles.reviewItem, { borderTopColor: C.border }]}>
                      <View style={styles.reviewHeader}>
                        <Text style={[styles.reviewCustomer, { color: C.text }]}>
                          {r.customer?.full_name ?? 'Müşteri'}
                        </Text>
                        <Text style={styles.reviewStars}>
                          {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                        </Text>
                      </View>
                      {r.comment && (
                        <Text style={[styles.reviewComment, { color: C.textSecondary }]}>{r.comment}</Text>
                      )}
                      <Text style={[styles.reviewDate, { color: C.placeholder }]}>
                        {new Date(r.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          ) : null}

          {/* Düzenleme Formu */}
          {editMode && (
            <View style={[styles.formCard, { backgroundColor: C.card, borderColor: C.border }]}>
              <Text style={[styles.formTitle, { color: C.text }]}>
                {shop ? 'Dükkan Bilgilerini Düzenle' : 'Yeni Dükkan Oluştur'}
              </Text>

              <View style={styles.field}>
                <Text style={[styles.label, { color: C.text }]}>Dükkan Adı *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: C.background, borderColor: C.border, color: C.text }]}
                  placeholder="Örn: Gül Pastanesi"
                  placeholderTextColor={C.placeholder}
                  value={name}
                  onChangeText={setName}
                  maxLength={100}
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, { color: C.text }]}>Açıklama</Text>
                <TextInput
                  style={[styles.inputMulti, { backgroundColor: C.background, borderColor: C.border, color: C.text }]}
                  placeholder="Uzmanlık alanları, özel ürünler, deneyim..."
                  placeholderTextColor={C.placeholder}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  maxLength={300}
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, { color: C.text }]}>Adres</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: C.background, borderColor: C.border, color: C.text }]}
                  placeholder="Dükkan adresi"
                  placeholderTextColor={C.placeholder}
                  value={address}
                  onChangeText={setAddress}
                  maxLength={200}
                />
              </View>

              {/* Konum */}
              <View style={styles.field}>
                <Text style={[styles.label, { color: C.text }]}>Konum</Text>
                {latitude ? (
                  <Text style={[styles.locationBtnText, { color: C.success, marginBottom: 4 }]}>
                    ✅ {latitude.toFixed(4)}, {longitude?.toFixed(4)}
                  </Text>
                ) : null}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={[styles.locationBtn, { flex: 1, backgroundColor: C.primary + '15', borderColor: C.primary + '44' }]}
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
                    style={[styles.locationBtn, { flex: 1, backgroundColor: C.background, borderColor: C.border }]}
                    onPress={getLocation}
                    disabled={isLocating}
                  >
                    <Text style={[styles.locationBtnText, { color: C.textSecondary }]}>📍 Mevcut Konum</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Çalışma Saatleri */}
              <View style={styles.field}>
                <Text style={[styles.label, { color: C.text }]}>Çalışma Saatleri</Text>
                <View style={[styles.hoursCard, { backgroundColor: C.background, borderColor: C.border }]}>
                  {DAY_KEYS.map((day) => {
                    const d = workingHours[day] ?? { open: '09:00', close: '18:00', closed: false };
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
                              style={[styles.timeInput, { borderColor: C.border, color: C.text, backgroundColor: C.card }]}
                              value={d.open}
                              onChangeText={(v) => updateDay(day, 'open', v)}
                              placeholder="09:00"
                              placeholderTextColor={C.placeholder}
                              maxLength={5}
                            />
                            <Text style={[styles.timeSep, { color: C.textSecondary }]}>–</Text>
                            <TextInput
                              style={[styles.timeInput, { borderColor: C.border, color: C.text, backgroundColor: C.card }]}
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
              </View>

              {/* Sosyal Medya */}
              <View style={styles.field}>
                <Text style={[styles.label, { color: C.text }]}>Sosyal Medya (kullanıcı adı)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: C.background, borderColor: C.border, color: C.text }]}
                  placeholder="📸 Instagram kullanıcı adı"
                  placeholderTextColor={C.placeholder}
                  value={instagramUrl}
                  onChangeText={setInstagramUrl}
                  autoCapitalize="none"
                  keyboardType="default"
                />
                <TextInput
                  style={[styles.input, { backgroundColor: C.background, borderColor: C.border, color: C.text }]}
                  placeholder="👍 Facebook kullanıcı adı"
                  placeholderTextColor={C.placeholder}
                  value={facebookUrl}
                  onChangeText={setFacebookUrl}
                  autoCapitalize="none"
                  keyboardType="default"
                />
                <TextInput
                  style={[styles.input, { backgroundColor: C.background, borderColor: C.border, color: C.text }]}
                  placeholder="🎵 TikTok kullanıcı adı"
                  placeholderTextColor={C.placeholder}
                  value={tiktokUrl}
                  onChangeText={setTiktokUrl}
                  autoCapitalize="none"
                  keyboardType="default"
                />
                <TextInput
                  style={[styles.input, { backgroundColor: C.background, borderColor: C.border, color: C.text }]}
                  placeholder="▶ YouTube kullanıcı adı veya kanal adı"
                  placeholderTextColor={C.placeholder}
                  value={youtubeUrl}
                  onChangeText={setYoutubeUrl}
                  autoCapitalize="none"
                  keyboardType="default"
                />
              </View>

              {/* Google Bilgileri */}
              <View style={styles.field}>
                <Text style={[styles.label, { color: C.text }]}>Google Bilgileri</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: C.background, borderColor: C.border, color: C.text }]}
                  placeholder="Google Maps URL"
                  placeholderTextColor={C.placeholder}
                  value={googleMapsUrl}
                  onChangeText={setGoogleMapsUrl}
                  autoCapitalize="none"
                  keyboardType="url"
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    style={[styles.input, { flex: 1, backgroundColor: C.background, borderColor: C.border, color: C.text }]}
                    placeholder="Google Puanı (ör: 4.7)"
                    placeholderTextColor={C.placeholder}
                    value={googleRating}
                    onChangeText={setGoogleRating}
                    keyboardType="decimal-pad"
                    maxLength={3}
                  />
                  <TextInput
                    style={[styles.input, { flex: 1, backgroundColor: C.background, borderColor: C.border, color: C.text }]}
                    placeholder="Yorum Sayısı"
                    placeholderTextColor={C.placeholder}
                    value={googleReviewCount}
                    onChangeText={setGoogleReviewCount}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                </View>
              </View>

              <View style={styles.formBtns}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: C.border }]}
                  onPress={() => {
                    setEditMode(false);
                    if (shop) {
                      setName(shop.name);
                      setDescription(shop.description ?? '');
                      setAddress(shop.address ?? '');
                      setWorkingHours((shop.working_hours as WorkingHours | null) ?? { ...DEFAULT_HOURS });
                      setInstagramUrl(shop.instagram_url ?? '');
                      setFacebookUrl(shop.facebook_url ?? '');
                      setTiktokUrl(shop.tiktok_url ?? '');
                      setYoutubeUrl(shop.youtube_url ?? '');
                      setGoogleMapsUrl(shop.google_maps_url ?? '');
                      setGoogleRating(shop.google_rating != null ? String(shop.google_rating) : '');
                      setGoogleReviewCount(shop.google_review_count > 0 ? String(shop.google_review_count) : '');
                    }
                  }}
                >
                  <Text style={[styles.cancelBtnText, { color: C.textSecondary }]}>Vazgeç</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: C.primary }]}
                  onPress={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                    <Text style={styles.saveBtnText}>💾 Kaydet</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Uygulamayı Tavsiye Et */}
          {!editMode && (
            <TouchableOpacity
              style={[styles.shareCard, { backgroundColor: C.card, borderColor: C.border }]}
              onPress={() => Share.share({
                message: 'Pastacım Pro ile sipariş al, kolay yönet! 🎂\nhttps://pastacim.app',
                title: 'Pastacım Pro\'yu Arkadaşlarına Öner',
              })}
              activeOpacity={0.85}
            >
              <Text style={styles.shareEmoji}>🎁</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.shareTitle, { color: C.text }]}>Uygulamayı Tavsiye Et</Text>
                <Text style={[styles.shareSub, { color: C.textSecondary }]}>
                  Pastacım Pro'yu arkadaşlarına öner
                </Text>
              </View>
              <Text style={[styles.shareArrow, { color: C.primary }]}>→</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1,
  },
  title: { fontSize: FontSize.xl, fontWeight: '800' },
  signOutBtn: { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.sm },
  signOutText: { fontSize: FontSize.xs, fontWeight: '600' },
  content: { padding: Spacing.lg, gap: Spacing.md },
  userCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md,
  },
  avatarCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  avatarEmoji: { fontSize: 32 },
  userName: { fontSize: FontSize.lg, fontWeight: '700' },
  userEmail: { fontSize: FontSize.sm },
  noShopBox: {
    borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.xl,
    alignItems: 'center', gap: Spacing.md,
  },
  noShopEmoji: { fontSize: 48 },
  noShopTitle: { fontSize: FontSize.lg, fontWeight: '700' },
  noShopSubtitle: { fontSize: FontSize.sm, textAlign: 'center' },
  createShopBtn: { paddingHorizontal: Spacing.xl, paddingVertical: 12, borderRadius: Radius.full },
  createShopBtnText: { color: '#FFF', fontWeight: '700', fontSize: FontSize.md },
  coverContainer: {
    height: 180, borderRadius: Radius.lg, borderWidth: 1,
    overflow: 'hidden', position: 'relative',
  },
  coverImage: { width: '100%', height: '100%' },
  coverPlaceholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
  },
  coverPlaceholderEmoji: { fontSize: 40 },
  coverPlaceholderText: { fontSize: FontSize.sm },
  uploadOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  coverEditBadge: {
    position: 'absolute', bottom: 10, right: 10,
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  coverEditText: { fontSize: 16 },
  shopCard: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  shopCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  shopName: { fontSize: FontSize.lg, fontWeight: '800', flex: 1 },
  editBtn: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1.5 },
  editBtnText: { fontSize: FontSize.sm, fontWeight: '600' },
  shopDesc: { fontSize: FontSize.sm, lineHeight: 18 },
  shopStats: { flexDirection: 'row', gap: Spacing.sm },
  statBox: { flex: 1, padding: Spacing.sm, borderRadius: Radius.md, alignItems: 'center' },
  statValue: { fontSize: FontSize.lg, fontWeight: '800' },
  statLabel: { fontSize: FontSize.xs },
  shopAddress: { fontSize: FontSize.sm },
  reviewsSection: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  reviewsTitle: { fontSize: FontSize.md, fontWeight: '700' },
  reviewItem: { paddingTop: Spacing.sm, borderTopWidth: 1, gap: 3 },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewCustomer: { fontSize: FontSize.sm, fontWeight: '700' },
  reviewStars: { fontSize: 13, color: '#F5A623' },
  reviewComment: { fontSize: FontSize.sm, lineHeight: 18 },
  reviewDate: { fontSize: FontSize.xs },
  formCard: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.md },
  formTitle: { fontSize: FontSize.md, fontWeight: '700' },
  field: { gap: Spacing.xs },
  label: { fontSize: FontSize.sm, fontWeight: '600' },
  input: {
    borderWidth: 1, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 12, fontSize: FontSize.md,
  },
  inputMulti: {
    borderWidth: 1, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    fontSize: FontSize.md, minHeight: 80,
  },
  locationBtn: {
    borderWidth: 1, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 12, alignItems: 'center',
  },
  locationBtnText: { fontSize: FontSize.sm, fontWeight: '600' },
  hoursCard: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.sm, gap: 6 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dayLabel: { width: 32, fontSize: FontSize.sm, fontWeight: '700' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  timeInput: {
    borderWidth: 1, borderRadius: Radius.sm,
    paddingHorizontal: 8, paddingVertical: 6,
    fontSize: FontSize.sm, width: 56, textAlign: 'center',
  },
  timeSep: { fontSize: FontSize.sm },
  closedLabel: { fontSize: FontSize.sm, flex: 1, textAlign: 'center' },
  formBtns: { flexDirection: 'row', gap: Spacing.sm },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: Radius.full, borderWidth: 1.5, alignItems: 'center' },
  cancelBtnText: { fontSize: FontSize.sm, fontWeight: '600' },
  saveBtn: { flex: 2, paddingVertical: 12, borderRadius: Radius.full, alignItems: 'center' },
  saveBtnText: { color: '#FFF', fontSize: FontSize.sm, fontWeight: '700' },
  walletCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: Radius.xl, padding: Spacing.lg,
    shadowColor: '#D4526E', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  walletLabel: { color: 'rgba(255,255,255,0.8)', fontSize: FontSize.sm, marginBottom: 4 },
  walletAmount: { color: '#FFF', fontSize: 32, fontWeight: '800' },
  walletArrow: { color: 'rgba(255,255,255,0.8)', fontSize: 24, fontWeight: '300' },
  shareCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md,
  },
  shareEmoji: { fontSize: 32 },
  shareTitle: { fontSize: FontSize.md, fontWeight: '700' },
  shareSub: { fontSize: FontSize.xs, marginTop: 2 },
  shareArrow: { fontSize: 20, fontWeight: '300' },
  googleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: Radius.md, padding: Spacing.sm, flexWrap: 'wrap',
  },
  googleText: { fontSize: FontSize.sm, fontWeight: '600' },
  googleRatingText: { fontSize: FontSize.sm, fontWeight: '700' },
  googleReviewText: { fontSize: FontSize.xs },
  socialLinkBtn: { fontSize: FontSize.xs, fontWeight: '700', textDecorationLine: 'underline' },
  socialRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  socialBtn: {
    paddingHorizontal: Spacing.sm, paddingVertical: 5,
    borderRadius: Radius.full, borderWidth: 1,
  },
  socialBtnText: { fontSize: FontSize.xs, fontWeight: '700' },
});
