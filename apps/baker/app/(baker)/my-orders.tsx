import { Redirect } from 'expo-router';

// "Siparişler" sekmesi kaldırıldı; içeriği "Talepler" (index) ekranına collapse
// bölümler olarak taşındı (Item 9). Bu rota yalnızca eski bildirim derin
// linkleri (`navigateFromNotification` → `${base}/my-orders`) patlamasın diye
// korunuyor; Talepler ekranına yönlendirir.
export default function BakerMyOrdersRedirect() {
  return <Redirect href="/(baker)" />;
}
