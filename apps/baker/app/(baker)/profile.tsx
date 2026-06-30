import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ScrollView, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, Image, Switch, Linking,
  Modal, LayoutAnimation, UIManager,
} from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import Constants from 'expo-constants';
import { supabase, useAuth, useThemeColors, Spacing, Radius, FontSize, DEFAULT_LOCATION, FeedbackModal, TabHeader, openAddressInMaps, shareApp } from '@pastacim/shared';
import { useNotifications } from '../../hooks/useNotifications';
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

const PLACES_API_KEY: string = Constants.expoConfig?.extra?.googlePlacesApiKey ?? '';

function normalizeShopName(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/[^a-z0-9çğıöşü\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function nameSimilarity(a: string, b: string): number {
  const A = normalizeShopName(a);
  const B = normalizeShopName(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  if (B.includes(A) || A.includes(B)) return 0.85;
  const aTokens = new Set(A.split(' '));
  const bTokens = new Set(B.split(' '));
  let common = 0;
  aTokens.forEach((t) => { if (bTokens.has(t)) common += 1; });
  const denom = Math.max(aTokens.size, bTokens.size);
  return denom > 0 ? common / denom : 0;
}

async function fetchGooglePlaceByName(
  shopName: string,
  lat?: number | null,
  lng?: number | null,
): Promise<{
  rating: number | null; reviewCount: number; mapsUrl: string | null;
  matchedName: string | null; similarity: number;
} | null> {
  try {
    // Dükkânın konumu varsa aramayı oraya yanlılaştır — aksi halde
    // ülkedeki başka bir aynı isimli işletme bulunup yanlış adres dönebiliyor.
    const locationBias =
      lat != null && lng != null ? `&location=${lat},${lng}&radius=3000` : '';
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(shopName + ' pastane')}${locationBias}&key=${PLACES_API_KEY}`
    );
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      const place = data.results[0];
      const matchedName = (place.name ?? null) as string | null;
      const sim = matchedName ? nameSimilarity(shopName, matchedName) : 0;
      // Evrensel Maps URL formatı (api=1): query = isim/etiket, query_place_id =
      // tam yer. Eski `?q=place_id:` formatı Maps uygulamasında "_id:..." diye
      // aranıp bozuluyordu.
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _db: any = supabase;

type Review = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  is_anonymous: boolean;
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
  const { profile, signOut, refreshProfile } = useAuth();
  const { unreadCount } = useNotifications(profile?.id);
  const { openFeedback } = useLocalSearchParams<{ openFeedback?: string }>();

  const [shop, setShop] = useState<Shop | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFetchingGoogle, setIsFetchingGoogle] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  // Collapse + hesap ayarları
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [isSavingPhone, setIsSavingPhone] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  const toggleSettings = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSettingsOpen((v) => !v);
  };
  const toggleReviews = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setReviewsOpen((v) => !v);
  };

  const pickAvatar = async () => {
    if (!profile?.id) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('İzin Gerekli', 'Profil resmi seçmek için galeri erişimine izin verin.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    setIsUploadingAvatar(true);
    try {
      const asset = result.assets[0];
      const path = `${profile.id}/avatar.jpg`;
      const response = await fetch(asset.uri);
      if (!response.ok) throw new Error('Görsel okunamadı');
      const arrayBuffer = await response.arrayBuffer();
      const { error: upErr } = await supabase.storage
        .from('user-avatars')
        .upload(path, arrayBuffer, { contentType: 'image/jpeg', upsert: true });
      if (upErr) throw new Error(upErr.message);
      const { data: urlData } = supabase.storage.from('user-avatars').getPublicUrl(path);
      const url = urlData.publicUrl + `?t=${Date.now()}`;
      const { error: updErr } = await _db.from('users').update({ avatar_url: url }).eq('id', profile.id);
      if (updErr) throw new Error(updErr.message);
      await refreshProfile();
      Alert.alert('✅ Güncellendi', 'Profil resminiz güncellendi.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Bilinmeyen hata';
      Alert.alert('Hata', `Profil resmi yüklenemedi: ${msg}`);
    }
    setIsUploadingAvatar(false);
  };

  const openPhoneModal = () => {
    setPhoneInput(profile?.phone ?? '');
    setShowPhoneModal(true);
  };

  const savePhone = async () => {
    if (!profile?.id) return;
    setIsSavingPhone(true);
    const { error } = await _db
      .from('users')
      .update({ phone: phoneInput.trim() || null })
      .eq('id', profile.id);
    setIsSavingPhone(false);
    if (error) {
      Alert.alert('Hata', 'Telefon kaydedilemedi.');
    } else {
      await refreshProfile();
      setShowPhoneModal(false);
    }
  };

  const handlePasswordReset = () => {
    if (!profile?.email) {
      Alert.alert('Hata', 'E-posta adresiniz bulunamadı.');
      return;
    }
    Alert.alert(
      'Şifre Sıfırlama',
      `Şifre sıfırlama bağlantısı ${profile.email} adresine gönderilsin mi?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Gönder',
          onPress: async () => {
            setIsResettingPassword(true);
            const { error } = await supabase.auth.resetPasswordForEmail(profile.email!, {
              redirectTo: 'pastacim-pro://auth-callback?type=recovery',
            });
            setIsResettingPassword(false);
            if (error) {
              Alert.alert('Hata', 'Bağlantı gönderilemedi: ' + error.message);
            } else {
              Alert.alert('✅ Gönderildi', 'E-posta kutunuzu kontrol edin.');
            }
          },
        },
      ]
    );
  };

  const handleSignOut = () => {
    Alert.alert(
      'Çıkış Yap',
      'Hesabınızdan çıkmak istediğinizden emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        { text: 'Çıkış Yap', style: 'destructive', onPress: signOut },
      ]
    );
  };

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

    // En yeni dükkanı al (güvenlik için — duplicate olursa son yaratılan tutulur)
    const { data: shopRows } = await _db
      .from('pastry_shops')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(1);
    const shopData = (shopRows && shopRows.length > 0 ? shopRows[0] : null) as Shop | null;
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
      setGoogleReviewCount((shopData.google_review_count ?? 0) > 0 ? String(shopData.google_review_count) : '');

      // Yorumları yükle
      const { data: revData } = await _db
        .from('reviews')
        .select('id, rating, comment, created_at, is_anonymous, customer:users!customer_id(full_name)')
        .eq('shop_id', shopData.id)
        .order('created_at', { ascending: false })
        .limit(20);
      setReviews((revData ?? []) as Review[]);
    }
    setIsLoading(false);
  }, [profile?.id]);

  useEffect(() => { loadShop(); }, [loadShop]);

  // feedback_request bildiriminden gelindiyse (?openFeedback=1) modalı aç.
  useEffect(() => {
    if (openFeedback === '1') setShowFeedback(true);
  }, [openFeedback]);

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
      // RPC ile oluştur — duplicate koruması ve is_baker güncellemesi otomatik
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rpcData, error: rpcErr } = await (supabase as any).rpc('create_shop', {
        p_name: payload.name,
        p_description: payload.description,
        p_address: payload.address,
        p_latitude: payload.latitude ?? DEFAULT_LOCATION.latitude,
        p_longitude: payload.longitude ?? DEFAULT_LOCATION.longitude,
      });
      const rpcErrMsg = (rpcData as { error?: string } | null)?.error;
      if (rpcErr) {
        Alert.alert('Hata', 'Dükkan oluşturulamadı: ' + rpcErr.message);
      } else if (rpcErrMsg === 'mevcut_dukkan') {
        // Zaten dükkanı var, son halini yükle
        Alert.alert('Bilgi', 'Zaten bir dükkanınız var, mevcut dükkan yüklendi.');
        await loadShop();
        setEditMode(false);
      } else if (rpcErrMsg) {
        Alert.alert('Hata', rpcErrMsg);
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
      <View style={[styles.container, { backgroundColor: C.background }]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TabHeader
          title="Profilim"
          unreadCount={unreadCount}
          onBellPress={() => router.push('/(baker)/notifications' as never)}
        />

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Kullanıcı Bilgileri */}
          <View style={[styles.userCard, { backgroundColor: C.card, borderColor: C.border }]}>
            <TouchableOpacity
              onPress={pickAvatar}
              disabled={isUploadingAvatar}
              style={[styles.avatarCircle, { backgroundColor: C.primary + '22' }]}
              activeOpacity={0.8}
            >
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarEmoji}>👨‍🍳</Text>
              )}
              {isUploadingAvatar ? (
                <View style={styles.avatarOverlay}>
                  <ActivityIndicator color="#FFF" />
                </View>
              ) : null}
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={[styles.userName, { color: C.text }]}>{profile?.full_name ?? '—'}</Text>
              <Text style={[styles.userEmail, { color: C.textSecondary }]}>{profile?.email ?? '—'}</Text>
              {profile?.phone ? (
                <Text style={[styles.userPhone, { color: C.textSecondary }]}>📱 {profile.phone}</Text>
              ) : null}
            </View>
          </View>

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
                  <TouchableOpacity
                    onPress={() => openAddressInMaps(shop.address, shop.latitude, shop.longitude)}
                    activeOpacity={0.6}
                  >
                    <Text style={[styles.shopAddress, { color: C.primary }]}>📍 {shop.address} ›</Text>
                  </TouchableOpacity>
                )}

                {/* Google Bilgileri */}
                {(shop.google_rating != null || (shop.google_review_count ?? 0) > 0) && (
                  <View style={[styles.googleRow, { backgroundColor: C.background }]}>
                    <Text style={{ fontSize: 16 }}>🌐</Text>
                    <Text style={[styles.googleText, { color: C.text }]}>Google</Text>
                    {shop.google_rating != null && (
                      <Text style={[styles.googleRatingText, { color: '#F5A623' }]}>★ {shop.google_rating.toFixed(1)}</Text>
                    )}
                    {(shop.google_review_count ?? 0) > 0 && (
                      <Text style={[styles.googleReviewText, { color: C.textSecondary }]}>({shop.google_review_count} yorum)</Text>
                    )}
                    {(shop.latitude != null && shop.longitude != null) ? (
                      <TouchableOpacity onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${shop.latitude},${shop.longitude}`)}>
                        <Text style={[styles.socialLinkBtn, { color: C.primary }]}>Haritada Gör →</Text>
                      </TouchableOpacity>
                    ) : shop.google_maps_url ? (
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
                        style={[styles.socialBtn, { backgroundColor: '#E1306C' }]}
                        onPress={() => Linking.openURL(shop.instagram_url!)}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.socialBtnText}>📸 Instagram'ı Gör →</Text>
                      </TouchableOpacity>
                    )}
                    {shop.facebook_url && (
                      <TouchableOpacity
                        style={[styles.socialBtn, { backgroundColor: '#1877F2' }]}
                        onPress={() => Linking.openURL(shop.facebook_url!)}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.socialBtnText}>👍 Facebook'u Gör →</Text>
                      </TouchableOpacity>
                    )}
                    {shop.tiktok_url && (
                      <TouchableOpacity
                        style={[styles.socialBtn, { backgroundColor: '#000000' }]}
                        onPress={() => Linking.openURL(shop.tiktok_url!)}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.socialBtnText}>🎵 TikTok'u Gör →</Text>
                      </TouchableOpacity>
                    )}
                    {shop.youtube_url && (
                      <TouchableOpacity
                        style={[styles.socialBtn, { backgroundColor: '#FF0000' }]}
                        onPress={() => Linking.openURL(shop.youtube_url!)}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.socialBtnText}>▶ YouTube'u Gör →</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>

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
                {([
                  { key: 'instagram' as const, value: instagramUrl, set: setInstagramUrl, placeholder: '📸 Instagram kullanıcı adı' },
                  { key: 'facebook'  as const, value: facebookUrl,  set: setFacebookUrl,  placeholder: '👍 Facebook kullanıcı adı' },
                  { key: 'tiktok'    as const, value: tiktokUrl,    set: setTiktokUrl,    placeholder: '🎵 TikTok kullanıcı adı' },
                  { key: 'youtube'   as const, value: youtubeUrl,   set: setYoutubeUrl,   placeholder: '▶ YouTube kullanıcı adı veya kanal adı' },
                ]).map((row) => (
                  <View key={row.key} style={styles.socialInputRow}>
                    <TextInput
                      style={[styles.input, styles.socialInputFlex, { backgroundColor: C.background, borderColor: C.border, color: C.text }]}
                      placeholder={row.placeholder}
                      placeholderTextColor={C.placeholder}
                      value={row.value}
                      onChangeText={row.set}
                      autoCapitalize="none"
                      keyboardType="default"
                    />
                    <TouchableOpacity
                      style={[styles.verifyBtn, { borderColor: row.value.trim() ? C.primary + '88' : C.border }]}
                      onPress={() => {
                        const url = buildSocialUrl(row.value, row.key);
                        if (!url) {
                          Alert.alert('Kullanıcı Adı Boş', 'Önce bir kullanıcı adı yazın.');
                          return;
                        }
                        Linking.openURL(url).catch(() => Alert.alert('Hata', 'Bağlantı açılamadı.'));
                      }}
                      disabled={!row.value.trim()}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={[styles.verifyBtnText, { color: row.value.trim() ? C.primary : C.placeholder }]}>🔗 Aç</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>

              {/* Google Bilgileri */}
              <View style={styles.field}>
                <Text style={[styles.label, { color: C.text }]}>Google Bilgileri</Text>
                <TouchableOpacity
                  style={[styles.locationBtn, { backgroundColor: isFetchingGoogle ? C.border : '#4285F4' + '15', borderColor: '#4285F4' + '55' }]}
                  disabled={isFetchingGoogle || !name.trim()}
                  onPress={async () => {
                    if (!name.trim()) {
                      Alert.alert('Dükkan Adı Gerekli', 'Önce dükkan adını girin.');
                      return;
                    }
                    setIsFetchingGoogle(true);
                    const result = await fetchGooglePlaceByName(name.trim(), latitude, longitude);
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
                  }}
                >
                  {isFetchingGoogle
                    ? <ActivityIndicator color="#4285F4" size="small" />
                    : <Text style={[styles.locationBtnText, { color: '#4285F4' }]}>🌐 Google'dan Otomatik Getir</Text>
                  }
                </TouchableOpacity>
                {(googleRating || googleReviewCount) ? (
                  <View style={[styles.googlePreview, { backgroundColor: '#4285F4' + '12', borderColor: '#4285F4' + '33' }]}>
                    <Text style={{ color: '#4285F4', fontSize: 13, fontWeight: '600' }}>
                      🌐 Google · ★ {googleRating || '—'} · {googleReviewCount || '0'} yorum
                    </Text>
                  </View>
                ) : null}
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
                      setInstagramUrl(extractHandle(shop.instagram_url ?? '', 'instagram'));
                      setFacebookUrl(extractHandle(shop.facebook_url ?? '', 'facebook'));
                      setTiktokUrl(extractHandle(shop.tiktok_url ?? '', 'tiktok'));
                      setYoutubeUrl(extractHandle(shop.youtube_url ?? '', 'youtube'));
                      setGoogleMapsUrl(shop.google_maps_url ?? '');
                      setGoogleRating(shop.google_rating != null ? String(shop.google_rating) : '');
                      setGoogleReviewCount((shop.google_review_count ?? 0) > 0 ? String(shop.google_review_count) : '');
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

          <FeedbackModal
            visible={showFeedback}
            onClose={() => setShowFeedback(false)}
            appName="baker"
          />

          {/* Müşteri Yorumları (Collapsible) */}
          {!editMode && shop && reviews.length > 0 && (
            <View style={[styles.settingsCard, { backgroundColor: C.card, borderColor: C.border }]}>
              <TouchableOpacity style={styles.settingsHeader} onPress={toggleReviews} activeOpacity={0.7}>
                <Text style={[styles.settingsTitle, { color: C.text }]}>
                  📝 Müşteri Yorumları ({reviews.length})
                </Text>
                <Text style={[styles.chevron, { color: C.textSecondary }]}>
                  {reviewsOpen ? '▾' : '▸'}
                </Text>
              </TouchableOpacity>
              {reviewsOpen && reviews.map((r) => (
                <View key={r.id} style={[styles.reviewItem, { borderTopColor: C.border }]}>
                  <View style={styles.reviewHeader}>
                    <Text style={[styles.reviewCustomer, { color: C.text }]}>
                      {r.is_anonymous ? 'Anonim' : (r.customer?.full_name ?? 'Müşteri')}
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

          {/* Hesap Ayarları (Collapsible) */}
          {!editMode && (
            <View style={[styles.settingsCard, { backgroundColor: C.card, borderColor: C.border }]}>
              <TouchableOpacity style={styles.settingsHeader} onPress={toggleSettings} activeOpacity={0.7}>
                <Text style={[styles.settingsTitle, { color: C.text }]}>⚙️ Hesap Ayarları</Text>
                <Text style={[styles.chevron, { color: C.textSecondary }]}>
                  {settingsOpen ? '▾' : '▸'}
                </Text>
              </TouchableOpacity>

              {settingsOpen && (
                <View>
                  {/* Profil Resmi Düzenle */}
                  <TouchableOpacity
                    style={[styles.settingRow, { borderTopColor: C.border }]}
                    onPress={pickAvatar}
                    disabled={isUploadingAvatar}
                  >
                    <Text style={styles.settingEmoji}>🖼</Text>
                    <Text style={[styles.settingText, { color: C.text }]}>Profil Resmi Düzenle</Text>
                    {isUploadingAvatar ? (
                      <ActivityIndicator size="small" color={C.primary} />
                    ) : (
                      <Text style={[styles.settingArrow, { color: C.placeholder }]}>›</Text>
                    )}
                  </TouchableOpacity>

                  {/* Cep Telefonu */}
                  <TouchableOpacity
                    style={[styles.settingRow, { borderTopColor: C.border }]}
                    onPress={openPhoneModal}
                  >
                    <Text style={styles.settingEmoji}>📱</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.settingText, { color: C.text }]}>Cep Telefonu</Text>
                      {profile?.phone ? (
                        <Text style={[styles.settingSub, { color: C.textSecondary }]}>{profile.phone}</Text>
                      ) : (
                        <Text style={[styles.settingSub, { color: C.placeholder }]}>Eklenmedi</Text>
                      )}
                    </View>
                    <Text style={[styles.settingArrow, { color: C.placeholder }]}>›</Text>
                  </TouchableOpacity>

                  {/* Şifre Değiştir */}
                  <TouchableOpacity
                    style={[styles.settingRow, { borderTopColor: C.border }]}
                    onPress={handlePasswordReset}
                    disabled={isResettingPassword}
                  >
                    <Text style={styles.settingEmoji}>🔒</Text>
                    <Text style={[styles.settingText, { color: C.text }]}>Şifre Değiştir</Text>
                    {isResettingPassword ? (
                      <ActivityIndicator size="small" color={C.primary} />
                    ) : (
                      <Text style={[styles.settingArrow, { color: C.placeholder }]}>›</Text>
                    )}
                  </TouchableOpacity>

                  {/* Çıkış Yap */}
                  <TouchableOpacity
                    style={[styles.settingRow, { borderTopColor: C.border }]}
                    onPress={handleSignOut}
                  >
                    <Text style={styles.settingEmoji}>🚪</Text>
                    <Text style={[styles.settingText, { color: C.text }]}>Çıkış Yap</Text>
                    <Text style={[styles.settingArrow, { color: C.placeholder }]}>›</Text>
                  </TouchableOpacity>

                  {/* Hesabımı Sil */}
                  <TouchableOpacity
                    style={[styles.settingRow, { borderTopColor: C.border, opacity: isDeleting ? 0.6 : 1 }]}
                    disabled={isDeleting}
                    onPress={() => {
                      Alert.alert(
                        'Hesabı Sil',
                        'Hesabınız kalıcı olarak silinecek. Dükkan profiliniz ve siparişleriniz kaybolacak. Bu işlem geri alınamaz. Devam etmek istiyor musunuz?',
                        [
                          { text: 'İptal', style: 'cancel' },
                          {
                            text: 'Sil',
                            style: 'destructive',
                            onPress: async () => {
                              setIsDeleting(true);
                              const { error } = await supabase.rpc('delete_account');
                              if (error) {
                                setIsDeleting(false);
                                Alert.alert('Hata', 'Hesap silinemedi. Lütfen tekrar deneyin.');
                              } else {
                                await signOut();
                              }
                            },
                          },
                        ]
                      );
                    }}
                  >
                    <Text style={styles.settingEmoji}>🗑</Text>
                    <Text style={[styles.settingText, { color: '#E53E3E' }]}>Hesabımı Sil</Text>
                    {isDeleting ? (
                      <ActivityIndicator size="small" color="#E53E3E" />
                    ) : (
                      <Text style={[styles.settingArrow, { color: '#E53E3E' }]}>›</Text>
                    )}
                  </TouchableOpacity>

                  {/* Admin: Geri Bildirimler — sadece anzelpatisserie@gmail.com */}
                  {profile?.email === 'anzelpatisserie@gmail.com' && (
                    <TouchableOpacity
                      style={[styles.settingRow, { borderTopColor: C.border }]}
                      onPress={() => router.push('/(baker)/admin-feedbacks' as never)}
                    >
                      <Text style={styles.settingEmoji}>📬</Text>
                      <Text style={[styles.settingText, { color: C.text }]}>Admin: Geri Bildirimler</Text>
                      <Text style={[styles.settingArrow, { color: C.placeholder }]}>›</Text>
                    </TouchableOpacity>
                  )}
                  {/* Admin: Bildirim Gönder — sadece anzelpatisserie@gmail.com */}
                  {profile?.email === 'anzelpatisserie@gmail.com' && (
                    <TouchableOpacity
                      style={[styles.settingRow, { borderTopColor: C.border }]}
                      onPress={() => router.push('/(baker)/admin-notifications' as never)}
                    >
                      <Text style={styles.settingEmoji}>📢</Text>
                      <Text style={[styles.settingText, { color: C.text }]}>Bildirim Gönder</Text>
                      <Text style={[styles.settingArrow, { color: C.placeholder }]}>›</Text>
                    </TouchableOpacity>
                  )}
                  {/* Admin: Toplu E-posta — sadece anzelpatisserie@gmail.com */}
                  {profile?.email === 'anzelpatisserie@gmail.com' && (
                    <TouchableOpacity
                      style={[styles.settingRow, { borderTopColor: C.border }]}
                      onPress={() => router.push('/(baker)/admin-emails' as never)}
                    >
                      <Text style={styles.settingEmoji}>📧</Text>
                      <Text style={[styles.settingText, { color: C.text }]}>Toplu E-posta</Text>
                      <Text style={[styles.settingArrow, { color: C.placeholder }]}>›</Text>
                    </TouchableOpacity>
                  )}
                  {/* Admin: Şikayetler — sadece anzelpatisserie@gmail.com */}
                  {profile?.email === 'anzelpatisserie@gmail.com' && (
                    <TouchableOpacity
                      style={[styles.settingRow, { borderTopColor: C.border }]}
                      onPress={() => router.push('/(baker)/admin-reports' as never)}
                    >
                      <Text style={styles.settingEmoji}>🚩</Text>
                      <Text style={[styles.settingText, { color: C.text }]}>Şikayetler</Text>
                      <Text style={[styles.settingArrow, { color: C.placeholder }]}>›</Text>
                    </TouchableOpacity>
                  )}
                  {/* Admin: Dashboard — sadece anzelpatisserie@gmail.com */}
                  {profile?.email === 'anzelpatisserie@gmail.com' && (
                    <TouchableOpacity
                      style={[styles.settingRow, { borderTopColor: C.border }]}
                      onPress={() => router.push('/(baker)/admin-dashboard' as never)}
                    >
                      <Text style={styles.settingEmoji}>📊</Text>
                      <Text style={[styles.settingText, { color: C.text }]}>Admin: Kullanıcı Paneli</Text>
                      <Text style={[styles.settingArrow, { color: C.placeholder }]}>›</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Telefon Modal */}
          <Modal visible={showPhoneModal} transparent animationType="slide" onRequestClose={() => setShowPhoneModal(false)}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
              <View style={[styles.modalSheet, { backgroundColor: C.card }]}>
                <Text style={[styles.modalTitle, { color: C.text }]}>Cep Telefonu</Text>
                <Text style={[styles.modalSub, { color: C.textSecondary }]}>
                  Müşteriler size ulaşmak için kullanır
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: C.background, borderColor: C.border, color: C.text }]}
                  placeholder="0532 123 45 67"
                  placeholderTextColor={C.placeholder}
                  value={phoneInput}
                  onChangeText={setPhoneInput}
                  keyboardType="phone-pad"
                  maxLength={20}
                  autoFocus
                />
                <View style={styles.modalBtns}>
                  <TouchableOpacity
                    style={[styles.modalCancelBtn, { borderColor: C.border }]}
                    onPress={() => setShowPhoneModal(false)}
                  >
                    <Text style={[styles.modalCancelText, { color: C.textSecondary }]}>İptal</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalSaveBtn, { backgroundColor: C.primary }]}
                    onPress={savePhone}
                    disabled={isSavingPhone}
                  >
                    {isSavingPhone ? (
                      <ActivityIndicator color="#FFF" />
                    ) : (
                      <Text style={styles.modalSaveText}>Kaydet</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </Modal>

          {/* Uygulamayı Tavsiye Et */}
          {!editMode && (
            <TouchableOpacity
              style={[styles.shareCard, { backgroundColor: C.card, borderColor: C.border }]}
              onPress={() => shareApp({
                message: 'Pastacım Pro ile sipariş al, kolay yönet! 🎂\nhttps://apps.apple.com/tr/app/pastac%C4%B1m-pro/id6778462169?l=tr',
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

          {/* Geri Bildirim */}
          {!editMode && (
            <TouchableOpacity
              style={[styles.shareCard, { backgroundColor: C.card, borderColor: C.border }]}
              onPress={() => setShowFeedback(true)}
              activeOpacity={0.85}
            >
              <Text style={styles.shareEmoji}>📣</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.shareTitle, { color: C.text }]}>Geri Bildirim Gönder</Text>
                <Text style={[styles.shareSub, { color: C.textSecondary }]}>
                  Görüş ve Önerilerini Paylaş
                </Text>
              </View>
              <Text style={[styles.shareArrow, { color: C.primary }]}>→</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1,
  },
  title: { fontSize: FontSize.xl, fontWeight: '800' },
  content: { padding: Spacing.lg, gap: Spacing.md },
  userCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md,
  },
  avatarCircle: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', position: 'relative',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarEmoji: { fontSize: 36 },
  avatarOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEditIcon: { fontSize: 11 },
  userPhone: { fontSize: FontSize.xs, marginTop: 4 },
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
  reviewItem: { paddingTop: Spacing.sm, marginTop: Spacing.sm, borderTopWidth: 1, gap: 3 },
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
  socialInputRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  socialInputFlex: { flex: 1 },
  verifyBtn: {
    borderWidth: 1.5, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
  },
  verifyBtnText: { fontSize: FontSize.sm, fontWeight: '700' },
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
  socialRow: { gap: 6, marginTop: 4 },
  socialBtn: {
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    borderRadius: Radius.full, alignItems: 'center',
  },
  socialBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: '#FFF' },
  googlePreview: {
    padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 1, alignItems: 'center',
  },
  settingsCard: {
    borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md,
  },
  settingsTitle: { fontSize: FontSize.md, fontWeight: '700' },
  settingsHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  chevron: { fontSize: 18, fontWeight: '700' },
  settingRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: 12, borderTopWidth: 1, marginTop: 4,
  },
  settingEmoji: { fontSize: 17, width: 24 },
  settingText: { flex: 1, fontSize: FontSize.sm, fontWeight: '600' },
  settingSub: { fontSize: 11, marginTop: 2 },
  settingArrow: { fontSize: 20, fontWeight: '300' },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: Spacing.lg, gap: Spacing.md,
  },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '700' },
  modalSub: { fontSize: FontSize.sm },
  modalBtns: { flexDirection: 'row', gap: Spacing.sm, marginTop: 4 },
  modalCancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: Radius.full,
    borderWidth: 1.5, alignItems: 'center',
  },
  modalCancelText: { fontSize: FontSize.sm, fontWeight: '600' },
  modalSaveBtn: {
    flex: 2, paddingVertical: 12, borderRadius: Radius.full, alignItems: 'center',
  },
  modalSaveText: { color: '#FFF', fontSize: FontSize.sm, fontWeight: '700' },
});
